"""
Startup provisioning: for every sample in the DB, make sure
raw/{sid}/germline and raw/{sid}/somatic exist, and seed the expected
file paths in sample_records.

Idempotent and non-destructive:
  - existing folders and their contents are never touched (exist_ok=True)
  - existing germline_path / somatic_path values are never overwritten
    (COALESCE), so paths set by the upload feature survive restarts

Environment (.env):
  MOUNT_POINT      mount point of the SMB share        (server: /mnt/genome-data)
  SAMPLE_DATA_DIR  folder that contains raw/            (server: <mount>/Mibiome/Bioledger/data/sample_data)
  REQUIRE_MOUNT    "true" (default) = skip unless MOUNT_POINT is a real mount
                   "false"          = plain local folder, e.g. a developer laptop

Place at: app/services/provisioning.py
"""

import os
import threading
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
    """Create raw/{sid}/germline and somatic if missing.
    Returns True if the sample folder itself was newly created."""
    folder = RAW_DIR / sid
    is_new = not folder.exists()
    (folder / "germline").mkdir(parents=True, exist_ok=True)
    (folder / "somatic").mkdir(parents=True, exist_ok=True)
    return is_new


def write_expected_paths(cur, sid: str) -> None:
    """Fill germline_path / somatic_path only where they are still empty."""
    cur.execute(
        """
        INSERT INTO sample_records (sample_ref, germline_path, somatic_path)
        SELECT id, %s, %s FROM samples WHERE sid = %s
        ON DUPLICATE KEY UPDATE
            germline_path = COALESCE(germline_path, VALUES(germline_path)),
            somatic_path  = COALESCE(somatic_path,  VALUES(somatic_path))
        """,
        (f"{sid}/germline/{GERMLINE_FILENAME}",
         f"{sid}/somatic/{SOMATIC_FILENAME}",
         sid),
    )


def provision_all() -> None:
    if not storage_ready():
        return

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT sid FROM samples")
            sids = [row["sid"] for row in cur.fetchall()]

        created = existing = failed = 0
        with conn.cursor() as cur:
            for sid in sids:
                try:
                    if ensure_folders(sid):
                        created += 1
                    else:
                        existing += 1
                    write_expected_paths(cur, sid)
                except Exception as e:
                    failed += 1
                    print(f"[provision] {sid}: {e}")
        conn.commit()
        print(f"[provision] samples={len(sids)} new_folders={created} "
              f"already_there={existing} failed={failed}")
    except Exception:
        conn.rollback()
        raise
    finally:
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
                write_expected_paths(cur, sid)
            conn.commit()
        except Exception:
            conn.rollback()
            raise
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