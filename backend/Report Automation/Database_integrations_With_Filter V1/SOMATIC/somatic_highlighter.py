import pandas as pd
from openpyxl import load_workbook
from openpyxl.styles import PatternFill


# ======================================================
# LOAD SOMATIC GENES
# ======================================================
def load_somatic_genes(file_path):

    df = pd.read_excel(file_path, dtype=str)
    df.columns = df.columns.str.strip()

    col_name = "Unique (Somatic) - 1332 genes"

    if col_name not in df.columns:
        raise ValueError(f"❌ Column '{col_name}' not found")

    return set(
        df[col_name]
        .dropna()
        .astype(str)
        .str.strip()
        .str.upper()
    )


# ======================================================
# SORT + HIGHLIGHT FILE
# ======================================================
def highlight_excel_file(file_path, gene_set):

    # -----------------------------------
    # STEP 1: LOAD ALL SHEETS
    # -----------------------------------
    xls = pd.ExcelFile(file_path)

    sheet_dfs = {}

    for sheet in xls.sheet_names:

        df = pd.read_excel(file_path, sheet_name=sheet, dtype=str).fillna("")
        cols = df.columns.tolist()

        symbol_cols = [c for c in cols if c in ["SYMBOL", "SYMBOL_X"]]

        if not symbol_cols:
            sheet_dfs[sheet] = df
            continue

        # -----------------------------------
        # MATCH FLAG
        # -----------------------------------
        def check_row(row):
            for col in symbol_cols:
                gene = str(row[col]).strip().upper()
                if gene in gene_set:
                    return True
            return False

        df["_MATCH"] = df.apply(check_row, axis=1)

        df = df.sort_values(by="_MATCH", ascending=False)

        sheet_dfs[sheet] = df.drop(columns="_MATCH")

    # -----------------------------------
    # STEP 2: WRITE BACK
    # -----------------------------------
    with pd.ExcelWriter(file_path, engine="openpyxl", mode="w") as writer:
        for sheet, df in sheet_dfs.items():
            df.to_excel(writer, sheet_name=sheet, index=False)

    # -----------------------------------
    # STEP 3: APPLY HIGHLIGHTING
    # -----------------------------------
    wb = load_workbook(file_path)
    red = PatternFill(start_color="FFC7CE", end_color="FFC7CE", fill_type="solid")

    for sheet_name in wb.sheetnames:

        ws = wb[sheet_name]

        # ✅ Fix: skip empty sheets
        if ws.max_row < 1:
            continue

        header = [cell.value for cell in ws[1]]

        symbol_cols = []
        if "SYMBOL" in header:
            symbol_cols.append(header.index("SYMBOL") + 1)
        if "SYMBOL_X" in header:
            symbol_cols.append(header.index("SYMBOL_X") + 1)

        if not symbol_cols:
            continue

        for row in ws.iter_rows(min_row=2, max_row=ws.max_row):

            match = False

            for col_idx in symbol_cols:
                val = ws.cell(row=row[0].row, column=col_idx).value
                gene = str(val).strip().upper() if val else ""

                if gene in gene_set:
                    match = True
                    break

            if match:
                for cell in row:
                    cell.fill = red

    wb.save(file_path)