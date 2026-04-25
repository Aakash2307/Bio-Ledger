// src/pages/SampleTrackerList.jsx
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";

const MOCK_PATIENTS = [
  {
    id: "PAT001",
    name: "Prithvi Kotian",
    samples: [
      { sampleId: "SMP001", type: "Blood", collectedDate: "2025-01-10", currentStage: 2, totalStages: 12, status: "In Progress" },
      { sampleId: "SMP002", type: "Tissue", collectedDate: "2025-02-14", currentStage: 6, totalStages: 12, status: "Pending" },
    ],
  },
  {
    id: "PAT002",
    name: "Anika Sharma",
    samples: [
      { sampleId: "SMP003", type: "Blood", collectedDate: "2025-01-22", currentStage: 12, totalStages: 12, status: "Completed" },
    ],
  },
  {
    id: "PAT003",
    name: "Rohan Mehta",
    samples: [
      { sampleId: "SMP004", type: "Saliva", collectedDate: "2025-03-05", currentStage: 4, totalStages: 12, status: "In Progress" },
    ],
  },
  {
    id: "PAT004",
    name: "Divya Nair",
    samples: [
      { sampleId: "SMP005", type: "Blood", collectedDate: "2025-03-18", currentStage: 1, totalStages: 12, status: "In Progress" },
      { sampleId: "SMP006", type: "Blood", collectedDate: "2025-04-01", currentStage: 3, totalStages: 12, status: "Pending" },
    ],
  },
  {
    id: "PAT005",
    name: "Karan Bhatia",
    samples: [
      { sampleId: "SMP007", type: "Tissue", collectedDate: "2025-02-28", currentStage: 9, totalStages: 12, status: "In Progress" },
    ],
  },
  {
    id: "PAT006",
    name: "Sneha Iyer",
    samples: [
      { sampleId: "SMP008", type: "Blood", collectedDate: "2025-04-10", currentStage: 12, totalStages: 12, status: "Completed" },
    ],
  },
];

const STAGE_LABELS = [
  "Blood Sample Collected",
  "RNA/DNA Extraction",
  "Pre-Consultation",
  "Clinical Reports",
  "Library Preparation",
  "Sequencing Performed",
  "Raw Data Received",
  "DEG Generated",
  "Analysis Completed",
  "Report Generated",
  "Report Delivered",
  "Post Consultation",
];

const STATUS_COLORS = {
  "Completed":   { bg: "#dcfce7", text: "#15803d", dot: "#22c55e" },
  "In Progress": { bg: "#dbeafe", text: "#1d4ed8", dot: "#3b82f6" },
  "Pending":     { bg: "#fef9c3", text: "#a16207", dot: "#eab308" },
};

