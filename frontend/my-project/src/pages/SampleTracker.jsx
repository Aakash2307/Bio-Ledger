// src/pages/SampleTracker.jsx
// Phase 2 — Placeholder UI
// TODO Phase 3: build full sample tracking module

import logo from "../assets/tzarnewlogo.png";

const PIPELINE_STAGES = [
  { label: "Sample Collection", icon: "🧪", color: "#4A90D9" },
  { label: "Quality Check",     icon: "🔬", color: "#E8A838" },
  { label: "Sequencing",        icon: "〜", color: "#8B72BE" },
  { label: "Data Received",     icon: "📡", color: "#3BBFB2" },
  { label: "Report Generated",  icon: "📄", color: "#4CAF82" },
];

export default function SampleTracker() {
  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#0f172a" }}>Sample Tracker</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
            End-to-end sample pipeline visibility · Coming in Phase 2
          </p>
        </div>
        <img src={logo} alt="Logo" style={{ height: 44, objectFit: "contain" }} />
      </div>

      {/* ── Under construction banner ── */}
      <div style={{
        marginBottom: 36,
        padding: "10px 18px",
        borderRadius: 10,
        background: "linear-gradient(90deg, #fffbeb, #fef3c7)",
        border: "1px solid #fcd34d",
        display: "flex", alignItems: "center", gap: 10,
        fontSize: 13, color: "#92400e", fontWeight: 500,
      }}>
        <span style={{ fontSize: 16 }}>🚧</span>
        This module is under construction and will be available in Phase 3.
      </div>

      {/* ── Pipeline flow ── */}
      <div style={{
        background: "#fff",
        borderRadius: 16,
        border: "1px solid #e2e8f0",
        padding: "28px 24px",
      }}>
        <p style={{ margin: "0 0 24px", fontSize: 13, fontWeight: 600, color: "#64748b" }}>
          Sample Pipeline Flow
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: 0, overflowX: "auto" }}>
          {PIPELINE_STAGES.map((stage, idx) => (
            <div key={stage.label} style={{ display: "flex", alignItems: "center", flex: "1 1 0", minWidth: 90 }}>

              {/* Stage box */}
              <div style={{
                flex: 1,
                border: "1.5px solid #e2e8f0",
                borderRadius: 12,
                padding: "16px 10px",
                textAlign: "center",
                background: "#fafafa",
              }}>
                <div style={{ fontSize: 22, marginBottom: 8 }}>{stage.icon}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", lineHeight: 1.4 }}>
                  {stage.label}
                </div>
              </div>

              {/* Connector */}
              {idx < PIPELINE_STAGES.length - 1 && (
                <div style={{ padding: "0 4px", flexShrink: 0, color: "#cbd5e1", fontSize: 13 }}>
                  ▶
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}