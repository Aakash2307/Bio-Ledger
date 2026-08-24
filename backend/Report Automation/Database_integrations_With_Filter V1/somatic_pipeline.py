#!/usr/bin/env python3
import subprocess
import sys
import os

from config import PROJECT_ROOT, SOMATIC_DIR, SOMATIC_CLEAN_INPUT

PRE_FILTER = os.path.join(PROJECT_ROOT, "pre_filter.py")  # ✅ NEW
MASTER_SCRIPT = os.path.join(SOMATIC_DIR, "Master_Script_7.py")
FILTER_SCRIPT = os.path.join(SOMATIC_DIR, "Somamut_Post_Filter.py")


def run_step(name, script_path):
    print(f"\n▶ {name}\n")

    if not os.path.exists(script_path):
        raise FileNotFoundError(f"Missing script: {script_path}")

    ret = subprocess.call(
        [sys.executable, script_path],
        cwd=PROJECT_ROOT
    )

    if ret != 0:
        raise SystemExit(f"❌ {name} failed")


def check_somatic_clean():
    print("\n🔍 Checking somatic_clean folder...\n")

    if not os.path.exists(SOMATIC_CLEAN_INPUT):
        raise SystemExit(f"❌ Missing folder: {SOMATIC_CLEAN_INPUT}")

    files = [f for f in os.listdir(SOMATIC_CLEAN_INPUT) if f.endswith((".xlsx", ".xls"))]

    print(f"📁 Files found: {files}")

    if not files:
        raise SystemExit("❌ No valid somatic files after pre-filter")

    return files


def main():
    print("\n==============================")
    print("  FULL SOMATIC PIPELINE RUN   ")
    print("==============================")

    # ===================================
    # STEP 0: PRE-FILTER
    # ===================================
    run_step("Step 0: Germline → Somatic Pre-filter", PRE_FILTER)

    # ===================================
    # CHECK CLEAN INPUT
    # ===================================
    check_somatic_clean()

    # ===================================
    # STEP 1: MASTER
    # ===================================
    run_step("Step 1: All Database Integration", MASTER_SCRIPT)

    # ===================================
    # STEP 2: POST FILTER
    # ===================================
    run_step("Step 2: Somamut Filtering", FILTER_SCRIPT)

    print("\n==============================")
    print(" 🎉 SOMATIC PIPELINE COMPLETED ")
    print("==============================\n")


if __name__ == "__main__":
    main()