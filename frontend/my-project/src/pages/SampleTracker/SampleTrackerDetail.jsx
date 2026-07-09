// src/pages/SampleTrackerDetail.jsx
import { useParams, useNavigate } from "react-router-dom";

// ── Mock data — replace with API call keyed by sampleId ──────────────────────
const MOCK_SAMPLES = {
  SMP001: {
    sampleId: "SMP001",
    patientName: "Aakash Chari",
    patientId: "PAT001",
    sampleType: "Blood",
    stages: [
      { label: "Blood Sample Collected", actualDate: "10/01/2025",   expectedDate: "10/01/2025", status: "Completed" },
      { label: "DNA Extraction",     actualDate: "15/01/2025",   expectedDate: "14/01/2025", status: "Completed" },
      { label: "Pre-Consultation",       actualDate: null,            expectedDate: "20/01/2025", status: "Pending"   },
      { label: "Clinical Reports",       actualDate: null,            expectedDate: "25/01/2025", status: "Pending"   },
      { label: "Library Preparation",    actualDate: null,            expectedDate: "01/02/2025", status: "Pending"   },
      { label: "Sequencing Performed",   actualDate: null,            expectedDate: "24/02/2025", status: "Pending"   },
      { label: "Raw Data Received",      actualDate: null,            expectedDate: "01/03/2025", status: "Pending"   },
      // { label: "DEG Generated",          actualDate: null,            expectedDate: "05/03/2025", status: "Pending"   },
      { label: "Analysis Completed",     actualDate: null,            expectedDate: "10/03/2025", status: "Pending"   },
      { label: "Report Generated",       actualDate: null,            expectedDate: "15/03/2025", status: "Pending"   },
      { label: "Report Delivered",       actualDate: null,            expectedDate: "17/03/2025", status: "Pending"   },
      { label: "Post Consultation",      actualDate: null,            expectedDate: "20/03/2025", status: "Pending"   },
    ],
  },
  SMP002: {
    sampleId: "SMP002",
    patientName: "-",
    patientId: "PAT001",
    sampleType: "Tissue",
    stages: [
      { label: "Blood Sample Collected", actualDate: "14/02/2025",   expectedDate: "14/02/2025", status: "Completed" },
      { label: "RNA/DNA Extraction",     actualDate: "19/02/2025",   expectedDate: "18/02/2025", status: "Completed" },
      { label: "Pre-Consultation",       actualDate: "22/02/2025",   expectedDate: "22/02/2025", status: "Completed" },
      { label: "Clinical Reports",       actualDate: "26/02/2025",   expectedDate: "26/02/2025", status: "Completed" },
      { label: "Library Preparation",    actualDate: "03/03/2025",   expectedDate: "02/03/2025", status: "Completed" },
      { label: "Sequencing Performed",   actualDate: null,            expectedDate: "10/03/2025", status: "Pending"   },
      { label: "Raw Data Received",      actualDate: null,            expectedDate: "15/03/2025", status: "Pending"   },
      { label: "DEG Generated",          actualDate: null,            expectedDate: "18/03/2025", status: "Pending"   },
      { label: "Analysis Completed",     actualDate: null,            expectedDate: "22/03/2025", status: "Pending"   },
      { label: "Report Generated",       actualDate: null,            expectedDate: "26/03/2025", status: "Pending"   },
      { label: "Report Delivered",       actualDate: null,            expectedDate: "28/03/2025", status: "Pending"   },
      { label: "Post Consultation",      actualDate: null,            expectedDate: "31/03/2025", status: "Pending"   },
    ],
  },
  SMP003: {
    sampleId: "SMP003",
    patientName: "-",
    patientId: "PAT002",
    sampleType: "Blood",
    stages: [
      { label: "Blood Sample Collected", actualDate: "22/01/2025", expectedDate: "22/01/2025", status: "Completed" },
      { label: "RNA/DNA Extraction",     actualDate: "27/01/2025", expectedDate: "27/01/2025", status: "Completed" },
      { label: "Pre-Consultation",       actualDate: "30/01/2025", expectedDate: "30/01/2025", status: "Completed" },
      { label: "Clinical Reports",       actualDate: "04/02/2025", expectedDate: "04/02/2025", status: "Completed" },
      { label: "Library Preparation",    actualDate: "10/02/2025", expectedDate: "10/02/2025", status: "Completed" },
      { label: "Sequencing Performed",   actualDate: "18/02/2025", expectedDate: "18/02/2025", status: "Completed" },
      { label: "Raw Data Received",      actualDate: "22/02/2025", expectedDate: "22/02/2025", status: "Completed" },
      { label: "DEG Generated",          actualDate: "25/02/2025", expectedDate: "25/02/2025", status: "Completed" },
      { label: "Analysis Completed",     actualDate: "01/03/2025", expectedDate: "01/03/2025", status: "Completed" },
      { label: "Report Generated",       actualDate: "05/03/2025", expectedDate: "05/03/2025", status: "Completed" },
      { label: "Report Delivered",       actualDate: "07/03/2025", expectedDate: "07/03/2025", status: "Completed" },
      { label: "Post Consultation",      actualDate: "10/03/2025", expectedDate: "10/03/2025", status: "Completed" },
    ],
  },
};

