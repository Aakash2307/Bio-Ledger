// components/StatCard.jsx
export default function StatCard({ title, value, sub, icon, onClick }) {
  const isClickable = !!onClick;

  return (
    <div
      onClick={onClick}
      style={{
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
        cursor: isClickable ? "pointer" : "default",
        transition: "all 0.15s",
      }}
      onMouseEnter={e => {
        if (!isClickable) return;
        e.currentTarget.style.boxShadow = "0 4px 16px rgba(37,99,235,0.12)";
        e.currentTarget.style.borderColor = "#bfdbfe";
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={e => {
        if (!isClickable) return;
        e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.05)";
        e.currentTarget.style.borderColor = "#eef0f4";
        e.currentTarget.style.transform = "none";
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 500, letterSpacing: 0.2 }}>
          {title}
        </span>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: isClickable ? "#eff6ff" : "#f0f4fb",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18,
        }}>
          {icon}
        </div>
      </div>

      <div style={{
        fontSize: 32, fontWeight: 700, color: "#111827",
        lineHeight: 1.1, fontFamily: "'DM Serif Display', Georgia, serif",
      }}>
        {value}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 12, color: "#9ca3af" }}>{sub}</div>
        {isClickable && (
          <div style={{ fontSize: 11, color: "#3b82f6", fontWeight: 600, display: "flex", alignItems: "center", gap: 3 }}>
            View all
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}