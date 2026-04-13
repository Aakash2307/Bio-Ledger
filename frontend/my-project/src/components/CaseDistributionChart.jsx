import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { useNavigate } from "react-router-dom";

function CustomTooltip({ active, payload }) {
  if (active && payload?.length) {
    return (
      <div style={{ background: "#1e293b", color: "#fff", borderRadius: 8, padding: "8px 14px", fontSize: 13 }}>
        <strong>{payload[0].name}</strong>: {payload[0].value}
        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>Click to view patients</div>
      </div>
    );
  }
  return null;
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
}) {
  const navigate = useNavigate();
  const total = data.reduce((sum, d) => sum + d.value, 0);

  function handleLabelClick(name) {
    navigate(`/patients?case_label=${encodeURIComponent(name)}`);
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
      border: "1px solid #eef0f4",
      boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
    }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: "#111827" }}>{title}</div>
        <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 3 }}>
          Breakdown of {total.toLocaleString()} total classified cases
          <span style={{ marginLeft: 6, color: "#3b82f6" }}>· Click a label to filter patients</span>
        </div>
      </div>

      {/* Donut + right-side scrollable legend */}
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>

        {/* Donut — slices are clickable */}
        <div style={{ width: 220, height: 220, flexShrink: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%" cy="50%"
                innerRadius={65} outerRadius={100}
                paddingAngle={2}
                dataKey="value"
                onClick={(entry) => handleSliceClick(entry)}
                style={{ cursor: "pointer" }}
              >
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Scrollable legend — each item clickable */}
        <div style={{
          flex: 1,
          maxHeight: 260,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          paddingRight: 4,
        }}>
          {data.map((item) => (
            <div
              key={item.name}
              onClick={() => handleLabelClick(item.name)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "6px 10px", borderRadius: 8,
                cursor: "pointer", transition: "background 0.15s",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = "#f0f9ff";
                e.currentTarget.style.outline = `1.5px solid ${item.color}`;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.outline = "none";
              }}
            >
              <div style={{
                width: 10, height: 10, borderRadius: "50%",
                background: item.color, flexShrink: 0,
              }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{item.name}</div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>
                  {item.value} · {item.percent}
                </div>
              </div>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
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