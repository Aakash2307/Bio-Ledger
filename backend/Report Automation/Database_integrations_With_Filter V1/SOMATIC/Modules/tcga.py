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

        merged.insert(0, "TCGA_Source", csv_path.stem)
        combined.append(merged)

    if not combined:
        return pd.DataFrame()

    return pd.concat(combined, ignore_index=True)
