import { useEffect, useState, useCallback, useRef } from "react";
import {
  getReportAutomationList,
  getSampleInputs, // CHANGED (replaces uploadReportInputs)
  generateReport,
  getReportStatus,
  cancelReport,
  getReportDownloadUrl,
} from "../api"; // adjust this path to wherever your api.js actually lives
import "../css/ReportAutomation.css"; // adjust this path to wherever your CSS file actually lives

function StatusBadge({ status }) {
  const label = status || "Not Generated";
  const className = `ra-badge ra-badge-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <span className={className}>
      <span className="ra-badge-dot" />
      {label}
    </span>
  );
}

// CHANGED — begin
// Read-only row showing whether one input file (germline / somatic / prs) was
// found on the share. Replaces the old FileField picker.
function InputStatusField({ label, filename }) {
  const found = Boolean(filename);
  return (
    <div className="ra-field">
      <span className="ra-field-label">{label}</span>
      <div className="ra-field-row">
        <span
          className={`ra-field-filename ${found ? "ra-input-found" : "ra-input-missing"}`}
          title={found ? filename : ""}
        >
          {found ? filename : "not found"}
        </span>
      </div>
    </div>
  );
}

// Maps GET /samples/{sid}/inputs failures to a clear message.
function inputsErrorMessage(err, sid) {
  if (err?.status === 404) return `Sample ${sid} was not found.`;
  if (err?.status === 503)
    return "The storage share is not mounted on the server, so input files can't be checked. Ask an admin to check the SMB mount, then try again.";
  return err?.message || "Failed to check input files.";
}
// CHANGED — end

// De-duplicates the sample list by sid, keeping only the row with the
// highest latest_report_id (i.e. the most recent report) for each sample.
// This is a frontend safety net for a list endpoint that may be returning
// more than one row per sample — worth checking the backend query too.
function dedupeBySid(list) {
  const map = new Map();
  for (const row of list) {
    const prev = map.get(row.sid);
    if (!prev) {
      map.set(row.sid, row);
      continue;
    }
    const prevId = prev.latest_report_id ?? -1;
    const nextId = row.latest_report_id ?? -1;
    map.set(row.sid, nextId >= prevId ? row : prev);
  }
  return Array.from(map.values());
}

// Rough progress checkpoints per real pipeline stage (from master_pipeline.sh's
// 5 steps). These are jump points tied to actual backend-reported stage, not
// a simulated climb — so the bar reflects where the pipeline really is.
const STEP_PROGRESS = {
  1: 20,  // Database Integration
  2: 40,  // Copy Germline & Somatic
  3: 55,  // PRS Processing
  4: 82,  // Copy SNP Output
  5: 92,  // Report Generation
};
const STAGE_STEP_RE = /Step (\d+) of \d+/;

function progressForStage(stage) {
  if (!stage) return null;
  const match = stage.match(STAGE_STEP_RE);
  if (!match) return null;
  return STEP_PROGRESS[Number(match[1])] ?? null;
}

const POLL_INTERVAL_MS = 3000;
const TABLE_REFRESH_INTERVAL_MS = 4000;
const ACTIVE_JOB_STORAGE_KEY = "ra_active_job";
const MAX_CONSECUTIVE_POLL_FAILURES = 3; // give up watching a job after this many failed ticks in a row

export default function ReportAutomation() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // top workflow panel state
  const [selectedSid, setSelectedSid] = useState("");

  // ── input-check state (CHANGED: replaces file / upload / detect state) ──
  const [inputs, setInputs] = useState(null); // CHANGED — { sid, germline, somatic, prs, ready } | null
  const [inputsLoading, setInputsLoading] = useState(false); // CHANGED
  const [inputsError, setInputsError] = useState(null); // CHANGED
  const inputsReqRef = useRef(0); // CHANGED — discards responses from a superseded selection

  // ── run step state ──
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState(null);
  const [runMessage, setRunMessage] = useState(null);
  const [runStatus, setRunStatus] = useState(null); // 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled'
  const [progress, setProgress] = useState(0);
  const [activeReportId, setActiveReportId] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [completedReportId, setCompletedReportId] = useState(null); // drives the Download button
  const pollTimerRef = useRef(null);
  const processingTicksRef = useRef(0); // how many ticks we've spent in "processing", used to creep progress up smoothly
  const consecutiveFailuresRef = useRef(0); // how many polls in a row have failed to reach the server

  // tracks whether any row is queued/processing, read by the table
  // interval below without being a dependency of it (avoids interval churn).
  const hasActiveJobRef = useRef(false);

  const fetchRows = useCallback(async () => {
    try {
      const data = await getReportAutomationList();
      setRows(dedupeBySid(data));
    } catch (err) {
      console.error("Failed to load report automation list:", err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  // Keep the ref in sync whenever rows change. This does NOT create or
  // reset any interval — it just updates a value the interval reads.
  useEffect(() => {
    hasActiveJobRef.current = rows.some(
      (r) => r.report_status === "Queued" || r.report_status === "Processing"
    );
  }, [rows]);

  // Single stable interval, created once. It refreshes the table only when
  // there's an active job AND we're not already watching that job's
  // progress via pollReportStatus below — that poll refreshes the table
  // itself once the job finishes. This is what stops the table from
  // refreshing while the progress bar is running.
  useEffect(() => {
    const interval = setInterval(() => {
      if (hasActiveJobRef.current && !running) {
        fetchRows();
      }
    }, TABLE_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchRows, running]);

  useEffect(() => {
    return () => clearInterval(pollTimerRef.current);
  }, []);

  // On mount: if a job was in flight when the page was refreshed/reopened,
  // resume watching it instead of losing the progress bar. We don't know
  // exactly how far along it was, so we restart the bar at a mid-point
  // rather than 0 — the next poll tick will correct it.
  useEffect(() => {
    const saved = localStorage.getItem(ACTIVE_JOB_STORAGE_KEY);
    if (!saved) return;
    try {
      const { reportId, sid, progress, ticks } = JSON.parse(saved);
      if (!reportId) return;
      setActiveReportId(reportId);
      setSelectedSid(sid || "");
      if (sid) loadInputs(sid); // CHANGED — repopulate the found/not-found panel for the resumed sample
      setRunning(true);
      setRunStatus("processing");
      setProgress(typeof progress === "number" ? progress : 10);
      processingTicksRef.current = typeof ticks === "number" ? ticks : 0;
      setRunMessage("Resuming pipeline status...");
      pollReportStatus(reportId, sid || "");
    } catch {
      localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // CHANGED: Run Pipeline needs a selected sample, backend-confirmed `ready`, and no running job.
  const canRun = Boolean(selectedSid) && inputs?.ready === true && !inputsLoading && !running; // CHANGED

  // CHANGED — begin
  // Asks the backend which input files exist on the share for this sample.
  // No `running` guard here so the poll/resume paths can use it too.
  const loadInputs = async (sid) => {
    const reqId = ++inputsReqRef.current;
    setInputs(null);
    setInputsError(null);
    setInputsLoading(true);
    try {
      const data = await getSampleInputs(sid);
      if (reqId !== inputsReqRef.current) return; // selection changed while waiting
      setInputs(data);
    } catch (err) {
      if (reqId !== inputsReqRef.current) return;
      console.error("Failed to check sample inputs:", err);
      setInputsError(inputsErrorMessage(err, sid));
    } finally {
      if (reqId === inputsReqRef.current) setInputsLoading(false);
    }
  };

  // Unguarded reset — used by the poll-complete path, whose closure can hold a stale `running`.
  const resetSelection = () => {
    inputsReqRef.current += 1; // invalidate any in-flight inputs request
    setSelectedSid("");
    setInputs(null);
    setInputsError(null);
    setInputsLoading(false);
  };

  // ── STEP 1: pick a sample (also re-checks inputs if it's already selected) ──
  const handleUseSample = (sid) => {
    if (running) return; // can't switch samples mid-run
    setSelectedSid(sid);
    loadInputs(sid);
  };

  const handleClearSelection = () => {
    if (running) return;
    resetSelection();
  };
  // CHANGED — end

  const stopPolling = () => {
    clearInterval(pollTimerRef.current);
    pollTimerRef.current = null;
  };

  // Updates the persisted active-job record with the latest known progress
  // and tick count, so a page refresh resumes from where it actually left
  // off instead of guessing a fixed midpoint.
  const persistActiveJob = (reportId, sid, progressValue, ticksValue) => {
    localStorage.setItem(
      ACTIVE_JOB_STORAGE_KEY,
      JSON.stringify({ reportId, sid, progress: progressValue, ticks: ticksValue })
    );
  };

  // Fully resets all "a job is in flight" state — used whenever we give up
  // watching a job, whether that's a clean terminal status, a manual stop,
  // or too many failed polls in a row. Centralized so Stop Pipeline and the
  // poll-failure path can't drift out of sync with each other again.
  const resetActiveJobState = ({ error = null, message = null } = {}) => {
    stopPolling();
    localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
    processingTicksRef.current = 0;
    consecutiveFailuresRef.current = 0;
    setRunning(false);
    setCancelling(false);
    setActiveReportId(null);
    setProgress(0);
    setRunStatus(null);
    setRunError(error);
    setRunMessage(message);
  };

  // Polls GET /reports/{report_id} until the job reaches a terminal state.
  const pollReportStatus = (reportId, sidForMessage) => {
    stopPolling();
    pollTimerRef.current = setInterval(async () => {
      try {
        const report = await getReportStatus(reportId);
        consecutiveFailuresRef.current = 0;
        setRunStatus(report.status);

        if (report.status === "completed") {
          stopPolling();
          localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
          processingTicksRef.current = 0;
          consecutiveFailuresRef.current = 0;
          setProgress(100);
          setRunMessage(`Report generation complete for ${sidForMessage}.`);
          setRunning(false);
          setCompletedReportId(reportId); // shows the Download button, stays until next run
          setActiveReportId(null);
          resetSelection(); // CHANGED (replaces clearing files / detectWarning / upload state / selectedSid)
          await fetchRows();
        } else if (report.status === "failed") {
          resetActiveJobState({
            error: report.error_log || "Report generation failed.",
          });
          await fetchRows();
        } else if (report.status === "cancelled") {
          resetActiveJobState({
            message: `Pipeline cancelled for ${sidForMessage}.`,
          });
          await fetchRows();
          setTimeout(() => {
            setRunMessage(null);
            setRunStatus(null);
          }, 2500);
        } else {
          const stagePct = progressForStage(report.stage);
          setProgress((p) => {
            const next = stagePct !== null ? Math.max(p, stagePct) : p;
            persistActiveJob(reportId, sidForMessage, next, processingTicksRef.current);
            return next;
          });
          setRunMessage(
            report.stage
              ? report.stage
              : report.status === "queued"
              ? "Queued — waiting for the pipeline to start..."
              : "Processing — running the report pipeline..."
          );
        }
      } catch (err) {
        console.error("Failed to poll report status:", err);
        consecutiveFailuresRef.current += 1;

        // A one-off network blip is fine — skip this tick and try again.
        // But if the server is unreachable / the job is gone (deleted row,
        // backend restarted, etc.), polling forever just leaves the UI
        // stuck showing "running" with no way to recover. Give up after a
        // few failed ticks in a row and hand control back to the user.
        if (consecutiveFailuresRef.current >= MAX_CONSECUTIVE_POLL_FAILURES) {
          resetActiveJobState({
            error:
              "Lost connection to the server while checking pipeline status. The job may no longer exist — please check and try again.",
          });
        }
      }
    }, POLL_INTERVAL_MS);
  };

  // ── STEP 2: Run pipeline — enqueue, then poll real status until done ──
  const handleRunPipeline = async () => {
    if (!canRun) return;
    const sid = selectedSid.trim();
    setRunning(true);
    setRunError(null);
    setRunMessage("Starting pipeline...");
    setRunStatus("queued");
    setProgress(10);
    setCompletedReportId(null); // clear any previous run's download button
    processingTicksRef.current = 0;
    consecutiveFailuresRef.current = 0;

    try {
      const { report_id } = await generateReport(sid);
      setActiveReportId(report_id);
      persistActiveJob(report_id, sid, 10, 0);
      pollReportStatus(report_id, sid);
    } catch (err) {
      setRunning(false);
      setProgress(0);
      setRunStatus(null);
      setRunError(err.message || "Failed to start the pipeline.");
      setRunMessage(null);
      localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
    }
  };

  // ── STEP 3: Stop a running/queued pipeline ──
  // Local state is reset unconditionally in `finally`, regardless of whether
  // the cancel API call itself succeeds. The user clicking Stop should
  // always immediately stop the UI from showing "running" — if the backend
  // is unreachable or the job is already gone, there's nothing to wait for.
  const handleStopPipeline = async () => {
    if (!activeReportId || cancelling) return;
    setCancelling(true);
    try {
      await cancelReport(activeReportId);
    } catch (err) {
      console.error("Cancel request failed, clearing local state anyway:", err);
    } finally {
      resetActiveJobState({
        message: null,
      });
      fetchRows();
    }
  };

  const filteredRows = rows.filter((r) => {
    const q = search.toLowerCase();
    return (
      r.patient_id?.toLowerCase().includes(q) ||
      r.sid?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="ra-page">
      <div className="ra-header">
        <h1 className="ra-title">Report Automation</h1>
        <p className="ra-subtitle">Select a sample, check its input files, and run the report pipeline</p>{/* CHANGED */}
      </div>

      {/* ── Sample selection + Run workflow panel ───────────────────── */}{/* CHANGED */}
      <div className="ra-panel">
        {/* CHANGED — begin: replaces dropzone, detected-sid / warnings, and the three FileFields */}
        {!selectedSid && (
          <p className="ra-panel-hint">
            Choose a sample with “Use this sample” in the Sample Status table below to check its
            input files.
          </p>
        )}

        {selectedSid && (
          <>
            <div className="ra-selected-header">
              <div className="ra-detected-sid">
                Selected Sample ID: <strong>{selectedSid}</strong>
              </div>
              <button
                type="button"
                className="ra-clear-btn"
                onClick={handleClearSelection}
                disabled={running}
                title={running ? "Can't change the selection while a pipeline is running" : ""}
              >
                Clear selection
              </button>
            </div>

            {inputsLoading && (
              <p className="ra-panel-message">Checking input files on the share...</p>
            )}

            {inputsError && <p className="ra-panel-error">{inputsError}</p>}

            {inputs && (
              <>
                <div className="ra-panel-files">
                  <InputStatusField label="Germline" filename={inputs.germline} />
                  <InputStatusField label="Somatic" filename={inputs.somatic} />
                  <InputStatusField label="PRS" filename={inputs.prs} />
                </div>
                {!inputs.ready && (
                  <p className="ra-panel-warning">
                    Not ready to run. Place the missing file(s) under raw/{selectedSid}/ on the
                    share, then click “Re-check inputs” on this sample's row.
                  </p>
                )}
              </>
            )}
          </>
        )}
        {/* CHANGED — end */}

        {/* ── Run step feedback + real progress ── */}
        {runError && (
          <p className="ra-panel-error">
            Pipeline error: {runError}{" "}
            <button
              type="button"
              className="ra-reset-link"
              onClick={() => resetActiveJobState()}
            >
              Reset
            </button>
          </p>
        )}
        {runMessage && !runError && <p className="ra-panel-message">{runMessage}</p>}

        {(running || progress > 0) && (
          <div className="ra-progress-wrap">
            <div className="ra-progress-track">
              <div className="ra-progress-fill" style={{ width: `${progress}%` }} />
              <span className="ra-progress-horse" style={{ left: `${progress}%` }} role="img" aria-label="progress horse">
                🐦‍🔥
              </span>
            </div>
            <span className="ra-progress-percent">
              {Math.round(progress)}%{runStatus ? ` — ${runStatus}` : ""}
            </span>
          </div>
        )}

        {completedReportId && (
          <div className="ra-panel-actions">
            <a
              href={getReportDownloadUrl(completedReportId)}
              className="ra-run-btn ra-download-btn"
            >
              Download Report
            </a>
          </div>
        )}

        <div className="ra-panel-actions">
          <button
            onClick={handleRunPipeline}
            disabled={!canRun}
            className={`ra-run-btn ${!canRun ? "ra-run-btn-disabled" : ""}`}
            title={!canRun && !running ? "Select a sample whose input files are all found" : ""} // CHANGED
          >
            {running ? "Running..." : "Run Pipeline"}
          </button>

          {running && activeReportId && (
            <button
              onClick={handleStopPipeline}
              disabled={cancelling}
              className="ra-run-btn ra-stop-btn"
            >
              {cancelling ? "Stopping..." : "Stop Pipeline"}
            </button>
          )}
        </div>
      </div>

      {/* ── Status list ──────────────────────────────────────────────── */}
      <div className="ra-list-header">
        <h2 className="ra-list-title">Sample Status</h2>
        <input
          type="text"
          placeholder="Search by Patient ID or Sample ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ra-search-input"
        />
      </div>

      <div className="ra-table-card">
        <table className="ra-table">
          <thead>
            <tr>
              <th>Sample ID</th>
              <th>Patient ID</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={4} className="ra-empty-cell">Loading samples...</td></tr>
            )}

            {!loading && filteredRows.length === 0 && (
              <tr><td colSpan={4} className="ra-empty-cell">No samples found.</td></tr>
            )}

            {!loading &&
              filteredRows.map((row) => {
                const status = row.report_status || "Not Generated";
                const isSelected = row.sid === selectedSid; // CHANGED
                return (
                  <tr key={row.sid} className={isSelected ? "ra-row-selected" : ""}>{/* CHANGED (className) */}
                    <td className="ra-sample-id">{row.sid}</td>
                    <td className="ra-patient-id">{row.patient_id}</td>
                    <td><StatusBadge status={status} /></td>
                    <td>
                      {/* CHANGED — begin */}
                      <div className="ra-row-actions">
                        <button
                          type="button"
                          className={`ra-use-btn ${isSelected ? "ra-use-btn-active" : ""}`}
                          onClick={() => handleUseSample(row.sid)}
                          disabled={running}
                          title={running ? "Unavailable while a pipeline is running" : ""}
                        >
                          {isSelected ? "Re-check inputs" : "Use this sample"}
                        </button>
                        {/* CHANGED — end */}
                        {status === "Completed" && row.latest_report_id && (
                          <a href={getReportDownloadUrl(row.latest_report_id)} className="ra-download-link">
                            Download
                          </a>
                        )}
                      </div>{/* CHANGED */}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}