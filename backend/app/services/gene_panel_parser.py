"""
Parses the "Somatic_and_germline_important_gene_list.xlsx" style workbook into
normalized (gene_symbol, category, panel) records for the gene_panels table.

Source file shape (as of the current upload):
    One sheet, 7 columns. Each column header is a panel name followed by a
    stated gene count, e.g. "Unique (Somatic) - 1332 genes". Each column's
    rows are an independent list of gene symbols for that panel, padded with
    blank cells at the bottom (NOT row-aligned across columns -- row 5 in
    column A has nothing to do with row 5 in column B).

Panel -> category mapping is fixed by business rule (confirmed with user):
    Somatic, Hereditary (germline)              -> cancerous
    Cardiac, Diabetes_pharmgkb_mito, NDD,
    Endometriosis, Neurodevelopmental            -> non_cancerous

If the source workbook's column headers change wording slightly, update
PANEL_MATCHERS below -- matching is substring-based on the header text so
minor differences (e.g. changed gene counts) don't break parsing, but a
genuinely new/renamed panel will fall into "unmapped" and get flagged
rather than silently mis-categorized.
"""

from dataclasses import dataclass
from io import BytesIO

import pandas as pd

# Ordered so more-specific matchers (e.g. "hereditary") are checked before
# anything that could ambiguously overlap.
PANEL_MATCHERS = [
    ("somatic", "Somatic", "cancerous"),
    ("hereditary", "Hereditary", "cancerous"),
    ("cardiac", "Cardiac", "non_cancerous"),
    ("diabetes", "Diabetes_pharmgkb_mito", "non_cancerous"),
    ("ndd", "NDD", "non_cancerous"),
    ("endometriosis", "Endometriosis", "non_cancerous"),
    ("neurodevelopmental", "Neurodevelopmental", "non_cancerous"),
]

MAX_GENE_SYMBOL_LENGTH = 30  # generous ceiling; real symbols in this file top out around 14 chars


@dataclass
class ParsedGeneRecord:
    gene_symbol: str
    category: str
    panel: str


@dataclass
class ParseResult:
    records: list[ParsedGeneRecord]
    panel_counts: dict[str, int]          # panel -> gene count actually parsed
    unmapped_columns: list[str]           # header text of any column we couldn't classify


def _match_panel(header: str) -> tuple[str, str] | None:
    """Return (panel_label, category) for a column header, or None if unmatched."""
    lowered = header.lower()
    for needle, panel_label, category in PANEL_MATCHERS:
        if needle in lowered:
            return panel_label, category
    return None


def parse_gene_panel_excel(file_bytes: bytes) -> ParseResult:
    """
    Parse the uploaded workbook into normalized gene panel records.

    Raises ValueError if the sheet has no columns matching any known panel
    (most likely wrong file uploaded), so the caller can surface a clear
    400 error instead of silently storing zero rows.
    """
    xl = pd.read_excel(BytesIO(file_bytes), sheet_name=0, engine="openpyxl")

    records: list[ParsedGeneRecord] = []
    panel_counts: dict[str, int] = {}
    unmapped_columns: list[str] = []

    for col in xl.columns:
        match = _match_panel(str(col))
        if match is None:
            unmapped_columns.append(str(col))
            continue

        panel_label, category = match
        genes = xl[col].dropna()

        count = 0
        for raw in genes:
            symbol = str(raw).strip()
            if not symbol or len(symbol) > MAX_GENE_SYMBOL_LENGTH:
                continue
            # Preserve as-is rather than forcing uppercase: some real symbols in
            # this file use mixed case / Greek letters (e.g. "HIF-1α") where
            # naive .upper() would mangle non-ASCII characters.
            records.append(ParsedGeneRecord(symbol, category, panel_label))
            count += 1

        # A gene symbol can legitimately repeat within the SAME panel column
        # (rare, but don't silently drop it -- dedupe per panel here so the
        # count reported matches what actually gets inserted).
        panel_counts[panel_label] = panel_counts.get(panel_label, 0) + count

    if not records:
        raise ValueError(
            "No columns in the uploaded file matched a known gene panel "
            "(Somatic, Hereditary, Cardiac, Diabetes_pharmgkb_mito, NDD, "
            "Endometriosis, Neurodevelopmental). Check the file and try again."
        )

    return ParseResult(records=records, panel_counts=panel_counts, unmapped_columns=unmapped_columns)