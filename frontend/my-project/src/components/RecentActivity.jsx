// components/RecentActivity.jsx
// Props:
//   activities (array) - array of activity objects:
//     [{ text, time, color }, ...]
//
// Color meanings (use these or map from your API status field):
//   "#4CAF82" = green  → success / sequenced / passed / exported
//   "#E8A838" = amber  → warning / flagged / review needed
//   "#4A90D9" = blue   → info / new case registered
//   "#D95B5B" = red    → error / failed
//
// Example API mapping:
//   "success" → "#4CAF82"
//   "warning" → "#E8A838"
//   "info"    → "#4A90D9"
//   "error"   → "#D95B5B"

const STATUS_COLORS = {
  success: "#4CAF82",
  warning: "#E8A838",
  info:    "#4A90D9",
  error:   "#D95B5B",
};

const DEFAULT_ACTIVITIES = [
  { text: "Sample GEN-4821 sequenced",         time: "12 min ago", color: "#4CAF82" },
  { text: "Patient P-1092 flagged for review",  time: "34 min ago", color: "#E8A838" },
  { text: "Batch B-77 quality check passed",    time: "1 hr ago",   color: "#4CAF82" },
  { text: "New case registered — Diabetes panel", time: "2 hr ago", color: "#4A90D9" },
  { text: "Report exported for Dr. Mendes",     time: "3 hr ago",   color: "#4CAF82" },
];

export default function RecentActivity({ activities = DEFAULT_ACTIVITIES }) {
  return (
    <div style={{
      background: "#fff",
      borderRadius: 16,
      padding: "28px 28px",
      flex: 1,
      minWidth: 260,
      border: "1px solid #eef0f4",
      boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        <span style={{ fontSize: 15 }}>🕐</span>
        <div style={{ fontWeight: 700, fontSize: 16, color: "#111827" }}>Recent Activity</div>
      </div>

      {/* Activity List */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {activities.map((item, i) => {
          // Support both direct color hex and status string keys
          const dotColor = STATUS_COLORS[item.color] || item.color || "#9ca3af";
          return (
            <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                background: dotColor,
                marginTop: 5, flexShrink: 0,
              }} />
              <div>
                <div style={{ fontSize: 13, color: "#374151", fontWeight: 500, lineHeight: 1.4 }}>
                  {item.text}
                </div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{item.time}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
