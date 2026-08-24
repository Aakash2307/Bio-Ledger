"""
TZAR Labs — Unified Variant Report Generator
=============================================
Detects somatic and germline Excel files by sample ID and fills both
Table 1B (Somatic) and Table 2 (Germline) into a single output .docx
per sample.

Folder structure expected:
    input/
    ├── somatic/
    │   └── <SAMPLE_ID>_Somatic_Results*.xlsx
    └── germline/
        └── <SAMPLE_ID>_Germline_Results*.xlsx

    report_automation_template.docx   ← beside this script
    output/                           ← created automatically

Output:
    output/<SAMPLE_ID>_Report.docx

Sample ID is extracted as the first underscore-delimited token of the filename
e.g. '4A1804_Somatic_Results_Integrated.xlsx' → sample ID = '4A1804'

Usage:
    python generate_report.py
    (edit INPUT_FOLDER / OUTPUT_FOLDER / TEMPLATE_FILE below)
"""

import argparse
import copy
import re
import sys
from pathlib import Path
from collections import defaultdict

import openpyxl #type: ignore
from docx import Document #type: ignore
from docx.oxml import OxmlElement #type: ignore
from docx.oxml.ns import qn #type: ignore
from docx.shared import Pt #type: ignore
from docx.enum.text import WD_ALIGN_PARAGRAPH #type: ignore
from docx.enum.table import WD_ALIGN_VERTICAL #type: ignore


# ─────────────────────────────────────────────────────────────────────────────
# Paths  ← edit these
# ─────────────────────────────────────────────────────────────────────────────

INPUT_FOLDER  = "input"
OUTPUT_FOLDER = "output"
TEMPLATE_FILE = "new_report_template.docx"


# ─────────────────────────────────────────────────────────────────────────────
# Shared helpers
# ─────────────────────────────────────────────────────────────────────────────

def clean(val):
    if val is None:
        return ""
    s = str(val).strip()
    return "" if s in ("-", ".", "None") else s


def find_col(headers, *candidates):
    hl = [h.strip().lower() if h else "" for h in headers]
    for c in candidates:
        if c and c.strip().lower() in hl:
            return hl.index(c.strip().lower())
    return None


def sample_id_from_filename(name: str) -> str:
    """'4A1804_Somatic_Results_Integrated.xlsx' → '4A1804'"""
    return Path(name).stem.split("_")[0]


# ─────────────────────────────────────────────────────────────────────────────
# Shared DOCX helpers
# ─────────────────────────────────────────────────────────────────────────────

def _make_paragraph(text, center=True, font_size=11, bold=False):
    p = OxmlElement("w:p")
    if center:
        pPr = OxmlElement("w:pPr")
        jc = OxmlElement("w:jc")
        jc.set(qn("w:val"), "center")
        pPr.append(jc)
        spacing = OxmlElement("w:spacing")
        spacing.set(qn("w:after"), "0")
        pPr.append(spacing)
        p.append(pPr)
    r = OxmlElement("w:r")
    rPr = OxmlElement("w:rPr")
    rFonts = OxmlElement("w:rFonts")
    rFonts.set(qn("w:ascii"), "Calibri")
    rFonts.set(qn("w:hAnsi"), "Calibri")
    rPr.append(rFonts)
    sz = OxmlElement("w:sz")
    sz.set(qn("w:val"), str(font_size * 2))
    rPr.append(sz)
    if bold:
        rPr.append(OxmlElement("w:b"))
    r.append(rPr)
    t = OxmlElement("w:t")
    t.text = text
    if text and (text[0] == " " or text[-1] == " "):
        t.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
    r.append(t)
    p.append(r)
    return p


def _set_cell_multiline(cell, text: str, font_size=11, bold=False):
    tc = cell._tc
    NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    for p in tc.findall(f"{{{NS}}}p"):
        tc.remove(p)
    for line in (str(text).split("\n") if text else [""]):
        tc.append(_make_paragraph(line, center=True, font_size=font_size, bold=bold))
    cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER


def _prevent_row_break(row):
    NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    tr = row._tr
    trPr = tr.find(f"{{{NS}}}trPr")
    if trPr is None:
        trPr = OxmlElement("w:trPr")
        tr.insert(0, trPr)
    if trPr.find(f"{{{NS}}}cantSplit") is None:
        trPr.append(OxmlElement("w:cantSplit"))


