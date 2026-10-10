"""
Report Automation worker.

Runs the offline master_pipeline.sh (Database_integrations_With_Filter -> PRS ->
Final_Report) for one sample at a time, since the pipeline reads/writes fixed
shared folder paths and cannot safely run concurrently.

Jobs are pushed onto an in-process queue and processed one at a time by a
single background worker thread. Supports cancellation: a queued job can be
skipped before it starts, and a currently-running job (and everything it
spawned) is killed.

Input staging is partial-tolerant: master_pipeline.sh can run with a subset
of germline/somatic/prs files, so only whichever paths were actually
provided get copied into their staging folders.

Outputs: after a successful run, the worker copies this run's germline,
somatic and PRS outputs into raw/{sid}/outputs/r{report_id}/ under their
exact names, and records the paths on the reports row. Missing outputs are
stored as NULL and do not fail the report.

Stage tracking: master_pipeline.sh logs "START: STEP N: ..." lines for each
of its 5 stages. A background thread reads stdout as the pipeline runs and
writes a live `stage` onto the reports row. This also keeps the OS pipe
buffer from filling and blocking the child process.
"""

import os
import signal
import subprocess
import shutil
import queue
import threading
import time
import re
import sys
from pathlib import Path
from typing import Optional

# backend/ is two levels up from backend/app/services/
BACKEND_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND_ROOT))  # so `import database` works

from database import create_report_record, update_report_status, set_report_outputs, get_report  # noqa: E402  # CHANGED
from app.services.input_resolver import sample_reports_dir, report_rel  # noqa: E402
from app.services.provisioning import RAW_DIR, OUTPUTS_SUBDIR, run_output_dir  # noqa: E402  # CHANGED

# =========================================================
# PATHS - adjust ONLY if you rename/move the pipeline folder
# =========================================================
PIPELINE_ROOT = BACKEND_ROOT / "Report Automation"

DB_FOLDER = PIPELINE_ROOT / "Database_integrations_With_Filter V1"
GERMLINE_INPUT_FOLDER = DB_FOLDER / "Input" / "germline"
SOMATIC_INPUT_FOLDER = DB_FOLDER / "Input" / "somatic"
PRS_INPUT_FOLDER = PIPELINE_ROOT / "PRS" / "input"  # CHANGED: lowercase to match master_pipeline.sh (Linux is case-sensitive)
SOMATIC_CLEAN_OUTPUT = DB_FOLDER / "Input" / "somatic_clean"

FINAL_REPORT_OUTPUT = PIPELINE_ROOT / "Final_Report" / "output"
MASTER_SCRIPT = PIPELINE_ROOT / "master_pipeline.sh"

# CHANGED: where each pipeline output is written, and the exact name the worker looks for
GERMLINE_OUTPUT_FOLDER = DB_FOLDER / "Output" / "germline"
SOMATIC_OUTPUT_FOLDER = DB_FOLDER / "Output" / "somatic"
PRS_OUTPUT_FOLDER = PIPELINE_ROOT / "PRS" / "output"

OUTPUT_FOLDERS = {  # CHANGED
    "germline": GERMLINE_OUTPUT_FOLDER,
    "somatic": SOMATIC_OUTPUT_FOLDER,
    "prs": PRS_OUTPUT_FOLDER,
}

OUTPUT_NAME_TEMPLATES = {  # CHANGED
    "germline": "{sid}_Germline_Results_FINAL.xlsx",
    "somatic": "{sid}_Somatic_Results_Integrated_Somamut.xlsx",
    "prs": "{sid}_trait_processed.xlsx",
}

PIPELINE_TIMEOUT_SECONDS = 3600  # adjust to real worst-case runtime + buffer
POLL_INTERVAL_SECONDS = 1        # how often we check the subprocess + cancel flag
TERMINATE_GRACE_SECONDS = 5      # time to allow graceful shutdown before SIGKILL
READER_JOIN_TIMEOUT_SECONDS = 10 # how long to wait for the stdout reader thread to drain after exit
MTIME_TOLERANCE_SECONDS = 2      # clock/filesystem slack when deciding a file belongs to this run  # CHANGED

# =========================================================
# STAGE PARSING
# =========================================================
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
    Drains stdout (stderr is merged into it), keeps everything printed for
    error_log on failure, and pushes a live `stage` update when a STEP starts."""
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


def _signal_group(proc: subprocess.Popen, sig: int) -> None:  # CHANGED
    """Send a signal to the pipeline's whole process group (bash plus every
    python child it started). Needs start_new_session=True at launch."""
    try:
        os.killpg(proc.pid, sig)
    except (ProcessLookupError, PermissionError):
        pass  # already gone


def _stop_process(proc: subprocess.Popen) -> None:  # CHANGED
    """Ask the group to stop, wait for the grace period, then force kill."""
    _signal_group(proc, signal.SIGTERM)
    try:
        proc.wait(timeout=TERMINATE_GRACE_SECONDS)
    except subprocess.TimeoutExpired:
        _signal_group(proc, signal.SIGKILL)  # CHANGED
        proc.wait()


def request_cancel(report_id: int) -> str:
    """Called from the API when the user hits Stop.
    Returns 'killed' if a running process was stopped,
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
            _stop_process(proc)  # CHANGED
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
# OUTPUT HANDLING  # CHANGED (whole section)
# =========================================================
def _run_dir_path(sid: str, report_id: int) -> Path:  # CHANGED
    """raw/{sid}/outputs/r{report_id}/ without creating it (used for cleanup)."""
    return RAW_DIR / sid / OUTPUTS_SUBDIR / f"r{report_id}"


