"""
app/services/variant_parser.py

Parses whatever sample Excel file gets uploaded for the variant
visualization feature (Germline Results, Somatic Results, or a
PRS/Merged file), auto-detecting which of the three it is, and
returns visualization-ready JSON. No DB persistence yet — this is
a stateless parse-and-return service by design (deferred per product
decision) so the frontend can render immediately after upload.

Germline/Somatic files: the `Variations` sheet is VEP output with one
row per transcript per variant, so a single genomic variant
(CHROM+POS+REF+ALT) spans multiple rows. We collapse to one row per
variant:
  1. Prefer the row where MANE_SELECT is populated (the clinically
     canonical transcript), if any row in the group has one.
  2. Otherwise, prefer the row with the most severe IMPACT
     (HIGH > MODERATE > LOW > MODIFIER).

PRS/Merged files: `Sheet1` is already one row per trait/sample, no
collapsing needed.
"""

import pandas as pd
import openpyxl

IMPACT_RANK = {"HIGH": 4, "MODERATE": 3, "LOW": 2, "MODIFIER": 1}

# ACMG-style badge bucket, ordered by clinical significance (most severe
# first). CLIN_SIG cells can contain multiple comma-separated terms
# (conflicting ClinVar submissions) — we pick the most severe bucket
# present, matching how the reference product's LP/VUS/LB/B badges read.
CLIN_SIG_PRIORITY = [
    ("P", ["pathogenic"]),          # checked after LP below (see bucket_for_clin_sig)
    ("LP", ["likely_pathogenic"]),
    ("VUS", ["uncertain_significance"]),
    ("LB", ["likely_benign"]),
    ("B", ["benign"]),
]

GERMLINE_VARIATIONS_COLS = [
    "CHROM", "POS", "REF", "ALT", "INFO", "FORMAT", "Germline",
    "varient_type", "Tumor_Ref_alele_Depth", "Tumor_Alt_allele_Depth",
    "Tumor_Total_Genotype_Depth",
    "Tumor_Allele_Fraction(alt_allele/total_genotype_depth)", "Intogen",
    "Consequence", "IMPACT", "SYMBOL", "Gene", "Feature_type", "Feature",
    "BIOTYPE", "EXON", "INTRON", "HGVSc", "HGVSp", "cDNA_position",
    "CDS_position", "Protein_position", "Amino_acids", "Codons",
    "Existing_variation", "DISTANCE", "STRAND", "FLAGS", "SYMBOL_SOURCE",
    "HGNC_ID", "MANE_SELECT", "MANE_PLUS_CLINICAL", "TSL", "APPRIS",
    "SIFT", "PolyPhen", "AF", "gnomADe_AF", "gnomADe_AFR_AF",
    "gnomADe_AMR_AF", "gnomADe_ASJ_AF", "gnomADe_EAS_AF", "gnomADe_FIN_AF",
    "gnomADe_NFE_AF", "gnomADe_SAS_AF", "CLIN_SIG", "SOMATIC", "PHENO",
    "Mastermind_MMID3", "PHENOTYPES", "DisGeNET", "QUAL", "FILTER",
    "HGVS_OFFSET", "PUBMED", "MOTIF_NAME", "MOTIF_POS", "HIGH_INF_POS",
    "MOTIF_SCORE_CHANGE", "TRANSCRIPTION_FACTORS", "Location", "LRT_pred",
    "MutationTaster_pred", "MutationAssessor_pred", "FATHMM_pred",
    "PROVEAN_pred", "MetaLR_pred", "DEOGEN2_pred", "ClinPred_pred",
    "SpliceAI_pred", "CADD_PHRED", "CADD_RAW",
]
SOMATIC_VARIATIONS_COLS = [c if c != "Germline" else "Somatic" for c in GERMLINE_VARIATIONS_COLS]

PRS_COLS = [
    "Sample", "Study ID", "Reported Trait", "Trait", "Score Type",
    "Polygenic Risk Score", "Percentile", "Protective Variants",
    "Risk Variants", "Variants Without Risk Allele",
    "Variants in High LD", "Mapped ID",
]


def detect_file_type(path: str) -> str:
    """Returns 'germline', 'somatic', or 'prs' by inspecting sheet names
    and headers. Raises ValueError if the file doesn't match any known
    shape."""
    # header-only peek stays on openpyxl (read_only mode is fast enough
    # for a handful of rows and avoids adding a second dependency path)
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    sheetnames = wb.sheetnames

    if "Variations" in sheetnames:
        ws = wb["Variations"]
        header = next(ws.iter_rows(min_row=1, max_row=1, values_only=True))
        if "Somatic" in header:
            return "somatic"
        if "Germline" in header:
            return "germline"
        raise ValueError(
            "Found a 'Variations' sheet but couldn't tell germline vs "
            "somatic (no 'Germline' or 'Somatic' column in the header row)."
        )

    if "Sheet1" in sheetnames:
        ws = wb["Sheet1"]
        header = next(ws.iter_rows(min_row=1, max_row=1, values_only=True))
        if "Polygenic Risk Score" in header:
            return "prs"

    raise ValueError(
        "Unrecognized file — expected a Germline/Somatic Results file "
        "(sheet 'Variations') or a PRS/Merged file (sheet 'Sheet1' with "
        "a 'Polygenic Risk Score' column)."
    )