// Fallback stages for samples not in mock
function defaultStages() {
  return [
    "Blood Sample Collected","RNA/DNA Extraction","Pre-Consultation","Clinical Reports",
    "Library Preparation","Sequencing Performed","Raw Data Received","DEG Generated",
    "Analysis Completed","Report Generated","Report Delivered","Post Consultation",
  ].map((label) => ({ label, actualDate: null, expectedDate: null, status: "Pending" }));
}

// ── Stage step component ──────────────────────────────────────────────────────
function StageRow({ stage, index, isLast }) {
  const isCompleted = stage.status === "Completed";
  const isNext = !isCompleted && index === 0; // caller filters to first non-complete
  const showDetail = !isCompleted; // show date card only for non-completed

  return (
    <div style={{ display: "flex", gap: 16, position: "relative" }}>
      {/* Left: circle + connector */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
        {/* Circle */}
        <div style={{
          width: 36, height: 36, borderRadius: "50%",
          border: isCompleted ? "none" : "2px solid #cbd5e1",
          background: isCompleted ? "#22c55e" : "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: isCompleted ? "#fff" : "#94a3b8",
          fontWeight: 700, fontSize: isCompleted ? 16 : 13,
          flexShrink: 0, zIndex: 1,
          boxShadow: isCompleted ? "0 0 0 3px #dcfce7" : "none",
          transition: "all 0.2s",
        }}>
          {isCompleted ? "✓" : index + 1}
        </div>
        {/* Vertical line */}
        {!isLast && (
          <div style={{
            width: 2, flex: 1, minHeight: 24,
            background: isCompleted ? "#22c55e" : "#e2e8f0",
            marginTop: 2, marginBottom: 2,
          }} />
        )}
      </div>

      {/* Right: content */}
      <div style={{ paddingBottom: isLast ? 0 : 20, flex: 1 }}>
        <div style={{
          fontWeight: isCompleted ? 700 : 500,
          fontSize: 14,
          color: isCompleted ? "#15803d" : "#334155",
          marginTop: 7,
          marginBottom: showDetail && !isCompleted ? 8 : 0,
        }}>
          {stage.label}
        </div>

        {/* Date detail card — only shown for non-completed stages */}
        {showDetail && (
          <div style={{
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 12,
            color: "#475569",
            display: "flex", flexDirection: "column", gap: 4,
          }}>
            <div>✅ <strong>Actual:</strong> {stage.actualDate || "—"}</div>
            <div>📅 <strong>Expected:</strong> {stage.expectedDate || "—"}</div>
            <div>⏱ <strong>Status:</strong> {stage.status}</div>
          </div>
        )}

        {/* Completed — show actual date inline */}
        {isCompleted && stage.actualDate && (
          <div style={{ fontSize: 11, color: "#86efac", marginTop: 2 }}>
            Completed {stage.actualDate}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SampleTrackerDetail() {
  const { sampleId } = useParams();
  const navigate     = useNavigate();

  const data = MOCK_SAMPLES[sampleId] || {
    sampleId,
    patientName: "Unknown Patient",
    patientId:   "—",
    sampleType:  "—",
    stages:      defaultStages(),
  };

  const completedCount = data.stages.filter((s) => s.status === "Completed").length;
  const totalCount     = data.stages.length;
  const pct            = Math.round((completedCount / totalCount) * 100);

  // Find index of first non-completed stage (for "current" highlight)
  const currentIdx = data.stages.findIndex((s) => s.status !== "Completed");

  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", maxWidth: 560, margin: "0 auto" }}>

      {/* ── Back button ── */}
      <button
        onClick={() => navigate("/samples")}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "none", border: "none", cursor: "pointer",
          color: "#3b82f6", fontSize: 13, fontWeight: 600,
          padding: 0, marginBottom: 20,
        }}
      >
        ← Back to Sample Tracker
      </button>

      {/* ── Sample header card ── */}
      <div style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 16,
        padding: "22px 24px",
        marginBottom: 20,
        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
      }}>
        <div style={{ marginBottom: 4 }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>
            Sample ID: {data.sampleId}
          </span>
        </div>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
          Patient: {data.patientName} · {data.sampleType} Sample
        </div>

        {/* Progress summary */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ height: 8, borderRadius: 999, background: "#e2e8f0", overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 999,
                width: `${pct}%`,
                background: pct === 100
                  ? "#22c55e"
                  : "linear-gradient(90deg, #3b82f6, #6366f1)",
                transition: "width 0.5s ease",
              }} />
            </div>
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", whiteSpace: "nowrap" }}>
            {completedCount}/{totalCount} stages · {pct}%
          </div>
        </div>
      </div>

      {/* ── Pipeline timeline card ── */}
      <div style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 16,
        padding: "24px 24px 20px",
        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
      }}>
        <p style={{ margin: "0 0 20px", fontSize: 12, fontWeight: 600, color: "#94a3b8", letterSpacing: "0.05em", textTransform: "uppercase" }}>
          Pipeline Progress
        </p>

        {data.stages.map((stage, idx) => {
          // For non-completed stages, only show detail card on the FIRST non-completed (current) stage
          const stageWithDetail = {
            ...stage,
            // override status display: show detail only for current stage
            _showDetail: idx === currentIdx,
          };

          return (
            <StageRowSmart
              key={idx}
              stage={stage}
              index={idx}
              isLast={idx === data.stages.length - 1}
              isCurrent={idx === currentIdx}
            />
          );
        })}
      </div>
    </div>
  );
}

