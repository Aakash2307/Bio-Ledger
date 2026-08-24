# Modules/tcga.py

import pandas as pd
from pathlib import Path

LOCATION_COL = "Location"


def run(input_df: pd.DataFrame, db_path):
    """
    TCGA integration module
    Returns combined TCGA matches as a single DataFrame
    """

    db_dir = Path(db_path)

    if LOCATION_COL not in input_df.columns:
        return pd.DataFrame()

    combined = []

    for csv_path in sorted(db_dir.glob("*.csv")):
        try:
            tcga_df = pd.read_csv(csv_path, low_memory=False)
        except Exception:
            continue

        if LOCATION_COL not in tcga_df.columns:
            continue

        merged = pd.merge(
            input_df,
            tcga_df,
            on=LOCATION_COL,
            how="inner"
        )

        if merged.empty:
            continue

        # Insert blank separator column before database columns
        db_columns = list(tcga_df.columns)

        if len(db_columns) > 1:
            first_db_col = db_columns[1]  # Skip shared "Location" column
            insert_idx = merged.columns.get_loc(first_db_col)
            merged.insert(insert_idx, "", "")
        else:
            # If Location is the only column in the database
            insert_idx = merged.columns.get_loc(LOCATION_COL) + 1
            merged.insert(insert_idx, "", "")

        merged.insert(0, "TCGA_Source", csv_path.stem)
        combined.append(merged)

    if not combined:
        return pd.DataFrame()

    return pd.concat(combined, ignore_index=True)