def _set_keep_next(row):
    NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    for cell in row.cells:
        for p_el in cell._tc.findall(f"{{{NS}}}p"):
            pPr = p_el.find(f"{{{NS}}}pPr")
            if pPr is None:
                pPr = OxmlElement("w:pPr")
                p_el.insert(0, pPr)
            if pPr.find(f"{{{NS}}}keepNext") is None:
                pPr.append(OxmlElement("w:keepNext"))


def find_table_by_label(doc, keyword):
    """Return the table immediately following a paragraph containing keyword."""
    elements = list(doc.element.body)
    for i, el in enumerate(elements):
        if el.tag.endswith("}p"):
            text = "".join(t.text or "" for t in el.iter() if t.tag.endswith("}t"))
            if keyword.lower() in text.lower():
                for j in range(i + 1, len(elements)):
                    if elements[j].tag.endswith("}tbl"):
                        from docx.table import Table #type: ignore
                        return Table(elements[j], doc)
    return None


# ─────────────────────────────────────────────────────────────────────────────
# SOMATIC — extraction
# ─────────────────────────────────────────────────────────────────────────────

SOMATIC_SHEET_CONFIG = {
    "IntOGen":                      {"cancer_strategy": "intogen", "cancer_col": "INTOGEN"},
    "TCGA":                         {"cancer_strategy": "direct",  "cancer_col": "TCGA_SOURCE"},
    "Cancer_Hotspot":               {"cancer_strategy": "direct",  "cancer_col": "ONCOTREE_ORGANTYPE"},
    "Civic_accepted_and_submitted": {"cancer_strategy": "direct",  "cancer_col": "CIVIC ENTITY DISEASE"},
    "Civic_Amplification":          {"cancer_strategy": "direct",  "cancer_col": "DISEASE(CLINICAL EVIDENCE)"},
    "Civic_SNP":                    {"cancer_strategy": "direct",  "cancer_col": "DISEASE(CLIN_EVIDENCE)"},
}


def _extract_intogen_organ(val):
    val = clean(val)
    if not val:
        return None
    parts = [p.strip() for p in val.split(";")]
    specific = [p.title() for p in parts if p.lower() not in ("all organ", "all organs", "")]
    return "; ".join(specific) if specific else None


def _parse_zygosity_somatic(somatic_val):
    raw = clean(somatic_val)
    if not raw:
        return ""
    genotype = raw.split(":")[0].strip()
    if genotype in ("0/1", "1/0" ,"0|1", "1|0"):
        return "Hetero"
    elif genotype in ("1/1", "0/0" ,"1|1", "0|0"):
        return "Homo"
    return ""


def _format_vaf_somatic(fraction, ref, alt, somatic_val):
    frac = clean(fraction)
    try:
        frac_str = f"{float(frac):.3f}"
    except (ValueError, TypeError):
        frac_str = frac
    zygosity = _parse_zygosity_somatic(somatic_val)
    alleles  = f"{clean(ref)}{clean(alt)}"
    lines = [l for l in [frac_str, f"({zygosity})" if zygosity else "", alleles] if l]
    return "\n".join(lines)


def _parse_label(raw):
    raw = clean(raw).lower()
    if not raw:
        return "-"
    m = re.match(r"([^(]+)", raw)
    return (m.group(1).strip().replace("_", " ") if m else raw) or "-"


def _format_insilico(cadd, polyphen, sift):
    cadd_sym = "+"
    pp       = clean(polyphen).lower()
    pp_sym   = "+" if "damaging" in pp else "-"
    sift_raw = clean(sift).lower()
    sift_sym = "+" if "deleterious" in sift_raw else "-"
    return f"{cadd_sym}/{pp_sym}/{sift_sym}"


def _format_variant_id(existing_variation, consequence):
    ev = clean(existing_variation)
    ids = [x.strip() for x in ev.split(",") if x.strip()] if ev else []
    rs_ids  = [x for x in ids if x.lower().startswith("rs")]
    cos_ids = [x for x in ids if not x.lower().startswith("rs")]
    line1 = ", ".join(rs_ids) if rs_ids else (", ".join(cos_ids) if cos_ids else "")
    cons  = clean(consequence).replace("_", " ")
    line2 = f"({cons})" if cons else ""
    return "\n".join(l for l in [line1, line2] if l)


