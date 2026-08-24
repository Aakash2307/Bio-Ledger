import { useState, useMemo } from "react";
import BioledgerSpinner from "./BioledgerSpinner";
import { uploadVariantFile } from "../api";
import "../css/VariantVisualization.css";

// A starting point only — every field the backend returns is available
// via the "Columns" picker below. This list is not a judgment call
// about what's clinically important; it's just what's visible before
// you customize it.
const DEFAULT_VISIBLE_COLS = [
  "acmg", "REF", "ALT", "SYMBOL", "HGVSc", "HGVSp",
  "CHROM", "POS", "genotype", "zygosity", "gnomADe_AF",
];

const COLUMN_LABELS = {
  acmg: "ACMG", zygosity: "Zygosity", genotype: "Genotype",
  CHROM: "Chr", POS: "POS", REF: "Ref", ALT: "Alt",
  gnomADe_AF: "gnomAD AF", CLIN_SIG: "ClinVar CLIN_SIG",
};

function labelFor(col) {
  return COLUMN_LABELS[col] || col;
}

function formatValue(col, val) {
  if (val === null || val === undefined || val === "" || val === "-") return "-";
  if (typeof val === "number" && col.toLowerCase().includes("af")) return val.toFixed(6);
  return String(val);
}

export default function VariantVisualization() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null); // parsed response from /variants/upload
  const [search, setSearch] = useState("");
  const [impactFilter, setImpactFilter] = useState("ALL");
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [page, setPage] = useState(1);
  const [visibleCols, setVisibleCols] = useState(DEFAULT_VISIBLE_COLS);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const pageSize = 25;

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setPage(1);

    try {
      const data = await uploadVariantFile(file);
      setResult(data);
      if (data.variants?.length) {
        const available = Object.keys(data.variants[0]);
        setVisibleCols(DEFAULT_VISIBLE_COLS.filter((c) => available.includes(c)));
      }
    } catch (err) {
      setError(err.message || "Something went wrong while uploading.");
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  }

  // Returns to the original pre-upload state — clears the result/error
  // and resets all filters, search, columns, and pagination.
  function handleReset() {
    setResult(null);
    setError(null);
    setSearch("");
    setImpactFilter("ALL");
    setSelectedVariant(null);
    setPage(1);
    setVisibleCols(DEFAULT_VISIBLE_COLS);
    setShowColumnPicker(false);
  }

  const allColumns = useMemo(() => {
    if (!result?.variants?.length) return [];
    return Object.keys(result.variants[0]);
  }, [result]);

  // dynamic — whatever IMPACT values actually appear in this file,
  // not a hardcoded HIGH/MODERATE-only list
  const availableImpacts = useMemo(() => {
    if (!result?.variants?.length) return [];
    const IMPACT_ORDER = ["HIGH", "MODERATE", "LOW", "MODIFIER"];
    const present = new Set(result.variants.map((v) => v.IMPACT).filter(Boolean));
    return IMPACT_ORDER.filter((i) => present.has(i));
  }, [result]);

  const filteredVariants = useMemo(() => {
    if (!result?.variants) return [];
    let rows = result.variants;
    if (impactFilter !== "ALL") {
      rows = rows.filter((v) => v.IMPACT === impactFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (v) =>
          v.SYMBOL?.toLowerCase().includes(q) ||
          v.HGVSc?.toLowerCase().includes(q) ||
          v.HGVSp?.toLowerCase().includes(q) ||
          v.Existing_variation?.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [result, impactFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filteredVariants.length / pageSize));
  const pageRows = filteredVariants.slice((page - 1) * pageSize, page * pageSize);

  function toggleColumn(col) {
    setVisibleCols((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
  }

  return (
    <div className="variant-viz">
      <div className="variant-viz__header">
        <div>
          <h1>Variant Visualization</h1>
          <p className="variant-viz__subtitle">
            Upload a Germline, Somatic, or PRS results file to see it visualized.
          </p>
        </div>
        <div className="variant-viz__header-actions">
          {(result || error) && !loading && (
            <button
              type="button"
              className="variant-viz__back-btn"
              onClick={handleReset}
            >
              ← Back
            </button>
          )}
          <label className="variant-viz__upload-btn">
            {loading ? "Parsing…" : "Upload Sample File"}
            <input
              type="file"
              accept=".xlsx"
              onChange={handleFileChange}
              disabled={loading}
              hidden
            />
          </label>
        </div>
      </div>

      {loading && (
        <div className="variant-viz__loading">
          <BioledgerSpinner />
          <p>Parsing the file — full exome files (all impact levels) can take up to a minute and return a large dataset.</p>
        </div>
      )}

      {error && <div className="variant-viz__error">{error}</div>}

      {!loading && !result && !error && (
        <div className="variant-viz__empty">
          <p>No file uploaded yet.</p>
          <p className="variant-viz__empty-sub">
            Accepts Germline Results, Somatic Results, or PRS/Merged .xlsx files — the type is detected automatically.
          </p>
        </div>
      )}

      {result?.file_type === "prs" && (
        <PrsTable records={result.records} filename={result.filename} />
      )}

      {(result?.file_type === "germline" || result?.file_type === "somatic") && (
        <>
          <div className="variant-viz__summary">
            <span className="variant-viz__chip variant-viz__chip--muted">
              {result.filename} · {result.file_type === "germline" ? "Germline" : "Somatic"}
            </span>
            <span className="variant-viz__chip">
              Unique Genes <strong>{result.summary.unique_genes}</strong>
            </span>
            <span className="variant-viz__chip">
              Total Variants <strong>{result.summary.total_variants}</strong>
            </span>
            {Object.entries(result.summary.clin_sig_counts)
              .filter(([k]) => k !== "N/A")
              .map(([k, v]) => (
                <span key={k} className={`variant-viz__badge variant-viz__badge--${k.toLowerCase()}`}>
                  {k} {v}
                </span>
              ))}
            <span className="variant-viz__chip variant-viz__chip--zygosity">
              HET {result.summary.zygosity_counts.HET}
            </span>
            <span className="variant-viz__chip variant-viz__chip--zygosity">
              HOM {result.summary.zygosity_counts.HOM}
            </span>
          </div>

          <div className="variant-viz__toolbar">
            <input
              type="text"
              placeholder="Search gene, HGVSc, HGVSp, or rsID…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
            <select
              value={impactFilter}
              onChange={(e) => {
                setImpactFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="ALL">All Impacts</option>
              {availableImpacts.map((impact) => (
                <option key={impact} value={impact}>
                  {impact}
                </option>
              ))}
            </select>
            <div className="variant-viz__col-picker-wrap">
              <button
                type="button"
                className="variant-viz__col-picker-btn"
                onClick={() => setShowColumnPicker((s) => !s)}
              >
                Columns ({visibleCols.length}/{allColumns.length})
              </button>
              {showColumnPicker && (
                <div className="variant-viz__col-picker-panel">
                  <div className="variant-viz__col-picker-actions">
                    <button type="button" onClick={() => setVisibleCols(allColumns)}>
                      Show all
                    </button>
                    <button type="button" onClick={() => setVisibleCols(DEFAULT_VISIBLE_COLS)}>
                      Reset to default
                    </button>
                  </div>
                  {allColumns.map((col) => (
                    <label key={col} className="variant-viz__col-picker-item">
                      <input
                        type="checkbox"
                        checked={visibleCols.includes(col)}
                        onChange={() => toggleColumn(col)}
                      />
                      {labelFor(col)}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="variant-viz__table-wrap">
            <table className="variant-viz__table">
              <thead>
                <tr>
                  {visibleCols.map((col) => (
                    <th key={col}>{labelFor(col)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((v, i) => (
                  <tr
                    key={`${v.CHROM}-${v.POS}-${v.REF}-${v.ALT}-${i}`}
                    onClick={() => setSelectedVariant(v)}
                  >
                    {visibleCols.map((col) => (
                      <td key={col}>
                        {col === "acmg" ? (
                          <span className={`variant-viz__badge variant-viz__badge--${v.acmg.toLowerCase()}`}>
                            {v.acmg}
                          </span>
                        ) : col === "zygosity" ? (
                          <span className={`variant-viz__zyg variant-viz__zyg--${v.zygosity?.toLowerCase()}`}>
                            {v.zygosity}
                          </span>
                        ) : col === "SYMBOL" ? (
                          <span className="variant-viz__gene">{formatValue(col, v[col])}</span>
                        ) : col === "HGVSc" || col === "HGVSp" ? (
                          <span className="variant-viz__mono">{formatValue(col, v[col])}</span>
                        ) : (
                          formatValue(col, v[col])
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="variant-viz__pagination">
            <span>
              Page {page} of {totalPages} · {filteredVariants.length} variants
            </span>
            <div>
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Prev
              </button>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {selectedVariant && (
        <VariantDrawer variant={selectedVariant} onClose={() => setSelectedVariant(null)} />
      )}
    </div>
  );
}

// Renders EVERY field the backend returned, in the order it returned
// them — no curated subset, no hidden fields. This is deliberately
// generic instead of a hand-picked set of "Sections".
function VariantDrawer({ variant, onClose }) {
  const entries = Object.entries(variant);
  return (
    <div className="variant-drawer__overlay" onClick={onClose}>
      <div className="variant-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="variant-drawer__header">
          <div>
            <h2>Variant Details</h2>
            <span className="variant-drawer__coords">
              {variant.CHROM}:{variant.POS} {variant.REF}&gt;{variant.ALT}
            </span>
          </div>
          <button className="variant-drawer__close" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="variant-drawer__grid variant-drawer__grid--full">
          {entries.map(([col, val]) => (
            <div className="variant-drawer__field" key={col}>
              <span className="variant-drawer__field-label">{labelFor(col)}</span>
              <span className="variant-drawer__field-value">{formatValue(col, val)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PrsTable({ records, filename }) {
  return (
    <div>
      <div className="variant-viz__summary">
        <span className="variant-viz__chip variant-viz__chip--muted">{filename} · PRS</span>
        <span className="variant-viz__chip">
          Traits <strong>{records.length}</strong>
        </span>
      </div>
      <div className="variant-viz__table-wrap">
        <table className="variant-viz__table">
          <thead>
            <tr>
              <th>Sample</th>
              <th>Trait</th>
              <th>Score Type</th>
              <th>PRS</th>
              <th>Percentile</th>
              <th>Risk Variants</th>
              <th>Protective Variants</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r, i) => (
              <tr key={i}>
                <td>{r.Sample}</td>
                <td>{r["Reported Trait"]}</td>
                <td>{r["Score Type"]}</td>
                <td>{typeof r["Polygenic Risk Score"] === "number" ? r["Polygenic Risk Score"].toFixed(4) : "-"}</td>
                <td>{r.Percentile}</td>
                <td className="variant-viz__mono">{r["Risk Variants"]}</td>
                <td className="variant-viz__mono">{r["Protective Variants"]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}