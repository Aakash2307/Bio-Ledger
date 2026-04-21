// components/OrganCaseBreakdownChart.jsx
// Two-ring donut: outer = organ types (malignant + benign merged), inner = case labels per organ
// Reads summary.organ_case_breakdown AND summary.benign_organ_case_breakdown from backend

import { useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Sector } from "recharts";
import { useNavigate } from "react-router-dom";

// ── Colour palettes ────────────────────────────────────────────────────────────
const ORGAN_COLORS = [
  "#4A90D9", "#3BBFB2", "#4CAF82", "#E8A838",
  "#D95B5B", "#8B72BE", "#F4845F", "#2EC4B6",
  "#60B6FF", "#FF8FAB", "#A8D8A8", "#FFD166",
];

function tint(hex, amount) {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, ((n >> 16) & 0xff) + amount);
  const g = Math.min(255, ((n >> 8)  & 0xff) + amount);
  const b = Math.min(255, (n         & 0xff) + amount);
  return `rgb(${r},${g},${b})`;
}

// ── Fallback demo data ─────────────────────────────────────────────────────────
const DEFAULT_ORGAN_BREAKDOWN = {
  "CRC":            { CON: 18, CTN: 10, D: 7, COT: 3, CS: 2 },
  "Lung cancer":    { CON: 20, CTN: 8,  D: 6, COT: 4, CS: 2 },
  "Breast cancer":  { CON: 15, CTN: 9,  D: 5, COT: 3, CS: 1 },
  "Prostate cancer":{ CON: 10, CTN: 5,  D: 4, COT: 2         },
};
const DEFAULT_BENIGN_BREAKDOWN = {
  "Lipoma":  { Benign: 5 },
  "Liver":   { Benign: 4 },
  "Ovary":   { Benign: 4 },
  "Prostate":{ Benign: 4 },
};

// ── Tooltip ────────────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{
      background: "#1e293b", color: "#fff",
      borderRadius: 10, padding: "10px 14px", fontSize: 13,
      boxShadow: "0 4px 16px rgba(0,0,0,0.18)", pointerEvents: "none",
    }}>
      <div style={{ fontWeight: 700, marginBottom: 2 }}>{d.organ}</div>
      {d.caseLabel && (
        <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>
          Case: <span style={{ color: "#e2e8f0" }}>{d.caseLabel}</span>
        </div>
      )}
      <div style={{ fontSize: 15, fontWeight: 600 }}>{d.value} samples</div>
      <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>Click to filter patients</div>
    </div>
  );
}