// Separate smart stage row that handles "current" vs future differently
function StageRowSmart({ stage, index, isLast, isCurrent }) {
  const isCompleted = stage.status === "Completed";

  return (
    <div style={{ display: "flex", gap: 16, position: "relative" }}>
      {/* Circle + connector */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
        <div style={{
          width: 36, height: 36, borderRadius: "50%",
          border: isCompleted ? "none" : "2px solid #cbd5e1",
          background: isCompleted ? "#22c55e" : "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: isCompleted ? "#fff" : "#94a3b8",
          fontWeight: 700,
          fontSize: isCompleted ? 16 : 13,
          flexShrink: 0, zIndex: 1,
          boxShadow: isCompleted ? "0 0 0 4px #dcfce7" : isCurrent ? "0 0 0 3px #dbeafe" : "none",
        }}>
          {isCompleted ? "✓" : index + 1}
        </div>
        {!isLast && (
          <div style={{
            width: 2,
            flex: 1,
            minHeight: 20,
            background: isCompleted ? "#22c55e" : "#e2e8f0",
            marginTop: 2,
            marginBottom: 2,
          }} />
        )}
      </div>

      {/* Content */}
      <div style={{ paddingBottom: isLast ? 0 : 20, flex: 1 }}>
        <div style={{
          fontWeight: isCompleted ? 700 : isCurrent ? 600 : 400,
          fontSize: 14,
          color: isCompleted ? "#15803d" : isCurrent ? "#1d4ed8" : "#94a3b8",
          marginTop: 8,
          marginBottom: (isCurrent) ? 8 : 0,
        }}>
          {stage.label}
        </div>

        {/* Completed inline date */}
        {isCompleted && stage.actualDate && (
          <div style={{ fontSize: 11, color: "#86efac", marginTop: -4, marginBottom: 0 }}>
            {stage.actualDate}
          </div>
        )}

        {/* Current stage detail card */}
        {isCurrent && (
          <div style={{
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 12,
            color: "#475569",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}>
            <div>✅ <strong>Actual:</strong> {stage.actualDate || "—"}</div>
            <div>📅 <strong>Expected:</strong> {stage.expectedDate || "—"}</div>
            <div>⏱ <strong>Status:</strong> {stage.status}</div>
          </div>
        )}
      </div>
    </div>
  );
}
