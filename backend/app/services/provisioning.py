"""
Startup provisioning: for every sample in the DB, make sure
raw/{sid}/germline, somatic, prs, reports and outputs exist, and seed the
expected input file paths in sample_records.

Layout per sample (everything for a sample lives in one folder):
    raw/{sid}/germline/   inputs, placed by hand
    raw/{sid}/somatic/
    raw/{sid}/prs/
    raw/{sid}/reports/    generated reports (written by the report worker)
    raw/{sid}/outputs/    per-run pipeline outputs (written by the report worker)
        r{report_id}/     created by the worker when a run starts, see run_output_dir()

Idempotent and non-destructive:
  - existing folders and their contents are never touched (exist_ok=True)
  - existing germline_path / somatic_path / prs_path values are never
    overwritten (COALESCE), so paths already in the DB survive restarts

Concurrency safety:
  - one short transaction per sample (commit each), so locks are brief
  - deadlocks (MySQL error 1213) are retried
  - a MySQL advisory lock ensures only one provisioning run at a time
    (multiple workers / reload restarts just skip, and the log says
    which connection holds the lock)

Environment (.env):
  MOUNT_POINT      mount point of the SMB share        (server: /mnt/genome-data)
  SAMPLE_DATA_DIR  folder that contains raw/
                   (server: <mount>/Mibiome/Bioledger/data/sample_data)
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
OUTPUTS_SUBDIR = "outputs"  # CHANGED

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


def ensure_folders(sid: str):
    """Create raw/{sid}/germline|somatic|prs|reports|outputs if missing.
    Returns (sample_folder_is_new, [subfolder names created just now])."""
    folder = RAW_DIR / sid
    is_new = not folder.exists()
    created = []  # CHANGED
    for sub in ("germline", "somatic", "prs", "reports", OUTPUTS_SUBDIR):  # CHANGED
        path = folder / sub  # CHANGED
        if not path.exists():  # CHANGED
            created.append(sub)  # CHANGED
        path.mkdir(parents=True, exist_ok=True)  # CHANGED
    return is_new, created  # CHANGED


def run_output_dir(sid: str, report_id: int) -> Path:  # CHANGED
    """Folder for one pipeline run's outputs: raw/{sid}/outputs/r{report_id}/.
    Called by the report worker when a run starts. Creates the folder if it
    is missing. Raises if the share is not mounted, so it never writes to
    the local disk by mistake."""
    if not storage_ready():  # CHANGED
        raise RuntimeError("storage not ready: share not mounted or missing")  # CHANGED
    path = RAW_DIR / sid / OUTPUTS_SUBDIR / f"r{report_id}"  # CHANGED
    path.mkdir(parents=True, exist_ok=True)  # CHANGED
    return path  # CHANGED


def write_expected_paths(cur, sample_id, sid: str) -> None:
    """Fill germline_path / somatic_path / prs_path only where still empty.
    Updates the sample's latest sample_records row; inserts one only if the
    sample has none."""
    germ = f"{sid}/germline/{GERMLINE_FILENAME}"
    som = f"{sid}/somatic/{SOMATIC_FILENAME}"
    prs = f"{sid}/prs/{prs_filename(sid)}"
    cur.execute(
        """
        SELECT id FROM sample_records WHERE sample_ref = %s
        ORDER BY report_release_date DESC, id DESC LIMIT 1
        """,
        (sample_id,),
    )
    row = cur.fetchone()
    if row:
        cur.execute(
            """
            UPDATE sample_records SET
                germline_path = COALESCE(germline_path, %s),
                somatic_path  = COALESCE(somatic_path,  %s),
                prs_path      = COALESCE(prs_path,      %s)
            WHERE id = %s
            """,
            (germ, som, prs, row["id"]),
        )
    else:
        cur.execute(
            """
            INSERT INTO sample_records (sample_ref, germline_path, somatic_path, prs_path)
            VALUES (%s, %s, %s, %s)
            """,
            (sample_id, germ, som, prs),
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
    holder = info = None
    try:
        # Only one provisioning run at a time (across workers / restarts).
        with conn.cursor() as cur:
            cur.execute("SELECT GET_LOCK(%s, 0) AS got", (LOCK_NAME,))
            got_lock = cur.fetchone()["got"] == 1
            if not got_lock:
                # Find out who holds it, to make the skip diagnosable.
                cur.execute("SELECT IS_USED_LOCK(%s) AS holder", (LOCK_NAME,))
                holder = cur.fetchone()["holder"]
                if holder:
                    cur.execute(
                        "SELECT user, host, time, command "
                        "FROM information_schema.processlist WHERE id = %s",
                        (holder,),
                    )
                    info = cur.fetchone()
        if not got_lock:
            print(f"[provision] SKIPPED: lock held by connection {holder} {info}")
            return

        with conn.cursor() as cur:
            cur.execute("SELECT id, sid FROM samples")
            samples = cur.fetchall()
        conn.commit()  # end the read transaction, hold no locks

        created = existing = new_subfolders = failed = 0  # CHANGED
        for row in samples:
            sid = row["sid"]
            try:
                is_new, made = ensure_folders(sid)  # CHANGED
                if is_new:
                    created += 1
                else:
                    existing += 1
                new_subfolders += len(made)  # CHANGED
                _write_paths_committed(conn, row["id"], sid)
            except Exception as e:
                failed += 1
                print(f"[provision] {sid}: {e}")
        print(f"[provision] samples={len(samples)} new_folders={created} "  # CHANGED
              f"already_there={existing} new_subfolders={new_subfolders} "  # CHANGED
              f"failed={failed}")  # CHANGED
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