"""
Startup provisioning: for every sample in the DB, make sure
raw/{sid}/germline, raw/{sid}/somatic and raw/{sid}/prs exist, and seed the
expected file paths in sample_records.

Idempotent and non-destructive:
  - existing folders and their contents are never touched (exist_ok=True)
  - existing germline_path / somatic_path / prs_path values are never
    overwritten (COALESCE), so paths set by the upload feature survive restarts

Concurrency safety:
  - one short transaction per sample (commit each), so locks are brief
  - deadlocks (MySQL error 1213) are retried
  - a MySQL advisory lock ensures only one provisioning run at a time
    (multiple workers / reload restarts just skip)

Environment (.env):
  MOUNT_POINT      mount point of the SMB share        (server: /mnt/genome-data)
  SAMPLE_DATA_DIR  folder that contains raw/            (server: <mount>/Mibiome/Bioledger/data/sample_data)
  REQUIRE_MOUNT    "true" (default) = skip unless MOUNT_POINT is a real mount
                   "false"          = plain local folder, e.g. a developer laptop

Place at: app/services/provisioning.py
"""

import os
import threading
import time
from pathlib import Path

from dotenv import load_dotenv

from database import get_connection

load_dotenv()

MOUNT_POINT = os.environ.get("MOUNT_POINT", "/mnt/genome-data")
SAMPLE_DATA_DIR = os.environ.get(
    "SAMPLE_DATA_DIR",
    f"{MOUNT_POINT}/Mibiome/Bioledger/data/sample_data",
)
REQUIRE_MOUNT = os.environ.get("REQUIRE_MOUNT", "true").strip().lower() == "true"
RAW_DIR = Path(SAMPLE_DATA_DIR) / "raw"

GERMLINE_FILENAME = "Germline_Results.xlsx"
SOMATIC_FILENAME = "Somatic_Results.xlsx"

LOCK_NAME = "bioledger_provisioning"
DEADLOCK_ERRNO = 1213
MAX_RETRIES = 3


def prs_filename(sid: str) -> str:
    """PRS file is stored per sample as {sid}_Merged.xlsx."""
    return f"{sid}_Merged.xlsx"


def storage_ready() -> bool:
    """True if it is safe to create folders.

    Server (REQUIRE_MOUNT=true): the SMB share must be mounted, otherwise
    mkdir would silently create folders on the local disk.
    Laptop (REQUIRE_MOUNT=false): a plain local folder is fine; it is
    created on demand.
    """
    if not REQUIRE_MOUNT:
        return True
    if not os.path.ismount(MOUNT_POINT):
        print(f"[provision] SKIPPED: {MOUNT_POINT} is not mounted")
        return False
    if not Path(SAMPLE_DATA_DIR).is_dir():
        print(f"[provision] SKIPPED: {SAMPLE_DATA_DIR} does not exist")
        return False
    return True


def ensure_folders(sid: str) -> bool:
    """Create raw/{sid}/germline, somatic and prs if missing.
    Returns True if the sample folder itself was newly created."""
    folder = RAW_DIR / sid
    is_new = not folder.exists()
    (folder / "germline").mkdir(parents=True, exist_ok=True)
    (folder / "somatic").mkdir(parents=True, exist_ok=True)
    (folder / "prs").mkdir(parents=True, exist_ok=True)
    return is_new


def write_expected_paths(cur, sample_id, sid: str) -> None:
    """Fill germline_path / somatic_path / prs_path only where still empty.
    Plain INSERT ... VALUES (no SELECT), so `samples` is never locked."""
    cur.execute(
        """
        INSERT INTO sample_records (sample_ref, germline_path, somatic_path, prs_path)
        VALUES (%s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            germline_path = COALESCE(germline_path, VALUES(germline_path)),
            somatic_path  = COALESCE(somatic_path,  VALUES(somatic_path)),
            prs_path      = COALESCE(prs_path,      VALUES(prs_path))
        """,
        (sample_id,
         f"{sid}/germline/{GERMLINE_FILENAME}",
         f"{sid}/somatic/{SOMATIC_FILENAME}",
         f"{sid}/prs/{prs_filename(sid)}"),
    )


def _write_paths_committed(conn, sample_id, sid: str) -> None:
    """One short transaction per sample, retried on deadlock."""
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            with conn.cursor() as cur:
                write_expected_paths(cur, sample_id, sid)
            conn.commit()
            return
        except Exception as e:
            conn.rollback()
            code = e.args[0] if getattr(e, "args", None) else None
            if code == DEADLOCK_ERRNO and attempt < MAX_RETRIES:
                time.sleep(0.2 * attempt)
                continue
            raise


def provision_all() -> None:
    if not storage_ready():
        return

    conn = get_connection()
    got_lock = False
    try:
        # Only one provisioning run at a time (across workers / restarts).
        with conn.cursor() as cur:
            cur.execute("SELECT GET_LOCK(%s, 0) AS got", (LOCK_NAME,))
            got_lock = cur.fetchone()["got"] == 1
        if not got_lock:
            print("[provision] SKIPPED: another provisioning run is active")
            return

        with conn.cursor() as cur:
            cur.execute("SELECT id, sid FROM samples")
            samples = cur.fetchall()
        conn.commit()  # end the read transaction, hold no locks

        created = existing = failed = 0
        for row in samples:
            sid = row["sid"]
            try:
                if ensure_folders(sid):
                    created += 1
                else:
                    existing += 1
                _write_paths_committed(conn, row["id"], sid)
            except Exception as e:
                failed += 1
                print(f"[provision] {sid}: {e}")
        print(f"[provision] samples={len(samples)} new_folders={created} "
              f"already_there={existing} failed={failed}")
    finally:
        if got_lock:
            try:
                with conn.cursor() as cur:
                    cur.execute("SELECT RELEASE_LOCK(%s)", (LOCK_NAME,))
            except Exception:
                pass
        conn.close()


def provision_sample(sid: str) -> None:
    """Provision a single sample right after it is created.
    Call this AFTER the sample row has been committed to `samples`.
    Never raises, so it can't break sample creation."""
    try:
        if not storage_ready():
            return
        ensure_folders(sid)
        conn = get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM samples WHERE sid = %s", (sid,))
                row = cur.fetchone()
            conn.commit()
            if row:
                _write_paths_committed(conn, row["id"], sid)
        finally:
            conn.close()
    except Exception as e:
        print(f"[provision] {sid}: {e}")


def _safe_run() -> None:
    try:
        provision_all()
    except Exception as e:
        # Provisioning must never stop the backend from starting.
        print(f"[provision] ERROR: {e}")


def start_provisioning() -> None:
    """Run in a background thread so a slow SMB share can't block startup."""
    threading.Thread(target=_safe_run, name="provision", daemon=True).start()