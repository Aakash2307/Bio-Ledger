import { useEffect, useState, useCallback, useRef, useSyncExternalStore } from "react";

// ── Cross-route persistence ─────────────────────────────────────────────
// Sample ID, filters, current page, sort, and the selected variant used to
// live in this component's useState — which meant navigating to Dashboard /
// Sample Tracker / etc and back unmounted + remounted this component,
// wiping all of that back to defaults ("refreshing"). Moving it into a
// plain module-level object means it survives unmount/remount for as long
// as the page itself isn't fully reloaded (i.e. normal client-side route
// navigation), while useSyncExternalStore keeps React's rendering in sync
// with it exactly like a tiny external store (Zustand-style).
const variantStore = {
  state: {
    sampleId: "",
    summary: { total: 0, classes: {}, gene_categories: {}, panels: [] },
    rows: [],
    total: 0,
    page: 1,
    sortBy: "pos",
    sortDir: "asc",
    classFilter: null,
    geneCategoryFilter: null,
    panelFilter: null,
    search: "",
    selected: null,
  },
  listeners: new Set(),
  get() {
    return variantStore.state;
  },
  set(patch) {
    variantStore.state = {
      ...variantStore.state,
      ...(typeof patch === "function" ? patch(variantStore.state) : patch),
    };
    variantStore.listeners.forEach((l) => l());
  },
  subscribe(listener) {
    variantStore.listeners.add(listener);
    return () => variantStore.listeners.delete(listener);
  },
};

// Mimics useState's setter API (including functional updates) but writes
// through to the shared store instead of local component state, so every
// existing `setSampleId(x)` / `setPage(p => p + 1)` call site below keeps
// working unchanged.
function makeStoreSetter(key) {
  return (updateOrValue) => {
    variantStore.set((s) => ({
      [key]: typeof updateOrValue === "function" ? updateOrValue(s[key]) : updateOrValue,
    }));
  };
}

const API_BASE = "/api/variants";
const PAGE_SIZE = 100;

