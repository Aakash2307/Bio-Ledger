import { useEffect, useState, useCallback, useRef, useSyncExternalStore } from "react";
import VariantSummary from "./VariantSummary";
import VariantTable from "./VariantTable";
import VariantDetailPanel from "./VariantDetailPanel";
import { T, panel } from "./variantTheme";
import "../../css/VariantVisualization.css";

// ── Cross-route persistence ─────────────────────────────────────────────
// Sample ID, filters, current page, sort, and the selected variant used to
// live in this component's useState — which meant navigating to Dashboard /
// Sample Tracker / etc and back unmounted + remounted this component,
// wiping all of that back to defaults ("refreshing"). Moving it into a
// plain module-level object means it survives unmount/remount for as long
// as the page itself isn't fully reloaded (i.e. normal client-side route
// navigation), while useSyncExternalStore keeps React's rendering in sync
// with it exactly like a tiny external store (Zustand-style).
// Top-level analysis-type tabs, mirroring SOPHiA's SNVs/INDELs · CNVs ·
// Fusions · Warnings row. Only "SNVs/INDELs" has real data behind it right
// now (the table/summary/detail dock below); the others render as
// coming-soon placeholders until their pipelines/endpoints exist.
const ANALYSIS_TABS = ["SNVs/INDELs", "CNVs", "Fusions", "Warnings"];

const variantStore = {
  state: {
    analysisTab: "SNVs/INDELs",
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
// existing `setSampleId(x)` / `setPage(p => p + 1)` call site keeps
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

export default function VariantVisualization() {
  // Persisted across route navigation (see variantStore above).
  const persisted = useSyncExternalStore(variantStore.subscribe, variantStore.get);
  const {
    analysisTab, sampleId, summary, rows, total, page, sortBy, sortDir,
    classFilter, geneCategoryFilter, panelFilter, search, selected,
  } = persisted;
  const setAnalysisTab = makeStoreSetter("analysisTab");
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
    // picked, overwriting whatever was in the box before.
    const sid = file.name.split(/[_.]/)[0];
    setSampleId(sid);

    // Auto-detect the variant type from the filename.
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

  return (
    <div style={{ fontFamily: T.sans, color: T.text }}>
      <VariantSummary
        sampleId={sampleId}
        setSampleId={setSampleId}
        summary={summary}
        rowsCount={rows.length}
        uploading={uploading}
        onUpload={handleUpload}
        onClear={handleClear}
        classFilter={classFilter}
        setClassFilter={setClassFilter}
        geneCategoryFilter={geneCategoryFilter}
        setGeneCategoryFilter={setGeneCategoryFilter}
        panelFilter={panelFilter}
        setPanelFilter={setPanelFilter}
        setPage={setPage}
      />

      {/* Analysis-type tabs (SNVs/INDELs · CNVs · Fusions · Warnings) sit
          directly above the search panel, same placement as SOPHiA's
          equivalent row. Switching tabs is persisted in variantStore so it
          survives route navigation like the rest of this screen's state. */}
      <div style={{ display: "flex", gap: 2, marginBottom: 14, borderBottom: `1.5px solid ${T.border}`, flexWrap: "wrap" }}>
        {ANALYSIS_TABS.map((t) => (
          <button
            key={t}
            onClick={() => setAnalysisTab(t)}
            style={{
              border: "none", background: "none", padding: "9px 14px", fontSize: 13, cursor: "pointer",
              color: analysisTab === t ? T.accent : T.textMuted,
              fontWeight: analysisTab === t ? 700 : 600,
              borderBottom: analysisTab === t ? `2px solid ${T.accent}` : "2px solid transparent",
              whiteSpace: "nowrap",
              fontFamily: T.sans,
            }}
          >{t}</button>
        ))}
      </div>

      {analysisTab !== "SNVs/INDELs" ? (
        <div style={{ ...panel, textAlign: "center", color: T.textFaint, fontSize: 13, padding: "56px 12px" }}>
          {analysisTab} — coming soon.
        </div>
      ) : (
        /* ── Master–detail dock: list on the left, inspector permanently
            docked on the right ── */
        <div style={{ ...panel, display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(340px, 0.95fr)", overflow: "hidden" }}>
          <VariantTable
            search={search}
            setSearch={setSearch}
            setPage={setPage}
            rows={rows}
            loading={loading}
            sortBy={sortBy}
            sortDir={sortDir}
            onSort={handleSort}
            selected={selected}
            onOpenVariant={openVariant}
            classFilter={classFilter}
            page={page}
            total={total}
            pageSize={PAGE_SIZE}
          />

          <div style={{ padding: 18, background: T.surfaceSunken, maxHeight: 616, overflowY: "auto" }}>
            <VariantDetailPanel variant={selected} />
          </div>
        </div>
      )}
    </div>
  );
}