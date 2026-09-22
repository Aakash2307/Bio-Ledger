import { useState } from "react";
import { T, btnBase, GENE_CATEGORY_META } from "./variantTheme";

const DETAIL_TABS = [
  "Overview",
  "Details",
  "Variant Description",
  "Flagging",
  "Viewer",
  "ACMG",
  "Similar Patients",
];

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

// HGVSc/HGVSp arrive as "<transcript or protein ID>:<c./p. notation>", e.g.
// "ENST00000379370.7:c.4298+3_4299-57del" or "ENSP00000368677.3:p.Val31Met".
// The Ensembl ID is redundant with NM_value/the gene symbol shown
// elsewhere; only the c./p. notation itself is useful here. Matches the
// c./p. portion directly (rather than just splitting on ":") so this
// still works if a value ever arrives without an ID prefix at all.
function formatHgvsNotation(raw, prefix) {
  if (raw == null || raw === "" || raw === "-") return null;
  const str = String(raw);
  const match = str.match(new RegExp(`${prefix}\\.[^\\s;]+`, "i"));
  if (match) return match[0];
  const idx = str.indexOf(":");
  return idx !== -1 ? str.slice(idx + 1) : str;
}

// A handful of raw pipeline fields use a bare "-" for "not applicable"
// rather than leaving the cell empty. DetailLine already falls back to
// "—" for anything falsy, but "-" itself is truthy, so it renders as a
// stray dash unless normalized to null first.
function dashToNull(value) {
  return value == null || value === "" || value === "-" ? null : value;
}

export default function VariantDetailPanel({ variant }) {
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
          {tab} — coming soon.
        </div>
      )}
    </div>
  );
}

function OverviewTab({ variant }) {
  const vf = variant.vf_pct != null ? Number(variant.vf_pct) : null;
  // variant_parser.py's FIELD_ALIASES renames the source
  // "Tumor_Total_Genotype_Depth" column to the canonical key "depth"
  // during parsing (falling back to DP / Total_Depth only if that column
  // isn't present) — so despite the label below, the value genuinely
  // lives under variant.depth, not a "tumor_total_genotype_depth" key.
  const genotypeDepth = dashToNull(variant.depth);
  const geneCatMeta = variant.gene_category ? GENE_CATEGORY_META[variant.gene_category] : null;

  return (
    <div>
      <div style={{ display: "flex", gap: 24, marginBottom: 26 }}>
        <FractionGauge value={vf} />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 10 }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 700, fontFamily: T.mono, color: T.text, lineHeight: 1 }}>{genotypeDepth ?? "—"}</div>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: T.textFaint, marginTop: 3 }}>Genotype depth</div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 20px", marginBottom: 26 }}>
        <DetailLine label="Chrom" value={variant.chrom} />
        <DetailLine label="Position" value={variant.pos} />
        <DetailLine label="rsID" value={variant.rsid} />
        {/* MANE Select transcript. Lives here rather than on the radar:
            it's a reference identifier, not a pathogenicity score, so it
            never had a meaningful "severity" to plot. */}
        <DetailLine label="NM_value" value={variant.mane_select ?? variant.MANE_SELECT} />
        <DetailLine label="HGVSc" value={formatHgvsNotation(variant.hgvsc ?? variant.HGVSc, "c")} />
        <DetailLine label="HGVSp" value={formatHgvsNotation(variant.hgvsp ?? variant.HGVSp, "p")} />
        <DetailLine label="Exon" value={dashToNull(variant.exon ?? variant.EXON)} />
        <DetailLine label="Intron" value={dashToNull(variant.intron ?? variant.INTRON)} />
        {/* Strand moved here from the Details tab's Population Variant
            Effect section — it's basic identity/orientation info about
            the call, not a population-level effect metric. */}
        <DetailLine label="Strand" value={dashToNull(variant.strand ?? variant.STRAND)} />
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
// already shown somewhere more specific. Overview covers: depth/VF%
// (gauge) — "depth" is variant_parser.py's canonical rename of the
// Tumor_Total_Genotype_Depth column, shown here as "Genotype depth" —
// chrom/pos/HGVSc/HGVSp/rsID/MANE Select/exon/intron/strand (identity
// grid), gene_category/gene_panels (Gene panel match), and SIFT/PolyPhen/
// AlphaMissense/REVEL/CADD (Predicted Impact). The compact list already
// covers ACMG classification and gene symbol. "variant_id" and
// "pathogenicity_class" are also excluded — they're internal, app-computed
// values, not columns the pipeline itself produced. The raw VCF INFO
// field is excluded entirely (no dedicated view for it anymore).
const DETAILS_EXCLUDED_FIELDS = new Set([
  "chrom", "pos", "ref", "alt", "depth", "vf_pct", "rsid",
  "hgvsc", "HGVSc", "hgvsp", "HGVSp",
  "exon", "EXON", "intron", "INTRON",
  "sift", "polyphen", "alphamissense_class", "alphamissense_pathogenicity",
  "revel_score", "cadd_phred", "mane_select", "MANE_SELECT",
  "variant_id", "pathogenicity_class",
  "gene_category", "gene_panels",
  "acmg_classification", "gene", "clin_sig",
  "info", "INFO", "Info",
  // Consequence and variant type are already shown in the compact list —
  // dropped from the Details tab (Population Variant Effect / Additional
  // Details respectively) so they aren't duplicated here.
  "consequence", "varient_type",
]);

