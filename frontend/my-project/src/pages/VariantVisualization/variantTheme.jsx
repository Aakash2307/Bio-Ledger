// Shared design tokens + lookup tables used by VariantVisualization,
// VariantSummary, VariantTable, and VariantDetailPanel.
//
// This file deliberately imports nothing from the other Variant* files.
// Keeping it import-free is what makes it safe to import from all four of
// them without risking a circular-import evaluation-order bug (module A
// imports B, B imports back from A — depending on load order, a constant
// can still be in its temporal dead zone when the other module reads it).

export const T = {
  bg: "#F5F3EF",
  surface: "#FFFFFF",
  surfaceRaised: "#F1EEE7",
  surfaceSunken: "#FAF9F5",
  border: "#E3DFD5",
  borderSoft: "#EDEAE1",
  text: "#211F1B",
  textMuted: "#6B6659",
  textFaint: "#9A9587",
  accent: "#0B6E64",
  accentDim: "rgba(11,110,100,0.08)",
  danger: "#B5443A",
  warn: "#BD832C",
  safe: "#3F8F5F",
  na: "#C7C2B5",
  sans: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
};

export const panel = {
  background: T.surface,
  border: `1px solid ${T.border}`,
  borderRadius: 10,
};

export const btnBase = {
  borderRadius: 7,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  transition: "background 0.15s, border-color 0.15s, color 0.15s",
  fontFamily: T.sans,
};

// ACMG class colors — used by VariantSummary (lane/chips) and VariantTable
// (row status dot).
export const CLASS_META = {
  A: { label: "Pathogenic", color: "#D32F2F" },
  B: { label: "Likely Pathogenic", color: "#7B1E3A" },
  C: { label: "Uncertain Significance", color: "#E2711D" },
  D: { label: "Benign / Likely Benign", color: T.safe },
  M: { label: "Mixed / Conflicting", color: "#7C5CA6" },
  N: { label: "No ClinVar Data", color: T.textFaint },
};
export const CLASS_ORDER = ["A", "B", "C", "D", "M", "N"];

// Gene panel cross-reference categories — used by VariantSummary
// (lane/chips) and VariantDetailPanel (Overview tab badge).
export const GENE_CATEGORY_META = {
  cancerous: { label: "Cancerous", color: "#DB2777" },
  non_cancerous: { label: "Non-Cancerous", color: "#2563EB" },
  both: { label: "Both", color: "#7C5CA6" },
  unclassified: { label: "Unclassified", color: T.na },
};
export const GENE_CATEGORY_ORDER = ["cancerous", "non_cancerous", "both", "unclassified"];