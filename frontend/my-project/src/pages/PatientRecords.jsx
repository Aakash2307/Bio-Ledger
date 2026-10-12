import React, { useEffect, useState, useRef, useCallback, useMemo, Fragment } from "react";
import { getPatients, getPatientDetails } from "../api";
import logo from "../assets/tzarnewlogo.png";
import { useNavigate, useLocation } from "react-router-dom";
import BulkUploadModal from "./BulkUploadModel";
import { deletePatient as deletePatientApi, deleteSample as deleteSampleApi } from "../api";

// ─── Column Definitions ───────────────────────────────────────────────────────
const COLUMN_DEFS = [
  { excel: "AOB ID", db: "aob_id", bucket: "record" },
  { excel: "Sample ID", db: "sid", bucket: "sample" },
  { excel: "Name", db: "name", bucket: "patient" },
  { excel: "Age", db: "age", bucket: "record" },
  { excel: "Gender", db: "gender", bucket: "patient" },
  { excel: "Patient ID", db: "patient_id", bucket: "patient" },
  { excel: "New Case label", db: "new_case_label", bucket: "record" },
  { excel: "Additional", db: "additional", bucket: "record" },
  { excel: "Source", db: "source", bucket: "record" },
  { excel: "Detail Disease", db: "detail_disease", bucket: "record" },
  { excel: "Organ Type", db: "organ_type", bucket: "record" },
  { excel: "Comorbidity", db: "comorbidity", bucket: "record" },
  { excel: "Family history", db: "family_history", bucket: "record" },
  { excel: "Metastasis", db: "metastasis", bucket: "record" },
  { excel: "Patient status", db: "patient_status", bucket: "record" },
  { excel: "Sample Collection Date", db: "sample_collection_date", bucket: "record" },
  { excel: "DNA availability", db: "dna_availability", bucket: "record" },
  { excel: "Sequencing", db: "sequencing", bucket: "record" },
  { excel: "DIN", db: "din", bucket: "record" },
  { excel: "Research/Report", db: "research_report", bucket: "record" },
  { excel: "Sequencing partner (E)", db: "sequencing_partner", bucket: "record" },
  { excel: "Data received (E)", db: "data_received", bucket: "record" },
  { excel: "TMR-EGbp", db: "tmr_e", bucket: "record" },
  { excel: "Old Gbp", db: "old_gbp", bucket: "record" },
  { excel: "Gbp", db: "gbp", bucket: "record" },
  { excel: "Data analysed-E (Som)", db: "data_analysed_som", bucket: "record" },
  { excel: "Data analysed-E (Germ)", db: "data_analysed_germ", bucket: "record" },
  { excel: "Sample labeling", db: "sample_labeling", bucket: "record" },
  { excel: "Analysis", db: "analysis", bucket: "record" },
  { excel: "Report (made/release)", db: "report_status", bucket: "record" },
  { excel: "Report Release Date", db: "report_release_date", bucket: "record" },
  { excel: "Comments (report sample ID)", db: "comments", bucket: "record" },
  { excel: "Consultation", db: "consultation", bucket: "record" },
];

const VIEW_MODE_KEY = "patientRecords.viewMode";
const SAMPLE_PAGE_SIZE = 200;
const DETAIL_BATCH = 10;

function readStoredViewMode() {
  try {
    return localStorage.getItem(VIEW_MODE_KEY) === "sample" ? "sample" : "patient";
  } catch {
    return "patient";
  }
}

// ─── SheetJS loader ───────────────────────────────────────────────────────────
function ensureSheetJS() {
  return new Promise((resolve, reject) => {
    if (window.XLSX) { resolve(window.XLSX); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.onload = () => resolve(window.XLSX);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// ─── Flatten patient details into one row per sample record ───────────────────
function makeRow(patient, sample, record, patientId, recordIndex) {
  const row = {
    _key: `${patientId}-${sample?.id ?? "none"}-${recordIndex ?? 0}`,
    _pid: patientId,
    _sid: sample?.id ?? null,
    _createdAt: sample?.created_at ?? "",
  };
  COLUMN_DEFS.forEach(col => {
    if (col.bucket === "patient") row[col.db] = patient?.[col.db] ?? "";
    else if (col.bucket === "sample") row[col.db] = sample?.[col.db] ?? "";
    else row[col.db] = record?.[col.db] ?? "";
  });
  return row;
}

function buildFlatRows(detailsMap, patientList) {
  const rows = [];
  patientList.forEach(p => {
    const data = detailsMap[p.id];
    if (!data) return;
    const patient = data.patient || p;
    const samples = data.samples || [];
    if (samples.length === 0) {
      rows.push(makeRow(patient, null, null, p.id, 0));
      return;
    }
    samples.forEach(sample => {
      const records = sample.records?.length > 0 ? sample.records : [null];
      records.forEach((record, ri) => rows.push(makeRow(patient, sample, record, p.id, ri)));
    });
  });
  return rows;
}

// ─── Skeleton Row ─────────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr>
      {[30, 140, 180, 80, 120, 30].map((w, i) => (
        <td key={i} style={{ padding: "18px 16px" }}>
          <div style={{ height: 13, width: w, borderRadius: 6, background: "linear-gradient(90deg,#f0f4f8 25%,#e2e8f0 50%,#f0f4f8 75%)", backgroundSize: "400% 100%", animation: "shimmer 1.4s ease infinite" }} />
        </td>
      ))}
    </tr>
  );
}

// ─── Detail Row ───────────────────────────────────────────────────────────────
function DetailRow({ label, value }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "10px 0", borderBottom: "1px solid #f1f5f9" }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</span>
      <span style={{ fontSize: 13, color: "#1e293b", fontWeight: 500, wordBreak: "break-word" }}>{String(value)}</span>
    </div>
  );
}

// ─── Chevron ──────────────────────────────────────────────────────────────────
function Chevron({ open }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ transition: "transform 0.2s ease", transform: open ? "rotate(90deg)" : "rotate(0deg)", color: open ? "#2563eb" : "#94a3b8" }}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

