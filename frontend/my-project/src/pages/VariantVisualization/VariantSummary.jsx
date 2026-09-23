import {
  T, panel, btnBase,
  CLASS_META, CLASS_ORDER,
  GENE_CATEGORY_META, GENE_CATEGORY_ORDER,
} from "./variantTheme";

// Colors/letters for the variant-type badge. Falls back to the accent
// color + first letter of whatever string comes back, in case a new
// variant type is ever added without updating this map.
const VARIANT_TYPE_META = {
  GERMLINE: { letter: "G", color: "#15803d", bg: "rgba(21,128,61,0.12)" },
  SOMATIC:  { letter: "S", color: "#2563eb", bg: "rgba(37,99,235,0.12)" },
};

// Top strip: sample identity + classification lane + actions.
// The distribution bar is both the hero visual (an at-a-glance read of
// this sample's call mix) and the filter control itself — click a
// segment, or its legend chip below, to toggle that class.
export default function VariantSummary({
  sampleId, setSampleId,
  summary, rowsCount,
  uploading, onUpload, onClear,
  classFilter, setClassFilter,
  geneCategoryFilter, setGeneCategoryFilter,
  panelFilter, setPanelFilter,
  setPage,
}) {
  const classTotal = CLASS_ORDER.reduce((sum, k) => sum + (summary.classes?.[k] || 0), 0) || 1;
  const geneCategoryTotal = GENE_CATEGORY_ORDER.reduce((sum, k) => sum + (summary.gene_categories?.[k] || 0), 0) || 1;
  const hasGeneCategoryData = Object.keys(summary.gene_categories || {}).length > 0;
  const hasPanelData = (summary.panels || []).length > 0;

  const variantTypeKey = (summary.variant_type || "").toUpperCase();
  const variantTypeMeta = VARIANT_TYPE_META[variantTypeKey] || {
    letter: variantTypeKey.charAt(0) || "?",
    color: T.accent,
    bg: T.accentDim,
  };

  return (
    <div style={{ ...panel, padding: "18px 22px", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 20, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.textFaint, marginBottom: 6 }}>
            Sample Id
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <input
              value={sampleId}
              onChange={(e) => setSampleId(e.target.value)}
              placeholder="e.g. 4A1643"
              style={{
                background: "transparent", border: "none", borderBottom: `1.5px solid ${T.border}`,
                color: T.text, fontFamily: T.mono, fontSize: 18, fontWeight: 600, padding: "2px 0",
                outline: "none", width: "11ch",
              }}
            />
            {summary.variant_type && (
              <span
                title={summary.variant_type}
                style={{
                  fontSize: 12, fontWeight: 700, color: variantTypeMeta.color, background: variantTypeMeta.bg,
                  width: 22, height: 22, display: "inline-flex", alignItems: "center", justifyContent: "center",
                  borderRadius: "50%", letterSpacing: 0,
                }}
              >
                {variantTypeMeta.letter}
              </span>
            )}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.textFaint, marginBottom: 4 }}>
            Retained variants
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, fontFamily: T.mono, color: T.text, lineHeight: 1.3 }}>
            {summary.total.toLocaleString()}
          </div>
        </div>

        <div className="variant-summary-patient-search" style={{ width: 170, flex: "0 0 auto" }}>
          <input
            type="text"
            placeholder="Search patient ID..."
            aria-label="Search patient ID"
            style={{ width: "100%", boxSizing: "border-box" }}
          />
        </div>
        <label
          style={{
            ...btnBase, background: T.accent, color: "#FFFFFF", padding: "9px 16px", border: "none",
          }}
        >
          {uploading ? "Uploading…" : "Upload"}
          <input type="file" accept=".xlsx,.csv,.tsv" hidden onChange={onUpload} />
        </label>
        <button
          onClick={onClear}
          disabled={!sampleId && rowsCount === 0}
          style={{
            ...btnBase, background: "transparent", color: T.textMuted, padding: "9px 16px",
            border: `1.5px solid ${T.border}`,
            opacity: (!sampleId && rowsCount === 0) ? 0.4 : 1,
          }}
        >
          Clear
        </button>
      </div>

      {/* Gene panel cross-reference lane: cancerous/non-cancerous/both/
          unclassified — driven by gene_category, which variant_parser.py
          attaches by matching each variant's gene against the gene_panels
          reference table. Only rendered once this sample actually has
          that data (older cached samples parsed before this existed won't
          have the column, and hasGeneCategoryData stays false). */}
      {hasGeneCategoryData && (
        <>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.textFaint, marginBottom: 8 }}>
            Gene panel match
          </div>
          <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", marginBottom: 10 }}>
            {GENE_CATEGORY_ORDER.map((key) => {
              const count = summary.gene_categories?.[key] || 0;
              const meta = GENE_CATEGORY_META[key];
              const isDimmed = geneCategoryFilter && geneCategoryFilter !== key;
              if (count === 0) return null;
              return (
                <div
                  key={key}
                  onClick={() => { setGeneCategoryFilter(geneCategoryFilter === key ? null : key); setPage(1); }}
                  title={`${meta.label}: ${count.toLocaleString()}`}
                  style={{
                    width: `${(count / geneCategoryTotal) * 100}%`,
                    background: meta.color,
                    opacity: isDimmed ? 0.25 : 1,
                    cursor: key === "unclassified" ? "default" : "pointer",
                    minWidth: count > 0 ? 2 : 0,
                    transition: "opacity 0.15s",
                  }}
                />
              );
            })}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {GENE_CATEGORY_ORDER.filter((k) => (summary.gene_categories?.[k] || 0) > 0).map((key) => {
              const meta = GENE_CATEGORY_META[key];
              const active = geneCategoryFilter === key;
              return (
                <button
                  key={key}
                  onClick={() => { setGeneCategoryFilter(active ? null : key); setPage(1); }}
                  style={{
                    ...btnBase,
                    display: "flex", alignItems: "center", gap: 7,
                    padding: "6px 11px",
                    background: active ? T.accentDim : "transparent",
                    border: `1px solid ${active ? T.accent : T.borderSoft}`,
                    color: active ? T.text : T.textMuted,
                    fontSize: 12.5,
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: meta.color, flexShrink: 0 }} />
                  {meta.label}
                  <span style={{ fontFamily: T.mono, fontWeight: 700, color: active ? T.text : T.textFaint }}>
                    {(summary.gene_categories?.[key] || 0).toLocaleString()}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Per-panel breakdown: which specific panel(s) within
              Cancerous/Non-Cancerous each gene matched. A variant can
              belong to more than one panel at once (counted under each).
              Skipped if this sample's cache predates the gene_panels
              column entirely. */}
          {hasPanelData && (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.textFaint, margin: "4px 0 8px" }}>
                Panel breakdown
              </div>
              {["cancerous", "non_cancerous"].map((cat) => {
                const panelsInCat = summary.panels.filter((p) => p.category === cat && p.count > 0);
                if (panelsInCat.length === 0) return null;
                const catMeta = GENE_CATEGORY_META[cat];
                return (
                  <div key={cat} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: catMeta.color, marginBottom: 6 }}>
                      {catMeta.label}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                      {panelsInCat.map((p) => {
                        const active = panelFilter === p.panel;
                        return (
                          <button
                            key={p.panel}
                            onClick={() => { setPanelFilter(active ? null : p.panel); setPage(1); }}
                            style={{
                              ...btnBase,
                              display: "flex", alignItems: "center", gap: 6,
                              padding: "5px 10px",
                              background: active ? `${catMeta.color}18` : "transparent",
                              border: `1px solid ${active ? catMeta.color : T.borderSoft}`,
                              color: active ? T.text : T.textMuted,
                              fontSize: 12,
                            }}
                          >
                            {p.panel}
                            <span style={{ fontFamily: T.mono, fontWeight: 700, color: active ? T.text : T.textFaint }}>
                              {p.count.toLocaleString()}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </>
      )}

      {/* Proportional lane: each class's share of the total, in ACMG order */}
      <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", marginBottom: 10 }}>
        {CLASS_ORDER.map((key) => {
          const count = summary.classes?.[key] || 0;
          const meta = CLASS_META[key];
          const isDimmed = classFilter && classFilter !== key;
          if (count === 0) return null;
          return (
            <div
              key={key}
              onClick={() => { setClassFilter(classFilter === key ? null : key); setPage(1); }}
              title={`${meta.label}: ${count.toLocaleString()}`}
              style={{
                width: `${(count / classTotal) * 100}%`,
                background: meta.color,
                opacity: isDimmed ? 0.25 : 1,
                cursor: "pointer",
                minWidth: count > 0 ? 2 : 0,
                transition: "opacity 0.15s",
              }}
            />
          );
        })}
      </div>

      {/* Legend / toggle chips with exact counts */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {CLASS_ORDER.map((key) => {
          const meta = CLASS_META[key];
          const active = classFilter === key;
          return (
            <button
              key={key}
              onClick={() => { setClassFilter(active ? null : key); setPage(1); }}
              style={{
                ...btnBase,
                display: "flex", alignItems: "center", gap: 7,
                padding: "6px 11px",
                background: active ? T.accentDim : "transparent",
                border: `1px solid ${active ? T.accent : T.borderSoft}`,
                color: active ? T.text : T.textMuted,
                fontSize: 12.5,
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: meta.color, flexShrink: 0 }} />
              {key} · {meta.label}
              <span style={{ fontFamily: T.mono, fontWeight: 700, color: active ? T.text : T.textFaint }}>
                {(summary.classes?.[key] || 0).toLocaleString()}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}