// components/OrganCaseBreakdownChart.jsx
// Left: horizontal bar chart (replaces donut)
// On hover: left panel swaps to dedicated organ breakdown (total + case label bars)
// Right: same legend list with pills as before

import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";

const CASE_LABEL_COLORS = {
  CON:    "#3b82f6",
  CTN:    "#f59e0b",
  CAN:    "#ef4444",
  CS:     "#8b5cf6",
  COT:    "#06b6d4",
  D:      "#f97316",
  ND:     "#6b7280",
  Benign: "#10b981",
};

const ORGAN_COLORS = [
  "#4A90D9","#3BBFB2","#4CAF82","#E8A838",
  "#D95B5B","#8B72BE","#F4845F","#2EC4B6",
  "#60B6FF","#FF8FAB","#A8D8A8","#FFD166",
];

function getCaseLabelColor(label) {
  return CASE_LABEL_COLORS[label] ?? "#94a3b8";
}

const DEFAULT_ORGAN_BREAKDOWN = {
  "Lung":     { CON: 20, CTN: 8, D: 6, COT: 4, CS: 2 },
  "Breast":   { CON: 15, CTN: 9, D: 5, COT: 3, CS: 1, Benign: 1 },
  "Prostate": { CON: 10, CTN: 5, D: 4, COT: 2, Benign: 4 },
  "Colon":    { CON: 18, CTN: 10, D: 7, COT: 3, CS: 2, Benign: 1 },
};
const DEFAULT_BENIGN_BREAKDOWN = {
  "Breast":   { Benign: 5 },
  "Prostate": { Benign: 4 },
  "Ovary":    { Benign: 6 },
};

