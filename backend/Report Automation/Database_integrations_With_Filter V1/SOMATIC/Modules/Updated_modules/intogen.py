import pandas as pd
import os
from os import listdir

INTOGEN_COL = "Intogen"

def normalize_columns(df):
    df = df.copy()
    df.columns = (
        df.columns.astype(str)
        .str.strip()
        .str.replace("\xa0", "", regex=False)
    )
    return df

def normalize_chrom(c):
    return str(c).replace("chr", "").strip()

def build_map(df):
    df = df.copy()
    df["CHROM"] = df["CHROM"].apply(normalize_chrom)
    df["map"] = (
        df["CHROM"].astype(str) + ":" +
        df["POS"].astype(str) + ":" +
        df["REF"].astype(str) + ":" +
        df["ALT"].astype(str)
    )
    return df

def run(input_df: pd.DataFrame, db_path: str) -> pd.DataFrame:
    """
    db_path = Databases/intogen/  (folder of CSVs)
    """

    df = normalize_columns(input_df)

    required = {"CHROM", "POS", "REF", "ALT"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    df = build_map(df)

    intogen_hits = {}

    for fname in listdir(db_path):
        if not fname.endswith(".csv"):
            continue

        organ = fname.replace(".csv", "").strip()
        t_df = pd.read_csv(os.path.join(db_path, fname), dtype=str)

        if not {"Mut", "REF", "ALT"}.issubset(t_df.columns):
            continue

        t_df["Mut"] = t_df["Mut"].astype(str).str.replace("chr", "", regex=False)
        t_df["map"] = (
            t_df["Mut"].astype(str) + ":" +
            t_df["REF"].astype(str) + ":" +
            t_df["ALT"].astype(str)
        )

        matched = set(df["map"]).intersection(set(t_df["map"]))
        for m in matched:
            intogen_hits.setdefault(m, set()).add(organ)

    df[INTOGEN_COL] = df["map"].map(
        lambda m: ";".join(sorted(intogen_hits[m])) if m in intogen_hits else ""
    )

    # 🔥 Preserve OLD behavior
    df = df[df[INTOGEN_COL] != ""].copy()

    cols = [c for c in df.columns if c not in ("map", INTOGEN_COL)] + [INTOGEN_COL]
    df = df[cols]

    df["source_database"] = "IntOGen"

    return df
