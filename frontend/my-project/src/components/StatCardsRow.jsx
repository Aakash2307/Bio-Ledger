// components/StatCardsRow.jsx
// Props:
//   stats (array) - array of stat objects:
//     [{ title, value, sub, icon }, ...]
//
// Default/example data shape (replace with API response):
// const stats = [
//   { title: "Total Patients",    value: "1,284", sub: "+12 this week", icon: "👥" },
//   { title: "DNA Samples",       value: "3,741", sub: "892 pending",   icon: "🧬" },
//   { title: "Sequenced Samples", value: "2,156", sub: "98.2% pass rate", icon: "⚡" },
//   { title: "Active Cases",      value: "47",    sub: "3 flagged",     icon: "📈" },
// ];

import StatCard from "./StatCard";

const DEFAULT_STATS = [
  { title: "Total Patients",    value: "0", sub: "+12 this week",   icon: "👥" },
  { title: "DNA Samples",       value: "3,741", sub: "892 pending",     icon: "🧬" },
  { title: "Sequenced Samples", value: "2,156", sub: "98.2% pass rate", icon: "⚡" },
  { title: "Active Cases",      value: "47",    sub: "3 flagged",       icon: "📈" },
];

export default function StatCardsRow({ stats = DEFAULT_STATS }) {
  return (
    <div style={{ display: "flex", gap: 16, marginBottom: 28, flexWrap: "wrap" }}>
      {stats.map((stat) => (
        <StatCard key={stat.title} {...stat} />
      ))}
    </div>
  );
}
