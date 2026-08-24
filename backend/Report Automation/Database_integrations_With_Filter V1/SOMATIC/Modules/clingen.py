import pandas as pd


def run(input_df: pd.DataFrame, db_path: str) -> pd.DataFrame:
    """
    C_DOT matching module

    Parameters
    ----------
    input_df : pd.DataFrame
        Variations dataframe containing HGVSc column

    db_path : str
        Path to Cingen_Somatic.csv database

    Returns
    -------
    pd.DataFrame
        Matched rows with metadata columns added
    """

    # ------------------------------------------------------
    # LOAD DATABASE
    # ------------------------------------------------------
    db_df = pd.read_csv(db_path, dtype=str)
    db_df.columns = db_df.columns.str.strip()

    if "c_dot" not in db_df.columns:
        raise ValueError("Missing 'c_dot' column in database")

    # keep only valid c_dot rows
    db_cdot = db_df[
        db_df["c_dot"].notna() &
        (db_df["c_dot"].str.strip() != "")
    ].copy()

    db_cdot["c_dot"] = db_cdot["c_dot"].str.strip()

    # ------------------------------------------------------
    # PREPARE SOMATIC DATA
    # ------------------------------------------------------
    somatic_df = input_df.copy()

    if "HGVSc" not in somatic_df.columns:
        raise ValueError("Missing 'HGVSc' column in input dataframe")

    somatic_df["HGVSc"] = somatic_df["HGVSc"].astype(str).str.strip()

    # ------------------------------------------------------
    # C_DOT MATCH
    # ------------------------------------------------------
    matches = somatic_df.merge(
        db_cdot,
        left_on="HGVSc",
        right_on="c_dot",
        how="inner"
    )

    if matches.empty:
        return matches

    # metadata for integration stage
    matches["match_type"] = "c_dot"
    matches["source_database"] = "ClinGen"

    return matches
