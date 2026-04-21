import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import DashboardHeader       from "../components/DashboardHeader";
import StatCardsRow          from "../components/StatCardsRow";
import CaseDistributionChart from "../components/CaseDistributionChart";
import RecentActivity        from "../components/RecentActivity";
import { getDashboardSummary } from "../api";
// import OrganDistributionChart from "../components/OrganDistributionChart";
import OrganCaseBreakdownChart from "../components/OrganCaseBreakdownChart";


// replace the two <OrganDistributionChart .../> with:

import logo from "../assets/tzarnewlogo.png";

const CHART_COLORS = [
  "#4A90D9", "#3BBFB2", "#4CAF82", "#E8A838",
  "#D95B5B", "#8B72BE", "#F4845F", "#2EC4B6",
];

const ORGAN_COLORS = [
  "#F4845F", "#2EC4B6", "#8B72BE", "#4A90D9",
  "#3BBFB2", "#E8A838", "#4CAF82", "#D95B5B",
];

const DEFAULT_ACTIVITIES = [
  { text: "Sample 5A0123 report Generated",                    time: "12 min ago", color: "#4CAF82" },
  { text: "Patient 1A023 flagged for review of case label",    time: "34 min ago", color: "#E8A838" },
  { text: "patient 7A0123 quality check passed",               time: "1 hr ago",   color: "#4CAF82" },
  { text: "New case registered — Diabetes panel",              time: "2 hr ago",   color: "#4A90D9" },
  { text: "Report 4A0222 download by analyst",                 time: "3 hr ago",   color: "#4CAF82" },
];

