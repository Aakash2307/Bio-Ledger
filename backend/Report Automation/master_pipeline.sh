#!/bin/bash
set -e

LOG_FILE="pipeline_timing_$(date +%Y%m%d_%H%M%S).log"

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') | $1" | tee -a "$LOG_FILE"
}

step_start() {
    STEP_NAME="$1"
    STEP_START_TIME=$(date +%s)
    log "START: $STEP_NAME"
}

step_end() {
    STEP_END_TIME=$(date +%s)
    ELAPSED=$((STEP_END_TIME - STEP_START_TIME))
    log "END:   $STEP_NAME  (took ${ELAPSED}s)"
}

echo "========================================"
echo "MASTER REPORT AUTOMATION PIPELINE (TIMED)"
echo "========================================"
log "PIPELINE START"
PIPELINE_START=$(date +%s)

# ========================================
# PATHS
# ========================================
ROOT_DIR="$(pwd)"
DB_FOLDER="Database_integrations_With_Filter V1"
GERMLINE_OUTPUT="Database_integrations_With_Filter V1/Output/germline"
SOMATIC_OUTPUT="Database_integrations_With_Filter V1/Output/somatic"
PRS_FOLDER="PRS"
PRS_OUTPUT="PRS/output"
REPORT_FOLDER="Final_Report"
REPORT_GERMLINE_INPUT="Final_Report/input/germline"
REPORT_SOMATIC_INPUT="Final_Report/input/somatic"
REPORT_SNP_INPUT="Final_Report/input/snp"

# ========================================
# STEP 1 - DATABASE INTEGRATION
# ========================================
step_start "STEP 1: DATABASE INTEGRATION (run_all_pipeline.py)"
# Clear last run's output BEFORE generating this run's output. Without this,
# run_all_pipeline.py's output folder accumulates every previous run's
# .xlsx files, and Step 2 below copies the entire folder (old files
# included) into Final_Report/input — meaning old/stale samples silently
# get re-processed into every report, and the pipeline takes longer than
# it needs to.
mkdir -p "$GERMLINE_OUTPUT" "$SOMATIC_OUTPUT"
rm -f "$GERMLINE_OUTPUT"/*.xlsx
rm -f "$SOMATIC_OUTPUT"/*.xlsx
cd "$DB_FOLDER"
python3 run_all_pipeline.py 2>&1 | tee -a "$ROOT_DIR/$LOG_FILE"
cd "$ROOT_DIR"
step_end

GERMLINE_COUNT=$(find "$GERMLINE_OUTPUT" -name "*.xlsx" | wc -l)
SOMATIC_COUNT=$(find "$SOMATIC_OUTPUT" -name "*.xlsx" | wc -l)
if [ "$GERMLINE_COUNT" -eq 0 ]; then
    log "ERROR: No germline output files found."
    exit 1
fi
if [ "$SOMATIC_COUNT" -eq 0 ]; then
    log "ERROR: No somatic output files found."
    exit 1
fi
log "Germline files: $GERMLINE_COUNT | Somatic files: $SOMATIC_COUNT"

# ========================================
# STEP 2 - COPY GERMLINE & SOMATIC
# ========================================
step_start "STEP 2: COPY GERMLINE & SOMATIC"
mkdir -p "$REPORT_GERMLINE_INPUT"
mkdir -p "$REPORT_SOMATIC_INPUT"
mkdir -p "$REPORT_SNP_INPUT"
rm -f "$REPORT_GERMLINE_INPUT"/*.xlsx
rm -f "$REPORT_SOMATIC_INPUT"/*.xlsx
cp "$GERMLINE_OUTPUT"/*.xlsx "$REPORT_GERMLINE_INPUT"/
cp "$SOMATIC_OUTPUT"/*.xlsx "$REPORT_SOMATIC_INPUT"/
step_end

# ========================================
# STEP 3 - PRS PROCESSING
# ========================================
step_start "STEP 3: PRS PROCESSING (run_prs.py)"
# Same reasoning as Step 1: clear PRS's own output folder before this run
# generates into it, so Step 4 below can't pick up a stale file left over
# from an earlier sample/run.
mkdir -p "$PRS_OUTPUT"
rm -f "$PRS_OUTPUT"/*.xlsx
cd "$PRS_FOLDER"
python3 run_prs.py 2>&1 | tee -a "$ROOT_DIR/$LOG_FILE"
cd "$ROOT_DIR"
step_end

PRS_COUNT=$(find "$PRS_OUTPUT" -name "*.xlsx" | wc -l)
if [ "$PRS_COUNT" -eq 0 ]; then
    log "ERROR: No PRS output files found."
    exit 1
fi

# ========================================
# STEP 4 - COPY SNP OUTPUT
# ========================================
step_start "STEP 4: COPY SNP OUTPUT"
rm -f "$REPORT_SNP_INPUT"/*.xlsx
cp "$PRS_OUTPUT"/*.xlsx "$REPORT_SNP_INPUT"/
step_end

# ========================================
# STEP 5 - REPORT GENERATION
# ========================================
step_start "STEP 5: REPORT GENERATION (final_report.py)"
cd "$REPORT_FOLDER"
if [ ! -f "venv/bin/python3" ]; then
    log "ERROR: Report Generation virtual environment not found."
    exit 1
fi
"venv/bin/python3" final_report.py 2>&1 | tee -a "$ROOT_DIR/$LOG_FILE"
cd "$ROOT_DIR"
step_end

PIPELINE_END=$(date +%s)
TOTAL_ELAPSED=$((PIPELINE_END - PIPELINE_START))

echo ""
echo "========================================"
log "PIPELINE COMPLETE - Total time: ${TOTAL_ELAPSED}s"
echo "========================================"
echo ""
echo "Full timing log saved to: $LOG_FILE"
echo "Summary of step durations:"
grep -E "START:|END:" "$LOG_FILE"