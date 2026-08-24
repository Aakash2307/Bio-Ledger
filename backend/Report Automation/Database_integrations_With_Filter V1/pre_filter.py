#!/usr/bin/env python3
import os
import shutil
import pandas as pd

from config import GERMLINE_INPUT, SOMATIC_INPUT, SOMATIC_CLEAN_INPUT, SHEET_NAME

COLUMN_NAME = "Location"


# =========================
# Normalize location (chr2:123 → 2:123)
# =========================
def normalize_location(val):
    val = str(val).strip().lower()
    val = val.replace("chr", "")
    return val


# =========================
# Extract locations from column
# =========================
def extract_locations(series):
    locations = set()

    for val in series.dropna():
        val = normalize_location(val)
        if val:
            locations.add(val)

    return locations


# =========================
# Extract sample prefix (PD003 → PD0003)
# =========================
def get_sample_prefix(filename):
    prefix = filename.split("_")[0]

    if prefix.startswith("PD"):
        num = prefix[2:]
        if num.isdigit():
            return f"PD{int(num):04d}"

    return prefix


# =========================
# MAIN FUNCTION
# =========================
def filter_somatic_with_germline():
    print("\n🧬 Germline → Somatic filtering (Location-based)\n")

    os.makedirs(SOMATIC_CLEAN_INPUT, exist_ok=True)

    germ_files = [f for f in os.listdir(GERMLINE_INPUT) if f.endswith(".xlsx")]
    som_files = [f for f in os.listdir(SOMATIC_INPUT) if f.endswith(".xlsx")]

    print(f"📂 Germline files: {germ_files}")
    print(f"📂 Somatic files: {som_files}\n")

    # Map by sample prefix
    germ_map = {get_sample_prefix(f): f for f in germ_files}
    som_map = {get_sample_prefix(f): f for f in som_files}

    all_samples = sorted(set(germ_map.keys()) | set(som_map.keys()))

    for sample in all_samples:
        germ_file = germ_map.get(sample)
        som_file = som_map.get(sample)

        print(f"🔍 Sample: {sample}")

        # -------------------------
        # Case 1: Only somatic → COPY
        # -------------------------
        if som_file and not germ_file:
            print("⚠️ No germline file → copying somatic")
            src = os.path.join(SOMATIC_INPUT, som_file)
            dst = os.path.join(SOMATIC_CLEAN_INPUT, som_file)
            shutil.copy(src, dst)
            continue

        # -------------------------
        # Case 2: Only germline → SKIP
        # -------------------------
        if germ_file and not som_file:
            print("⚠️ No somatic file → skipping")
            continue

        # -------------------------
        # Case 3: BOTH exist → FILTER
        # -------------------------
        germ_path = os.path.join(GERMLINE_INPUT, germ_file)
        som_path = os.path.join(SOMATIC_INPUT, som_file)
        clean_path = os.path.join(SOMATIC_CLEAN_INPUT, som_file)

        try:
            germ_df = pd.read_excel(germ_path, sheet_name=SHEET_NAME, dtype=str).fillna("")
            som_df = pd.read_excel(som_path, sheet_name=SHEET_NAME, dtype=str).fillna("")
        except Exception as e:
            print(f"❌ Error reading files: {e}")
            continue

        if COLUMN_NAME not in germ_df.columns or COLUMN_NAME not in som_df.columns:
            print("❌ 'Location' column missing → copying somatic")
            shutil.copy(som_path, clean_path)
            continue

        # -------------------------
        # Extract germline locations
        # -------------------------
        germ_locations = extract_locations(germ_df[COLUMN_NAME])

        before_count = len(som_df)

        # -------------------------
        # Filter somatic
        # -------------------------
        def keep_row(val):
            val = normalize_location(val)
            return val not in germ_locations

        filtered_df = som_df[som_df[COLUMN_NAME].apply(keep_row)]
        after_count = len(filtered_df)

        print(f"📊 Before: {before_count} | After: {after_count} | Removed: {before_count - after_count}")

        # -------------------------
        # Save cleaned file
        # -------------------------
        with pd.ExcelWriter(clean_path, engine="openpyxl") as writer:
            filtered_df.to_excel(writer, sheet_name=SHEET_NAME, index=False)

    print("\n✅ Pre-filter completed\n")


# =========================
# RUN
# =========================
if __name__ == "__main__":
    filter_somatic_with_germline()
