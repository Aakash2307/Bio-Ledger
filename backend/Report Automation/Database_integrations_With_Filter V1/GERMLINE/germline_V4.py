import os
import sys
import re


PROJECT_ROOT = os.path.dirname(
    os.path.dirname(os.path.abspath(__file__))
)

sys.path.insert(0, PROJECT_ROOT)

import pandas as pd
from tqdm import tqdm
import datetime

# ======================================================
# NEW DISEASE SHEET LOGIC
# ======================================================
from disease_generator import (
    load_disease_gene_sets,
    create_disease_sheets
)

PROJECT_ROOT = os.path.dirname(
    os.path.dirname(os.path.abspath(__file__))
)

sys.path.append(PROJECT_ROOT)

# ======================================================
# CONFIG
# ======================================================
from config import (
    GERMLINE_INPUT,
    GERMLINE_OUTPUT,
    CLINGEN_GERMLINE,
    GENE_LIST_FILE,
    SHEET_NAME,
)

os.makedirs(GERMLINE_OUTPUT, exist_ok=True)

# ======================================================
# LOGGING
# ======================================================
log_file = os.path.join(
    GERMLINE_OUTPUT,
    "processing_log.txt"
)

log = open(log_file, "a", encoding="utf-8")

log.write(
    f"\n\n==== Run on "
    f"{datetime.datetime.now()} ====\n"
)

# ======================================================
# CLIN_SIG DEFINITIONS
# ======================================================


allowed_pathogenic_terms = {
    "pathogenic",
    "likely_pathogenic"
}


def is_pathogenic(x):

    if not x or str(x).strip() in ("", "-"):
        return False

    x = (
        str(x)
        .lower()
        .strip()
    )

    # normalize spaces
    x = re.sub(r"\s+", "_", x)

    # split using comma or slash
    tokens = re.split(r"[,/]", x)

    tokens = [
        t.strip()
        for t in tokens
        if t.strip()
    ]

    if not tokens:
        return False

    # STRICT:
    # every token must be allowed
    return all(
        t in allowed_pathogenic_terms
        for t in tokens
    )


benign_set = {
   "benign",
    "likely_benign",
    "benign/likely_benign",
    "likely_benign/benign",          # reverse slash form
    "protective",                    # protective goes to benign sheet
}

def isbenign(x):
    # Return true  if every common separated token in x is a benign term
    if not x  or x.strip() in ("" , "-"):
        return False
    tokens = [t.strip() for t in x.split(",")]
    return len(tokens) > 0 and all (t in benign_set for t in tokens )

uncertain_set = {
    "uncertain_significance"
}

# ======================================================
# LOAD CLINGEN
# ======================================================
def load_clingen(csv_path):

    df = pd.read_csv(csv_path, dtype=str)

    df.columns = df.columns.str.strip()

    if "C.dot" not in df.columns:

        raise ValueError(
            "ClinGen CSV missing required column: C.dot"
        )

    df["C.dot"] = (
        df["C.dot"]
        .astype(str)
        .str.strip()
    )

    return df


clingen_df = load_clingen(CLINGEN_GERMLINE)

print(
    f"✔ ClinGen loaded: "
    f"{clingen_df.shape[0]} rows"
)

# ======================================================
# LOAD DISEASE GENE SETS
# ======================================================
disease_gene_sets = load_disease_gene_sets(
    GENE_LIST_FILE
)

print(
    f"✔ Disease gene sets loaded: "
    f"{len(disease_gene_sets)}"
)

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

    return (
        s[start:end].strip()
        if end != -1
        else s[start:].strip()
    )

