"""
app/services/bam_service.py

Locate a sample's BAM/BAI on the server share, issue + verify short-lived
signed tokens, write the BAM access audit log, and serve byte ranges.

Expected layout (from the pipeline output):
  <BAM_ROOT>/**/<sid>/<BAM_SUBDIR>/<BAM_FILENAME>       e.g. .../4A0030/Mapping/recalibration.bam
  <same path>.bai   (or recalibration.bai)
"""

import base64
import gzip
import hashlib
import hmac
import json
import logging
import os
import re
import struct
import time
from logging.handlers import RotatingFileHandler
from pathlib import Path

from dotenv import load_dotenv  # type: ignore
from fastapi import HTTPException  # type: ignore
from fastapi.responses import Response, StreamingResponse  # type: ignore

load_dotenv()
log = logging.getLogger(__name__)

BAM_ROOT = os.environ.get("BAM_ROOT", "")
BAM_SUBDIR = os.environ.get("BAM_SUBDIR", "Mapping")
BAM_FILENAME = os.environ.get("BAM_FILENAME", "recalibration.bam")
BAM_SEARCH_DEPTH = int(os.environ.get("BAM_SEARCH_DEPTH", "6"))
TOKEN_TTL = int(os.environ.get("BAM_TOKEN_TTL_SECONDS", "14400"))
SIGNING_SECRET = os.environ.get("BAM_SIGNING_SECRET", "")

# Strict allow-list: no dots, slashes or whitespace, so a sid can never form
# a path component like ".." or "a/b".
SID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
CHUNK = 1024 * 1024


# ---------------------------------------------------------------------------
# Audit log: one line per BAM/BAI request (and per session) -> logs/bam_access.log
# ---------------------------------------------------------------------------

def _build_audit_logger() -> logging.Logger:
    logger = logging.getLogger("bioledger.bam_audit")
    if logger.handlers:
        return logger
    log_dir = Path(os.environ.get("AUDIT_LOG_DIR") or Path(__file__).resolve().parents[2] / "logs")
    log_dir.mkdir(parents=True, exist_ok=True)
    handler = RotatingFileHandler(log_dir / "bam_access.log", maxBytes=10_000_000, backupCount=10)
    fmt = logging.Formatter("%(asctime)sZ | %(message)s")
    fmt.converter = time.gmtime  # UTC
    handler.setFormatter(fmt)
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False
    return logger


_audit_logger = _build_audit_logger()


def audit(user: str, sid: str, action: str, status: int, detail: str = ""):
    # %r on user/sid so a hostile value can't inject fake log lines.
    _audit_logger.info("user=%r sid=%r action=%s status=%s %s", user, sid, action, status, detail)


# ---------------------------------------------------------------------------
# Sample id -> BAM / BAI path
# ---------------------------------------------------------------------------

_location_cache: dict[str, Path] = {}


def validate_sid(sid: str) -> str:
    if not isinstance(sid, str) or not SID_RE.fullmatch(sid):
        raise HTTPException(400, "Invalid sample id")
    return sid


def _root() -> Path:
    if not BAM_ROOT:
        raise HTTPException(503, "BAM_ROOT is not configured")
    root = Path(BAM_ROOT)
    if not root.is_dir():
        raise HTTPException(503, "BAM storage is not available (share not mounted?)")
    return root.resolve()


def _locate(sid: str, root: Path) -> Path | None:
    cached = _location_cache.get(sid)
    if cached and cached.is_file():
        return cached

    candidates: list[Path] = []
    root_depth = len(root.parts)
    for dirpath, dirnames, _ in os.walk(root):          # symlinks are not followed
        depth = len(Path(dirpath).parts) - root_depth
        if sid in dirnames:
            bam = Path(dirpath) / sid / BAM_SUBDIR / BAM_FILENAME
            if bam.is_file():
                candidates.append(bam)
            dirnames.remove(sid)                         # don't descend into the sample folder
        if depth + 1 >= BAM_SEARCH_DEPTH:
            dirnames[:] = []                             # bounded depth: the share is large

    if not candidates:
        return None
    if len(candidates) > 1:
        log.warning("Several BAMs found for %s, using the newest: %s", sid, candidates)
    best = max(candidates, key=lambda p: p.stat().st_mtime)
    _location_cache[sid] = best
    return best


def resolve_bam(sid: str) -> tuple[Path, Path]:
    """Return (bam, bai) for a sid, or raise 400/404/503."""
    validate_sid(sid)
    root = _root()

    found = _locate(sid, root)
    if not found:
        raise HTTPException(404, f"No BAM found for sample {sid}")

    bam = found.resolve()
    if not bam.is_relative_to(root):                     # path-traversal / symlink-escape guard
        raise HTTPException(400, "Invalid BAM path")

    for cand in (Path(str(bam) + ".bai"), bam.with_suffix(".bai")):
        if cand.is_file():
            bai = cand.resolve()
            if not bai.is_relative_to(root):
                raise HTTPException(400, "Invalid BAM index path")
            return bam, bai
    raise HTTPException(404, f"BAM index (.bai) is missing for sample {sid}")


