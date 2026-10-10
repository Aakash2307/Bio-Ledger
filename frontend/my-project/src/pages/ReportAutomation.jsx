import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  getReportAutomationList,
  getSampleInputs,
  generateReport,
  getReportStatus,
  cancelReport,
  getReportDownloadUrl,
  getSampleOutputDownloadUrl,
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

// Read-only row showing whether one input file (germline / somatic / prs) was
// found on the share.
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

// One output file from a sample's latest completed run.
const OUTPUT_KIND_LABEL = { germline: "Germline", somatic: "Somatic", prs: "PRS" };

function OutputLink({ sid, kind, filename }) {
  if (!filename) {
    return (
      <span className="ra-output-missing" title="Not produced by the latest completed run">
        —
      </span>
    );
  }
  return (
    <a
      href={getSampleOutputDownloadUrl(sid, kind)}
      download={filename}
      title={filename}
      className="ra-output-link"
    >
      {OUTPUT_KIND_LABEL[kind]}
    </a>
  );
}

// Maps GET /samples/{sid}/inputs failures to a clear message.
function inputsErrorMessage(err, sid) {
  if (err?.status === 404) return `Sample ${sid} was not found.`;
  if (err?.status === 503)
    return "The storage share is not mounted on the server, so input files can't be checked. Ask an admin to check the SMB mount, then try again.";
  return err?.message || "Failed to check input files.";
}

// De-duplicates the sample list by sid, keeping the row with the highest
// latest_report_id for each sample.
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

// Progress checkpoints per real pipeline stage (from master_pipeline.sh's 5 steps).
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
const MAX_CONSECUTIVE_POLL_FAILURES = 3;
const ACTIVE_STATUSES = ["Queued", "Processing"];

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "Not Generated", label: "Not generated" },
  { value: "Queued", label: "Queued" },
  { value: "Processing", label: "Processing" },
  { value: "Completed", label: "Completed" },
  { value: "Failed", label: "Failed" },
  { value: "Cancelled", label: "Cancelled" },
];

