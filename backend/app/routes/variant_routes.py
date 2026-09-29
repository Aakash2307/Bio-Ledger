"""
app/routes/variant_routes.py  (FastAPI version)

Endpoints:
  POST /api/variants/upload                    -> ingest a sample's xlsx/csv, cache it
  GET  /api/variants/{sample_id}/summary        -> counts per pathogenicity class + gene category
  GET  /api/variants/{sample_id}                -> paginated / filtered / sorted rows
  GET  /api/variants/{sample_id}/{variant_id}   -> full row for the detail panel

  GET  /api/sample-files/{sid}/check            -> sid exists in samples + has a sample_records row
  POST /api/sample-files/{sid}/load?type=...    -> check stored path/folder/file, parse into cache

Wire it up in main.py with:
    from app.routes import variant_routes
    app.include_router(variant_routes.router)
    app.include_router(variant_routes.sample_router)
"""

import os
import shutil
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Query # type: ignore

from database import get_connection
from app.services.variant_parser import (
    parse_and_cache, query_variants, get_summary, get_variant_detail,
    _find_cache_path, _cached_type_label,
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
    # "unclassified" added: covers variants whose gene didn't match any
    # panel in the gene_panels reference table (gene_category IS NULL in
    # the cache) — see the matching IS NULL branch in query_variants().
    gene_category: str | None = Query(None, pattern="^(cancerous|non_cancerous|both|unclassified)$"),
    gene_panel: str | None = Query(None, alias="gene_panel"),
):
    return query_variants(
        sample_id, page=page, page_size=page_size,
        sort_by=sort_by, sort_dir=sort_dir,
        class_filter=class_, search=search, gene_filter=gene,
        gene_category_filter=gene_category, panel_filter=gene_panel,
    )


@router.get("/{sample_id}/{variant_id}")
def variant_detail(sample_id: str, variant_id: str):
    detail = get_variant_detail(sample_id, variant_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Variant not found")
    return detail


# =========================================================
# SAMPLE-ID SEARCH FLOW
#   1. sid must exist in `samples`            -> else "No sample found"
#   2. sample_records.sample_ref == samples.id -> else "No sample found"
#   3. user picks germline / somatic (dialog on the frontend)
#   4. stored path -> folder -> file, each checked in order
# Separate prefix so it can't be swallowed by /{sample_id}/{variant_id}.
# =========================================================

SAMPLE_DATA_DIR = os.environ.get(
    "SAMPLE_DATA_DIR",
    "/mnt/genome-data/Mibiome/Bioledger/data/sample_data",
)
RAW_DIR = Path(SAMPLE_DATA_DIR) / "raw"

sample_router = APIRouter(prefix="/api/sample-files", tags=["sample-files"])


def _find_sample_and_record(sid: str):
    """samples.sid -> samples.id -> sample_records.sample_ref = id.

    A sample can have several sample_records rows. Prefer a row that
    actually has a stored path, so a newer record with NULL paths can't
    shadow the one that does."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM samples WHERE sid = %s", (sid,))
            sample = cur.fetchone()
            if not sample:
                return None, None
            cur.execute("""
                SELECT id, germline_path, somatic_path
                FROM sample_records
                WHERE sample_ref = %s
                ORDER BY (germline_path IS NULL AND somatic_path IS NULL),
                         report_release_date DESC, id DESC
                LIMIT 1
            """, (sample["id"],))
            return sample, cur.fetchone()
    finally:
        conn.close()


def _require_mount():
    # If the SMB share isn't mounted, every path check would fail with a
    # misleading "no path available" -- report the real problem instead.
    if not RAW_DIR.parent.is_dir():
        raise HTTPException(503, "Sample storage is not available (share not mounted?)")


@sample_router.get("/{sid}/check")
def check_sample(sid: str):
    """Steps 1-2: sid exists in samples AND has a sample_records row."""
    sid = sid.strip()
    sample, record = _find_sample_and_record(sid)
    if not sample or not record:
        raise HTTPException(404, "No sample found")
    return {"sid": sid, "types": ["germline", "somatic"]}


@sample_router.post("/{sid}/load")
def load_sample_file(sid: str, type: str = Query(..., pattern="^(germline|somatic)$")):
    """Steps 3-4: user picked a type -> check DB path, folder, file, then parse."""
    sid = sid.strip()
    _require_mount()

    sample, record = _find_sample_and_record(sid)
    if not sample or not record:
        raise HTTPException(404, "No sample found")

    rel = record.get(f"{type}_path")
    if not rel:
        raise HTTPException(404, f"No {type} path available")

    full = (RAW_DIR / rel).resolve()

    if RAW_DIR.resolve() not in full.parents:      # path-traversal guard
        raise HTTPException(400, "Invalid stored path")
    if not full.parent.is_dir():
        raise HTTPException(404, f"No {type} path available")
    if full.is_dir():
        raise HTTPException(404, f"Stored {type} path is a folder, not a file: {rel}")
    if not full.is_file():
        raise HTTPException(404, f"No {type} file found at: {rel}")

    # Skip the expensive re-parse only if the cache is the SAME type and
    # newer than the source file. Switching germline <-> somatic makes
    # `fresh` False, so the new type is parsed and the old cache replaced.
    cached = _find_cache_path(sid)
    fresh = bool(
        cached
        and _cached_type_label(sid) == type.capitalize()
        and os.path.getmtime(cached) >= full.stat().st_mtime
    )
    rows = None if fresh else parse_and_cache(str(full), sid, type)

    return {
        "sample_id": sid,
        "type": type,
        "rows_ingested": rows,
        "from_cache": fresh,
    }