def _bucket_for_clin_sig(clin_sig: str) -> str:
    """CLIN_SIG cells can hold several comma-separated ClinVar terms
    (conflicting submissions) — pick the single most clinically severe
    bucket present, checked in priority order P > LP > VUS > LB > B."""
    if not clin_sig or clin_sig == "-":
        return "N/A"
    terms = [t.strip() for t in clin_sig.lower().split(",")]
    if "pathogenic" in terms:
        return "P"
    if "likely_pathogenic" in terms or "pathogenic/likely_pathogenic" in terms:
        return "LP"
    if "uncertain_significance" in terms:
        return "VUS"
    if "likely_benign" in terms or "benign/likely_benign" in terms:
        return "LB"
    if "benign" in terms:
        return "B"
    return "N/A"


def _zygosity_from_gt(genotype_field: str) -> tuple[str, str]:
    """genotype_field looks like '0/1:57,37:94:99:974,0,1675'.
    Returns (genotype_str, zygosity_label)."""
    if not genotype_field:
        return ("N/A", "N/A")
    gt = genotype_field.split(":")[0]
    alleles = gt.replace("|", "/").split("/")
    if len(alleles) < 2:
        return (gt, "N/A")
    if alleles[0] == alleles[1]:
        return (gt, "HOM" if alleles[0] != "0" else "REF")
    return (gt, "HET")


def _impact_rank(impact: str) -> int:
    return IMPACT_RANK.get(impact, 0)


def parse_variations_file(path: str, file_type: str, include_low_impact: bool = True) -> dict:
    """file_type is 'germline' or 'somatic'. Returns a dict with
    `variants` (collapsed, one row per variant) and `summary` (counts
    for the header chips), matching the reference UI's shape.

    `include_low_impact=False` (default) drops LOW/MODIFIER-impact
    *rows* before collapsing — both for speed (the raw sheet has
    100k+ rows, one per transcript) and because the reference UI's
    default view is HIGH/MODERATE only. When a variant's only rows
    are LOW/MODIFIER, it's dropped entirely from this default view
    (available via a re-parse with include_low_impact=True, since
    parsing is stateless — see module docstring)."""
    gt_col = "Germline" if file_type == "germline" else "Somatic"
    usecols = GERMLINE_VARIATIONS_COLS if file_type == "germline" else SOMATIC_VARIATIONS_COLS

    # calamine is ~5x faster than openpyxl for reading large sheets
    df = pd.read_excel(path, sheet_name="Variations", usecols=usecols, engine="calamine")

    if not include_low_impact:
        df = df[df["IMPACT"].isin(["HIGH", "MODERATE"])]

    df["mane_flag"] = df["MANE_SELECT"].apply(
        lambda v: 1 if isinstance(v, str) and v not in ("-", "") else 0
    )
    df["impact_rank"] = df["IMPACT"].apply(_impact_rank)

    df = df.sort_values(
        by=["CHROM", "POS", "REF", "ALT", "mane_flag", "impact_rank"],
        ascending=[True, True, True, True, False, False],
    )
    collapsed = df.groupby(["CHROM", "POS", "REF", "ALT"], as_index=False).first()

    variants = []
    clin_sig_counts = {"P": 0, "LP": 0, "VUS": 0, "LB": 0, "B": 0, "N/A": 0}
    zygosity_counts = {"HET": 0, "HOM": 0}
    genes = set()

    # every raw column name we read, in original order, minus the two
    # helper columns we added ourselves for sorting
    raw_cols = [c for c in usecols]

    for _, row in collapsed.iterrows():
        clin_sig = row.get("CLIN_SIG")
        clin_sig = clin_sig if isinstance(clin_sig, str) else None
        badge = _bucket_for_clin_sig(clin_sig)
        clin_sig_counts[badge] = clin_sig_counts.get(badge, 0) + 1

        genotype_raw = row.get(gt_col)
        genotype, zygosity = _zygosity_from_gt(
            genotype_raw if isinstance(genotype_raw, str) else ""
        )
        if zygosity in zygosity_counts:
            zygosity_counts[zygosity] += 1

        symbol = row.get("SYMBOL")
        if isinstance(symbol, str) and symbol not in ("-", ""):
            genes.add(symbol)

        # pass through every one of the 77 raw columns as-is (JSON-safe),
        # instead of hand-picking which ones matter
        record = {}
        for col in raw_cols:
            val = row.get(col)
            if pd.isna(val):
                record[col] = None
            elif isinstance(val, (int, float, str, bool)):
                record[col] = val
            else:
                record[col] = str(val)

        # a handful of computed fields layered on top, not replacing the raw ones
        record["acmg"] = badge
        record["zygosity"] = zygosity
        record["genotype"] = genotype

        variants.append(record)

    summary = {
        "unique_genes": len(genes),
        "total_variants": len(variants),
        "clin_sig_counts": clin_sig_counts,
        "zygosity_counts": zygosity_counts,
    }

    return {"file_type": file_type, "summary": summary, "variants": variants}


def parse_prs_file(path: str) -> dict:
    df = pd.read_excel(path, sheet_name="Sheet1", usecols=PRS_COLS, engine="calamine")
    records = df.where(pd.notna(df), None).to_dict(orient="records")
    return {
        "file_type": "prs",
        "summary": {"total_traits": len(records)},
        "records": records,
    }


def parse_sample_file(path: str, include_low_impact: bool = True) -> dict:
    """Entry point: detect type, parse accordingly. Defaults to
    including every IMPACT level (per product decision — accept the
    heavier payload rather than silently dropping data)."""
    file_type = detect_file_type(path)
    if file_type == "prs":
        return parse_prs_file(path)
    return parse_variations_file(path, file_type, include_low_impact=include_low_impact)