def _written_by_run(path: Path, run_started_at: float) -> bool:  # CHANGED
    """True only if the file exists and was written during this run.
    Stops stale outputs from an earlier sample or run being copied."""
    return path.is_file() and path.stat().st_mtime >= run_started_at - MTIME_TOLERANCE_SECONDS


def _collect_outputs(sid: str, report_id: int, run_started_at: float,
                     prs_path: Optional[str]) -> dict:  # CHANGED
    """Copy this run's three outputs into raw/{sid}/outputs/r{report_id}/.
    Returns {kind: path relative to raw/, or None}. A missing output is
    None, not an error. Raises only on a real copy failure."""
    run_dir = run_output_dir(sid, report_id)
    collected = {"germline": None, "somatic": None, "prs": None}

    for kind, folder in OUTPUT_FOLDERS.items():
        if kind == "prs" and not prs_path:
            # PRS input wasn't staged for this run, so any PRS file in the
            # folder is left over from an earlier run. Skip it.
            continue
        src = folder / OUTPUT_NAME_TEMPLATES[kind].format(sid=sid)
        if not _written_by_run(src, run_started_at):
            continue
        dest = run_dir / src.name
        shutil.copy2(src, dest)
        collected[kind] = report_rel(dest)

    if not any(collected.values()):
        try:
            run_dir.rmdir()  # remove the empty run folder
        except OSError:
            pass

    return collected


def _cleanup_partial(sid: str, report_id: int, archived_path: Optional[Path]) -> None:  # CHANGED
    """Remove anything a failed save left behind, so no half-saved report remains."""
    shutil.rmtree(_run_dir_path(sid, report_id), ignore_errors=True)
    if archived_path is not None and archived_path.exists():
        try:
            archived_path.unlink()
        except OSError:
            pass


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
        _reset_folder(SOMATIC_CLEAN_OUTPUT)

        # Inputs are staged under normalized {sid}_... names, because the
        # pipeline takes the sample ID from the first "_" token. The originals
        # on the share are never touched.
        if germline_path:
            shutil.copy(germline_path, GERMLINE_INPUT_FOLDER / f"{sid}_Germline_Results.xlsx")
        if somatic_path:
            shutil.copy(somatic_path, SOMATIC_INPUT_FOLDER / f"{sid}_Somatic_Results.xlsx")
        if prs_path:
            shutil.copy(prs_path, PRS_INPUT_FOLDER / f"{sid}_Merged.xlsx")
    except Exception as e:
        update_report_status(report_id, status="failed", error_log=f"Failed to stage input files: {e}")
        return

    if _is_cancelled(report_id):
        _clear_cancelled(report_id)
        update_report_status(report_id, status="cancelled", error_log="Cancelled before pipeline started")
        return

    # ── Launch pipeline ──
    run_started_at = time.time()  # CHANGED: every file this run produces is newer than this

    try:
        proc = subprocess.Popen(
            ["bash", str(MASTER_SCRIPT)],
            cwd=str(PIPELINE_ROOT),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            start_new_session=True,  # CHANGED: own process group, so cancel kills the python children too
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
                _stop_process(proc)  # CHANGED: stops the whole group
                _clear_cancelled(report_id)
                reader_thread.join(timeout=READER_JOIN_TIMEOUT_SECONDS)
                update_report_status(report_id, status="cancelled", error_log="Cancelled by user")
                return

            if time.monotonic() - start_time > PIPELINE_TIMEOUT_SECONDS:
                _signal_group(proc, signal.SIGKILL)  # CHANGED: kill the group, not just bash
                proc.wait()
                timed_out = True
                break

            time.sleep(POLL_INTERVAL_SECONDS)
    finally:
        with _state_lock:
            _current_report_id = None
            _current_process = None

    reader_thread.join(timeout=READER_JOIN_TIMEOUT_SECONDS)
    full_output = "".join(captured_lines)

    if timed_out:
        update_report_status(report_id, status="failed", error_log="Pipeline timed out")
        return

    if proc.returncode != 0:
        error_tail = full_output[-5000:]
        update_report_status(report_id, status="failed", error_log=error_tail)
        return

    # CHANGED: only report files written by THIS run. Without this, an old
    # report would be archived as the new one when this run produced none.
    output_files = [
        p for p in list(FINAL_REPORT_OUTPUT.glob("*.docx")) + list(FINAL_REPORT_OUTPUT.glob("*.pdf"))
        if _written_by_run(p, run_started_at)
    ]
    if not output_files:
        update_report_status(report_id, status="failed", error_log="Pipeline finished but no output file was found")
        return

    source_file = max(output_files, key=lambda p: p.stat().st_mtime)  # most recently written

    # CHANGED: save outputs, archive the report, and record everything.
    # Any failure here removes what was written, so no half-saved report is left.
    archived_path: Optional[Path] = None
    try:
        outputs = _collect_outputs(sid, report_id, run_started_at, prs_path)
        archived_path = sample_reports_dir(sid) / f"{sid}_Report_r{report_id}{source_file.suffix}"
        shutil.move(str(source_file), str(archived_path))
        set_report_outputs(
            report_id,
            germline_output=outputs["germline"],
            somatic_output=outputs["somatic"],
            prs_output=outputs["prs"],
        )
    except Exception as e:
        _cleanup_partial(sid, report_id, archived_path)
        update_report_status(report_id, status="failed", error_log=f"Failed to save results: {e}")
        return

    # CHANGED: store the report path relative to raw/ (resolve_report() turns it back)
    update_report_status(report_id, status="completed", file_path=report_rel(archived_path), stage="Complete")


def _reset_folder(folder: Path):
    folder.mkdir(parents=True, exist_ok=True)
    for f in folder.glob("*"):
        if f.is_file():
            f.unlink()