import { useEffect, useRef, useState } from "react";
import igv from "igv";
import "../../css/IgvViewer.css";

// Genome build is configurable (VITE_IGV_GENOME). The pipeline is GRCh38.
const GENOME = import.meta.env.VITE_IGV_GENOME || "hg38";
const GENOME_LABEL = GENOME === "hg38" ? "GRCh38 / hg38" : GENOME;
// Empty = same-origin relative URLs (Vite proxy). Set it if /api isn't proxied.
const API_BASE = import.meta.env.VITE_API_BASE || "";
const FLANK = 100;               // bp either side of the variant
const TRACK_HEIGHT = 300;        // reads track height when docked
const FULLSCREEN_RESERVED = 400; // px kept for toolbar, ruler, gene track (bigger = shorter reads track)
const MAX_ALLELE_IN_FILENAME = 20; // long indel alleles are truncated in the file name

// ── helpers ──────────────────────────────────────────────────────────────
function normalizeChrom(chrom, chrPrefix) {
  const raw = String(chrom ?? "").trim();
  if (!raw) return null;
  const base = raw.replace(/^chr/i, "");
  if (chrPrefix == null) return raw;
  if (chrPrefix) return /^(m|mt)$/i.test(base) ? "chrM" : `chr${base}`;
  return /^m$/i.test(base) ? "MT" : base;
}

function locusFor(chrom, pos, refAllele, chrPrefix) {
  const p = Number(pos);
  const name = normalizeChrom(chrom, chrPrefix);
  if (!name || !Number.isFinite(p)) return null;
  const span = Math.max(String(refAllele ?? "").length, 1);
  return `${name}:${Math.max(1, p - FLANK)}-${p + span - 1 + FLANK}`;
}

const stripChr = (c) => String(c ?? "").replace(/^chr/i, "").toLowerCase();
const fmt = (n) => Math.round(n).toLocaleString("en-US");
const viewLabel = (v) => (v ? `${v.chr}:${fmt(v.start + 1)}-${fmt(v.end)}` : "");

// Make a value safe for use inside a file name (no spaces, slashes, commas, etc.).
function safePart(value, maxLen = 60) {
  const s = String(value ?? "").trim().replace(/[^\w.-]+/g, "_").slice(0, maxLen);
  return s || "NA";
}

// BioLedger_{sampleId}_{chrom}_{position}_{REF}_{ALT}.svg
function svgFilename(sampleId, chrom, pos, refAllele, altAllele) {
  return [
    "BioLedger",
    safePart(sampleId),
    safePart(chrom),
    safePart(pos),
    safePart(refAllele, MAX_ALLELE_IN_FILENAME),
    safePart(altAllele, MAX_ALLELE_IN_FILENAME),
  ].join("_") + ".svg";
}

async function errorDetail(res) {
  const body = await res.json().catch(() => ({}));
  return typeof body.detail === "string" ? body.detail : "";
}

