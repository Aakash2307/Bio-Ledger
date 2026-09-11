"""
app/services/variant_parser.py

Ingests large VEP-annotated germline/somatic result files (.xlsx/.csv/.tsv,
~30-40k rows) and serves them back to the frontend as paginated / filtered /
sorted JSON, plus per-variant detail — without ever loading the full table
into memory on every request.

Strategy:
  1. Parse ONCE on upload. Rename the columns we actually need for the UI,
     derive a variant_id and a pathogenicity_class (A-E), and write the
     result to a Parquet file (variant_cache/<sample_id>.parquet).
  2. All later reads (list page, filter, sort, detail lookup) run as DuckDB
     SQL directly against that Parquet file. DuckDB does the heavy lifting
     (filter/sort/paginate) at native speed, so 37k rows is trivial.

Install once: pip install pandas duckdb pyarrow openpyxl
"""

import os
import math
import pandas as pd
import duckdb # type: ignore

from app.services.gene_panel_db import get_gene_category_lookup
from app.services.gene_panel_parser import PANEL_MATCHERS

# Single source of truth for which category each panel belongs to, reused
# from gene_panel_parser.py's PANEL_MATCHERS instead of hand-duplicated
# here — e.g. {"Somatic": "cancerous", "Cardiac": "non_cancerous", ...}
PANEL_CATEGORY = {panel_label: category for _, panel_label, category in PANEL_MATCHERS}

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "variant_cache")
os.makedirs(CACHE_DIR, exist_ok=True)

# Map each canonical field the UI needs to a list of possible source column
# names, in priority order — different pipeline exports (germline vs somatic
# vs older runs) don't always use the same headers.
FIELD_ALIASES = {
    "chrom": ["CHROM"],
    "pos": ["POS"],
    "ref": ["REF"],
    "alt": ["ALT"],
    "gene": ["SYMBOL"],
    "consequence": ["Consequence"],
    "impact": ["IMPACT"],
    "hgvsc": ["HGVSc"],
    "hgvsp": ["HGVSp"],
    "depth": ["Tumor_Total_Genotype_Depth", "DP", "Total_Depth"],
    "vf_pct": ["Tumor_Allele_Fraction(alt_allele/total_genotype_depth)", "Alt_allele_freq", "AF"],
    "gnomad_af": ["gnomADe_AF"],
    "sift": ["SIFT"],
    "polyphen": ["PolyPhen"],
    "clin_sig": ["CLIN_SIG"],
    # Newer pipeline exports (Germline_Results_5 / Somatic_WithExclusion_
    # Results onward) have a dedicated rsID column; older exports only had
    # rsIDs bundled inside "Existing_variation" — keep both, new one first.
    "rsid": ["rsID", "Existing_variation"],
    # New in the latest pipeline:
    "acmg_classification": ["ACMG_Classification"],
    "acmg_criteria": ["ACMG_Criteria"],
    "alphamissense_class": ["AlphaMissense_class"],
    "alphamissense_pathogenicity": ["AlphaMissense_pathogenicity"],
    "revel_score": ["REVEL_score"],
    "cadd_phred": ["CADD_phred"],
}


def _pick_data_sheet(file_path: str) -> str | None:
    """Multi-sheet exports (ReadMe / Summary-results / Variations, etc.)
    put the real variant table in whichever sheet has the most columns —
    legend/summary sheets are always narrow. Returns None for CSV/TSV
    (single-sheet, not applicable)."""
    if not file_path.lower().endswith((".xlsx", ".xls")):
        return None
    xl = pd.ExcelFile(file_path)
    if len(xl.sheet_names) == 1:
        return xl.sheet_names[0]
    best_sheet, best_width = xl.sheet_names[0], -1
    for name in xl.sheet_names:
        width = pd.read_excel(xl, sheet_name=name, nrows=0).shape[1]
        if width > best_width:
            best_sheet, best_width = name, width
    return best_sheet


def _json_safe(df: pd.DataFrame) -> pd.DataFrame:
    """FastAPI/Starlette's JSON encoder rejects NaN/Infinity outright
    (ValueError: Out of range float values are not JSON compliant).
    Pandas/DuckDB produce NaN for any missing numeric cell, so every
    row with an empty depth/VF%/gnomad_af would otherwise crash the
    whole response.

    IMPORTANT: must cast to object dtype BEFORE replacing — on a
    float64 column, `.where(..., None)` silently coerces None back
    into NaN, since a float64 Series can't actually hold None. Casting
    to object first makes the replacement stick."""
    df = df.replace([float("inf"), float("-inf")], None)
    return df.astype(object).where(pd.notnull(df), None)


