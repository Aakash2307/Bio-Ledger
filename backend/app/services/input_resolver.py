"""
Input / report path resolution for Report Automation.

Place at: app/services/input_resolver.py

Layout on the share (SAMPLE_DATA_DIR, see provisioning.py):
    raw/{sid}/germline | somatic | prs     inputs, placed by hand
    raw/{sid}/reports                      generated reports

DB conventions (both relative to raw/):
    sample_records.germline_path / somatic_path / prs_path
        e.g. "1A0027/germline/Germline_Results.xlsx"
    reports.file_path
        e.g. "1A0027/reports/1A0027_Report_r12.docx"
    Old absolute paths (from the removed upload feature) are still accepted.
"""

from pathlib import Path

from app.services.provisioning import RAW_DIR


def _is_real_xlsx(p: Path) -> bool:
    # skip Excel's "~$name.xlsx" lock files, which appear while a file is open on SMB
    return p.is_file() and p.suffix.lower() == ".xlsx" and not p.name.startswith("~$")


def resolve_input(sid: str, kind: str, db_path):
    """Return the input file to use for raw/{sid}/{kind}, or None.

    1. the path stored in the DB, if that file really exists
    2. otherwise the newest .xlsx in raw/{sid}/{kind}/
    """
    if db_path:
        p = Path(db_path)
        p = p if p.is_absolute() else RAW_DIR / p
        if _is_real_xlsx(p):
            return p

    folder = RAW_DIR / sid / kind
    if folder.is_dir():
        files = [f for f in folder.iterdir() if _is_real_xlsx(f)]
        if files:
            return max(files, key=lambda f: f.stat().st_mtime)
    return None


def sample_reports_dir(sid: str) -> Path:
    """raw/{sid}/reports/, created if missing."""
    d = RAW_DIR / sid / "reports"
    d.mkdir(parents=True, exist_ok=True)
    return d


def report_rel(p) -> str:
    """Path to store in reports.file_path (relative to raw/)."""
    return str(Path(p).relative_to(RAW_DIR))


def resolve_report(p) -> Path:
    """Turn a stored reports.file_path back into a real path."""
    p = Path(p)
    return p if p.is_absolute() else RAW_DIR / p