def extract_somatic_sheet(ws, sheet_name: str) -> list:
    rows = list(ws.iter_rows(values_only=True))
    if len(rows) < 2:
        return []
    headers = rows[0]
    cfg = SOMATIC_SHEET_CONFIG.get(sheet_name, {"cancer_strategy": "none", "cancer_col": None})

    sym_idx     = find_col(headers, "SYMBOL", "SYMBOL_X", "SYMBOL_Y")
    ev_idx      = find_col(headers, "EXISTING_VARIATION", "EXISTING_VARIATION_X", "EXISTING_VARIATION_Y")
    ct_idx      = find_col(headers, cfg["cancer_col"]) if cfg["cancer_col"] else None
    cons_idx    = find_col(headers, "CONSEQUENCE", "CONSEQUENCE_X", "ONE_CONSEQUENCE")
    frac_idx    = find_col(headers, "TUMOR_ALLELE_FRACTION(ALT_ALLELE/TOTAL_GENOTYPE_DEPTH)")
    ref_idx     = find_col(headers, "REF", "REF_X")
    alt_idx     = find_col(headers, "ALT", "ALT_X")
    somatic_idx = find_col(headers, "SOMATIC", "SOMATIC_X", "SOMATIC_Y")
    sift_idx    = find_col(headers, "SIFT", "SIFT_X")
    pp_idx      = find_col(headers, "POLYPHEN", "POLYPHEN_X")
    cadd_idx    = find_col(headers, "CADD_PHRED")

    def g(row, idx):
        return row[idx] if idx is not None and idx < len(row) else None

    results = []
    for row in rows[1:]:
        gene = clean(g(row, sym_idx))
        ev   = clean(g(row, ev_idx))
        if not gene and not ev:
            continue

        raw_cancer  = clean(g(row, ct_idx))
        cancer_type = (_extract_intogen_organ(raw_cancer)
                       if cfg["cancer_strategy"] == "intogen"
                       else raw_cancer)

        if cancer_type is None:
            continue

        results.append({
            "cancer_type": cancer_type,
            "gene":        gene,
            "variant_id":  _format_variant_id(ev, clean(g(row, cons_idx))),
            "vaf":         _format_vaf_somatic(
                               clean(g(row, frac_idx)),
                               clean(g(row, ref_idx)),
                               clean(g(row, alt_idx)),
                               clean(g(row, somatic_idx)),
                           ),
            "insilico":    _format_insilico(
                               clean(g(row, cadd_idx)),
                               clean(g(row, pp_idx)),
                               clean(g(row, sift_idx)),
                           ),
            "database":    sheet_name,
        })
    return results


def load_somatic_variants(xl_path: str) -> list:
    wb = openpyxl.load_workbook(xl_path, data_only=True)
    all_rows = []
    for sheet_name in SOMATIC_SHEET_CONFIG:
        if sheet_name not in wb.sheetnames:
            print(f"    [skip] {sheet_name} — not found")
            continue
        rows = extract_somatic_sheet(wb[sheet_name], sheet_name)
        print(f"    [{sheet_name}] {len(rows)} variants")
        all_rows.extend(rows)
    return all_rows


# ─────────────────────────────────────────────────────────────────────────────
# SOMATIC — DOCX writer
# ─────────────────────────────────────────────────────────────────────────────

S_COL_CANCER_TYPE = 0
S_COL_GENE        = 1
S_COL_VARIANT_ID  = 2
S_COL_VAF         = 3
S_COL_INSILICO    = 4
S_COL_DATABASE    = 5


def _prevent_row_break_somatic(row):
    _prevent_row_break(row)


def _add_somatic_row(table, template_tr, variant: dict):
    new_tr = copy.deepcopy(template_tr)
    table._tbl.append(new_tr)
    new_row = table.rows[-1]
    _prevent_row_break(new_row)
    cells = new_row.cells
    _set_cell_multiline(cells[S_COL_CANCER_TYPE], variant["cancer_type"])
    _set_cell_multiline(cells[S_COL_GENE],        variant["gene"])
    _set_cell_multiline(cells[S_COL_VARIANT_ID],  variant["variant_id"])
    _set_cell_multiline(cells[S_COL_VAF],         variant["vaf"])
    _set_cell_multiline(cells[S_COL_INSILICO],    variant["insilico"])
    _set_cell_multiline(cells[S_COL_DATABASE],    variant["database"])


def fill_somatic_table(doc, variants: list):
    table = find_table_by_label(doc, "Table 1B")
    if table is None:
        print("  WARNING: Could not find Table 1B (Somatic) — skipping.")
        return

    template_tr = copy.deepcopy(table.rows[1]._tr)
    for row in table.rows[1:]:
        table._tbl.remove(row._tr)

    for v in variants:
        _add_somatic_row(table, template_tr, v)

    print(f"  ✓ Somatic table filled — {len(variants)} rows")