# ---------------------------------------------------------------------------
# BAM header: does this BAM name contigs "chr1" or "1"?
# ---------------------------------------------------------------------------

_style_cache: dict[tuple[str, float], dict | None] = {}


def contig_style(bam: Path) -> dict | None:
    key = (str(bam), bam.stat().st_mtime)
    if key in _style_cache:
        return _style_cache[key]
    result = None
    try:
        # BGZF is a series of gzip members, so gzip.open reads the header
        # without decompressing the whole file.
        with gzip.open(bam, "rb") as f:
            if f.read(4) == b"BAM\x01":
                (l_text,) = struct.unpack("<i", f.read(4))
                f.read(l_text)
                (n_ref,) = struct.unpack("<i", f.read(4))
                names = []
                for _ in range(min(n_ref, 5)):
                    (l_name,) = struct.unpack("<i", f.read(4))
                    names.append(f.read(l_name)[:-1].decode())
                    f.read(4)  # l_ref
                if names:
                    result = {"chr_prefix": names[0].lower().startswith("chr"), "contigs": names}
    except (OSError, EOFError, struct.error, UnicodeDecodeError) as e:
        log.warning("Could not read BAM header for %s: %s", bam, e)
    _style_cache[key] = result
    return result


# ---------------------------------------------------------------------------
# Signed, short-lived tokens (HMAC-SHA256). Scoped to one sid.
# ---------------------------------------------------------------------------

def _secret() -> bytes:
    if len(SIGNING_SECRET) < 16:
        raise HTTPException(503, "BAM_SIGNING_SECRET is not configured")
    return SIGNING_SECRET.encode()


def _b64e(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _b64d(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _sign(raw: str) -> str:
    return _b64e(hmac.new(_secret(), raw.encode(), hashlib.sha256).digest())


def make_token(sid: str, user: str) -> tuple[str, int]:
    exp = int(time.time()) + TOKEN_TTL
    raw = _b64e(json.dumps({"s": sid, "e": exp, "u": user}, separators=(",", ":")).encode())
    return f"{raw}.{_sign(raw)}", exp


def verify_token(token: str, sid: str) -> str:
    """Return the user the token was issued to, or raise 401."""
    bad = HTTPException(401, "Invalid or expired token")
    try:
        raw, sig = token.split(".")
        if not hmac.compare_digest(sig, _sign(raw)):
            raise bad
        data = json.loads(_b64d(raw))
        if data.get("s") != sid or float(data.get("e", 0)) < time.time():
            raise bad
        return str(data.get("u", "-"))
    except HTTPException:
        raise
    except (ValueError, TypeError):
        raise bad


# ---------------------------------------------------------------------------
# HTTP Range serving (206 / 416). Single-range only, which is all igv.js sends.
# ---------------------------------------------------------------------------

def _iter_file(path: Path, start: int, length: int):
    with open(path, "rb") as f:
        f.seek(start)
        remaining = length
        while remaining > 0:
            data = f.read(min(CHUNK, remaining))
            if not data:
                break
            remaining -= len(data)
            yield data


def serve_file(path: Path, range_header: str | None, head: bool = False) -> Response:
    size = path.stat().st_size
    base_headers = {
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
    }

    start, end, partial = 0, size - 1, False
    if range_header:
        m = re.fullmatch(r"bytes=(\d*)-(\d*)", range_header.strip())
        s, e = m.groups() if m else ("", "")
        ok = bool(m) and (s or e)
        if ok and not s:                                  # suffix range: last N bytes
            n = int(e)
            ok = n > 0 and size > 0
            start, end = max(0, size - n), size - 1
        elif ok:
            start = int(s)
            end = min(int(e), size - 1) if e else size - 1
            ok = start < size and start <= end
        if not ok:
            return Response(status_code=416, headers={**base_headers, "Content-Range": f"bytes */{size}"})
        partial = True

    length = max(0, end - start + 1)
    headers = {**base_headers, "Content-Length": str(length)}
    if partial:
        headers["Content-Range"] = f"bytes {start}-{end}/{size}"
    status = 206 if partial else 200

    if head:
        return Response(status_code=status, headers=headers, media_type="application/octet-stream")
    return StreamingResponse(
        _iter_file(path, start, length), status_code=status,
        headers=headers, media_type="application/octet-stream",
    )