export default function Dashboard() {
  const [period, setPeriod]               = useState("all");
  const [selectedYear, setSelectedYear]   = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [summary, setSummary]             = useState(null);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);
  const navigate                          = useNavigate();

  useEffect(() => {
    async function load() {
      setLoading(true); setError(null);
      try { setSummary(await getDashboardSummary(period)); }
      catch (err) { console.error(err); setError("Failed to load dashboard data."); }
      finally { setLoading(false); }
    }
    load();
  }, [period]);

  const stats = [
    {
      title:   "Total Patients",
      value:   loading ? "—" : (summary?.total_patients ?? "—").toLocaleString(),
      sub:     loading ? "Loading…" : `${summary?.total_patients ?? 0} registered`,
      icon:    "👥",
      // onClick: () => navigate("/patients"),         // ← navigates to all patients
    },
    {
      title:   "Total Samples",
      value:   loading ? "—" : (summary?.total_samples ?? "—").toLocaleString(),
      sub:     loading ? "Loading…" : `${summary?.total_samples ?? 0} across all patients`,
      icon:    "🧬",
      // onClick: () => navigate(period !== "all" ? `/patients?period=${period}` : "/patients"),          // ← navigates to patients (samples live there)
    },
    {
      title: "Sequenced Samples",
      value: loading ? "—" : (summary?.sequenced_samples ?? "—").toLocaleString(),
      sub:   loading ? "Loading…" : `of ${summary?.total_samples ?? 0} total samples`,
      icon:  "⚡",
      // onClick: () => navigate(period !== "all" ? `/patients?case_label=Done&period=${period}` : "/patients?case_label=Done"),
    },
    {
      title: "Total Reports Generated",
      value: "0",
      sub:   "Yet to start",
      icon:  "📈",
      // no onClick — not clickable
    },
  ];

  // ── Case distribution ──
  const caseData = summary?.case_counts
    ? Object.entries(summary.case_counts)
        .filter(([name]) => name && name !== "null")
        .map(([name, value], i) => {
          const total = Object.values(summary.case_counts).reduce((a, b) => a + b, 0);
          return { name, value, percent: total > 0 ? `${((value / total) * 100).toFixed(1)}%` : "0%", color: CHART_COLORS[i % CHART_COLORS.length] };
        })
        .sort((a, b) => b.value - a.value)
    : [];

  // ── Organ distribution ──
  const organData = summary?.organ_counts
    ? Object.entries(summary.organ_counts)
        .filter(([name]) => name && name !== "null")
        .map(([name, value], i) => {
          const total = Object.values(summary.organ_counts).reduce((a, b) => a + b, 0);
          return { name, value, percent: total > 0 ? `${((value / total) * 100).toFixed(1)}%` : "0%", color: ORGAN_COLORS[i % ORGAN_COLORS.length] };
        })
        .sort((a, b) => b.value - a.value)
    : [];

  // ── Benign organ distribution ──
  const benignData = summary?.benign_organ_counts
    ? Object.entries(summary.benign_organ_counts)
        .filter(([name]) => name && name !== "null")
        .map(([name, value], i) => {
          const total = Object.values(summary.benign_organ_counts).reduce((a, b) => a + b, 0);
          return { name, value, percent: total > 0 ? `${((value / total) * 100).toFixed(1)}%` : "0%", color: ORGAN_COLORS[i % ORGAN_COLORS.length] };
        })
        .sort((a, b) => b.value - a.value)
    : [];

  return (
    <div>

      {/* ── Top bar ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
        <DashboardHeader title="EXOME Dashboard" subtitle="Genomics sequencing overview · Laboratory analytics" />
        <img src={logo} alt="Logo" style={{ height: 48, width: "auto", objectFit: "contain" }} />
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div style={{ marginBottom: 24, padding: "12px 16px", borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", fontSize: 13, fontWeight: 500 }}>
          ⚠️ {error}
        </div>
      )}

      {/* ── Period filter ── */}
      <div style={{ display: "flex", gap: 12, marginBottom: 28, alignItems: "center", flexWrap: "wrap" }}>
        <button
          onClick={() => { setPeriod("all"); setSelectedYear(""); setSelectedMonth(""); }}
          style={{
            padding: "8px 20px", borderRadius: 9, fontSize: 13, fontWeight: 600,
            border: `1.5px solid ${period === "all" ? "#2563eb" : "#e2e8f0"}`,
            background: period === "all" ? "#eff6ff" : "#fff",
            color: period === "all" ? "#2563eb" : "#64748b",
            cursor: "pointer", transition: "all 0.15s",
          }}
        >All Time</button>

        <select
          value={selectedYear}
          onChange={e => { const yr = e.target.value; setSelectedYear(yr); setSelectedMonth(""); setPeriod(yr || "all"); }}
          style={{
            padding: "8px 32px 8px 14px", borderRadius: 9, fontSize: 13, fontWeight: 600,
            border: `1.5px solid ${selectedYear ? "#2563eb" : "#e2e8f0"}`,
            background: selectedYear ? "#eff6ff" : "#fff",
            color: selectedYear ? "#2563eb" : "#64748b",
            cursor: "pointer", outline: "none", appearance: "none",
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
            backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center",
          }}
        >
          <option value="">Year</option>
          {Array.from({ length: new Date().getFullYear() - 2022 + 1 }, (_, i) => 2022 + i).map(yr => (
            <option key={yr} value={String(yr)}>{yr}</option>
          ))}
        </select>

        {selectedYear && (
          <select
            value={selectedMonth}
            onChange={e => { const mo = e.target.value; setSelectedMonth(mo); setPeriod(mo ? `${selectedYear}-${mo}` : selectedYear); }}
            style={{
              padding: "8px 32px 8px 14px", borderRadius: 9, fontSize: 13, fontWeight: 600,
              border: `1.5px solid ${selectedMonth ? "#2563eb" : "#e2e8f0"}`,
              background: selectedMonth ? "#eff6ff" : "#fff",
              color: selectedMonth ? "#2563eb" : "#64748b",
              cursor: "pointer", outline: "none", appearance: "none",
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center",
            }}
          >
            <option value="">All Months</option>
            {[["01","January"],["02","February"],["03","March"],["04","April"],["05","May"],["06","June"],["07","July"],["08","August"],["09","September"],["10","October"],["11","November"],["12","December"]].map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        )}

        {loading && <span style={{ fontSize: 12, color: "#94a3b8", marginLeft: 4 }}>Updating…</span>}
      </div>

      <StatCardsRow stats={stats} />

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <CaseDistributionChart
         data={caseData.length > 0 ? caseData : undefined} 
         period={period}
        />
        {/* <OrganDistributionChart
          data={organData.length > 0 ? organData : undefined}
          title="Organ Type Distribution"
          filterKey="organ_type"
          period={period}
        />
        <OrganDistributionChart
          data={benignData.length > 0 ? benignData : undefined}
          title="Benign Organ Distribution"
          filterKey="organ_type"
          period={period}
        /> */}

        <OrganCaseBreakdownChart summary={summary} period={period} />

        {/* <OrganDrilldownChart summary={summary} period={period} /> */}
        {/* <RecentActivity activities={DEFAULT_ACTIVITIES} /> */}
      </div>

    </div>
  );
}