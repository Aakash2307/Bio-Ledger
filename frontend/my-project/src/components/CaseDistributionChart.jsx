import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

function CustomTooltip({ active, payload }) {
  if (active && payload?.length) {
    return (
      <div style={{ background: "#1e293b", color: "#fff", borderRadius: 8, padding: "8px 14px", fontSize: 13 }}>
        <strong>{payload[0].name}</strong>: {payload[0].value}
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
  const total = data.reduce((sum, d) => sum + d.value, 0);

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
        </div>
      </div>

      {/* Donut + right-side scrollable legend */}
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        
        {/* Donut */}
        <div style={{ width: 220, height: 220, flexShrink: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%" cy="50%"
                innerRadius={65} outerRadius={100}
                paddingAngle={2}
                dataKey="value"
              >
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Scrollable legend on the right */}
        <div style={{
          flex: 1,
          maxHeight: 260,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          paddingRight: 4,
        }}>
          {data.map((item) => (
            <div key={item.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 10, height: 10, borderRadius: "50%",
                background: item.color, flexShrink: 0,
              }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{item.name}</div>
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