# ======================================================
# PROCESS ONE FILE
# ======================================================
def process_one_file(
    input_path,
    output_path,
    clingen_df
):

    try:

        df_var = pd.read_excel(
            input_path,
            sheet_name=SHEET_NAME,
            dtype=str
        )

    except Exception:

        log.write(
            f"Skipped "
            f"{SHEET_NAME} sheet missing\n"
        )

        return

    # --------------------------------------------------
    # COLUMN VALIDATION
    # --------------------------------------------------
    if "CLIN_SIG" not in df_var.columns:

        log.write(
            "Skipped (CLIN_SIG missing)\n"
        )

        return

    if "HGVSc" not in df_var.columns:

        log.write(
            "Skipped (HGVSc missing)\n"
        )

        return

    # --------------------------------------------------
    # CLINVAR CLASSIFICATION
    # --------------------------------------------------
    cs_norm = (
        df_var["CLIN_SIG"]
        .fillna("")
        .str.lower()
        .str.replace(" ", "")
        .str.replace(" ", "_", regex=False)
        .str.replace(r"_+", "_", regex=True)
    )

    path_mask = cs_norm.apply(is_pathogenic)

    benign_mask = cs_norm.apply(isbenign)


    uncertain_mask = cs_norm.isin(uncertain_set)

    df_path = df_var[path_mask]

    df_ben = df_var[benign_mask]

    df_unc = df_var[uncertain_mask]

    df_oth = df_var[
        ~(path_mask | benign_mask | uncertain_mask)
    ]

    empty_mask = (
        df_oth["CLIN_SIG"]
        .fillna("")
        .astype(str)
        .str.strip()
        .isin(["", "-"])
    )

    df_oth = pd.concat(
        [
            df_oth[~empty_mask],
            df_oth[empty_mask]
        ],
        ignore_index=True
    )

    # --------------------------------------------------
    # CLINGEN MATCH
    # --------------------------------------------------

    # Extract cDNA from HGVSc
    df_var["EXTRACTED_CDNA"] = (
        df_var["HGVSc"]
        .apply(extract_cdna)
        .astype(str)
        .str.strip()
    )

    # ==================================================
    # INITIAL MERGE USING cDNA
    # ==================================================
    initial_matched = df_var.merge(
        clingen_df,
        left_on="EXTRACTED_CDNA",
        right_on="C.dot",
        how="inner"
    )

    # ==================================================
    # STEP 1:
    # VALIDATE EXTRACTED_CDNA == C.dot
    # ==================================================
    step1_mask = (
        initial_matched["EXTRACTED_CDNA"]
        .astype(str)
        .str.strip()
        ==
        initial_matched["C.dot"]
        .astype(str)
        .str.strip()
    )

    step1_matched = initial_matched[step1_mask]

    step1_unmatched = initial_matched[~step1_mask]

    # ==================================================
    # STEP 2:
    # VALIDATE SYMBOL == HGNC Gene Symbol
    # ==================================================
    step2_mask = (
        step1_matched["SYMBOL"]
        .astype(str)
        .str.strip()
        .str.upper()
        ==
        step1_matched["HGNC Gene Symbol"]
        .astype(str)
        .str.strip()
        .str.upper()
    )

    matched = step1_matched[step2_mask]

    step2_unmatched = step1_matched[~step2_mask]

    # ==================================================
    # ORIGINAL UNMATCHED
    # ==================================================
    original_unmatched = df_var[
        ~df_var["EXTRACTED_CDNA"].isin(
            initial_matched["EXTRACTED_CDNA"]
        )
    ]

    # ==================================================
    # FINAL UNMATCHED
    # ==================================================
    unmatched = pd.concat(
        [
            original_unmatched,
            step1_unmatched,
            step2_unmatched
        ],
        ignore_index=True
    )

    # --------------------------------------------------
    # WRITE OUTPUT
    # --------------------------------------------------
    xls = pd.ExcelFile(input_path)

    with pd.ExcelWriter(
        output_path,
        engine="openpyxl"
    ) as writer:

        # ==============================================
        # COPY ORIGINAL SHEETS
        # ==============================================
        for sheet in xls.sheet_names:

            xls.parse(sheet).to_excel(
                writer,
                sheet_name=sheet,
                index=False
            )

        # ==============================================
        # CLINVAR OUTPUTS
        # ==============================================
        df_path.to_excel(
            writer,
            sheet_name="CS_Pathogenic",
            index=False
        )

        df_ben.to_excel(
            writer,
            sheet_name="benign",
            index=False
        )

        df_unc.to_excel(
            writer,
            sheet_name="uncertain_significance",
            index=False
        )

        df_oth.to_excel(
            writer,
            sheet_name="Others",
            index=False
        )

        # ==============================================
        # CLINGEN OUTPUTS
        # ==============================================
        matched.to_excel(
            writer,
            sheet_name="ClinGen_Matched",
            index=False
        )

        unmatched.to_excel(
            writer,
            sheet_name="ClinGen_Unmatched",
            index=False
        )

        # ==============================================
        # CREATE DISEASE SHEETS
        # ==============================================
        create_disease_sheets(
            writer,
            disease_gene_sets
        )

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

    for f in tqdm(
        files,
        desc="Processing files"
    ):

        inp = os.path.join(
            GERMLINE_INPUT,
            f
        )

        out = os.path.join(
            GERMLINE_OUTPUT,
            f.replace(".xlsx", "_FINAL.xlsx")
        )

        log.write(
            f"\nProcessing {f}\n"
        )

        process_one_file(
            inp,
            out,
            clingen_df
        )

        log.write("Done\n")

    log.close()

    print("✔ ALL FILES PROCESSED")

# ======================================================
# ENTRY
# ======================================================
if __name__ == "__main__":
    main()
