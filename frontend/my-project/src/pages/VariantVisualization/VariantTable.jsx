import { useState } from "react";
import { T, panel, btnBase, CLASS_META } from "./variantTheme";

// Ref/Alt sequences beyond this length get collapsed to a one-line
// preview by default; click the cell to expand to the full wrapped
// sequence. Keeps ordinary SNVs (1-2 chars) untouched while large indels
// (which can run 100+ chars) don't force every row in the table to be as
// tall as the single longest sequence in view.
const SEQUENCE_PREVIEW_LENGTH = 12;

// Only the columns the user wants visible in the (compact) variant list.
// Clinical Significance (the raw ClinVar call) is always shown now — it
// used to only appear once a class filter was active, but it's useful
// context on every row, not just filtered ones. Frequency stays last since
// it's the placeholder column with no data behind it yet.
const TABLE_COLUMNS = [
  ["acmg_classification", "ACMG"],
  ["chrom", "Chrom"],
  ["pos", "Pos"],
  ["ref", "Ref"],
  ["alt", "Alt"],
  ["gene", "Symbol"],
  ["varient_type", "Variant Type"],
  ["consequence", "Consequence"],
  ["clin_sig", "Clinical Significance"],
  ["frequency", "Frequency"],
];
// Every column but Consequence/Clinical Significance/Ref/Alt grows to fit
// its content on one line (max-content) — those columns are free-form
// text (or, for Ref/Alt, a raw sequence) that can run to several dozen or
// even 100+ characters, which was dragging the whole table far wider than
// useful and forcing a long horizontal scroll just to read one cell.
// Capping their width and letting them wrap to multiple lines keeps the
// row readable without truncating anything.
const COLUMN_TRACKS = {
  acmg_classification: "minmax(90px, max-content)",
  chrom: "minmax(70px, max-content)",
  pos: "minmax(80px, max-content)",
  // Ref/Alt used to be "max-content" with the sequence truncated to 10
  // chars + a native `title` tooltip for the rest — but a large indel can
  // run to 100+ characters, and relying on a hover tooltip to read it
  // (plus the truncated text still visually crowding the neighboring
  // Symbol column) wasn't great. Bounded like Consequence/Clinical
  // Significance instead, so a long sequence wraps onto extra lines
  // within its own column rather than needing a hover to read the full
  // value.
  ref: "minmax(70px, 140px)",
  alt: "minmax(70px, 140px)",
  gene: "minmax(90px, max-content)",
  varient_type: "minmax(130px, max-content)",
  consequence: "minmax(200px, 320px)",
  frequency: "minmax(100px, max-content)",
  clin_sig: "minmax(200px, 320px)",
};
function gridColsFor(columns) {
  return columns.map(([key]) => COLUMN_TRACKS[key] || "minmax(90px, max-content)").join(" ");
}

// Shared border-bottom style for every cell in a row (see the "rowStyle"
// comment on the row wrapper below for why this lives per-cell rather
// than on the row container).
const cellBorder = { borderBottom: `1px solid ${T.borderSoft}` };

// Shared base style for Ref/Alt cells. Ref/Alt hold raw sequence, not
// natural-language text, so there are no word boundaries for the browser
// to wrap on ("break-word" would treat the whole sequence as a single
// unbreakable "word" and just overflow the column, same failure mode as
// the phenotype tokens elsewhere in the app) — "break-all" is used
// instead whenever a cell IS wrapped, since it can break at any
// character. Whether a given cell wraps at all is decided per-cell in
// SequenceCell below, based on length + expanded state.
const sequenceCellBase = {
  ...cellBorder,
  padding: "8px 12px",
  fontFamily: T.mono,
  color: T.textMuted,
  lineHeight: 1.4,
};

// One Ref or Alt cell. Short sequences (SNVs, small indels) just render
// as-is on one line, same as before. Long sequences render truncated to
// SEQUENCE_PREVIEW_LENGTH chars by default — click the cell to expand it
// to the full sequence, wrapped across as many lines as it needs; click
// again to collapse it back down. stopPropagation keeps that click from
// also firing the row's onClick (which opens the variant detail panel).
function SequenceCell({ value, cellKey, expandedCells, onToggle }) {
  const str = value != null ? String(value) : "";
  const isLong = str.length > SEQUENCE_PREVIEW_LENGTH;
  const expanded = expandedCells.has(cellKey);
  const showFull = !isLong || expanded;

  return (
    <div
      onClick={isLong ? (e) => { e.stopPropagation(); onToggle(cellKey); } : undefined}
      title={isLong ? (expanded ? "Click to collapse" : "Click to view full sequence") : undefined}
      style={{
        ...sequenceCellBase,
        whiteSpace: showFull ? "normal" : "nowrap",
        wordBreak: showFull ? "break-all" : "normal",
        overflow: showFull ? "visible" : "hidden",
        textOverflow: showFull ? "clip" : "ellipsis",
        cursor: isLong ? "pointer" : "default",
        textDecoration: isLong ? "underline dotted" : "none",
        textUnderlineOffset: 2,
      }}
    >
      {showFull ? str : `${str.slice(0, SEQUENCE_PREVIEW_LENGTH)}…`}
    </div>
  );
}

