import os
import sys


PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)
import pandas as pd
from tqdm import tqdm
import datetime

from cancer_gene_3 import  load_disease_gene_sets ,apply_highlighting 

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(PROJECT_ROOT)

# ======================================================
# CONFIG
# ======================================================
from config import (
    GERMLINE_INPUT,
    GERMLINE_OUTPUT,
    CLINGEN_GERMLINE,
    GENE_LIST_FILE ,
    SHEET_NAME ,
)

os.makedirs(GERMLINE_OUTPUT, exist_ok=True)

# ======================================================
# LOGGING
# ======================================================
log_file = os.path.join(GERMLINE_OUTPUT, "processing_log.txt")
log = open(log_file, "a", encoding="utf-8")
log.write(f"\n\n==== Run on {datetime.datetime.now()} ====\n")

# ======================================================
# CLIN_SIG DEFINITIONS
# ======================================================
pathogenic_set = {"pathogenic", "likely_pathogenic", "pathogenic/likely_pathogenic"}
benign_set = {"benign", "likely_benign", "benign/likely_benign"}
uncertain_set = {"uncertain_significance"}

# ======================================================
# LOAD CLINGEN
# ======================================================
def load_clingen(csv_path):
    df = pd.read_csv(csv_path, dtype=str)
    df.columns = df.columns.str.strip()

    if "C.dot" not in df.columns:
        raise ValueError("ClinGen CSV missing required column: C.dot")

    df["C.dot"] = df["C.dot"].astype(str).str.strip()
    return df


clingen_df = load_clingen(CLINGEN_GERMLINE)
print(f"✔ ClinGen loaded: {clingen_df.shape[0]} rows")

# ======================================================
# LOAD HEREDITARY GENES
# ======================================================
hereditary_genes = load_genes(GENE_LIST_FILE)

disease_gene_sets = load_disease_gene_sets(GENE_LIST_FILE)
print(f"✔ Disease gene sets loaded: {len(disease_gene_sets)}")
print(f"✔ Hereditary genes loaded: {len(hereditary_genes)}")




# ======================================================
# HELPER
# ======================================================
def extract_cdna(hgvsc):
    if pd.isna(hgvsc):
        return None

    s = str(hgvsc)
    start = s.find("c.")

    if start == -1:
        return None

    end = s.find("(", start)
    return s[start:end].strip() if end != -1 else s[start:].strip()

# ======================================================
# PROCESS ONE FILE
# ======================================================
def process_one_file(input_path, output_path, clingen_df):

    try:
        df_var = pd.read_excel(input_path, sheet_name=SHEET_NAME, dtype=str)
    except Exception:
        log.write(f"Skipped {SHEET_NAME} sheet missing)\n")
        return

    # ------------------------------
    # COLUMN VALIDATION
    # ------------------------------
    if "CLIN_SIG" not in df_var.columns:
        log.write("Skipped (CLIN_SIG missing)\n")
        return

    if "HGVSc" not in df_var.columns:
        log.write("Skipped (HGVSc missing)\n")
        return

    # ------------------------------
    # CLINVAR CLASSIFICATION
    # ------------------------------
    cs_norm = (
        df_var["CLIN_SIG"]
        .fillna("")
        .str.lower()
        .str.replace(" ", "")
    )

    path_mask = cs_norm.isin(pathogenic_set)
    benign_mask = cs_norm.isin(benign_set)
    uncertain_mask = cs_norm.isin(uncertain_set)

    df_path = df_var[path_mask]
    df_ben = df_var[benign_mask]
    df_unc = df_var[uncertain_mask]
    df_oth = df_var[~(path_mask | benign_mask | uncertain_mask)]

    # ------------------------------
    # CLINGEN MATCH
    # ------------------------------
    df_var["EXTRACTED_CDNA"] = (
        df_var["HGVSc"]
        .apply(extract_cdna)
        .astype(str)
        .str.strip()
    )

    matched = df_var.merge(
        clingen_df,
        left_on="EXTRACTED_CDNA",
        right_on="C.dot",
        how="inner"
    )

    unmatched = df_var[
        ~df_var["EXTRACTED_CDNA"].isin(matched["EXTRACTED_CDNA"])
    ]

    # ------------------------------
    # WRITE OUTPUT
    # ------------------------------
    xls = pd.ExcelFile(input_path)

    with pd.ExcelWriter(output_path, engine="openpyxl") as writer:

        # Copy original sheets
        for sheet in xls.sheet_names:
            xls.parse(sheet).to_excel(writer, sheet_name=sheet, index=False)

        # ClinVar outputs
        df_path.to_excel(writer, sheet_name="CS_Pathogenic", index=False)
        df_ben.to_excel(writer, sheet_name="benign", index=False)
        df_unc.to_excel(writer, sheet_name="uncertain_significance", index=False)
        df_oth.to_excel(writer, sheet_name="Others", index=False)

        # ClinGen outputs
        matched.to_excel(writer, sheet_name="ClinGen_Matched", index=False)
        unmatched.to_excel(writer, sheet_name="ClinGen_Unmatched", index=False)

        # Highlighting
        apply_highlighting(writer, hereditary_genes, disease_gene_sets)

# ======================================================
# MAIN LOOP
# ======================================================
def main():

    files = [
        f for f in os.listdir(GERMLINE_INPUT)
        if f.lower().endswith(".xlsx")
    ]

    if not files:
        print("⚠ No input files found")
        return

    for f in tqdm(files, desc="Processing files"):

        inp = os.path.join(GERMLINE_INPUT, f)
        out = os.path.join(
            GERMLINE_OUTPUT,
            f.replace(".xlsx", "_FINAL.xlsx")
        )

        log.write(f"\nProcessing {f}\n")

        process_one_file(inp, out, clingen_df)

        log.write("Done\n")

    log.close()

    print("✔ ALL FILES PROCESSED")


if __name__ == "__main__":
    main()