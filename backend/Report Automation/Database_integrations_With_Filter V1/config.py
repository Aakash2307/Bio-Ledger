import os

# ======================================================
# ROOT (single source of truth)
# ======================================================
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))

# ======================================================
# COMMON DIRS
# ======================================================
INPUT_DIR = os.path.join(PROJECT_ROOT, "Input")
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "Output")

# ======================================================
# GERMLINE
# ======================================================
GERMLINE_DIR = os.path.join(PROJECT_ROOT, "GERMLINE")
GERMLINE_INPUT = os.path.join(INPUT_DIR, "germline")
GERMLINE_OUTPUT = os.path.join(OUTPUT_DIR, "germline")

CLINGEN_GERMLINE = os.path.join(GERMLINE_DIR, "Clingen Database_Germline.csv")

# ======================================================
# SOMATIC
# ======================================================
SOMATIC_DIR = os.path.join(PROJECT_ROOT, "SOMATIC")
SOMATIC_INPUT = os.path.join(INPUT_DIR, "somatic")
SOMATIC_OUTPUT = os.path.join(OUTPUT_DIR, "somatic")
SOMATIC_CLEAN_INPUT = os.path.join(INPUT_DIR, "somatic_clean")  # ✅ NEW

SOMATIC_DB = os.path.join(SOMATIC_DIR, "Databases")
SOMATIC_MODULES = os.path.join(SOMATIC_DIR, "Modules")

SOMAMUT_REF = os.path.join(SOMATIC_DB, "Somamut")

# ======================================================
# COMMON FILES
# ======================================================
GENE_LIST_FILE = os.path.join(PROJECT_ROOT, "Somatic and germline important gene list.xlsx")

# ======================================================
# EXCEL CONFIG
# ======================================================
SHEET_NAME = "Variations"