# ─────────────────────────────────────────────────────────────────────────────
# GERMLINE — extraction
# ─────────────────────────────────────────────────────────────────────────────

CS_PATHOGENIC_SHEET = "CS_Pathogenic"

DISEASE_SHEETS = [
    "Hereditary_(germline)_158_genes",
    "Cardiac_565_genes",
    "Diabetes_pharmgkb_mito_genes_31",
    "NDD_890_genes",
    "Endometriosis_53_genes",
    "Neurodevelopmental_1733_genes",
]

SHEET_DISPLAY_NAMES = {
    "CS_Pathogenic":                    "CS_Pathogenic",
    "Hereditary_(germline)_158_genes":  "Hereditary (germline) - 158 genes",
    "Cardiac_565_genes":                "Cardiac - 565 genes",
    "Diabetes_pharmgkb_mito_genes_31":  "Diabetes_pharmgkb_mito genes - 318 genes",
    "NDD_890_genes":                    "NDD - 890 genes",
    "Endometriosis_53_genes":           "Endometriosis - 53 genes",
    "Neurodevelopmental_1733_genes":    "Neurodevelopmental - 1733 genes",
}


def _format_gene_nmid(symbol, mane_select):
    s  = clean(symbol)
    nm = clean(mane_select)
    return f"{s}\n({nm})" if s and nm else s or nm


def _format_chr_exon(chrom, exon):
    c = re.sub(r"^chr", "", clean(chrom), flags=re.IGNORECASE)
    e = clean(exon)
    e = e.split("/")[0].strip() if e else "-"
    return f"{c}/{e}"


def _extract_after_colon(val):
    val = clean(val)
    if not val:
        return ""
    return val.split(":", 1)[1].strip() if ":" in val else val


def _format_coding(hgvsc, hgvsp):
    c = _extract_after_colon(hgvsc)
    p = _extract_after_colon(hgvsp)
    return "\n".join(x for x in [c, p] if x)


def _parse_zygosity_germline(germline_val):
    raw = clean(germline_val)
    if not raw:
        return ""
    genotype = raw.split(":")[0].strip()
    if genotype in ("0/1", "1/0" ,"0|1", "1|0"):
        return "Hetero"
    elif genotype in ("1/1", "0/0" ,"1|1", "0|0"):
        return "Homo"
    return ""


def _format_vaf_germline(fraction, total_depth, germline_val):
    frac = clean(fraction)
    try:
        frac_str = f"{float(frac):.3f}"
    except (ValueError, TypeError):
        frac_str = frac
    depth    = clean(total_depth)
    zygosity = _parse_zygosity_germline(germline_val)
    line1 = f"{frac_str} ({depth})" if depth else frac_str
    return "\n".join(x for x in [line1, zygosity] if x)


def _extract_rs_id(existing_variation):
    ev = clean(existing_variation)
    if not ev:
        return ""
    ids = [x.strip() for x in ev.split(",")]
    rs_ids = [x for x in ids if x.lower().startswith("rs")]
    return rs_ids[0] if rs_ids else ""


def extract_germline_sheet(ws, sheet_name: str, filter_source: bool) -> list:
    rows = list(ws.iter_rows(values_only=True))
    if len(rows) < 2:
        return []
    headers = rows[0]

    sym_idx   = find_col(headers, "SYMBOL")
    nm_idx    = find_col(headers, "MANE_SELECT")
    chrom_idx = find_col(headers, "CHROM")
    exon_idx  = find_col(headers, "EXON")
    hgvsc_idx = find_col(headers, "HGVSc")
    hgvsp_idx = find_col(headers, "HGVSp")
    frac_idx  = find_col(headers, "Tumor_Allele_Fraction(alt_allele/total_genotype_depth)")
    dep_idx   = find_col(headers, "Tumor_Total_Genotype_Depth")
    germ_idx  = find_col(headers, "Germline", "Germline_X", "GERMLINE")
    cons_idx  = find_col(headers, "Consequence", "CONSEQUENCE")
    clin_idx  = find_col(headers, "CLIN_SIG")
    ev_idx    = find_col(headers, "Existing_variation", "EXISTING_VARIATION")
    ss_idx    = find_col(headers, "SOURCE_SHEET")

    def g(row, idx):
        return row[idx] if idx is not None and idx < len(row) else None

    display_name = SHEET_DISPLAY_NAMES.get(sheet_name, sheet_name)
    results = []
    for row in rows[1:]:
        if filter_source and clean(g(row, ss_idx)) != "CS_Pathogenic":
            continue
        symbol = clean(g(row, sym_idx))
        ev     = clean(g(row, ev_idx))
        if not symbol and not ev:
            continue
        results.append({
            "gene_nmid":      _format_gene_nmid(symbol, clean(g(row, nm_idx))),
            "chr_exon":       _format_chr_exon(clean(g(row, chrom_idx)), clean(g(row, exon_idx))),
            "coding":         _format_coding(clean(g(row, hgvsc_idx)), clean(g(row, hgvsp_idx))),
            "vaf":            _format_vaf_germline(clean(g(row, frac_idx)), clean(g(row, dep_idx)), clean(g(row, germ_idx))),
            "consequence":    clean(g(row, cons_idx)).replace("_", " "),
            "classification": clean(g(row, clin_idx)),
            "rs_id":          _extract_rs_id(clean(g(row, ev_idx))),
            "source":         display_name,
        })
    return results