// ClinVar strings arrive as raw, comma/slash separated, lower_snake_case
// tokens (e.g. "pathogenic,benign" or "conflicting_interpretations_of_
// pathogenicity,benign"). Dedupe and prettify them for display.
function formatClinSig(raw) {
  if (!raw || raw === "-") return "No ClinVar submission";
  const seen = new Set();
  const parts = raw
    .split(/[,/]/)
    .map((t) => t.trim())
    .filter((t) => t && t !== "-")
    .map((t) => t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()))
    .filter((t) => (seen.has(t) ? false : (seen.add(t), true)));
  return parts.length ? parts.join(" / ") : "No ClinVar submission";
}

// ACMG_Classification values look like "pathogenic", "VUS", or a
// pipe-joined "VUS|pathogenic" when the caller flagged more than one
// possibility. Prettify for display; leave genuinely unassessed as "—".
function formatAcmg(raw) {
  if (!raw || raw === "-") return "—";
  return String(raw)
    .split("|")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.toUpperCase() === "VUS" ? "VUS" : t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())))
    .join(" / ");
}

// "varient_type" arrives as a single plain label (e.g. "SNV", "Indel").
// Just clean up casing/underscores; nothing to dedupe or split here.
function formatVariantType(raw) {
  if (!raw || raw === "-") return "—";
  return String(raw).trim().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Consequence arrives comma-separated when a variant hits more than one
// consequence term (e.g. "splice_donor_variant,coding_sequence_variant,
// intron_variant"). Dedupe + prettify each term, same treatment as
// formatClinSig, so the cell reads as short human labels rather than raw
// VEP tokens; the full list still lives in the title tooltip.
function formatConsequence(raw) {
  if (!raw || raw === "-") return "—";
  const seen = new Set();
  const parts = raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()))
    .filter((t) => (seen.has(t) ? false : (seen.add(t), true)));
  return parts.length ? parts.join(" / ") : "—";
}

