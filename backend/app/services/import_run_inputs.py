"""
Copy Germline_Results.xlsx and Somatic_Results.xlsx from the Mibiome pipeline
output into BioLedger's sample folders.

Source:
    {MOUNT_POINT}/Mibiome/RawData_2025-26/Pipeline_results/New_pipeline_J/BRCA_results/{sid}/VCF/Germline/Germline_Results.xlsx
    {MOUNT_POINT}/Mibiome/RawData_2025-26/Pipeline_results/New_pipeline_J/BRCA_results/{sid}/VCF/Somatic/Somatic_Results.xlsx

Destination:
    {MOUNT_POINT}/Mibiome/Bioledger/data/sample_data/raw/{sid}/germline/Germline_Results.xlsx
    {MOUNT_POINT}/Mibiome/Bioledger/data/sample_data/raw/{sid}/somatic/Somatic_Results.xlsx

Rules:
  - a file is copied only if raw/{sid}/ already exists
  - sids with no BioLedger folder are skipped silently
  - copy goes to a .tmp file first, then is renamed into place
  - after copying, the destination is checked against the source (size and SHA-256)
  - failed or mismatched copies are retried, up to MAX_ATTEMPTS
  - a file is skipped when the destination already matches the source
  - nothing is ever deleted

Standalone: does not import provisioning.py.

Place at: app/services/import_run_inputs.py
Run once:  python -m app.services.import_run_inputs
Started by the backend: start_import_loop() in main.py
"""

import hashlib
import json
import os
import shutil
import threading
import time
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

MOUNT_POINT = os.environ.get("MOUNT_POINT", "/mnt/genome-data")
REQUIRE_MOUNT = os.environ.get("REQUIRE_MOUNT", "true").strip().lower() == "true"

SOURCE_BASE = Path(MOUNT_POINT) / os.environ.get(
    "SOURCE_SUBPATH",
    "Mibiome/RawData_2025-26/Pipeline_results/New_pipeline_J/BRCA_results",
)
DEST_BASE = Path(MOUNT_POINT) / "Mibiome/Bioledger/data/sample_data/raw"
REPORT_DIR = Path(MOUNT_POINT) / "Mibiome/Bioledger/data/sample_data/import_reports"
STATUS_FILE = REPORT_DIR / "last_run.json"

# (source path inside {sid}/, destination subfolder, destination filename)
FILE_MAP = [
    ("VCF/Germline/Germline_Results.xlsx", "germline", "Germline_Results.xlsx"),
    ("VCF/Somatic/Somatic_Results.xlsx", "somatic", "Somatic_Results.xlsx"),
]

MAX_ATTEMPTS = 3
RETRY_DELAY_SECONDS = 2
HASH_CHUNK = 1024 * 1024  # 1 MB
IMPORT_INTERVAL_MINUTES = int(os.environ.get("IMPORT_INTERVAL_MINUTES", "30"))


def storage_ready() -> bool:
    if REQUIRE_MOUNT and not os.path.ismount(MOUNT_POINT):
        return False
    return SOURCE_BASE.is_dir() and DEST_BASE.is_dir()


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(HASH_CHUNK), b""):
            h.update(chunk)
    return h.hexdigest()


def _matches(src: Path, dst: Path) -> bool:
    """True only if dst exists with the same size and the same SHA-256 as src.
    Size is checked first, so the hash is only computed when sizes agree."""
    if not dst.is_file():
        return False
    if src.stat().st_size != dst.stat().st_size:
        return False
    return _sha256(src) == _sha256(dst)


def _copy_once(src: Path, dst: Path) -> None:
    tmp = dst.with_name(dst.name + ".tmp")
    try:
        shutil.copyfile(src, tmp)
        if not _matches(src, tmp):
            raise IOError("copied file does not match source")
        os.replace(tmp, dst)
    finally:
        if tmp.exists():
            tmp.unlink()