def load_germline_variants(xl_path: str) -> list:
    wb = openpyxl.load_workbook(xl_path, data_only=True)
    all_rows = []
    seen_rs  = set()

    if CS_PATHOGENIC_SHEET in wb.sheetnames:
        rows = extract_germline_sheet(wb[CS_PATHOGENIC_SHEET], CS_PATHOGENIC_SHEET, filter_source=False)
        print(f"    [CS_Pathogenic] {len(rows)} variants")
        all_rows.extend(rows)
    else:
        print(f"    [skip] CS_Pathogenic — not found")

    for sheet_name in DISEASE_SHEETS:
        if sheet_name not in wb.sheetnames:
            print(f"    [skip] {sheet_name} — not found")
            continue
        rows = extract_germline_sheet(wb[sheet_name], sheet_name, filter_source=True)
        print(f"    [{sheet_name}] {len(rows)} CS_Pathogenic rows")
        all_rows.extend(rows)

    deduped = []
    for row in all_rows:
        rs = row["rs_id"]
        if rs and rs in seen_rs:
            continue
        if rs:
            seen_rs.add(rs)
        deduped.append(row)

    removed = len(all_rows) - len(deduped)
    if removed:
        print(f"    [dedup] Removed {removed} duplicate rsID row(s)")

    return deduped


# ─────────────────────────────────────────────────────────────────────────────
# GERMLINE — DOCX writer
# ─────────────────────────────────────────────────────────────────────────────

G_COL_GENE        = 0
G_COL_CHR_EXON    = 1
G_COL_CODING      = 2
G_COL_VAF         = 3
G_COL_CONSEQUENCE = 4
G_COL_CLASS       = 5
G_COL_RSID        = 6
G_COL_SOURCE      = 7


def _add_germline_row(table, template_data_tr, template_annot_tr, variant: dict):
    # data row
    new_data_tr = copy.deepcopy(template_data_tr)
    table._tbl.append(new_data_tr)
    data_row = table.rows[-1]
    _prevent_row_break(data_row)
    _set_keep_next(data_row)

    cells = data_row.cells
    _set_cell_multiline(cells[G_COL_GENE],        variant["gene_nmid"])
    _set_cell_multiline(cells[G_COL_CHR_EXON],    variant["chr_exon"])
    _set_cell_multiline(cells[G_COL_CODING],      variant["coding"])
    _set_cell_multiline(cells[G_COL_VAF],         variant["vaf"])
    _set_cell_multiline(cells[G_COL_CONSEQUENCE], variant["consequence"])
    _set_cell_multiline(cells[G_COL_CLASS],       variant["classification"])
    _set_cell_multiline(cells[G_COL_RSID],        variant["rs_id"])
    _set_cell_multiline(cells[G_COL_SOURCE],      variant["source"])

    # inference row — clone from template, leave empty
    new_annot_tr = copy.deepcopy(template_annot_tr)
    table._tbl.append(new_annot_tr)
    _prevent_row_break(table.rows[-1])


def fill_germline_table(doc, variants: list):
    table = find_table_by_label(doc, "Table 2")
    if table is None:
        print("  WARNING: Could not find Table 2 (Germline) — skipping.")
        return

    template_data_tr  = copy.deepcopy(table.rows[1]._tr)
    template_annot_tr = copy.deepcopy(table.rows[2]._tr)

    for row in table.rows[1:]:
        table._tbl.remove(row._tr)

    for v in variants:
        _add_germline_row(table, template_data_tr, template_annot_tr, v)

    print(f"  ✓ Germline table filled — {len(variants)} variants ({len(variants)*2} rows)")



