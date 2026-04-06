import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getPatientDetails, updatePatientWithSample } from "../api";
import logo from "../assets/tzarnewlogo.png";

// ─── Status config ────────────────────────────────────────────────────────────
const statusConfig = {
  New:           { bg: "#e8f8f0", color: "#2d9e6b", border: "#b3e8cf" },
  "In Progress": { bg: "#fff8e8", color: "#c8820a", border: "#f5d98a" },
  Completed:     { bg: "#eaf2fb", color: "#2e72b8", border: "#b3d1f0" },
  Active:        { bg: "#e8f8f0", color: "#2d9e6b", border: "#b3e8cf" },
  Inactive:      { bg: "#f1f5f9", color: "#64748b", border: "#e2e8f0" },
  Done:          { bg: "#eaf2fb", color: "#2e72b8", border: "#b3d1f0" },
  Exhausted:     { bg: "#fef2f2", color: "#dc2626", border: "#fecaca" },
};

function StatusBadge({ status }) {
  const cfg = statusConfig[status] || { bg: "#f1f5f9", color: "#64748b", border: "#e2e8f0" };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 14px",
        borderRadius: 20,
        background: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.border}`,
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: cfg.color }} />
      {status}
    </span>
  );
}

function Avatar({ name }) {
  const initials = name
    ? name
        .split(" ")
        .map((w) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "?";
  return (
    <div
      style={{
        width: 68,
        height: 68,
        borderRadius: "50%",
        flexShrink: 0,
        background: "linear-gradient(135deg, #dbeafe, #bfdbfe)",
        border: "3px solid #fff",
        boxShadow: "0 4px 16px rgba(37,99,235,0.2)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 24,
        fontWeight: 500,
        color: "#2563eb",
      }}
    >
      {initials}
    </div>
  );
}

// ─── View mode: Section + Field ───────────────────────────────────────────────
function Section({ icon, title, children, delay = 0 }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 16,
        border: "1px solid #e8edf3",
        boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
        overflow: "hidden",
        animation: `slideUp 0.3s ease ${delay}s both`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "15px 24px",
          borderBottom: "1px solid #f1f5f9",
          background: "linear-gradient(to right, #f8fafc, #fff)",
        }}
      >
        <span style={{ fontSize: 17 }}>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{title}</span>
      </div>
      <div style={{ padding: "22px 24px" }}>{children}</div>
    </div>
  );
}

function FieldGrid({ children }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(175px, 1fr))",
        gap: "20px 32px",
      }}
    >
      {children}
    </div>
  );
}

function FieldItem({ label, value, mono = false, wide = false }) {
  const display = (value === undefined || value === null || value === "" || value === "-")
    ? "—"
    : String(value);
  return (
    <div style={{ gridColumn: wide ? "1 / -1" : "auto" }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: "#94a3b8",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 5,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "#1e293b",
          lineHeight: 1.5,
          fontFamily: mono ? "'DM Mono', monospace" : "'DM Sans', sans-serif",
          wordBreak: "break-word",
        }}
      >
        {display}
      </div>
    </div>
  );
}

// ─── Edit mode: reusable inputs ───────────────────────────────────────────────
const inputStyle = {
  width: "100%",
  padding: "8px 11px",
  borderRadius: 8,
  fontSize: 13,
  border: "1.5px solid #e2e8f0",
  background: "#fafbfc",
  color: "#0f172a",
  outline: "none",
  fontFamily: "'DM Sans', sans-serif",
  transition: "border-color 0.15s, box-shadow 0.15s",
  boxSizing: "border-box",
};

const editLabelStyle = {
  display: "block",
  marginBottom: 5,
  fontSize: 10,
  fontWeight: 700,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

function EditField({ label, value, onChange, type = "text", wide = false }) {
  return (
    <div style={{ gridColumn: wide ? "1 / -1" : "auto" }}>
      <label style={editLabelStyle}>{label}</label>
      <input
        type={type}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
        onFocus={(e) => {
          e.target.style.borderColor = "#3b82f6";
          e.target.style.boxShadow = "0 0 0 3px rgba(59,130,246,0.1)";
          e.target.style.background = "#fff";
        }}
        onBlur={(e) => {
          e.target.style.borderColor = "#e2e8f0";
          e.target.style.boxShadow = "none";
          e.target.style.background = "#fafbfc";
        }}
      />
    </div>
  );
}

function EditTextarea({ label, value, onChange, wide = false }) {
  return (
    <div style={{ gridColumn: wide ? "1 / -1" : "auto" }}>
      <label style={editLabelStyle}>{label}</label>
      <textarea
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        style={{
          ...inputStyle,
          resize: "vertical",
          lineHeight: 1.5,
        }}
        onFocus={(e) => {
          e.target.style.borderColor = "#3b82f6";
          e.target.style.boxShadow = "0 0 0 3px rgba(59,130,246,0.1)";
          e.target.style.background = "#fff";
        }}
        onBlur={(e) => {
          e.target.style.borderColor = "#e2e8f0";
          e.target.style.boxShadow = "none";
          e.target.style.background = "#fafbfc";
        }}
      />
    </div>
  );
}

function EditSelect({ label, value, onChange, options, wide = false }) {
  return (
    <div style={{ gridColumn: wide ? "1 / -1" : "auto" }}>
      <label style={editLabelStyle}>{label}</label>
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        style={{
          ...inputStyle,
          cursor: "pointer",
          appearance: "none",
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 10px center",
          paddingRight: 32,
        }}
        onFocus={(e) => {
          e.target.style.borderColor = "#3b82f6";
          e.target.style.boxShadow = "0 0 0 3px rgba(59,130,246,0.1)";
        }}
        onBlur={(e) => {
          e.target.style.borderColor = "#e2e8f0";
          e.target.style.boxShadow = "none";
        }}
      >
        <option value="">Select...</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function EditRadio({ label, value, onChange, options, wide = false }) {
  return (
    <div style={{ gridColumn: wide ? "1 / -1" : "auto" }}>
      <label style={editLabelStyle}>{label}</label>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
        {options.map((opt) => {
          const active = value === opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              style={{
                padding: "5px 12px",
                borderRadius: 7,
                fontSize: 12,
                fontWeight: 600,
                border: `1.5px solid ${active ? "#2563eb" : "#e2e8f0"}`,
                background: active ? "#eff6ff" : "#fafbfc",
                color: active ? "#2563eb" : "#64748b",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EditSection({ icon, title, children, delay = 0 }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 16,
        border: "1.5px solid #bfdbfe",
        boxShadow: "0 2px 10px rgba(37,99,235,0.06)",
        overflow: "hidden",
        animation: `slideUp 0.3s ease ${delay}s both`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "15px 24px",
          borderBottom: "1px solid #dbeafe",
          background: "linear-gradient(to right, #eff6ff, #fff)",
        }}
      >
        <span style={{ fontSize: 17 }}>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#1d4ed8" }}>{title}</span>
      </div>
      <div style={{ padding: "22px 24px" }}>{children}</div>
    </div>
  );
}

function EditGrid({ children }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(175px, 1fr))",
        gap: "18px 28px",
      }}
    >
      {children}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function Skeleton({ w = "100%", h = 14, radius = 6 }) {
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: radius,
        background: "linear-gradient(90deg,#f0f4f8 25%,#e2e8f0 50%,#f0f4f8 75%)",
        backgroundSize: "400% 100%",
        animation: "shimmer 1.4s ease infinite",
      }}
    />
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ message, type }) {
  if (!message) return null;
  const colors = { success: "#16a34a", error: "#dc2626" };
  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 2000,
        padding: "12px 20px",
        borderRadius: 10,
        background: colors[type] || colors.success,
        color: "#fff",
        fontSize: 14,
        fontWeight: 600,
        boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
        animation: "slideUp 0.2s ease",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      {type === "success" ? "✓" : "⚠️"} {message}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ViewPatientPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [patient, setPatient] = useState(null);
  const [sample, setSample] = useState(null);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [sampleId, setSampleId] = useState(null);
  const [recordId, setRecordId] = useState(null);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await getPatientDetails(id);
        const patientData = data.patient;
        const sampleRow   = data.samples && data.samples.length > 0 ? data.samples[0] : {};
        const recordData  = sampleRow.records && sampleRow.records.length > 0 ? sampleRow.records[0] : {};

        // Store IDs needed for the update call
        setSampleId(sampleRow.id ?? null);
        setRecordId(recordData.id ?? null);

        setPatient(patientData);
        setSample(recordData);  // sample sections display from record fields
        setForm({ ...patientData, sid: sampleRow.sid || "", ...recordData });
      } catch (err) {
        console.error(err);
        setError("Could not load patient details. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleEdit = () => setEditing(true);

  const handleCancel = () => {
    setForm({ ...patient, sid: form?.sid || "", ...sample });
    setEditing(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        // Patient fields
        aob_id:          form.aob_id || null,
        name:            form.name || null,
        age:             form.age ? Number(form.age) : null,
        gender:          form.gender || null,
        detail_disease:  form.detail_disease || null,
        organ_type:      form.organ_type || null,
        comorbidity:     form.comorbidity || null,
        family_history:  form.family_history || null,
        metastasis:      form.metastasis || null,
        patient_status:  form.patient_status || null,
        consultation:    form.consultation || null,
        // Sample + record IDs for targeting the right rows
        sample_id:       sampleId,
        record_id:       recordId,
        sid:             form.sid || null,
        // Record fields
        new_case_label:         form.new_case_label || null,
        additional:             form.additional || null,
        source:                 form.source || null,
        sample_collection_date: form.sample_collection_date || null,
        dna_availability:       form.dna_availability || null,
        sequencing:             form.sequencing || null,
        din:                    form.din || null,
        research_report:        form.research_report || null,
        sequencing_partner:     form.sequencing_partner || null,
        data_received:          form.data_received || null,
        tmr_e:                  form.tmr_e ? Number(form.tmr_e) : null,
        old_gbp:                form.old_gbp ? Number(form.old_gbp) : null,
        gbp:                    form.gbp ? Number(form.gbp) : null,
        data_analysed_som:      form.data_analysed_som || null,
        data_analysed_germ:     form.data_analysed_germ || null,
        sample_labeling:        form.sample_labeling || null,
        analysis:               form.analysis || null,
        report_status:          form.report_status || null,
        report_release_date:    form.report_release_date || null,
        comments:               form.comments || null,
      };

      const updated = await updatePatientWithSample(id, payload);

      // Backend returns { patient: {...}, samples: [{...records:[...]}] }
      const updatedPatient = updated?.patient || patient;
      const updatedSampleRow = updated?.samples?.[0] || {};
      const updatedRecord  = updatedSampleRow?.records?.[0] || {};

      setPatient(updatedPatient);
      setSample(updatedRecord);
      setForm({ ...updatedPatient, sid: updatedSampleRow.sid || form.sid || "", ...updatedRecord });
      setEditing(false);
      showToast("Patient updated successfully");
    } catch (err) {
      console.error(err);
      showToast(err.message || "Failed to update patient. Please try again.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #f1f5f9; }
        @keyframes slideUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:none} }
        @keyframes shimmer { 0%{background-position:100% 0} 100%{background-position:-100% 0} }
      `}</style>

      <div style={{ minHeight: "100vh", background: "#f1f5f9", fontFamily: "'DM Sans', sans-serif" }}>
        {/* Header */}
        <div
          style={{
            background: "#fff",
            borderBottom: "1px solid #e8edf3",
            padding: "0 32px",
            position: "sticky",
            top: 0,
            zIndex: 100,
          }}
        >
          <div
            style={{
              maxWidth: 1100,
              margin: "0 auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              height: 70,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <img
                src={logo}
                alt="TZAR Labs"
                style={{ height: 38, objectFit: "contain" }}
                onError={(e) => {
                  e.target.style.display = "none";
                }}
              />
              <div>
                <div
                  style={{
                    fontSize: 17,
                    fontWeight: 700,
                    color: "#0f172a",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {loading ? "Loading..." : patient?.name || "Patient Details"}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "#94a3b8",
                    fontWeight: 500,
                    marginTop: 1,
                  }}
                >
                  Exome Patient Management
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              {!loading && patient && (editing ? (
                <>
                  <button
                    onClick={handleCancel}
                    disabled={saving}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "8px 18px",
                      borderRadius: 9,
                      border: "1.5px solid #e2e8f0",
                      background: "#fff",
                      color: "#475569",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: saving ? "not-allowed" : "pointer",
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      if (!saving) e.currentTarget.style.background = "#f8fafc";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "#fff";
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "8px 20px",
                      borderRadius: 9,
                      border: "none",
                      background: saving ? "#86efac" : "#16a34a",
                      color: "#fff",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: saving ? "not-allowed" : "pointer",
                      boxShadow: "0 2px 8px rgba(22,163,74,0.3)",
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      if (!saving) e.currentTarget.style.background = "#15803d";
                    }}
                    onMouseLeave={(e) => {
                      if (!saving) e.currentTarget.style.background = "#16a34a";
                    }}
                  >
                    {saving ? (
                      "Saving..."
                    ) : (
                      <>
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Save Changes
                      </>
                    )}
                  </button>
                </>
              ) : (
                <button
                  onClick={handleEdit}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 18px",
                    borderRadius: 9,
                    border: "1.5px solid #e2e8f0",
                    background: "#fff",
                    color: "#475569",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#f8fafc";
                    e.currentTarget.style.borderColor = "#cbd5e1";
                    e.currentTarget.style.color = "#0f172a";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#fff";
                    e.currentTarget.style.borderColor = "#e2e8f0";
                    e.currentTarget.style.color = "#475569";
                  }}
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  Edit Patient
                </button>
              ))}

              <button
                onClick={() => navigate(-1)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 18px",
                  borderRadius: 9,
                  border: "1.5px solid #e2e8f0",
                  background: "#fff",
                  color: "#475569",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#f8fafc";
                  e.currentTarget.style.borderColor = "#cbd5e1";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#fff";
                  e.currentTarget.style.borderColor = "#e2e8f0";
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="19" y1="12" x2="5" y2="12" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
                Back
              </button>
            </div>
          </div>
        </div>

        {/* Edit mode banner */}
        {editing && (
          <div
            style={{
              background: "#eff6ff",
              borderBottom: "1px solid #bfdbfe",
              padding: "10px 32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#2563eb"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span
              style={{ fontSize: 13, fontWeight: 600, color: "#1d4ed8" }}
            >
              You are in edit mode — make your changes and click Save Changes
            </span>
          </div>
        )}

        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 32px 60px" }}>
          {/* Error */}
          {error && (
            <div
              style={{
                padding: "16px 20px",
                borderRadius: 12,
                marginBottom: 24,
                background: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#dc2626",
                fontSize: 14,
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              ⚠️ {error}
            </div>
          )}

          {/* Hero skeleton */}
          {loading && (
            <div
              style={{
                background: "#fff",
                borderRadius: 20,
                border: "1px solid #e8edf3",
                padding: "28px 32px",
                marginBottom: 24,
                boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
                display: "flex",
                alignItems: "center",
                gap: 20,
              }}
            >
              <Skeleton w={68} h={68} radius={34} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
                <Skeleton w={220} h={22} />
                <Skeleton w={160} h={13} />
                <div style={{ display: "flex", gap: 10 }}>
                  <Skeleton w={90} h={28} radius={20} />
                  <Skeleton w={110} h={28} radius={6} />
                  <Skeleton w={80} h={28} radius={6} />
                </div>
              </div>
            </div>
          )}

          {/* Hero card */}
          {!loading && patient && (
            <div
              style={{
                background: "#fff",
                borderRadius: 20,
                border: editing ? "1.5px solid #bfdbfe" : "1px solid #e8edf3",
                padding: "28px 32px",
                marginBottom: 24,
                boxShadow: editing
                  ? "0 2px 12px rgba(37,99,235,0.08)"
                  : "0 2px 12px rgba(0,0,0,0.05)",
                animation: "slideUp 0.25s ease both",
                transition: "border-color 0.2s, box-shadow 0.2s",
              }}
            >
              {editing ? (
                /* Edit hero — all fields from patients table */
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 16,
                      marginBottom: 20,
                    }}
                  >
                    <Avatar name={form?.name} />
                    <div style={{ fontSize: 13, color: "#64748b" }}>
                      Editing{" "}
                      <strong style={{ color: "#0f172a" }}>{patient.name}</strong>
                    </div>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(175px, 1fr))",
                      gap: "16px 28px",
                    }}
                  >
                    <EditField
                      label="Patient ID"
                      value={form?.patient_id}
                      onChange={(v) => set("patient_id", v)}
                    />
                    <EditField
                      label="Name"
                      value={form?.name}
                      onChange={(v) => set("name", v)}
                      wide
                    />
                    <EditField
                      label="Age"
                      value={form?.age}
                      onChange={(v) => set("age", v)}
                      type="number"
                    />
                    <EditSelect
                      label="Gender"
                      value={form?.gender}
                      onChange={(v) => set("gender", v)}
                      options={["Male", "Female", "Other"]}
                    />
                    <EditField
                      label="AOB ID"
                      value={form?.aob_id}
                      onChange={(v) => set("aob_id", v)}
                    />
                    <EditField
                      label="SID"
                      value={form?.sid}
                      onChange={(v) => set("sid", v)}
                    />
                    <EditSelect
                      label="Patient Status"
                      value={form?.patient_status}
                      onChange={(v) => set("patient_status", v)}
                      options={["New", "In Progress", "Completed", "Active", "Inactive"]}
                      wide
                    />
                  </div>
                </div>
              ) : (
                /* View hero — from patients table */
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 20,
                    flexWrap: "wrap",
                  }}
                >
                  <Avatar name={patient.name} />
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        flexWrap: "wrap",
                        marginBottom: 10,
                      }}
                    >
                      <h1
                        style={{
                          fontSize: 22,
                          fontWeight: 800,
                          color: "#0f172a",
                          letterSpacing: "-0.02em",
                        }}
                      >
                        {patient.name || "Unknown Patient"}
                      </h1>
                      {patient.patient_status && (
                        <StatusBadge status={patient.patient_status} />
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {[
                        { label: "AOB ID", value: patient.aob_id },
                        { label: "Patient ID", value: patient.patient_id },
                        { label: "SID", value: patient.sid },
                      ]
                        .filter((f) => f.value)
                        .map((f) => (
                          <div
                            key={f.label}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              background: "#f8fafc",
                              border: "1px solid #e2e8f0",
                              borderRadius: 8,
                              overflow: "hidden",
                            }}
                          >
                            <span
                              style={{
                                padding: "4px 8px",
                                fontSize: 10,
                                fontWeight: 700,
                                color: "#94a3b8",
                                textTransform: "uppercase",
                                letterSpacing: "0.06em",
                                background: "#f1f5f9",
                                borderRight: "1px solid #e2e8f0",
                              }}
                            >
                              {f.label}
                            </span>
                            <span
                              style={{
                                padding: "4px 10px",
                                fontSize: 12,
                                fontWeight: 600,
                                color: "#1e293b",
                                fontFamily: "'DM Mono', monospace",
                              }}
                            >
                              {f.value}
                            </span>
                          </div>
                        ))}
                      {patient.age && (
                        <div
                          style={{
                            padding: "4px 12px",
                            background: "#eff6ff",
                            border: "1px solid #bfdbfe",
                            borderRadius: 8,
                            fontSize: 12,
                            fontWeight: 600,
                            color: "#2563eb",
                          }}
                        >
                          {patient.age} yrs
                        </div>
                      )}
                      {patient.gender && (
                        <div
                          style={{
                            padding: "4px 12px",
                            background: "#f8fafc",
                            border: "1px solid #e2e8f0",
                            borderRadius: 8,
                            fontSize: 12,
                            fontWeight: 600,
                            color: "#475569",
                          }}
                        >
                          {patient.gender}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Skeleton sections */}
          {loading && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    background: "#fff",
                    borderRadius: 16,
                    border: "1px solid #e8edf3",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      padding: "15px 24px",
                      borderBottom: "1px solid #f1f5f9",
                      background: "#f8fafc",
                    }}
                  >
                    <Skeleton w={150} h={14} />
                  </div>
                  <div
                    style={{
                      padding: "22px 24px",
                      display: "grid",
                      gridTemplateColumns: "repeat(4, 1fr)",
                      gap: "20px 32px",
                    }}
                  >
                    {Array.from({ length: 8 }).map((_, j) => (
                      <div key={j}>
                        <Skeleton w={70} h={10} />
                        <div style={{ marginTop: 7 }}>
                          <Skeleton w="85%" h={14} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Detail / Edit sections */}
          {!loading && patient && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* ── SECTION 1: Clinical Information ── */}
              {editing ? (
                <EditSection icon="🩺" title="Clinical Information" delay={0.05}>
                  <EditGrid>
                    <EditField
                      label="Detail Disease"
                      value={form?.detail_disease}
                      onChange={(v) => set("detail_disease", v)}
                      wide
                    />
                    <EditField
                      label="Organ Type"
                      value={form?.organ_type}
                      onChange={(v) => set("organ_type", v)}
                    />
                    <EditField
                      label="Comorbidity"
                      value={form?.comorbidity}
                      onChange={(v) => set("comorbidity", v)}
                    />
                    <EditRadio
                      label="Family History"
                      value={form?.family_history}
                      onChange={(v) => set("family_history", v)}
                      options={["Yes", "No", "Unknown"]}
                    />
                    <EditRadio
                      label="Metastasis"
                      value={form?.metastasis}
                      onChange={(v) => set("metastasis", v)}
                      options={["Yes", "No"]}
                    />
                    <EditField
                      label="Consultation"
                      value={form?.consultation}
                      onChange={(v) => set("consultation", v)}
                      wide
                    />
                  </EditGrid>
                </EditSection>
              ) : (
                <Section icon="🩺" title="Clinical Information" delay={0.05}>
                  <FieldGrid>
                    <FieldItem
                      label="Detail Disease"
                      value={patient.detail_disease}
                      wide
                    />
                    <FieldItem label="Organ Type" value={patient.organ_type} />
                    <FieldItem label="Comorbidity" value={patient.comorbidity} />
                    <FieldItem
                      label="Family History"
                      value={patient.family_history}
                    />
                    <FieldItem label="Metastasis" value={patient.metastasis} />
                    <FieldItem
                      label="Consultation"
                      value={patient.consultation}
                      wide
                    />
                  </FieldGrid>
                </Section>
              )}

              {/* ── SECTION 2: Sample Information ── */}
              {editing ? (
                <EditSection icon="🧪" title="Sample Information" delay={0.1}>
                  <EditGrid>
                    <EditField
                      label="Case Label"
                      value={form?.new_case_label}
                      onChange={(v) => set("new_case_label", v)}
                    />
                    <EditField
                      label="Source"
                      value={form?.source}
                      onChange={(v) => set("source", v)}
                    />
                    <EditField
                      label="Sample Collection Date"
                      value={form?.sample_collection_date}
                      onChange={(v) => set("sample_collection_date", v)}
                      type="date"
                    />
                    <EditSelect
                      label="DNA Availability"
                      value={form?.dna_availability}
                      onChange={(v) => set("dna_availability", v)}
                      options={["Yes", "No", "Pending", "Exhausted"]}
                    />
                    <EditField
                      label="Sample Labeling"
                      value={form?.sample_labeling}
                      onChange={(v) => set("sample_labeling", v)}
                    />
                    <EditTextarea
                      label="Additional"
                      value={form?.additional}
                      onChange={(v) => set("additional", v)}
                      wide
                    />
                  </EditGrid>
                </EditSection>
              ) : (
                <Section icon="🧪" title="Sample Information" delay={0.1}>
                  <FieldGrid>
                    <FieldItem
                      label="Case Label"
                      value={sample?.new_case_label}
                    />
                    <FieldItem label="Source" value={sample?.source} />
                    <FieldItem
                      label="Sample Collection Date"
                      value={sample?.sample_collection_date}
                    />
                    <FieldItem
                      label="DNA Availability"
                      value={sample?.dna_availability}
                    />
                    <FieldItem
                      label="Sample Labeling"
                      value={sample?.sample_labeling}
                      mono
                    />
                    <FieldItem
                      label="Additional"
                      value={sample?.additional}
                      wide
                    />
                  </FieldGrid>
                </Section>
              )}

              {/* ── SECTION 3: Sequencing ── */}
              {editing ? (
                <EditSection icon="🧬" title="Sequencing" delay={0.15}>
                  <EditGrid>
                    <EditSelect
                      label="Sequencing"
                      value={form?.sequencing}
                      onChange={(v) => set("sequencing", v)}
                      options={["WES", "WGS", "RNA-Seq", "Panel", "Done", "Other"]}
                    />
                    <EditField
                      label="Sequencing Partner"
                      value={form?.sequencing_partner}
                      onChange={(v) => set("sequencing_partner", v)}
                    />
                    <EditField
                      label="DIN"
                      value={form?.din}
                      onChange={(v) => set("din", v)}
                    />
                  </EditGrid>
                </EditSection>
              ) : (
                <Section icon="🧬" title="Sequencing" delay={0.15}>
                  <FieldGrid>
                    <FieldItem label="Sequencing" value={sample?.sequencing} />
                    <FieldItem
                      label="Sequencing Partner"
                      value={sample?.sequencing_partner}
                    />
                    <FieldItem label="DIN" value={sample?.din} mono />
                  </FieldGrid>
                </Section>
              )}

              {/* ── SECTION 4: Data & Analysis ── */}
              {editing ? (
                <EditSection icon="📊" title="Data & Analysis" delay={0.2}>
                  <EditGrid>
                    <EditRadio
                      label="Data Received"
                      value={form?.data_received}
                      onChange={(v) => set("data_received", v)}
                      options={["Yes", "No"]}
                    />
                    <EditField
                      label="TMR-E (Gbp)"
                      value={form?.tmr_e}
                      onChange={(v) => set("tmr_e", v)}
                    />
                    <EditRadio
                      label="Data Analysed (Som)"
                      value={form?.data_analysed_som}
                      onChange={(v) => set("data_analysed_som", v)}
                      options={["Yes", "No"]}
                    />
                    <EditRadio
                      label="Data Analysed (Germ)"
                      value={form?.data_analysed_germ}
                      onChange={(v) => set("data_analysed_germ", v)}
                      options={["Yes", "No"]}
                    />
                    <EditField
                      label="Analysis"
                      value={form?.analysis}
                      onChange={(v) => set("analysis", v)}
                      wide
                    />
                  </EditGrid>
                </EditSection>
              ) : (
                <Section icon="📊" title="Data & Analysis" delay={0.2}>
                  <FieldGrid>
                    <FieldItem
                      label="Data Received"
                      value={sample?.data_received}
                    />
                    <FieldItem label="TMR-E (Gbp)" value={sample?.tmr_e} mono />
                    <FieldItem
                      label="Data Analysed (Som)"
                      value={sample?.data_analysed_som}
                    />
                    <FieldItem
                      label="Data Analysed (Germ)"
                      value={sample?.data_analysed_germ}
                    />
                    <FieldItem
                      label="Analysis"
                      value={sample?.analysis}
                      wide
                    />
                  </FieldGrid>
                </Section>
              )}

              {/* ── SECTION 5: Report ── */}
              {editing ? (
                <EditSection icon="📋" title="Report" delay={0.25}>
                  <EditGrid>
                    <EditField
                      label="Research Report"
                      value={form?.research_report}
                      onChange={(v) => set("research_report", v)}
                    />
                    <EditSelect
                      label="Report Status"
                      value={form?.report_status}
                      onChange={(v) => set("report_status", v)}
                      options={["Pending", "In Progress", "Done", "Released"]}
                    />
                    <EditField
                      label="Report Release Date"
                      value={form?.report_release_date}
                      onChange={(v) => set("report_release_date", v)}
                      type="date"
                    />
                    <EditTextarea
                      label="Comments"
                      value={form?.comments}
                      onChange={(v) => set("comments", v)}
                      wide
                    />
                  </EditGrid>
                </EditSection>
              ) : (
                <Section icon="📋" title="Report" delay={0.25}>
                  <FieldGrid>
                    <FieldItem
                      label="Research Report"
                      value={sample?.research_report}
                    />
                    <FieldItem label="Report Status" value={sample?.report_status} />
                    <FieldItem
                      label="Report Release Date"
                      value={sample?.report_release_date}
                    />
                    <FieldItem label="Comments" value={sample?.comments} wide />
                  </FieldGrid>
                </Section>
              )}
            </div>
          )}
        </div>
      </div>

      <Toast message={toast?.message} type={toast?.type} />
    </>
  );
}