// ─── Trash Icon ───────────────────────────────────────────────────────────────
function TrashIcon({ style }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" /><path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

// ─── Filter Badge ─────────────────────────────────────────────────────────────
function FilterBadge({ label, value, onClear }) {
  const filterLabels = { organ_type: "Organ Type", case_label: "Case Label", source: "Source", period: "Period" };
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 20, background: "#eff6ff", border: "1.5px solid #bfdbfe", fontSize: 13, fontWeight: 600, color: "#2563eb", marginBottom: 10, marginRight: 8 }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
      </svg>
      <span style={{ fontSize: 11, color: "#64748b", fontWeight: 500 }}>{filterLabels[label] || label}:</span>
      <span>{value}</span>
      <button onClick={onClear} style={{ background: "#bfdbfe", border: "none", borderRadius: "50%", width: 18, height: 18, cursor: "pointer", fontSize: 12, color: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, lineHeight: 1, padding: 0 }}>×</button>
    </div>
  );
}

// ─── View Toggle ──────────────────────────────────────────────────────────────
// function ViewToggle({ mode, onChange }) {
//   const options = [
//     { key: "patient", label: "Patient view" },
//     { key: "sample", label: "Sample table" },
//   ];
//   return (
//     <div style={{ display: "inline-flex", background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 10, padding: 3, boxShadow: "0 1px 4px rgba(0,0,0,0.04)", flexShrink: 0 }}>
//       {options.map(o => {
//         const active = mode === o.key;
//         return (
//           <button key={o.key} onClick={() => onChange(o.key)} aria-pressed={active}
//             style={{ padding: "7px 14px", borderRadius: 7, border: "none", background: active ? "#2563eb" : "transparent", color: active ? "#fff" : "#64748b", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
//             {o.label}
//           </button>
//         );
//       })}
//     </div>
//   );
// }


