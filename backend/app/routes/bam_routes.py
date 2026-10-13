"""
app/routes/bam_routes.py

  POST /api/samples/{sid}/igv-session            -> signed URLs + contig style + available VCFs for igv.js
  GET|HEAD /api/samples/{sid}/bam?token=...      (Range supported)
  GET|HEAD /api/samples/{sid}/bai?token=...
  GET|HEAD /api/samples/{sid}/vcf/{kind}?token=...         kind = germline | somatic
  GET|HEAD /api/samples/{sid}/vcf-index/{kind}?token=...   (.tbi / .csi, only if the VCF is bgzipped)

Wire it up in main.py with:
    from app.routes import bam_routes
    app.include_router(bam_routes.router)
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request  # type: ignore

from app.services import bam_service as svc

router = APIRouter(prefix="/api/samples", tags=["igv"])


def get_current_user(request: Request) -> str:
    """PLACEHOLDER. The app has no authentication yet, so the "user" in the
    audit log is the client IP (the proxy's IP if nginx is put in front).
    Replace the body with the real user lookup once login exists; nothing
    else in this file needs to change."""
    return f"ip:{request.client.host if request.client else 'unknown'}"


@router.post("/{sid}/igv-session")
def create_igv_session(sid: str, user: str = Depends(get_current_user)):
    try:
        bam, _ = svc.resolve_bam(sid)             # 400 / 404 / 503
        token, exp = svc.make_token(sid, user)
    except HTTPException as e:
        svc.audit(user, sid, "session", e.status_code, f"detail={e.detail!r}")
        raise
    style = svc.contig_style(bam) or {}

    # A VCF problem must never stop the BAM viewer from opening.
    vcfs = []
    try:
        for kind, (path, idx) in svc.list_vcfs(sid).items():
            vcfs.append({
                "kind": kind,
                "name": path.name,
                "url": f"/api/samples/{sid}/vcf/{kind}?token={token}",
                "index_url": f"/api/samples/{sid}/vcf-index/{kind}?token={token}" if idx else None,
            })
    except HTTPException as e:
        svc.audit(user, sid, "session-vcf", e.status_code, f"detail={e.detail!r}")

    svc.audit(user, sid, "session", 200, f"vcfs={[v['kind'] for v in vcfs]}")
    return {
        "sample_id": sid,
        "bam_url": f"/api/samples/{sid}/bam?token={token}",
        "bai_url": f"/api/samples/{sid}/bai?token={token}",
        "expires_at": exp,
        "chr_prefix": style.get("chr_prefix"),     # True / False / None (unknown)
        "vcfs": vcfs,
    }


def _serve(sid: str, kind: str, request: Request, token: str | None):
    rng = request.headers.get("range")
    detail = f"method={request.method} range={rng!r}"
    user = "-"
    try:
        svc.validate_sid(sid)
        if not token:
            raise HTTPException(401, "Missing token")
        user = svc.verify_token(token, sid)
        bam, bai = svc.resolve_bam(sid)
        resp = svc.serve_file(bam if kind == "bam" else bai, rng, head=request.method == "HEAD")
    except HTTPException as e:
        svc.audit(user, sid, kind, e.status_code, detail)
        raise
    svc.audit(user, sid, kind, resp.status_code, detail)
    return resp


@router.api_route("/{sid}/bam", methods=["GET", "HEAD"])
def get_bam(sid: str, request: Request, token: str | None = Query(None)):
    return _serve(sid, "bam", request, token)


@router.api_route("/{sid}/bai", methods=["GET", "HEAD"])
def get_bai(sid: str, request: Request, token: str | None = Query(None)):
    return _serve(sid, "bai", request, token)


# ── VCF (germline / somatic) ────────────────────────────────────────────────

def _serve_vcf(sid: str, kind: str, request: Request, token: str | None, index: bool):
    rng = request.headers.get("range")
    action = f"vcf-index:{kind}" if index else f"vcf:{kind}"
    detail = f"method={request.method} range={rng!r}"
    user = "-"
    try:
        svc.validate_sid(sid)
        if not token:
            raise HTTPException(401, "Missing token")
        user = svc.verify_token(token, sid)
        path = svc.resolve_vcf(sid, kind, want_index=index)
        resp = svc.serve_file(path, rng, head=request.method == "HEAD")
    except HTTPException as e:
        svc.audit(user, sid, action, e.status_code, detail)
        raise
    svc.audit(user, sid, action, resp.status_code, detail)
    return resp


@router.api_route("/{sid}/vcf/{kind}", methods=["GET", "HEAD"])
def get_vcf(sid: str, kind: str, request: Request, token: str | None = Query(None)):
    return _serve_vcf(sid, kind, request, token, index=False)


@router.api_route("/{sid}/vcf-index/{kind}", methods=["GET", "HEAD"])
def get_vcf_index(sid: str, kind: str, request: Request, token: str | None = Query(None)):
    return _serve_vcf(sid, kind, request, token, index=True)