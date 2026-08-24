import pandas as pd

DATABASE_COL = "Three letter code"


def load_oncokb_db(db_path: str):
    oncokb_df = pd.read_csv(db_path, dtype=str)
    oncokb_df.columns = oncokb_df.columns.str.strip()

    if DATABASE_COL not in oncokb_df.columns:
        raise ValueError(f"Missing '{DATABASE_COL}' in OncoKB DB")

    return oncokb_df.to_dict(orient="records")


def match_oncokb_row(hgvsp: str, oncokb_records: list):
    for row in oncokb_records:
        if row[DATABASE_COL] and row[DATABASE_COL] in hgvsp:
            return row   # 🔒 FIRST MATCH ONLY
    return None


def run(input_df: pd.DataFrame, db_path: str) -> pd.DataFrame:
    required_cols = {"HGVSp", "Gene", "SYMBOL"}
    missing = required_cols - set(input_df.columns)
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    oncokb_records = load_oncokb_db(db_path)

    input_df = input_df.copy()
    input_df.columns = input_df.columns.str.strip()

    enriched_rows = []

    for _, som_row in input_df.iterrows():

        # 🔒 STRICT CHECK (UNCHANGED)
        if som_row["Gene"] != som_row["SYMBOL"]:
            continue

        hgvsp_value = str(som_row["HGVSp"])

        match = match_oncokb_row(hgvsp_value, oncokb_records)

        if match:
            combined = som_row.to_dict()
            combined.update(match)
            enriched_rows.append(combined)

    if not enriched_rows:
        return pd.DataFrame()

    out_df = pd.DataFrame(enriched_rows)

    # Insert blank separator column before database columns
    first_db_col = DATABASE_COL
    insert_idx = out_df.columns.get_loc(first_db_col)
    out_df.insert(insert_idx, "", "")

    out_df["source_database"] = "OncoKB"

    return out_df
