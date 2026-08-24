"""
app/routes/variant_routes.py

Dedicated upload endpoint for the variant visualization feature.
Separate from report_routes.py's upload (different feature, per
product decision) — accepts any one of the three sample file types
(Germline Results / Somatic Results / PRS-Merged) and returns
parsed, visualization-ready JSON directly. No DB writes: parsing is
stateless for now (persistence design deferred).
"""

import os
import shutil
import tempfile
import uuid

from fastapi import APIRouter, UploadFile, File, HTTPException, Query # type: ignore

from app.services.variant_parser import parse_sample_file

router = APIRouter(prefix="/variants", tags=["variant-visualization"])

ALLOWED_EXTENSIONS = {".xlsx"}


@router.post("/upload")
async def upload_variant_file(
    file: UploadFile = File(...),
    include_low_impact: bool = Query(
        True,
        description="If false, restrict to HIGH/MODERATE-impact variants only "
                    "(germline/somatic files only; ignored for PRS). Defaults "
                    "to true — the full unfiltered dataset.",
    ),
):
    """Accepts a single .xlsx file, auto-detects whether it's a
    Germline Results, Somatic Results, or PRS/Merged file, parses it,
    and returns the visualization-ready JSON straight away."""
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Only .xlsx files are supported.")

    tmp_dir = tempfile.gettempdir()
    tmp_path = os.path.join(tmp_dir, f"variant_upload_{uuid.uuid4().hex}{ext}")

    try:
        with open(tmp_path, "wb") as out:
            shutil.copyfileobj(file.file, out)

        try:
            result = parse_sample_file(tmp_path, include_low_impact=include_low_impact)
        except ValueError as e:
            # unrecognized file shape (not a Germline/Somatic/PRS file)
            raise HTTPException(status_code=422, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to parse file: {e}")

        result["filename"] = file.filename
        return result
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)