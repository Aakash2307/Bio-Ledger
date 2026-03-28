import React, { useEffect, useState, useRef, Fragment } from "react";
import { getPatients, getPatientDetails } from "../api";
import logo from "../assets/tzarnewlogo.png";
import { useNavigate } from "react-router-dom";
import BulkUploadModal from "./BulkUploadModel";
import { deletePatient as deletePatientApi } from "../api";

// ─── Status Badge ─────────────────────────────────────────────────────────────
const statusConfig = {
  New:          { bg: "#e8f8f0", color: "#2d9e6b", border: "#b3e8cf" },
  "In Progress":{ bg: "#fff8e8", color: "#c8820a", border: "#f5d98a" },
  Completed:    { bg: "#eaf2fb", color: "#2e72b8", border: "#b3d1f0" },
  Active:       { bg: "#e8f8f0", color: "#2d9e6b", border: "#b3e8cf" },
  Inactive:     { bg: "#f1f5f9", color: "#64748b", border: "#e2e8f0" },
  Done:         { bg: "#eaf2fb", color: "#2e72b8", border: "#b3d1f0" },
  Exhausted:    { bg: "#fef2f2", color: "#dc2626", border: "#fecaca" },
};

function StatusBadge({ status }) {
  const cfg = statusConfig[status] || { bg: "#f1f5f9", color: "#64748b", border: "#e2e8f0" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "4px 12px", borderRadius: 20,
      background: cfg.bg, color: cfg.color,
      border: `1px solid ${cfg.border}`,
      fontSize: 12, fontWeight: 600, letterSpacing: "0.02em",
      whiteSpace: "nowrap",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.color, flexShrink: 0 }} />
      {status || "—"}
    </span>
  );
}

// ─── Skeleton Row ─────────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr>
      {[30, 140, 110, 180, 50, 80, 120, 30].map((w, i) => (
        <td key={i} style={{ padding: "18px 16px" }}>
          <div style={{
            height: 13, width: w, borderRadius: 6,
            background: "linear-gradient(90deg,#f0f4f8 25%,#e2e8f0 50%,#f0f4f8 75%)",
            backgroundSize: "400% 100%",
            animation: "shimmer 1.4s ease infinite",
          }} />
        </td>
      ))}
    </tr>
  );
}

// ─── Detail Row (side panel) ──────────────────────────────────────────────────
function DetailRow({ label, value }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 2,
      padding: "10px 0", borderBottom: "1px solid #f1f5f9",
    }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em" }}>
        {label}
      </span>
      <span style={{ fontSize: 13, color: "#1e293b", fontWeight: 500, wordBreak: "break-word" }}>
        {String(value)}
      </span>
    </div>
  );
}

// ─── Deduplicate JOIN rows → one patient, samples array ──────────────────────
function deduplicatePatients(rows) {
  const map = {};
  for (const row of rows) {
    const key = row.id;
    if (!map[key]) {
      map[key] = {
        ...row,
        samples: [] // Create an array of sample objects
      };
    }
    // If the join returned a sample, push the details
    if (row.sample_id) {
      if (!map[key].samples.find(s => s.sample_id === row.sample_id)) {
        map[key].samples.push({
          sample_id: row.sample_id,
          new_case_label: row.new_case_label,
          sequencing: row.sequencing,
          dna_availability: row.dna_availability,
          report_status: row.report_status
        });
      }
    }
  }
  return Object.values(map);
}

