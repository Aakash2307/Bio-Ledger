import React, { useEffect, useState, useRef, useCallback, useMemo, Fragment } from "react";
import { getPatients, getPatientDetails } from "../api";
import logo from "../assets/tzarnewlogo.png";
import { useNavigate, useLocation } from "react-router-dom";
import BulkUploadModal from "./BulkUploadModel";
import { deletePatient as deletePatientApi, deleteSample as deleteSampleApi } from "../api";
import "../css/PatientRecords.css";

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
const PATIENT_PAGE_SIZE = 25;
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
        <td key={i} className="skeleton-cell">
          <div className={`skeleton-bar sk-${w}`} />
        </td>
      ))}
    </tr>
  );
}

// ─── Detail Row ───────────────────────────────────────────────────────────────
function DetailRow({ label, value }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="detail-row">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{String(value)}</span>
    </div>
  );
}

// ─── Chevron ──────────────────────────────────────────────────────────────────
function Chevron({ open }) {
  return (
    <svg className={`chevron${open ? " open" : ""}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

// ─── Trash Icon ───────────────────────────────────────────────────────────────
function TrashIcon() {
  return (
    <svg className="trash" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
    <div className="filter-badge">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
      </svg>
      <span className="filter-badge-label">{filterLabels[label] || label}:</span>
      <span>{value}</span>
      <button onClick={onClear} className="filter-badge-x">×</button>
    </div>
  );
}

// ─── View Toggle ──────────────────────────────────────────────────────────────
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
    <div role="tablist" aria-label="View mode" className="view-toggle">
      {/* sliding highlight */}
      <span aria-hidden className={`view-toggle-thumb${isSample ? " sample" : ""}`} />
      {options.map(o => {
        const active = mode === o.key;
        return (
          <button key={o.key} role="tab" aria-selected={active} onClick={() => onChange(o.key)}
            className={`view-toggle-btn${active ? " active" : ""}`}>
            <span className="view-toggle-icon">{o.icon}</span>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Sample Table (flat, Excel-style, bottom horizontal scroll) ───────────────
function SampleTable({ rows, sortKey, sortDir, onSort, colFilters, onColFilter, onRowClick, activeKey, loading, visibleCount, onShowMore }) {
  const shown = rows.slice(0, visibleCount);

  if (loading) {
    return <div className="sample-loading">Loading all samples…</div>;
  }

  return (
    <>
      <div className="sample-scroll">
        <table className="sample-table">
          <thead>
            <tr>
              {COLUMN_DEFS.map(col => {
                const active = sortKey === col.db;
                return (
                  <th key={col.db} className="sample-th">
                    <button onClick={() => onSort(col.db)} className={`sample-th-btn${active ? " active" : ""}`}>
                      {col.excel}{active ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                    </button>
                  </th>
                );
              })}
            </tr>
            <tr>
              {COLUMN_DEFS.map(col => (
                <th key={`${col.db}-filter`} className="sample-filter-th">
                  <input
                    value={colFilters[col.db] ?? ""}
                    onChange={e => onColFilter(col.db, e.target.value)}
                    placeholder="Filter"
                    className="sample-filter-input"
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={COLUMN_DEFS.length} className="sample-empty">
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
                      <td key={col.db} title={val} className="sample-td">
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
        <div className="show-more-wrap">
          <button onClick={onShowMore} className="btn-show-more">
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

  if (!samples) return <div className="expansion-message"><span>Loading samples…</span></div>;
  if (samples.length === 0) return <div className="expansion-message"><span>No sample records found.</span></div>;

  return (
    <div className="expansion">
      <div className="expanded-grid expanded-head">
        <div />
        {["SID", "Case Label", "Sequencing", "DNA Availability", "Report Status", ""].map((h, i) => (
          <div key={i} className="expanded-head-cell">{h}</div>
        ))}
      </div>
      {samples.map((samp, si) => {
        const isActiveSample = selectedSample?.patient?.id === patientId && selectedSample?.sample?.id === samp.sampleId;
        const isDeleting = deletingRow === samp.sampleId;
        const rowClass = [
          "expanded-grid",
          "sample-row",
          si === samples.length - 1 && "last",
          isActiveSample && "active-sample",
          isDeleting && "deleting",
        ].filter(Boolean).join(" ");
        return (
          <div key={`${patientId}-s-${samp.sampleId}-r-${samp.recordId ?? si}`}
            className={rowClass}
            onClick={(e) => {
              if (isDeleting) return;
              if (e.detail === 2) { navigate(`/view-patient/${patientId}/${samp.sampleId}`); return; }
              onOpenSample(patientId, samp.sampleId);
            }}>
            <div className="expanded-dot-cell">
              <div className="sample-dot" />
            </div>
            <div className="expanded-cell"><span className="sample-sid">{samp.sid || "—"}</span></div>
            <div className="expanded-cell"><span className="sample-label">{samp.new_case_label || "No Label"}</span></div>
            <div className="expanded-cell"><span className="sample-meta">{samp.sequencing || "—"}</span></div>
            <div className="expanded-cell"><span className="sample-meta">{samp.dna_availability || "—"}</span></div>
            <div className="expanded-cell"><span className="sample-meta">{samp.report_status || "—"}</span></div>
            <div className="expanded-action-cell" onClick={e => e.stopPropagation()}>
              <button title="Delete sample" className={`delete-btn delete-btn-sample${isDeleting ? " deleting" : ""}`} onClick={e => handleDeleteSample(samp, e)}>
                {isDeleting
                  ? <svg className="spinner" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                  : <TrashIcon />}
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
  const [logoFailed, setLogoFailed] = useState(false);
  const [page, setPage] = useState(1);

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
    setPage(1);
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
    setPage(1);
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
      /* storage unavailable — keep the in-memory choice only */
    }
  }

  function handleSearch(value) {
    setSearch(value);
    setVisibleCount(SAMPLE_PAGE_SIZE);
    setPage(1);
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

  // ── Patient pagination ──────────────────────────────────────────────────────
  const pageCount = Math.max(1, Math.ceil(filtered.length / PATIENT_PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pagedPatients = filtered.slice(
    (safePage - 1) * PATIENT_PAGE_SIZE,
    safePage * PATIENT_PAGE_SIZE
  );

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
        : `Showing ${pagedPatients.length} of ${filtered.length} patient${filtered.length !== 1 ? "s" : ""} (of ${patients.length} total)${filterSummary ? ` · ${filterSummary}` : ""}`)
    : (loadingList || loadingAllDetails
        ? "Loading samples…"
        : `Showing ${Math.min(visibleCount, sampleRows.length)} of ${sampleRows.length} sample row${sampleRows.length !== 1 ? "s" : ""} · ${patients.length} patient${patients.length !== 1 ? "s" : ""}${filterSummary ? ` · ${filterSummary}` : ""}`);

  const exportDisabled = exporting || loadingList || patients.length === 0;

  return (
    <div className="page">

      {/* ── Header ── */}
      <div className="header">
        <div className="header-inner">
          <div className="header-left">
            {!logoFailed
              ? <img className="logo" src={logo} alt="TZAR Labs" onError={() => setLogoFailed(true)} />
              : <div className="logo-fallback">🧬</div>}
            <div>
              <div className="header-title">Patient Records</div>
              <div className="header-sub">Exome Patient Management</div>
            </div>
          </div>
          <div className="header-actions">

            {/* Export */}
            <button
              className={`export-btn${exporting ? " busy" : ""}${(loadingList || patients.length === 0) ? " dim" : ""}`}
              onClick={handleExportExcel}
              disabled={exportDisabled}
              title={patients.length === 0 ? "No patients to export" : "Export all samples to Excel"}>
              {exporting
                ? <svg className="spinner" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" /></svg>}
            </button>

            {/* Bulk Upload */}
            <button className="btn-outline" onClick={() => setShowBulkUpload(true)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Bulk Upload
            </button>

            {/* Add Patient */}
            <button className="btn-primary" onClick={() => navigate("/add-patient")}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" />
              </svg>
              Add Patient
            </button>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="page-body">
        <div className="page-main">

          {/* ── Active filter badges ── */}
          {hasAnyFilter && (
            <div className="filter-badges">
              {filterOrgan && <FilterBadge label="organ_type" value={filterOrgan} onClear={() => removeFilter("organ_type")} />}
              {filterCase && <FilterBadge label="case_label" value={filterCase} onClear={() => removeFilter("case_label")} />}
              {filterSource && <FilterBadge label="source" value={filterSource} onClear={() => removeFilter("source")} />}
              {filterPeriod && <FilterBadge label="period" value={filterPeriod} onClear={() => removeFilter("period")} />}
              {[filterOrgan, filterCase, filterSource, filterPeriod].filter(Boolean).length > 1 && (
                <button onClick={clearAllFilters} className="btn-clear-all">
                  Clear all ×
                </button>
              )}
            </div>
          )}

          {/* ── Search + view toggle ── */}
          <div className="toolbar">
            <div className="search-wrap">
              <svg className="search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input value={search} onChange={e => handleSearch(e.target.value)} placeholder="Search by Name , Patient ID or Sample ID"
                className="search-input"
              />
              {search && (
                <button onClick={() => handleSearch("")} className="search-clear">×</button>
              )}
            </div>
            <ViewToggle mode={viewMode} onChange={changeViewMode} />
          </div>

          {error && (
            <div className="error-banner">
              <span>⚠️</span> {error}
            </div>
          )}

          <div className="card">

            {viewMode === "patient" ? (
              <div className="table-scroll">
                <table className="patient-table">
                  <thead>
                    <tr className="patient-thead-row">
                      <th className="patient-th-narrow" />
                      {["Patient ID", "Name", "Gender", "Samples", ""].map((h, i) => (
                        <th key={i} className={`patient-th${i === 4 ? " patient-th-right" : ""}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(loadingList || filterLoading) ? (
                      Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
                    ) : filtered.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="empty-cell">
                          <div className="empty-icon">🔍</div>
                          <div className="empty-title">No patients found</div>
                          <div className="empty-sub">
                            {hasAnyFilter ? "No patients match the active filters" : search ? `No results for "${search}"` : "No patients yet — add one to get started"}
                          </div>
                          {hasAnyFilter && (
                            <button onClick={clearAllFilters} className="btn-empty-clear">
                              Clear All Filters
                            </button>
                          )}
                        </td>
                      </tr>
                    ) : (
                      pagedPatients.map((p, idx) => {
                        const isExpanded = expandedIds.has(p.id);
                        const isActive = activePanelPatientId === p.id;
                        const hasSamples = (p.total_samples ?? 0) > 0;
                        const isDeleting = deletingId === p.id;
                        const rowClass = [
                          "patient-row",
                          isActive && "active-row",
                          isExpanded && "expanded",
                          idx === pagedPatients.length - 1 && "last",
                          isDeleting && "deleting",
                        ].filter(Boolean).join(" ");
                        return (
                          <Fragment key={p.id}>
                            <tr className={rowClass} onClick={e => handlePatientClick(p.id, e)}>
                              <td className="cell-chevron">
                                {hasSamples ? (
                                  <div className={`chevron-box${isExpanded ? " open" : ""}`}>
                                    <Chevron open={isExpanded} />
                                  </div>
                                ) : <div className="chevron-spacer" />}
                              </td>
                              <td><span className="pid">{p.patient_id || "—"}</span></td>
                              <td><span className="patient-name">{"—"}</span></td>
                              <td><span className="patient-gender">{p.gender || "—"}</span></td>
                              <td>
                                {hasSamples ? (
                                  <div className="samples-cell">
                                    <span className="count-badge">{p.total_samples}</span>
                                    <span className="samples-label">sample{p.total_samples !== 1 ? "s" : ""}</span>
                                    <span className="samples-toggle">{isExpanded ? "▲ collapse" : "▼ expand"}</span>
                                  </div>
                                ) : <span className="no-samples">No samples</span>}
                              </td>
                              <td className="cell-actions" onClick={e => e.stopPropagation()}>
                                <button title="Delete patient" className={`delete-btn delete-btn-patient${isDeleting ? " deleting" : ""}`} onClick={e => deletePatient(p.id, p.name, e)}>
                                  {isDeleting
                                    ? <svg className="spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                                    : <TrashIcon />}
                                </button>
                              </td>
                            </tr>
                            {isExpanded && hasSamples && (
                              <tr className="expansion-row">
                                <td colSpan={6}>
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

            {viewMode === "patient" && !(loadingList || filterLoading) && filtered.length > PATIENT_PAGE_SIZE && (
              <div className="pager">
                <button className="pager-btn" disabled={safePage === 1} onClick={() => setPage(safePage - 1)}>
                  ‹ Prev
                </button>
                <span className="pager-info">Page {safePage} of {pageCount}</span>
                <button className="pager-btn" disabled={safePage === pageCount} onClick={() => setPage(safePage + 1)}>
                  Next ›
                </button>
              </div>
            )}

            <div className="card-footer">
              <span className="footer-text">{footerText}</span>
              {search && !loadingList && <span className="footer-search">Search: <strong>"{search}"</strong></span>}
            </div>
          </div>
        </div>

        {/* ── Side Panel ── */}
        {(selectedSample || loadingDetail) && (
          <div className="side-panel">
            <div className="side-head">
              <div>
                <div className="side-title">
                  {loadingDetail ? "Loading…" : selectedSample?.sample?.records?.[0]?.new_case_label || selectedSample?.sample?.new_case_label || "Sample Details"}
                </div>
                {selectedSample && !loadingDetail && (
                  <div className="side-subtitle">{selectedSample.patient?.name || ""}</div>
                )}
              </div>
              <button onClick={() => setSelectedSample(null)} className="side-close">×</button>
            </div>
            <div className="side-body">
              {loadingDetail ? (
                <div className="side-skeleton">
                  {[120, 90, 140, 80, 110, 100, 130, 90].map((w, i) => (
                    <div key={i} className={`skeleton-bar sk-${w}`} />
                  ))}
                </div>
              ) : selectedSample && (
                <div className="side-content">
                  <div className="side-name-wrap">
                    <div className="side-name-label">Name</div>
                    <div className="side-name">{selectedSample.patient?.name || "—"}</div>
                  </div>
                  <DetailRow label="Patient ID" value={selectedSample.patient?.patient_id} />
                  <DetailRow label="Gender" value={selectedSample.patient?.gender} />
                  <DetailRow label="Case Label" value={selectedSample.sample?.records?.[0]?.new_case_label || selectedSample.sample?.new_case_label} />
                  <DetailRow label="AOB ID" value={selectedSample.sample?.records?.[0]?.aob_id} />
                  <DetailRow label="Age" value={selectedSample.sample?.records?.[0]?.age} />
                  <DetailRow label="SID" value={selectedSample.sample?.sid} />
                  <div className="side-action">
                    <button onClick={() => navigate(`/view-patient/${selectedSample.patient?.id}/${selectedSample.sample?.id}`)}
                      className="btn-primary-block">
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

      {showBulkUpload && (
        <BulkUploadModal onClose={() => setShowBulkUpload(false)} onDone={() => { setShowBulkUpload(false); loadPatients(); }} />
      )}
    </div>
  );
}