import { useState, useRef, useCallback } from "react";
import * as XLSX from "xlsx";

// ── Single source of truth: every Excel column → { db, bucket } ──────────────
// bucket: "patient" | "sample"
// The order here matches the actual Excel column order exactly.
const COLUMN_DEFS = [
  { excel: "AOB ID",                        db: "aob_id",                 bucket: "patient" },
  { excel: "Sample ID",                     db: "sid",                    bucket: "sample"  },
  { excel: "Name",                          db: "name",                   bucket: "patient" },
  { excel: "Age",                           db: "age",                    bucket: "patient" },
  { excel: "Gender",                        db: "gender",                 bucket: "patient" },
  { excel: "Patient ID",                    db: "patient_id",             bucket: "patient" },
  { excel: "New Case label",                db: "new_case_label",         bucket: "sample"  },
  { excel: "Additional",                    db: "additional",             bucket: "sample"  },
  { excel: "Source",                        db: "source",                 bucket: "sample"  },
  { excel: "Detail Disease",                db: "detail_disease",         bucket: "patient" },
  { excel: "Organ Type",                    db: "organ_type",             bucket: "patient" },
  { excel: "Comorbidity",                   db: "comorbidity",            bucket: "patient" },
  { excel: "Family history",                db: "family_history",         bucket: "patient" },
  { excel: "Metastasis",                    db: "metastasis",             bucket: "patient" },
  { excel: "Patient status",                db: "patient_status",         bucket: "patient" },
  { excel: "Sample Collection Date",        db: "sample_collection_date", bucket: "sample"  },
  { excel: "DNA availability",              db: "dna_availability",       bucket: "sample"  },
  { excel: "Sequencing",                    db: "sequencing",             bucket: "sample"  },
  { excel: "DIN",                           db: "din",                    bucket: "sample"  },
  { excel: "Research/Report",               db: "research_report",        bucket: "sample"  },
  { excel: "Sequencing partner (E)",        db: "sequencing_partner",     bucket: "sample"  },
  { excel: "Data received (E)",             db: "data_received",          bucket: "sample"  },
  { excel: "TMR-EGbp",                      db: "tmr_e",                  bucket: "sample"  },
  { excel: "Old Gbp",                       db: "old_gbp",                bucket: "sample"  },
  { excel: "Gbp",                           db: "gbp",                    bucket: "sample"  },
  { excel: "Data analysed-E (Som)",         db: "data_analysed_som",      bucket: "sample"  },
  { excel: "Data analysed-E (Germ)",        db: "data_analysed_germ",     bucket: "sample"  },
  { excel: "Sample labeling",               db: "sample_labeling",        bucket: "sample"  },
  { excel: "Analysis",                      db: "analysis",               bucket: "sample"  },
  { excel: "Report (made/release)",         db: "report_status",          bucket: "sample"  },
  { excel: "Report Release Date",           db: "report_release_date",    bucket: "sample"  },
  { excel: "Comments (report sample ID)",   db: "comments",               bucket: "sample"  },
  { excel: "Consultation",                  db: "consultation",           bucket: "patient" },
];

// Fast lookup: normalised Excel header → COLUMN_DEF
const HEADER_LOOKUP = {};
COLUMN_DEFS.forEach(def => {
  HEADER_LOOKUP[def.excel.trim().toLowerCase()] = def;
});

// ── Template download ─────────────────────────────────────────────────────────
function downloadTemplate() {
  const headers = COLUMN_DEFS.map(d => d.excel);
  const ws = XLSX.utils.aoa_to_sheet([headers]);
  ws["!cols"] = headers.map(() => ({ wch: 26 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Samples");
  XLSX.writeFile(wb, "sample_template.xlsx");
}

// ── Parse Excel → rows with { patientPayload, samplePayload } ─────────────────
function parseExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb  = XLSX.read(e.target.result, { type: "array" });
        const ws  = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { defval: "", header: 1 });
        if (!raw.length) { resolve([]); return; }

        // Map each column index → COLUMN_DEF (or null if unrecognised)
        const headerRow = raw[0];
        const colDefs   = headerRow.map(h => HEADER_LOOKUP[String(h).trim().toLowerCase()] ?? null);

        const rows = raw.slice(1).map(row => {
          const patientPayload = {};
          const samplePayload  = {};
          colDefs.forEach((def, idx) => {
            if (!def) return;
            const val = row[idx] ?? "";
            if (String(val).trim() === "") return;
            if (def.bucket === "patient") patientPayload[def.db] = val;
            else                          samplePayload[def.db]  = val;
          });
          return { patientPayload, samplePayload };
        });

        // Drop fully empty rows
        const nonEmpty = rows.filter(r =>
          Object.keys(r.patientPayload).length > 0 ||
          Object.keys(r.samplePayload).length  > 0
        );
        resolve(nonEmpty);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsArrayBuffer(file);
  });
}