# ─────────────────────────────────────────────────────────────────────────────
# SNP — extraction
# ─────────────────────────────────────────────────────────────────────────────

SNP_TRAIT_SHEETS = ["Cardiac", "Diabetes", "NDD", "ND", "Asthma"]


def load_snp_variants(trait_path: str, germline_path: str) -> list:
    """
    Step 1: For each sheet in trait_processed file, find row with highest
            Polygenic Risk Score → take Mapped ID (rsID) and Trait.
    Step 2: Look up each rsID in germline Variations sheet →
            extract row data for the 7 SNP table columns.
    Returns list of dicts with variant data + trait for inference row.
    """
    # ── Step 1: get top rsID + Trait per sheet ──────────────────────────────
    wb_trait = openpyxl.load_workbook(trait_path, data_only=True)
    top_entries = []   # list of {sheet, rs_id, trait}

    for sname in SNP_TRAIT_SHEETS:
        if sname not in wb_trait.sheetnames:
            print(f"    [skip] {sname} — not in trait file")
            continue
        ws = wb_trait[sname]
        rows = list(ws.iter_rows(values_only=True))
        if len(rows) < 2:
            print(f"    [skip] {sname} — empty")
            continue
        headers = [str(h).strip() if h else "" for h in rows[0]]
        prs_idx = find_col(headers, "Polygenic Risk Score")
        mid_idx = find_col(headers, "Mapped ID")
        trait_idx = find_col(headers, "Trait")

        if prs_idx is None or mid_idx is None:
            print(f"    [skip] {sname} — missing Polygenic Risk Score or Mapped ID col")
            continue

        # find row with highest PRS
        best_row = None
        best_score = None
        for row in rows[1:]:
            try:
                score = float(row[prs_idx]) if row[prs_idx] is not None else None
            except (ValueError, TypeError):
                score = None
            if score is not None and (best_score is None or score > best_score):
                best_score = score
                best_row = row

        if best_row is None:
            print(f"    [skip] {sname} — no valid PRS rows")
            continue

        rs_id = clean(best_row[mid_idx])
        trait = clean(best_row[trait_idx]) if trait_idx is not None else ""
        print(f"    [{sname}] top rsID={rs_id}, PRS={best_score:.4f}, Trait={repr(trait)}")
        top_entries.append({"sheet": sname, "rs_id": rs_id, "trait": trait})

    # ── Step 2: look up each rsID in germline Variations sheet ──────────────
    wb_germ = openpyxl.load_workbook(germline_path, data_only=True)
    if "Variations" not in wb_germ.sheetnames:
        print("    [skip] Variations sheet not found in germline file")
        return []

    ws_var = wb_germ["Variations"]
    var_rows = list(ws_var.iter_rows(values_only=True))
    if len(var_rows) < 2:
        print("    [skip] Variations sheet is empty")
        return []

    var_headers = var_rows[0]
    ev_idx    = find_col(var_headers, "Existing_variation", "EXISTING_VARIATION")
    sym_idx   = find_col(var_headers, "SYMBOL")
    nm_idx    = find_col(var_headers, "MANE_SELECT")
    chrom_idx = find_col(var_headers, "CHROM")
    exon_idx  = find_col(var_headers, "EXON")
    hgvsc_idx = find_col(var_headers, "HGVSc")
    hgvsp_idx = find_col(var_headers, "HGVSp")
    frac_idx  = find_col(var_headers, "Tumor_Allele_Fraction(alt_allele/total_genotype_depth)")
    dep_idx   = find_col(var_headers, "Tumor_Total_Genotype_Depth")
    germ_idx  = find_col(var_headers, "Germline", "Germline_X", "GERMLINE")
    cons_idx  = find_col(var_headers, "Consequence", "CONSEQUENCE")
    clin_idx  = find_col(var_headers, "CLIN_SIG")

    def g(row, idx):
        return row[idx] if idx is not None and idx < len(row) else None

    # build lookup: rs_id → first matching row
    var_lookup = {}
    for row in var_rows[1:]:
        ev = clean(g(row, ev_idx))
        if not ev:
            continue
        for part in ev.split(","):
            part = part.strip()
            if part.lower().startswith("rs") and part not in var_lookup:
                var_lookup[part] = row

    results = []
    for entry in top_entries:
        rs_id = entry["rs_id"]
        trait = entry["trait"]

        row = var_lookup.get(rs_id)
        if row is None:
            print(f"    [not found] {rs_id} not in Variations sheet — inserting empty row")
            results.append({
                "gene_nmid":      "",
                "chr_exon":       "",
                "coding":         "",
                "vaf":            "",
                "consequence":    "",
                "classification": "",
                "rs_id":          rs_id,
                "trait":          trait,
            })
            continue

        results.append({
            "gene_nmid":      _format_gene_nmid(clean(g(row, sym_idx)), clean(g(row, nm_idx))),
            "chr_exon":       _format_chr_exon(clean(g(row, chrom_idx)), clean(g(row, exon_idx))),
            "coding":         _format_coding(clean(g(row, hgvsc_idx)), clean(g(row, hgvsp_idx))),
            "vaf":            _format_vaf_germline(
                                  clean(g(row, frac_idx)),
                                  clean(g(row, dep_idx)),
                                  clean(g(row, germ_idx)),
                              ),
            "consequence":    clean(g(row, cons_idx)).replace("_", " "),
            "classification": clean(g(row, clin_idx)),
            "rs_id":          rs_id,
            "trait":          trait,
        })

    return results


