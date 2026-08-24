"""
Report Automation controller.

Holds all business logic for report automation:
- saving uploaded input files
- converting docx -> pdf (cached)
- enqueueing report generation jobs
- reading report / sample state from the database

Routes should only call into these functions and translate the
results into HTTP responses.
"""

import shutil
import subprocess
import sys
from pathlib import Path
from typing import Optional

from fastapi import UploadFile, HTTPException  # type: ignore

BACKEND_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND_ROOT))

from database import (  # noqa: E402
    get_sample_by_sid,
    set_sample_input_file,
    get_report,
    get_report_automation_list,
    get_report_stats,
    get_completed_reports_list,
)
from app.services.report_worker import enqueue_report_job , request_cancel  # noqa: E402

INPUT_STORAGE_ROOT = BACKEND_ROOT / "report_input_storage"
INPUT_STORAGE_ROOT.mkdir(parents=True, exist_ok=True)

REPORT_PDF_CACHE = BACKEND_ROOT / "report_pdf_cache"
REPORT_PDF_CACHE.mkdir(parents=True, exist_ok=True)


# def save_input_file(sid: str, file_type: str, file: UploadFile) -> str:
#     if not file.filename.lower().endswith((".xlsx", ".xls")):
#         raise HTTPException(status_code=400, detail=f"{file_type} file must be .xlsx or .xls")

#     dest_path = INPUT_STORAGE_ROOT / f"{sid}_{file_type}_{file.filename}"
#     with open(dest_path, "wb") as f:
#         shutil.copyfileobj(file.file, f)

#     try:
#         set_sample_input_file(sid, file_type, str(dest_path))
#     except ValueError as e:
#         # DB didn't accept the path — don't leave an orphaned file on disk
#         dest_path.unlink(missing_ok=True)
#         raise HTTPException(status_code=400, detail=str(e))

#     return str(dest_path)


def save_input_file(sid: str, file_type: str, file: UploadFile) -> str:
    if not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail=f"{file_type} file must be .xlsx or .xls")

    dest_path = INPUT_STORAGE_ROOT / f"{sid}_{file_type}_{file.filename}"
    with open(dest_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    try:
        set_sample_input_file(sid, file_type, str(dest_path))
    except ValueError as e:
        dest_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=str(e))

    return str(dest_path)


def ensure_pdf(docx_path: Path) -> Path:
    """
    Converts docx_path to PDF if a cached version doesn't already exist
    (or is stale relative to the source docx). Returns the PDF path.
    """
    pdf_path = REPORT_PDF_CACHE / f"{docx_path.stem}.pdf"

    if pdf_path.exists() and pdf_path.stat().st_mtime >= docx_path.stat().st_mtime:
        return pdf_path  # already converted, source hasn't changed since

    result = subprocess.run(
        [
            "soffice", "--headless", "--convert-to", "pdf",
            "--outdir", str(REPORT_PDF_CACHE),
            str(docx_path),
        ],
        capture_output=True,
        text=True,
        timeout=60,
    )

    if result.returncode != 0 or not pdf_path.exists():
        raise HTTPException(
            status_code=500,
            detail=f"PDF conversion failed: {result.stderr.strip()}",
        )

    return pdf_path


async def upload_report_inputs(
    sid: str,
    germline_file: Optional[UploadFile] = None,
    somatic_file: Optional[UploadFile] = None,
    prs_file: Optional[UploadFile] = None,
):
    sample = get_sample_by_sid(sid)
    if not sample:
        raise HTTPException(status_code=404, detail="Sample not found")

    if not (germline_file or somatic_file or prs_file):
        raise HTTPException(status_code=400, detail="At least one input file is required")

    germline_path = save_input_file(sid, "germline", germline_file) if germline_file else None
    somatic_path = save_input_file(sid, "somatic", somatic_file) if somatic_file else None
    prs_path = save_input_file(sid, "prs", prs_file) if prs_file else None

    return {
        "status": "uploaded",
        "sid": sid,
        "germline_path": germline_path,
        "somatic_path": somatic_path,
        "prs_path": prs_path,
    }


async def generate_report(sid: str):
    sample = get_sample_by_sid(sid)
    if not sample:
        raise HTTPException(status_code=404, detail="Sample not found")

    germline_path = sample.get("germline_path")
    somatic_path = sample.get("somatic_path")
    prs_path = sample.get("prs_path")

    if not (germline_path or somatic_path or prs_path):
        raise HTTPException(status_code=400, detail="No input files uploaded yet for this sample")

    # NOTE: generation now proceeds with whichever inputs are present.
    # If generate_report.py / enqueue_report_job assumes all three files
    # exist, it needs to be updated to handle None for the missing ones.
    report_id = enqueue_report_job(
        sid,
        germline_path,
        somatic_path,
        prs_path,
        sample["sample_id"],
    )
    return {"status": "queued", "report_id": report_id, "sid": sid}

async def cancel_report(report_id: int):
    report = get_report(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    if report["status"] not in ("queued", "processing"):
        raise HTTPException(
            status_code=400,
            detail=f"Report is not running (status: {report['status']}), nothing to cancel",
        )

    result = request_cancel(report_id)
    return {"status": "cancelling", "report_id": report_id, "detail": result}


async def list_report_automation():
    """Feeds the Report Automation page table."""
    return get_report_automation_list()


async def report_stats():
    """Feeds the Reports page header: total completed + currently in process."""
    return get_report_stats()


async def completed_reports():
    """Feeds the Reports page table: patients with a completed report."""
    return get_completed_reports_list()


async def report_status(report_id: int):
    report = get_report(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return report


async def download_report(report_id: int):
    report = get_report(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report["status"] != "completed" or not report.get("file_path"):
        raise HTTPException(status_code=400, detail=f"Report is not ready (status: {report['status']})")

    file_path = Path(report["file_path"])
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Report file missing on disk")

    return file_path


async def view_report(report_id: int):
    """Returns the cached/converted PDF path for a completed report.
    The original docx is untouched — download_report still serves that."""
    report = get_report(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report["status"] != "completed" or not report.get("file_path"):
        raise HTTPException(status_code=400, detail=f"Report is not ready (status: {report['status']})")

    docx_path = Path(report["file_path"])
    if not docx_path.exists():
        raise HTTPException(status_code=404, detail="Report file missing on disk")

    return ensure_pdf(docx_path)

