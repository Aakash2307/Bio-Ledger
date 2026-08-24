import os
import pandas as pd
from Modules.liftover_utils import normalize_loc


def run_and_write(df_lifted, civic_dir, writer):
    """
    Runs all CIViC database integrations and writes the matched results
    to separate sheets in the output workbook.

    A blank separator column is inserted between the sample columns
    and the CIViC database columns.
    """

    df = df_lifted.copy()
    df["New_Location_norm"] = df["New_Location"].apply(normalize_loc)

    civic_files = {
        "Civic_accepted_and_submitted": "accepted_and_submitted.xlsx",
        "Civic_Amplification": "Amplification(ass+cliEve+molecular_profile+var_summary).xlsx",
        "Civic_SNP": "SNP(cliEve+molecularProfile+var_summary+assertions).xlsx",
    }

    for sheet_name, fname in civic_files.items():
        path = os.path.join(civic_dir, fname)

        if not os.path.exists(path):
            pd.DataFrame().to_excel(
                writer,
                sheet_name=sheet_name[:31],
                index=False
            )
            continue

        civic_df = pd.read_excel(path, engine="openpyxl")

        if "Location" not in civic_df.columns:
            pd.DataFrame().to_excel(
                writer,
                sheet_name=sheet_name[:31],
                index=False
            )
            continue

        civic_df["Location_norm"] = civic_df["Location"].apply(normalize_loc)

        merged = pd.merge(
            df,
            civic_df,
            left_on="New_Location_norm",
            right_on="Location_norm",
            how="inner"
        )

        # Insert blank separator column before database columns
        first_db_col = civic_df.columns[0]
        insert_idx = merged.columns.get_loc(first_db_col)
        merged.insert(insert_idx, "", "")

        merged.to_excel(
            writer,
            sheet_name=sheet_name[:31],
            index=False
        )
