// components/DashboardHeader.jsx
// Props:
//   title (string)    - page title
//   subtitle (string) - page subtitle/description

export default function DashboardHeader({
  title = "EXOME Dashboard",
  subtitle = "Genomics sequencing overview · Laboratory analytics",
}) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h1 style={{
        fontSize: 26,
        fontWeight: 700,
        color: "#111827",
        margin: 0,
        fontFamily: "'DM Serif Display', Georgia, serif",
      }}>
        {title}
      </h1>
      <p style={{ color: "#9ca3af", fontSize: 13, margin: "4px 0 0" }}>
        {subtitle}
      </p>
    </div>
  );
}
