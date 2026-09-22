"""
One-time script: given a list of sample IDs, for each sample that
exists in `samples`:
  1. Create raw/{sample_id}/germline/ and raw/{sample_id}/somatic/
  2. Write the EXPECTED (conventional) file paths into
     sample_records.germline_path / somatic_path -- even though no
     actual file exists yet at those locations.

Files are expected at fixed names:
    raw/{sample_id}/germline/germline.xlsx
    raw/{sample_id}/somatic/somatic.xlsx

Visualize should check os.path.exists() on the stored path at read
time, and show "no file uploaded" if nothing's actually there yet.
Safe to re-run -- folder creation and path writes are both idempotent.

Usage:
    python provision_sample_folders.py samples.xlsx --column sample_id
    python provision_sample_folders.py samples.csv --column sample_id
"""

import argparse
import os
import sys
from pathlib import Path

import pandas as pd

# Import the EXISTING connection helper from your app's database.py
# so this script always uses the same, single source of truth for
# DB credentials -- nothing duplicated or hardcoded here.
#
# Adjust this import path to wherever database.py actually lives
# relative to this script, e.g.:
#   from app.database import get_connection
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database import get_connection  # noqa: E402

# ---- config ----
# IMPORTANT: this MUST be a real local filesystem path (e.g. a mounted
# SMB share like /mnt/genome-data/...), never an smb:// URI -- Python's
# filesystem calls don't understand smb://, they'd just create a
# literal folder named "smb:" wherever the script runs from.
#
# When run via mount_and_provision.sh, this env var is set for you
# automatically to the real mounted path -- no need to edit this line.
SAMPLE_DATA_DIR = os.environ.get(
    "SAMPLE_DATA_DIR",
    "/mnt/genome-data/Mibiome/Bioledger/data/sample_data",
)
RAW_DIR = Path(SAMPLE_DATA_DIR) / "raw"

# Hardcoded input file + column name -- edit these to match your actual sheet.
# Command-line args (if given) still override these, so you can also just run:
#   python provision_sample_folders.py
EXCEL_FILE_PATH = "/home/ngs/Desktop/sample_list.xlsx"   # <-- change this
SAMPLE_ID_COLUMN = "Sample ID"                        # <-- change this


def load_sample_ids(path: str, column: str) -> list[str]:
    if path.endswith(".csv"):
        df = pd.read_csv(path)
    else:
        df = pd.read_excel(path, engine="calamine")
    ids = df[column].dropna().astype(str).str.strip().unique().tolist()
    return ids


def fetch_existing_sample_ids(conn, sample_ids: list[str]) -> set[str]:
    """Return the subset of sample_ids that actually exist in `samples`.

    NOTE: `sid` lives on the `samples` table, not `sample_records` --
    sample_records only holds germline_path/somatic_path/prs_path etc,
    linked back via sample_ref = samples.id.
    """
    if not sample_ids:
        return set()
    placeholders = ",".join(["%s"] * len(sample_ids))
    query = f"SELECT sid FROM samples WHERE sid IN ({placeholders})"
    with conn.cursor() as cur:
        cur.execute(query, sample_ids)
        rows = cur.fetchall()
    # get_connection() uses DictCursor, so each row is a dict: {"sid": "..."}
    return {row["sid"] for row in rows}


def write_expected_paths(conn, sid: str):
    """Write the CONVENTIONAL (expected) germline/somatic paths into
    sample_records for this sample -- even though no file exists yet.
    Visualize will check os.path.exists() on these at read time and
    show 'no file uploaded' if nothing's actually there.

    Fixed filenames (germline.xlsx / somatic.xlsx) are required here --
    a folder existing does NOT mean a file exists inside it, so the DB
    needs one exact, predictable path to check against, not 'whatever
    happens to be in the folder'.
    """
    germline_path = f"{sid}/germline/germline.xlsx"
    somatic_path = f"{sid}/somatic/somatic.xlsx"

    with conn.cursor() as cur:
        cur.execute("""
            UPDATE sample_records sr
            JOIN samples s ON sr.sample_ref = s.id
            SET sr.germline_path = %s, sr.somatic_path = %s
            WHERE s.sid = %s
        """, (germline_path, somatic_path, sid))

        if cur.rowcount == 0:
            # sample exists but has no sample_records row yet -- create one
            cur.execute("SELECT id FROM samples WHERE sid = %s", (sid,))
            sample_row = cur.fetchone()
            if not sample_row:
                return  # shouldn't happen, sid was already confirmed to exist
            sample_ref = sample_row["id"]
            cur.execute(
                "INSERT INTO sample_records (sample_ref, germline_path, somatic_path) "
                "VALUES (%s, %s, %s)",
                (sample_ref, germline_path, somatic_path)
            )


def provision(sample_ids: list[str]):
    conn = get_connection()
    try:
        existing = fetch_existing_sample_ids(conn, sample_ids)
    finally:
        conn.close()

    not_found = [sid for sid in sample_ids if sid not in existing]
    created, already_present = [], []

    for sid in sample_ids:
        if sid not in existing:
            continue
        folder = RAW_DIR / sid
        if folder.exists():
            already_present.append(sid)
            continue
        folder.mkdir(parents=True, exist_ok=False)
        (folder / "germline").mkdir()
        (folder / "somatic").mkdir()
        created.append(sid)

    # Write expected paths for every valid sample -- whether its folder
    # was just created or already existed. Safe to re-run: it's just an
    # UPDATE, so re-running never duplicates anything.
    conn = get_connection()
    try:
        for sid in sample_ids:
            if sid in existing:
                write_expected_paths(conn, sid)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    print(f"Total sample IDs in file : {len(sample_ids)}")
    print(f"Found in DB (samples.sid): {len(existing)}")
    print(f"Not found in DB (skipped): {len(not_found)}")
    print(f"Folders created          : {len(created)}")
    print(f"Folders already existed  : {len(already_present)}")
    print(f"DB paths written/updated : {len(existing)}")

    if not_found:
        print("\nSample IDs not found in `samples` table:")
        for sid in not_found:
            print(f"  - {sid}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("file", nargs="?", default=EXCEL_FILE_PATH,
                         help="Path to the .xlsx or .csv file of sample IDs "
                              "(defaults to EXCEL_FILE_PATH set above)")
    parser.add_argument("--column", default=SAMPLE_ID_COLUMN,
                         help="Column name containing sample IDs "
                              "(defaults to SAMPLE_ID_COLUMN set above)")
    args = parser.parse_args()

    ids = load_sample_ids(args.file, args.column)
    provision(ids)