def _copy_verified(src: Path, dst: Path) -> None:
    """Copy and verify, retrying on failure or mismatch."""
    last_error = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            _copy_once(src, dst)
            return
        except Exception as e:
            last_error = e
            if attempt < MAX_ATTEMPTS:
                time.sleep(RETRY_DELAY_SECONDS)
    raise IOError(f"failed after {MAX_ATTEMPTS} attempts: {last_error}")


def import_run_inputs() -> dict:
    result = {"copied": [], "skipped": [], "missing_files": [], "errors": []}

    if not storage_ready():
        result["errors"].append("storage not ready: share not mounted or paths missing")
        return result

    for src_folder in sorted(p for p in SOURCE_BASE.iterdir() if p.is_dir()):
        sid = src_folder.name
        dst_folder = DEST_BASE / sid

        if not dst_folder.is_dir():
            continue  # no BioLedger sample for this sid: skip silently

        for src_rel, subdir, dst_name in FILE_MAP:
            src = src_folder / src_rel
            label = f"{sid}/{dst_name}"
            if not src.is_file():
                result["missing_files"].append(label)
                continue
            dst = dst_folder / subdir / dst_name
            try:
                dst.parent.mkdir(parents=True, exist_ok=True)
                if _matches(src, dst):
                    result["skipped"].append(label)
                else:
                    _copy_verified(src, dst)
                    result["copied"].append(label)
            except Exception as e:
                result["errors"].append(f"{label}: {e}")

    return result


def write_report(result: dict) -> Path:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    path = REPORT_DIR / f"import_{datetime.now():%Y%m%d_%H%M%S}.txt"
    lines = [f"Import run {datetime.now():%Y-%m-%d %H:%M:%S}", ""]
    for key, title in [
        ("copied", "Copied and verified"),
        ("skipped", "Already up to date"),
        ("missing_files", "Excel file missing in source folder (sample exists in BioLedger)"),
        ("errors", "Failed after retries"),
    ]:
        lines.append(f"{title}: {len(result[key])}")
        lines.extend(f"  - {item}" for item in result[key])
        lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


def _write_status(result=None, error=None) -> None:
    status = {
        "last_cycle": datetime.now().isoformat(timespec="seconds"),
        "interval_minutes": IMPORT_INTERVAL_MINUTES,
        "copied": len(result["copied"]) if result else None,
        "skipped": len(result["skipped"]) if result else None,
        "missing_files": len(result["missing_files"]) if result else None,
        "errors": len(result["errors"]) if result else None,
        "fatal_error": error,
    }
    try:
        REPORT_DIR.mkdir(parents=True, exist_ok=True)
        STATUS_FILE.write_text(json.dumps(status, indent=2), encoding="utf-8")
    except Exception as e:
        print(f"[import] could not write status file: {e}", flush=True)


def _loop() -> None:
    print(f"[import] loop started, interval={IMPORT_INTERVAL_MINUTES} min", flush=True)
    while True:
        try:
            result = import_run_inputs()
            print(f"[import] {datetime.now():%H:%M:%S} "
                  f"copied={len(result['copied'])} "
                  f"skipped={len(result['skipped'])} "
                  f"errors={len(result['errors'])}", flush=True)
            if result["copied"] or result["errors"]:
                path = write_report(result)
                print(f"[import] report: {path}", flush=True)
            _write_status(result)
        except Exception as e:
            print(f"[import] ERROR: {e}", flush=True)
            _write_status(error=str(e))
        time.sleep(IMPORT_INTERVAL_MINUTES * 60)


def start_import_loop() -> None:
    """Run in a background thread so the backend starts without waiting."""
    threading.Thread(target=_loop, name="import_run_inputs", daemon=True).start()


if __name__ == "__main__":
    res = import_run_inputs()
    report = write_report(res)
    print(f"copied={len(res['copied'])} skipped={len(res['skipped'])} "
          f"missing_files={len(res['missing_files'])} errors={len(res['errors'])}")
    for err in res["errors"]:
        print(f"ERROR: {err}")
    print(f"Report: {report}")