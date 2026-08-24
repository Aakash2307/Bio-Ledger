"""
Report Automation routes.

- upload input files (germline / somatic / prs) for a sample
- trigger report generation
- list report automation status (for the Report Automation page)
- download / view a completed report

All logic lives in controllers/report_controller.py — this file only
wires HTTP endpoints to controller calls and shapes the responses.
"""

from typing import Optional

from fastapi import APIRouter, UploadFile, File  # type: ignore
from fastapi.responses import FileResponse  # type: ignore

from app.controllers import report_controller as controller

router = APIRouter(tags=["report-automation"])  # no /api prefix — matches api.js's plain paths


@router.post("/samples/{sid}/upload-inputs")
async def upload_report_inputs(
    sid: str,
    germline_file: Optional[UploadFile] = File(None),
    somatic_file: Optional[UploadFile] = File(None),
    prs_file: Optional[UploadFile] = File(None),
):
    return await controller.upload_report_inputs(sid, germline_file, somatic_file, prs_file)


@router.post("/reports/generate/{sid}")
async def generate_report(sid: str):
    return await controller.generate_report(sid)


@router.get("/report-automation")
async def list_report_automation():
    return await controller.list_report_automation()


@router.get("/reports/stats")
async def report_stats():
    return await controller.report_stats()


@router.get("/reports/completed")
async def completed_reports():
    return await controller.completed_reports()


@router.get("/reports/{report_id}")
async def report_status(report_id: int):
    return await controller.report_status(report_id)


@router.get("/reports/{report_id}/download")
async def download_report(report_id: int):
    file_path = await controller.download_report(report_id)
    return FileResponse(path=str(file_path), filename=file_path.name)


@router.get("/reports/{report_id}/view")
async def view_report(report_id: int):
    pdf_path = await controller.view_report(report_id)
    return FileResponse(
        path=str(pdf_path),
        filename=pdf_path.name,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{pdf_path.name}"'},
    )

@router.post("/reports/{report_id}/cancel")
async def cancel_report(report_id: int):
    return await controller.cancel_report(report_id)