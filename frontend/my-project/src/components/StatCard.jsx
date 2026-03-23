// components/StatCard.jsx
// Props:
//   title (string)  - card label e.g. "Total Patients"
//   value (string)  - main number e.g. "1,284"
//   sub   (string)  - subtext e.g. "+12 this week"
//   icon  (string)  - emoji or icon character

export default function StatCard({ title, value, sub, icon }) {
  return (
    <div style={{
      background: "#fff",
      borderRadius: 14,
      padding: "24px 28px",
      flex: 1,
      minWidth: 180,
      border: "1px solid #eef0f4",
      boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
      display: "flex",
      flexDirection: "column",
      gap: 8,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 500, letterSpacing: 0.2 }}>
          {title}
        </span>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: "#f0f4fb",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18,
        }}>
          {icon}
        </div>
      </div>

      <div style={{
        fontSize: 32,
        fontWeight: 700,
        color: "#111827",
        lineHeight: 1.1,
        fontFamily: "'DM Serif Display', Georgia, serif",
      }}>
        {value}
      </div>

      <div style={{ fontSize: 12, color: "#9ca3af" }}>{sub}</div>
    </div>
  );
}
