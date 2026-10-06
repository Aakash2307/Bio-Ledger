"""
Provision sample folders and expected file paths.

For each sample ID in the input list that exists in `samples`:
  1. Ensure raw/{sample_id}/germline/ and raw/{sample_id}/somatic/ exist
     (missing subfolders are created even if the parent already exists).
  2. Upsert the EXPECTED file paths into sample_records.germline_path /
     somatic_path, even though no file exists there yet:
         {sid}/germline/Germline_Results.xlsx
         {sid}/somatic/Somatic_Results.xlsx

Visualize should check os.path.exists() on the stored path at read time
(joined with SAMPLE_DATA_DIR/raw/) and show "no file uploaded" if nothing
is there yet.

Safe to re-run: folder creation uses exist_ok, and the DB write is an
upsert (INSERT ... ON DUPLICATE KEY UPDATE), so it never creates
duplicate sample_records rows.

REQUIRES a UNIQUE key on sample_records.sample_ref. Put it in your table
definition so a rebuilt DB has it:
    UNIQUE KEY uq_sample_ref (sample_ref)
or add it to an existing table once:
    ALTER TABLE sample_records ADD UNIQUE KEY uq_sample_ref (sample_ref);
The script checks for this at startup and aborts if it is missing.

Usage:
    python provision_sample_folders.py samples.xlsx --column "Sample ID"
    python provision_sample_folders.py samples.csv --column "Sample ID"
    python provision_sample_folders.py            # uses defaults below
"""

import argparse
import os
import sys
from pathlib import Path

import pandas as pd

# Reuse the app's existing connection helper (single source of truth for
# DB credentials). Adjust the path if database.py lives elsewhere.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database import get_connection  # noqa: E402

# ---- config ----
# Must be a real local filesystem path (e.g. a mounted SMB share),
# never an smb:// URI. mount_and_provision.sh sets this automatically.
SAMPLE_DATA_DIR = os.environ.get(
    "SAMPLE_DATA_DIR",
    "/mnt/genome-data/Mibiome/Bioledger/data/sample_data",
)
RAW_DIR = Path(SAMPLE_DATA_DIR) / "raw"

GERMLINE_FILENAME = "Germline_Results.xlsx"
SOMATIC_FILENAME = "Somatic_Results.xlsx"

# Defaults; command-line args override these.
EXCEL_FILE_PATH = "/home/vedantjoshi/Desktop/sample_list.xlsx"  # <-- change this
# EXCEL_FILE_PATH changed from "/home/ngs/Desktop/sample_list.xlsx" to "/home/vedantjoshi/Desktop/sample_list.xlsx" after merging
SAMPLE_ID_COLUMN = "Sample ID"                          # <-- change this


def load_sample_ids(path: str, column: str) -> list[str]:
    if path.endswith(".csv"):
        df = pd.read_csv(path)
    else:
        df = pd.read_excel(path, engine="calamine")
    if column not in df.columns:
        raise SystemExit(
            f"Column '{column}' not found. Available columns: {list(df.columns)}"
        )
    return df[column].dropna().astype(str).str.strip().unique().tolist()


def assert_unique_sample_ref(conn) -> None:
    """Abort unless sample_records has a UNIQUE index on sample_ref alone.

    Without it, ON DUPLICATE KEY UPDATE never fires and every run would
    insert duplicate rows.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT index_name
            FROM information_schema.statistics
            WHERE table_schema = DATABASE()
              AND table_name = 'sample_records'
              AND non_unique = 0
            GROUP BY index_name
            HAVING COUNT(*) = 1 AND MAX(column_name) = 'sample_ref'
            """
        )
        if not cur.fetchone():
            raise SystemExit(
                "ABORT: sample_records has no UNIQUE key on sample_ref.\n"
                "Add it first (and put it in your table definition too):\n"
                "  ALTER TABLE sample_records "
                "ADD UNIQUE KEY uq_sample_ref (sample_ref);"
            )


def fetch_existing_sample_ids(conn, sample_ids: list[str]) -> set[str]:
    """Return the subset of sample_ids that exist in `samples` (samples.sid)."""
    if not sample_ids:
        return set()
    placeholders = ",".join(["%s"] * len(sample_ids))
    query = f"SELECT sid FROM samples WHERE sid IN ({placeholders})"
    with conn.cursor() as cur:
        cur.execute(query, sample_ids)
        rows = cur.fetchall()
    # get_connection() uses DictCursor -> rows are dicts: {"sid": "..."}
    return {row["sid"] for row in rows}


def ensure_folders(sid: str) -> bool:
    """Create raw/{sid}/germline and raw/{sid}/somatic if missing.
    Returns True if the sample folder itself was newly created."""
    folder = RAW_DIR / sid
    is_new = not folder.exists()
    (folder / "germline").mkdir(parents=True, exist_ok=True)
    (folder / "somatic").mkdir(parents=True, exist_ok=True)
    return is_new


def write_expected_paths(conn, sid: str) -> None:
    """Upsert the expected germline/somatic paths for one sample.

    Single statement: if the sid isn't in `samples`, nothing is inserted.
    If a sample_records row already exists (unique sample_ref), it is
    updated instead of duplicated.
    """
    germline_path = f"{sid}/germline/{GERMLINE_FILENAME}"
    somatic_path = f"{sid}/somatic/{SOMATIC_FILENAME}"

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO sample_records (sample_ref, germline_path, somatic_path)
            SELECT id, %s, %s FROM samples WHERE sid = %s
            ON DUPLICATE KEY UPDATE
                germline_path = VALUES(germline_path),
                somatic_path  = VALUES(somatic_path)
            """,
            (germline_path, somatic_path, sid),
        )


def provision(sample_ids: list[str]) -> None:
    conn = get_connection()
    try:
        assert_unique_sample_ref(conn)  # abort before touching anything
        existing = fetch_existing_sample_ids(conn, sample_ids)
    finally:
        conn.close()

    not_found = [sid for sid in sample_ids if sid not in existing]
    created, already_present = [], []

    for sid in sample_ids:
        if sid not in existing:
            continue
        (created if ensure_folders(sid) else already_present).append(sid)

    # Upsert expected paths for every valid sample, in one transaction.
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
    print(f"DB paths upserted        : {len(existing)}")

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