function ActiveShape({ cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill }) {
  return (
    <Sector
      cx={cx} cy={cy}
      innerRadius={innerRadius - 2}
      outerRadius={outerRadius + 6}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={fill}
    />
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function OrganCaseBreakdownChart({ summary = null, period = "all" }) {
  const navigate = useNavigate();
  const [activeOuter, setActiveOuter] = useState(null);
  const [activeInner, setActiveInner] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  // ── Merge both breakdowns ──────────────────────────────────────────────────
  // organ_case_breakdown        → { "CRC": { CON: 18, CTN: 10, ... }, ... }
  // benign_organ_case_breakdown → { "Lipoma": { Benign: 5 }, ... }
  // If an organ appears in both (e.g. "Prostate"), its case labels are combined.
  const malignantRaw = summary?.organ_case_breakdown        ?? DEFAULT_ORGAN_BREAKDOWN;
  const benignRaw    = summary?.benign_organ_case_breakdown  ?? DEFAULT_BENIGN_BREAKDOWN;

  const merged = {};
  for (const [organ, cases] of Object.entries(malignantRaw)) {
    merged[organ] = { ...cases };
  }
  for (const [organ, cases] of Object.entries(benignRaw)) {
    if (merged[organ]) {
      for (const [label, cnt] of Object.entries(cases)) {
        merged[organ][label] = (merged[organ][label] ?? 0) + cnt;
      }
    } else {
      merged[organ] = { ...cases };
    }
  }

  // ── Outer ring — one slice per organ ──────────────────────────────────────
  const outerData = Object.entries(merged)
    .filter(([organ]) => organ && organ !== "null")
    .map(([organ, caseCounts], i) => ({
      organ,
      value: Object.values(caseCounts).reduce((a, b) => a + b, 0),
      color: ORGAN_COLORS[i % ORGAN_COLORS.length],
      caseLabel: null,
    }))
    .sort((a, b) => b.value - a.value);

  // ── Inner ring — one slice per (organ × case_label) ───────────────────────
  const innerData = outerData.flatMap(({ organ, color }) =>
    Object.entries(merged[organ] ?? {})
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([caseLabel, value], ci) => ({
        organ, caseLabel, value,
        color: tint(color, 25 + ci * 20),
      }))
  );

  const totalSamples     = outerData.reduce((s, d) => s + d.value, 0);
  const totalOrganTypes  = outerData.length;
  // organs that have at least one Benign case label (from benign_organ_case_breakdown keys)
  const benignOrganTypes = Object.keys(benignRaw).filter(o => o && o !== "null").length;

  function navTo(organ, caseLabel) {
    const params = new URLSearchParams({ organ_type: organ });
    if (caseLabel) params.set("case_label", caseLabel);
    if (period !== "all") params.set("period", period);
    navigate(`/patients?${params.toString()}`);
  }

  return (
    <div style={{
      background: "#fff",
      borderRadius: 16,
      padding: "28px 32px",
      flex: 2.5,
      minWidth: 420,
      border: "1px solid #eef0f4",
      boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
    }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: "#111827" }}>
          Organ Type Distribution
        </div>
        <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 3 }}>
          {totalSamples.toLocaleString()} samples · outer ring: organs · inner ring: case labels
          <span style={{ marginLeft: 6, color: "#3b82f6" }}>· Click any slice to filter patients</span>
        </div>

        {/* ── Stat pills ── */}
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          {/* Total organ types */}
          <div style={{
            display: "flex", alignItems: "center", gap: 7,
            background: "#eff6ff", border: "1px solid #bfdbfe",
            borderRadius: 8, padding: "6px 12px",
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6,
              background: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 8v4l3 3"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#1d4ed8", lineHeight: 1 }}>
                {totalOrganTypes}
              </div>
              <div style={{ fontSize: 10, color: "#3b82f6", marginTop: 1 }}>Total organ types</div>
            </div>
          </div>

          {/* Benign organ types */}
          <div style={{
            display: "flex", alignItems: "center", gap: 7,
            background: "#f0fdf4", border: "1px solid #bbf7d0",
            borderRadius: 8, padding: "6px 12px",
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6,
              background: "#16a34a", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#15803d", lineHeight: 1 }}>
                {benignOrganTypes}
              </div>
              <div style={{ fontSize: 10, color: "#16a34a", marginTop: 1 }}>Benign organ types</div>
            </div>
          </div>

          {/* Search */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "#f8fafc", border: "1px solid #e2e8f0",
            borderRadius: 8, padding: "5px 10px",
            marginLeft: "auto",
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
              stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              placeholder="Search organ…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                border: "none", outline: "none", background: "transparent",
                fontSize: 11, color: "#374151", width: 300,
                fontFamily: "inherit",
              }}
            />
            {searchQuery && (
              <span
                onClick={() => setSearchQuery("")}
                style={{ cursor: "pointer", color: "#94a3b8", fontSize: 13, lineHeight: 1 }}
              >×</span>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap" }}>

        {/* ── Two-ring donut ── */}
        <div style={{ width: 240, height: 240, flexShrink: 0, position: "relative" }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              {/* Inner ring — case labels */}
              <Pie
                data={innerData}
                cx="50%" cy="50%"
                innerRadius={46} outerRadius={80}
                paddingAngle={1}
                dataKey="value"
                activeIndex={activeInner}
                activeShape={ActiveShape}
                onMouseEnter={(_, i) => setActiveInner(i)}
                onMouseLeave={() => setActiveInner(null)}
                onClick={(entry) => navTo(entry.organ, entry.caseLabel)}
                style={{ cursor: "pointer" }}
              >
                {innerData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} stroke="#fff" strokeWidth={1} />
                ))}
              </Pie>

              {/* Outer ring — organs */}
              <Pie
                data={outerData}
                cx="50%" cy="50%"
                innerRadius={86} outerRadius={114}
                paddingAngle={2}
                dataKey="value"
                activeIndex={activeOuter}
                activeShape={ActiveShape}
                onMouseEnter={(_, i) => setActiveOuter(i)}
                onMouseLeave={() => setActiveOuter(null)}
                onClick={(entry) => navTo(entry.organ, null)}
                style={{ cursor: "pointer" }}
              >
                {outerData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} stroke="#fff" strokeWidth={1.5} />
                ))}
              </Pie>

              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>

          {/* Centre total */}
          <div style={{
            position: "absolute", top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            textAlign: "center", pointerEvents: "none",
          }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#111827", lineHeight: 1 }}>
              {totalSamples.toLocaleString()}
            </div>
            <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>samples</div>
          </div>
        </div>

        {/* ── Legend ── */}
        <div style={{
          flex: 1, display: "flex", flexDirection: "column", gap: 4,
          maxHeight: 240, overflowY: "auto", paddingRight: 4,
        }}>
          {outerData
            .filter(organ => organ.organ.toLowerCase().includes(searchQuery.toLowerCase()))
            .map((organ) => {
            const caseEntries = Object.entries(merged[organ.organ] ?? {})
              .filter(([, v]) => v > 0)
              .sort((a, b) => b[1] - a[1]);

            return (
              <div key={organ.organ} style={{ marginBottom: 4 }}>
                {/* Organ row */}
                <div
                  onClick={() => navTo(organ.organ, null)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 10px", borderRadius: 8, cursor: "pointer",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "#f0f9ff"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                >
                  <div style={{
                    width: 10, height: 10, borderRadius: 2,
                    background: organ.color, flexShrink: 0,
                  }} />
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", flex: 1 }}>
                    {organ.organ}
                  </div>
                  <div style={{ fontSize: 11, color: "#6b7280", whiteSpace: "nowrap" }}>
                    {organ.value} · {((organ.value / totalSamples) * 100).toFixed(1)}%
                  </div>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                    stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"/>
                    <polyline points="12 5 19 12 12 19"/>
                  </svg>
                </div>

                {/* Case label pills */}
                <div style={{
                  paddingLeft: 28,
                  display: "flex", flexWrap: "wrap", gap: "3px 5px",
                  marginTop: 2,
                }}>
                  {caseEntries.map(([label, count], ci) => (
                    <span
                      key={label}
                      onClick={() => navTo(organ.organ, label)}
                      title={`${label}: ${count} samples`}
                      style={{
                        fontSize: 10, fontWeight: 500,
                        padding: "2px 7px", borderRadius: 20,
                        background: "#f1f5f9",
                        color: "#475569",
                        cursor: "pointer",
                        border: "1px solid #e2e8f0",
                        transition: "background 0.15s",
                        whiteSpace: "nowrap",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = "#e2e8f0"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "#f1f5f9"; }}
                    >
                      {label} {count}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}