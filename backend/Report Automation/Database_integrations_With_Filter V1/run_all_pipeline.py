#!/usr/bin/env python3
import subprocess
import sys
import os
from datetime import datetime

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))

from config import (SOMATIC_CLEAN_INPUT)

germline_pipeline = os.path.join(PROJECT_ROOT, "germline_pipeline.py")
somatic_pipeline = os.path.join(PROJECT_ROOT, "somatic_pipeline.py")
remove_excel = os.path.join(PROJECT_ROOT, "remove_excel_main.py")
pre_filter = os.path.join(PROJECT_ROOT, "pre_filter.py")

# ===================================
# START
# ===================================
print("\n===================================")
print("     FULL PIPELINE STARTED          ")
print("===================================\n")

start_time = datetime.now()
print(f"🕒 Start Time: {start_time.strftime('%Y-%m-%d %H:%M:%S')}\n")

# ===================================
# PRE-FILTER
# ===================================
print("🔧 Running Germline → Somatic RSID filtering...\n")
subprocess.run([sys.executable, pre_filter], cwd=PROJECT_ROOT, check=True)
 
# ===================================
# PRE - CHECK 
# ===================================
clean_dir = os.path.join(PROJECT_ROOT, SOMATIC_CLEAN_INPUT)

print(f"📂 Checking cleaned somatic folder: {clean_dir}")

if not os.path.exists(clean_dir) or not os.listdir(clean_dir):
    raise SystemExit("❌ No files in somatic_clean. Stopping pipeline.")

# ===================================
# SOMATIC PIPELINE (FIRST as you want)
# ===================================
print("▶ Running Somatic Pipeline\n")
subprocess.run([sys.executable, somatic_pipeline], cwd=PROJECT_ROOT, check=True)

# ===================================
# GERMLINE PIPELINE
# ===================================
print("\n▶ Running Germline Pipeline\n")
subprocess.run([sys.executable, germline_pipeline], cwd=PROJECT_ROOT, check=True)

# ===================================
# CLEANUP
# ===================================
print("\n▶ Cleaning Excel Files from the somatic folders\n")
subprocess.run([sys.executable, remove_excel], cwd=PROJECT_ROOT, check=True)

# ===================================
# END
# ===================================
end_time = datetime.now()

print("\n===================================")
print(" 🎉 FULL PIPELINE COMPLETED         ")
print("===================================\n")

print(f"🕒 End Time: {end_time.strftime('%Y-%m-%d %H:%M:%S')}")
print(f"⏱ Total Time: {end_time - start_time}\n")