export default function SampleTrackerList() {
  const navigate = useNavigate();
  const [sampleIdQuery, setSampleIdQuery]   = useState("");
  const [patientNameQuery, setPatientNameQuery] = useState("");

  const filtered = useMemo(() => {
    const sid  = sampleIdQuery.trim().toLowerCase();
    const name = patientNameQuery.trim().toLowerCase();

    return MOCK_PATIENTS.map((patient) => {
      const matchedSamples = patient.samples.filter((s) => {
        const sidMatch  = sid  ? s.sampleId.toLowerCase().includes(sid)  : true;
        const nameMatch = name ? patient.name.toLowerCase().includes(name) : true;
        return sidMatch && nameMatch;
      });
      return matchedSamples.length > 0 ? { ...patient, samples: matchedSamples } : null;
    }).filter(Boolean);
  }, [sampleIdQuery, patientNameQuery]);

  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", maxWidth: 780, margin: "0 auto" }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#0f172a" }}>
          🧬 TZAR Sample Tracker
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
          Search for a sample or patient, or browse all below.
        </p>
      </div>

      {/* ── Search card ── */}
      <div style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 14,
        padding: "24px 24px 20px",
        marginBottom: 28,
        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
      }}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 6 }}>
              Search by Sample ID
            </label>
            <input
              value={sampleIdQuery}
              onChange={(e) => setSampleIdQuery(e.target.value)}
              placeholder="e.g. SMP001"
              style={{
                width: "100%", boxSizing: "border-box",
                padding: "10px 14px", borderRadius: 8,
                border: "1.5px solid #e2e8f0", fontSize: 14,
                outline: "none", color: "#0f172a",
                transition: "border-color 0.15s",
              }}
              onFocus={(e) => (e.target.style.borderColor = "#3b82f6")}
              onBlur={(e)  => (e.target.style.borderColor = "#e2e8f0")}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", paddingTop: 18, color: "#94a3b8", fontSize: 12, fontWeight: 500 }}>
            — OR —
          </div>

          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 6 }}>
              Search by Patient Name
            </label>
            <input
              value={patientNameQuery}
              onChange={(e) => setPatientNameQuery(e.target.value)}
              placeholder="e.g. Prithvi Kotian"
              style={{
                width: "100%", boxSizing: "border-box",
                padding: "10px 14px", borderRadius: 8,
                border: "1.5px solid #e2e8f0", fontSize: 14,
                outline: "none", color: "#0f172a",
                transition: "border-color 0.15s",
              }}
              onFocus={(e) => (e.target.style.borderColor = "#3b82f6")}
              onBlur={(e)  => (e.target.style.borderColor = "#e2e8f0")}
            />
          </div>
        </div>

        {(sampleIdQuery || patientNameQuery) && (
          <button
            onClick={() => { setSampleIdQuery(""); setPatientNameQuery(""); }}
            style={{
              marginTop: 12, fontSize: 12, color: "#64748b", background: "none",
              border: "none", cursor: "pointer", padding: 0, textDecoration: "underline",
            }}
          >
            Clear search
          </button>
        )}
      </div>

      {/* ── Results count ── */}
      <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>
        Showing {filtered.length} patient{filtered.length !== 1 ? "s" : ""}
        {" "}·{" "}
        {filtered.reduce((acc, p) => acc + p.samples.length, 0)} sample{filtered.reduce((acc, p) => acc + p.samples.length, 0) !== 1 ? "s" : ""}
      </p>

      {/* ── Patient cards ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {filtered.length === 0 && (
          <div style={{
            textAlign: "center", padding: "48px 24px",
            background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0",
            color: "#94a3b8", fontSize: 14,
          }}>
            No results found.
          </div>
        )}

        {filtered.map((patient) => (
          <div key={patient.id} style={{
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: 14,
            padding: "18px 20px",
            boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
          }}>
            {/* Patient header */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{
                width: 36, height: 36, borderRadius: "50%",
                background: "linear-gradient(135deg, #3b82f6, #6366f1)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontWeight: 700, fontSize: 14, flexShrink: 0,
              }}>
                {patient.name.charAt(0)}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a" }}>{patient.name}</div>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>Patient ID: {patient.id}</div>
              </div>
              <div style={{ marginLeft: "auto", fontSize: 12, color: "#94a3b8" }}>
                {patient.samples.length} sample{patient.samples.length !== 1 ? "s" : ""}
              </div>
            </div>

            {/* Sample rows */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {patient.samples.map((sample) => {
                const sc = STATUS_COLORS[sample.status] || STATUS_COLORS["Pending"];
                const pct = Math.round((sample.currentStage / sample.totalStages) * 100);
                const currentLabel = STAGE_LABELS[sample.currentStage - 1] || "—";

                return (
                  <div
                    key={sample.sampleId}
                    onClick={() => navigate(`/samples/${sample.sampleId}`)}
                    style={{
                      display: "flex", alignItems: "center", gap: 14,
                      padding: "12px 14px", borderRadius: 10,
                      border: "1.5px solid #f1f5f9", background: "#fafafa",
                      cursor: "pointer", transition: "border-color 0.15s, background 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "#3b82f6";
                      e.currentTarget.style.background  = "#eff6ff";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "#f1f5f9";
                      e.currentTarget.style.background  = "#fafafa";
                    }}
                  >
                    {/* Sample ID + type */}
                    <div style={{ minWidth: 90 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "#1d4ed8" }}>{sample.sampleId}</div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>{sample.type}</div>
                    </div>

                    {/* Progress bar */}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>
                        Stage {sample.currentStage}/{sample.totalStages} · {currentLabel}
                      </div>
                      <div style={{ height: 6, borderRadius: 999, background: "#e2e8f0", overflow: "hidden" }}>
                        <div style={{
                          height: "100%", borderRadius: 999,
                          width: `${pct}%`,
                          background: sample.status === "Completed"
                            ? "#22c55e"
                            : "linear-gradient(90deg, #3b82f6, #6366f1)",
                          transition: "width 0.4s ease",
                        }} />
                      </div>
                    </div>

                    {/* Status badge */}
                    <div style={{
                      padding: "3px 10px", borderRadius: 999,
                      background: sc.bg, color: sc.text,
                      fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
                      display: "flex", alignItems: "center", gap: 5,
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: sc.dot, display: "inline-block" }} />
                      {sample.status}
                    </div>

                    {/* Arrow */}
                    <div style={{ color: "#cbd5e1", fontSize: 14 }}>›</div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