// ── Design tokens ────────────────────────────────────────────────────────
// Light, warm-paper clinical palette: hairline borders instead of card
// shadows keep it reading as a precise instrument readout rather than the
// soft-shadow "SaaS card kit" look, and the accent is a deep teal instead
// of the light blue most dashboards default to — so the color budget is
// spent on the six ACMG classes plus one clearly distinct accent.
const T = {
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

const CLASS_META = {
  A: { label: "Pathogenic", color: T.danger },
  B: { label: "Likely Pathogenic", color: T.warn },
  C: { label: "Uncertain Significance", color: "#3E6FA6" },
  D: { label: "Benign / Likely Benign", color: T.safe },
  M: { label: "Mixed / Conflicting", color: "#7C5CA6" },
  N: { label: "No ClinVar Data", color: T.textFaint },
};
const CLASS_ORDER = ["A", "B", "C", "D", "M", "N"];

// Gene panel cross-reference categories, matching the gene_category field
// variant_parser.py now attaches per row (looked up against gene_panels).
// Colors intentionally echo the Gene Panel page's own palette: pink for
// cancerous, blue for non-cancerous — same meaning, same hue, wherever a
// gene's category shows up in the app.
const GENE_CATEGORY_META = {
  cancerous: { label: "Cancerous", color: "#DB2777" },
  non_cancerous: { label: "Non-Cancerous", color: "#2563EB" },
  both: { label: "Both", color: "#7C5CA6" },
  unclassified: { label: "Unclassified", color: T.na },
};
const GENE_CATEGORY_ORDER = ["cancerous", "non_cancerous", "both", "unclassified"];

const DETAIL_TABS = [
  "Overview",
  "Details",
  "Variant Description",
  "Flagging",
  "Viewer",
  "ACMG",
  "Similar Patients",
  "Warnings",
];

const panel = {
  background: T.surface,
  border: `1px solid ${T.border}`,
  borderRadius: 10,
}

const btnBase = {
  borderRadius: 7,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  transition: "background 0.15s, border-color 0.15s, color 0.15s",
  fontFamily: T.sans,
};

// Only the columns the user wants visible in the (now compact) variant list.
const TABLE_COLUMNS = [
  ["acmg_classification", "ACMG"],
  ["chrom", "Chrom"],
  ["pos", "Pos"],
  ["ref", "Ref"],
  ["alt", "Alt"],
  ["gene", "Symbol"],
];
const GRID_COLS_DEFAULT = "0.85fr 0.7fr 0.8fr 0.55fr 0.55fr 1.1fr";

// When a class filter (any of A–E, or M) is active, add a column showing
// the raw ClinVar significance string, so it's clear WHY a variant landed
// in that bucket — including the mixed/conflicting bucket, where different
// submitters disagreed (e.g. "Pathogenic / Benign").
const CLIN_SIG_COLUMN = ["clin_sig", "Clinical Significance"];
const GRID_COLS_WITH_CLINSIG = "0.75fr 0.6fr 0.7fr 0.45fr 0.45fr 0.95fr 1.35fr";

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

// Formats a single value for the prediction wheel: numeric scores get a
// short fixed-precision form, category labels (e.g. AlphaMissense_class)
// get underscores replaced and title-cased, and anything missing is N/A.
function formatScoreValue(value) {
  if (value == null || value === "" || value === "-") return "N/A";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(3);
  const asNum = Number(value);
  if (!Number.isNaN(asNum) && String(value).trim() !== "") return String(Number(asNum.toFixed(3)));
  return String(value).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// SIFT/PolyPhen-style predictions arrive as one run-together string like
// "deleterious_low_confidence(0)" — a qualitative call plus its numeric
// score jammed into parentheses. Split those apart so they can be shown as
// a short main label with the score underneath, instead of one long line.
function splitPredictionValue(value) {
  if (value == null || value === "" || value === "-") return { main: "N/A", sub: null };
  const str = String(value);
  const match = str.match(/^(.*)\(([^)]*)\)\s*$/);
  if (match) {
    const [, label, score] = match;
    return { main: label.trim().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "N/A", sub: score.trim() || null };
  }
  return { main: formatScoreValue(value), sub: null };
}

// Panel names from gene_panels arrive pipe-joined (e.g.
// "Cardiac|Somatic"). Split + prettify for the badge tooltip / Details tab.
function formatGenePanels(raw) {
  if (!raw) return null;
  return String(raw).split("|").filter(Boolean).join(", ");
}

export default function VariantVisualization() {
  // Persisted across route navigation (see variantStore above).
  const persisted = useSyncExternalStore(variantStore.subscribe, variantStore.get);
  const { sampleId, summary, rows, total, page, sortBy, sortDir, classFilter, geneCategoryFilter, panelFilter, search, selected } = persisted;
  const setSampleId = makeStoreSetter("sampleId");
  const setSummary = makeStoreSetter("summary");
  const setRows = makeStoreSetter("rows");
  const setTotal = makeStoreSetter("total");
  const setPage = makeStoreSetter("page");
  const setSortBy = makeStoreSetter("sortBy");
  const setSortDir = makeStoreSetter("sortDir");
  const setClassFilter = makeStoreSetter("classFilter");
  const setGeneCategoryFilter = makeStoreSetter("geneCategoryFilter");
  const setPanelFilter = makeStoreSetter("panelFilter");
  const setSearch = makeStoreSetter("search");
  const setSelected = makeStoreSetter("selected");

  // Transient, per-mount UI flags — intentionally NOT persisted, so a stale
  // "loading"/"uploading" state can't survive across an unmount.
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const loadSummary = useCallback(async (sid = sampleId) => {
    if (!sid) return;
    const res = await fetch(`${API_BASE}/${sid}/summary`);
    setSummary(await res.json());
  }, [sampleId]);

  const requestIdRef = useRef(0);
  const abortRef = useRef(null);

  const loadRows = useCallback(async (sid = sampleId) => {
    if (!sid) return;

    // Cancel any still-in-flight request before starting a new one, and
    // stamp this request with an id. Two safety nets against the same
    // failure mode (an old, slow response overwriting a newer page): the
    // abort actually kills the old network request, and the id check below
    // is a fallback in case the abort doesn't land in time.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestIdRef.current;

    setLoading(true);

    const params = new URLSearchParams({
      page, page_size: PAGE_SIZE, sort_by: sortBy, sort_dir: sortDir,
    });
    if (classFilter) params.set("class", classFilter);
    if (geneCategoryFilter) params.set("gene_category", geneCategoryFilter);
    if (panelFilter) params.set("gene_panel", panelFilter);
    if (search) params.set("search", search);

    try {
      const res = await fetch(`${API_BASE}/${sid}?${params}`, { signal: controller.signal });
      const data = await res.json();

      if (requestId !== requestIdRef.current) return; // superseded — drop this stale response

      setRows(data.rows || []);
      setTotal(data.total || 0);
    } catch (err) {
      if (err.name !== "AbortError") console.error("Failed to load variants:", err);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [sampleId, page, sortBy, sortDir, classFilter, geneCategoryFilter, panelFilter, search]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { loadRows(); }, [loadRows]);

  const openVariant = async (variantId) => {
    const res = await fetch(`${API_BASE}/${sampleId}/${encodeURIComponent(variantId)}`);
    setSelected(await res.json());
  };

  const handleSort = (col) => {
    if (sortBy === col) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("asc"); }
    setPage(1);
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Always derive the Sample/Patient ID from the file that was just
    // picked, overwriting whatever was in the box before. Sample ID now
    // persists across route navigation (so switching tabs and back doesn't
    // lose your place) — but that same persistence meant a leftover ID from
    // a PREVIOUS upload (e.g. "Germline") would silently get reused for a
    // brand new, unrelated file (e.g. a Somatic upload), showing the wrong
    // label even though the correct sample type was still detected and
    // ingested underneath. The label shown must always match the file that
    // was actually just uploaded.
    const sid = file.name.split(/[_.]/)[0];
    setSampleId(sid);

    // Auto-detect the variant type from the filename, same idea as your
    // existing "type is detected automatically" upload flow.
    const lower = file.name.toLowerCase();
    const type = lower.includes("germline") ? "germline"
      : lower.includes("prs") || lower.includes("trait") ? "prs"
      : "somatic";

    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    form.append("sample_id", sid);
    form.append("type", type);

    try {
      const res = await fetch(`${API_BASE}/upload`, { method: "POST", body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Upload failed: ${err.detail || res.statusText}`);
      } else {
        // Always refresh after a successful upload, passing sid directly
        // rather than relying on sampleId state (which may not have
        // re-rendered yet).
        await loadSummary(sid);
        await loadRows(sid);
      }
    } catch (err) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
      setPage(1);
    }
  };

  const handleClear = () => {
    // Cancel anything in flight and drop any late response from landing
    // after the reset.
    abortRef.current?.abort();
    requestIdRef.current++;

    setSampleId("");
    setSummary({ total: 0, classes: {}, gene_categories: {}, panels: [] });
    setRows([]);
    setTotal(0);
    setPage(1);
    setSortBy("pos");
    setSortDir("asc");
    setClassFilter(null);
    setGeneCategoryFilter(null);
    setPanelFilter(null);
    setSearch("");
    setSelected(null);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Show the extra Clinical Significance column whenever ANY class filter
  // is active (A–E or M) — not just Others/Mixed — so you can see the
  // actual ClinVar call behind every bucket, not just the disputed one.
  const showClinSig = !!classFilter;
  const columns = showClinSig ? [...TABLE_COLUMNS, CLIN_SIG_COLUMN] : TABLE_COLUMNS;
  const gridCols = showClinSig ? GRID_COLS_WITH_CLINSIG : GRID_COLS_DEFAULT;

  const classTotal = CLASS_ORDER.reduce((sum, k) => sum + (summary.classes?.[k] || 0), 0) || 1;
  const geneCategoryTotal = GENE_CATEGORY_ORDER.reduce((sum, k) => sum + (summary.gene_categories?.[k] || 0), 0) || 1;
  const hasGeneCategoryData = Object.keys(summary.gene_categories || {}).length > 0;
  const hasPanelData = (summary.panels || []).length > 0;

  return (
    <div style={{ fontFamily: T.sans, color: T.text }}>

      {/* ── Top strip: sample identity + classification lane + actions ──
          This replaces the old vertical filter sidebar. The distribution
          bar is both the hero visual (an at-a-glance read of this sample's
          call mix) and the filter control itself — click a segment, or its
          legend chip below, to toggle that class. */}
      <div style={{ ...panel, padding: "18px 22px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 28, flexWrap: "wrap", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: T.textFaint, marginBottom: 6 }}>
              Sample / patient ID
            </div>
            <input
              value={sampleId}
              onChange={(e) => setSampleId(e.target.value)}
              placeholder="e.g. 4A1643"
              style={{
                background: "transparent", border: "none", borderBottom: `1.5px solid ${T.border}`,
                color: T.text, fontFamily: T.mono, fontSize: 18, fontWeight: 600, padding: "2px 0",
                outline: "none", width: 190,
              }}
            />
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: T.textFaint, marginBottom: 4 }}>
              Retained variants
            </div>
            <div style={{ fontSize: 32, fontWeight: 700, fontFamily: T.mono, color: T.text, lineHeight: 1 }}>
              {summary.total.toLocaleString()}
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 20 }} />

          <label
            style={{
              ...btnBase, background: T.accent, color: "#FFFFFF", padding: "9px 16px", border: "none",
            }}
          >
            {uploading ? "Uploading…" : "Upload sample file"}
            <input type="file" accept=".xlsx,.csv,.tsv" hidden onChange={handleUpload} />
          </label>
          <button
            onClick={handleClear}
            disabled={!sampleId && rows.length === 0}
            style={{
              ...btnBase, background: "transparent", color: T.textMuted, padding: "9px 16px",
              border: `1.5px solid ${T.border}`,
              opacity: (!sampleId && rows.length === 0) ? 0.4 : 1,
            }}
          >
            Clear
          </button>
        </div>

        {/* Gene panel cross-reference lane: same lane/chip pattern as the
            ACMG strip below, but for cancerous/non-cancerous/both/
            unclassified — driven by gene_category, which variant_parser.py
            attaches by matching each variant's gene against the gene_panels
            reference table. Shown first, ahead of the ACMG lane. Only
            rendered once this sample actually has that data (older cached
            samples parsed before this existed won't have the column, and
            hasGeneCategoryData stays false). */}
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
                Cancerous/Non-Cancerous each gene matched — Somatic,
                Hereditary under Cancerous; Cardiac, NDD, etc under
                Non-Cancerous. A separate section below the category lane
                above, since a variant can belong to more than one panel
                at once (counted under each). Uses hasPanelData so it's
                skipped if this sample's cache predates the gene_panels
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

      {/* ── Master–detail dock: list on the left, inspector permanently
          docked on the right, so opening a variant never displaces the
          list you were scanning. ── */}
      <div style={{ ...panel, display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(340px, 0.95fr)", overflow: "hidden" }}>

        {/* ── List column ── */}
        <div style={{ padding: 18, borderRight: `1px solid ${T.border}` }}>
          <input
            placeholder="Search gene, cDNA, or rsID…"
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
            <div style={{ maxHeight: 480, overflowY: "auto", scrollbarGutter: "stable" }}>
              <div style={{
                display: "grid", gridTemplateColumns: gridCols,
                background: T.surfaceRaised, borderBottom: `1.5px solid ${T.border}`,
                position: "sticky", top: 0, zIndex: 1,
              }}>
                {columns.map(([key, label]) => (
                  <div
                    key={key}
                    onClick={() => handleSort(key)}
                    style={{
                      textAlign: "left", color: T.textFaint, fontWeight: 700, fontSize: 11,
                      padding: "9px 12px", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
                      letterSpacing: 0.2,
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
                    onClick={() => openVariant(r.variant_id)}
                    style={{
                      display: "grid", gridTemplateColumns: gridCols,
                      cursor: "pointer",
                      background: isSelected ? T.accentDim : "transparent",
                      borderLeft: isSelected ? `2px solid ${T.accent}` : "2px solid transparent",
                      borderBottom: `1px solid ${T.borderSoft}`,
                    }}
                  >
                    <div style={{ padding: "8px 12px 8px 10px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", fontWeight: 600, color: T.text }} title={formatAcmg(r.acmg_classification)}>
                      {formatAcmg(r.acmg_classification)}
                    </div>
                    <div style={{ padding: "8px 12px", fontFamily: T.mono, color: T.textMuted, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{r.chrom}</div>
                    <div style={{ padding: "8px 12px", fontFamily: T.mono, color: T.textMuted, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{r.pos}</div>
                    <div style={{ padding: "8px 12px", fontFamily: T.mono, color: T.textMuted, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }} title={r.ref}>{truncateSeq(r.ref)}</div>
                    <div style={{ padding: "8px 12px", fontFamily: T.mono, color: T.textMuted, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }} title={r.alt}>{truncateSeq(r.alt)}</div>
                    <div style={{ padding: "8px 12px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                      <span style={{
                        display: "inline-block", width: 7, height: 7, borderRadius: "50%",
                        marginRight: 7, background: CLASS_META[r.pathogenicity_class]?.color,
                      }} />
                      <span style={{ fontFamily: T.mono, color: T.text }}>{r.gene}</span>
                    </div>
                    {showClinSig && (
                      <div style={{ padding: "8px 12px", color: "#7C5CA6", fontWeight: 600, fontSize: 12, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }} title={formatClinSig(r.clin_sig)}>
                        {formatClinSig(r.clin_sig)}
                      </div>
                    )}
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

        {/* ── Docked inspector ── */}
        <div style={{ padding: 18, background: T.surfaceSunken, maxHeight: 616, overflowY: "auto" }}>
          <VariantDetailPanel variant={selected} />
        </div>
      </div>
    </div>
  );
}

function VariantDetailPanel({ variant }) {
  const [tab, setTab] = useState("Overview");

  return (
    <div>
      <div style={{ display: "flex", gap: 2, marginBottom: 18, borderBottom: `1.5px solid ${T.border}`, flexWrap: "wrap" }}>
        {DETAIL_TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              border: "none", background: "none", padding: "8px 11px", fontSize: 12.5, cursor: "pointer",
              color: tab === t ? T.accent : T.textMuted,
              fontWeight: tab === t ? 700 : 500,
              borderBottom: tab === t ? `2px solid ${T.accent}` : "2px solid transparent",
              whiteSpace: "nowrap",
              fontFamily: T.sans,
            }}
          >{t}</button>
        ))}
      </div>

      {!variant ? (
        <div style={{ textAlign: "center", color: T.textFaint, fontSize: 13, padding: "48px 12px" }}>
          Select a variant from the list to see its {tab.toLowerCase()}.
        </div>
      ) : tab === "Overview" ? (
        <OverviewTab variant={variant} />
      ) : tab === "Details" ? (
        <DetailsTab variant={variant} />
      ) : (
        <div style={{ textAlign: "center", color: T.textFaint, fontSize: 13, padding: "48px 12px" }}>
          {t_placeholder(tab)}
        </div>
      )}
    </div>
  );
}

function t_placeholder(tab) {
  return `${tab} — coming soon.`;
}

function OverviewTab({ variant }) {
  const vf = variant.vf_pct != null ? Number(variant.vf_pct) : null;
  const depth = variant.depth != null ? Math.round(variant.depth) : null;
  const geneCatMeta = variant.gene_category ? GENE_CATEGORY_META[variant.gene_category] : null;

  return (
    <div>
      <div style={{ display: "flex", gap: 24, marginBottom: 26 }}>
        <FractionGauge value={vf} />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 10 }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 700, fontFamily: T.mono, color: T.text, lineHeight: 1 }}>{depth ?? "—"}</div>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: T.textFaint, marginTop: 3 }}>reads at this position</div>
          </div>
        </div>
      </div>

      <SectionLabel>Variant call</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 20px", marginBottom: 26 }}>
        <DetailLine label="Chrom" value={variant.chrom} />
        <DetailLine label="Position" value={variant.pos} />
        <DetailLine label="Change" value={variant.ref && variant.alt ? `${variant.ref} > ${variant.alt}` : null} />
        <DetailLine label="VF% (this sample)" value={vf != null ? `${vf.toFixed(1)}%` : null} />
        <DetailLine label="rsID" value={variant.rsid} />
      </div>

      {geneCatMeta && (
        <>
          <SectionLabel>Gene panel match</SectionLabel>
          <div style={{ marginBottom: 26 }}>
            <span
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px",
                borderRadius: 999, fontSize: 12, fontWeight: 700, color: geneCatMeta.color,
                background: `${geneCatMeta.color}18`, border: `1px solid ${geneCatMeta.color}40`,
              }}
            >
              {geneCatMeta.label}
            </span>
            {variant.gene_panels && (
              <div style={{ fontSize: 12, color: T.textMuted, marginTop: 8 }}>
                Matched panel{formatGenePanels(variant.gene_panels).includes(",") ? "s" : ""}: {formatGenePanels(variant.gene_panels)}
              </div>
            )}
          </div>
        </>
      )}

      <SectionLabel>Predicted impact</SectionLabel>
      <PredictionRadar variant={variant} />
    </div>
  );
}

// Everything else the pipeline provides for this variant that ISN'T
// already shown in the Overview tab. Overview covers: depth/VF% (Reads),
// chrom/pos/ref/alt/VF%/rsID (Variant Call), gene_category/gene_panels
// (Gene panel match), and SIFT/PolyPhen/AlphaMissense/REVEL/CADD
// (Predicted Impact) — so this tab intentionally excludes all of those and
// shows the remaining annotation fields instead: gene symbol,
// consequence/impact, transcript-level HGVS notation, population
// frequency, ClinVar significance, and ACMG classification.
// "variant_id" and "pathogenicity_class" are also excluded — they're
// internal, app-computed values (a composite key and this app's own A-N
// filter bucket), not columns the pipeline itself produced, so they don't
// belong in a "raw data" view.
const OVERVIEW_FIELDS = new Set([
  "chrom", "pos", "ref", "alt", "depth", "vf_pct", "rsid",
  "sift", "polyphen", "alphamissense_class", "alphamissense_pathogenicity",
  "revel_score", "cadd_phred",
  "variant_id", "pathogenicity_class",
  "gene_category", "gene_panels",
]);

// Everything else the pipeline provides for this variant — dynamically
// reflects on whatever fields actually came back for this row, rather than
// a hand-maintained list. Both Germline (~98 columns) and Somatic (~112,
// including ClinVar/CIViC/AMP tiering that Germline doesn't have) exports
// are covered automatically this way, and any new pipeline column shows up
// here without needing this component touched again.
function DetailsTab({ variant }) {
  const entries = Object.entries(variant)
    .filter(([key]) => !OVERVIEW_FIELDS.has(key))
    .sort(([a], [b]) => a.localeCompare(b));

  if (entries.length === 0) {
    return (
      <div style={{ textAlign: "center", color: T.textFaint, fontSize: 13, padding: "36px 0" }}>
        No additional fields for this variant.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 20px" }}>
      {entries.map(([key, value]) => (
        <div key={key} style={{ padding: "6px 0", borderBottom: `1px solid ${T.borderSoft}` }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: T.textFaint, letterSpacing: 0.3 }}>
            {key.replace(/_/g, " ")}
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: T.text, fontFamily: T.mono, wordBreak: "break-word" }}>
            {formatScoreValue(value)}
          </div>
        </div>
      ))}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 10.5, fontWeight: 700, color: T.textFaint, letterSpacing: 0.3, marginBottom: 10 }}>
      {children}
    </div>
  );
}

function DetailLine({ label, value }) {
  return (
    <div style={{ fontSize: 12.5, color: T.textMuted, marginBottom: 5, wordBreak: "break-all" }}>
      {label}: <b style={{ color: T.text, fontFamily: T.mono, fontWeight: 700 }}>{value || "—"}</b>
    </div>
  );
}

// Half-donut style gauge (VF%) rendered with a conic-gradient.
function FractionGauge({ value }) {
  const pct = value != null ? Math.max(0, Math.min(100, value)) : 0;
  const angle = (pct / 100) * 360;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
      <div
        style={{
          width: 76, height: 76, borderRadius: "50%",
          background: `conic-gradient(${T.accent} ${angle}deg, ${T.surfaceRaised} 0deg)`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <div style={{
          width: 58, height: 58, borderRadius: "50%", background: T.surfaceSunken,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 15, fontWeight: 700, color: T.accent, fontFamily: T.mono,
        }}>
          {value != null ? `${pct.toFixed(0)}%` : "—"}
        </div>
      </div>
      <div style={{ fontSize: 9.5, fontWeight: 700, color: T.textFaint, letterSpacing: 0.3, marginTop: 7 }}>
        variant fraction
      </div>
    </div>
  );
}

// Circular arrangement of in-silico prediction scores. Fields we don't
// parse yet are shown as N/A.
// Uses the 6 columns requested from the new pipeline export: PolyPhen,
// SIFT, AlphaMissense_class, AlphaMissense_pathogenicity, REVEL_score, and
// CADD_phred.
// Severity color scale shared by every predictor below: red leans
// damaging/pathogenic, green leans tolerated/benign, amber is ambiguous /
// borderline, and slate means no call was made for this variant.
const SEVERITY_COLORS = { danger: T.danger, warn: T.warn, safe: T.safe, na: T.na };

// Each predictor has its own scale and vocabulary, so severity has to be
// worked out per-field rather than generically. Thresholds used here are
// the commonly cited ones for each tool (AlphaMissense's own 0.34/0.564
// cutoffs, REVEL's conventional ~0.5, CADD's "top 1%" ~20), not something
// derived from this dataset.
function predictorSeverity(key, rawValue) {
  if (rawValue == null || rawValue === "" || rawValue === "-") return "na";
  const str = String(rawValue).toLowerCase();
  const num = Number(rawValue);

  switch (key) {
    case "sift":
      if (str.includes("deleterious")) return "danger";
      if (str.includes("tolerated")) return "safe";
      return "warn";
    case "polyphen":
      if (str.includes("probably")) return "danger";
      if (str.includes("possibly")) return "warn";
      if (str.includes("benign")) return "safe";
      return "warn";
    case "alphamissense_class":
      if (str.includes("pathogenic")) return "danger";
      if (str.includes("benign")) return "safe";
      return "warn";
    case "alphamissense_pathogenicity":
      if (Number.isNaN(num)) return "na";
      if (num >= 0.564) return "danger";
      if (num <= 0.34) return "safe";
      return "warn";
    case "revel_score":
      if (Number.isNaN(num)) return "na";
      if (num >= 0.5) return "danger";
      if (num < 0.3) return "safe";
      return "warn";
    case "cadd_phred":
      if (Number.isNaN(num)) return "na";
      if (num >= 20) return "danger";
      if (num < 10) return "safe";
      return "warn";
    default:
      return "na";
  }
}

// True "web view" radar/spider chart — six axes, one per predictor. Shape
// area gives an at-a-glance read of overall impact severity; each vertex is
// individually color-coded by that predictor's own severity so no single
// axis gets lost in an averaged shape. Labels sit OUTSIDE the plot area at
// fixed short abbreviations (not the raw values) specifically to avoid
// overlap — exact values live directly under the label instead, where
// there's no positioning constraint on text length.
const RADAR_AXES = [
  { key: "sift", short: "SIFT" },
  { key: "polyphen", short: "PolyPhen" },
  { key: "alphamissense_class", short: "AM Class" },
  { key: "alphamissense_pathogenicity", short: "AM Path." },
  { key: "revel_score", short: "REVEL" },
  { key: "cadd_phred", short: "CADD" },
];

// Severity -> how far out on its axis the vertex sits (0-1 of max radius).
// "na" sits just barely off-center rather than at 0, so a variant with no
// predictions at all still traces a visible (tiny) hexagon instead of a
// single invisible point.
const SEVERITY_MAGNITUDE = { danger: 1, warn: 0.62, safe: 0.3, na: 0.08 };

function PredictionRadar({ variant }) {
  const size = 260;
  const center = size / 2;
  const maxRadius = 62;
  const n = RADAR_AXES.length;

  const axisData = RADAR_AXES.map((axis, i) => {
    const rawValue = variant[axis.key];
    const severity = predictorSeverity(axis.key, rawValue);
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    const magnitude = SEVERITY_MAGNITUDE[severity];
    const { main, sub } = splitPredictionValue(rawValue);
    return {
      ...axis,
      severity,
      angle,
      valueText: sub ? `${main} (${sub})` : main,
      vertex: { x: center + Math.cos(angle) * maxRadius * magnitude, y: center + Math.sin(angle) * maxRadius * magnitude },
      edge: { x: center + Math.cos(angle) * maxRadius, y: center + Math.sin(angle) * maxRadius },
      labelPos: { x: center + Math.cos(angle) * (maxRadius + 32), y: center + Math.sin(angle) * (maxRadius + 32) },
    };
  });

  const polygonPoints = axisData.map((a) => `${a.vertex.x},${a.vertex.y}`).join(" ");
  const gridRings = [0.33, 0.66, 1];

  return (
    <svg width={size} height={size} style={{ display: "block", margin: "0 auto", overflow: "visible" }}>
      {gridRings.map((ring) => (
        <polygon
          key={ring}
          points={RADAR_AXES.map((_, i) => {
            const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
            return `${center + Math.cos(angle) * maxRadius * ring},${center + Math.sin(angle) * maxRadius * ring}`;
          }).join(" ")}
          fill="none"
          stroke={T.borderSoft}
          strokeWidth="1"
        />
      ))}
      {axisData.map((a) => (
        <line key={a.key} x1={center} y1={center} x2={a.edge.x} y2={a.edge.y} stroke={T.borderSoft} strokeWidth="1" />
      ))}
      <polygon points={polygonPoints} fill="rgba(11,110,100,0.10)" stroke={T.accent} strokeWidth="1.5" strokeLinejoin="round" />
      {axisData.map((a) => (
        <circle key={a.key} cx={a.vertex.x} cy={a.vertex.y} r="3.5" fill={SEVERITY_COLORS[a.severity]} stroke={T.surfaceSunken} strokeWidth="1.2" />
      ))}
      {axisData.map((a) => {
        const cos = Math.cos(a.angle);
        const anchor = cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle";
        return (
          <text key={a.key} x={a.labelPos.x} y={a.labelPos.y} textAnchor={anchor} fontFamily={T.sans}>
            <tspan x={a.labelPos.x} dy="-4" fontSize="9.5" fontWeight="700" fill={T.textFaint}>
              {a.short}
            </tspan>
            <tspan x={a.labelPos.x} dy="13" fontSize="12" fontWeight="700" fill={a.severity === "na" ? T.na : SEVERITY_COLORS[a.severity]} fontFamily={T.mono}>
              {a.valueText}
            </tspan>
          </text>
        );
      })}
    </svg>
  );
}