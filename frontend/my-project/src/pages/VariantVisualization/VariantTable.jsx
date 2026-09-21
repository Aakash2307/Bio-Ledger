import { T, panel, btnBase, CLASS_META } from "./variantTheme";

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
// Every column but Consequence/Clinical Significance grows to fit its
// content on one line (max-content) — those two are free text that can
// run to several dozen characters once multiple terms are joined with
// " / ", which was dragging the whole table far wider than useful and
// forcing a long horizontal scroll just to read one cell. Capping their
// width and letting them wrap to multiple lines keeps the row readable
// without truncating anything.
const COLUMN_TRACKS = {
  acmg_classification: "minmax(90px, max-content)",
  chrom: "minmax(70px, max-content)",
  pos: "minmax(80px, max-content)",
  ref: "minmax(70px, max-content)",
  alt: "minmax(70px, max-content)",
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

// Large indels put the entire deleted/inserted sequence in REF or ALT —
// some real-world exports run to 100+ characters. Left unbounded, one such
// cell overflows straight through the neighboring columns (looks like
// "extra genes" jammed into the row). Truncate for the compact list view;
// the full sequence is still visible via the native title tooltip and in
// the Overview tab's Sequence panel when the row is opened.
function truncateSeq(seq, max = 10) {
  if (seq == null) return seq;
  const s = String(seq);
  return s.length > max ? `${s.slice(0, max)}…` : s;
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
                  // Clinical Significance wrap to 2+ lines on longer values
                  // while every other cell stays single-line, and a
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
                <div style={{ ...cellBorder, padding: "8px 12px", fontFamily: T.mono, color: T.textMuted, whiteSpace: "nowrap" }} title={r.ref}>{truncateSeq(r.ref)}</div>
                <div style={{ ...cellBorder, padding: "8px 12px", fontFamily: T.mono, color: T.textMuted, whiteSpace: "nowrap" }} title={r.alt}>{truncateSeq(r.alt)}</div>
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