function ViewToggle({ mode, onChange }) {
  const isSample = mode === "sample";
  const options = [
    {
      key: "patient",
      label: "Patients",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
    },
    {
      key: "sample",
      label: "Samples",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" />
          <line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" />
        </svg>
      ),
    },
  ];

  return (
    <div role="tablist" aria-label="View mode"
      style={{
        position: "relative", display: "inline-grid", gridTemplateColumns: "1fr 1fr", padding: 4, borderRadius: 14,
        background: "linear-gradient(135deg,#f8fafc,#eef2ff)", border: "1.5px solid #e0e7ff", minWidth: 320, flexShrink: 0,
        boxShadow: "inset 0 1px 2px rgba(15,23,42,0.04), 0 2px 10px rgba(79,70,229,0.08)",
      }}>
      {/* sliding highlight */}
      <span aria-hidden
        style={{
          position: "absolute", top: 4, bottom: 4, left: 4, width: "calc(50% - 4px)", borderRadius: 10,
          background: "linear-gradient(135deg,#2563eb 0%,#7c3aed 100%)",
          boxShadow: "0 6px 16px rgba(79,70,229,0.35)",
          transform: isSample ? "translateX(100%)" : "translateX(0)",
          transition: "transform 0.4s cubic-bezier(.34,1.56,.64,1)",
        }} />
      {options.map(o => {
        const active = mode === o.key;
        return (
          <button key={o.key} role="tab" aria-selected={active} onClick={() => onChange(o.key)}
            onMouseEnter={e => { if (!active) e.currentTarget.style.color = "#334155"; }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.color = "#64748b"; }}
            style={{
              position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              padding: "9px 18px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit",
              fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", color: active ? "#fff" : "#64748b",
              transition: "color 0.25s ease", transform: active ? "scale(1.02)" : "scale(1)",
            }}>
            <span style={{ display: "inline-flex", transition: "transform 0.35s ease", transform: active ? "rotate(-8deg)" : "rotate(0deg)" }}>
              {o.icon}
            </span>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Sample Table (flat, Excel-style) ─────────────────────────────────────────
// function SampleTable({ rows, sortKey, sortDir, onSort, colFilters, onColFilter, onRowClick, activeKey, loading, visibleCount, onShowMore }) {
//   const COL_W = 150;
//   const shown = rows.slice(0, visibleCount);

//   if (loading) {
//     return <div style={{ padding: "40px 16px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Loading all samples…</div>;
//   }

//   const thBase = { padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: "0.04em", textTransform: "uppercase", fontFamily: "'DM Mono', monospace", whiteSpace: "nowrap", background: "#f8fafc", borderBottom: "1px solid #e8edf3", minWidth: COL_W };

//   return (
//     <>
//       <style>{`
//         .sample-table-row { transition: background 0.1s; cursor: pointer; }
//         .sample-table-row:hover { background: #f0f9ff !important; }
//         .sample-table-row.active-sample { background: #dbeafe !important; }
//       `}</style>
//       <div style={{ overflowX: "auto" }}>
//         <table style={{ borderCollapse: "separate", borderSpacing: 0, minWidth: COLUMN_DEFS.length * COL_W }}>
//           <thead>
//             <tr>
//               {COLUMN_DEFS.map(col => {
//                 const active = sortKey === col.db;
//                 return (
//                   <th key={col.db} style={thBase}>
//                     <button onClick={() => onSort(col.db)}
//                       style={{ background: "none", border: "none", padding: 0, font: "inherit", color: active ? "#2563eb" : "#64748b", cursor: "pointer", textTransform: "inherit", letterSpacing: "inherit", whiteSpace: "nowrap" }}>
//                       {col.excel}{active ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
//                     </button>
//                   </th>
//                 );
//               })}
//             </tr>
//             <tr>
//               {COLUMN_DEFS.map(col => (
//                 <th key={`${col.db}-filter`} style={{ padding: "6px 8px", background: "#fff", borderBottom: "1px solid #e8edf3", minWidth: COL_W }}>
//                   <input
//                     value={colFilters[col.db] ?? ""}
//                     onChange={e => onColFilter(col.db, e.target.value)}
//                     placeholder="Filter"
//                     style={{ width: "100%", padding: "5px 8px", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 12, fontWeight: 400, color: "#334155", outline: "none", fontFamily: "inherit", textTransform: "none", letterSpacing: "normal" }}
//                   />
//                 </th>
//               ))}
//             </tr>
//           </thead>
//           <tbody>
//             {shown.length === 0 ? (
//               <tr>
//                 <td colSpan={COLUMN_DEFS.length} style={{ padding: "48px 16px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
//                   No samples match the current filters
//                 </td>
//               </tr>
//             ) : shown.map(row => {
//               const isActive = activeKey === `${row._pid}-${row._sid}`;
//               return (
//                 <tr key={row._key}
//                   className={`sample-table-row${isActive ? " active-sample" : ""}`}
//                   onClick={e => onRowClick(row, e)}>
//                   {COLUMN_DEFS.map(col => {
//                     const val = String(row[col.db] ?? "");
//                     return (
//                       <td key={col.db} title={val}
//                         style={{ padding: "9px 12px", borderBottom: "1px solid #f1f5f9", fontSize: 12.5, color: "#334155", whiteSpace: "nowrap", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>
//                         {val}
//                       </td>
//                     );
//                   })}
//                 </tr>
//               );
//             })}
//           </tbody>
//         </table>
//       </div>
//       {shown.length < rows.length && (
//         <div style={{ padding: "12px 20px", borderTop: "1px solid #f1f5f9", textAlign: "center" }}>
//           <button onClick={onShowMore}
//             style={{ padding: "8px 18px", borderRadius: 8, border: "1.5px solid #bfdbfe", background: "#eff6ff", color: "#2563eb", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
//             Show more ({rows.length - shown.length} remaining)
//           </button>
//         </div>
//       )}
//     </>
//   );
// }


// ─── Sample Table (flat, Excel-style, top + bottom horizontal scroll) ─────────
// ─── Sample Table (flat, Excel-style, bottom horizontal scroll) ───────────────
function SampleTable({ rows, sortKey, sortDir, onSort, colFilters, onColFilter, onRowClick, activeKey, loading, visibleCount, onShowMore }) {
  const COL_W = 150;
  const HEAD_H = 40;
  const shown = rows.slice(0, visibleCount);

  if (loading) {
    return <div style={{ padding: "40px 16px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Loading all samples…</div>;
  }

  const thBase = {
    padding: "0 12px", height: HEAD_H, textAlign: "left", fontSize: 11, fontWeight: 700, color: "#64748b",
    letterSpacing: "0.04em", textTransform: "uppercase", fontFamily: "'DM Mono', monospace", whiteSpace: "nowrap",
    background: "#f8fafc", borderBottom: "1px solid #e8edf3", minWidth: COL_W,
    position: "sticky", top: 0, zIndex: 3,
  };
  const filterTh = {
    padding: "6px 8px", background: "#fff", borderBottom: "1px solid #e8edf3", minWidth: COL_W,
    position: "sticky", top: HEAD_H, zIndex: 3,
  };

  return (
    <>
      <style>{`
        .sample-table-row { transition: background 0.1s; cursor: pointer; }
        .sample-table-row:hover { background: #f0f9ff !important; }
        .sample-table-row.active-sample { background: #dbeafe !important; }
        .sample-scroll::-webkit-scrollbar { height: 12px; width: 12px; }
        .sample-scroll::-webkit-scrollbar-track { background: #f1f5f9; }
        .sample-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 8px; border: 2px solid #f1f5f9; }
        .sample-scroll::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}</style>

      <div className="sample-scroll"
        style={{ overflow: "auto", maxHeight: "calc(100vh - 260px)", minHeight: 260, position: "relative" }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, minWidth: COLUMN_DEFS.length * COL_W }}>
          <thead>
            <tr>
              {COLUMN_DEFS.map(col => {
                const active = sortKey === col.db;
                return (
                  <th key={col.db} style={thBase}>
                    <button onClick={() => onSort(col.db)}
                      style={{ background: "none", border: "none", padding: 0, font: "inherit", color: active ? "#2563eb" : "#64748b", cursor: "pointer", letterSpacing: "inherit", whiteSpace: "nowrap" }}>
                      {col.excel}{active ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                    </button>
                  </th>
                );
              })}
            </tr>
            <tr>
              {COLUMN_DEFS.map(col => (
                <th key={`${col.db}-filter`} style={filterTh}>
                  <input
                    value={colFilters[col.db] ?? ""}
                    onChange={e => onColFilter(col.db, e.target.value)}
                    placeholder="Filter"
                    style={{ width: "100%", padding: "5px 8px", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 12, fontWeight: 400, color: "#334155", outline: "none", fontFamily: "inherit" }}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={COLUMN_DEFS.length} style={{ padding: "48px 16px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                  No samples match the current filters
                </td>
              </tr>
            ) : shown.map(row => {
              const isActive = activeKey === `${row._pid}-${row._sid}`;
              return (
                <tr key={row._key}
                  className={`sample-table-row${isActive ? " active-sample" : ""}`}
                  onClick={e => onRowClick(row, e)}>
                  {COLUMN_DEFS.map(col => {
                    const val = String(row[col.db] ?? "");
                    return (
                      <td key={col.db} title={val}
                        style={{ padding: "9px 12px", borderBottom: "1px solid #f1f5f9", fontSize: 12.5, color: "#334155", whiteSpace: "nowrap", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {val}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {shown.length < rows.length && (
        <div style={{ padding: "12px 20px", borderTop: "1px solid #f1f5f9", textAlign: "center" }}>
          <button onClick={onShowMore}
            style={{ padding: "8px 18px", borderRadius: 8, border: "1.5px solid #bfdbfe", background: "#eff6ff", color: "#2563eb", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            Show more ({rows.length - shown.length} remaining)
          </button>
        </div>
      )}
    </>
  );
}

// ─── Expanded Samples ─────────────────────────────────────────────────────────
function ExpandedSamples({ patientId, selectedSample, onOpenSample, navigate, onDeleteSample }) {
  const [samples, setSamples] = React.useState(null);
  const [deletingRow, setDeletingRow] = React.useState(null);

  React.useEffect(() => {
    getPatientDetails(patientId)
      .then(data => {
        const rows = [];
        (data.samples || []).forEach(s => {
          if (s.records && s.records.length > 0) {
            s.records.forEach(r => rows.push({ sampleId: s.id, sid: s.sid, recordId: r.id, ...r }));
          } else {
            rows.push({ sampleId: s.id, sid: s.sid, recordId: null });
          }
        });
        setSamples(rows);
      })
      .catch(() => setSamples([]));
  }, [patientId]);

  async function handleDeleteSample(samp, e) {
    e.stopPropagation();
    if (!confirm(`Delete sample "${samp.sid || samp.sampleId}"?\n\nThis cannot be undone.`)) return;
    setDeletingRow(samp.sampleId);
    try {
      await deleteSampleApi(samp.sampleId);
      setSamples(prev => prev.filter(s => s.sampleId !== samp.sampleId));
      onDeleteSample(samp.sampleId);
    } catch { alert("Failed to delete sample. Please try again."); }
    finally { setDeletingRow(null); }
  }

  if (!samples) return <div style={{ background: "#f8faff", borderTop: "1px solid #dbeafe", padding: "14px 16px" }}><span style={{ fontSize: 12, color: "#94a3b8" }}>Loading samples…</span></div>;
  if (samples.length === 0) return <div style={{ background: "#f8faff", borderTop: "1px solid #dbeafe", padding: "14px 16px" }}><span style={{ fontSize: 12, color: "#94a3b8" }}>No sample records found.</span></div>;

  const COLS = "44px 1fr 1fr 1fr 1fr 1fr 44px";

  return (
    <div style={{ background: "#f8faff", borderTop: "1px solid #dbeafe", animation: "expandIn 0.18s ease", transformOrigin: "top" }}>
      <div style={{ display: "grid", gridTemplateColumns: COLS, padding: "8px 0", borderBottom: "1px solid #e2e8f0" }}>
        <div />
        {["SID", "Case Label", "Sequencing", "DNA Availability", "Report Status", ""].map((h, i) => (
          <div key={i} style={{ padding: "0 16px", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'DM Mono', monospace" }}>{h}</div>
        ))}
      </div>
      {samples.map((samp, si) => {
        const isActiveSample = selectedSample?.patient?.id === patientId && selectedSample?.sample?.id === samp.sampleId;
        const isDeleting = deletingRow === samp.sampleId;
        return (
          <div key={`${patientId}-s-${samp.sampleId}-r-${samp.recordId ?? si}`}
            className={`sample-row${isActiveSample ? " active-sample" : ""}`}
            onClick={(e) => {
              if (isDeleting) return;
              if (e.detail === 2) { navigate(`/view-patient/${patientId}/${samp.sampleId}`); return; }
              onOpenSample(patientId, samp.sampleId);
            }}
            style={{ display: "grid", gridTemplateColumns: COLS, padding: "11px 0", borderBottom: si < samples.length - 1 ? "1px solid #e8edf3" : "none", background: isActiveSample ? "#dbeafe" : "transparent", transition: "background 0.1s", opacity: isDeleting ? 0.5 : 1 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: isActiveSample ? "#2563eb" : "#93c5fd" }} />
            </div>
            <div style={{ padding: "0 16px" }}><span style={{ fontSize: 12, color: "#64748b", fontFamily: "'DM Mono', monospace" }}>{samp.sid || "—"}</span></div>
            <div style={{ padding: "0 16px" }}><span style={{ fontSize: 13, fontWeight: 600, color: "#1e40af", fontFamily: "'DM Mono', monospace" }}>{samp.new_case_label || "No Label"}</span></div>
            <div style={{ padding: "0 16px" }}><span style={{ fontSize: 12, color: "#64748b" }}>{samp.sequencing || "—"}</span></div>
            <div style={{ padding: "0 16px" }}><span style={{ fontSize: 12, color: "#64748b" }}>{samp.dna_availability || "—"}</span></div>
            <div style={{ padding: "0 16px" }}><span style={{ fontSize: 12, color: "#64748b" }}>{samp.report_status || "—"}</span></div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", paddingRight: 8 }} onClick={e => e.stopPropagation()}>
              <button title="Delete sample" className={`delete-btn${isDeleting ? " deleting" : ""}`} onClick={e => handleDeleteSample(samp, e)}
                style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid transparent", background: "transparent", cursor: isDeleting ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#94a3b8" }}>
                {isDeleting
                  ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin 0.7s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                  : <TrashIcon style={{ transition: "color 0.15s" }} />}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PatientRecords() {
  const [patients, setPatients] = useState([]);
  const [search, setSearch] = useState("");
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [selectedSample, setSelectedSample] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [error, setError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [filteredByDashboard, setFilteredByDashboard] = useState([]);
  const [filterLoading, setFilterLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);

  // View mode + sample-table state
  const [viewMode, setViewMode] = useState(readStoredViewMode);
  const [detailsCache, setDetailsCache] = useState(null);       // { [patientId]: details } or null
  const [loadingAllDetails, setLoadingAllDetails] = useState(false);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [colFilters, setColFilters] = useState({});
  const [visibleCount, setVisibleCount] = useState(SAMPLE_PAGE_SIZE);
  const detailsInFlight = useRef(false);

  const navigate = useNavigate();
  const location = useLocation();

  // ── Read ALL URL filter params ──────────────────────────────────────────────
  const urlParams = new URLSearchParams(location.search);
  const filterOrgan = urlParams.get("organ_type") || "";
  const filterCase = urlParams.get("case_label") || "";
  const filterSource = urlParams.get("source") || "";
  const filterPeriod = urlParams.get("period") || "";
  const hasAnyFilter = !!(filterOrgan || filterCase || filterSource || filterPeriod);

  // ── Load patients ───────────────────────────────────────────────────────────
  const loadPatients = useCallback(async () => {
    setLoadingList(true); setError(null);
    try {
      setPatients(await getPatients());
      setDetailsCache(null); // invalidate so the sample table reloads fresh data
    } catch (err) {
      console.error(err);
      setError("Failed to load patients. Is the API running?");
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => { loadPatients(); }, [loadPatients]);

  // ── Load every patient's details (used by sample table and export) ──────────
  const ensureAllDetails = useCallback(async () => {
    if (detailsInFlight.current) return null;
    detailsInFlight.current = true;
    setLoadingAllDetails(true);
    try {
      const map = {};
      for (let i = 0; i < patients.length; i += DETAIL_BATCH) {
        const batch = patients.slice(i, i + DETAIL_BATCH);
        const results = await Promise.all(batch.map(p => getPatientDetails(p.id).catch(() => null)));
        results.forEach((data, j) => { if (data) map[batch[j].id] = data; });
      }
      setDetailsCache(map);
      return map;
    } finally {
      detailsInFlight.current = false;
      setLoadingAllDetails(false);
    }
  }, [patients]);

  useEffect(() => {
    if (viewMode === "sample" && detailsCache === null && !loadingList) {
      ensureAllDetails();
    }
  }, [viewMode, detailsCache, loadingList, ensureAllDetails]);

  // ── Apply patient-view filters (patient-level matching) ─────────────────────
  useEffect(() => {
    if (loadingList) return;

    if (!hasAnyFilter) {
      setFilteredByDashboard([]);
      return;
    }

    if (patients.length === 0) {
      setFilteredByDashboard([]);
      return;
    }

    let cancelled = false;

    async function applyFilter() {
      setFilterLoading(true);
      try {
        const results = await Promise.all(
          patients.map(async (p) => {
            try {
              const detail = await getPatientDetails(p.id);
              const matches = detail.samples?.some(s => {
                if (filterPeriod && filterPeriod !== "all") {
                  const createdAt = s.created_at || "";
                  if (!createdAt.startsWith(filterPeriod)) return false;
                }
                if (!filterOrgan && !filterCase && !filterSource) return true;
                return s.records?.some(r => {
                  let organMatch = true, caseMatch = true, sourceMatch = true;
                  if (filterOrgan) organMatch = String(r.organ_type ?? "").toLowerCase() === filterOrgan.toLowerCase();
                  if (filterCase) caseMatch = String(r.new_case_label ?? "").toLowerCase() === filterCase.toLowerCase();
                  if (filterSource) sourceMatch = String(r.source ?? "").toLowerCase() === filterSource.toLowerCase();
                  return organMatch && caseMatch && sourceMatch;
                });
              });
              return matches ? p : null;
            } catch { return null; }
          })
        );
        if (!cancelled) setFilteredByDashboard(results.filter(Boolean));
      } finally {
        if (!cancelled) setFilterLoading(false);
      }
    }

    applyFilter();
    return () => { cancelled = true; };
  }, [filterOrgan, filterCase, filterSource, filterPeriod, hasAnyFilter, patients, loadingList]);

  // ── Remove individual filter from URL ───────────────────────────────────────
  function removeFilter(key) {
    const params = new URLSearchParams(location.search);
    params.delete(key);
    const qs = params.toString();
    navigate(qs ? `/patients?${qs}` : "/patients");
  }

  function clearAllFilters() { navigate("/patients"); }

  // ── View / search / sort handlers ───────────────────────────────────────────
  function changeViewMode(mode) {
    setViewMode(mode);
    setVisibleCount(SAMPLE_PAGE_SIZE);
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
      /* storage unavailable — keep the in-memory choice only */
    }
  }

  function handleSearch(value) {
    setSearch(value);
    setVisibleCount(SAMPLE_PAGE_SIZE);
  }

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function handleColFilter(key, value) {
    setColFilters(prev => ({ ...prev, [key]: value }));
    setVisibleCount(SAMPLE_PAGE_SIZE);
  }

  // ── Excel Export (same flattened layout as the sample table) ────────────────
  async function handleExportExcel() {
    setExporting(true);
    try {
      const XLSX = await ensureSheetJS();
      const map = detailsCache ?? await ensureAllDetails();
      if (!map) throw new Error("Patient details are still loading");

      const rows = buildFlatRows(map, patients).map(r => {
        const out = {};
        COLUMN_DEFS.forEach(col => { out[col.excel] = r[col.db] ?? ""; });
        return out;
      });

      const ws = XLSX.utils.json_to_sheet(rows, { header: COLUMN_DEFS.map(c => c.excel) });
      const range = XLSX.utils.decode_range(ws["!ref"]);
      for (let C = range.s.c; C <= range.e.c; C++) {
        const cellAddr = XLSX.utils.encode_cell({ r: 0, c: C });
        if (!ws[cellAddr]) continue;
        ws[cellAddr].s = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "2563EB" } }, alignment: { horizontal: "center", wrapText: true } };
      }
      ws["!cols"] = COLUMN_DEFS.map(col => ({ wch: Math.max(col.excel.length + 2, 14) }));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Patient Records");
      XLSX.writeFile(wb, `patient_records_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err) {
      console.error("Export failed:", err);
      alert("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  // ── Patient actions ─────────────────────────────────────────────────────────
  async function deletePatient(patientId, patientName, e) {
    e.stopPropagation();
    if (!confirm(`Delete patient "${patientName || "this patient"}"?\n\nThis will permanently remove them and all their samples.`)) return;
    setDeletingId(patientId);
    try {
      await deletePatientApi(patientId);
      if (selectedSample?.patient?.id === patientId) { setSelectedSample(null); }
      setExpandedIds(prev => { const next = new Set(prev); next.delete(patientId); return next; });
      loadPatients();
    } catch (err) {
      console.error(err);
      alert("Failed to delete patient. Please try again.");
    } finally {
      setDeletingId(null);
    }
  }

  function handleSampleDeleted(deletedSampleId) {
    if (selectedSample?.sample?.id === deletedSampleId) { setSelectedSample(null); }
    setDetailsCache(null); // sample table needs to reflect the deletion
  }

  function toggleExpand(patientId, e) {
    e.stopPropagation();
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(patientId)) next.delete(patientId); else next.add(patientId);
      return next;
    });
  }

  function handlePatientClick(patientId, e) {
    if (e.detail === 2) {
      if (selectedSample?.patient?.id === patientId && selectedSample?.sample?.id) {
        navigate(`/view-patient/${patientId}/${selectedSample.sample.id}`);
        return;
      }
      getPatientDetails(patientId)
        .then(data => {
          const firstSample = data.samples?.[0];
          navigate(firstSample ? `/view-patient/${patientId}/${firstSample.id}` : `/view-patient/${patientId}`);
        })
        .catch(() => navigate(`/view-patient/${patientId}`));
      return;
    }
    toggleExpand(patientId, e);
  }

  async function openSample(patientId, sampleId) {
    setSelectedSample(null); setLoadingDetail(true);
    try {
      const data = await getPatientDetails(patientId);
      const matchedSample = data.samples.find(s => s.id === sampleId) || data.samples[0];
      setSelectedSample({ patient: data.patient, sample: matchedSample });
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDetail(false);
    }
  }

  // ── Patient view list ───────────────────────────────────────────────────────
  const baseList = hasAnyFilter ? (filterLoading ? [] : filteredByDashboard) : patients;
  const q = search.toLowerCase().trim();
  const getScore = (p) => {
    const name = (p.name ?? "").toLowerCase(), pid = (p.patient_id ?? "").toLowerCase();
    const sids = (p.sids ?? []).map(s => String(s).toLowerCase());
    if (name === q || pid === q || sids.includes(q)) return 0;
    if (name.startsWith(q) || pid.startsWith(q) || sids.some(s => s.startsWith(q))) return 1;
    return 2;
  };
  const filtered = !q ? baseList : baseList
    .filter(p => (p.patient_id ?? "").toLowerCase().includes(q)
      || (p.name ?? "").toLowerCase().includes(q)
      || (p.sids ?? []).some(s => String(s).toLowerCase().includes(q)))
    .sort((a, b) => getScore(a) - getScore(b));

  // ── Sample table list ───────────────────────────────────────────────────────
  const flatRows = useMemo(
    () => (detailsCache ? buildFlatRows(detailsCache, patients) : []),
    [detailsCache, patients]
  );

  const sampleRows = useMemo(() => {
    const term = search.toLowerCase().trim();
    let rows = flatRows.filter(r => {
      if (filterOrgan && String(r.organ_type ?? "").toLowerCase() !== filterOrgan.toLowerCase()) return false;
      if (filterCase && String(r.new_case_label ?? "").toLowerCase() !== filterCase.toLowerCase()) return false;
      if (filterSource && String(r.source ?? "").toLowerCase() !== filterSource.toLowerCase()) return false;
      if (filterPeriod && filterPeriod !== "all" && !String(r._createdAt ?? "").startsWith(filterPeriod)) return false;
      if (term) {
        const hit = String(r.name ?? "").toLowerCase().includes(term)
          || String(r.patient_id ?? "").toLowerCase().includes(term)
          || String(r.sid ?? "").toLowerCase().includes(term);
        if (!hit) return false;
      }
      for (const [key, val] of Object.entries(colFilters)) {
        if (!val) continue;
        if (!String(r[key] ?? "").toLowerCase().includes(val.toLowerCase())) return false;
      }
      return true;
    });

    if (sortKey) {
      const dir = sortDir === "asc" ? 1 : -1;
      rows = [...rows].sort((a, b) =>
        dir * String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? ""), undefined, { numeric: true, sensitivity: "base" })
      );
    }
    return rows;
  }, [flatRows, search, filterOrgan, filterCase, filterSource, filterPeriod, colFilters, sortKey, sortDir]);

  const activePanelPatientId = selectedSample?.patient?.id;
  const activeSampleKey = selectedSample ? `${selectedSample.patient?.id}-${selectedSample.sample?.id}` : null;

  const filterSummary = [
    filterOrgan && `Organ: ${filterOrgan}`,
    filterCase && `Case: ${filterCase}`,
    filterSource && `Source: ${filterSource}`,
    filterPeriod && `Period: ${filterPeriod}`,
  ].filter(Boolean).join(" · ");

  const footerText = viewMode === "patient"
    ? (loadingList || filterLoading
        ? "Loading…"
        : `Showing ${filtered.length} of ${patients.length} patient${patients.length !== 1 ? "s" : ""}${filterSummary ? ` · ${filterSummary}` : ""}`)
    : (loadingList || loadingAllDetails
        ? "Loading samples…"
        : `Showing ${Math.min(visibleCount, sampleRows.length)} of ${sampleRows.length} sample row${sampleRows.length !== 1 ? "s" : ""} · ${patients.length} patient${patients.length !== 1 ? "s" : ""}${filterSummary ? ` · ${filterSummary}` : ""}`);

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
        .patient-row.active-row { background: #eff6ff !important; }
        .sample-row { transition: background 0.1s; cursor: pointer; }
        .sample-row:hover { background: #f0f9ff !important; }
        .sample-row.active-sample { background: #dbeafe !important; }
        .delete-btn { transition: all 0.15s; }
        .delete-btn:hover { background: #fef2f2 !important; border-color: #fecaca !important; }
        .delete-btn:hover svg { color: #dc2626 !important; }
        .delete-btn:active { transform: scale(0.93); }
        .delete-btn.deleting { opacity: 0.5; pointer-events: none; }
        .export-btn:hover { border-color: #16a34a !important; background: #f0fdf4 !important; }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>

      <div style={{ minHeight: "100vh", background: "#f1f5f9", fontFamily: "'DM Sans', sans-serif" }}>

        {/* ── Header ── */}
        <div style={{ background: "#fff", borderBottom: "1px solid #e8edf3", padding: "0 32px", position: "sticky", top: 0, zIndex: 200 }}>
          <div style={{ maxWidth: 1400, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 70 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <img src={logo} alt="TZAR Labs" style={{ height: 40, objectFit: "contain" }}
                onError={e => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }} />
              <div style={{ width: 40, height: 40, borderRadius: 10, display: "none", background: "linear-gradient(135deg,#dbeafe,#bfdbfe)", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🧬</div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.01em" }}>Patient Records</div>
                <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500, marginTop: 1 }}>Exome Patient Management</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>

              {/* Export */}
              <button className="export-btn" onClick={handleExportExcel}
                disabled={exporting || loadingList || patients.length === 0}
                title={patients.length === 0 ? "No patients to export" : "Export all samples to Excel"}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 42, height: 42, borderRadius: 10, border: "1.5px solid #e2e8f0", background: "#fff", color: exporting ? "#94a3b8" : "#16a34a", cursor: (exporting || loadingList || patients.length === 0) ? "not-allowed" : "pointer", opacity: (loadingList || patients.length === 0) ? 0.45 : 1, transition: "all 0.15s", boxShadow: "0 1px 4px rgba(0,0,0,0.05)", flexShrink: 0 }}>
                {exporting
                  ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin 0.7s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                  : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" /></svg>}
              </button>

              {/* Bulk Upload */}
              <button onClick={() => setShowBulkUpload(true)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: "#fff", color: "#334155", fontSize: 14, fontWeight: 700, cursor: "pointer", transition: "all 0.15s", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#3b82f6"; e.currentTarget.style.color = "#2563eb"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.color = "#334155"; }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Bulk Upload
              </button>

              {/* Add Patient */}
              <button onClick={() => navigate("/add-patient")}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 10, border: "none", background: "#2563eb", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", boxShadow: "0 2px 8px rgba(37,99,235,0.3)", transition: "all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.background = "#1d4ed8"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "#2563eb"; e.currentTarget.style.transform = "none"; }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" />
                </svg>
                Add Patient
              </button>
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "28px 32px", display: "flex", gap: 24, alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0 }}>

            {/* ── Active filter badges ── */}
            {hasAnyFilter && (
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4, marginBottom: 8 }}>
                {filterOrgan && <FilterBadge label="organ_type" value={filterOrgan} onClear={() => removeFilter("organ_type")} />}
                {filterCase && <FilterBadge label="case_label" value={filterCase} onClear={() => removeFilter("case_label")} />}
                {filterSource && <FilterBadge label="source" value={filterSource} onClear={() => removeFilter("source")} />}
                {filterPeriod && <FilterBadge label="period" value={filterPeriod} onClear={() => removeFilter("period")} />}
                {[filterOrgan, filterCase, filterSource, filterPeriod].filter(Boolean).length > 1 && (
                  <button onClick={clearAllFilters} style={{ padding: "5px 12px", borderRadius: 20, border: "1.5px solid #fecaca", background: "#fef2f2", color: "#dc2626", fontSize: 12, fontWeight: 600, cursor: "pointer", marginBottom: 10 }}>
                    Clear all ×
                  </button>
                )}
              </div>
            )}

            {/* ── Search + view toggle ── */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
              <div style={{ position: "relative", flex: "0 1 460px", minWidth: 260 }}>
                <svg style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", pointerEvents: "none" }}
                  width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input value={search} onChange={e => handleSearch(e.target.value)} placeholder="Search by Name , Patient ID or Sample ID"
                  style={{ width: "100%", padding: "11px 40px 11px 42px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: "#fff", fontSize: 14, color: "#0f172a", outline: "none", fontFamily: "inherit", boxShadow: "0 1px 4px rgba(0,0,0,0.04)", transition: "border-color 0.15s, box-shadow 0.15s" }}
                  onFocus={e => { e.target.style.borderColor = "#3b82f6"; e.target.style.boxShadow = "0 0 0 3px rgba(59,130,246,0.12)"; }}
                  onBlur={e => { e.target.style.borderColor = "#e2e8f0"; e.target.style.boxShadow = "0 1px 4px rgba(0,0,0,0.04)"; }}
                />
                {search && (
                  <button onClick={() => handleSearch("")} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "#e2e8f0", border: "none", borderRadius: "50%", width: 20, height: 20, cursor: "pointer", fontSize: 14, color: "#64748b", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                )}
              </div>
              <ViewToggle mode={viewMode} onChange={changeViewMode} />
            </div>

            {error && (
              <div style={{ padding: "12px 16px", borderRadius: 10, marginBottom: 16, background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>
                <span>⚠️</span> {error}
              </div>
            )}

            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e8edf3", boxShadow: "0 2px 12px rgba(0,0,0,0.05)", overflow: "hidden" }}>

              {viewMode === "patient" ? (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 540 }}>
                    <thead>
                      <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e8edf3" }}>
                        <th style={{ width: 44, padding: "13px 8px 13px 16px" }} />
                        {["Patient ID", "Name", "Gender", "Samples", ""].map((h, i) => (
                          <th key={i} style={{ padding: "13px 16px", textAlign: i === 4 ? "right" : "left", fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "'DM Mono', monospace", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(loadingList || filterLoading) ? (
                        Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
                      ) : filtered.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ padding: "60px 16px", textAlign: "center" }}>
                            <div style={{ fontSize: 32, marginBottom: 10 }}>🔍</div>
                            <div style={{ fontSize: 15, fontWeight: 600, color: "#64748b" }}>No patients found</div>
                            <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4 }}>
                              {hasAnyFilter ? "No patients match the active filters" : search ? `No results for "${search}"` : "No patients yet — add one to get started"}
                            </div>
                            {hasAnyFilter && (
                              <button onClick={clearAllFilters} style={{ marginTop: 12, padding: "8px 18px", borderRadius: 8, border: "1.5px solid #bfdbfe", background: "#eff6ff", color: "#2563eb", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                                Clear All Filters
                              </button>
                            )}
                          </td>
                        </tr>
                      ) : (
                        filtered.map((p, idx) => {
                          const isExpanded = expandedIds.has(p.id);
                          const isActive = activePanelPatientId === p.id;
                          const hasSamples = (p.total_samples ?? 0) > 0;
                          const isDeleting = deletingId === p.id;
                          return (
                            <Fragment key={p.id}>
                              <tr className={`patient-row${isActive ? " active-row" : ""}`}
                                onClick={e => handlePatientClick(p.id, e)}
                                style={{ borderBottom: isExpanded ? "none" : (idx < filtered.length - 1 ? "1px solid #f1f5f9" : "none"), background: isActive ? "#eff6ff" : "#fff", animation: `slideUp 0.2s ease ${idx * 0.03}s both`, opacity: isDeleting ? 0.5 : 1, transition: "opacity 0.2s" }}>
                                <td style={{ padding: "17px 8px 17px 16px", width: 44 }}>
                                  {hasSamples ? (
                                    <div style={{ width: 26, height: 26, borderRadius: 7, background: isExpanded ? "#eff6ff" : "#f8fafc", border: `1px solid ${isExpanded ? "#bfdbfe" : "#e2e8f0"}`, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}>
                                      <Chevron open={isExpanded} />
                                    </div>
                                  ) : <div style={{ width: 26 }} />}
                                </td>
                                <td style={{ padding: "17px 16px" }}><span style={{ color: "#2563eb", fontSize: 13, fontWeight: 600, fontFamily: "'DM Mono', monospace" }}>{p.patient_id || "—"}</span></td>
                                <td style={{ padding: "17px 16px" }}><span style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{"—"}</span></td>
                                <td style={{ padding: "17px 16px" }}><span style={{ fontSize: 14, color: "#334155" }}>{p.gender || "—"}</span></td>
                                <td style={{ padding: "17px 16px" }}>
                                  {hasSamples ? (
                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: "50%", background: "#eff6ff", border: "1px solid #bfdbfe", fontSize: 11, fontWeight: 700, color: "#2563eb" }}>{p.total_samples}</span>
                                      <span style={{ fontSize: 12, color: "#64748b" }}>sample{p.total_samples !== 1 ? "s" : ""}</span>
                                      <span style={{ fontSize: 11, color: "#94a3b8" }}>{isExpanded ? "▲ collapse" : "▼ expand"}</span>
                                    </div>
                                  ) : <span style={{ fontSize: 13, color: "#cbd5e1" }}>No samples</span>}
                                </td>
                                <td style={{ padding: "17px 16px 17px 8px", textAlign: "right" }} onClick={e => e.stopPropagation()}>
                                  <button title="Delete patient" className={`delete-btn${isDeleting ? " deleting" : ""}`} onClick={e => deletePatient(p.id, p.name, e)}
                                    style={{ width: 30, height: 30, borderRadius: 7, border: "1px solid transparent", background: "transparent", cursor: isDeleting ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#94a3b8" }}>
                                    {isDeleting
                                      ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin 0.7s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                                      : <TrashIcon style={{ transition: "color 0.15s" }} />}
                                  </button>
                                </td>
                              </tr>
                              {isExpanded && hasSamples && (
                                <tr>
                                  <td colSpan={6} style={{ padding: 0, borderBottom: "1px solid #e8edf3" }}>
                                    <ExpandedSamples patientId={p.id} selectedSample={selectedSample} onOpenSample={openSample} navigate={navigate} onDeleteSample={handleSampleDeleted} />
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
              ) : (
                <SampleTable
                  rows={sampleRows}
                  loading={loadingList || loadingAllDetails || detailsCache === null}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                  colFilters={colFilters}
                  onColFilter={handleColFilter}
                  activeKey={activeSampleKey}
                  visibleCount={visibleCount}
                  onShowMore={() => setVisibleCount(c => c + SAMPLE_PAGE_SIZE)}
                  onRowClick={(row, e) => {
                    if (e.detail === 2) {
                      navigate(`/view-patient/${row._pid}/${row._sid}`);
                      return;
                    }
                    if (row._sid) openSample(row._pid, row._sid);
                  }}
                />
              )}

              <div style={{ padding: "11px 20px", borderTop: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, color: "#94a3b8" }}>{footerText}</span>
                {search && !loadingList && <span style={{ fontSize: 12, color: "#64748b" }}>Search: <strong>"{search}"</strong></span>}
              </div>
            </div>
          </div>

          {/* ── Side Panel ── */}
          {(selectedSample || loadingDetail) && (
            <div style={{ width: 320, flexShrink: 0, background: "#fff", borderRadius: 16, border: "1px solid #e8edf3", boxShadow: "0 4px 20px rgba(0,0,0,0.07)", animation: "slideInRight 0.22s ease", position: "sticky", top: 90, maxHeight: "calc(100vh - 110px)", overflowY: "auto" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px", borderBottom: "1px solid #f1f5f9", position: "sticky", top: 0, background: "#fff", zIndex: 10, borderRadius: "16px 16px 0 0" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                    {loadingDetail ? "Loading…" : selectedSample?.sample?.records?.[0]?.new_case_label || selectedSample?.sample?.new_case_label || "Sample Details"}
                  </div>
                  {selectedSample && !loadingDetail && (
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2, fontFamily: "'DM Mono', monospace" }}>{selectedSample.patient?.name || ""}</div>
                  )}
                </div>
                <button onClick={() => setSelectedSample(null)}
                  style={{ background: "#f0f4f8", border: "none", borderRadius: 8, width: 30, height: 30, cursor: "pointer", fontSize: 16, color: "#64748b", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.15s" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#e2e8f0"}
                  onMouseLeave={e => e.currentTarget.style.background = "#f0f4f8"}>×</button>
              </div>
              <div style={{ padding: "8px 20px 20px" }}>
                {loadingDetail ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 16 }}>
                    {[120, 90, 140, 80, 110, 100, 130, 90].map((w, i) => (
                      <div key={i} style={{ height: 13, width: w, borderRadius: 6, background: "linear-gradient(90deg,#f0f4f8 25%,#e2e8f0 50%,#f0f4f8 75%)", backgroundSize: "400% 100%", animation: "shimmer 1.4s ease infinite" }} />
                    ))}
                  </div>
                ) : selectedSample && (
                  <div style={{ animation: "fadeIn 0.2s ease", paddingTop: 16 }}>
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Name</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>{selectedSample.patient?.name || "—"}</div>
                    </div>
                    <DetailRow label="Patient ID" value={selectedSample.patient?.patient_id} />
                    <DetailRow label="Gender" value={selectedSample.patient?.gender} />
                    <DetailRow label="Case Label" value={selectedSample.sample?.records?.[0]?.new_case_label || selectedSample.sample?.new_case_label} />
                    <DetailRow label="AOB ID" value={selectedSample.sample?.records?.[0]?.aob_id} />
                    <DetailRow label="Age" value={selectedSample.sample?.records?.[0]?.age} />
                    <DetailRow label="SID" value={selectedSample.sample?.sid} />
                    <div style={{ paddingTop: 16 }}>
                      <button onClick={() => navigate(`/view-patient/${selectedSample.patient?.id}/${selectedSample.sample?.id}`)}
                        style={{ width: "100%", padding: "10px", borderRadius: 9, border: "none", background: "#2563eb", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "all 0.15s", boxShadow: "0 2px 8px rgba(37,99,235,0.25)" }}
                        onMouseEnter={e => { e.currentTarget.style.background = "#1d4ed8"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "#2563eb"; e.currentTarget.style.transform = "none"; }}>
                        View Full Patient Record
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
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
        <BulkUploadModal onClose={() => setShowBulkUpload(false)} onDone={() => { setShowBulkUpload(false); loadPatients(); }} />
      )}
    </>
  );
}