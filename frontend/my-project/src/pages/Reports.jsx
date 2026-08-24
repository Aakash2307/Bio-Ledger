import { useEffect, useState, useCallback } from "react";
import {
  getReportStats,
  getCompletedReports,
  getReportDownloadUrl,
  getReportViewUrl,
  deleteReport, // NEW — calls DELETE /reports/{report_id}
} from "../api"; // adjust this path to wherever your api.js actually lives
import "../css/Reports.css"; 

const ORGAN_CLASS_MAP = {
  colon: "rp-organ-orange",
  lung: "rp-organ-sky",
  breast: "rp-organ-pink",
  prostate: "rp-organ-indigo",
  blood: "rp-organ-red",
  liver: "rp-organ-amber",
  "head & neck": "rp-organ-purple",
};

function organClass(organ) {
  if (!organ) return "rp-organ-slate";
  return ORGAN_CLASS_MAP[organ.toLowerCase()] || "rp-organ-teal";
}

function initials(name, patientId) {
  const base = name && name !== "-" ? name : patientId || "?";
  return base.slice(0, 2).toUpperCase();
}

const AVATAR_CLASSES = [
  "rp-avatar-violet",
  "rp-avatar-blue",
  "rp-avatar-emerald",
  "rp-avatar-orange",
  "rp-avatar-pink",
  "rp-avatar-indigo",
];

function avatarClass(seed) {
  const i = (seed?.charCodeAt(0) || 0) % AVATAR_CLASSES.length;
  return AVATAR_CLASSES[i];
}

export default function Reports() {
  const [stats, setStats] = useState({ total_completed: 0, total_in_process: 0 });
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState(null); // report_id currently being deleted, disables its button
  const [deleteError, setDeleteError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [statsData, reportsData] = await Promise.all([
        getReportStats(),
        getCompletedReports(),
      ]);
      setStats(statsData);
      setReports(reportsData);
    } catch (err) {
      console.error("Failed to load reports data:", err);
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleDelete = async (report) => {
    const confirmed = window.confirm(
      `Delete the report for sample ${report.sid}? This cannot be undone.`
    );
    if (!confirmed) return;

    setDeleteError(null);
    setDeletingId(report.report_id);
    try {
      await deleteReport(report.report_id);
      // optimistic removal so the row disappears immediately
      setReports((prev) => prev.filter((r) => r.report_id !== report.report_id));
      // keep the stat counters accurate without waiting for the next 10s poll
      setStats((prev) => ({
        ...prev,
        total_completed: Math.max(0, (prev.total_completed || 0) - 1),
      }));
    } catch (err) {
      console.error("Failed to delete report:", err);
      setDeleteError(err.message || `Failed to delete report for ${report.sid}.`);
    } finally {
      setDeletingId(null);
    }
  };

  const filteredReports = reports.filter((r) => {
    const q = search.toLowerCase();
    return (
      r.patient_id?.toLowerCase().includes(q) ||
      // r.name?.toLowerCase().includes(q) ||
      r.sid?.toLowerCase().includes(q) ||
      r.organ_type?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="rp-page">
      <div className="rp-header">
        <h1 className="rp-title">Reports</h1>
        <p className="rp-subtitle">Generated clinical genomics reports</p>
      </div>

      <div className="rp-stats-grid">
        <div className="rp-stat-card rp-stat-purple">
          <div className="rp-stat-circle rp-stat-circle-1" />
          <div className="rp-stat-circle rp-stat-circle-2" />
          <div className="rp-stat-content">
            <div>
              <p className="rp-stat-label">Total Reports Generated</p>
              <p className="rp-stat-value">{stats.total_completed}</p>
            </div>
            <div className="rp-stat-icon">📄</div>
          </div>
        </div>

        <div className="rp-stat-card rp-stat-orange">
          <div className="rp-stat-circle rp-stat-circle-1" />
          <div className="rp-stat-circle rp-stat-circle-2" />
          <div className="rp-stat-content">
            <div>
              <p className="rp-stat-label">Reports In Process</p>
              <p className="rp-stat-value">{stats.total_in_process}</p>
            </div>
            <div className="rp-stat-icon">⏳</div>
          </div>
        </div>
      </div>

      <div className="rp-search-row">
        <input
          type="text"
          placeholder="Search by Patient ID, Name, Sample ID, or Organ Type..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rp-search-input"
        />
      </div>

      {deleteError && <p className="rp-delete-error">{deleteError}</p>}

      <div className="rp-table-card">
        <table className="rp-table">
          <thead>
            <tr>
              <th>Patient</th>
              <th>Sample ID</th>
              <th>Organ Type</th>
              <th>Release Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="rp-empty-cell">Loading reports...</td></tr>
            )}

            {!loading && filteredReports.length === 0 && (
              <tr><td colSpan={5} className="rp-empty-cell">No reports generated yet.</td></tr>
            )}

            {!loading &&
              filteredReports.map((r) => (
                <tr key={r.report_id}>
                  <td>
                    <div className="rp-patient-cell">
                      <div className={`rp-avatar ${avatarClass(r.patient_id)}`}>
                        {initials(r.name, r.patient_id)}
                      </div>
                      <div>
                        {/* <p className="rp-patient-name">{r.name && r.name !== "-" ? r.name : "—"}</p> */}
                        <p className="rp-patient-id-name">{r.patient_id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="rp-sample-id">{r.sid}</td>
                  <td>
                    <span className={`rp-organ-badge ${organClass(r.organ_type)}`}>
                      {r.organ_type || "Unspecified"}
                    </span>
                  </td>
                  <td className="rp-release-date">
                    {r.report_release_date || (r.completed_at ? r.completed_at.split("T")[0] : "—")}
                  </td>
                  <td>
                    <div className="rp-actions">
                      <div className="rp-actions-left">
                        <a href={getReportViewUrl(r.report_id)} target="_blank" rel="noopener noreferrer" className="rp-btn rp-btn-view">
                          View
                        </a>
                        <a href={getReportDownloadUrl(r.report_id)} className="rp-btn rp-btn-download">
                          Download
                        </a>
                      </div>
                      <button
                        onClick={() => handleDelete(r)}
                        disabled={deletingId === r.report_id}
                        className="rp-btn-delete-icon"
                        title="Delete this report"
                        aria-label="Delete this report"
                      >
                        {deletingId === r.report_id ? (
                          <span className="rp-delete-spinner" />
                        ) : (
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6" />
                            <path d="M14 11v6" />
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}