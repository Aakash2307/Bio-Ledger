#!/usr/bin/env python3
import pandas as pd

import os 
import sys


PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

SUMMARY_SHEET = "Run_Summary"



from config import (
    SHEET_NAME
)

def clean_columns(df):
    df.columns = df.columns.map(lambda x: str(x).strip())
    return df

# ---------------------------------------------
# Helper: update one column in Run_Summary
# ---------------------------------------------
def update_summary_column(excel_path, column_name, counts_dict):
    summary_df = pd.read_excel(excel_path, sheet_name=SUMMARY_SHEET)

    # Add new column at the end (E, F, G, ...)
    if column_name not in summary_df.columns:
        summary_df[column_name] = ""

    col_idx = summary_df.columns.get_loc(column_name)

    # Start from row 1 (skip Variations)
    for i in range(1, len(summary_df)):
        db = summary_df.iloc[i, 0]   # DATABASE column
        if db in counts_dict:
            summary_df.iat[i, col_idx] = counts_dict[db]

    with pd.ExcelWriter(
        excel_path,
        engine="openpyxl",
        mode="a",
        if_sheet_exists="replace"
    ) as writer:
        summary_df.to_excel(writer, sheet_name=SUMMARY_SHEET, index=False)


# =====================================================
# FILTER 1 — PHENOTYPE
# =====================================================
def apply_phenotype_filter(excel_path):
    print("   🔻 Filter 1: Phenotype ")

    PHENOTYPE_KEYWORDS = [
        "cancer", "tumor", "tumour",
        "sarcoma", "carcinoma",
        "neoplasm", "malignan"
    ]

    INVALID_VALUES = {"", "-", "na", "n/a", "null", "none"}

    xls = pd.ExcelFile(excel_path)
    updated = {}
    counts = {}
    pattern = "|".join(PHENOTYPE_KEYWORDS)

    for sheet in xls.sheet_names:
        if sheet == SUMMARY_SHEET and SHEET_NAME:
            continue

        df = pd.read_excel(excel_path, sheet_name=sheet, dtype=str)

        # robust column detection
        phen_cols = [
            c for c in df.columns
            if c.strip().lower() in ["phenotype", "phenotypes"]
        ]

        if phen_cols:
            colname = phen_cols[0]
            col = (
                df[colname]
                .astype(str)
                .str.strip()
                .str.lower()
            )

            invalid_mask = col.isin(INVALID_VALUES)
            cancer_mask = col.str.contains(pattern, na=False)

            # KEEP cancer OR invalid
            df = df[(invalid_mask | cancer_mask)]

        updated[sheet] = df
        counts[sheet] = len(df)

    # rewrite filtered sheets
    with pd.ExcelWriter(
        excel_path,
        engine="openpyxl",
        mode="a",
        if_sheet_exists="replace"
    ) as writer:
        for s, d in updated.items():
            d.to_excel(writer, sheet_name=s[:31], index=False)

    # update dashboard column
    update_summary_column(excel_path, "PHENOTYPES", counts)



# =====================================================
# FILTER 2 — CADD_PHRED > 20 (STRICT)
# =====================================================
def apply_cadd_filter(excel_path):
    print("   🔻 Filter 1: CADD_PHRED > 20")

    xls = pd.ExcelFile(excel_path)
    updated = {}
    counts = {}

    for sheet in xls.sheet_names:
        if sheet == SUMMARY_SHEET and SHEET_NAME:
            continue



        df = pd.read_excel(excel_path, sheet_name=sheet, dtype=str)

        if "CADD_PHRED" in df.columns:
            cadd = pd.to_numeric(df["CADD_PHRED"], errors="coerce")
            df = df[cadd > 20]   # STRICT >

        updated[sheet] = df
        counts[sheet] = len(df)

    with pd.ExcelWriter(
        excel_path,
        engine="openpyxl",
        mode="a",
        if_sheet_exists="replace"
    ) as writer:
        for s, d in updated.items():
            d.to_excel(writer, sheet_name=s[:31], index=False)

    update_summary_column(excel_path, "CADD_PHRED>20", counts)


# =====================================================
# FILTER 3 — Tumor AF <= 0.2 (STRICT)
# =====================================================
def apply_taf_filter(excel_path):
    print("   🔻 Filter 2: Tumor_AF<=0.38")

    TAF_COL = "TUMOR_ALLELE_FRACTION(ALT_ALLELE/TOTAL_GENOTYPE_DEPTH)"

    xls = pd.ExcelFile(excel_path)
    updated = {}
    counts = {}

    for sheet in xls.sheet_names:
        if sheet == SUMMARY_SHEET and SHEET_NAME:
            continue

        df = pd.read_excel(excel_path, sheet_name=sheet, dtype=str)

        if TAF_COL in df.columns:
            taf = pd.to_numeric(df[TAF_COL], errors="coerce")
            df = df[taf <= 0.38]   # STRICT >

        updated[sheet] = df
        counts[sheet] = len(df)

    with pd.ExcelWriter(
        excel_path,
        engine="openpyxl",
        mode="a",
        if_sheet_exists="replace"
    ) as writer:
        for s, d in updated.items():
            d.to_excel(writer, sheet_name=s[:31], index=False)

    update_summary_column(excel_path, "Tumor_AF<=0.38", counts)



def apply_population_filter(excel_path):
    print("   🔻 Filter 3 : AF Filter <= 0.001 (with missing values kept)")

    TARGET_COL = "AF"
    INVALID_VALUES = {"", "-", "na", "n/a", "null", "none"}

    xls = pd.ExcelFile(excel_path)
    updated = {}
    counts = {}

    for sheet in xls.sheet_names:
        if sheet == SUMMARY_SHEET:
            continue

        df = pd.read_excel(excel_path, sheet_name=sheet, dtype=str)

        # ✅ FIX: safe column normalization
        df = clean_columns(df)

        if TARGET_COL in df.columns:
            col_clean = df[TARGET_COL].astype(str).str.strip().str.lower()

            invalid_mask = col_clean.isin(INVALID_VALUES)
            af_numeric = pd.to_numeric(df[TARGET_COL], errors="coerce")
            valid_mask = af_numeric <= 0.001

            df = df[invalid_mask | valid_mask]

        else:
            print(f"⚠️ AF column missing in sheet: {sheet}")

        updated[sheet] = df
        counts[sheet] = len(df)

    with pd.ExcelWriter(
        excel_path,
        engine="openpyxl",
        mode="a",
        if_sheet_exists="replace"
    ) as writer:
        for s, d in updated.items():
            d.to_excel(writer, sheet_name=s[:31], index=False)

    update_summary_column(excel_path, "AF Filter <= 0.001", counts)

# =====================================================
# FUNNEL ORCHESTRATOR
# =====================================================
def run_all_filters(excel_path):
    print("\n🔽 STARTING POST-FILTER FUNNEL")

    # apply_phenotype_filter(excel_path)
    apply_cadd_filter(excel_path)
    apply_taf_filter(excel_path)
    apply_population_filter(excel_path)


    print("✅ ALL FILTERS APPLIED\n")
