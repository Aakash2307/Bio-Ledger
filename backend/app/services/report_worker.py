"""
Report Automation worker.

Runs the offline master_pipeline.sh (Database_integrations_With_Filter -> PRS ->
Final_Report) for one sample at a time, since the pipeline reads/writes fixed
shared folder paths and cannot safely run concurrently.

Jobs are pushed onto an in-process queue and processed one at a time by a
single background worker thread. Supports cancellation: a queued job can be
skipped before it starts, and a currently-running job can be killed.

Input staging is partial-tolerant: master_pipeline.sh can run with a subset
of germline/somatic/prs files, so only whichever paths were actually
provided get copied into their staging folders.

Stage tracking: master_pipeline.sh already logs "START: STEP N: ..." lines
for each of its 5 stages (DB integration, copy germline/somatic, PRS
processing, copy SNP output, report generation). Rather than waiting for
the whole subprocess to exit before reading its output, a background thread
reads stdout line-by-line as the pipeline runs, matches those STEP markers,
and writes a live human-readable `stage` onto the reports row as they
happen. This also avoids a separate problem: with nothing draining the
subprocess's stdout while it runs, verbose pipeline output can fill the OS
pipe buffer and block the child process indefinitely.
"""

import subprocess
import shutil
import queue
import threading
import time
import re
import sys
from pathlib import Path
from datetime import datetime
from typing import Optional

# backend/ is two levels up from backend/app/services/
BACKEND_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND_ROOT))  # so `import database` works

from database import create_report_record, update_report_status, get_report  # noqa: E402

# =========================================================
# PATHS - adjust ONLY if you rename/move the pipeline folder
# =========================================================
PIPELINE_ROOT = BACKEND_ROOT / "Report Automation"

DB_FOLDER = PIPELINE_ROOT / "Database_integrations_With_Filter V1"
GERMLINE_INPUT_FOLDER = DB_FOLDER / "Input" / "germline"
SOMATIC_INPUT_FOLDER = DB_FOLDER / "Input" / "somatic"
PRS_INPUT_FOLDER = PIPELINE_ROOT / "PRS" / "Input"  # flat folder, no subfolders

FINAL_REPORT_OUTPUT = PIPELINE_ROOT / "Final_Report" / "output"
ARCHIVE_FOLDER = BACKEND_ROOT / "report_archive"  # where completed reports get renamed + stored
ARCHIVE_FOLDER.mkdir(parents=True, exist_ok=True)

MASTER_SCRIPT = PIPELINE_ROOT / "master_pipeline.sh"

PIPELINE_TIMEOUT_SECONDS = 3600  # adjust to real worst-case runtime + buffer
POLL_INTERVAL_SECONDS = 1        # how often we check the subprocess + cancel flag
TERMINATE_GRACE_SECONDS = 5      # time to allow graceful shutdown before SIGKILL
READER_JOIN_TIMEOUT_SECONDS = 10 # how long to wait for the stdout reader thread to drain after exit

# =========================================================
# STAGE PARSING
# =========================================================
# Matches the "START: STEP N: NAME (optional detail)" lines that
# master_pipeline.sh's own log() function writes for each of its 5 stages.
_STEP_START_RE = re.compile(r"START:\s*STEP\s*(\d+):\s*([^\r\n(]+)")
TOTAL_PIPELINE_STEPS = 5


def _parse_stage_line(line: str) -> Optional[str]:
    """Returns a human-readable stage string like 'Step 3 of 5: PRS Processing'
    if this line is one of master_pipeline.sh's STEP START markers, else None."""
    match = _STEP_START_RE.search(line)
    if not match:
        return None
    step_num = match.group(1).strip()
    step_name = match.group(2).strip().rstrip(":").strip()
    return f"Step {step_num} of {TOTAL_PIPELINE_STEPS}: {step_name}"


def _stream_reader(proc: subprocess.Popen, report_id: int, captured_lines: list):
    """Runs in a background thread for the lifetime of the subprocess.
    Continuously drains stdout (stderr is merged into it), keeping a
    rolling record of everything printed (for error_log on failure) and
    pushing a live `stage` update to the DB whenever a new STEP starts."""
    try:
        for line in iter(proc.stdout.readline, ""):
            if not line:
                break
            captured_lines.append(line)
            stage = _parse_stage_line(line)
            if stage is not None:
                try:
                    update_report_status(report_id, status="processing", stage=stage)
                except Exception:
                    pass  # a transient DB hiccup here shouldn't kill the reader
    finally:
        try:
            proc.stdout.close()
        except Exception:
            pass


# =========================================================
# QUEUE
# =========================================================
job_queue: "queue.Queue[tuple[str, Optional[str], Optional[str], Optional[str], int]]" = queue.Queue()

# =========================================================
# CANCELLATION STATE
# =========================================================
_state_lock = threading.Lock()
_current_report_id: Optional[int] = None
_current_process: Optional[subprocess.Popen] = None
_cancelled_report_ids: set = set()


def request_cancel(report_id: int) -> str:
    """Called from the API when the user hits Stop.
    Returns 'killed' if a running process was terminated,
    'skip-queued' if the job was still waiting and will now be skipped."""
    with _state_lock:
        _cancelled_report_ids.add(report_id)
        if _current_report_id == report_id and _current_process is not None:
            proc = _current_process
            result = "killed"
        else:
            result = "skip-queued"

    if result == "killed":
        try:
            proc.terminate()
            try:
                proc.wait(timeout=TERMINATE_GRACE_SECONDS)
            except subprocess.TimeoutExpired:
                proc.kill()
        except Exception:
            pass  # process may have already exited on its own

    return result


