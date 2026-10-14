"""
Report Automation controller.

Holds all business logic for report automation:
- finding a sample's input files on the share
- converting docx -> pdf (cached)
- enqueueing report generation jobs
- deleting reports and their files
- reading report / sample state from the database

Routes should only call into these functions and translate the
results into HTTP responses.

Inputs are NOT uploaded through the app any more: they are placed by hand in
raw/{sid}/germline|somatic|prs on the share (folders are created by
provisioning.py).
"""

import shutil
import subprocess
import sys
from pathlib import Path

from fastapi import HTTPException  # type: ignore

BACKEND_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND_ROOT))

from database import (  # noqa: E402
    get_sample_by_sid,
    get_report,
    get_report_automation_list,
    get_report_stats,
    get_completed_reports_list,
    get_latest_completed_output_path,
    get_report_file_paths,
    delete_report_row,
    sync_sample_report_status_after_delete,
    has_active_report,
)
from app.services.provisioning import RAW_DIR, OUTPUTS_SUBDIR, storage_ready  # noqa: E402
from app.services.report_worker import enqueue_report_job, request_cancel  # noqa: E402
from app.services.input_resolver import resolve_input, resolve_report  # noqa: E402

# PDFs are disposable (regenerated from the docx), so the cache stays on local disk
REPORT_PDF_CACHE = BACKEND_ROOT / "report_pdf_cache"
REPORT_PDF_CACHE.mkdir(parents=True, exist_ok=True)

OUTPUT_KINDS = {"germline", "somatic", "prs"}


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


async def get_sample_inputs(sid: str):
    """Which input files exist on the share for this sample (feeds the
    'Use this sample' button in the UI)."""
    sample = get_sample_by_sid(sid)
    if not sample:
        raise HTTPException(status_code=404, detail="Sample not found")
    if not storage_ready():
        raise HTTPException(status_code=503, detail="Storage share is not available")

    out = {"sid": sid}
    for kind in ("germline", "somatic", "prs"):
        found = resolve_input(sid, kind, sample.get(f"{kind}_path"))
        out[kind] = found.name if found else None
    out["ready"] = any(out[k] for k in ("germline", "somatic", "prs"))
    return out


async def generate_report(sid: str):
    sample = get_sample_by_sid(sid)
    if not sample:
        raise HTTPException(status_code=404, detail="Sample not found")
    if not storage_ready():
        raise HTTPException(status_code=503, detail="Storage share is not available")

    # One active job per sample: a duplicate would overwrite the same staged
    # inputs and outputs.
    if has_active_report(sample["sample_id"]):
        raise HTTPException(
            status_code=409,
            detail=f"{sid} already has a job queued or running",
        )

    # DB paths are only *expected* locations, so check the files really exist
    # (falls back to the newest .xlsx in raw/{sid}/{kind}/)
    germline = resolve_input(sid, "germline", sample.get("germline_path"))
    somatic = resolve_input(sid, "somatic", sample.get("somatic_path"))
    prs = resolve_input(sid, "prs", sample.get("prs_path"))

    if not (germline or somatic or prs):
        raise HTTPException(
            status_code=400,
            detail=f"No input files found for {sid} in raw/{sid}/germline, somatic or prs",
        )

    report_id = enqueue_report_job(
        sid,
        str(germline) if germline else None,
        str(somatic) if somatic else None,
        str(prs) if prs else None,
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

    file_path = resolve_report(report["file_path"])
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

    docx_path = resolve_report(report["file_path"])
    if not docx_path.exists():
        raise HTTPException(status_code=404, detail="Report file missing on disk")

    return ensure_pdf(docx_path)


async def download_sample_output(sid: str, kind: str) -> Path:
    """Path to a sample's germline / somatic / prs output from its latest
    completed report. Raises 404 when there is no such output, and 503
    when the share isn't mounted."""
    if kind not in OUTPUT_KINDS:
        raise HTTPException(status_code=404, detail="Unknown output type")

    if not storage_ready():
        raise HTTPException(status_code=503, detail="Storage share is not mounted")

    rel_path = get_latest_completed_output_path(sid, kind)
    if not rel_path:
        raise HTTPException(status_code=404, detail="No output for this sample")

    # Block path traversal: the resolved file must stay inside raw/.
    root = RAW_DIR.resolve()
    full_path = (RAW_DIR / rel_path).resolve()
    if not full_path.is_relative_to(root) or not full_path.is_file():
        raise HTTPException(status_code=404, detail="Output file not found")

    return full_path


# ─── Delete ───────────────────────────────────────────────────────────────────

def _remove_file_under(path: Path, root: Path) -> None:
    """Delete one file, but only if it really sits inside raw/."""
    resolved = path.resolve()
    if not resolved.is_relative_to(root):
        raise HTTPException(status_code=500, detail="Refusing to delete a file outside raw/")
    try:
        resolved.unlink(missing_ok=True)
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Could not delete {resolved.name}: {e}")


async def delete_report(report_id: int):
    """Delete one report: its archived file, its run folder (outputs and
    pipeline.log), and its row. Files go first, so if a removal fails the row
    stays and the user can retry."""
    report = get_report_file_paths(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report["status"] in ("queued", "processing"):
        raise HTTPException(
            status_code=400,
            detail="This report is queued or running. Stop it before deleting.",
        )
    if not storage_ready():
        raise HTTPException(
            status_code=503,
            detail="Storage share is not mounted, so the files can't be removed",
        )

    root = RAW_DIR.resolve()

    # 1. archived report file
    if report.get("file_path"):
        _remove_file_under(resolve_report(report["file_path"]), root)

    # 2. run folder: outputs and pipeline.log
    run_dir = (RAW_DIR / report["sid"] / OUTPUTS_SUBDIR / f"r{report_id}").resolve()
    if run_dir.is_relative_to(root) and run_dir.exists():
        try:
            shutil.rmtree(run_dir)
        except OSError as e:
            raise HTTPException(status_code=500, detail=f"Could not delete run folder: {e}")

    # 3. row, then keep the sample's status in step
    delete_report_row(report_id)
    sync_sample_report_status_after_delete(report["sample_ref"])
    return {"status": "deleted", "report_id": report_id}