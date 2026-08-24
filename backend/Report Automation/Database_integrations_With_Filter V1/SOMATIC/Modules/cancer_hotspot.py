import pandas as pd
import os
from Modules.liftover_utils import normalize_loc

def run(df_lifted: pd.DataFrame, db_dir: str):
    """
    df_lifted : liftover-processed dataframe (hg19)
    db_dir    : Databases/Cancer_hotspot/
    """

    if df_lifted is None or df_lifted.empty:
        return pd.DataFrame()

    # Find CSV inside folder
    csv_files = [
        f for f in os.listdir(db_dir)
        if f.lower().endswith(".csv")
    ]

    if not csv_files:
        return pd.DataFrame()

    hotspot_path = os.path.join(db_dir, csv_files[0])
    hotspot_df = pd.read_csv(hotspot_path)

    if "Location" not in hotspot_df.columns:
        return pd.DataFrame()

    df = df_lifted.copy()
    df["New_Location_norm"] = df["New_Location"].apply(normalize_loc)
    hotspot_df["Location_norm"] = hotspot_df["Location"].apply(normalize_loc)

    merged = pd.merge(
        df,
        hotspot_df,
        left_on="New_Location_norm",
        right_on="Location_norm",
        how="inner"
    )

    return merged
