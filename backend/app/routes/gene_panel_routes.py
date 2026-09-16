"""
Routes for the Gene Panel feature.

    POST /gene-panels/upload   -> upload the reference Excel, replaces table
    GET  /gene-panels/stats    -> counts for the stat cards
    GET  /gene-panels/genes    -> paginated/filterable gene list

Wire this into main.py the same way as the other routers, e.g.:
    from app.routes import gene_panel_routes
    app.include_router(gene_panel_routes.router)
"""

from fastapi import APIRouter, File, HTTPException, Query, UploadFile # type: ignore

from app.services.gene_panel_db import (
    get_gene_panel_stats,
    get_genes,
    get_multi_panel_genes,
    replace_gene_panels,
)
from app.services.gene_panel_parser import parse_gene_panel_excel

router = APIRouter(prefix="/gene-panels", tags=["gene-panels"])


@router.post("/upload")
async def upload_gene_panels(file: UploadFile = File(...)):
    if not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Please upload an Excel file (.xlsx/.xls)")

    file_bytes = await file.read()

    try:
        result = parse_gene_panel_excel(file_bytes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    inserted = replace_gene_panels(result.records, source_file=file.filename)

    return {
        "message": "Gene panel data uploaded successfully",
        "genes_inserted": inserted,
        "panel_counts": result.panel_counts,
        "unmapped_columns": result.unmapped_columns,  # non-empty means something in the sheet was ignored
    }


@router.get("/stats")
def gene_panel_stats():
    return get_gene_panel_stats()


@router.get("/genes")
def list_genes(
    category: str | None = Query(default=None, pattern="^(cancerous|non_cancerous)$"),
    panel: str | None = Query(default=None),
    search: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=500),
):
    return get_genes(category=category, panel=panel, search=search, page=page, page_size=page_size)


@router.get("/genes/multi-panel")
def list_multi_panel_genes(
    search: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=500),
):
    """Genes that show up in more than one panel (e.g. both Cardiac and NDD)."""
    return get_multi_panel_genes(search=search, page=page, page_size=page_size)