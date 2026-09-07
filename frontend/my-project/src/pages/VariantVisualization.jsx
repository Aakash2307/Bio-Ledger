import { useEffect, useState, useCallback, useRef, useSyncExternalStore } from "react";

// npm install recharts   (no longer required by this file, kept optional
// for anyone re-adding chart tabs later)

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
    summary: { total: 0, classes: {} },
    rows: [],
    total: 0,
    page: 1,
    sortBy: "pos",
    sortDir: "asc",
    classFilter: null,
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

const CLASS_META = {
  A: { label: "Pathogenic", color: "#D95B5B" },
  B: { label: "Likely Pathogenic", color: "#E8A838" },
  C: { label: "Uncertain Significance", color: "#4A90D9" },
  D: { label: "Benign / Likely Benign", color: "#3BBFB2" },
  M: { label: "Mixed / Conflicting", color: "#A855F7" },
  N: { label: "No ClinVar Data", color: "#78716C" },
};

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

const card = {
  background: "#fff",
  borderRadius: 14,
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  padding: 20,
};

const btnBase = {
  borderRadius: 9,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  transition: "all 0.15s",
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
const GRID_COLS_DEFAULT = "0.85fr 0.8fr 0.8fr 0.6fr 0.6fr 1.35fr";

// When a class filter (any of A–E, or M) is active, add a column showing
// the raw ClinVar significance string, so it's clear WHY a variant landed
// in that bucket — including the mixed/conflicting bucket, where different
// submitters disagreed (e.g. "Pathogenic / Benign").
const CLIN_SIG_COLUMN = ["clin_sig", "Clinical Significance"];
const GRID_COLS_WITH_CLINSIG = "0.8fr 0.7fr 0.7fr 0.5fr 0.5fr 1.15fr 1.6fr";

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
function truncateSeq(seq, max = 12) {
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

export default function VariantVisualization() {
  // Persisted across route navigation (see variantStore above).
  const persisted = useSyncExternalStore(variantStore.subscribe, variantStore.get);
  const { sampleId, summary, rows, total, page, sortBy, sortDir, classFilter, search, selected } = persisted;
  const setSampleId = makeStoreSetter("sampleId");
  const setSummary = makeStoreSetter("summary");
  const setRows = makeStoreSetter("rows");
  const setTotal = makeStoreSetter("total");
  const setPage = makeStoreSetter("page");
  const setSortBy = makeStoreSetter("sortBy");
  const setSortDir = makeStoreSetter("sortDir");
  const setClassFilter = makeStoreSetter("classFilter");
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
  }, [sampleId, page, sortBy, sortDir, classFilter, search]);

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
    setSummary({ total: 0, classes: {} });
    setRows([]);
    setTotal(0);
    setPage(1);
    setSortBy("pos");
    setSortDir("asc");
    setClassFilter(null);
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

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "230px 1fr", gap: 20, alignItems: "start" }}>

        {/* ── Sidebar ── */}
        <aside style={card}>
          <h3 style={{ margin: 0, fontSize: 12, color: "#94a3b8", fontWeight: 700, letterSpacing: 0.3 }}>
            RETAINED VARIANTS
          </h3>
          <div style={{ fontSize: 34, fontWeight: 700, margin: "4px 0 18px", color: "#0f172a" }}>
            {summary.total}
          </div>

          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#94a3b8", marginBottom: 4 }}>
            SAMPLE / PATIENT ID
          </label>
          <input
            value={sampleId}
            onChange={(e) => setSampleId(e.target.value)}
            placeholder="e.g. 4A1643"
            style={{
              width: "100%", padding: "8px 10px", borderRadius: 8, marginBottom: 14,
              border: "1.5px solid #e2e8f0", fontSize: 13, outline: "none", boxSizing: "border-box",
            }}
          />

          {Object.entries(CLASS_META).map(([key, meta]) => (
            <button
              key={key}
              onClick={() => { setClassFilter(classFilter === key ? null : key); setPage(1); }}
              style={{
                ...btnBase,
                display: "flex", justifyContent: "space-between", alignItems: "center",
                width: "100%", textAlign: "left", padding: "9px 12px", marginBottom: 8,
                border: `1.5px solid ${classFilter === key ? meta.color : "#e2e8f0"}`,
                borderLeft: `4px solid ${meta.color}`,
                background: classFilter === key ? "#eff6ff" : "#fff",
                color: classFilter === key ? "#0f172a" : "#475569",
              }}
            >
              <span>{key}. {meta.label}</span>
              <span style={{ fontWeight: 700, color: "#334155" }}>{summary.classes?.[key] || 0}</span>
            </button>
          ))}

          <label
            style={{
              ...btnBase,
              display: "block", textAlign: "center", marginTop: 14,
              background: "#2563eb", color: "#fff", padding: "10px", border: "none",
            }}
          >
            {uploading ? "Uploading…" : "Upload Sample File"}
            <input type="file" accept=".xlsx,.csv,.tsv" hidden onChange={handleUpload} />
          </label>

          <button
            onClick={handleClear}
            disabled={!sampleId && rows.length === 0}
            style={{
              ...btnBase,
              display: "block", width: "100%", textAlign: "center", marginTop: 8,
              background: "#fff", color: "#64748b", padding: "10px",
              border: "1.5px solid #e2e8f0",
              opacity: (!sampleId && rows.length === 0) ? 0.5 : 1,
            }}
          >
            Clear
          </button>
        </aside>

        {/* ── Main column: compact variant list ── */}
        <main style={card}>
          <input
            placeholder="Search gene, cDNA, or rsID…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{
              width: "100%", padding: "10px 14px", borderRadius: 9,
              border: "1.5px solid #e2e8f0", marginBottom: 12, fontSize: 13, outline: "none",
              boxSizing: "border-box",
            }}
          />

          {/* Compact, scrollable variant list — deliberately short, like the
              SOPHiA "Variant List" strip, not a full-page table.
              Built with CSS grid rows (not a native <table>) because a
              sticky <th> inside a border-collapsed table has a Chromium
              repaint bug: body rows stay blank until something forces a
              repaint (e.g. scrolling). The header lives INSIDE the same
              scrolling container as the rows (sticky top:0) rather than in
              a separate non-scrolling wrapper — otherwise the row
              container's scrollbar eats a few pixels of width the header
              doesn't lose, and the columns drift out of alignment. */}
          <div style={{ border: "1px solid #e2e8f0", borderRadius: 9, overflow: "hidden", fontSize: 13 }}>
            <div style={{ maxHeight: 196, overflowY: "auto", scrollbarGutter: "stable" }}>
              <div style={{
                display: "grid", gridTemplateColumns: gridCols,
                background: "#f8fafc", borderBottom: "2px solid #e2e8f0",
                position: "sticky", top: 0, zIndex: 1,
              }}>
                {columns.map(([key, label]) => (
                  <div
                    key={key}
                    onClick={() => handleSort(key)}
                    style={{
                      textAlign: "left", color: "#64748b", fontWeight: 700, fontSize: 12,
                      padding: "9px 14px", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
                    }}
                  >
                    {label} {sortBy === key ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </div>
                ))}
              </div>

              {rows.map((r, idx) => (
                <div
                  key={`${r.variant_id}::${idx}`}
                  onClick={() => openVariant(r.variant_id)}
                  style={{
                    display: "grid", gridTemplateColumns: gridCols,
                    cursor: "pointer",
                    background: selected?.variant_id === r.variant_id ? "#eff6ff" : "transparent",
                    borderBottom: "1px solid #f1f5f9",
                  }}
                >
                  <div style={{ padding: "8px 14px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", fontWeight: 600, color: "#0f172a" }} title={formatAcmg(r.acmg_classification)}>
                    {formatAcmg(r.acmg_classification)}
                  </div>
                  <div style={{ padding: "8px 14px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{r.chrom}</div>
                  <div style={{ padding: "8px 14px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{r.pos}</div>
                  <div style={{ padding: "8px 14px", fontFamily: "monospace", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }} title={r.ref}>{truncateSeq(r.ref)}</div>
                  <div style={{ padding: "8px 14px", fontFamily: "monospace", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }} title={r.alt}>{truncateSeq(r.alt)}</div>
                  <div style={{ padding: "8px 14px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                    <span style={{
                      display: "inline-block", width: 8, height: 8, borderRadius: "50%",
                      marginRight: 8, background: CLASS_META[r.pathogenicity_class]?.color,
                    }} />
                    {r.gene}
                  </div>
                  {showClinSig && (
                    <div style={{ padding: "8px 14px", color: "#7e22ce", fontWeight: 600, fontSize: 12.5, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }} title={formatClinSig(r.clin_sig)}>
                      {formatClinSig(r.clin_sig)}
                    </div>
                  )}
                </div>
              ))}
              {!loading && rows.length === 0 && (
                <div style={{ textAlign: "center", color: "#94a3b8", padding: 28 }}>
                  No variants match this filter.
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 14, marginTop: 8, fontSize: 13, color: "#475569" }}>
            <button
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              style={{ ...btnBase, border: "1.5px solid #e2e8f0", background: "#fff", padding: "6px 14px", opacity: (page <= 1 || loading) ? 0.4 : 1 }}
            >Prev</button>
            <span>Page {page} of {totalPages} · {total} variants{loading ? " · loading…" : ""}</span>
            <button
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              style={{ ...btnBase, border: "1.5px solid #e2e8f0", background: "#fff", padding: "6px 14px", opacity: (page >= totalPages || loading) ? 0.4 : 1 }}
            >Next</button>
          </div>

          {/* ── Detail tab strip, directly below the variant list ── */}
          <div style={{ marginTop: 14 }}>
            <VariantDetailPanel variant={selected} />
          </div>
        </main>
      </div>
    </div>
  );
}

function VariantDetailPanel({ variant }) {
  const [tab, setTab] = useState("Overview");

  return (
    <div style={{ borderTop: "1.5px solid #e2e8f0", paddingTop: 18 }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 18, borderBottom: "1.5px solid #e2e8f0", flexWrap: "wrap" }}>
        {DETAIL_TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              border: "none", background: "none", padding: "9px 14px", fontSize: 13, cursor: "pointer",
              color: tab === t ? "#2563eb" : "#64748b",
              fontWeight: tab === t ? 700 : 500,
              borderBottom: tab === t ? "2px solid #2563eb" : "2px solid transparent",
              whiteSpace: "nowrap",
            }}
          >{t}</button>
        ))}
      </div>

      {!variant ? (
        <div style={{ textAlign: "center", color: "#94a3b8", fontSize: 13, padding: "36px 0" }}>
          Select a variant from the list above to see its {tab.toLowerCase()}.
        </div>
      ) : tab === "Overview" ? (
        <OverviewTab variant={variant} />
      ) : tab === "Details" ? (
        <DetailsTab variant={variant} />
      ) : (
        <div style={{ textAlign: "center", color: "#94a3b8", fontSize: 13, padding: "36px 0" }}>
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

  return (
    <div style={{ display: "flex", gap: 40, alignItems: "flex-start", flexWrap: "wrap" }}>
      {/* Reads / variant fraction — measured from this sample's own reads */}
      <div style={{ minWidth: 140 }}>
        <SectionLabel>Reads</SectionLabel>
        <div style={{ fontSize: 26, fontWeight: 700, color: "#0f172a", lineHeight: 1.1 }}>
          {depth ?? "—"}
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", letterSpacing: 0.4, marginBottom: 14 }}>
          DEPTH
        </div>
        <FractionGauge value={vf} />
      </div>

      {/* The raw call itself — chrom/pos/ref/alt, this sample's VF%, plus
          rsID (dbSNP/COSMIC identifier for this exact position). */}
      <div style={{ minWidth: 200 }}>
        <SectionLabel>Variant Call</SectionLabel>
        <DetailLine label="Chrom" value={variant.chrom} />
        <DetailLine label="Position" value={variant.pos} />
        <DetailLine label="Change" value={variant.ref && variant.alt ? `${variant.ref} > ${variant.alt}` : null} />
        <DetailLine label="VF% (this sample)" value={vf != null ? `${vf.toFixed(1)}%` : null} />
        <DetailLine label="rsID" value={variant.rsid} />
      </div>

      {/* In-silico prediction wheel, SOPHiA-style — pulls the 6 requested
          predictor columns from the new pipeline export. */}
      <div style={{ minWidth: 220 }}>
        <SectionLabel>Predicted Impact</SectionLabel>
        <PredictionRadar variant={variant} />
      </div>
    </div>
  );
}

// Everything else the pipeline provides for this variant that ISN'T
// already shown in the Overview tab. Overview covers: depth/VF% (Reads),
// chrom/pos/ref/alt/VF%/rsID (Variant Call), and SIFT/PolyPhen/
// AlphaMissense/REVEL/CADD (Predicted Impact) — so this tab intentionally
// excludes all of those and shows the remaining annotation fields instead:
// gene symbol, consequence/impact, transcript-level HGVS notation,
// population frequency, ClinVar significance, and ACMG classification.
// Fields shown in the Overview tab, hidden here so nothing is duplicated
// between the two tabs. "variant_id" and "pathogenicity_class" are also
// excluded — they're internal, app-computed values (a composite key and
// this app's own A-N filter bucket), not columns the pipeline itself
// produced, so they don't belong in a "raw data" view.
const OVERVIEW_FIELDS = new Set([
  "chrom", "pos", "ref", "alt", "depth", "vf_pct", "rsid",
  "sift", "polyphen", "alphamissense_class", "alphamissense_pathogenicity",
  "revel_score", "cadd_phred",
  "variant_id", "pathogenicity_class",
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
      <div style={{ textAlign: "center", color: "#94a3b8", fontSize: 13, padding: "36px 0" }}>
        No additional fields for this variant.
      </div>
    );
  }

  return (
    <div style={{ maxHeight: 420, overflowY: "auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "4px 24px" }}>
        {entries.map(([key, value]) => (
          <div key={key} style={{ padding: "5px 0", borderBottom: "1px solid #f1f5f9" }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: "#94a3b8", letterSpacing: 0.3, textTransform: "uppercase" }}>
              {key.replace(/_/g, " ")}
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "#1e293b", wordBreak: "break-word" }}>
              {formatScoreValue(value)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: 0.4, marginBottom: 10 }}>
      {children}
    </div>
  );
}

function DetailLine({ label, value }) {
  return (
    <div style={{ fontSize: 13, color: "#334155", marginBottom: 6, wordBreak: "break-all" }}>
      <span style={{ color: "#94a3b8" }}>{label}: </span>
      <b>{value || "—"}</b>
    </div>
  );
}

// Half-donut style gauge (VF%) rendered with a conic-gradient, echoing the
// red dial in the SOPHiA overview panel.
function FractionGauge({ value }) {
  const pct = value != null ? Math.max(0, Math.min(100, value)) : 0;
  const angle = (pct / 100) * 360;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div
        style={{
          width: 84, height: 84, borderRadius: "50%",
          background: `conic-gradient(#D95B5B ${angle}deg, #f1f5f9 0deg)`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <div style={{
          width: 64, height: 64, borderRadius: "50%", background: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 17, fontWeight: 700, color: "#D95B5B",
        }}>
          {value != null ? `${pct.toFixed(0)}%` : "—"}
        </div>
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", letterSpacing: 0.4, marginTop: 8 }}>
        VARIANT FRACTION
      </div>
    </div>
  );
}

// Small labelled slider bar used for the frequency rows.
function FrequencyRow({ label, value, pct }) {
  const clamped = pct != null ? Math.max(0, Math.min(100, pct)) : null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#64748b", marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ fontWeight: 700, color: "#334155" }}>{value}</span>
      </div>
      <div style={{ position: "relative", height: 4, background: "#f1f5f9", borderRadius: 2 }}>
        {clamped != null && (
          <div style={{
            position: "absolute", top: -3, left: `calc(${clamped}% - 5px)`,
            width: 10, height: 10, borderRadius: "50%", background: "#D95B5B",
          }} />
        )}
      </div>
    </div>
  );
}

// Circular arrangement of in-silico prediction scores, echoing the
// "scores" wheel in the SOPHiA overview (SIFT / PolyPhen2 / MutationTaster /
// ESP5400 / G1000 / GnomAD around a central point). Fields we don't parse
// yet are shown as N/A, same as the reference screenshot.
// This is the CURRENT prediction wheel shown in the Overview tab, using the
// 6 columns requested from the new pipeline export: PolyPhen, SIFT,
// AlphaMissense_class, AlphaMissense_pathogenicity, REVEL_score, and
// CADD_phred. Visually it's the same circular layout as SOPHiA's — just
// pointed at different underlying fields.
// Severity color scale shared by every predictor below: red leans
// damaging/pathogenic, teal leans tolerated/benign, amber is ambiguous /
// borderline, and gray means no call was made for this variant.
const SEVERITY_COLORS = { danger: "#D95B5B", warn: "#E8A838", safe: "#3BBFB2", na: "#cbd5e1" };

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

// Predictors with a known, bounded numeric range get a small fill bar
// alongside their value; unbounded/categorical ones just show the value.
const PREDICTOR_RANGES = {
  alphamissense_pathogenicity: [0, 1],
  revel_score: [0, 1],
  cadd_phred: [0, 40], // CADD is technically unbounded; 40 comfortably covers the typical range
};

// True "web view" radar/spider chart — six axes, one per predictor. Shape
// area gives an at-a-glance read of overall impact severity; each vertex is
// individually color-coded by that predictor's own severity so no single
// axis gets lost in an averaged shape. Labels sit OUTSIDE the plot area at
// fixed short abbreviations (not the raw values) specifically to avoid the
// earlier overlap bug — exact values live in the legend below instead,
// where there's no positioning constraint on text length.
const RADAR_AXES = [
  { key: "sift", short: "SIFT", label: "SIFT" },
  { key: "polyphen", short: "PolyPhen", label: "PolyPhen" },
  { key: "alphamissense_class", short: "AM Class", label: "AlphaMissense Class" },
  { key: "alphamissense_pathogenicity", short: "AM Path.", label: "AlphaMissense Pathogenicity" },
  { key: "revel_score", short: "REVEL", label: "REVEL Score" },
  { key: "cadd_phred", short: "CADD", label: "CADD Phred" },
];

// Severity -> how far out on its axis the vertex sits (0-1 of max radius).
// "na" sits just barely off-center rather than at 0, so a variant with no
// predictions at all still traces a visible (tiny) hexagon instead of a
// single invisible point.
const SEVERITY_MAGNITUDE = { danger: 1, warn: 0.62, safe: 0.3, na: 0.08 };

function PredictionRadar({ variant }) {
  const size = 210;
  const center = size / 2;
  const maxRadius = 48;
  const n = RADAR_AXES.length;

  const axisData = RADAR_AXES.map((axis, i) => {
    const rawValue = variant[axis.key];
    const severity = predictorSeverity(axis.key, rawValue);
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    const magnitude = SEVERITY_MAGNITUDE[severity];
    const { main, sub } = splitPredictionValue(rawValue);
    return {
      ...axis,
      rawValue,
      severity,
      angle,
      valueText: sub ? `${main} (${sub})` : main,
      vertex: { x: center + Math.cos(angle) * maxRadius * magnitude, y: center + Math.sin(angle) * maxRadius * magnitude },
      edge: { x: center + Math.cos(angle) * maxRadius, y: center + Math.sin(angle) * maxRadius },
      // Fixed outer ring position (independent of each axis's own data
      // magnitude) so labels always sit in a consistent compass ring
      // around the plot — same idea as SOPHiA's layout — rather than
      // hugging whatever severity distance that axis happens to have.
      labelPos: { x: center + Math.cos(angle) * (maxRadius + 26), y: center + Math.sin(angle) * (maxRadius + 26) },
    };
  });

  const polygonPoints = axisData.map((a) => `${a.vertex.x},${a.vertex.y}`).join(" ");
  const gridRings = [0.33, 0.66, 1];

  return (
    <svg width={size} height={size} style={{ display: "block", margin: "0 auto", overflow: "visible" }}>
      {/* Background web grid */}
      {gridRings.map((ring) => (
        <polygon
          key={ring}
          points={RADAR_AXES.map((_, i) => {
            const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
            return `${center + Math.cos(angle) * maxRadius * ring},${center + Math.sin(angle) * maxRadius * ring}`;
          }).join(" ")}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="1"
        />
      ))}
      {/* Axis spokes */}
      {axisData.map((a) => (
        <line key={a.key} x1={center} y1={center} x2={a.edge.x} y2={a.edge.y} stroke="#e2e8f0" strokeWidth="1" />
      ))}
      {/* Data shape */}
      <polygon points={polygonPoints} fill="rgba(99,102,241,0.14)" stroke="#6366F1" strokeWidth="1.5" strokeLinejoin="round" />
      {/* Per-axis severity markers */}
      {axisData.map((a) => (
        <circle key={a.key} cx={a.vertex.x} cy={a.vertex.y} r="3.5" fill={SEVERITY_COLORS[a.severity]} stroke="#fff" strokeWidth="1.2" />
      ))}
      {/* Label + value directly on the web, like SOPHiA — two lines per
          axis: the predictor name, then its value/score colored by
          severity, anchored so text grows away from the plot rather than
          into it. */}
      {axisData.map((a) => {
        const cos = Math.cos(a.angle);
        const anchor = cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle";
        return (
          <text key={a.key} x={a.labelPos.x} y={a.labelPos.y} textAnchor={anchor}>
            <tspan x={a.labelPos.x} dy="-4" fontSize="9" fontWeight="700" fill="#94a3b8">
              {a.short}
            </tspan>
            <tspan x={a.labelPos.x} dy="12" fontSize="11.5" fontWeight="700" fill={a.severity === "na" ? "#cbd5e1" : SEVERITY_COLORS[a.severity]}>
              {a.valueText}
            </tspan>
          </text>
        );
      })}
    </svg>
  );
}

function PredictionSeverityList({ variant }) {
  const predictors = [
    { key: "sift", label: "SIFT", value: variant.sift },
    { key: "polyphen", label: "PolyPhen", value: variant.polyphen },
    { key: "alphamissense_class", label: "AlphaMissense Class", value: variant.alphamissense_class },
    { key: "alphamissense_pathogenicity", label: "AlphaMissense Pathogenicity", value: variant.alphamissense_pathogenicity },
    { key: "revel_score", label: "REVEL Score", value: variant.revel_score },
    { key: "cadd_phred", label: "CADD Phred", value: variant.cadd_phred },
  ];

  return (
    <div style={{ width: 260 }}>
      {predictors.map((p) => {
        const severity = predictorSeverity(p.key, p.value);
        const color = SEVERITY_COLORS[severity];
        const { main, sub } = splitPredictionValue(p.value);
        const range = PREDICTOR_RANGES[p.key];
        const num = Number(p.value);
        const barPct = range && !Number.isNaN(num) ? Math.max(0, Math.min(100, ((num - range[0]) / (range[1] - range[0])) * 100)) : null;

        return (
          <div key={p.key} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b" }}>{p.label}</span>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: severity === "na" ? "#cbd5e1" : "#0f172a" }}>
                {main}{sub ? ` (${sub})` : ""}
              </span>
            </div>
            {barPct != null && (
              <div style={{ height: 4, background: "#f1f5f9", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${barPct}%`, background: color, borderRadius: 2 }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PredictionWheel({ variant }) {
  const points = [
    { label: "SIFT", value: variant.sift },
    { label: "PolyPhen", value: variant.polyphen },
    { label: "AlphaMissense Class", value: variant.alphamissense_class },
    { label: "AlphaMissense Path.", value: variant.alphamissense_pathogenicity },
    { label: "REVEL Score", value: variant.revel_score },
    { label: "CADD Phred", value: variant.cadd_phred },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 20px", width: 240 }}>
      {points.map((p) => {
        const { main, sub } = splitPredictionValue(p.value);
        const isNA = main === "N/A";
        return (
          <div key={p.label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", letterSpacing: 0.2, marginBottom: 3 }}>
              {p.label}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: isNA ? "#cbd5e1" : "#0f172a", lineHeight: 1.3 }}>
              {main}
            </div>
            {sub && (
              <div style={{ fontSize: 10, fontWeight: 600, color: "#94a3b8", marginTop: 1 }}>
                {sub}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ScoreWheel({ variant }) {
  const points = [
    { label: "SIFT", value: variant.sift },
    { label: "PolyPhen2", value: variant.polyphen },
    { label: "MutationTaster", value: "N/A" },
    { label: "ESP5400", value: "N/A" },
    { label: "G1000", value: "N/A" },
    { label: "GnomAD", value: variant.gnomad_af != null ? Number(variant.gnomad_af).toExponential(2) : "N/A" },
  ];
  const radius = 52;
  const size = radius * 2 + 66;
  const center = size / 2;

  return (
    <div style={{ position: "relative", width: size, height: size, margin: "0 auto" }}>
      <div style={{
        position: "absolute", top: center - 5, left: center - 5,
        width: 10, height: 10, borderRadius: "50%", background: "#cbd5e1",
      }} />
      {points.map((p, i) => {
        const angle = (i / points.length) * 2 * Math.PI - Math.PI / 2;
        const x = center + radius * Math.cos(angle);
        const y = center + radius * Math.sin(angle);
        const isNA = p.value == null || p.value === "N/A";
        return (
          <div
            key={p.label}
            style={{
              position: "absolute", left: x, top: y, transform: "translate(-50%, -50%)",
              textAlign: "center", width: 62,
            }}
          >
            <div style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", letterSpacing: 0.2 }}>{p.label}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: isNA ? "#cbd5e1" : "#0f172a" }}>{p.value ?? "N/A"}</div>
          </div>
        );
      })}
    </div>
  );
}