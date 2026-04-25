import { useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Sector } from "recharts";
import { useNavigate } from "react-router-dom";

function CustomTooltip({ active, payload }) {
  if (active && payload?.length) {
    return (
      <div style={{
        background: "#1e293b", color: "#fff",
        borderRadius: 10, padding: "10px 14px", fontSize: 13,
        boxShadow: "0 4px 16px rgba(0,0,0,0.18)", pointerEvents: "none",
      }}>
        <div style={{ fontWeight: 700, marginBottom: 2 }}>{payload[0].name}</div>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{payload[0].value} cases</div>
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>Click to filter patients</div>
      </div>
    );
  }
  return null;
}

function ActiveShape({ cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill }) {
  return (
    <Sector
      cx={cx} cy={cy}
      innerRadius={innerRadius - 2}
      outerRadius={outerRadius + 7}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={fill}
    />
  );
}

const DEFAULT_DATA = [
  { name: "Control",   value: 420, percent: "29.7%", color: "#4A90D9" },
  { name: "CTN",       value: 310, percent: "21.9%", color: "#3BBFB2" },
  { name: "COT",       value: 185, percent: "13.1%", color: "#4CAF82" },
  { name: "Benign",    value: 275, percent: "19.4%", color: "#E8A838" },
  { name: "High Risk", value: 94,  percent: "6.6%",  color: "#D95B5B" },
  { name: "Diabetes",  value: 132, percent: "9.3%",  color: "#8B72BE" },
];

