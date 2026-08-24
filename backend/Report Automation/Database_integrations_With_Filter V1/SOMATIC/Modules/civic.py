

def run_and_write(df_lifted, civic_dir, writer):
    from Modules.liftover_utils import normalize_loc
    import os
    import pandas as pd

    df_lifted["New_Location_norm"] = df_lifted["New_Location"].apply(normalize_loc)

    civic_files = {
        "Civic_accepted_and_submitted": "accepted_and_submitted.xlsx",
        "Civic_Amplification": "Amplification(ass+cliEve+molecular_profile+var_summary).xlsx",
        "Civic_SNP": "SNP(cliEve+molecularProfile+var_summary+assertions).xlsx",
    }

    for sheet_name, fname in civic_files.items():
        path = os.path.join(civic_dir, fname)

        if not os.path.exists(path):
            pd.DataFrame().to_excel(writer, sheet_name=sheet_name[:31], index=False)
            continue

        civic_df = pd.read_excel(path, engine="openpyxl")
        if "Location" not in civic_df.columns:
            pd.DataFrame().to_excel(writer, sheet_name=sheet_name[:31], index=False)
            continue

        civic_df["Location_norm"] = civic_df["Location"].apply(normalize_loc)

        merged = pd.merge(
            df_lifted,
            civic_df,
            left_on="New_Location_norm",
            right_on="Location_norm",
            how="inner"
        )

        merged.to_excel(writer, sheet_name=sheet_name[:31], index=False)
