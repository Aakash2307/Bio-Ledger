// components/OrganDistributionChart.jsx
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const DEFAULT_DATA = [
  { name: "Breast",   value: 120, percent: "28.4%", color: "#4A90D9" },
  { name: "Lung",     value: 98,  percent: "23.2%", color: "#3BBFB2" },
  { name: "Colon",    value: 74,  percent: "17.5%", color: "#4CAF82" },
  { name: "Prostate", value: 61,  percent: "14.4%", color: "#E8A838" },
  { name: "Ovary",    value: 45,  percent: "10.6%", color: "#D95B5B" },
  { name: "Other",    value: 25,  percent: "5.9%",  color: "#8B72BE" },
];

function CustomTooltip({ active, payload }) {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: "#1e293b", color: "#fff",
        borderRadius: 8, padding: "8px 14px", fontSize: 13,
      }}>
        <strong>{payload[0].name}</strong>: {payload[0].value}
      </div>
    );
  }
  return null;
}

export default function OrganDistributionChart({
  data = DEFAULT_DATA,
  title = "Organ Type Distribution",
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  // ✅ Just sort by value, show all with real names
  const chartData = [...data].sort((a, b) => b.value - a.value);

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
          Breakdown of {total.toLocaleString()} samples across organ types
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 32, flexWrap: "wrap" }}>

        {/* Donut chart */}
        <div style={{ width: 220, height: 220, flexShrink: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%" cy="50%"
                innerRadius={65} outerRadius={100}
                paddingAngle={2}
                dataKey="value"
              >
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Scrollable legend — all real names */}
        <div style={{
          display: "flex", flexDirection: "column", gap: 10,
          maxHeight: 220, overflowY: "auto",
          paddingRight: 4, flex: 1,
        }}>
          {chartData.map((item) => (
            <div key={item.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 10, height: 10, borderRadius: "50%",
                background: item.color, flexShrink: 0,
              }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
                  {item.name}
                </div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>
                  {item.value} · {item.percent}
                </div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}