// Fields dropped from the Details tab entirely, regardless of section.
// Unlike DETAILS_EXCLUDED_FIELDS above (matched against the raw object
// key, since those are fields this file already reads directly under a
// known exact key), these are matched against the *normalized* key —
// same normalizeFieldKey() used for section classification below — so the
// exclusion holds no matter which casing/underscore convention the
// pipeline happens to export a given column under.
const DETAILS_EXCLUDED_FIELDS_NORMALIZED = new Set([
  // Variant Identity: HGNC ID / Symbol source
  "hgncid", "symbolsource",
  // Population Variant Effect: Amino acids / APPRIS / CADD raw / cDNA
  // position / CDS position / Codons.
  "aminoacids", "appris", "caddraw", "cdnaposition", "cdsposition", "codons",
  // Population Variant Effect: dropped entirely per current spec —
  // Distance, HGVS offset, Impact, Location, MANE Plus Clinical, Motif
  // name/pos/score change, Protein position, SpliceAI DS AG/AL/DG/DL,
  // SpliceAI symbol, Transcription factors, TSL.
  "distance", "hgvsoffset", "impact", "location", "maneplusclinical",
  "motifname", "motifpos", "motifscorechange", "proteinposition",
  "spliceaidsag", "spliceaidsal", "spliceaidsdg", "spliceaidsdl", "spliceaisymbol",
  "transcriptionfactors", "tsl",
  // Strand now lives in the Overview identity grid instead.
  "strand",
  // Filter dropped entirely — no longer shown even in Additional Details.
  "filter",
]);

// Renames a handful of raw field names to clearer labels on the Details
// tab tiles, keyed by the same normalized form used for classification.
// Everything not listed here keeps the default "key with underscores
// turned to spaces" label.
const FIELD_LABEL_OVERRIDES = {
  gene1: "Gene id",
  feature: "Transcript id",
};

// Groups the Details tab's fields into labeled sections (à la vgen's
// Overview: Variant Identity / Population Variant Effect / Clinical
// Context / Sequencing Confidence / Genotype Info), instead of one long
// alphabetical list. Matching is done on a normalized key (lowercased,
// punctuation/underscores stripped) rather than the raw key string, so it
// survives whatever casing convention a given field happens to use
// ("AF_1000G" vs "af_1000g" vs "Af1000G" all normalize the same).
//
// Any field not covered by a set below still renders — it falls into
// "Additional Details" rather than disappearing — so a new pipeline
// column never silently gets lost; it just shows up unsectioned until
// someone adds its key here.
function normalizeFieldKey(key) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const DETAIL_SECTIONS = [
  {
    title: "Variant Identity",
    // hgncid/symbolsource removed here — they're now dropped entirely via
    // DETAILS_EXCLUDED_FIELDS_NORMALIZED rather than just re-sectioned.
    keys: new Set(["biotype", "feature", "featuretype", "gene1", "flags"]),
  },
  {
    title: "Population Variant Effect",
    // appris/cdnaposition/cdsposition/codons/aminoacids/caddraw removed
    // here — dropped entirely via DETAILS_EXCLUDED_FIELDS_NORMALIZED.
    // consequence removed — dropped entirely via DETAILS_EXCLUDED_FIELDS
    // (already shown in the compact list). Distance, HGVS offset, Impact,
    // Location, MANE Plus Clinical, Motif name/pos/score change, Protein
    // position, SpliceAI DS AG/AL/DG/DL, SpliceAI symbol, Transcription
    // factors, and TSL are all dropped entirely (see
    // DETAILS_EXCLUDED_FIELDS_NORMALIZED). Strand moved to the Overview
    // tab. LRT pred moved to "In silico values" below, alongside the rest
    // of the pathogenicity-predictor calls (MutationTaster/
    // MutationAssessor/FATHMM/PROVEAN/MetaLR/DEOGEN2/ClinPred preds,
    // SpliceAI_DP_* scores).
    keys: new Set([
      "exon", "intron",
      "gnomadaf", "gnomadeafraf", "gnomadeamraf", "gnomadeasjaf", "gnomadeeasaf",
      "gnomadefinaf", "gnomadenfeaf", "gnomadesasaf", "af1000g", "indgenomeaf",
    ]),
  },
  {
    title: "In silico values",
    // Pathogenicity-predictor calls and SpliceAI donor/acceptor-gain/loss
    // scores — kept together here rather than scattered across Population
    // Variant Effect. LRT pred now lives here too, alongside the other
    // predictor calls, rather than in Population Variant Effect.
    keys: new Set([
      "lrtpred", "mutationtasterpred", "mutationassessorpred", "fathmmpred", "proveanpred",
      "metalrpred", "deogen2pred", "clinpredpred",
      "spliceaidpag", "spliceaidpal", "spliceaidpdg", "spliceaidpdl",
    ]),
  },
  {
    title: "Clinical Context",
    keys: new Set(["phenotypes", "cosmicid", "disgenet", "mastermindmmid3", "intogen", "pubmed", "acmgcriteria"]),
  },
  {
    title: "Sequencing Confidence",
    // Filter and Tumor alt allele depth removed from this section — Filter
    // is dropped entirely (see DETAILS_EXCLUDED_FIELDS_NORMALIZED), and
    // Tumor alt allele depth is kept in Additional Details instead of
    // appearing here.
    keys: new Set(["ad", "dp", "gq", "qual", "pl", "somatic", "tumorrefalleledepth"]),
  },
  {
    title: "Genotype Information",
    keys: new Set(["gt", "pheno", "highinfpos"]),
  },
];
const OTHER_SECTION_TITLE = "Additional Details";