export default function VariantTable({
  search, setSearch, setPage,
  rows, loading,
  sortBy, sortDir, onSort,
  selected, onOpenVariant,
  page, total, pageSize,
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const gridCols = gridColsFor(TABLE_COLUMNS);

  // Which Ref/Alt cells are currently expanded, keyed by
  // "<variant_id>::<row index>::ref|alt" so the same variant appearing
  // twice (shouldn't normally happen, but the row key already guards for
  // it) doesn't share expand state.
  const [expandedCells, setExpandedCells] = useState(() => new Set());
  const toggleCell = (key) => {
    setExpandedCells((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  return (
    <div style={{ padding: 18, borderRight: `1px solid ${T.border}` }}>
      {/* Backend `search` param is expected to match against gene symbol
          and rsID only — narrowed from the previous "gene, cDNA, or rsID"
          copy/behavior. If the /api/variants search endpoint still matches
          on cDNA too, that matching logic lives server-side and isn't in
          this file. */}
      <input
        placeholder="Search by symbol or rsID…"
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        style={{
          width: "100%", padding: "9px 13px", borderRadius: 8,
          border: `1.5px solid ${T.border}`, marginBottom: 12, fontSize: 13, outline: "none",
          boxSizing: "border-box", background: T.surfaceSunken, color: T.text, fontFamily: T.sans,
        }}
      />

      {/* Compact, scrollable variant list.
          Built with CSS grid rows (not a native <table>) because a
          sticky <th> inside a border-collapsed table has a Chromium
          repaint bug: body rows stay blank until something forces a
          repaint (e.g. scrolling). The header lives INSIDE the same
          scrolling container as the rows (sticky top:0) rather than in
          a separate non-scrolling wrapper — otherwise the row
          container's scrollbar eats a few pixels of width the header
          doesn't lose, and the columns drift out of alignment. */}
      <div style={{ border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden", fontSize: 13 }}>
        <div style={{ maxHeight: 480, overflow: "auto", scrollbarGutter: "stable" }}>
          <div style={{
            display: "grid", gridTemplateColumns: gridCols,
            background: T.surfaceRaised, borderBottom: `1.5px solid ${T.border}`,
            position: "sticky", top: 0, zIndex: 1,
          }}>
            {TABLE_COLUMNS.map(([key, label]) => (
              <div
                key={key}
                onClick={() => onSort(key)}
                style={{
                  textAlign: "left", color: T.textFaint, fontWeight: 700, fontSize: 11,
                  padding: "9px 12px", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
                  letterSpacing: 0.2, background: T.surfaceRaised,
                }}
              >
                {label} {sortBy === key ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </div>
            ))}
          </div>

          {rows.map((r, idx) => {
            const isSelected = selected?.variant_id === r.variant_id;
            return (
              <div
                key={`${r.variant_id}::${idx}`}
                onClick={() => onOpenVariant(r.variant_id)}
                style={{
                  display: "grid", gridTemplateColumns: gridCols,
                  cursor: "pointer",
                  background: isSelected ? T.accentDim : "transparent",
                  borderLeft: isSelected ? `2px solid ${T.accent}` : "2px solid transparent",
                  // NOTE: the row divider is intentionally NOT set here as a
                  // single borderBottom on this container. Consequence /
                  // Clinical Significance / Ref / Alt wrap to 2+ lines on
                  // longer values while other cells stay single-line, and a
                  // container-level border only reliably renders under the
                  // grid tracks that actually reach the container's content
                  // edge — with mixed wrapping heights that left the divider
                  // trailing off after the first (short, nowrap) column
                  // instead of spanning the full row. Each cell below gets
                  // its own matching borderBottom (cellBorder) instead, so
                  // every column — regardless of how many lines it wraps
                  // to — ends the row with a continuous, aligned line.
                }}
              >
                <div style={{ ...cellBorder, padding: "8px 12px 8px 10px", whiteSpace: "nowrap", fontWeight: 600, color: T.text }}>
                  {formatAcmg(r.acmg_classification)}
                </div>
                <div style={{ ...cellBorder, padding: "8px 12px", fontFamily: T.mono, color: T.textMuted, whiteSpace: "nowrap" }}>{r.chrom}</div>
                <div style={{ ...cellBorder, padding: "8px 12px", fontFamily: T.mono, color: T.textMuted, whiteSpace: "nowrap" }}>{r.pos}</div>
                <SequenceCell
                  value={r.ref}
                  cellKey={`${r.variant_id}::${idx}::ref`}
                  expandedCells={expandedCells}
                  onToggle={toggleCell}
                />
                <SequenceCell
                  value={r.alt}
                  cellKey={`${r.variant_id}::${idx}::alt`}
                  expandedCells={expandedCells}
                  onToggle={toggleCell}
                />
                <div style={{ ...cellBorder, padding: "8px 12px", whiteSpace: "nowrap" }}>
                  <span style={{
                    display: "inline-block", width: 7, height: 7, borderRadius: "50%",
                    marginRight: 7, background: CLASS_META[r.pathogenicity_class]?.color,
                  }} />
                  <span style={{ fontFamily: T.mono, color: T.text }}>{r.gene}</span>
                </div>
                <div style={{ ...cellBorder, padding: "8px 12px", color: T.textMuted, whiteSpace: "nowrap" }}>
                  {formatVariantType(r.varient_type)}
                </div>
                <div style={{ ...cellBorder, padding: "8px 12px", color: T.textMuted, whiteSpace: "normal", wordBreak: "break-word", lineHeight: 1.4 }} title={formatConsequence(r.consequence)}>
                  {formatConsequence(r.consequence)}
                </div>
                <div style={{ ...cellBorder, padding: "8px 12px", color: "#7C5CA6", fontWeight: 600, fontSize: 12, whiteSpace: "normal", wordBreak: "break-word", lineHeight: 1.4 }} title={formatClinSig(r.clin_sig)}>
                  {formatClinSig(r.clin_sig)}
                </div>
                {/* Frequency is intentionally left blank for now — no data
                    source wired up yet; the column exists as a placeholder
                    for when one is. */}
                <div style={{ ...cellBorder, padding: "8px 12px", color: T.textFaint, whiteSpace: "nowrap" }} />
              </div>
            );
          })}
          {!loading && rows.length === 0 && (
            <div style={{ textAlign: "center", color: T.textFaint, padding: 28, fontSize: 13 }}>
              No variants match this filter.
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 14, marginTop: 10, fontSize: 12.5, color: T.textMuted }}>
        <button
          disabled={page <= 1 || loading}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          style={{ ...btnBase, border: `1.5px solid ${T.border}`, background: "transparent", color: T.textMuted, padding: "6px 13px", opacity: (page <= 1 || loading) ? 0.35 : 1 }}
        >Prev</button>
        <span style={{ fontFamily: T.mono }}>Page {page} / {totalPages} · {total.toLocaleString()} variants{loading ? " · loading…" : ""}</span>
        <button
          disabled={page >= totalPages || loading}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          style={{ ...btnBase, border: `1.5px solid ${T.border}`, background: "transparent", color: T.textMuted, padding: "6px 13px", opacity: (page >= totalPages || loading) ? 0.35 : 1 }}
        >Next</button>
      </div>
    </div>
  );
}