function Icon({ d, size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
const ICON = {
  dna: "M7 3c0 6 10 6 10 12s-10 6-10 6M17 3c0 6-10 6-10 12M9 7h6M9 17h6",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  expand: "M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7",
  collapse: "M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7",
  target: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  image: "M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6",
  check: "M5 12l5 5L20 7",
};

// ── presentational pieces ────────────────────────────────────────────────
function Alleles({ refAllele, altAllele }) {
  if (!refAllele || !altAllele) return <>—</>;
  const cut = (s) => (String(s).length > 14 ? `${String(s).slice(0, 14)}…` : s);
  return <span title={`${refAllele} → ${altAllele}`}>{cut(refAllele)} → {cut(altAllele)}</span>;
}

function GenomeViewerHeader({
  sampleId, chrom, pos, refAllele, altAllele, query, setQuery, onEdit, onSearch, searchError,
  spanBp, canZoom, canSvg, onZoomIn, onZoomOut, onCenter, onCopy, copied, onSvg, maximized, onToggleMax, ready,
}) {
  return (
    <div className="gv-head">
      <div className="gv-title"><Icon d={ICON.dna} size={16} /> Genome Viewer</div>
      <span className="gv-chip gv-chip--accent" title="Sample">{sampleId}</span>
      <span className="gv-chip" title="Variant position">{chrom}:{fmt(Number(pos) || 0)}</span>
      <span className="gv-chip" title="REF → ALT"><Alleles refAllele={refAllele} altAllele={altAllele} /></span>

      <form className="gv-search" onSubmit={(e) => { e.preventDefault(); onSearch(); }} role="search">
        <Icon d={ICON.search} />
        <input
          value={query}
          disabled={!ready}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => onEdit(true)}
          onBlur={() => onEdit(false)}
          placeholder="chr9:33,111,150-33,111,991 or gene symbol"
          aria-label="Genomic location"
          spellCheck={false}
        />
        <button type="submit" className="gv-btn gv-btn--primary" disabled={!ready} style={{ height: 22 }}>Go</button>
      </form>

      <div className="gv-tools">
        <button className="gv-btn gv-btn--icon" onClick={onZoomOut} disabled={!ready || !canZoom} title="Zoom out"><Icon d={ICON.minus} /></button>
        <span className="gv-span" title="Width of the current view">{spanBp ? `${fmt(spanBp)} bp` : "—"}</span>
        <button className="gv-btn gv-btn--icon" onClick={onZoomIn} disabled={!ready || !canZoom} title="Zoom in"><Icon d={ICON.plus} /></button>
        <div className="gv-sep" />
        <button className="gv-btn" onClick={onCenter} disabled={!ready} title={`Return to the variant (±${FLANK} bp)`}>
          <Icon d={ICON.target} /> Center variant
        </button>
        <span className="gv-chip" title="Reference genome (fixed for this viewer)">{GENOME_LABEL}</span>
        <div className="gv-sep" />
        <button className="gv-btn gv-btn--icon" onClick={onCopy} disabled={!ready} title={copied ? "Copied" : "Copy current locus"}>
          <Icon d={copied ? ICON.check : ICON.copy} />
        </button>
        <button className="gv-btn gv-btn--icon" onClick={onSvg} disabled={!ready || !canSvg} title="Save current view as SVG">
          <Icon d={ICON.image} />
        </button>
        <button className="gv-btn" onClick={onToggleMax} title={maximized ? "Exit full screen (Esc)" : "Full screen"}>
          <Icon d={maximized ? ICON.collapse : ICON.expand} /> {maximized ? "Close" : "Fullscreen"}
        </button>
      </div>
      {searchError && <div className="gv-err-inline" role="alert">{searchError}</div>}
    </div>
  );
}

function VariantSummary({ sampleId, chrom, pos, refAllele, altAllele, depth }) {
  const hasDepth = depth != null && depth !== "" && depth !== "-" && Number.isFinite(Number(depth));
  const cells = [
    ["Variant", sampleId, false, true],
    ["Location", `${chrom}:${fmt(Number(pos) || 0)}`, true, false],
    ["Alleles", <Alleles key="a" refAllele={refAllele} altAllele={altAllele} />, true, false],
    ["Genome", GENOME_LABEL, false, false],
    ["Region", `±${FLANK} bp`, false, false],
    ["Depth (called)", hasDepth ? `${fmt(Number(depth))}×` : "—", true, false],
  ];
  return (
    <div className="gv-strip">
      {cells.map(([label, value, mono, sel]) => (
        <div key={label} className={`gv-cell${sel ? " gv-cell--sel" : ""}`}>
          <div className="gv-label">{label}</div>
          <div className={`gv-value${mono ? " gv-mono" : ""}`}>{value}</div>
        </div>
      ))}
    </div>
  );
}

function GenomeViewerStatusBar({ sampleId, view, ready }) {
  return (
    <div className="gv-status">
      <span className={ready ? "ok" : ""}>{ready && <Icon d={ICON.check} size={12} />} BAM {ready ? "loaded" : "pending"}</span>
      <span className={ready ? "ok" : ""}>{ready && <Icon d={ICON.check} size={12} />} BAI {ready ? "indexed" : "pending"}</span>
      <span>Reference: <b style={{ color: "#0F172A", fontWeight: 600 }}>{GENOME_LABEL}</b></span>
      <span>Reads: {sampleId}</span>
      <span className="gv-mono" style={{ fontFamily: "var(--gv-mono)" }}>{view ? viewLabel(view) : "—"}</span>
    </div>
  );
}

const STEPS = ["Requesting alignment session", "Loading BAM and index", "Initializing genome reference"];

function ViewerLoadingState({ phase }) {
  return (
    <div className="gv-state" role="status" aria-live="polite">
      <div className="gv-card">
        <h3>Genome Viewer</h3>
        <p>Preparing alignment data…</p>
        <ul className="gv-steps">
          {STEPS.map((label, i) => (
            <li key={label} className={i < phase ? "done" : ""}>
              {i < phase ? <Icon d={ICON.check} /> : i === phase ? <span className="gv-spinner" /> : <span className="gv-dot" />}
              {label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const ERROR_COPY = {
  "no-bam": { title: "Alignment data unavailable", body: "No BAM file was found for this sample.", warn: true },
  unauthorised: { title: "Access denied", body: "You are not authorised to view this sample's reads.", warn: true },
  error: { title: "Unable to load alignment data", body: "Something went wrong while starting the viewer.", warn: false },
};

function ViewerErrorState({ status, detail, onRetry }) {
  const c = ERROR_COPY[status] || ERROR_COPY.error;
  return (
    <div className="gv-state" role="alert">
      <div className={`gv-card ${c.warn ? "gv-card--warn" : "gv-card--err"}`}>
        <h3>{c.title}</h3>
        <p>{c.body}{detail ? <><br /><span className="gv-mono" style={{ fontFamily: "var(--gv-mono)", fontSize: 11.5 }}>{detail}</span></> : null}</p>
        <button className="gv-btn" onClick={onRetry}>Retry</button>
      </div>
    </div>
  );
}

// ── main component ───────────────────────────────────────────────────────
// `refAllele` / `altAllele` rather than `ref` / `alt`: `ref` is reserved by React.
// `depth` is optional (the pipeline's called depth for this variant).
export default function IgvViewer({ sampleId, chrom, pos, refAllele, altAllele, depth }) {
  const containerRef = useRef(null);
  const stageRef = useRef(null);
  const browserRef = useRef(null);
  const chrPrefixRef = useRef(null);
  const lastLocusRef = useRef(null);
  const editingRef = useRef(false);
  const variantRef = useRef({ chrom, pos, refAllele });

  const [state, setState] = useState({ status: "loading", detail: "", phase: 0 });
  const [attempt, setAttempt] = useState(0);
  const [maximized, setMaximized] = useState(false);
  const [view, setView] = useState(null);          // { chr, start, end } of the current IGV view (start 0-based)
  const [vp, setVp] = useState(null);              // { left, width } of IGV's data viewport inside the stage
  const [query, setQuery] = useState("");
  const [searchError, setSearchError] = useState("");
  const [copied, setCopied] = useState(false);
  const { status, detail, phase } = state;
  const ready = status === "ready";

  useEffect(() => { variantRef.current = { chrom, pos, refAllele }; }, [chrom, pos, refAllele]);

  // Measure where IGV draws its data (excludes its gutters/scrollbar) so the marker lines up.
  const measureViewport = () => {
    const el = containerRef.current?.querySelector(".igv-viewport");
    const stage = stageRef.current;
    if (!el || !stage) return;
    const a = el.getBoundingClientRect();
    const b = stage.getBoundingClientRect();
    const next = { left: Math.round(a.left - b.left), width: Math.round(a.width) };
    setVp((prev) => (prev && prev.left === next.left && prev.width === next.width ? prev : next));
  };

  // Create the browser ONCE per sample (parent passes key={sampleId}); re-runs only on Retry.
  // Deferred a tick so StrictMode's mount -> cleanup -> mount only initializes once.
  useEffect(() => {
    let cancelled = false;
    let created = null;

    const init = async () => {
      setState({ status: "loading", detail: "", phase: 0 });
      try {
        const res = await fetch(`${API_BASE}/api/samples/${encodeURIComponent(sampleId)}/igv-session`, { method: "POST" });
        if (cancelled) return;
        if (!res.ok) {
          const d = await errorDetail(res);
          if (cancelled) return;
          if (res.status === 404) setState({ status: "no-bam", detail: d, phase: 0 });
          else if (res.status === 401 || res.status === 403) setState({ status: "unauthorised", detail: d, phase: 0 });
          else setState({ status: "error", detail: d || `Server returned ${res.status}`, phase: 0 });
          return;
        }
        const session = await res.json();
        if (cancelled) return;
        setState({ status: "loading", detail: "", phase: 1 });

        chrPrefixRef.current = session.chr_prefix;
        const v = variantRef.current;
        const locus = locusFor(v.chrom, v.pos, v.refAllele, session.chr_prefix);

        setState({ status: "loading", detail: "", phase: 2 });
        const browser = await igv.createBrowser(containerRef.current, {
          genome: GENOME,
          ...(locus ? { locus } : {}),
          showNavigation: false,        // the app toolbar above replaces IGV's own navbar
          showCenterGuide: true,
          tracks: [{
            type: "alignment",
            format: "bam",              // required: the URL has a query string
            name: `${sampleId} reads`,
            url: `${API_BASE}${session.bam_url}`,
            indexURL: `${API_BASE}${session.bai_url}`,
            height: TRACK_HEIGHT,
          }],
        });
        if (cancelled) { igv.removeBrowser(browser); return; }

        // Keep the locus box, status bar and marker in sync with panning/zooming.
        try {
          browser.on?.("locuschange", (frames) => {
            const f = Array.isArray(frames) ? frames[0] : null;
            if (!f || !Number.isFinite(f.start) || !Number.isFinite(f.end)) return;
            setView((prev) =>
              prev && prev.chr === f.chr && Math.round(prev.start) === Math.round(f.start) && Math.round(prev.end) === Math.round(f.end)
                ? prev : { chr: f.chr, start: f.start, end: f.end });
            requestAnimationFrame(measureViewport);
          });
        } catch (err) { console.error("IGV locuschange hook failed:", err); }

        created = browser;
        browserRef.current = browser;
        lastLocusRef.current = locus;
        setState({ status: "ready", detail: "", phase: 3 });
        requestAnimationFrame(measureViewport);
      } catch (err) {
        if (cancelled) return;
        console.error("IGV init failed:", err);
        setState({ status: "error", detail: err?.message || "", phase: 0 });
      }
    };

    const timer = setTimeout(init, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (created) igv.removeBrowser(created);
      browserRef.current = null;
      setView(null);
      setVp(null);
    };
  }, [sampleId, attempt]);

  // Variant changed -> move the existing browser; never recreate it.
  useEffect(() => {
    const browser = browserRef.current;
    if (!ready || !browser) return;
    const locus = locusFor(chrom, pos, refAllele, chrPrefixRef.current);
    if (!locus || locus === lastLocusRef.current) return;
    lastLocusRef.current = locus;
    browser.search(locus).catch((err) => console.error("IGV navigation failed:", err));
  }, [chrom, pos, refAllele, ready]);

  // Keep the locus box showing the live view unless the analyst is typing in it.
  useEffect(() => {
    if (view && !editingRef.current) setQuery(viewLabel(view));
  }, [view]);

  // Fullscreen: Esc exits, page scroll locked.
  useEffect(() => {
    if (!maximized) return;
    const onKey = (e) => { if (e.key === "Escape") setMaximized(false); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [maximized]);

  // Re-fit IGV when the container width changes; always re-measure the marker area.
  useEffect(() => {
    const el = containerRef.current;
    if (!ready || !el) return;
    let raf = 0;
    let lastWidth = el.clientWidth;
    const refit = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const w = el.clientWidth;
        if (w !== lastWidth) {
          lastWidth = w;
          try { browserRef.current?.resize?.(); } catch (err) { console.error("IGV resize failed:", err); }
          window.dispatchEvent(new Event("resize"));
        }
        measureViewport();
      });
    };
    const ro = new ResizeObserver(refit);
    ro.observe(el);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, [ready]);

  // Taller reads track in fullscreen, back to TRACK_HEIGHT when restored.
  useEffect(() => {
    if (!ready) return;
    const height = maximized ? Math.max(TRACK_HEIGHT, window.innerHeight - FULLSCREEN_RESERVED) : TRACK_HEIGHT;
    const t = setTimeout(() => {
      try {
        (browserRef.current?.trackViews || [])
          .filter((tv) => tv.track?.type === "alignment")
          .forEach((tv) => { tv.track.height = height; tv.setTrackHeight?.(height, true); });
      } catch (err) { console.error("IGV track height failed:", err); }
    }, 120);
    return () => clearTimeout(t);
  }, [maximized, ready]);

  // ── toolbar actions (each calls a real IGV method) ──
  const browser = browserRef.current;
  const canZoom = ready && typeof browser?.zoomIn === "function" && typeof browser?.zoomOut === "function";
  const canSvg = ready && (typeof browser?.toSVG === "function" || typeof browser?.saveSVGtoFile === "function");

  const goTo = (locus) => {
    setSearchError("");
    return browserRef.current?.search(locus).catch((err) => {
      setSearchError(err?.message ? `Could not go to "${locus}": ${err.message}` : `Could not go to "${locus}"`);
    });
  };
  const onSearch = () => { const q = query.trim(); if (q) goTo(q); };
  const onCenter = () => {
    const locus = locusFor(chrom, pos, refAllele, chrPrefixRef.current);
    if (locus) { lastLocusRef.current = locus; goTo(locus); }
  };
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(viewLabel(view) || query);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) { console.error("Copy failed:", err); }
  };
  // Saves as: BioLedger_{sampleId}_{chrom}_{position}_{REF}_{ALT}.svg
  const onSvg = async () => {
    const b = browserRef.current;
    if (!b) return;
    const filename = svgFilename(sampleId, chrom, pos, refAllele, altAllele);
    try {
      if (typeof b.toSVG === "function") {
        // Build the download ourselves so the file name is exactly what we choose.
        const svg = await b.toSVG();
        const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        // This IGV build takes the file name as a plain string, not an object.
        b.saveSVGtoFile(filename);
      }
    } catch (err) { console.error("SVG export failed:", err); }
  };

  // Variant marker: placed from the variant's true coordinate within the live view.
  let marker = null;
  if (ready && view && vp && Number.isFinite(Number(pos)) && stripChr(view.chr) === stripChr(chrom)) {
    const p0 = Number(pos) - 1;
    const span = view.end - view.start;
    if (span > 0 && p0 + 1 >= view.start && p0 <= view.end) {
      const px = vp.width / span;
      marker = { left: vp.left + (p0 - view.start) * px, width: Math.max(2, px) };
    }
  }

  return (
    <div className={`gv${maximized ? " gv--max" : ""}`}>
      <GenomeViewerHeader
        sampleId={sampleId} chrom={chrom} pos={pos} refAllele={refAllele} altAllele={altAllele}
        query={query} setQuery={setQuery} onEdit={(v) => { editingRef.current = v; if (!v && view) setQuery(viewLabel(view)); }}
        onSearch={onSearch} searchError={searchError}
        spanBp={view ? view.end - view.start : null} canZoom={canZoom} canSvg={canSvg}
        onZoomIn={() => browserRef.current?.zoomIn()} onZoomOut={() => browserRef.current?.zoomOut()}
        onCenter={onCenter} onCopy={onCopy} copied={copied} onSvg={onSvg}
        maximized={maximized} onToggleMax={() => setMaximized((m) => !m)} ready={ready}
      />
      <VariantSummary sampleId={sampleId} chrom={chrom} pos={pos} refAllele={refAllele} altAllele={altAllele} depth={depth} />

      <div className="gv-caption">
        Read alignments <b>{sampleId} reads</b> <span className="gv-chip">BAM</span>
      </div>

      <div className="gv-stage" ref={stageRef}>
        <div ref={containerRef} className="gv-igv" />
        {marker && (
          <div className="gv-marker" style={{ left: marker.left - marker.width / 2, width: marker.width }} aria-hidden="true">
            <i /><span>VARIANT</span>
          </div>
        )}
        {status === "loading" && <ViewerLoadingState phase={phase} />}
        {(status === "no-bam" || status === "unauthorised" || status === "error") && (
          <ViewerErrorState status={status} detail={detail} onRetry={() => setAttempt((a) => a + 1)} />
        )}
      </div>

      <GenomeViewerStatusBar sampleId={sampleId} view={view} ready={ready} />
    </div>
  );
}