export default function CaseDistributionChart({
  data = DEFAULT_DATA,
  title = "Case Category Distribution",
  period = "all",
}) {
  const navigate     = useNavigate();
  const [activeIndex, setActiveIndex] = useState(null);

  const total      = data.reduce((sum, d) => sum + d.value, 0);
  const totalTypes = data.length;
  const topCase    = data.reduce((a, b) => (b.value > a.value ? b : a), data[0] ?? {});

  const canCount = data
    .filter(d => ["CTN", "COT", "CS"].includes(d.name))
    .reduce((sum, d) => sum + d.value, 0);

  function handleLabelClick(name) {
    const params = new URLSearchParams({ case_label: name });
    if (period !== "all") params.set("period", period);
    navigate(`/patients?${params.toString()}`);
  }

  function handleSliceClick(entry) {
    if (entry?.name) handleLabelClick(entry.name);
  }

  return (
    <div style={{
      background: "#fff",
      borderRadius: 16,
      padding: "28px 32px",
      flex: 2.5,
      minWidth: 380,
      display: "flex",
      flexDirection: "column",
      border: "1px solid #eef0f4",
      boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
    }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: "#111827" }}>{title}</div>
        <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 3 }}>
          Breakdown of {total.toLocaleString()} total classified cases
          <span style={{ marginLeft: 6, color: "#3b82f6" }}>· Click a label to filter patients</span>
        </div>

        {/* ── Stat pills ── */}
        <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>

          {/* Total cases */}
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
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#1d4ed8", lineHeight: 1 }}>
                {total.toLocaleString()}
              </div>
              <div style={{ fontSize: 10, color: "#3b82f6", marginTop: 1 }}>Total cases</div>
            </div>
          </div>

          {/* Total case types */}
          <div style={{
            display: "flex", alignItems: "center", gap: 7,
            background: "#faf5ff", border: "1px solid #e9d5ff",
            borderRadius: 8, padding: "6px 12px",
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6, background: "#7c3aed",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1"/>
                <rect x="14" y="3" width="7" height="7" rx="1"/>
                <rect x="3" y="14" width="7" height="7" rx="1"/>
                <rect x="14" y="14" width="7" height="7" rx="1"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#6d28d9", lineHeight: 1 }}>
                {totalTypes}
              </div>
              <div style={{ fontSize: 10, color: "#7c3aed", marginTop: 1 }}>Case types</div>
            </div>
          </div>

          {/* Top case label */}
          {topCase?.name && (
            <div style={{
              display: "flex", alignItems: "center", gap: 7,
              background: "#fff7ed", border: "1px solid #fed7aa",
              borderRadius: 8, padding: "6px 12px",
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: 6, background: topCase.color,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
                  <polyline points="17 6 23 6 23 12"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700, color: "#92400e", lineHeight: 1 }}>
                  {topCase.name}
                </div>
                <div style={{ fontSize: 10, color: "#d97706", marginTop: 1 }}>
                  Top case · {topCase.value}
                </div>
              </div>
            </div>
          )}

          {/* CAN count */}
          <div style={{
            display: "flex", alignItems: "center", gap: 7,
            background: "#fdf2f8", border: "1px solid #f9a8d4",
            borderRadius: 8, padding: "6px 12px",
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6, background: "#db2777",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z"/>
                <path d="M12 8v4l3 3"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 17, color: "#db2777", marginTop: 1, fontWeight: 700 }}>CAN</div>
              <div style={{ fontSize: 10, fontWeight: 100, color: "#9d174d", lineHeight: 1 }}>
                {canCount.toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Donut + legend — flex: 1 so it fills remaining card height ── */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 24, flex: 1 }}>

        {/* Donut */}
        <div style={{ width: 220, height: 220, flexShrink: 0, position: "relative" }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%" cy="50%"
                innerRadius={65} outerRadius={100}
                paddingAngle={2}
                dataKey="value"
                activeIndex={activeIndex}
                activeShape={ActiveShape}
                onMouseEnter={(_, i) => setActiveIndex(i)}
                onMouseLeave={() => setActiveIndex(null)}
                onClick={(entry) => handleSliceClick(entry)}
                style={{ cursor: "pointer" }}
              >
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} stroke="#fff" strokeWidth={1.5} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>

          {/* Centre label */}
          <div style={{
            position: "absolute", top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            textAlign: "center", pointerEvents: "none",
          }}>
            {activeIndex !== null ? (
              <>
                <div style={{
                  fontSize: 16, fontWeight: 700, lineHeight: 1,
                  color: data[activeIndex]?.color,
                }}>
                  {data[activeIndex]?.value?.toLocaleString()}
                </div>
                <div style={{
                  fontSize: 9, color: "#9ca3af", marginTop: 2,
                  maxWidth: 60, wordBreak: "break-word",
                }}>
                  {data[activeIndex]?.name}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#111827", lineHeight: 1 }}>
                  {total.toLocaleString()}
                </div>
                <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>cases</div>
              </>
            )}
          </div>
        </div>

        {/* Legend — scrollable, fills remaining height */}
        <div style={{
          flex: 1,
          maxHeight: 380,
          overflowY: "auto",
          display: "flex", flexDirection: "column", gap: 5, paddingRight: 4,
        }}>
          {data.map((item, i) => (
            <div
              key={item.name}
              onClick={() => handleLabelClick(item.name)}
              onMouseEnter={() => setActiveIndex(i)}
              onMouseLeave={() => setActiveIndex(null)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "7px 10px", borderRadius: 9,
                cursor: "pointer", transition: "all 0.15s",
                border: activeIndex === i
                  ? `1.5px solid ${item.color}`
                  : "1.5px solid transparent",
                background: activeIndex === i ? `${item.color}12` : "transparent",
              }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                background: `${item.color}20`,
                border: `1.5px solid ${item.color}`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: item.color }} />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13, fontWeight: 600, color: "#374151",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {item.name}
                </div>
                <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 1 }}>
                  {item.value.toLocaleString()} cases
                </div>
              </div>

              <span style={{
                fontSize: 11, fontWeight: 700,
                padding: "2px 8px", borderRadius: 20,
                background: `${item.color}18`,
                color: item.color,
                border: `1px solid ${item.color}30`,
                whiteSpace: "nowrap",
              }}>
                {item.percent}
              </span>

              <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"/>
                <polyline points="12 5 19 12 12 19"/>
              </svg>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}