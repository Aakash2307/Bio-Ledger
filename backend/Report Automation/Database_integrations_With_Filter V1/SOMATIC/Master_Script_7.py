#!/usr/bin/env python3


import sys
import os

# 🔥 MUST be first
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

import pandas as pd

import importlib


from Modules.liftover_utils import liftover_hg38_to_hg19



# =====================================================
# CONFIG IMPORT
# =====================================================
from config import (
    SOMATIC_CLEAN_INPUT,
    SOMATIC_OUTPUT,
    SOMATIC_DB,
    SHEET_NAME
)

MODULE_DIR = "Modules"


os.makedirs(SOMATIC_OUTPUT, exist_ok=True)

# =====================================================
# DATABASE CONFIGURATION
# =====================================================
DATABASES = {
    "ClinGen": {
        "module": "clingen",
        "db_path": os.path.join(SOMATIC_DB, "Cingen_Somatic.csv"),
        "needs_liftover": False
    },
    "IntOGen": {
        "module": "intogen",
        "db_path": os.path.join(SOMATIC_DB, "Intogen 2023"),
        "needs_liftover": False
    },
    "OncoKB": {
        "module": "oncokb",
        "db_path": os.path.join(SOMATIC_DB, "OncoKB.csv"),
        "needs_liftover": False
    },
    "TCGA": {
        "module": "tcga",
        "db_path": os.path.join(SOMATIC_DB, "TCGA", "csv"),
        "needs_liftover": False
    },
    "Cancer_Hotspot": {
        "module": "cancer_hotspot",
        "db_path": os.path.join(SOMATIC_DB, "Cancer_hotspot"),
        "needs_liftover": True
    },
    "CIVIC": {
        "module": "civic",
        "db_path": os.path.join(SOMATIC_DB, "CIVIC"),
        "needs_liftover": True
    }
}

# =====================================================
# MAIN PIPELINE
# =====================================================
def run_pipeline():

    input_files = [
        f for f in os.listdir(SOMATIC_CLEAN_INPUT)
        if f.lower().endswith((".xlsx", ".xls"))
    ]

    if not input_files:
        raise RuntimeError("❌ No Excel files found in Input/somatic/")

    print("\n==============================")
    print("   SOMATIC MASTER STARTED     ")
    print("==============================\n")

    for file in input_files:

        input_path = os.path.join(SOMATIC_CLEAN_INPUT, file)
        sample_id = os.path.splitext(file)[0]
        sample_prefix = sample_id.split("_")[0]

        print(f"▶ Processing sample: {file}")

        sample_output_dir = os.path.join(SOMATIC_OUTPUT, sample_prefix)
        os.makedirs(sample_output_dir, exist_ok=True)

        # -------------------------------
        # LOAD INPUT
        # -------------------------------
        try:
            input_df = pd.read_excel(
                input_path,
                sheet_name=SHEET_NAME,
                dtype=str
            )
        except Exception as e:
            print(f"❌ Failed to read Variations sheet: {e}")
            continue

        # -------------------------------
        # LIFTOVER
        # -------------------------------
        try:
            df_lifted = liftover_hg38_to_hg19(input_path)
        except Exception as e:
            print(f"❌ Liftover failed: {e}")
            continue

        output_file = f"{sample_id}_Integrated.xlsx"
        output_path = os.path.join(sample_output_dir, output_file)

        with pd.ExcelWriter(output_path, engine="openpyxl") as writer:

            input_df.to_excel(writer, sheet_name=SHEET_NAME, index=False)

            for db_name, cfg in DATABASES.items():
                print(f"   ▶ Running {db_name}")

                try:
                    module = importlib.import_module(
                        f"{MODULE_DIR}.{cfg['module']}"
                    )

                    if db_name == "CIVIC":
                        module.run_and_write(df_lifted, cfg["db_path"], writer)
                        continue

                    if cfg["needs_liftover"]:
                        out_df = module.run(df_lifted, cfg["db_path"])
                    else:
                        out_df = module.run(input_df, cfg["db_path"])

                    if out_df is None or out_df.empty:
                        out_df = pd.DataFrame()

                    out_df.to_excel(
                        writer,
                        sheet_name=db_name[:31],
                        index=False
                    )

                except Exception as e:
                    print(f"      ❌ ERROR in {db_name}: {e}")

        # -------------------------------
        # RUN SUMMARY
        # -------------------------------
        xls = pd.ExcelFile(output_path)
        summary_rows = []

        for sheet in xls.sheet_names:
            df = pd.read_excel(output_path, sheet_name=sheet)
            summary_rows.append({
                "Database": sheet,
                "Matches": len(df)
            })

        summary_df = pd.DataFrame(summary_rows)

        with pd.ExcelWriter(
            output_path,
            engine="openpyxl",
            mode="a",
            if_sheet_exists="replace"
        ) as writer:
            summary_df.to_excel(
                writer,
                sheet_name="Run_Summary",
                index=False
            )

        print(f"✅ Output written: {output_path}\n")

    print("==============================")
    print("   🎉 ALL SAMPLES COMPLETED   ")
    print("==============================\n")


if __name__ == "__main__":
    run_pipeline()
