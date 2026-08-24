import React from "react";
import "../css/BioledgerSpinner.css";

/**
 * BioLedgerSpinner
 * Minimal, reusable loading indicator for BioLedger.
 * Motif: two strands crossing like a DNA double helix cross-section,
 * rendered as a restrained rotating pair of arcs rather than a literal helix.
 *
 * Usage:
 *   <BioLedgerSpinner />
 *   <BioLedgerSpinner size="sm" />
 *   <BioLedgerSpinner size="lg" label="Loading cases…" />
 *   <BioLedgerSpinner inline label="Saving" />
 *
 *   Centered in the middle of the viewport (e.g. initial app load):
 *     <BioLedgerSpinner fullScreen label="Loading BioLedger…" />
 *
 *   Centered in the middle of a parent container (e.g. a card or panel —
 *   give the parent position: relative):
 *     <div style={{ position: "relative", minHeight: 240 }}>
 *       <BioLedgerSpinner center size="lg" />
 *     </div>
 */

const SIZES = {
  sm: { box: 20, stroke: 2 },
  md: { box: 32, stroke: 2.5 },
  lg: { box: 48, stroke: 3 },
};

export default function BioLedgerSpinner({
  size = "md",
  label,
  inline = false,
  center = false,
  fullScreen = false,
  className = "",
}) {
  const { box, stroke } = SIZES[size] || SIZES.md;

  const Wrapper = inline && !center && !fullScreen ? "span" : "div";

  const positionClass = fullScreen
    ? "bl-spinner-wrap--fullscreen"
    : center
    ? "bl-spinner-wrap--center"
    : "";

  return (
    <Wrapper
      role="status"
      aria-live="polite"
      className={`bl-spinner-wrap ${inline && !center && !fullScreen ? "bl-spinner-wrap--inline" : ""} ${positionClass} ${className}`}
    >
      <svg
        width={box}
        height={box}
        viewBox="0 0 32 32"
        fill="none"
        className="bl-spinner"
        aria-hidden="true"
      >
        {/* base track: two faint counter-crossing strands */}
        <path
          d="M8 4 C 8 12, 24 12, 24 16 C 24 20, 8 20, 8 28"
          stroke="#DDE3E6"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        <path
          d="M24 4 C 24 12, 8 12, 8 16 C 8 20, 24 20, 24 28"
          stroke="#DDE3E6"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        {/* active strand: same path, drawn shorter and animated */}
        <path
          className="bl-spinner-arc"
          d="M8 4 C 8 12, 24 12, 24 16 C 24 20, 8 20, 8 28"
          stroke="#0F6E64"
          strokeWidth={stroke}
          strokeLinecap="round"
          pathLength="100"
        />
        <path
          className="bl-spinner-arc bl-spinner-arc--delay"
          d="M24 4 C 24 12, 8 12, 8 16 C 8 20, 24 20, 24 28"
          stroke="#12968A"
          strokeWidth={stroke}
          strokeLinecap="round"
          pathLength="100"
        />
      </svg>

      {label ? (
        <span className="bl-spinner-label">{label}</span>
      ) : (
        <span className="bl-sr-only">Loading</span>
      )}
    </Wrapper>
  );
}