#!/bin/bash
set -e
set -o pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# CHANGED: the worker sets PIPELINE_LOG_FILE to the run folder's pipeline.log.
# Run by hand with the variable unset, it falls back to a timestamped file here.
LOG_FILE="${PIPELINE_LOG_FILE:-$ROOT_DIR/pipeline_timing_$(date +%Y%m%d_%H%M%S).log}"  # CHANGED
mkdir -p "$(dirname "$LOG_FILE")"  # CHANGED

STEP_NAME="startup"

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') | $1" | tee -a "$LOG_FILE"
}

# Any failing command logs which step it was in before the script exits.
trap 'log "FAILED during: ${STEP_NAME} (exit code $?)"' ERR

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

DB_FOLDER="$ROOT_DIR/Database_integrations_With_Filter V1"
GERMLINE_OUTPUT="$ROOT_DIR/Database_integrations_With_Filter V1/Output/germline"
SOMATIC_OUTPUT="$ROOT_DIR/Database_integrations_With_Filter V1/Output/somatic"

PRS_FOLDER="$ROOT_DIR/PRS"
PRS_INPUT="$ROOT_DIR/PRS/input"
PRS_OUTPUT="$ROOT_DIR/PRS/output"

REPORT_FOLDER="$ROOT_DIR/Final_Report"
REPORT_GERMLINE_INPUT="$ROOT_DIR/Final_Report/input/germline"
REPORT_SOMATIC_INPUT="$ROOT_DIR/Final_Report/input/somatic"
REPORT_SNP_INPUT="$ROOT_DIR/Final_Report/input/snp"

# NOTE: this script does not copy outputs into raw/{sid}/outputs/.
# report_worker.py does that after a successful run, because it knows
# the sample ID and report ID.

# ========================================
# STEP 1 - DATABASE INTEGRATION
# ========================================

step_start "STEP 1: DATABASE INTEGRATION (run_all_pipeline.py)"

# Clear last run's output BEFORE generating this run's output.

mkdir -p "$GERMLINE_OUTPUT" "$SOMATIC_OUTPUT"

rm -f "$GERMLINE_OUTPUT"/*.xlsx
rm -f "$SOMATIC_OUTPUT"/*.xlsx

cd "$DB_FOLDER"

python3 run_all_pipeline.py 2>&1 | tee -a "$LOG_FILE"  # CHANGED: uses LOG_FILE

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

if [ ! -d "$PRS_INPUT" ]; then

    log "PRS input directory not found. Skipping PRS processing."

else

    PRS_INPUT_COUNT=$(find "$PRS_INPUT" -maxdepth 1 -type f | wc -l)

    if [ "$PRS_INPUT_COUNT" -eq 0 ]; then

        log "No PRS input files found. Skipping PRS processing."

    else

        log "PRS input files found: $PRS_INPUT_COUNT"

        # Clear PRS output from previous run
        mkdir -p "$PRS_OUTPUT"
        rm -f "$PRS_OUTPUT"/*.xlsx

        cd "$PRS_FOLDER"

        python3 run_prs.py 2>&1 | tee -a "$LOG_FILE"  # CHANGED: uses LOG_FILE

        cd "$ROOT_DIR"

        PRS_COUNT=$(find "$PRS_OUTPUT" -name "*.xlsx" | wc -l)

        if [ "$PRS_COUNT" -eq 0 ]; then
            log "ERROR: No PRS output files found."
            exit 1
        fi

        log "PRS output files: $PRS_COUNT"

    fi

fi

step_end

# ========================================
# STEP 4 - COPY SNP OUTPUT
# ========================================

step_start "STEP 4: COPY SNP OUTPUT"

rm -f "$REPORT_SNP_INPUT"/*.xlsx

if [ -n "${PRS_COUNT:-}" ] && [ "$PRS_COUNT" -gt 0 ]; then

    cp "$PRS_OUTPUT"/*.xlsx "$REPORT_SNP_INPUT"/

    log "SNP output copied: $PRS_COUNT files"

else

    log "PRS was skipped. No SNP files copied."

fi

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

"venv/bin/python3" final_report.py 2>&1 | tee -a "$LOG_FILE"  # CHANGED: uses LOG_FILE

cd "$ROOT_DIR"

step_end

# ========================================
# PIPELINE COMPLETE
# ========================================

PIPELINE_END=$(date +%s)
TOTAL_ELAPSED=$((PIPELINE_END - PIPELINE_START))

echo ""
echo "========================================"

log "PIPELINE COMPLETE - Total time: ${TOTAL_ELAPSED}s"

echo "========================================"
echo ""

echo "Full timing log saved to: $LOG_FILE"

echo "Summary of step durations:"

grep -E "START:|END:" "$LOG_FILE" || true