function classifyField(key) {
  const norm = normalizeFieldKey(key);
  for (const section of DETAIL_SECTIONS) {
    if (section.keys.has(norm)) return section.title;
  }
  return OTHER_SECTION_TITLE;
}

// Everything else the pipeline provides for this variant — dynamically
// reflects on whatever fields actually came back for this row, rather than
// a hand-maintained list. Both Germline (~98 columns) and Somatic (~112,
// including ClinVar/CIViC/AMP tiering that Germline doesn't have) exports
// are covered automatically this way; only the grouping (via
// classifyField) is hand-maintained, the field discovery itself isn't.
function DetailsTab({ variant }) {
  const entries = Object.entries(variant)
    .filter(([key]) => !DETAILS_EXCLUDED_FIELDS.has(key))
    .filter(([key]) => !DETAILS_EXCLUDED_FIELDS_NORMALIZED.has(normalizeFieldKey(key)))
    .sort(([a], [b]) => a.localeCompare(b));

  if (entries.length === 0) {
    return (
      <div style={{ textAlign: "center", color: T.textFaint, fontSize: 13, padding: "36px 0" }}>
        No additional fields for this variant.
      </div>
    );
  }

  // Bucket fields into sections, preserving DETAIL_SECTIONS order, with
  // "Additional Details" always last and only shown if non-empty.
  const grouped = new Map();
  for (const section of DETAIL_SECTIONS) grouped.set(section.title, []);
  grouped.set(OTHER_SECTION_TITLE, []);
  for (const entry of entries) {
    const title = classifyField(entry[0]);
    grouped.get(title).push(entry);
  }

  const sections = [...grouped.entries()].filter(([, fields]) => fields.length > 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {sections.map(([title, fields]) => (
        <DetailsSection key={title} title={title} fields={fields} />
      ))}
    </div>
  );
}