def _cache_path(sample_id: str) -> str:
    safe = "".join(c for c in sample_id if c.isalnum() or c in "._-")
    return os.path.join(CACHE_DIR, f"{safe}.parquet")


def _classify(row) -> str:
    """Approximate SOPHiA-style A(Pathogenic)..E(Benign) bucketing, an "M"
    (Mixed/Conflicting) bucket for genuine ClinVar disagreement, and a
    separate "N" (No ClinVar Data) bucket for variants with no usable
    ClinVar significance at all.

    IMPORTANT: "no data" and "genuinely conflicting" are NOT the same thing
    and must not share a bucket. An earlier version of this function merged
    them into one "M" bucket, which meant a dataset where most variants
    simply have no ClinVar annotation looked like most variants were
    "disputed" — misleading in the opposite direction from the original
    problem (blank data silently guessed as Benign). Keeping them separate:
    "M" = ClinVar submitters actually disagreed on this variant.
    "N" = ClinVar has nothing to say about this variant at all.

    ClinVar submissions for a variant are often reported as a
    comma-separated list of every submitter's call, e.g.
    "pathogenic,benign" or "conflicting_interpretations_of_pathogenicity,
    benign" — different labs disagreeing on the same variant. A naive
    substring check would see "pathogenic" in "pathogenic,benign" and file
    it under Pathogenic, which is also misleading: the correct read is
    "disputed", not "pathogenic"."""
    clin = str(row.get("clin_sig", "") or "").strip().lower()

    # No usable ClinVar submission at all -> its own "No Data" bucket,
    # explicitly NOT the same as a genuine conflict.
    if not clin or clin in ("-", "not_provided", "not provided"):
        return "N"

    # "/" joins terms from a single combined ClinVar category (e.g.
    # "benign/likely_benign") and isn't a real conflict; "," separates
    # distinct submissions and IS what we're checking for disagreement.
    tokens = [t.strip() for t in clin.replace("/", ",").split(",") if t.strip() and t.strip() != "-"]
    has_pathogenic = any("pathogenic" in t and "benign" not in t for t in tokens)
    has_benign = any("benign" in t for t in tokens)
    explicit_conflict = "conflicting_interpretations_of_pathogenicity" in clin
    if explicit_conflict or (has_pathogenic and has_benign):
        return "M"

    if "pathogenic" in clin and "likely" not in clin:
        return "A"
    if "likely_pathogenic" in clin or "likely pathogenic" in clin:
        return "B"
    if "uncertain" in clin or "vus" in clin:
        return "C"
    # Benign and Likely Benign are combined into a single bucket per
    # request — the practical distinction rarely matters day-to-day, and it
    # halves the number of "basically fine" filter buttons in the sidebar.
    if "likely_benign" in clin or "likely benign" in clin or "benign" in clin:
        return "D"

    # A ClinVar term exists but isn't one we recognize as part of the
    # pathogenicity spectrum (e.g. "risk_factor", "association",
    # "protective", "drug_response" on their own) -> also "No ClinVar Data"
    # rather than a guessed A-E bucket, since it's not a Benign/Pathogenic
    # call either.
    return "N"


def _classify_gene(gene, lookup: dict) -> tuple[str | None, str | None]:
    """Look up a variant's gene symbol against the gene_panels reference
    table (already loaded into `lookup` once per upload, not per row).

    Returns (gene_category, gene_panels):
      - gene_category: "cancerous" | "non_cancerous" | "both" | None
        ("both" happens for real — e.g. ABL1 sits in both a cancerous
        Somatic panel and a non-cancerous Cardiac panel; that's not a data
        error, some genes legitimately span both lists)
      - gene_panels: pipe-joined panel names the gene matched, or None

    Matching is case-insensitive and exact-symbol only (no aliasing) —
    same convention as the gene_panels table itself.
    """
    if not gene or (isinstance(gene, float) and pd.isna(gene)):
        return None, None

    matches = lookup.get(str(gene).strip().upper())
    if not matches:
        return None, None

    categories = {m["category"] for m in matches}
    panels = sorted({m["panel"] for m in matches})
    if categories == {"cancerous"}:
        summary = "cancerous"
    elif categories == {"non_cancerous"}:
        summary = "non_cancerous"
    else:
        summary = "both"
    return summary, "|".join(panels)