export default function OrganCaseBreakdownChart({ summary = null, period = "all" }) {
  const navigate = useNavigate();
  const [hoveredOrgan, setHoveredOrgan] = useState(null);
  const [searchQuery, setSearchQuery]   = useState("");

  const malignantRaw = summary?.organ_case_breakdown        ?? DEFAULT_ORGAN_BREAKDOWN;
  const benignRaw    = summary?.benign_organ_case_breakdown  ?? DEFAULT_BENIGN_BREAKDOWN;

  const merged = useMemo(() => {
    const m = {};
    for (const [organ, cases] of Object.entries(malignantRaw)) {
      m[organ] = { ...cases };
    }
    for (const [organ, cases] of Object.entries(benignRaw)) {
      if (m[organ]) {
        for (const [label, cnt] of Object.entries(cases)) {
          m[organ][label] = (m[organ][label] ?? 0) + cnt;
        }
      } else {
        m[organ] = { ...cases };
      }
    }
    return m;
  }, [malignantRaw, benignRaw]);

  const organList = useMemo(() => {
    return Object.entries(merged)
      .filter(([organ]) => organ && organ !== "null")
      .map(([organ, caseCounts], i) => ({
        organ,
        total: Object.values(caseCounts).reduce((a, b) => a + b, 0),
        cases: caseCounts,
        color: ORGAN_COLORS[i % ORGAN_COLORS.length],
        hasBenign: "Benign" in caseCounts,
      }))
      .sort((a, b) => b.total - a.total);
  }, [merged]);

  const filtered = organList.filter(o =>
    o.organ.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalSamples = organList.reduce((s, o) => s + o.total, 0);
  const totalOrgans  = organList.length;
  const benignOrgans = Object.keys(benignRaw).filter(o => o && o !== "null").length;
  const maxTotal     = Math.max(...organList.map(o => o.total), 1);

  const hoveredData = hoveredOrgan
    ? organList.find(o => o.organ === hoveredOrgan)
    : null;

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
          {totalSamples.toLocaleString()} samples · hover an organ to see breakdown
          <span style={{ marginLeft: 6, color: "#3b82f6" }}>· Click any row to filter patients</span>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
          {/* Total organ types pill */}
          <div style={{
            display: "flex", alignItems: "center", gap: 7,
            background: "#eff6ff", border: "1px solid #bfdbfe",
            borderRadius: 8, padding: "6px 12px",
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6, background: "#2563eb",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#1d4ed8", lineHeight: 1 }}>{totalOrgans}</div>
              <div style={{ fontSize: 10, color: "#3b82f6", marginTop: 1 }}>Total organ types</div>
            </div>
          </div>

          {/* Benign organ types pill */}
          <div style={{
            display: "flex", alignItems: "center", gap: 7,
            background: "#f0fdf4", border: "1px solid #bbf7d0",
            borderRadius: 8, padding: "6px 12px",
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6, background: "#16a34a",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#15803d", lineHeight: 1 }}>{benignOrgans}</div>
              <div style={{ fontSize: 10, color: "#16a34a", marginTop: 1 }}>Benign organ types</div>
            </div>
          </div>

          {/* Search */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "#f8fafc", border: "1px solid #e2e8f0",
            borderRadius: 8, padding: "7px 14px", marginLeft: 16,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
              stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              placeholder="Search organ…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                border: "none", outline: "none", background: "transparent",
                fontSize: 11, color: "#374151", width: 140, fontFamily: "inherit",
              }}
            />
            {searchQuery && (
              <span onClick={() => setSearchQuery("")}
                style={{ cursor: "pointer", color: "#94a3b8", fontSize: 14 }}>×</span>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>

        {/* LEFT: bar chart or breakdown panel */}
        <div style={{ width: 240, flexShrink: 0 }}>
          {hoveredData
            ? <BreakdownPanel data={hoveredData} totalSamples={totalSamples} navTo={navTo} />
            : <BarChart organList={organList} maxTotal={maxTotal} totalSamples={totalSamples}
                navTo={navTo} />
          }
        </div>

        {/* RIGHT: legend list with pills */}
        <div style={{
          flex: 1, display: "flex", flexDirection: "column", gap: 4,
          maxHeight: 300, overflowY: "auto", paddingRight: 4,
        }}>
          {filtered.map(({ organ, total, cases, color }) => {
            const caseEntries = Object.entries(cases)
              .filter(([, v]) => v > 0)
              .sort((a, b) => {
                if (a[0] === "Benign") return 1;
                if (b[0] === "Benign") return -1;
                return b[1] - a[1];
              });

            const isHov = hoveredOrgan === organ;

            return (
              <div
                key={organ}
                onMouseEnter={() => setHoveredOrgan(organ)}
                onMouseLeave={() => setHoveredOrgan(null)}
                style={{ marginBottom: 2 }}
              >
                <div
                  onClick={() => navTo(organ, null)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 10px", borderRadius: 8, cursor: "pointer",
                    background: isHov ? "#f0f9ff" : "transparent",
                    transition: "background 0.15s",
                  }}
                >
                  <div style={{
                    width: 10, height: 10, borderRadius: 2,
                    background: color, flexShrink: 0,
                  }} />
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", flex: 1 }}>
                    {organ}
                  </div>
                  <div style={{ fontSize: 11, color: "#6b7280", whiteSpace: "nowrap" }}>
                    {total} · {((total / totalSamples) * 100).toFixed(1)}%
                  </div>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                    stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"/>
                    <polyline points="12 5 19 12 12 19"/>
                  </svg>
                </div>

                <div style={{
                  paddingLeft: 28, display: "flex", flexWrap: "wrap",
                  gap: "3px 5px", marginTop: 2,
                }}>
                  {caseEntries.map(([label, count]) => (
                    <span
                      key={label}
                      onClick={() => navTo(organ, label)}
                      title={`${label}: ${count} samples`}
                      style={{
                        fontSize: 10, fontWeight: 500,
                        padding: "2px 7px", borderRadius: 20,
                        background: "#f1f5f9", color: "#475569",
                        cursor: "pointer", border: "1px solid #e2e8f0",
                        transition: "background 0.15s", whiteSpace: "nowrap",
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

// ── Horizontal bar chart (default left panel) ─────────────────────────────────
function BarChart({ organList, maxTotal, totalSamples, navTo }) {
  const visible = organList.slice(0, 12);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {visible.map(({ organ, total, color }) => {
        const pct = (total / maxTotal) * 100;
        return (
          <div
            key={organ}
            onClick={() => navTo(organ, null)}
            style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer" }}
          >
            <div style={{
              width: 8, height: 8, borderRadius: 2,
              background: color, flexShrink: 0,
            }} />
            <div style={{
              flex: 1, height: 14, background: "#f1f5f9",
              borderRadius: 4, overflow: "hidden",
            }}>
              <div style={{
                width: `${pct}%`, height: "100%",
                background: color, borderRadius: 4,
                transition: "width 0.3s ease",
              }} />
            </div>
            <div style={{ fontSize: 10, color: "#6b7280", width: 24, textAlign: "right", flexShrink: 0 }}>
              {total}
            </div>
          </div>
        );
      })}
      {organList.length > 12 && (
        <div style={{ fontSize: 10, color: "#9ca3af", textAlign: "center", marginTop: 4 }}>
          +{organList.length - 12} more  to see
        </div>
      )}
    </div>
  );
}

// ── Breakdown panel (shown on hover) ──────────────────────────────────────────
function BreakdownPanel({ data, totalSamples, navTo }) {
  const { organ, total, cases, color } = data;

  const sortedCases = Object.entries(cases)
    .filter(([, v]) => v > 0)
    .sort((a, b) => {
      if (a[0] === "Benign") return 1;
      if (b[0] === "Benign") return -1;
      return b[1] - a[1];
    });

  const maxCase = Math.max(...sortedCases.map(([, v]) => v), 1);

  return (
    <div style={{
      background: "#f8fafc", borderRadius: 12,
      padding: "14px 16px", border: "1px solid #e2e8f0",
    }}>
      {/* Organ header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
        <div style={{ fontWeight: 700, fontSize: 13, color: "#111827", flex: 1 }}>{organ}</div>
        <div onClick={() => navTo(organ, null)}
          style={{ fontSize: 10, color: "#3b82f6", cursor: "pointer", fontWeight: 600 }}>
          View all →
        </div>
      </div>

      {/* Total */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: "#111827", lineHeight: 1 }}>{total}</div>
        <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>
          total samples · {((total / totalSamples) * 100).toFixed(1)}% of all
        </div>
      </div>

      {/* Case label breakdown bars */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sortedCases.map(([label, count]) => {
          const pct = (count / maxCase) * 100;
          return (
            <div key={label} onClick={() => navTo(organ, label)} style={{ cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: getCaseLabelColor(label) }}>
                  {label}
                </span>
                <span style={{ fontSize: 11, color: "#374151", fontWeight: 600 }}>
                  {count}
                  <span style={{ fontSize: 10, color: "#9ca3af", fontWeight: 400, marginLeft: 3 }}>
                    ({((count / total) * 100).toFixed(0)}%)
                  </span>
                </span>
              </div>
              <div style={{ height: 6, background: "#e2e8f0", borderRadius: 3, overflow: "hidden" }}>
                <div style={{
                  width: `${pct}%`, height: "100%",
                  background: getCaseLabelColor(label),
                  borderRadius: 3, transition: "width 0.3s ease",
                }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}