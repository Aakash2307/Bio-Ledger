import os
import sys
import pandas as pd
from tqdm import tqdm
import datetime
from copy import copy

# ======================================================
# PROJECT ROOT
# ======================================================
PROJECT_ROOT = os.path.dirname(
    os.path.dirname(os.path.abspath(__file__))
)

sys.path.insert(0, PROJECT_ROOT)

# ======================================================
# IMPORTS
# ======================================================
from cancer_gene_3 import (
    load_disease_gene_sets,
    apply_highlighting
)

from config import (
    GERMLINE_INPUT,
    GERMLINE_OUTPUT,
    CLINGEN_GERMLINE,
    GENE_LIST_FILE,
    SHEET_NAME,
)

# ======================================================
# CREATE OUTPUT FOLDER
# ======================================================
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
    f"\n\n==================================================\n"
    f"RUN STARTED : {datetime.datetime.now()}\n"
    f"==================================================\n"
)

# ======================================================
# CLIN_SIG DEFINITIONS
# ======================================================
pathogenic_set = {
    "pathogenic",
    "likely_pathogenic",
    "pathogenic/likely_pathogenic"
}

benign_set = {
    "benign",
    "likely_benign",
    "benign/likely_benign"
}

uncertain_set = {
    "uncertain_significance"
}

# ======================================================
# LOAD CLINGEN
# ======================================================
def load_clingen(csv_path):

    log.write(
        f"[INFO] Loading ClinGen file : {csv_path}\n"
    )

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

    log.write(
        f"[INFO] ClinGen loaded successfully "
        f"({df.shape[0]} rows)\n"
    )

    return df


clingen_df = load_clingen(CLINGEN_GERMLINE)

print(f"✔ ClinGen loaded : {clingen_df.shape[0]} rows")

# ======================================================
# LOAD GENE SETS
# ======================================================
log.write(
    f"[INFO] Loading disease gene sets\n"
)

disease_gene_sets = load_disease_gene_sets(
    GENE_LIST_FILE
)

log.write(
    f"[INFO] Disease gene sets loaded : "
    f"{len(disease_gene_sets)} categories\n"
)

print(
    f"✔ Disease gene sets loaded : "
    f"{len(disease_gene_sets)}"
)