def parse_and_cache(file_path: str, sample_id: str, variant_type: str) -> int:
    """Parse the uploaded file once and write the normalized Parquet cache.
    Returns the number of rows ingested."""
    if file_path.lower().endswith((".xlsx", ".xls")):
        sheet = _pick_data_sheet(file_path)
        df = pd.read_excel(file_path, sheet_name=sheet)
    else:
        df = pd.read_csv(file_path, sep=None, engine="python")

    # Resolve each canonical field to whichever alias actually exists in
    # this file, then rename JUST those columns to their canonical names.
    # IMPORTANT: unlike an earlier version of this function, we do NOT drop
    # every other column afterward. The Details tab is meant to show every
    # field the pipeline provides beyond what's already in Overview, and
    # both the Germline and Somatic exports have 90-100+ columns (VEP
    # consequence detail, population sub-frequencies, in-silico predictors,
    # SpliceAI scores, and — Somatic only — ClinVar/CIViC/AMP tiering).
    # Keeping every column (renamed or not) means the Details tab can
    # reflect on the full row rather than needing a hand-maintained list
    # that inevitably drifts out of sync with the pipeline's actual output.
    rename_map = {}
    for canonical, aliases in FIELD_ALIASES.items():
        for alias in aliases:
            if alias in df.columns:
                rename_map[alias] = canonical
                break

    df = df.rename(columns=rename_map)

    for col in ("depth", "vf_pct", "gnomad_af"):
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    if "vf_pct" in df.columns:
        # Normalize a 0-1 allele fraction into a display percentage
        df["vf_pct"] = df["vf_pct"].apply(lambda x: x * 100 if pd.notna(x) and x <= 1 else x)

    df["variant_type"] = variant_type
    df["variant_id"] = (
        df.get("chrom", pd.Series(dtype=str)).astype(str) + ":" +
        df.get("pos", pd.Series(dtype=str)).astype(str) + ":" +
        df.get("ref", pd.Series(dtype=str)).astype(str) + ">" +
        df.get("alt", pd.Series(dtype=str)).astype(str)
    )
    df["pathogenicity_class"] = df.apply(_classify, axis=1)

    # Cross-reference each variant's gene against the gene_panels reference
    # table (cancerous/non-cancerous, per-panel). Loaded ONCE per upload —
    # not once per row — since gene_panels is a small, mostly-static
    # reference set (a few thousand rows) and this can run on 30-100k
    # variant rows. If the DB is unreachable, upload still succeeds; the
    # variant list just comes back with gene_category/gene_panels empty
    # rather than the whole upload failing over a reference-data lookup.
    if "gene" in df.columns:
        try:
            gene_lookup = get_gene_category_lookup()
        except Exception:
            gene_lookup = {}
        classified = df["gene"].apply(lambda g: _classify_gene(g, gene_lookup))
        df["gene_category"] = classified.apply(lambda t: t[0])
        df["gene_panels"] = classified.apply(lambda t: t[1])

    # NOTE: rows are intentionally NOT deduplicated here — every row from the
    # source file (including multiple transcript/consequence annotations for
    # the same chrom/pos/ref/alt) is kept, per request. query_variants()
    # applies a secondary sort tie-break on variant_id so rows sharing the
    # same variant stay in a stable, deterministic order across pages rather
    # than shuffling between requests.
    df.to_parquet(_cache_path(sample_id), index=False)
    return len(df)