def _is_cancelled(report_id: int) -> bool:
    with _state_lock:
        return report_id in _cancelled_report_ids


def _clear_cancelled(report_id: int):
    with _state_lock:
        _cancelled_report_ids.discard(report_id)


def _worker_loop():
    while True:
        job = job_queue.get()
        try:
            _process_job(job)
        except Exception as e:
            sid, germline_path, somatic_path, prs_path, report_id = job
            update_report_status(report_id, status="failed", error_log=f"Worker crashed: {e}")
        finally:
            job_queue.task_done()


def start_worker():
    """Call this once at app startup (e.g. in main.py)."""
    t = threading.Thread(target=_worker_loop, daemon=True)
    t.start()


def enqueue_report_job(
    sid: str,
    germline_path: Optional[str],
    somatic_path: Optional[str],
    prs_path: Optional[str],
    sample_ref: int,
) -> int:
    """Create a reports row and push the job onto the queue. Returns report_id.
    Any of germline_path/somatic_path/prs_path may be None — the pipeline
    tolerates a subset of inputs."""
    report_id = create_report_record(sample_ref)
    job_queue.put((sid, germline_path, somatic_path, prs_path, report_id))
    return report_id


# =========================================================
# JOB PROCESSING
# =========================================================
def _process_job(job: tuple):
    global _current_report_id, _current_process

    sid, germline_path, somatic_path, prs_path, report_id = job

    # Was this cancelled while it was still sitting in the queue?
    if _is_cancelled(report_id):
        _clear_cancelled(report_id)
        update_report_status(report_id, status="cancelled", error_log="Cancelled before it started")
        return

    update_report_status(report_id, status="processing", stage="Staging input files")

    # ── Stage inputs (partial-tolerant) ──
    try:
        _reset_folder(GERMLINE_INPUT_FOLDER)
        _reset_folder(SOMATIC_INPUT_FOLDER)
        _reset_folder(PRS_INPUT_FOLDER)

        if germline_path:
            shutil.copy(germline_path, GERMLINE_INPUT_FOLDER / Path(germline_path).name)
        if somatic_path:
            shutil.copy(somatic_path, SOMATIC_INPUT_FOLDER / Path(somatic_path).name)
        if prs_path:
            shutil.copy(prs_path, PRS_INPUT_FOLDER / Path(prs_path).name)
    except Exception as e:
        update_report_status(report_id, status="failed", error_log=f"Failed to stage input files: {e}")
        return

    if _is_cancelled(report_id):
        _clear_cancelled(report_id)
        update_report_status(report_id, status="cancelled", error_log="Cancelled before pipeline started")
        return

    # ── Launch pipeline ──
    try:
        proc = subprocess.Popen(
            ["bash", str(MASTER_SCRIPT)],
            cwd=str(PIPELINE_ROOT),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,  # merge so one stream captures everything, in order
            text=True,
            bufsize=1,  # line-buffered, so the reader thread sees lines as they're printed
        )
    except Exception as e:
        update_report_status(report_id, status="failed", error_log=f"Failed to launch pipeline: {e}")
        return

    with _state_lock:
        _current_report_id = report_id
        _current_process = proc

    captured_lines: list = []
    reader_thread = threading.Thread(
        target=_stream_reader, args=(proc, report_id, captured_lines), daemon=True
    )
    reader_thread.start()

    start_time = time.monotonic()
    timed_out = False

    try:
        while True:
            ret = proc.poll()
            if ret is not None:
                break

            if _is_cancelled(report_id):
                proc.terminate()
                try:
                    proc.wait(timeout=TERMINATE_GRACE_SECONDS)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait()
                _clear_cancelled(report_id)
                reader_thread.join(timeout=READER_JOIN_TIMEOUT_SECONDS)
                update_report_status(report_id, status="cancelled", error_log="Cancelled by user")
                return

            if time.monotonic() - start_time > PIPELINE_TIMEOUT_SECONDS:
                proc.kill()
                proc.wait()
                timed_out = True
                break

            time.sleep(POLL_INTERVAL_SECONDS)
    finally:
        with _state_lock:
            _current_report_id = None
            _current_process = None

    # process has exited (or was killed for timing out) — let the reader
    # thread finish draining whatever's left, then use what it captured
    reader_thread.join(timeout=READER_JOIN_TIMEOUT_SECONDS)
    full_output = "".join(captured_lines)

    if timed_out:
        update_report_status(report_id, status="failed", error_log="Pipeline timed out")
        return

    if proc.returncode != 0:
        error_tail = full_output[-5000:]
        update_report_status(report_id, status="failed", error_log=error_tail)
        return

    output_files = list(FINAL_REPORT_OUTPUT.glob("*.docx")) + list(FINAL_REPORT_OUTPUT.glob("*.pdf"))
    if not output_files:
        update_report_status(report_id, status="failed", error_log="Pipeline finished but no output file was found")
        return

    source_file = max(output_files, key=lambda p: p.stat().st_mtime)  # most recently written
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    archived_path = ARCHIVE_FOLDER / f"{sid}_{timestamp}{source_file.suffix}"

    try:
        shutil.move(str(source_file), str(archived_path))
    except Exception as e:
        update_report_status(report_id, status="failed", error_log=f"Failed to archive output: {e}")
        return

    update_report_status(report_id, status="completed", file_path=str(archived_path), stage="Complete")


def _reset_folder(folder: Path):
    folder.mkdir(parents=True, exist_ok=True)
    for f in folder.glob("*"):
        if f.is_file():
            f.unlink()