export default function ReportAutomation() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // CHANGED

  // How many samples are in each status, shown on the filter buttons.
  const statusCounts = useMemo(() => { // CHANGED
    const counts = { all: rows.length };
    for (const r of rows) {
      const s = r.report_status || "Not Generated";
      counts[s] = (counts[s] || 0) + 1;
    }
    return counts;
  }, [rows]);

  // selected sample for the input check / run panel
  const [selectedSid, setSelectedSid] = useState("");

  // ── input-check state ──
  const [inputs, setInputs] = useState(null);
  const [inputsLoading, setInputsLoading] = useState(false);
  const [inputsError, setInputsError] = useState(null);
  const inputsReqRef = useRef(0);

  // ── watched job state ──
  // The panel follows ONE job: the most recently queued one. Other queued
  // jobs are tracked in the table (they refresh every few seconds).
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState(null);
  const [runMessage, setRunMessage] = useState(null);
  const [runStatus, setRunStatus] = useState(null);
  const [progress, setProgress] = useState(0);
  const [activeReportId, setActiveReportId] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [completedReportId, setCompletedReportId] = useState(null);
  const pollTimerRef = useRef(null);
  const processingTicksRef = useRef(0);
  const consecutiveFailuresRef = useRef(0);

  // true whenever any row is queued or processing; read by the table refresh
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

  useEffect(() => {
    hasActiveJobRef.current = rows.some((r) => ACTIVE_STATUSES.includes(r.report_status));
  }, [rows]);

  // Refresh the table whenever any job is queued or processing,
  // even while the panel is watching one.
  useEffect(() => {
    const interval = setInterval(() => {
      if (hasActiveJobRef.current) fetchRows();
    }, TABLE_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchRows]);

  useEffect(() => {
    return () => clearInterval(pollTimerRef.current);
  }, []);

  // On mount: resume watching the job that was being followed before a refresh.
  useEffect(() => {
    const saved = localStorage.getItem(ACTIVE_JOB_STORAGE_KEY);
    if (!saved) return;
    try {
      const { reportId, sid, progress, ticks } = JSON.parse(saved);
      if (!reportId) return;
      setActiveReportId(reportId);
      setSelectedSid(sid || "");
      if (sid) loadInputs(sid);
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

  // The selected sample can be queued unless it already has a job waiting or running.
  const selectedRow = rows.find((r) => r.sid === selectedSid);
  const selectedAlreadyActive = ACTIVE_STATUSES.includes(selectedRow?.report_status);
  const canRun =
    Boolean(selectedSid) && inputs?.ready === true && !inputsLoading && !selectedAlreadyActive;

  const loadInputs = async (sid) => {
    const reqId = ++inputsReqRef.current;
    setInputs(null);
    setInputsError(null);
    setInputsLoading(true);
    try {
      const data = await getSampleInputs(sid);
      if (reqId !== inputsReqRef.current) return;
      setInputs(data);
    } catch (err) {
      if (reqId !== inputsReqRef.current) return;
      console.error("Failed to check sample inputs:", err);
      setInputsError(inputsErrorMessage(err, sid));
    } finally {
      if (reqId === inputsReqRef.current) setInputsLoading(false);
    }
  };

  const resetSelection = () => {
    inputsReqRef.current += 1;
    setSelectedSid("");
    setInputs(null);
    setInputsError(null);
    setInputsLoading(false);
  };

  // Selecting a sample is allowed while another job runs.
  const handleUseSample = (sid) => {
    setSelectedSid(sid);
    loadInputs(sid);
  };

  // Clearing the selection is allowed while another job runs.
  const handleClearSelection = () => {
    resetSelection();
  };

  const stopPolling = () => {
    clearInterval(pollTimerRef.current);
    pollTimerRef.current = null;
  };

  const persistActiveJob = (reportId, sid, progressValue, ticksValue) => {
    localStorage.setItem(
      ACTIVE_JOB_STORAGE_KEY,
      JSON.stringify({ reportId, sid, progress: progressValue, ticks: ticksValue })
    );
  };

  // Stops watching the current job. Does NOT touch other queued jobs.
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

  // Polls GET /reports/{report_id} for the job the panel is watching.
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
          setCompletedReportId(reportId);
          setActiveReportId(null);
          await fetchRows();
        } else if (report.status === "failed") {
          resetActiveJobState({ error: report.error_log || "Report generation failed." });
          await fetchRows();
        } else if (report.status === "cancelled") {
          resetActiveJobState({ message: `Pipeline cancelled for ${sidForMessage}.` });
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
        if (consecutiveFailuresRef.current >= MAX_CONSECUTIVE_POLL_FAILURES) {
          resetActiveJobState({
            error:
              "Lost connection to the server while checking pipeline status. Please check and try again.",
          });
        }
      }
    }, POLL_INTERVAL_MS);
  };

  // Queue a sample. Works while another sample is already running.
  const handleRunPipeline = async () => {
    if (!canRun) return;
    const sid = selectedSid.trim();
    setRunError(null);
    setRunMessage("Adding to the queue...");
    setRunStatus("queued");
    setRunning(true);
    setProgress(10);
    setCompletedReportId(null);
    processingTicksRef.current = 0;
    consecutiveFailuresRef.current = 0;

    try {
      const { report_id } = await generateReport(sid);
      setActiveReportId(report_id);
      persistActiveJob(report_id, sid, 10, 0);
      pollReportStatus(report_id, sid);
      fetchRows();
    } catch (err) {
      setRunning(false);
      setProgress(0);
      setRunStatus(null);
      setRunError(err.message || "Failed to queue the pipeline.");
      setRunMessage(null);
      localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
    }
  };

  // Stops the job the panel is watching (running or queued).
  const handleStopPipeline = async () => {
    if (!activeReportId || cancelling) return;
    setCancelling(true);
    try {
      await cancelReport(activeReportId);
    } catch (err) {
      console.error("Cancel request failed, clearing local state anyway:", err);
    } finally {
      resetActiveJobState({ message: null });
      fetchRows();
    }
  };

  // Cancel any queued or processing job from its table row.
  const handleCancelRow = async (reportId) => {
    try {
      await cancelReport(reportId);
    } catch (err) {
      console.error("Failed to cancel job:", err);
    }
    if (activeReportId === reportId) resetActiveJobState({ message: null });
    fetchRows();
  };

  // CHANGED: search and status filter both apply.
  const filteredRows = rows.filter((r) => {
    const q = search.toLowerCase();
    const matchesSearch =
      r.patient_id?.toLowerCase().includes(q) || r.sid?.toLowerCase().includes(q);
    const status = r.report_status || "Not Generated";
    const matchesStatus = statusFilter === "all" || status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="ra-page">
      <div className="ra-header">
        <h1 className="ra-title">Report Automation</h1>
        <p className="ra-subtitle">Select a sample, check its input files, and queue the report pipeline</p>
      </div>

      <div className="ra-panel">
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
              >
                Clear selection
              </button>
            </div>

            {inputsLoading && <p className="ra-panel-message">Checking input files on the share...</p>}

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
                {selectedAlreadyActive && (
                  <p className="ra-panel-message">
                    This sample already has a job {selectedRow.report_status.toLowerCase()}.
                  </p>
                )}
              </>
            )}
          </>
        )}

        {runError && (
          <p className="ra-panel-error">
            Pipeline error: {runError}{" "}
            <button type="button" className="ra-reset-link" onClick={() => resetActiveJobState()}>
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
            <a href={getReportDownloadUrl(completedReportId)} className="ra-run-btn ra-download-btn">
              Download Report
            </a>
          </div>
        )}

        <div className="ra-panel-actions">
          <button
            onClick={handleRunPipeline}
            disabled={!canRun}
            className={`ra-run-btn ${!canRun ? "ra-run-btn-disabled" : ""}`}
            title={
              selectedAlreadyActive
                ? "This sample already has a job queued or running"
                : !canRun
                ? "Select a sample whose input files are all found"
                : ""
            }
          >
            Queue Pipeline
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

      <div className="ra-list-header">
        <h2 className="ra-list-title">Sample Status</h2>
        {/* CHANGED: status filter buttons beside the search box */}
          <div className="ra-list-controls">
            <select
              className="ra-status-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              {STATUS_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label} ({statusCounts[f.value] || 0})
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Search by Patient ID or Sample ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ra-search-input"
            />
          </div>
      </div>

      <div className="ra-table-card">
        <table className="ra-table">
          <thead>
            <tr>
              <th>Sample ID</th>
              <th>Patient ID</th>
              <th>Status</th>
              <th>Germline</th>
              <th>Somatic</th>
              <th>PRS</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="ra-empty-cell">Loading samples...</td></tr>
            )}

            {/* CHANGED: explains when a filter or search causes the empty result */}
            {!loading && filteredRows.length === 0 && (
              <tr>
                <td colSpan={7} className="ra-empty-cell">
                  {statusFilter === "all" && !search
                    ? "No samples found."
                    : "No samples match this filter."}
                </td>
              </tr>
            )}

            {!loading &&
              filteredRows.map((row) => {
                const status = row.report_status || "Not Generated";
                const isSelected = row.sid === selectedSid;
                const isActive = ACTIVE_STATUSES.includes(row.report_status);
                return (
                  <tr key={row.sid} className={isSelected ? "ra-row-selected" : ""}>
                    <td className="ra-sample-id">{row.sid}</td>
                    <td className="ra-patient-id">{row.patient_id}</td>
                    <td><StatusBadge status={status} /></td>
                    <td><OutputLink sid={row.sid} kind="germline" filename={row.germline_output} /></td>
                    <td><OutputLink sid={row.sid} kind="somatic" filename={row.somatic_output} /></td>
                    <td><OutputLink sid={row.sid} kind="prs" filename={row.prs_output} /></td>
                    <td>
                      <div className="ra-row-actions">
                        <button
                          type="button"
                          className={`ra-use-btn ${isSelected ? "ra-use-btn-active" : ""}`}
                          onClick={() => handleUseSample(row.sid)}
                        >
                          {isSelected ? "Re-check inputs" : "Use this sample"}
                        </button>
                        {isActive && row.latest_report_id && (
                          <button
                            type="button"
                            className="ra-use-btn"
                            onClick={() => handleCancelRow(row.latest_report_id)}
                          >
                            Cancel
                          </button>
                        )}
                        {status === "Completed" && row.latest_report_id && (
                          <a href={getReportDownloadUrl(row.latest_report_id)} className="ra-download-link">
                            Download
                          </a>
                        )}
                      </div>
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