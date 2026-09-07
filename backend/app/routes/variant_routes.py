"""
app/routes/variant_routes.py  (FastAPI version)

Endpoints:
  POST /api/variants/upload                    -> ingest a sample's xlsx/csv, cache it
  GET  /api/variants/{sample_id}/summary        -> counts per pathogenicity class
  GET  /api/variants/{sample_id}                -> paginated / filtered / sorted rows
  GET  /api/variants/{sample_id}/{variant_id}   -> full row for the detail panel

Wire it up in main.py with:
    from app.routes import variant_routes
    app.include_router(variant_routes.router)
"""

import os
import shutil
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Query

from app.services.variant_parser import (
    parse_and_cache, query_variants, get_summary, get_variant_detail,
)

router = APIRouter(prefix="/api/variants", tags=["variants"])

UPLOAD_DIR = "report_input_storage"
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("/upload")
async def upload_variant_file(
    file: UploadFile = File(...),
    sample_id: str = Form(...),
    type: str = Form("somatic"),  # somatic | germline | prs
):
    save_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(save_path, "wb") as out:
        shutil.copyfileobj(file.file, out)

    row_count = parse_and_cache(save_path, sample_id, type)
    return {"sample_id": sample_id, "rows_ingested": row_count}


@router.get("/{sample_id}/summary")
def variant_summary(sample_id: str):
    return get_summary(sample_id)


@router.get("/{sample_id}")
def variant_list(
    sample_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    sort_by: str = "pos",
    sort_dir: str = "asc",
    class_: str | None = Query(None, alias="class"),
    search: str | None = None,
    gene: str | None = None,
):
    return query_variants(
        sample_id, page=page, page_size=page_size,
        sort_by=sort_by, sort_dir=sort_dir,
        class_filter=class_, search=search, gene_filter=gene,
    )


@router.get("/{sample_id}/{variant_id}")
def variant_detail(sample_id: str, variant_id: str):
    detail = get_variant_detail(sample_id, variant_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Variant not found")
    return detail