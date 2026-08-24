import { useState, useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Sector } from "recharts";
import { useNavigate } from "react-router-dom";

function CustomTooltip({ active, payload }) {
  if (active && payload?.length) {
    return (
      <div style={{
        background: "#1e293b", color: "#fff",
        borderRadius: 10, padding: "10px 14px", fontSize: 13,
        boxShadow: "0 4px 16px rgba(0,0,0,0.18)", pointerEvents: "none",
        maxWidth: 220, wordBreak: "break-word",
      }}>
        <div style={{ fontWeight: 700, marginBottom: 2 }}>{payload[0].name}</div>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{payload[0].value} samples</div>
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
  { name: "660 Study", value: 292, percent: "28.1%", color: "#4A90D9" },
  { name: "Research",  value: 200, percent: "19.2%", color: "#3BBFB2" },
  { name: "Spect Lab", value: 199, percent: "19.1%", color: "#4CAF82" },
  { name: "Dr Nadeem", value: 106, percent: "10.2%", color: "#E8A838" },
];

export default function SourceDistributionChart({
  data = DEFAULT_DATA,
  title = "Sample Source Distribution",
  filterKey = "source",
  period = "all",
}) {
  const navigate = useNavigate();
  const [activeIndex, setActiveIndex] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  const chartData = useMemo(
    () => [...data].filter(d => d.name && d.name !== "null").sort((a, b) => b.value - a.value),
    [data]
  );

  const total         = chartData.reduce((sum, d) => sum + d.value, 0);
  const totalSources   = chartData.length;
  const topSource      = chartData.reduce((a, b) => (b.value > a.value ? b : a), chartData[0] ?? {});

  const filtered = useMemo(
    () => chartData.filter(d => d.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [chartData, searchQuery]
  );

  function handleLabelClick(name) {
    const params = new URLSearchParams({ [filterKey]: name });
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
      flex : 16,
      display: "flex",
      flexDirection: "column",
      border: "1px solid #eef0f4",
      boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
    }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: "#111827" }}>{title}</div>
        <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 3 }}>
          {total.toLocaleString()} samples across {totalSources} sources
          <span style={{ marginLeft: 6, color: "#3b82f6" }}>· Click a label to filter patients</span>
        </div>

        {/* ── Stat pills + search ── */}
        <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>

          {/* Total sources */}
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
                <circle cx="12" cy="12" r="3"/><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#1d4ed8", lineHeight: 1 }}>
                {totalSources}
              </div>
              <div style={{ fontSize: 10, color: "#3b82f6", marginTop: 1 }}>Total sources</div>
            </div>
          </div>

          {/* Top source */}
          {topSource?.name && (
            <div style={{
              display: "flex", alignItems: "center", gap: 7,
              background: "#fff7ed", border: "1px solid #fed7aa",
              borderRadius: 8, padding: "6px 12px", maxWidth: 240,
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: 6, background: topSource.color,
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
                  <polyline points="17 6 23 6 23 12"/>
                </svg>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: 14, fontWeight: 700, color: "#92400e", lineHeight: 1.2,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }} title={topSource.name}>
                  {topSource.name}
                </div>
                <div style={{ fontSize: 10, color: "#d97706", marginTop: 1 }}>
                  Top source · {topSource.value}
                </div>
              </div>
            </div>
          )}

          {/* Search */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "#f8fafc", border: "1px solid #e2e8f0",
            borderRadius: 8, padding: "7px 14px", marginLeft: "auto",
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
              stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              placeholder="Search source…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                border: "none", outline: "none", background: "transparent",
                fontSize: 11, color: "#374151", width: 200, fontFamily: "inherit",
              }}
            />
            {searchQuery && (
              <span onClick={() => setSearchQuery("")}
                style={{ cursor: "pointer", color: "#94a3b8", fontSize: 14 }}>×</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Donut + legend ── */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 24, flexWrap: "wrap" }}>

        {/* Donut — always reflects the FULL dataset, not the search filter */}
        <div style={{ width: 220, height: 220, flexShrink: 0, position: "relative" }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
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
                {chartData.map((entry, i) => (
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
            {activeIndex !== null && chartData[activeIndex] ? (
              <>
                <div style={{
                  fontSize: 16, fontWeight: 700, lineHeight: 1,
                  color: chartData[activeIndex].color,
                }}>
                  {chartData[activeIndex].value.toLocaleString()}
                </div>
                <div style={{
                  fontSize: 9, color: "#9ca3af", marginTop: 2,
                  maxWidth: 60, wordBreak: "break-word",
                }}>
                  {chartData[activeIndex].name}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#111827", lineHeight: 1 }}>
                  {total.toLocaleString()}
                </div>
                <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>samples</div>
              </>
            )}
          </div>
        </div>

        {/* Legend — scrollable, searchable; hover syncs with donut when unfiltered */}
        <div style={{
          flex: 1, minWidth: 260,
          maxHeight: 260,
          overflowY: "auto",
          display: "flex", flexDirection: "column", gap: 5, paddingRight: 4,
        }}>
          {filtered.length === 0 ? (
            <div style={{ fontSize: 12.5, color: "#9ca3af", padding: "12px 4px" }}>
              No sources match "{searchQuery}"
            </div>
          ) : (
            filtered.map((item) => {
              // map back to the index in the full dataset so hover syncs with the donut
              const fullIndex = chartData.findIndex(d => d.name === item.name);
              const isActive = activeIndex === fullIndex;
              return (
                <div
                  key={item.name}
                  onClick={() => handleLabelClick(item.name)}
                  onMouseEnter={() => setActiveIndex(fullIndex)}
                  onMouseLeave={() => setActiveIndex(null)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "7px 10px", borderRadius: 9,
                    cursor: "pointer", transition: "all 0.15s",
                    border: isActive ? `1.5px solid ${item.color}` : "1.5px solid transparent",
                    background: isActive ? `${item.color}12` : "transparent",
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
                    }} title={item.name}>
                      {item.name}
                    </div>
                    <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 1 }}>
                      {item.value.toLocaleString()} samples
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
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}