// One labeled, counted card per section — mirrors vgen's "Variant
// Identity · 7 fields" pattern, with each field as its own small boxed
// tile rather than a flat underlined row, so a section with many fields
// (Population Variant Effect can easily be 30+) still scans as a grid
// rather than a wall of text.
function DetailsSection({ title, fields }) {
  return (
    <div style={{ border: `1px solid ${T.borderSoft}`, borderRadius: 10, padding: "14px 14px 12px", background: T.surface }}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{title}</div>
        <div style={{ fontSize: 10.5, color: T.textFaint, marginTop: 1 }}>
          {fields.length} field{fields.length !== 1 ? "s" : ""}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {fields.map(([key, value]) => (
          <div
            key={key}
            style={{
              border: `1px solid ${T.borderSoft}`, borderRadius: 7, padding: "7px 10px",
              background: T.surfaceSunken,
            }}
          >
            <div style={{ fontSize: 9.5, fontWeight: 700, color: T.textFaint, letterSpacing: 0.3, marginBottom: 2 }}>
              {FIELD_LABEL_OVERRIDES[normalizeFieldKey(key)] || key.replace(/_/g, " ")}
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: T.text, fontFamily: T.mono, wordBreak: "break-word" }}>
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
// Five axes: SIFT, PolyPhen, a single combined AlphaMissense call, REVEL,
// and CADD — every one of them an actual pathogenicity predictor, so the
// shape the polygon traces means something uniformly. (MANE Select used to
// sit here as a 6th axis, but a transcript ID has no severity to plot; it
// now lives in the Overview "Variant call" grid as NM_value.)
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

// AlphaMissense reports two halves of one call — a categorical class
// ("likely_pathogenic") and the underlying continuous score
// (0.87) — which used to occupy two separate radar axes. Merged into one
// here: the score is the more precise signal so it drives severity when
// present, falling back to the class label if the pipeline only supplied
// one of the two. Display combines both, e.g. "Likely Pathogenic (0.87)".
function combineAlphaMissense(variant) {
  const cls = variant.alphamissense_class;
  const path = variant.alphamissense_pathogenicity;
  const hasCls = cls != null && cls !== "" && cls !== "-";
  const hasPath = path != null && path !== "" && path !== "-";

  const severity = hasPath
    ? predictorSeverity("alphamissense_pathogenicity", path)
    : predictorSeverity("alphamissense_class", cls);

  let valueText;
  if (hasCls && hasPath) {
    valueText = `${splitPredictionValue(cls).main} (${formatScoreValue(path)})`;
  } else if (hasCls) {
    valueText = splitPredictionValue(cls).main;
  } else if (hasPath) {
    valueText = formatScoreValue(path);
  } else {
    valueText = "N/A";
  }
  return { severity, valueText };
}

// True "web view" radar/spider chart — five axes. Shape area gives an
// at-a-glance read of overall impact severity; each vertex is individually
// color-coded by its own severity so no single axis gets lost in an
// averaged shape. Labels sit OUTSIDE the plot area at fixed short
// abbreviations (not the raw values) specifically to avoid overlap —
// exact values live directly under the label instead.
const RADAR_AXES = [
  { key: "sift", short: "SIFT", type: "field" },
  { key: "polyphen", short: "PolyPhen", type: "field" },
  { key: "alphamissense", short: "AlphaMissense", type: "alphamissense" },
  { key: "revel_score", short: "REVEL", type: "field" },
  { key: "cadd_phred", short: "CADD", type: "field" },
];

// Severity -> how far out on its axis the vertex sits (0-1 of max radius).
// "na" sits just barely off-center rather than at 0, so a variant with no
// predictions at all still traces a visible (tiny) pentagon instead of a
// single invisible point.
const SEVERITY_MAGNITUDE = { danger: 1, warn: 0.62, safe: 0.3, na: 0.08 };

function PredictionRadar({ variant }) {
  const size = 260;
  const center = size / 2;
  const maxRadius = 62;
  const n = RADAR_AXES.length;

  const axisData = RADAR_AXES.map((axis, i) => {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;

    let severity, valueText;
    if (axis.type === "alphamissense") {
      const combined = combineAlphaMissense(variant);
      severity = combined.severity;
      valueText = combined.valueText;
    } else {
      const rawValue = variant[axis.key];
      severity = predictorSeverity(axis.key, rawValue);
      const { main, sub } = splitPredictionValue(rawValue);
      valueText = sub ? `${main} (${sub})` : main;
    }

    const dotColor = SEVERITY_COLORS[severity];
    const textColor = severity === "na" ? T.na : SEVERITY_COLORS[severity];
    const magnitude = SEVERITY_MAGNITUDE[severity];

    return {
      ...axis,
      severity,
      valueText,
      dotColor,
      textColor,
      angle,
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
        <circle key={a.key} cx={a.vertex.x} cy={a.vertex.y} r="3.5" fill={a.dotColor} stroke={T.surfaceSunken} strokeWidth="1.2" />
      ))}
      {axisData.map((a) => {
        const cos = Math.cos(a.angle);
        const anchor = cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle";
        return (
          <text key={a.key} x={a.labelPos.x} y={a.labelPos.y} textAnchor={anchor} fontFamily={T.sans}>
            <tspan x={a.labelPos.x} dy="-4" fontSize="9.5" fontWeight="700" fill={T.textFaint}>
              {a.short}
            </tspan>
            <tspan x={a.labelPos.x} dy="13" fontSize="11" fontWeight="700" fill={a.textColor} fontFamily={T.mono}>
              {a.valueText}
            </tspan>
          </text>
        );
      })}
    </svg>
  );
}