// ── Status pill ───────────────────────────────────────────────────────────────
function Pill({ status }) {
  const map = {
    pending:   { bg: "#f1f5f9", color: "#64748b" },
    success:   { bg: "#e8f8f0", color: "#16a34a" },
    created:   { bg: "#eff6ff", color: "#2563eb" },
    error:     { bg: "#fef2f2", color: "#dc2626" },
    uploading: { bg: "#fefce8", color: "#ca8a04" },
  };
  const cfg = map[status] || map.pending;
  const labels = {
    pending: "Pending", success: "Saved", created: "Patient Created",
    error: "Error", uploading: "Uploading…",
  };
  return (
    <span style={{
      padding: "3px 10px", borderRadius: 20,
      background: cfg.bg, color: cfg.color,
      fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
      whiteSpace: "nowrap",
    }}>{labels[status] || status}</span>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────────
export default function BulkUploadModal({ onClose, onDone }) {
  const [step, setStep]             = useState("drop");
  const [rows, setRows]             = useState([]);
  const [rowStatus, setRowStatus]   = useState([]);
  const [rowError, setRowError]     = useState([]);
  const [dragOver, setDragOver]     = useState(false);
  const [parseError, setParseError] = useState(null);
  const [summary, setSummary]       = useState(null);
  const fileRef                     = useRef();

  // ── Handle file ──
  const handleFile = useCallback(async (file) => {
    setParseError(null);
    if (!file) return;
    const ok = file.name.endsWith(".xlsx") || file.name.endsWith(".xls") || file.name.endsWith(".csv");
    if (!ok) { setParseError("Please upload an .xlsx, .xls, or .csv file."); return; }
    try {
      const parsed = await parseExcel(file);
      if (!parsed.length) { setParseError("The file appears to be empty."); return; }

      // Column-level check
      const first = parsed[0];
      if (!("patient_id" in first.patientPayload)) {
        setParseError('Missing required column: "Patient ID". Please use the template.'); return;
      }
      if (!("sid" in first.samplePayload)) {
        setParseError('Missing required column: "Sample ID". Please use the template.'); return;
      }

      // Row-level check
      const rowErrors = parsed.map((r, i) => {
        const missing = [];
        if (!String(r.patientPayload.patient_id ?? "").trim()) missing.push("Patient ID");
        if (!String(r.samplePayload.sid         ?? "").trim()) missing.push("Sample ID");
        return missing.length ? `Row ${i + 1}: missing ${missing.join(", ")}` : "";
      });
      const invalid = rowErrors.filter(Boolean);
      if (invalid.length) {
        setParseError(
          `${invalid.length} row(s) are missing required fields:\n` +
          invalid.slice(0, 5).join("\n") +
          (invalid.length > 5 ? `\n…and ${invalid.length - 5} more` : "")
        );
        return;
      }

      setRows(parsed);
      setRowStatus(parsed.map(() => "pending"));
      setRowError(parsed.map(() => ""));
      setStep("preview");
    } catch (err) {
      setParseError("Could not parse file: " + err.message);
    }
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  // ── Upload all rows ──
  async function uploadAll() {
    setStep("uploading");
    const statuses = [...rowStatus];
    const errors   = [...rowError];
    let successCount = 0, createdCount = 0, errorCount = 0;

    for (let i = 0; i < rows.length; i++) {
      statuses[i] = "uploading";
      setRowStatus([...statuses]);

      const { patientPayload, samplePayload } = rows[i];

      const missing = [];
      if (!String(patientPayload.patient_id ?? "").trim()) missing.push("Patient ID");
      if (!String(samplePayload.sid         ?? "").trim()) missing.push("Sample ID");
      if (missing.length) {
        statuses[i] = "error";
        errors[i]   = `Missing required field(s): ${missing.join(", ")}`;
        errorCount++;
        setRowStatus([...statuses]);
        setRowError([...errors]);
        continue;
      }

      try {
        // 1. Find or create patient
        let patientDbId   = null;
        let patientCreated = false;

        const checkRes    = await fetch(`http://localhost:8000/patients`);
        const allPatients = await checkRes.json();
        const existing    = allPatients.find(p => p.patient_id === String(patientPayload.patient_id));

        if (existing) {
          patientDbId = existing.id;
        } else {
          if (!patientPayload.name) patientPayload.name = String(patientPayload.patient_id);
          const createRes = await fetch("http://localhost:8000/patients/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patientPayload),
          });
          if (!createRes.ok) {
            const err = await createRes.json();
            throw new Error(err.detail || "Failed to create patient");
          }
          const refreshRes = await fetch(`http://localhost:8000/patients`);
          const refreshed  = await refreshRes.json();
          const newP       = refreshed.find(p => p.patient_id === String(patientPayload.patient_id));
          patientDbId      = newP?.id;
          patientCreated   = true;
        }

        if (!patientDbId) throw new Error("Could not resolve patient ID after creation");

        // 2. Add sample
        const sampleRes = await fetch(`http://localhost:8000/patients/${patientDbId}/samples`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(samplePayload),
        });
        if (!sampleRes.ok) {
          const err = await sampleRes.json();
          throw new Error(err.detail || "Failed to add sample");
        }

        statuses[i] = patientCreated ? "created" : "success";
        if (patientCreated) createdCount++; else successCount++;

      } catch (err) {
        statuses[i] = "error";
        errors[i]   = err.message;
        errorCount++;
      }

      setRowStatus([...statuses]);
      setRowError([...errors]);
    }

    setSummary({ successCount, createdCount, errorCount, total: rows.length });
    setStep("done");
    if (onDone) onDone();
  }

  const overlay = {
    position: "fixed", inset: 0, zIndex: 1000,
    background: "rgba(15,23,42,0.55)", backdropFilter: "blur(4px)",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: 24, animation: "fadeIn 0.18s ease",
  };
  const modal = {
    background: "#fff", borderRadius: 20,
    width: "100%", maxWidth: 760,
    maxHeight: "90vh", overflowY: "auto",
    boxShadow: "0 24px 80px rgba(0,0,0,0.18)",
    animation: "slideUp 0.22s ease",
    fontFamily: "'DM Sans', sans-serif",
  };

  return (
    <>
      <style>{`
        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes slideUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:none} }
        @keyframes spin    { to{transform:rotate(360deg)} }
        .upload-btn:hover  { background:#1d4ed8 !important; transform:translateY(-1px); }
        .close-btn:hover   { background:#e2e8f0 !important; }
        .template-btn:hover{ background:#f1f5f9 !important; }
        .row-hover:hover   { background:#f8fafc !important; }
      `}</style>

      <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div style={modal}>

          {/* ── Header ── */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "22px 28px", borderBottom: "1px solid #f1f5f9",
            position: "sticky", top: 0, background: "#fff", zIndex: 10,
            borderRadius: "20px 20px 0 0",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                background: "linear-gradient(135deg,#dbeafe,#bfdbfe)",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
              }}>📊</div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>Bulk Sample Upload</div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 1 }}>
                  Upload an Excel file to add multiple samples at once
                </div>
              </div>
            </div>
            <button className="close-btn" onClick={onClose} style={{
              background: "#f0f4f8", border: "none", borderRadius: 10,
              width: 34, height: 34, cursor: "pointer", fontSize: 18, color: "#64748b",
              display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.15s",
            }}>×</button>
          </div>

          {/* ── Body ── */}
          <div style={{ padding: "24px 28px" }}>

            {step === "drop" && (
              <>
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}
                  onClick={() => fileRef.current?.click()}
                  style={{
                    border: `2px dashed ${dragOver ? "#3b82f6" : "#e2e8f0"}`,
                    borderRadius: 16, padding: "48px 24px",
                    textAlign: "center", cursor: "pointer",
                    background: dragOver ? "#eff6ff" : "#fafbfc",
                    transition: "all 0.18s",
                  }}
                >
                  <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }}
                    onChange={e => handleFile(e.target.files[0])} />
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📂</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>
                    Drop your Excel file here
                  </div>
                  <div style={{ fontSize: 13, color: "#94a3b8" }}>
                    or click to browse — supports .xlsx, .xls, .csv
                  </div>
                </div>

                {parseError && (
                  <div style={{
                    marginTop: 14, padding: "11px 16px", borderRadius: 10,
                    background: "#fef2f2", border: "1px solid #fecaca",
                    color: "#dc2626", fontSize: 13, fontWeight: 500,
                    display: "flex", alignItems: "flex-start", gap: 8,
                    whiteSpace: "pre-line",
                  }}>⚠️ {parseError}</div>
                )}

                <div style={{
                  marginTop: 20, padding: "16px 20px", borderRadius: 12,
                  background: "#f8fafc", border: "1px solid #e8edf3",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>Need a template?</div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                      Download a blank Excel file with all columns in the correct order
                    </div>
                  </div>
                  <button className="template-btn" onClick={downloadTemplate} style={{
                    padding: "9px 16px", borderRadius: 9,
                    border: "1.5px solid #e2e8f0", background: "#fff",
                    color: "#334155", fontSize: 13, fontWeight: 600,
                    cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                    transition: "background 0.15s", whiteSpace: "nowrap",
                  }}>
                    ⬇️ Download Template
                  </button>
                </div>

                {/* Column reference — patient | sample */}
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
                    Column Reference
                  </div>
                  <div style={{ display: "flex", gap: 16 }}>
                    <div style={{ flex: 1, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 14px" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#2563eb", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                        Patient fields
                      </div>
                      {COLUMN_DEFS.filter(d => d.bucket === "patient").map(d => (
                        <div key={d.db} style={{ fontSize: 12, padding: "3px 0", display: "flex", alignItems: "center", gap: 6 }}>
                          {d.db === "patient_id" && <span style={{ color: "#dc2626", fontWeight: 700, fontSize: 10 }}>*</span>}
                          <span style={{ color: "#334155", fontFamily: "'DM Mono', monospace" }}>{d.excel}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ flex: 1, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 14px" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#7c3aed", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                        Sample fields
                      </div>
                      {COLUMN_DEFS.filter(d => d.bucket === "sample").map(d => (
                        <div key={d.db} style={{ fontSize: 12, padding: "3px 0", display: "flex", alignItems: "center", gap: 6 }}>
                          {d.db === "sid" && <span style={{ color: "#dc2626", fontWeight: 700, fontSize: 10 }}>*</span>}
                          <span style={{ color: "#334155", fontFamily: "'DM Mono', monospace" }}>{d.excel}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, color: "#dc2626" }}>* required</div>
                </div>
              </>
            )}

            {(step === "preview" || step === "uploading" || step === "done") && (
              <>
                {step === "done" && summary && (
                  <div style={{
                    marginBottom: 20, padding: "14px 20px", borderRadius: 12,
                    background: summary.errorCount === 0 ? "#e8f8f0" : "#fef9ec",
                    border: `1px solid ${summary.errorCount === 0 ? "#b3e8cf" : "#fde68a"}`,
                    display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap",
                  }}>
                    <span style={{ fontSize: 20 }}>{summary.errorCount === 0 ? "✅" : "⚠️"}</span>
                    <div style={{ fontSize: 13, color: "#0f172a", fontWeight: 600 }}>
                      Upload complete — {summary.total} rows processed
                    </div>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginLeft: "auto" }}>
                      {summary.successCount > 0 && <Pill status="success" />}
                      {summary.createdCount > 0 && <span style={{ fontSize: 12, color: "#2563eb", fontWeight: 600 }}>+{summary.createdCount} patients auto-created</span>}
                      {summary.errorCount   > 0 && <span style={{ fontSize: 12, color: "#dc2626", fontWeight: 600 }}>{summary.errorCount} errors</span>}
                    </div>
                  </div>
                )}

                {step === "preview" && (
                  <div style={{ marginBottom: 16, fontSize: 13, color: "#64748b" }}>
                    <strong style={{ color: "#0f172a" }}>{rows.length} rows</strong> detected. Review before uploading.
                    Patients not found in the database will be <strong>auto-created</strong>.
                  </div>
                )}

                <div style={{
                  border: "1px solid #e8edf3", borderRadius: 12, overflow: "hidden",
                  maxHeight: 380, overflowY: "auto",
                }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
                    <thead style={{ position: "sticky", top: 0, zIndex: 5 }}>
                      <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e8edf3" }}>
                        {["#", "Patient ID *", "Name", "Sample ID *", "New Case label", "Sequencing", "Data received", "Status"].map(h => (
                          <th key={h} style={{
                            padding: "10px 14px", textAlign: "left",
                            fontSize: 10, fontWeight: 700, color: "#94a3b8",
                            letterSpacing: "0.07em", textTransform: "uppercase",
                            fontFamily: "'DM Mono', monospace", whiteSpace: "nowrap",
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => {
                        const p = row.patientPayload;
                        const s = row.samplePayload;
                        return (
                          <tr key={i} className="row-hover" style={{
                            borderBottom: i < rows.length - 1 ? "1px solid #f1f5f9" : "none",
                            background: "#fff",
                          }}>
                            <td style={{ padding: "11px 14px", fontSize: 12, color: "#94a3b8", fontFamily: "'DM Mono', monospace" }}>{i + 1}</td>
                            <td style={{ padding: "11px 14px", fontSize: 12, fontWeight: 600, fontFamily: "'DM Mono', monospace" }}>
                              {p.patient_id
                                ? <span style={{ color: "#2563eb" }}>{p.patient_id}</span>
                                : <span style={{ color: "#dc2626", fontWeight: 700 }}>⚠ missing</span>}
                            </td>
                            <td style={{ padding: "11px 14px", fontSize: 13, color: "#0f172a" }}>{p.name || "—"}</td>
                            <td style={{ padding: "11px 14px", fontSize: 12, fontFamily: "'DM Mono', monospace" }}>
                              {s.sid
                                ? <span style={{ color: "#64748b" }}>{s.sid}</span>
                                : <span style={{ color: "#dc2626", fontWeight: 700 }}>⚠ missing</span>}
                            </td>
                            <td style={{ padding: "11px 14px", fontSize: 12, color: "#7c3aed", fontFamily: "'DM Mono', monospace" }}>{s.new_case_label || "—"}</td>
                            <td style={{ padding: "11px 14px", fontSize: 12, color: "#64748b" }}>{s.sequencing || "—"}</td>
                            <td style={{ padding: "11px 14px", fontSize: 12, color: "#64748b" }}>{s.data_received || "—"}</td>
                            <td style={{ padding: "11px 14px" }}>
                              {step === "uploading" && rowStatus[i] === "uploading" ? (
                                <div style={{
                                  width: 16, height: 16, borderRadius: "50%",
                                  border: "2px solid #e2e8f0", borderTopColor: "#2563eb",
                                  animation: "spin 0.7s linear infinite", display: "inline-block",
                                }} />
                              ) : (
                                <div>
                                  <Pill status={rowStatus[i]} />
                                  {rowError[i] && (
                                    <div style={{ fontSize: 10, color: "#dc2626", marginTop: 3 }}>{rowError[i]}</div>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {/* ── Footer ── */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "16px 28px 24px", gap: 12,
          }}>
            {step === "drop" && (
              <button onClick={onClose} style={{
                padding: "10px 20px", borderRadius: 10,
                border: "1.5px solid #e2e8f0", background: "#fff",
                color: "#64748b", fontSize: 14, fontWeight: 600,
                cursor: "pointer", marginLeft: "auto",
              }}>Cancel</button>
            )}

            {step === "preview" && (
              <>
                <button onClick={() => { setStep("drop"); setRows([]); setParseError(null); }} style={{
                  padding: "10px 20px", borderRadius: 10,
                  border: "1.5px solid #e2e8f0", background: "#fff",
                  color: "#64748b", fontSize: 14, fontWeight: 600, cursor: "pointer",
                }}>← Back</button>
                <button className="upload-btn" onClick={uploadAll} style={{
                  padding: "10px 24px", borderRadius: 10, border: "none",
                  background: "#2563eb", color: "#fff",
                  fontSize: 14, fontWeight: 700, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 8,
                  boxShadow: "0 2px 8px rgba(37,99,235,0.3)", transition: "all 0.15s",
                }}>
                  Upload {rows.length} Rows →
                </button>
              </>
            )}

            {step === "uploading" && (
              <div style={{ fontSize: 13, color: "#64748b", margin: "0 auto", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 16, height: 16, borderRadius: "50%",
                  border: "2px solid #e2e8f0", borderTopColor: "#2563eb",
                  animation: "spin 0.7s linear infinite",
                }} />
                Uploading rows… please wait
              </div>
            )}

            {step === "done" && (
              <>
                <button onClick={() => { setStep("drop"); setRows([]); setRowStatus([]); setRowError([]); setSummary(null); }} style={{
                  padding: "10px 20px", borderRadius: 10,
                  border: "1.5px solid #e2e8f0", background: "#fff",
                  color: "#64748b", fontSize: 14, fontWeight: 600, cursor: "pointer",
                }}>Upload Another</button>
                <button className="upload-btn" onClick={onClose} style={{
                  padding: "10px 24px", borderRadius: 10, border: "none",
                  background: "#2563eb", color: "#fff",
                  fontSize: 14, fontWeight: 700, cursor: "pointer",
                  boxShadow: "0 2px 8px rgba(37,99,235,0.3)", transition: "all 0.15s",
                }}>Done ✓</button>
              </>
            )}
          </div>

        </div>
      </div>
    </>
  );
}