# ======================================================
# HELPER FUNCTION
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
# PROCESS SINGLE FILE
# ======================================================
def process_one_file(
    input_path,
    output_path,
    clingen_df
):

    file_name = os.path.basename(input_path)

    log.write(
        f"\n\n########################################\n"
        f"PROCESSING FILE : {file_name}\n"
        f"########################################\n"
    )

    # ==================================================
    # LOAD INPUT SHEET
    # ==================================================
    try:

        df_var = pd.read_excel(
            input_path,
            sheet_name=SHEET_NAME,
            dtype=str
        )

        log.write(
            f"[INFO] Loaded sheet '{SHEET_NAME}' "
            f"with {df_var.shape[0]} rows "
            f"and {df_var.shape[1]} columns\n"
        )

    except Exception as e:

        log.write(
            f"[ERROR] Failed to load sheet "
            f"'{SHEET_NAME}' : {str(e)}\n"
        )

        return

    # ==================================================
    # COLUMN VALIDATION
    # ==================================================
    required_cols = [
        "CLIN_SIG",
        "HGVSc"
    ]

    missing_cols = [
        c for c in required_cols
        if c not in df_var.columns
    ]

    if missing_cols:

        log.write(
            f"[ERROR] Missing required columns : "
            f"{missing_cols}\n"
        )

        return

    log.write(
        f"[INFO] Required columns validated\n"
    )

    # ==================================================
    # CLINVAR CLASSIFICATION
    # ==================================================
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

    df_oth = df_var[
        ~(path_mask | benign_mask | uncertain_mask)
    ]

    log.write(
        f"[INFO] Variant classification completed\n"
    )

    log.write(
        f"        Pathogenic             : {len(df_path)}\n"
    )

    log.write(
        f"        Benign                 : {len(df_ben)}\n"
    )

    log.write(
        f"        Uncertain              : {len(df_unc)}\n"
    )

    log.write(
        f"        Others                 : {len(df_oth)}\n"
    )

    # ==================================================
    # CLINGEN MATCH
    # ==================================================
    df_var["EXTRACTED_CDNA"] = (
        df_var["HGVSc"]
        .apply(extract_cdna)
        .astype(str)
        .str.strip()
    )

    log.write(
        f"[INFO] Extracted cDNA values\n"
    )

    matched = df_var.merge(
        clingen_df,
        left_on="EXTRACTED_CDNA",
        right_on="C.dot",
        how="inner"
    )

    unmatched = df_var[
        ~df_var["EXTRACTED_CDNA"].isin(
            matched["EXTRACTED_CDNA"]
        )
    ]

    log.write(
        f"[INFO] ClinGen matching completed\n"
    )

    log.write(
        f"        ClinGen Matched       : {len(matched)}\n"
    )

    log.write(
        f"        ClinGen Unmatched     : {len(unmatched)}\n"
    )

    # ==================================================
    # WRITE OUTPUT
    # ==================================================
    try:

        xls = pd.ExcelFile(input_path)

        log.write(
            f"[INFO] Workbook contains "
            f"{len(xls.sheet_names)} sheets\n"
        )

        with pd.ExcelWriter(
            output_path,
            engine="openpyxl"
        ) as writer:

            # ==========================================
            # COPY ORIGINAL SHEETS
            # ==========================================
            for sheet in xls.sheet_names:

                xls.parse(sheet).to_excel(
                    writer,
                    sheet_name=sheet,
                    index=False
                )

            log.write(
                f"[INFO] Original sheets copied\n"
            )

            # ==========================================
            # WRITE CLINVAR SHEETS
            # ==========================================
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

            log.write(
                f"[INFO] ClinVar sheets created\n"
            )

            # ==========================================
            # WRITE CLINGEN SHEETS
            # ==========================================
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

            log.write(
                f"[INFO] ClinGen sheets created\n"
            )

            # ==========================================
            # APPLY HIGHLIGHTING
            # ==========================================
            apply_highlighting(
                writer,
                disease_gene_sets
            )

            log.write(
                f"[INFO] Highlighting applied successfully\n"
            )

            # ==========================================
            # CREATE COLORED POU SHEET
            # ==========================================
            pou_sheets = [
                "CS_Pathogenic",
                "uncertain_significance",
                "Others"
            ]

            log.write(
                f"[INFO] Creating ordered colored POU sheet\n"
            )

            pou_ws = writer.book.create_sheet("POU")

            header_written = False

            pou_row = 1

            total_rows_added = 0

            for s in pou_sheets:

                if s not in writer.book.sheetnames:

                    log.write(
                        f"[WARNING] Missing sheet : {s}\n"
                    )

                    continue

                ws = writer.book[s]

                rows_added = 0

                # ======================================
                # GET HEADER
                # ======================================
                header = [
                    cell.value
                    for cell in ws[1]
                ]

                # FIND MATCH_SOURCE COLUMN
                try:

                    match_col_idx = (
                        header.index("MATCH_SOURCE") + 1
                    )

                except ValueError:

                    log.write(
                        f"[WARNING] MATCH_SOURCE "
                        f"missing in sheet : {s}\n"
                    )

                    continue

                # ======================================
                # WRITE HEADER ONCE
                # ======================================
                if not header_written:

                    new_header = (
                        header + ["SOURCE_SHEET"]
                    )

                    for col_num, val in enumerate(
                        new_header,
                        start=1
                    ):

                        pou_ws.cell(
                            row=pou_row,
                            column=col_num,
                            value=val
                        )

                    header_written = True

                    pou_row += 1

                # ======================================
                # ADD SECTION TITLE
                # ======================================
                pou_ws.cell(
                    row=pou_row,
                    column=1,
                    value=f"===== {s} ====="
                )

                pou_row += 1

                # ======================================
                # COPY MATCHED ROWS WITH COLORS
                # ======================================
                for row in ws.iter_rows(
                    min_row=2,
                    max_row=ws.max_row
                ):

                    match_value = ws.cell(
                        row=row[0].row,
                        column=match_col_idx
                    ).value

                    # SKIP UNMATCHED ROWS
                    if (
                        match_value is None
                        or str(match_value).strip() == ""
                    ):
                        continue

                    # COPY CELLS
                    for col_num, cell in enumerate(
                        row,
                        start=1
                    ):

                        new_cell = pou_ws.cell(
                            row=pou_row,
                            column=col_num,
                            value=cell.value
                        )

                        # COPY STYLE
                        if cell.has_style:

                            new_cell._style = copy(
                                cell._style
                            )

                    # ADD SOURCE SHEET
                    pou_ws.cell(
                        row=pou_row,
                        column=len(header) + 1,
                        value=s
                    )

                    pou_row += 1

                    rows_added += 1

                    total_rows_added += 1

                # EMPTY SPACING ROW
                pou_row += 1

                log.write(
                    f"[INFO] {s} -> "
                    f"{rows_added} rows copied to POU\n"
                )

            log.write(
                f"[INFO] Ordered colored POU sheet "
                f"created with {total_rows_added} rows\n"
            )

        log.write(
            f"[SUCCESS] Output saved : "
            f"{output_path}\n"
        )

    except Exception as e:

        log.write(
            f"[ERROR] Failed while writing "
            f"output : {str(e)}\n"
        )

        return

    log.write(
        f"[DONE] Finished processing "
        f"{file_name}\n"
    )

# ======================================================
# MAIN
# ======================================================
def main():

    files = [
        f for f in os.listdir(GERMLINE_INPUT)
        if f.lower().endswith(".xlsx")
    ]

    log.write(
        f"[INFO] Total input files found : "
        f"{len(files)}\n"
    )

    if not files:

        print("⚠ No input files found")

        log.write(
            f"[WARNING] No Excel files found\n"
        )

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

        process_one_file(
            inp,
            out,
            clingen_df
        )

    log.write(
        f"\n==================================================\n"
        f"RUN COMPLETED : {datetime.datetime.now()}\n"
        f"==================================================\n"
    )

    log.close()

    print("✔ ALL FILES PROCESSED")

# ======================================================
# ENTRY
# ======================================================
if __name__ == "__main__":
    main()