def query_variants(sample_id, page=1, page_size=100, sort_by="pos", sort_dir="asc",
                    class_filter=None, search=None, gene_filter=None, gene_category_filter=None,
                    panel_filter=None):
    path = _cache_path(sample_id)
    if not os.path.exists(path):
        return {"rows": [], "total": 0, "page": page, "page_size": page_size}

    con = duckdb.connect()

    # Discover which columns actually exist in this sample's cache before
    # building any SQL that references them — different pipeline exports
    # (germline vs somatic vs PRS) don't all have the same headers.
    actual_columns = [
        r[0] for r in con.execute(f"DESCRIBE SELECT * FROM read_parquet('{path}')").fetchall()
    ]

    where, params = [], []
    if class_filter and "pathogenicity_class" in actual_columns:
        where.append("pathogenicity_class = ?")
        params.append(class_filter)
    if gene_filter and "gene" in actual_columns:
        where.append("gene = ?")
        params.append(gene_filter)
    if gene_category_filter and "gene_category" in actual_columns:
        where.append("gene_category = ?")
        params.append(gene_category_filter)
    if panel_filter and "gene_panels" in actual_columns:
        # gene_panels is pipe-joined (e.g. "Cardiac|Somatic") since a gene
        # can match more than one panel — exact-token match via
        # list_contains(string_split(...)) rather than a LIKE substring
        # match, so a filter for "NDD" can't accidentally also match a
        # differently-named panel that happens to contain "NDD".
        where.append("list_contains(string_split(gene_panels, '|'), ?)")
        params.append(panel_filter)
    if search:
        search_cols = [c for c in ("gene", "hgvsc", "rsid") if c in actual_columns]
        if search_cols:
            where.append("(" + " OR ".join(f"{c} ILIKE ?" for c in search_cols) + ")")
            like = f"%{search}%"
            params += [like] * len(search_cols)

    where_sql = f"WHERE {' AND '.join(where)}" if where else ""
    sort_dir = "DESC" if str(sort_dir).lower() == "desc" else "ASC"
    # Fall back to the first available column if the requested sort column
    # doesn't exist in this sample's cache, instead of crashing.
    safe_sort_col = sort_by if sort_by in actual_columns else (actual_columns[0] if actual_columns else None)

    total = con.execute(
        f"SELECT COUNT(*) FROM read_parquet('{path}') {where_sql}", params
    ).fetchone()[0]

    offset = (page - 1) * page_size
    # Secondary tie-break on variant_id (in addition to the requested sort
    # column) so that rows with equal sort values — e.g. many variants
    # sharing the same "pos" across different chromosomes — get a stable,
    # deterministic order across requests instead of DuckDB being free to
    # return them in any order each time.
    tie_break = ", variant_id ASC" if "variant_id" in actual_columns and safe_sort_col != "variant_id" else ""
    order_sql = f"ORDER BY {safe_sort_col} {sort_dir} NULLS LAST{tie_break}" if safe_sort_col else ""
    rows = con.execute(
        f"""
        SELECT * FROM read_parquet('{path}')
        {where_sql}
        {order_sql}
        LIMIT ? OFFSET ?
        """,
        params + [page_size, offset],
    ).fetchdf()

    return {
        "rows": _json_safe(rows).to_dict(orient="records"),
        "total": int(total),
        "page": page,
        "page_size": page_size,
        "available_columns": actual_columns,  # temporary: helps us see what actually got parsed
    }


def get_summary(sample_id):
    """Powers the sidebar counts: total retained + per-class breakdown,
    a gene_category breakdown (cancerous / non_cancerous / both /
    unclassified), and a per-panel breakdown (Somatic, Hereditary,
    Cardiac, etc.) — the last two only when gene_category/gene_panels
    columns are present in this sample's cache."""
    path = _cache_path(sample_id)
    if not os.path.exists(path):
        return {"total": 0, "classes": {}, "gene_categories": {}, "panels": []}
    con = duckdb.connect()

    actual_columns = [
        r[0] for r in con.execute(f"DESCRIBE SELECT * FROM read_parquet('{path}')").fetchall()
    ]

    total = con.execute(f"SELECT COUNT(*) FROM read_parquet('{path}')").fetchone()[0]
    rows = con.execute(
        f"SELECT pathogenicity_class, COUNT(*) c FROM read_parquet('{path}') GROUP BY 1"
    ).fetchall()

    gene_categories = {}
    panels = []
    if "gene_category" in actual_columns:
        cat_rows = con.execute(
            f"""
            SELECT COALESCE(gene_category, 'unclassified') AS cat, COUNT(*) c
            FROM read_parquet('{path}') GROUP BY 1
            """
        ).fetchall()
        gene_categories = {r[0]: r[1] for r in cat_rows}

    if "gene_panels" in actual_columns:
        # Each variant's gene_panels is pipe-joined (e.g. "Cardiac|Somatic")
        # since one gene can legitimately match more than one panel — a
        # variant with 2 matching panels is counted once under EACH panel
        # here, same convention as the gene-level "both" category above.
        panel_rows = con.execute(
            f"""
            SELECT panel, COUNT(*) c FROM (
                SELECT UNNEST(string_split(gene_panels, '|')) AS panel
                FROM read_parquet('{path}')
                WHERE gene_panels IS NOT NULL AND gene_panels != ''
            )
            GROUP BY panel ORDER BY panel
            """
        ).fetchall()
        panels = [
            {"panel": r[0], "category": PANEL_CATEGORY.get(r[0], "non_cancerous"), "count": r[1]}
            for r in panel_rows
        ]

    return {
        "total": int(total),
        "classes": {r[0]: r[1] for r in rows},
        "gene_categories": gene_categories,
        "panels": panels,
    }


def get_variant_detail(sample_id, variant_id):
    path = _cache_path(sample_id)
    if not os.path.exists(path):
        return None
    con = duckdb.connect()
    row = con.execute(
        f"SELECT * FROM read_parquet('{path}') WHERE variant_id = ?", [variant_id]
    ).fetchdf()
    if row.empty:
        return None
    return _json_safe(row).iloc[0].to_dict()