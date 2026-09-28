import { T, panel } from "./variantTheme";

// Shown after a sample ID is found. The user picks which file to visualize;
// the backend only checks the germline/somatic path once a choice is made.
// The dialog stays open on error so the user can try the other type.
export default function SampleFileDialog({ sid, busy, error, onPick, onClose }) {
  if (!sid) return null;

  const btn = {
    padding: "10px 18px",
    borderRadius: 8,
    border: `1.5px solid ${T.border}`,
    background: T.surface,
    cursor: busy ? "wait" : "pointer",
    fontWeight: 700,
    fontFamily: T.sans,
    color: T.text,
  };

  return (
    <div
      onClick={busy ? undefined : onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ ...panel, padding: 24, minWidth: 340 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Sample {sid}</div>
        <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 16 }}>
          Which file do you want to visualize?
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button style={btn} disabled={busy} onClick={() => onPick("germline")}>Germline</button>
          <button style={btn} disabled={busy} onClick={() => onPick("somatic")}>Somatic</button>
        </div>

        {busy && (
          <div style={{ marginTop: 12, fontSize: 12, color: T.textMuted }}>Checking and loading…</div>
        )}
        {error && (
          <div style={{ marginTop: 12, fontSize: 13, color: "#b42318" }}>{error}</div>
        )}

        <button
          onClick={onClose}
          disabled={busy}
          style={{ ...btn, marginTop: 16, fontWeight: 600, fontSize: 12 }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}