// ─── Chevron icon ─────────────────────────────────────────────────────────────
function Chevron({ open }) {
  return (
    <svg
      width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{
        transition: "transform 0.2s ease",
        transform: open ? "rotate(90deg)" : "rotate(0deg)",
        color: open ? "#2563eb" : "#94a3b8",
      }}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

// ─── Trash Icon ───────────────────────────────────────────────────────────────
function TrashIcon({ style }) {
  return (
    <svg
      width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={style}
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PatientRecords() {
  const [patients, setPatients]               = useState([]);
  const [search, setSearch]                   = useState("");
  const [expandedIds, setExpandedIds]         = useState(new Set());
  const [selectedSample, setSelectedSample]   = useState(null);
  const [loadingDetail, setLoadingDetail]     = useState(false);
  const [fullDetail, setFullDetail]           = useState(null);
  const [loadingList, setLoadingList]         = useState(true);
  const [error, setError]                     = useState(null);
  const [deletingId, setDeletingId]           = useState(null);
  const navigate                              = useNavigate();
  const clickTimer                            = useRef(null);
  const [showBulkUpload, setShowBulkUpload]   = useState(false);

  useEffect(() => { loadPatients(); }, []);

  async function loadPatients() {
    setLoadingList(true);
    setError(null);
    try {
      const data = await getPatients();
      setPatients(deduplicatePatients(data));
    } catch (err) {
      console.error(err);
      setError("Failed to load patients. Is the API running?");
    } finally {
      setLoadingList(false);
    }
  }

  // ── Delete patient ──────────────────────────────────────────────────────────
  async function deletePatient(patientId, patientName, e) {
    e.stopPropagation();
    if (!confirm(`Delete patient "${patientName || "this patient"}"?\n\nThis will permanently remove them and all their samples.`)) return;

    setDeletingId(patientId);
    try {
      await deletePatientApi(patientId);
      if (selectedSample?.patient?.id === patientId) {
        setSelectedSample(null);
        setFullDetail(null);
      }
      setExpandedIds(prev => {
        const next = new Set(prev);
        next.delete(patientId);
        return next;
      });
      loadPatients();
    } catch (err) {
      console.error(err);
      alert("Failed to delete patient. Please try again.");
    } finally {
      setDeletingId(null);
    }
  }

  function toggleExpand(patientId, e) {
    e.stopPropagation();
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(patientId) ? next.delete(patientId) : next.add(patientId);
      return next;
    });
  }

  function handlePatientClick(patientId, e) {
    if (e.detail === 2) {
      clearTimeout(clickTimer.current);
      navigate(`/view-patient/${patientId}`);
      return;
    }
    toggleExpand(patientId, e);
  }

  async function openSample(patientId, sampleId) {
    setSelectedSample(null);
    setFullDetail(null);
    setLoadingDetail(true);
    try {
      const data = await getPatientDetails(patientId);
      // Find exactly the matched sample using its unique ID
      const matchedSample = data.samples.find(s => s.id === sampleId) || data.samples[0];
      setFullDetail(data);
      setSelectedSample({ patient: data.patient, sample: matchedSample });
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDetail(false);
    }
  }

  // ── Search ──
  const q = search.toLowerCase().trim();

  const getScore = (p) => {
    const aob    = (p.aob_id ?? "").toLowerCase();
    const name   = (p.name   ?? "").toLowerCase();
    const labels = (p.samples ?? []).map(s => (s.new_case_label || "").toLowerCase());
    if (aob === q || name === q || labels.includes(q)) return 0;
    if (aob.startsWith(q) || name.startsWith(q) || labels.some(l => l.startsWith(q))) return 1;
    return 2;
  };

  const filtered = !q
    ? patients
    : patients
        .filter(p =>
          (p.aob_id ?? "").toLowerCase().includes(q) ||
          (p.name   ?? "").toLowerCase().includes(q) ||
          (p.sid ?? "").toLowerCase().includes(q) ||
          (p.samples ?? []).some(s => (s.new_case_label || "").toLowerCase().includes(q))
        )
        .sort((a, b) => getScore(a) - getScore(b));

  const activePanelPatientId = selectedSample?.patient?.id;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #f1f5f9; font-family: 'DM Sans', sans-serif; }
        @keyframes shimmer  { 0%{background-position:100% 0} 100%{background-position:-100% 0} }
        @keyframes slideUp  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:none} }
        @keyframes slideInRight { from{opacity:0;transform:translateX(24px)} to{opacity:1;transform:none} }
        @keyframes fadeIn   { from{opacity:0} to{opacity:1} }
        @keyframes expandIn { from{opacity:0;transform:scaleY(0.95)} to{opacity:1;transform:scaleY(1)} }

        .patient-row { transition: background 0.12s; cursor: pointer; }
        .patient-row:hover { background: #f8fafc !important; }
        .patient-row:hover .aob-link { color: #1d4ed8 !important; }
        .patient-row.active-row { background: #eff6ff !important; }
        .patient-row.active-row .aob-link { color: #1d4ed8 !important; }

        .sample-row { transition: background 0.1s; cursor: pointer; }
        .sample-row:hover { background: #f0f9ff !important; }
        .sample-row.active-sample { background: #dbeafe !important; }

        .delete-btn { transition: all 0.15s; }
        .delete-btn:hover { background: #fef2f2 !important; border-color: #fecaca !important; }
        .delete-btn:hover svg { color: #dc2626 !important; }
        .delete-btn:active { transform: scale(0.93); }

        .delete-btn.deleting { opacity: 0.5; pointer-events: none; }
      `}</style>

      <div style={{ minHeight: "100vh", background: "#f1f5f9", fontFamily: "'DM Sans', sans-serif" }}>

        {/* ── Header ── */}
        <div style={{
          background: "#fff", borderBottom: "1px solid #e8edf3",
          padding: "0 32px", position: "sticky", top: 0, zIndex: 200,
        }}>
          <div style={{
            maxWidth: 1400, margin: "0 auto",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            height: 70,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <img src={logo} alt="TZAR Labs" style={{ height: 40, objectFit: "contain" }}
                onError={e => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }} />
              <div style={{
                width: 40, height: 40, borderRadius: 10, display: "none",
                background: "linear-gradient(135deg,#dbeafe,#bfdbfe)",
                alignItems: "center", justifyContent: "center", fontSize: 20,
              }}>🧬</div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.01em" }}>Patient Records</div>
                <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500, marginTop: 1 }}>Exome Patient Management</div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                onClick={() => setShowBulkUpload(true)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "10px 20px", borderRadius: 10,
                  border: "1.5px solid #e2e8f0", background: "#fff",
                  color: "#334155", fontSize: 14, fontWeight: 700,
                  cursor: "pointer", transition: "all 0.15s",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#3b82f6"; e.currentTarget.style.color = "#2563eb"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.color = "#334155"; }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                Bulk Upload
              </button>

              <button onClick={() => navigate("/add-patient")} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "10px 20px", borderRadius: 10, border: "none",
                background: "#2563eb", color: "#fff", fontSize: 14, fontWeight: 700,
                cursor: "pointer", boxShadow: "0 2px 8px rgba(37,99,235,0.3)", transition: "all 0.15s",
              }}
                onMouseEnter={e => { e.currentTarget.style.background = "#1d4ed8"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "#2563eb"; e.currentTarget.style.transform = "none"; }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <line x1="19" y1="8" x2="19" y2="14"/>
                  <line x1="22" y1="11" x2="16" y2="11"/>
                </svg>
                Add Patient
              </button>
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "28px 32px", display: "flex", gap: 24, alignItems: "flex-start" }}>

          {/* Left: Search + Table */}
          <div style={{ flex: 1, minWidth: 0 }}>

            <div style={{ position: "relative", maxWidth: 460, marginBottom: 24 }}>
              <svg style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", pointerEvents: "none" }}
                width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by Name, AOB ID, or Case Label..."
                style={{
                  width: "100%", padding: "11px 40px 11px 42px", borderRadius: 10,
                  border: "1.5px solid #e2e8f0", background: "#fff", fontSize: 14,
                  color: "#0f172a", outline: "none", fontFamily: "inherit",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.04)", transition: "border-color 0.15s, box-shadow 0.15s",
                }}
                onFocus={e => { e.target.style.borderColor = "#3b82f6"; e.target.style.boxShadow = "0 0 0 3px rgba(59,130,246,0.12)"; }}
                onBlur={e => { e.target.style.borderColor = "#e2e8f0"; e.target.style.boxShadow = "0 1px 4px rgba(0,0,0,0.04)"; }}
              />
              {search && (
                <button onClick={() => setSearch("")} style={{
                  position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                  background: "#e2e8f0", border: "none", borderRadius: "50%",
                  width: 20, height: 20, cursor: "pointer", fontSize: 14, color: "#64748b",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>×</button>
              )}
            </div>

            {error && (
              <div style={{
                padding: "12px 16px", borderRadius: 10, marginBottom: 16,
                background: "#fef2f2", border: "1px solid #fecaca",
                color: "#dc2626", fontSize: 13, fontWeight: 500,
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <span>⚠️</span> {error}
              </div>
            )}

            <div style={{
              background: "#fff", borderRadius: 16, border: "1px solid #e8edf3",
              boxShadow: "0 2px 12px rgba(0,0,0,0.05)", overflow: "hidden",
            }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e8edf3" }}>
                      <th style={{ width: 44, padding: "13px 8px 13px 16px" }} />
                      {["AOB ID", "SID", "Name", "Age", "Gender", "Samples", ""].map((h, i) => (
                        <th key={i} style={{
                          padding: "13px 16px", textAlign: i === 6 ? "right" : "left",
                          fontSize: 11, fontWeight: 700, color: "#94a3b8",
                          letterSpacing: "0.08em", textTransform: "uppercase",
                          fontFamily: "'DM Mono', monospace", whiteSpace: "nowrap",
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loadingList ? (
                      Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
                    ) : filtered.length === 0 ? (
                      <tr>
                        <td colSpan={8} style={{ padding: "60px 16px", textAlign: "center" }}>
                          <div style={{ fontSize: 32, marginBottom: 10 }}>🔍</div>
                          <div style={{ fontSize: 15, fontWeight: 600, color: "#64748b" }}>No patients found</div>
                          <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4 }}>
                            {search ? `No results for "${search}"` : "No patients yet — add one to get started"}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filtered.map((p, idx) => {
                        const isExpanded  = expandedIds.has(p.id);
                        const isActive    = activePanelPatientId === p.id;
                        const hasSamples  = p.samples && p.samples.length > 0;
                        const isDeleting  = deletingId === p.id;

                        return (
                          <Fragment key={p.id}>
                            <tr
                              className={`patient-row${isActive ? " active-row" : ""}`}
                              onClick={e => handlePatientClick(p.id, e)}
                              style={{
                                borderBottom: isExpanded ? "none" : (idx < filtered.length - 1 ? "1px solid #f1f5f9" : "none"),
                                background: isActive ? "#eff6ff" : "#fff",
                                animation: `slideUp 0.2s ease ${idx * 0.03}s both`,
                                opacity: isDeleting ? 0.5 : 1,
                                transition: "opacity 0.2s",
                              }}
                            >
                              <td style={{ padding: "17px 8px 17px 16px", width: 44 }}>
                                {hasSamples ? (
                                  <div style={{
                                    width: 26, height: 26, borderRadius: 7,
                                    background: isExpanded ? "#eff6ff" : "#f8fafc",
                                    border: `1px solid ${isExpanded ? "#bfdbfe" : "#e2e8f0"}`,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    transition: "all 0.15s",
                                  }}>
                                    <Chevron open={isExpanded} />
                                  </div>
                                ) : (
                                  <div style={{ width: 26 }} />
                                )}
                              </td>

                              <td style={{ padding: "17px 16px" }}>
                                <span className="aob-link" style={{
                                  color: "#2563eb", fontSize: 13, fontWeight: 600,
                                  fontFamily: "'DM Mono', monospace", transition: "color 0.15s",
                                }}>{p.aob_id || "—"}</span>
                              </td>

                              <td style={{ padding: "17px 16px" }}>
                                <span style={{ color: "#64748b", fontSize: 13, fontFamily: "'DM Mono', monospace" }}>
                                  {p.sid || "—"}
                                </span>
                              </td>

                              <td style={{ padding: "17px 16px" }}>
                                <span style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>
                                  {p.name || "—"}
                                </span>
                              </td>

                              <td style={{ padding: "17px 16px" }}>
                                <span style={{ fontSize: 14, color: "#334155" }}>{p.age ?? "—"}</span>
                              </td>

                              <td style={{ padding: "17px 16px" }}>
                                <span style={{ fontSize: 14, color: "#334155" }}>{p.gender || "—"}</span>
                              </td>

                              <td style={{ padding: "17px 16px" }}>
                                {hasSamples ? (
                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <span style={{
                                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                                      width: 22, height: 22, borderRadius: "50%",
                                      background: "#eff6ff", border: "1px solid #bfdbfe",
                                      fontSize: 11, fontWeight: 700, color: "#2563eb",
                                    }}>
                                      {p.samples.length}
                                    </span>
                                    <span style={{ fontSize: 12, color: "#64748b" }}>
                                      sample{p.samples.length !== 1 ? "s" : ""}
                                    </span>
                                    <span style={{ fontSize: 11, color: "#94a3b8" }}>
                                      {isExpanded ? "▲ collapse" : "▼ expand"}
                                    </span>
                                  </div>
                                ) : (
                                  <span style={{ fontSize: 13, color: "#cbd5e1" }}>No samples</span>
                                )}
                              </td>

                              <td
                                style={{ padding: "17px 16px 17px 8px", textAlign: "right" }}
                                onClick={e => e.stopPropagation()}
                              >
                                <button
                                  title="Delete patient"
                                  className={`delete-btn${isDeleting ? " deleting" : ""}`}
                                  onClick={e => deletePatient(p.id, p.name, e)}
                                  style={{
                                    width: 30, height: 30, borderRadius: 7,
                                    border: "1px solid transparent",
                                    background: "transparent",
                                    cursor: isDeleting ? "not-allowed" : "pointer",
                                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                                    color: "#94a3b8",
                                  }}
                                >
                                  {isDeleting ? (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                      stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round"
                                      style={{ animation: "spin 0.7s linear infinite" }}>
                                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                    </svg>
                                  ) : (
                                    <TrashIcon style={{ transition: "color 0.15s" }} />
                                  )}
                                </button>
                              </td>
                            </tr>

                            {isExpanded && hasSamples && (
                              <tr>
                                <td colSpan={8} style={{ padding: 0, borderBottom: "1px solid #e8edf3" }}>
                                  <div style={{
                                    background: "#f8faff",
                                    borderTop: "1px solid #dbeafe",
                                    animation: "expandIn 0.18s ease",
                                    transformOrigin: "top",
                                  }}>
                                    <div style={{
                                      display: "grid",
                                      gridTemplateColumns: "44px 1fr 1fr 1fr 1fr",
                                      padding: "8px 0",
                                      borderBottom: "1px solid #e2e8f0",
                                    }}>
                                      <div />
                                      {["Case Label", "Sequencing", "DNA Availability", "Report Status"].map(h => (
                                        <div key={h} style={{
                                          padding: "0 16px",
                                          fontSize: 10, fontWeight: 700, color: "#94a3b8",
                                          textTransform: "uppercase", letterSpacing: "0.08em",
                                          fontFamily: "'DM Mono', monospace",
                                        }}>{h}</div>
                                      ))}
                                    </div>

                                    {p.samples.map((samp, si) => {
                                      const isActiveSample =
                                        selectedSample?.patient?.id === p.id &&
                                        selectedSample?.sample?.id === samp.sample_id;
                                        
                                      return (
                                        <div
                                          key={`${p.id}-s-${samp.sample_id}`}
                                          className={`sample-row${isActiveSample ? " active-sample" : ""}`}
                                          onClick={(e) => {
                                            if (e.detail === 2) {
                                              navigate(`/view-patient/${p.id}`);
                                              return;
                                            }
                                            openSample(p.id, samp.sample_id);
                                          }}
                                          style={{
                                            display: "grid",
                                            gridTemplateColumns: "44px 1fr 1fr 1fr 1fr",
                                            padding: "11px 0",
                                            borderBottom: si < p.samples.length - 1 ? "1px solid #e8edf3" : "none",
                                            background: isActiveSample ? "#dbeafe" : "transparent",
                                            transition: "background 0.1s",
                                          }}
                                        >
                                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                                            <div style={{
                                              width: 6, height: 6, borderRadius: "50%",
                                              background: isActiveSample ? "#2563eb" : "#93c5fd",
                                            }} />
                                          </div>
                                          <div style={{ padding: "0 16px" }}>
                                            <span style={{
                                              fontSize: 13, fontWeight: 600, color: "#1e40af",
                                              fontFamily: "'DM Mono', monospace",
                                            }}>{samp.new_case_label || "No Label"}</span>
                                          </div>
                                          <div style={{ padding: "0 16px" }}>
                                            <span style={{ fontSize: 12, color: "#64748b" }}>{samp.sequencing || "—"}</span>
                                          </div>
                                          <div style={{ padding: "0 16px" }}>
                                            <span style={{ fontSize: 12, color: "#64748b" }}>{samp.dna_availability || "—"}</span>
                                          </div>
                                          <div style={{ padding: "0 16px" }}>
                                            <span style={{ fontSize: 12, color: "#64748b" }}>{samp.report_status || "—"}</span>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div style={{
                padding: "11px 20px", borderTop: "1px solid #f1f5f9",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <span style={{ fontSize: 12, color: "#94a3b8" }}>
                  {loadingList
                    ? "Loading…"
                    : `Showing ${filtered.length} of ${patients.length} patient${patients.length !== 1 ? "s" : ""}`}
                </span>
                {search && !loadingList && (
                  <span style={{ fontSize: 12, color: "#64748b" }}>
                    Filtered by <strong>"{search}"</strong>
                  </span>
                )}
              </div>
            </div>
          </div>

          {(selectedSample || loadingDetail) && (
            <div style={{
              width: 320, flexShrink: 0,
              background: "#fff", borderRadius: 16,
              border: "1px solid #e8edf3",
              boxShadow: "0 4px 20px rgba(0,0,0,0.07)",
              animation: "slideInRight 0.22s ease",
              position: "sticky", top: 90,
              maxHeight: "calc(100vh - 110px)", overflowY: "auto",
            }}>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "18px 20px", borderBottom: "1px solid #f1f5f9",
                position: "sticky", top: 0, background: "#fff", zIndex: 10,
                borderRadius: "16px 16px 0 0",
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                    {loadingDetail ? "Loading…" : selectedSample?.sample?.new_case_label || "Sample Details"}
                  </div>
                  {selectedSample && !loadingDetail && (
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2, fontFamily: "'DM Mono', monospace" }}>
                      {selectedSample.patient?.name || ""}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => { setSelectedSample(null); setFullDetail(null); }}
                  style={{
                    background: "#f0f4f8", border: "none", borderRadius: 8,
                    width: 30, height: 30, cursor: "pointer", fontSize: 16, color: "#64748b",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "#e2e8f0"}
                  onMouseLeave={e => e.currentTarget.style.background = "#f0f4f8"}
                >×</button>
              </div>

              <div style={{ padding: "8px 20px 20px" }}>
                {loadingDetail ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 16 }}>
                    {[120, 90, 140, 80, 110, 100, 130, 90].map((w, i) => (
                      <div key={i} style={{
                        height: 13, width: w, borderRadius: 6,
                        background: "linear-gradient(90deg,#f0f4f8 25%,#e2e8f0 50%,#f0f4f8 75%)",
                        backgroundSize: "400% 100%",
                        animation: "shimmer 1.4s ease infinite",
                      }} />
                    ))}
                  </div>
                ) : selectedSample && (
                  <div style={{ animation: "fadeIn 0.2s ease", paddingTop: 16 }}>
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>
                        Name
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
                        {selectedSample.patient?.name || "—"}
                      </div>
                    </div>

                    <DetailRow label="Patient ID" value={selectedSample.patient?.patient_id} />
                    <DetailRow label="Case Label" value={selectedSample.sample?.new_case_label} />
                    <DetailRow label="SID" value={selectedSample.patient?.sid} />
                    
                    <div style={{ paddingTop: 16 }}>
                      <button
                        onClick={() => navigate(`/view-patient/${selectedSample.patient?.id}`)}
                        style={{
                          width: "100%", padding: "10px", borderRadius: 9,
                          border: "none", background: "#2563eb", color: "#fff",
                          fontSize: 13, fontWeight: 700, cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                          transition: "all 0.15s", boxShadow: "0 2px 8px rgba(37,99,235,0.25)",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = "#1d4ed8"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "#2563eb"; e.currentTarget.style.transform = "none"; }}
                      >
                        View Full Patient Record
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {showBulkUpload && (
        <BulkUploadModal
          onClose={() => setShowBulkUpload(false)}
          onDone={() => {
            setShowBulkUpload(false);
            loadPatients();
          }}
        />
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}













































































































// import { useEffect, useState, useRef } from "react";
// import { getPatients, getPatientDetails } from "../api";
// import logo from "../assets/tzarnewlogo.png";
// import { useNavigate } from "react-router-dom";
// import BulkUploadModal from "./BulkUploadModel";
// import { deletePatient as deletePatientApi } from "../api";

// // ─── Status Badge ─────────────────────────────────────────────────────────────
// const statusConfig = {
//   New:          { bg: "#e8f8f0", color: "#2d9e6b", border: "#b3e8cf" },
//   "In Progress":{ bg: "#fff8e8", color: "#c8820a", border: "#f5d98a" },
//   Completed:    { bg: "#eaf2fb", color: "#2e72b8", border: "#b3d1f0" },
//   Active:       { bg: "#e8f8f0", color: "#2d9e6b", border: "#b3e8cf" },
//   Inactive:     { bg: "#f1f5f9", color: "#64748b", border: "#e2e8f0" },
//   Done:         { bg: "#eaf2fb", color: "#2e72b8", border: "#b3d1f0" },
//   Exhausted:    { bg: "#fef2f2", color: "#dc2626", border: "#fecaca" },
// };

// function StatusBadge({ status }) {
//   const cfg = statusConfig[status] || { bg: "#f1f5f9", color: "#64748b", border: "#e2e8f0" };
//   return (
//     <span style={{
//       display: "inline-flex", alignItems: "center", gap: 5,
//       padding: "4px 12px", borderRadius: 20,
//       background: cfg.bg, color: cfg.color,
//       border: `1px solid ${cfg.border}`,
//       fontSize: 12, fontWeight: 600, letterSpacing: "0.02em",
//       whiteSpace: "nowrap",
//     }}>
//       <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.color, flexShrink: 0 }} />
//       {status || "—"}
//     </span>
//   );
// }

// // ─── Skeleton Row ─────────────────────────────────────────────────────────────
// function SkeletonRow() {
//   return (
//     <tr>
//       {[30, 140, 110, 180, 50, 80, 120, 30].map((w, i) => (
//         <td key={i} style={{ padding: "18px 16px" }}>
//           <div style={{
//             height: 13, width: w, borderRadius: 6,
//             background: "linear-gradient(90deg,#f0f4f8 25%,#e2e8f0 50%,#f0f4f8 75%)",
//             backgroundSize: "400% 100%",
//             animation: "shimmer 1.4s ease infinite",
//           }} />
//         </td>
//       ))}
//     </tr>
//   );
// }

// // ─── Detail Row (side panel) ──────────────────────────────────────────────────
// function DetailRow({ label, value }) {
//   if (value === undefined || value === null || value === "") return null;
//   return (
//     <div style={{
//       display: "flex", flexDirection: "column", gap: 2,
//       padding: "10px 0", borderBottom: "1px solid #f1f5f9",
//     }}>
//       <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em" }}>
//         {label}
//       </span>
//       <span style={{ fontSize: 13, color: "#1e293b", fontWeight: 500, wordBreak: "break-word" }}>
//         {String(value)}
//       </span>
//     </div>
//   );
// }

// // ─── Deduplicate JOIN rows → one patient, samples array ──────────────────────
// function deduplicatePatients(rows) {
//   const map = {};
//   for (const row of rows) {
//     const key = row.id;
//     if (!map[key]) {
//       map[key] = {
//         ...row,
//         case_labels: row.new_case_label ? [row.new_case_label] : [],
//         _samples: row.new_case_label ? [{ new_case_label: row.new_case_label }] : [],
//       };
//     } else {
//       if (row.new_case_label && !map[key].case_labels.includes(row.new_case_label)) {
//         map[key].case_labels.push(row.new_case_label);
//         map[key]._samples.push({ new_case_label: row.new_case_label });
//       }
//     }
//   }
//   return Object.values(map);
// }

// // ─── Chevron icon ─────────────────────────────────────────────────────────────
// function Chevron({ open }) {
//   return (
//     <svg
//       width="14" height="14" viewBox="0 0 24 24" fill="none"
//       stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
//       style={{
//         transition: "transform 0.2s ease",
//         transform: open ? "rotate(90deg)" : "rotate(0deg)",
//         color: open ? "#2563eb" : "#94a3b8",
//       }}
//     >
//       <polyline points="9 18 15 12 9 6" />
//     </svg>
//   );
// }

// // ─── Trash Icon ───────────────────────────────────────────────────────────────
// function TrashIcon({ style }) {
//   return (
//     <svg
//       width="14" height="14" viewBox="0 0 24 24" fill="none"
//       stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
//       style={style}
//     >
//       <polyline points="3 6 5 6 21 6" />
//       <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
//       <path d="M10 11v6" />
//       <path d="M14 11v6" />
//       <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
//     </svg>
//   );
// }

// // ─── Main Page ────────────────────────────────────────────────────────────────
// export default function PatientRecords() {
//   const [patients, setPatients]               = useState([]);
//   const [search, setSearch]                   = useState("");
//   const [expandedIds, setExpandedIds]         = useState(new Set());
//   const [selectedSample, setSelectedSample]   = useState(null);
//   const [loadingDetail, setLoadingDetail]     = useState(false);
//   const [fullDetail, setFullDetail]           = useState(null);
//   const [loadingList, setLoadingList]         = useState(true);
//   const [error, setError]                     = useState(null);
//   const [deletingId, setDeletingId]           = useState(null);   // tracks which patient is being deleted
//   const navigate                              = useNavigate();
//   const clickTimer                            = useRef(null);
//   const [showBulkUpload, setShowBulkUpload]   = useState(false);

//   useEffect(() => { loadPatients(); }, []);

//   async function loadPatients() {
//     setLoadingList(true);
//     setError(null);
//     try {
//       const data = await getPatients();
//       setPatients(deduplicatePatients(data));
//     } catch (err) {
//       console.error(err);
//       setError("Failed to load patients. Is the API running?");
//     } finally {
//       setLoadingList(false);
//     }
//   }

//   // ── Delete patient ──────────────────────────────────────────────────────────
// async function deletePatient(patientId, patientName, e) {
//   e.stopPropagation();
//   if (!confirm(`Delete patient "${patientName || "this patient"}"?\n\nThis will permanently remove them and all their samples.`)) return;

//   setDeletingId(patientId);
//   try {
//     await deletePatientApi(patientId);   // ← uses the api.js function now

//     if (selectedSample?.patient?.id === patientId) {
//       setSelectedSample(null);
//       setFullDetail(null);
//     }
//     setExpandedIds(prev => {
//       const next = new Set(prev);
//       next.delete(patientId);
//       return next;
//     });
//     loadPatients();
//   } catch (err) {
//     console.error(err);
//     alert("Failed to delete patient. Please try again.");
//   } finally {
//     setDeletingId(null);
//   }
// }

//   // Toggle expand/collapse for a patient row
//   function toggleExpand(patientId, e) {
//     e.stopPropagation();
//     setExpandedIds(prev => {
//       const next = new Set(prev);
//       next.has(patientId) ? next.delete(patientId) : next.add(patientId);
//       return next;
//     });
//   }

//   function handlePatientClick(patientId, e) {
//     if (e.detail === 2) {
//       clearTimeout(clickTimer.current);
//       navigate(`/view-patient/${patientId}`);
//       return;
//     }
//     toggleExpand(patientId, e);
//   }

//   async function openSample(patientId, sampleLabel) {
//     setSelectedSample(null);
//     setFullDetail(null);
//     setLoadingDetail(true);
//     try {
//       const data = await getPatientDetails(patientId);
//       const matchedSample = data.samples.find(s => s.new_case_label === sampleLabel) || data.samples[0];
//       setFullDetail(data);
//       setSelectedSample({ patient: data.patient, sample: matchedSample });
//     } catch (err) {
//       console.error(err);
//     } finally {
//       setLoadingDetail(false);
//     }
//   }

//   // ── Search ──
//   const q = search.toLowerCase().trim();

//   const getScore = (p) => {
//     const aob    = (p.aob_id ?? "").toLowerCase();
//     const name   = (p.name   ?? "").toLowerCase();
//     const labels = (p.case_labels ?? []).map(l => l.toLowerCase());
//     if (aob === q || name === q || labels.includes(q))                                 return 0;
//     if (aob.startsWith(q) || name.startsWith(q) || labels.some(l => l.startsWith(q))) return 1;
//     return 2;
//   };

//   const filtered = !q
//     ? patients
//     : patients
//         .filter(p =>
//           (p.aob_id ?? "").toLowerCase().includes(q) ||
//           (p.name   ?? "").toLowerCase().includes(q) ||
//           (p.sid ?? "").toLowerCase().includes(q) ||
//           (p.case_labels ?? []).some(l => l.toLowerCase().includes(q))
//         )
//         .sort((a, b) => getScore(a) - getScore(b));

//   const activePanelPatientId = selectedSample?.patient?.id;

//   return (
//     <>
//       <style>{`
//         @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
//         * { box-sizing: border-box; margin: 0; padding: 0; }
//         body { background: #f1f5f9; font-family: 'DM Sans', sans-serif; }
//         @keyframes shimmer  { 0%{background-position:100% 0} 100%{background-position:-100% 0} }
//         @keyframes slideUp  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:none} }
//         @keyframes slideInRight { from{opacity:0;transform:translateX(24px)} to{opacity:1;transform:none} }
//         @keyframes fadeIn   { from{opacity:0} to{opacity:1} }
//         @keyframes expandIn { from{opacity:0;transform:scaleY(0.95)} to{opacity:1;transform:scaleY(1)} }

//         .patient-row { transition: background 0.12s; cursor: pointer; }
//         .patient-row:hover { background: #f8fafc !important; }
//         .patient-row:hover .aob-link { color: #1d4ed8 !important; }
//         .patient-row.active-row { background: #eff6ff !important; }
//         .patient-row.active-row .aob-link { color: #1d4ed8 !important; }

//         .sample-row { transition: background 0.1s; cursor: pointer; }
//         .sample-row:hover { background: #f0f9ff !important; }
//         .sample-row.active-sample { background: #dbeafe !important; }

//         .delete-btn { transition: all 0.15s; }
//         .delete-btn:hover { background: #fef2f2 !important; border-color: #fecaca !important; }
//         .delete-btn:hover svg { color: #dc2626 !important; }
//         .delete-btn:active { transform: scale(0.93); }

//         .delete-btn.deleting { opacity: 0.5; pointer-events: none; }
//       `}</style>

//       <div style={{ minHeight: "100vh", background: "#f1f5f9", fontFamily: "'DM Sans', sans-serif" }}>

//         {/* ── Header ── */}
//         <div style={{
//           background: "#fff", borderBottom: "1px solid #e8edf3",
//           padding: "0 32px", position: "sticky", top: 0, zIndex: 200,
//         }}>
//           <div style={{
//             maxWidth: 1400, margin: "0 auto",
//             display: "flex", alignItems: "center", justifyContent: "space-between",
//             height: 70,
//           }}>
//             <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
//               <img src={logo} alt="TZAR Labs" style={{ height: 40, objectFit: "contain" }}
//                 onError={e => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }} />
//               <div style={{
//                 width: 40, height: 40, borderRadius: 10, display: "none",
//                 background: "linear-gradient(135deg,#dbeafe,#bfdbfe)",
//                 alignItems: "center", justifyContent: "center", fontSize: 20,
//               }}>🧬</div>
//               <div>
//                 <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.01em" }}>Patient Records</div>
//                 <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500, marginTop: 1 }}>Exome Patient Management</div>
//               </div>
//             </div>

//             <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
//               {/* Bulk Upload button */}
//               <button
//                 onClick={() => setShowBulkUpload(true)}
//                 style={{
//                   display: "flex", alignItems: "center", gap: 8,
//                   padding: "10px 20px", borderRadius: 10,
//                   border: "1.5px solid #e2e8f0", background: "#fff",
//                   color: "#334155", fontSize: 14, fontWeight: 700,
//                   cursor: "pointer", transition: "all 0.15s",
//                   boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
//                 }}
//                 onMouseEnter={e => { e.currentTarget.style.borderColor = "#3b82f6"; e.currentTarget.style.color = "#2563eb"; }}
//                 onMouseLeave={e => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.color = "#334155"; }}
//               >
//                 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
//                   <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
//                   <polyline points="17 8 12 3 7 8"/>
//                   <line x1="12" y1="3" x2="12" y2="15"/>
//                 </svg>
//                 Bulk Upload
//               </button>

//               <button onClick={() => navigate("/add-patient")} style={{
//                 display: "flex", alignItems: "center", gap: 8,
//                 padding: "10px 20px", borderRadius: 10, border: "none",
//                 background: "#2563eb", color: "#fff", fontSize: 14, fontWeight: 700,
//                 cursor: "pointer", boxShadow: "0 2px 8px rgba(37,99,235,0.3)", transition: "all 0.15s",
//               }}
//                 onMouseEnter={e => { e.currentTarget.style.background = "#1d4ed8"; e.currentTarget.style.transform = "translateY(-1px)"; }}
//                 onMouseLeave={e => { e.currentTarget.style.background = "#2563eb"; e.currentTarget.style.transform = "none"; }}
//               >
//                 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
//                   <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
//                   <circle cx="9" cy="7" r="4"/>
//                   <line x1="19" y1="8" x2="19" y2="14"/>
//                   <line x1="22" y1="11" x2="16" y2="11"/>
//                 </svg>
//                 Add Patient
//               </button>
//             </div>
//           </div>
//         </div>

//         {/* ── Body ── */}
//         <div style={{ maxWidth: 1400, margin: "0 auto", padding: "28px 32px", display: "flex", gap: 24, alignItems: "flex-start" }}>

//           {/* Left: Search + Table */}
//           <div style={{ flex: 1, minWidth: 0 }}>

//             {/* Search */}
//             <div style={{ position: "relative", maxWidth: 460, marginBottom: 24 }}>
//               <svg style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", pointerEvents: "none" }}
//                 width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
//                 <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
//               </svg>
//               <input
//                 value={search} onChange={e => setSearch(e.target.value)}
//                 placeholder="Search by Name, AOB ID, or Case Label..."
//                 style={{
//                   width: "100%", padding: "11px 40px 11px 42px", borderRadius: 10,
//                   border: "1.5px solid #e2e8f0", background: "#fff", fontSize: 14,
//                   color: "#0f172a", outline: "none", fontFamily: "inherit",
//                   boxShadow: "0 1px 4px rgba(0,0,0,0.04)", transition: "border-color 0.15s, box-shadow 0.15s",
//                 }}
//                 onFocus={e => { e.target.style.borderColor = "#3b82f6"; e.target.style.boxShadow = "0 0 0 3px rgba(59,130,246,0.12)"; }}
//                 onBlur={e => { e.target.style.borderColor = "#e2e8f0"; e.target.style.boxShadow = "0 1px 4px rgba(0,0,0,0.04)"; }}
//               />
//               {search && (
//                 <button onClick={() => setSearch("")} style={{
//                   position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
//                   background: "#e2e8f0", border: "none", borderRadius: "50%",
//                   width: 20, height: 20, cursor: "pointer", fontSize: 14, color: "#64748b",
//                   display: "flex", alignItems: "center", justifyContent: "center",
//                 }}>×</button>
//               )}
//             </div>

//             {/* Error */}
//             {error && (
//               <div style={{
//                 padding: "12px 16px", borderRadius: 10, marginBottom: 16,
//                 background: "#fef2f2", border: "1px solid #fecaca",
//                 color: "#dc2626", fontSize: 13, fontWeight: 500,
//                 display: "flex", alignItems: "center", gap: 8,
//               }}>
//                 <span>⚠️</span> {error}
//               </div>
//             )}

//             {/* Table */}
//             <div style={{
//               background: "#fff", borderRadius: 16, border: "1px solid #e8edf3",
//               boxShadow: "0 2px 12px rgba(0,0,0,0.05)", overflow: "hidden",
//             }}>
//               <div style={{ overflowX: "auto" }}>
//                 <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
//                   <thead>
//                     <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e8edf3" }}>
//                       {/* expand toggle col */}
//                       <th style={{ width: 44, padding: "13px 8px 13px 16px" }} />
//                       {["AOB ID", "SID", "Name", "Age", "Gender", "Samples", ""].map((h, i) => (
//                         <th key={i} style={{
//                           padding: "13px 16px", textAlign: i === 6 ? "right" : "left",
//                           fontSize: 11, fontWeight: 700, color: "#94a3b8",
//                           letterSpacing: "0.08em", textTransform: "uppercase",
//                           fontFamily: "'DM Mono', monospace", whiteSpace: "nowrap",
//                         }}>{h}</th>
//                       ))}
//                     </tr>
//                   </thead>
//                   <tbody>
//                     {loadingList ? (
//                       Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
//                     ) : filtered.length === 0 ? (
//                       <tr>
//                         <td colSpan={8} style={{ padding: "60px 16px", textAlign: "center" }}>
//                           <div style={{ fontSize: 32, marginBottom: 10 }}>🔍</div>
//                           <div style={{ fontSize: 15, fontWeight: 600, color: "#64748b" }}>No patients found</div>
//                           <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4 }}>
//                             {search ? `No results for "${search}"` : "No patients yet — add one to get started"}
//                           </div>
//                         </td>
//                       </tr>
//                     ) : (
//                       filtered.map((p, idx) => {
//                         const isExpanded  = expandedIds.has(p.id);
//                         const isActive    = activePanelPatientId === p.id;
//                         const hasSamples  = p.case_labels && p.case_labels.length > 0;
//                         const isDeleting  = deletingId === p.id;

//                         return (
//                           <>
//                             {/* ── Patient Row ── */}
//                             <tr
//                               key={`p-${p.id}`}
//                               className={`patient-row${isActive ? " active-row" : ""}`}
//                               onClick={e => handlePatientClick(p.id, e)}
//                               style={{
//                                 borderBottom: isExpanded ? "none" : (idx < filtered.length - 1 ? "1px solid #f1f5f9" : "none"),
//                                 background: isActive ? "#eff6ff" : "#fff",
//                                 animation: `slideUp 0.2s ease ${idx * 0.03}s both`,
//                                 opacity: isDeleting ? 0.5 : 1,
//                                 transition: "opacity 0.2s",
//                               }}
//                             >
//                               {/* Chevron */}
//                               <td style={{ padding: "17px 8px 17px 16px", width: 44 }}>
//                                 {hasSamples ? (
//                                   <div style={{
//                                     width: 26, height: 26, borderRadius: 7,
//                                     background: isExpanded ? "#eff6ff" : "#f8fafc",
//                                     border: `1px solid ${isExpanded ? "#bfdbfe" : "#e2e8f0"}`,
//                                     display: "flex", alignItems: "center", justifyContent: "center",
//                                     transition: "all 0.15s",
//                                   }}>
//                                     <Chevron open={isExpanded} />
//                                   </div>
//                                 ) : (
//                                   <div style={{ width: 26 }} />
//                                 )}
//                               </td>

//                               {/* AOB ID */}
//                               <td style={{ padding: "17px 16px" }}>
//                                 <span className="aob-link" style={{
//                                   color: "#2563eb", fontSize: 13, fontWeight: 600,
//                                   fontFamily: "'DM Mono', monospace", transition: "color 0.15s",
//                                 }}>{p.aob_id || "—"}</span>
//                               </td>

//                               {/* SID */}
//                               <td style={{ padding: "17px 16px" }}>
//                                 <span style={{ color: "#64748b", fontSize: 13, fontFamily: "'DM Mono', monospace" }}>
//                                   {p.sid || "—"}
//                                 </span>
//                               </td>

//                               {/* Name */}
//                               <td style={{ padding: "17px 16px" }}>
//                                 <span style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>
//                                   {p.name || "—"}
//                                 </span>
//                               </td>

//                               {/* Age */}
//                               <td style={{ padding: "17px 16px" }}>
//                                 <span style={{ fontSize: 14, color: "#334155" }}>{p.age ?? "—"}</span>
//                               </td>

//                               {/* Gender */}
//                               <td style={{ padding: "17px 16px" }}>
//                                 <span style={{ fontSize: 14, color: "#334155" }}>{p.gender || "—"}</span>
//                               </td>

//                               {/* Sample count badge */}
//                               <td style={{ padding: "17px 16px" }}>
//                                 {hasSamples ? (
//                                   <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
//                                     <span style={{
//                                       display: "inline-flex", alignItems: "center", justifyContent: "center",
//                                       width: 22, height: 22, borderRadius: "50%",
//                                       background: "#eff6ff", border: "1px solid #bfdbfe",
//                                       fontSize: 11, fontWeight: 700, color: "#2563eb",
//                                     }}>
//                                       {p.case_labels.length}
//                                     </span>
//                                     <span style={{ fontSize: 12, color: "#64748b" }}>
//                                       sample{p.case_labels.length !== 1 ? "s" : ""}
//                                     </span>
//                                     <span style={{ fontSize: 11, color: "#94a3b8" }}>
//                                       {isExpanded ? "▲ collapse" : "▼ expand"}
//                                     </span>
//                                   </div>
//                                 ) : (
//                                   <span style={{ fontSize: 13, color: "#cbd5e1" }}>No samples</span>
//                                 )}
//                               </td>

//                               {/* ── Delete Button ── */}
//                               <td
//                                 style={{ padding: "17px 16px 17px 8px", textAlign: "right" }}
//                                 onClick={e => e.stopPropagation()}
//                               >
//                                 <button
//                                   title="Delete patient"
//                                   className={`delete-btn${isDeleting ? " deleting" : ""}`}
//                                   onClick={e => deletePatient(p.id, p.name, e)}
//                                   style={{
//                                     width: 30, height: 30, borderRadius: 7,
//                                     border: "1px solid transparent",
//                                     background: "transparent",
//                                     cursor: isDeleting ? "not-allowed" : "pointer",
//                                     display: "inline-flex", alignItems: "center", justifyContent: "center",
//                                     color: "#94a3b8",
//                                   }}
//                                 >
//                                   {isDeleting ? (
//                                     /* Spinner while deleting */
//                                     <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
//                                       stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round"
//                                       style={{ animation: "spin 0.7s linear infinite" }}>
//                                       <path d="M21 12a9 9 0 1 1-6.219-8.56" />
//                                     </svg>
//                                   ) : (
//                                     <TrashIcon style={{ transition: "color 0.15s" }} />
//                                   )}
//                                 </button>
//                               </td>
//                             </tr>

//                             {/* ── Sample Sub-Rows ── */}
//                             {isExpanded && hasSamples && (
//                               <tr key={`expand-${p.id}`}>
//                                 <td colSpan={8} style={{ padding: 0, borderBottom: "1px solid #e8edf3" }}>
//                                   <div style={{
//                                     background: "#f8faff",
//                                     borderTop: "1px solid #dbeafe",
//                                     animation: "expandIn 0.18s ease",
//                                     transformOrigin: "top",
//                                   }}>
//                                     {/* Sub-header */}
//                                     <div style={{
//                                       display: "grid",
//                                       gridTemplateColumns: "44px 1fr 1fr 1fr 1fr",
//                                       padding: "8px 0",
//                                       borderBottom: "1px solid #e2e8f0",
//                                     }}>
//                                       <div />
//                                       {["Case Label", "Sequencing", "DNA Availability", "Report Status"].map(h => (
//                                         <div key={h} style={{
//                                           padding: "0 16px",
//                                           fontSize: 10, fontWeight: 700, color: "#94a3b8",
//                                           textTransform: "uppercase", letterSpacing: "0.08em",
//                                           fontFamily: "'DM Mono', monospace",
//                                         }}>{h}</div>
//                                       ))}
//                                     </div>

//                                     {/* One row per sample */}
//                                     {p.case_labels.map((lbl, si) => {
//                                       const isActiveSample =
//                                         selectedSample?.patient?.id === p.id &&
//                                         selectedSample?.sample?.new_case_label === lbl;
//                                       return (
//                                         <div
//                                           key={`${p.id}-s-${si}`}
//                                           className={`sample-row${isActiveSample ? " active-sample" : ""}`}
//                                           onClick={(e) => {
//                                             if (e.detail === 2) {
//                                               navigate(`/view-patient/${p.id}`);
//                                               return;
//                                             }
//                                             openSample(p.id, lbl);
//                                           }}
//                                           style={{
//                                             display: "grid",
//                                             gridTemplateColumns: "44px 1fr 1fr 1fr 1fr",
//                                             padding: "11px 0",
//                                             borderBottom: si < p.case_labels.length - 1 ? "1px solid #e8edf3" : "none",
//                                             background: isActiveSample ? "#dbeafe" : "transparent",
//                                             transition: "background 0.1s",
//                                           }}
//                                         >
//                                           <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
//                                             <div style={{
//                                               width: 6, height: 6, borderRadius: "50%",
//                                               background: isActiveSample ? "#2563eb" : "#93c5fd",
//                                             }} />
//                                           </div>
//                                           <div style={{ padding: "0 16px" }}>
//                                             <span style={{
//                                               fontSize: 13, fontWeight: 600, color: "#1e40af",
//                                               fontFamily: "'DM Mono', monospace",
//                                             }}>{lbl}</span>
//                                           </div>
//                                           <div style={{ padding: "0 16px" }}>
//                                             <span style={{ fontSize: 12, color: "#64748b" }}>Click to view</span>
//                                           </div>
//                                           <div style={{ padding: "0 16px" }}>
//                                             <span style={{ fontSize: 12, color: "#64748b" }}>—</span>
//                                           </div>
//                                           <div style={{ padding: "0 16px" }}>
//                                             <span style={{ fontSize: 12, color: "#64748b" }}>—</span>
//                                           </div>
//                                         </div>
//                                       );
//                                     })}
//                                   </div>
//                                 </td>
//                               </tr>
//                             )}
//                           </>
//                         );
//                       })
//                     )}
//                   </tbody>
//                 </table>
//               </div>

//               {/* Footer */}
//               <div style={{
//                 padding: "11px 20px", borderTop: "1px solid #f1f5f9",
//                 display: "flex", alignItems: "center", justifyContent: "space-between",
//               }}>
//                 <span style={{ fontSize: 12, color: "#94a3b8" }}>
//                   {loadingList
//                     ? "Loading…"
//                     : `Showing ${filtered.length} of ${patients.length} patient${patients.length !== 1 ? "s" : ""}`}
//                 </span>
//                 {search && !loadingList && (
//                   <span style={{ fontSize: 12, color: "#64748b" }}>
//                     Filtered by <strong>"{search}"</strong>
//                   </span>
//                 )}
//               </div>
//             </div>
//           </div>

//           {/* ── Right: Side Panel ── */}
//           {(selectedSample || loadingDetail) && (
//             <div style={{
//               width: 320, flexShrink: 0,
//               background: "#fff", borderRadius: 16,
//               border: "1px solid #e8edf3",
//               boxShadow: "0 4px 20px rgba(0,0,0,0.07)",
//               animation: "slideInRight 0.22s ease",
//               position: "sticky", top: 90,
//               maxHeight: "calc(100vh - 110px)", overflowY: "auto",
//             }}>
//               {/* Panel Header */}
//               <div style={{
//                 display: "flex", alignItems: "center", justifyContent: "space-between",
//                 padding: "18px 20px", borderBottom: "1px solid #f1f5f9",
//                 position: "sticky", top: 0, background: "#fff", zIndex: 10,
//                 borderRadius: "16px 16px 0 0",
//               }}>
//                 <div>
//                   <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
//                     {loadingDetail ? "Loading…" : selectedSample?.sample?.new_case_label || "Sample Details"}
//                   </div>
//                   {selectedSample && !loadingDetail && (
//                     <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2, fontFamily: "'DM Mono', monospace" }}>
//                       {selectedSample.patient?.name || ""}
//                     </div>
//                   )}
//                 </div>
//                 <button
//                   onClick={() => { setSelectedSample(null); setFullDetail(null); }}
//                   style={{
//                     background: "#f0f4f8", border: "none", borderRadius: 8,
//                     width: 30, height: 30, cursor: "pointer", fontSize: 16, color: "#64748b",
//                     display: "flex", alignItems: "center", justifyContent: "center",
//                     transition: "background 0.15s",
//                   }}
//                   onMouseEnter={e => e.currentTarget.style.background = "#e2e8f0"}
//                   onMouseLeave={e => e.currentTarget.style.background = "#f0f4f8"}
//                 >×</button>
//               </div>

//               {/* Panel Body */}
//               <div style={{ padding: "8px 20px 20px" }}>
//                 {loadingDetail ? (
//                   <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 16 }}>
//                     {[120, 90, 140, 80, 110, 100, 130, 90].map((w, i) => (
//                       <div key={i} style={{
//                         height: 13, width: w, borderRadius: 6,
//                         background: "linear-gradient(90deg,#f0f4f8 25%,#e2e8f0 50%,#f0f4f8 75%)",
//                         backgroundSize: "400% 100%",
//                         animation: "shimmer 1.4s ease infinite",
//                       }} />
//                     ))}
//                   </div>
//                 ) : selectedSample && (
//                   <div style={{ animation: "fadeIn 0.2s ease", paddingTop: 16 }}>
//                     <div style={{ marginBottom: 16 }}>
//                       <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>
//                         Name
//                       </div>
//                       <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
//                         {selectedSample.patient?.name || "—"}
//                       </div>
//                     </div>

//                     <DetailRow label="Patient ID" value={selectedSample.patient?.patient_id} />
//                     <DetailRow label="Case Label" value={selectedSample.sample?.new_case_label} />
//                     <DetailRow label="SID" value={selectedSample.patient?.sid} />
                    

//                     <div style={{ paddingTop: 16 }}>
//                       <button
//                         onClick={() => navigate(`/view-patient/${selectedSample.patient?.id}`)}
//                         style={{
//                           width: "100%", padding: "10px", borderRadius: 9,
//                           border: "none", background: "#2563eb", color: "#fff",
//                           fontSize: 13, fontWeight: 700, cursor: "pointer",
//                           display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
//                           transition: "all 0.15s", boxShadow: "0 2px 8px rgba(37,99,235,0.25)",
//                         }}
//                         onMouseEnter={e => { e.currentTarget.style.background = "#1d4ed8"; e.currentTarget.style.transform = "translateY(-1px)"; }}
//                         onMouseLeave={e => { e.currentTarget.style.background = "#2563eb"; e.currentTarget.style.transform = "none"; }}
//                       >
//                         View Full Patient Record
//                         <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
//                           <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
//                         </svg>
//                       </button>
//                     </div>
//                   </div>
//                 )}
//               </div>
//             </div>
//           )}
//         </div>
//       </div>

//       {showBulkUpload && (
//         <BulkUploadModal
//           onClose={() => setShowBulkUpload(false)}
//           onDone={() => {
//             setShowBulkUpload(false);
//             loadPatients();
//           }}
//         />
//       )}

//       <style>{`
//         @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
//       `}</style>
//     </>
//   );
// }