# ─────────────────────────────────────────────────────────────────────────────
# SNP — DOCX writer
# ─────────────────────────────────────────────────────────────────────────────

T_COL_GENE        = 0
T_COL_CHR_EXON    = 1
T_COL_CODING      = 2
T_COL_VAF         = 3
T_COL_CONSEQUENCE = 4
T_COL_CLASS       = 5
T_COL_RSID        = 6


def _add_snp_row(table, template_data_tr, template_annot_tr, variant: dict):
    """Add one data row + one inference row (filled with Trait)."""
    # data row
    new_data_tr = copy.deepcopy(template_data_tr)
    table._tbl.append(new_data_tr)
    data_row = table.rows[-1]
    _prevent_row_break(data_row)
    _set_keep_next(data_row)

    cells = data_row.cells
    _set_cell_multiline(cells[T_COL_GENE],        variant["gene_nmid"])
    _set_cell_multiline(cells[T_COL_CHR_EXON],    variant["chr_exon"])
    _set_cell_multiline(cells[T_COL_CODING],      variant["coding"])
    _set_cell_multiline(cells[T_COL_VAF],         variant["vaf"])
    _set_cell_multiline(cells[T_COL_CONSEQUENCE], variant["consequence"])
    _set_cell_multiline(cells[T_COL_CLASS],       variant["classification"])
    _set_cell_multiline(cells[T_COL_RSID],        variant["rs_id"])

    # inference row — fill Trait into the wide merged cell (tc[1], gridSpan=6)
    new_annot_tr = copy.deepcopy(template_annot_tr)
    table._tbl.append(new_annot_tr)
    annot_row = table.rows[-1]
    _prevent_row_break(annot_row)
    if variant["trait"]:
        NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
        tcs = new_annot_tr.findall(f"{{{NS}}}tc")
        # tc[0] = "Inference" label, tc[1] = wide merged cell → write Trait there
        if len(tcs) >= 2:
            from docx.table import _Cell 
            wide_cell = _Cell(tcs[1], annot_row)
            _set_cell_multiline(wide_cell, variant["trait"])


def fill_snp_table(doc, variants: list):
    table = find_table_by_label(doc, "Table 3")
    if table is None:
        print("  WARNING: Could not find Table 3 (SNP) — skipping.")
        return

    template_data_tr  = copy.deepcopy(table.rows[1]._tr)
    template_annot_tr = copy.deepcopy(table.rows[2]._tr)

    for row in table.rows[1:]:
        table._tbl.remove(row._tr)

    for v in variants:
        _add_snp_row(table, template_data_tr, template_annot_tr, v)

    print(f"  ✓ SNP table filled — {len(variants)} variants ({len(variants)*2} rows)")

# ─────────────────────────────────────────────────────────────────────────────
# Sample detection + unified runner
# ─────────────────────────────────────────────────────────────────────────────

