// src/pages/SequencingAnalysis.jsx
// Phase 2 — Static placeholder / teaser page
// TODO Phase 3: implement each module below

import logo from "../assets/tzarnewlogo.png";

const MODULES = [
  {
    key: "fastq_vcf",
    label: "FASTQ → VCF",
    icon: "🧬",
    description: "End-to-end variant calling pipeline from raw reads to annotated VCF",
    color: "#4A90D9",
    glow: "rgba(74,144,217,0.15)",
    soon: false, // first card, slightly more "ready" feel
  },
  {
    key: "prs",
    label: "PRS",
    icon: "📊",
    description: "Polygenic Risk Score computation across curated trait panels",
    color: "#8B72BE",
    glow: "rgba(139,114,190,0.15)",
    soon: true,
  },
  {
    key: "coverage",
    label: "Coverage Analysis",
    icon: "📡",
    description: "Per-base & per-exon depth metrics with QC thresholds",
    color: "#3BBFB2",
    glow: "rgba(59,191,178,0.15)",
    soon: true,
  },
  {
    key: "report",
    label: "Report Automation",
    icon: "📄",
    description: "Auto-generated clinical genomics reports from pipeline output",
    color: "#4CAF82",
    glow: "rgba(76,175,130,0.15)",
    soon: true,
  },
  {
    key: "cnv",
    label: "CNV Kit",
    icon: "🔍",
    description: "Copy number variant detection from WES/WGS data",
    color: "#E8A838",
    glow: "rgba(232,168,56,0.15)",
    soon: true,
  },
//   {
//     key: "fusion",
//     label: "Gene Fusion",
//     icon: "⚡",
//     description: "RNA-based fusion transcript identification",
//     color: "#D95B5B",
//     glow: "rgba(217,91,91,0.15)",
//     soon: true,
//   },
];

export default function SequencingAnalysis() {
  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#0f172a" }}>
            Sequencing Analysis
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
            Bioinformatics pipeline modules · Phase 3 rollout
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
        These modules are currently under development and will be available in Phase 3.
      </div>

      {/* ── Section label ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, marginBottom: 20,
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>Pipeline Modules</span>
        <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
        <span style={{
          fontSize: 11, fontWeight: 600, color: "#94a3b8",
          background: "#f1f5f9", padding: "3px 10px", borderRadius: 20,
        }}>
          {MODULES.length} modules planned
        </span>
      </div>

      {/* ── Module grid ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        gap: 16,
      }}>
        {MODULES.map(mod => (
          <div
            key={mod.key}
            style={{
              borderRadius: 14,
              border: `1.5px solid ${mod.soon ? "#e2e8f0" : mod.color + "55"}`,
              background: mod.soon ? "#fafafa" : `linear-gradient(145deg, ${mod.glow}, #fff)`,
              padding: "20px 18px",
              position: "relative",
              opacity: mod.soon ? 0.72 : 1,
              transition: "all 0.18s",
              cursor: "default",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.opacity = "1";
              e.currentTarget.style.border = `1.5px solid ${mod.color}55`;
              e.currentTarget.style.boxShadow = `0 4px 18px ${mod.glow}`;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.opacity = mod.soon ? "0.72" : "1";
              e.currentTarget.style.border = `1.5px solid ${mod.soon ? "#e2e8f0" : mod.color + "55"}`;
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            {/* Lock badge */}
            {mod.soon && (
              <div style={{
                position: "absolute", top: 12, right: 12,
                fontSize: 13, color: "#cbd5e1",
              }}>
                🔒
              </div>
            )}

            {/* Icon */}
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: mod.soon ? "#f1f5f9" : `linear-gradient(135deg, ${mod.glow}, ${mod.color}22)`,
              border: `1px solid ${mod.soon ? "#e2e8f0" : mod.color + "33"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, marginBottom: 12,
            }}>
              {mod.icon}
            </div>

            {/* Label */}
            <div style={{
              fontSize: 14, fontWeight: 700,
              color: mod.soon ? "#94a3b8" : "#0f172a",
              marginBottom: 6,
            }}>
              {mod.label}
            </div>

            {/* Description */}
            <div style={{
              fontSize: 12, color: "#94a3b8",
              lineHeight: 1.5,
            }}>
              {mod.description}
            </div>

            {/* Coming soon tag */}
            {mod.soon && (
              <div style={{
                marginTop: 14,
                display: "inline-block",
                fontSize: 10, fontWeight: 700,
                color: "#94a3b8",
                background: "#f1f5f9",
                padding: "3px 8px", borderRadius: 6,
                textTransform: "uppercase", letterSpacing: "0.06em",
              }}>
                Coming Soon
              </div>
            )}
          </div>
        ))}

        {/* More in progress card */}
        <div style={{
          borderRadius: 14,
          border: "1.5px dashed #e2e8f0",
          background: "#fafafa",
          padding: "20px 18px",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          textAlign: "center", gap: 8, opacity: 0.6,
          minHeight: 130,
        }}>
          <div style={{ fontSize: 22 }}>⋯</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8" }}>More in Progress</div>
          <div style={{ fontSize: 11, color: "#cbd5e1" }}>Additional modules planned</div>
        </div>
      </div>

    </div>
  );
}