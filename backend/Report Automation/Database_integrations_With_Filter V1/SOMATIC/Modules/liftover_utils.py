import subprocess
from pathlib import Path
import pandas as pd
import re



from config import SHEET_NAME

# =========================
# PATHS (PROJECT-SAFE)
# =========================

# liftover_utils.py → Modules/
# parents[1] = project root
BASE_DIR = Path(__file__).resolve().parents[1]

LIFTOVER_DIR = BASE_DIR / "Resources" / "liftover"
LIFTOVER_DIR.mkdir(parents=True, exist_ok=True)

LIFTOVER_BIN = LIFTOVER_DIR / "liftOver"
CHAIN_FILE = LIFTOVER_DIR / "hg38ToHg19.over.chain.gz"

INPUT_BED = LIFTOVER_DIR / "input.bed"
OUTPUT_BED = LIFTOVER_DIR / "output_hg19.bed"
UNMAPPED_BED = LIFTOVER_DIR / "unmapped.bed"


# =========================
# HELPERS
# =========================
_loc_re = re.compile(r"(chr[^:;\s]+)[:\s]*([0-9]+)")

def normalize_loc(s):
    if pd.isna(s):
        return ""
    s = str(s).strip()
    m = _loc_re.search(s)
    if m:
        return f"{m.group(1)}:{int(m.group(2))}"
    return s


def ensure_liftover_resources():
    if not LIFTOVER_BIN.exists():
        subprocess.run([
            "wget",
            "-O", str(LIFTOVER_BIN),
            "http://hgdownload.soe.ucsc.edu/admin/exe/linux.x86_64/liftOver"
        ], check=True)
        subprocess.run(["chmod", "+x", str(LIFTOVER_BIN)], check=True)

    if not CHAIN_FILE.exists():
        subprocess.run([
            "wget",
            "-O", str(CHAIN_FILE),
            "http://hgdownload.soe.ucsc.edu/goldenPath/hg38/liftOver/hg38ToHg19.over.chain.gz"
        ], check=True)


# =========================
# MAIN LIFTOVER
# =========================
def liftover_hg38_to_hg19(somatic_file: Path):
    """
    Input : Somatic Excel (hg38)
    Output: DataFrame with New_Location (hg19)
    """

    ensure_liftover_resources()

    df = pd.read_excel(
        somatic_file,
        sheet_name=SHEET_NAME,
        engine="openpyxl"
    ).reset_index(drop=True)

    if not {"CHROM", "POS"}.issubset(df.columns):
        raise ValueError("CHROM and POS columns required for liftover")

    # Build BED (0-based)
    bed = pd.DataFrame()
    bed["chrom"] = df["CHROM"].astype(str)
    bed.loc[~bed["chrom"].str.startswith("chr"), "chrom"] = \
        "chr" + bed["chrom"].astype(str)

    bed["start"] = df["POS"].astype(int) - 1
    bed["end"] = bed["start"] + 1
    bed["row_id"] = df.index

    bed.to_csv(INPUT_BED, sep="\t", header=False, index=False)

    subprocess.run([
        str(LIFTOVER_BIN),
        str(INPUT_BED),
        str(CHAIN_FILE),
        str(OUTPUT_BED),
        str(UNMAPPED_BED)
    ], check=True)

    mapped = pd.DataFrame(
        columns=["chrom_hg19", "start_hg19", "end_hg19", "row_id"]
    )

    if OUTPUT_BED.exists() and OUTPUT_BED.stat().st_size > 0:
        mapped = pd.read_csv(
            OUTPUT_BED,
            sep="\t",
            header=None,
            names=["chrom_hg19", "start_hg19", "end_hg19", "row_id"]
        )

    df["row_id"] = df.index
    df = df.merge(mapped, on="row_id", how="left")

    df["start_hg19"] = df["start_hg19"].astype("Int64") + 1

    df["New_Location"] = (
        df["chrom_hg19"].astype(str) + ":" +
        df["start_hg19"].astype(str)
    )

    df["New_Location"] = df["New_Location"].apply(normalize_loc)

    return df