def detect_samples(input_folder: Path):
    """
    Scan input/somatic/, input/germline/, input/snp/ folders.
    Returns dict: { sample_id: { 'somatic': Path, 'germline': Path, 'trait': Path } }
    """
    somatic_folder  = input_folder / "somatic"
    germline_folder = input_folder / "germline"
    snp_folder      = input_folder / "snp"

    samples = defaultdict(dict)

    if somatic_folder.is_dir():
        for f in sorted(somatic_folder.glob("*.xlsx")):
            if "Somatic_Results" in f.name:
                sid = sample_id_from_filename(f.name)
                samples[sid]["somatic"] = f

    if germline_folder.is_dir():
        for f in sorted(germline_folder.glob("*.xlsx")):
            if "Germline_Results" in f.name:
                sid = sample_id_from_filename(f.name)
                samples[sid]["germline"] = f

    if snp_folder.is_dir():
        for f in sorted(snp_folder.glob("*.xlsx")):
            if "trait_processed" in f.name:
                sid = sample_id_from_filename(f.name)
                samples[sid]["trait"] = f

    return dict(samples)


def process_sample(sample_id: str, files: dict, template_path: Path, output_folder: Path):
    print(f"\n{'─'*55}")
    print(f"  Sample: {sample_id}")

    somatic_path  = files.get("somatic")
    germline_path = files.get("germline")
    trait_path    = files.get("trait")

    if not somatic_path and not germline_path and not trait_path:
        print("  WARNING: No files found — skipping.")
        return

    print(f"  Somatic  : {somatic_path.name if somatic_path else 'not found'}")
    print(f"  Germline : {germline_path.name if germline_path else 'not found'}")
    print(f"  Trait    : {trait_path.name if trait_path else 'not found'}")

    doc = Document(str(template_path))

    # ── Somatic ──
    if somatic_path:
        print(f"\n  Loading somatic variants...")
        somatic_variants = load_somatic_variants(str(somatic_path))
        print(f"  Total somatic variants: {len(somatic_variants)}")
        fill_somatic_table(doc, somatic_variants)
    else:
        print("  [skip] No somatic file for this sample")

    # ── Germline ──
    if germline_path:
        print(f"\n  Loading germline variants...")
        germline_variants = load_germline_variants(str(germline_path))
        print(f"  Total germline variants (after dedup): {len(germline_variants)}")
        fill_germline_table(doc, germline_variants)
    else:
        print("  [skip] No germline file for this sample")

    # ── SNP ──
    if trait_path and germline_path:
        print(f"\n  Loading SNP variants...")
        snp_variants = load_snp_variants(str(trait_path), str(germline_path))
        print(f"  Total SNP variants: {len(snp_variants)}")
        fill_snp_table(doc, snp_variants)
    elif trait_path and not germline_path:
        print("  [skip] SNP — trait file found but germline file missing for rsID lookup")
    else:
        print("  [skip] No trait file for this sample")

    out_path = output_folder / f"{sample_id}_Report.docx"
    doc.save(str(out_path))
    print(f"\n  ✓ Saved → {out_path}")


# ─────────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(description="TZAR Labs — Unified Variant Report Generator")
    p.add_argument("--input",    "-i", default=INPUT_FOLDER,  metavar="INPUT_FOLDER")
    p.add_argument("--template", "-t", default=TEMPLATE_FILE, metavar="TEMPLATE_DOCX")
    p.add_argument("--output",   "-o", default=OUTPUT_FOLDER, metavar="OUTPUT_FOLDER")
    return p.parse_args()


def main():
    args = parse_args()
    input_folder  = Path(args.input)
    output_folder = Path(args.output)
    template_file = Path(args.template)

    print(f"\n{'='*55}")
    print(f"  TZAR Labs — Unified Variant Report Generator")
    print(f"{'='*55}")
    print(f"\n  Input    : {input_folder}/somatic  +  {input_folder}/germline")
    print(f"  Template : {template_file}")
    print(f"  Output   : {output_folder}\n")

    if not input_folder.is_dir():
        sys.exit(f"ERROR: Input folder not found: {input_folder}")
    if not template_file.is_file():
        sys.exit(f"ERROR: Template not found: {template_file}")

    output_folder.mkdir(parents=True, exist_ok=True)

    samples = detect_samples(input_folder)
    if not samples:
        sys.exit("ERROR: No Somatic_Results or Germline_Results files found in input/somatic or input/germline")

    print(f"Detected {len(samples)} sample(s): {', '.join(sorted(samples.keys()))}")

    for sample_id in sorted(samples.keys()):
        process_sample(sample_id, samples[sample_id], template_file, output_folder)

    print(f"\n{'='*55}")
    print(f"  Done. Reports saved to: {output_folder}/")
    print(f"{'='*55}\n")


if __name__ == "__main__":
    main()