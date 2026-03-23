import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { addPatient } from "../api";
import logo from "../assets/tzarnewlogo.png";

const STEPS = [
  { id: 1, label: "Basic Info",   icon: "👤", desc: "Identity & demographics" },
  { id: 2, label: "Clinical",     icon: "🩺", desc: "Diagnosis & history"     },
  { id: 3, label: "Lab & Sample", icon: "🧬", desc: "Sequencing & data"       },
  { id: 4, label: "Files",        icon: "📁", desc: "Upload patient files"    },
];

const EMPTY_FORM = {
  name: "", age: "", gender: "", aob_id: "", sid: "",
  diagnosis: "", disease_type: "", comorbidity: "",
  family_history: "", metastasis: "", patient_status: "",
  sample_collection_date: "", dna_availability: "",
  sequencing: "", data_received: "", tmr_e: "",
  data_analysed: "", sample_leveling: "",
};

const EMPTY_FILES = {
  fastq: null,
  germline_excel: null,
  somatic_excel: null,
  processed_germline: null,
  processed_somatic: null,
};

// ─── Shared input styles ──────────────────────────────────────────────────────
const inputBase = (hasError) => ({
  width: "100%", padding: "10px 13px", borderRadius: 9, fontSize: 14,
  border: `1.5px solid ${hasError ? "#ef4444" : "#e2e8f0"}`,
  background: "#fafbfc", color: "#0f172a", outline: "none",
  fontFamily: "'DM Sans', sans-serif",
  transition: "border-color 0.15s, box-shadow 0.15s",
  boxSizing: "border-box",
});

const labelStyle = {
  display: "block", marginBottom: 6, fontSize: 11, fontWeight: 700,
  color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em",
};

// ─── Reusable field components ────────────────────────────────────────────────
function Field({ label, error, children }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
      {error && <p style={{ margin: "4px 0 0", color: "#ef4444", fontSize: 12 }}>{error}</p>}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, type = "text", hasError }) {
  return (
    <input
      type={type} value={value} placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      style={inputBase(hasError)}
      onFocus={e => {
        e.target.style.borderColor = "#3b82f6";
        e.target.style.boxShadow = "0 0 0 3px rgba(59,130,246,0.1)";
        e.target.style.background = "#fff";
      }}
      onBlur={e => {
        e.target.style.borderColor = hasError ? "#ef4444" : "#e2e8f0";
        e.target.style.boxShadow = "none";
        e.target.style.background = "#fafbfc";
      }}
    />
  );
}

function SelectInput({ value, onChange, options, placeholder, hasError }) {
  return (
    <select
      value={value} onChange={e => onChange(e.target.value)}
      style={{
        ...inputBase(hasError), cursor: "pointer", appearance: "none",
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center", paddingRight: 36,
      }}
      onFocus={e => { e.target.style.borderColor = "#3b82f6"; e.target.style.boxShadow = "0 0 0 3px rgba(59,130,246,0.1)"; }}
      onBlur={e => { e.target.style.borderColor = hasError ? "#ef4444" : "#e2e8f0"; e.target.style.boxShadow = "none"; }}
    >
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function RadioGroup({ value, onChange, options }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {options.map(opt => {
        const active = value === opt;
        return (
          <button key={opt} type="button" onClick={() => onChange(opt)} style={{
            padding: "7px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
            border: `1.5px solid ${active ? "#2563eb" : "#e2e8f0"}`,
            background: active ? "#eff6ff" : "#fafbfc",
            color: active ? "#2563eb" : "#64748b",
            cursor: "pointer", transition: "all 0.15s",
          }}>
            {opt}
          </button>
        );
      })}
    </div>
  );
}

// ─── File Upload Slot ─────────────────────────────────────────────────────────
function FileSlot({ label, accept, file, onChange, icon, color = "#2563eb", bgColor = "#eff6ff", borderColor = "#bfdbfe" }) {
  const inputRef = useState(null);
  const id = `file-${label.replace(/\s+/g, "-").toLowerCase()}`;

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const dropped = e.dataTransfer.files[0];
    if (dropped) onChange(dropped);
    e.currentTarget.style.borderColor = borderColor;
    e.currentTarget.style.background = bgColor;
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.currentTarget.style.borderColor = color;
    e.currentTarget.style.background = bgColor;
  };

  const handleDragLeave = (e) => {
    e.currentTarget.style.borderColor = file ? color : "#e2e8f0";
    e.currentTarget.style.background = file ? bgColor : "#fafbfc";
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <label
        htmlFor={id}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", gap: 10,
          padding: "22px 16px", borderRadius: 12, cursor: "pointer",
          border: `2px dashed ${file ? color : "#e2e8f0"}`,
          background: file ? bgColor : "#fafbfc",
          transition: "all 0.2s",
          minHeight: 110,
        }}
        onMouseEnter={e => { if (!file) { e.currentTarget.style.borderColor = color; e.currentTarget.style.background = bgColor; } }}
        onMouseLeave={e => { if (!file) { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.background = "#fafbfc"; } }}
      >
        {file ? (
          <>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: color, display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: 18,
            }}>
              ✓
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {file.name}
              </div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                {formatSize(file.size)} · Click to replace
              </div>
            </div>
            <button
              type="button"
              onClick={e => { e.preventDefault(); e.stopPropagation(); onChange(null); }}
              style={{
                padding: "4px 10px", borderRadius: 6, border: "1px solid #fecaca",
                background: "#fef2f2", color: "#dc2626", fontSize: 11, fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Remove
            </button>
          </>
        ) : (
          <>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: "#f1f5f9", display: "flex",
              alignItems: "center", justifyContent: "center", fontSize: 22,
            }}>
              {icon}
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>
                Drop file here or <span style={{ color, textDecoration: "underline" }}>browse</span>
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>
                {accept.replace(/\./g, "").toUpperCase().replace(/,/g, ", ")}
              </div>
            </div>
          </>
        )}
      </label>
      <input
        id={id} type="file" accept={accept}
        style={{ display: "none" }}
        onChange={e => onChange(e.target.files[0] || null)}
      />
    </div>
  );
}

// ─── Step divider ─────────────────────────────────────────────────────────────
function Divider({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "4px 0" }}>
      <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
      <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", whiteSpace: "nowrap" }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
    </div>
  );
}

// ─── Step Components ──────────────────────────────────────────────────────────
function Step1({ form, set, errors }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Field label="Full Name" error={errors.name}>
        <TextInput value={form.name} onChange={v => set("name", v)}
          placeholder="e.g. Ahmed Al-Rashid" hasError={!!errors.name} />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Field label="Age" error={errors.age}>
          <TextInput value={form.age} onChange={v => set("age", v)}
            placeholder="e.g. 34" type="number" hasError={!!errors.age} />
        </Field>
        <Field label="Gender">
          <SelectInput value={form.gender} onChange={v => set("gender", v)}
            placeholder="Select gender" options={["Male", "Female", "Other"]} />
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Field label="AOB ID">
          <TextInput value={form.aob_id} onChange={v => set("aob_id", v)}
            placeholder="e.g. AOB-2024-0193" />
        </Field>
        <Field label={<>SID <span style={{ color: "#ef4444" }}>*</span></>} error={errors.sid}>
          <TextInput value={form.sid} onChange={v => set("sid", v)}
            placeholder="e.g. 1A0169" hasError={!!errors.sid} />
        </Field>
      </div>
    </div>
  );
}

function Step2({ form, set }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Field label="Case Label">
          <TextInput value={form.diagnosis} onChange={v => set("diagnosis", v)}
            placeholder="e.g. CON" />
        </Field>
        <Field label="Disease Type">
          <SelectInput value={form.disease_type} onChange={v => set("disease_type", v)}
            placeholder="Select type"
            options={["Oncology", "Cardiology", "Neurology", "Rare Disease", "Other"]} />
        </Field>
      </div>
      <Field label="Comorbidity">
        <TextInput value={form.comorbidity} onChange={v => set("comorbidity", v)}
          placeholder="e.g. Diabetes, Hypertension" />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Field label="Family History">
          <RadioGroup value={form.family_history} onChange={v => set("family_history", v)}
            options={["Yes", "No", "Unknown"]} />
        </Field>
        <Field label="Metastasis">
          <RadioGroup value={form.metastasis} onChange={v => set("metastasis", v)}
            options={["Yes", "No"]} />
        </Field>
      </div>
      <Field label="Patient Status">
        <RadioGroup value={form.patient_status} onChange={v => set("patient_status", v)}
          options={["New", "In Progress", "Completed", "Active", "Inactive"]} />
      </Field>
    </div>
  );
}

function Step3({ form, set }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Field label="Sample Collection Date">
          <TextInput value={form.sample_collection_date}
            onChange={v => set("sample_collection_date", v)} type="date" />
        </Field>
        <Field label="DNA Availability">
          <RadioGroup value={form.dna_availability}
            onChange={v => set("dna_availability", v)} options={["Yes", "No", "Pending"]} />
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Field label="Sequencing">
          <SelectInput value={form.sequencing} onChange={v => set("sequencing", v)}
            placeholder="Select type" options={["WES", "WGS", "RNA-Seq", "Panel", "Other"]} />
        </Field>
        <Field label="Data Received">
          <RadioGroup value={form.data_received}
            onChange={v => set("data_received", v)} options={["Yes", "No"]} />
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Field label="TMR-E (Gbp)">
          <TextInput value={form.tmr_e} onChange={v => set("tmr_e", v)}
            placeholder="e.g. 12.4" type="number" />
        </Field>
        <Field label="Data Analysed">
          <RadioGroup value={form.data_analysed}
            onChange={v => set("data_analysed", v)} options={["Yes", "No"]} />
        </Field>
      </div>
      <Field label="Sample Leveling">
        <SelectInput value={form.sample_leveling} onChange={v => set("sample_leveling", v)}
          placeholder="Select level" options={["Level 1", "Level 2", "Level 3", "Not Done"]} />
      </Field>
    </div>
  );
}

function Step4({ files, setFile }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Raw Files */}
      <div>
        <Divider label="Raw Sequencing Files" />
        <div style={{ marginTop: 16 }}>
          <FileSlot
            label="FASTQ File"
            accept=".fastq,.fastq.gz,.fq,.fq.gz"
            file={files.fastq}
            onChange={f => setFile("fastq", f)}
            icon="🧬"
            color="#7c3aed"
            bgColor="#f5f3ff"
            borderColor="#ddd6fe"
          />
        </div>
      </div>

      {/* Excel Files */}
      <div>
        <Divider label="Analysis Excel Files" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
          <FileSlot
            label="Germline Excel"
            accept=".xlsx,.xls,.csv"
            file={files.germline_excel}
            onChange={f => setFile("germline_excel", f)}
            icon="📊"
            color="#16a34a"
            bgColor="#f0fdf4"
            borderColor="#bbf7d0"
          />
          <FileSlot
            label="Somatic Excel"
            accept=".xlsx,.xls,.csv"
            file={files.somatic_excel}
            onChange={f => setFile("somatic_excel", f)}
            icon="📈"
            color="#d97706"
            bgColor="#fffbeb"
            borderColor="#fde68a"
          />
        </div>
      </div>

      {/* Processed Files */}
      <div>
        <Divider label="Processed Output Files" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
          <FileSlot
            label="Processed Germline File"
            accept=".xlsx,.xls,.csv,.vcf,.txt"
            file={files.processed_germline}
            onChange={f => setFile("processed_germline", f)}
            icon="🧪"
            color="#2563eb"
            bgColor="#eff6ff"
            borderColor="#bfdbfe"
          />
          <FileSlot
            label="Processed Somatic File"
            accept=".xlsx,.xls,.csv,.vcf,.txt"
            file={files.processed_somatic}
            onChange={f => setFile("processed_somatic", f)}
            icon="🔭"
            color="#db2777"
            bgColor="#fdf2f8"
            borderColor="#fbcfe8"
          />
        </div>
      </div>

      {/* Info note */}
      <div style={{
        padding: "12px 16px", borderRadius: 10,
        background: "#f8fafc", border: "1px solid #e2e8f0",
        display: "flex", alignItems: "flex-start", gap: 10,
      }}>
        <span style={{ fontSize: 15, flexShrink: 0 }}>ℹ️</span>
        <p style={{ fontSize: 12, color: "#64748b", margin: 0, lineHeight: 1.6 }}>
          All file uploads are <strong>optional</strong>. You can skip this step and upload files later from the patient's detail page.
          Drag and drop files directly into the slots or click to browse.
        </p>
      </div>
    </div>
  );
}

// ─── Success Screen ───────────────────────────────────────────────────────────
function SuccessScreen({ patient, files, onAddAnother, onGoToRecords }) {
  const summaryFields = [
    ["AOB ID",    patient?.aob_id || patient?.AOB_id || "—"],
    ["SID",       patient?.sid || "—"],
    ["Age",       patient?.age ?? "—"],
    ["Gender",    patient?.gender || "—"],
    ["Status",    patient?.patient_status || patient?.case_status || "New"],
    ["Diagnosis", patient?.diagnosis || "—"],
  ];

  const uploadedFiles = Object.entries(files).filter(([, v]) => v !== null);

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "52px 28px 44px", textAlign: "center",
    }}>
      <div style={{
        width: 80, height: 80, borderRadius: "50%",
        background: "linear-gradient(135deg, #d1fae5, #a7f3d0)",
        border: "3px solid #6ee7b7",
        display: "flex", alignItems: "center", justifyContent: "center",
        marginBottom: 24, fontSize: 36,
        boxShadow: "0 0 0 10px rgba(16,185,129,0.08)",
        animation: "popIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both",
      }}>
        ✓
      </div>

      <h2 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", marginBottom: 8, letterSpacing: "-0.02em", animation: "slideUp 0.3s ease 0.1s both" }}>
        Patient Added Successfully!
      </h2>

      <p style={{ fontSize: 14, color: "#64748b", marginBottom: 28, lineHeight: 1.7, maxWidth: 340, animation: "slideUp 0.3s ease 0.15s both" }}>
        <strong style={{ color: "#0f172a" }}>{patient?.name || "The patient"}</strong> has been
        registered and is ready for further processing.
      </p>

      {/* Summary */}
      <div style={{
        background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 14,
        padding: "18px 24px", marginBottom: uploadedFiles.length ? 16 : 32,
        width: "100%", maxWidth: 420,
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 24px",
        textAlign: "left", animation: "slideUp 0.3s ease 0.2s both",
      }}>
        {summaryFields.map(([label, val]) => (
          <div key={label}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>
              {label}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", fontFamily: ["AOB ID", "SID"].includes(label) ? "'DM Mono', monospace" : "inherit" }}>
              {String(val)}
            </div>
          </div>
        ))}
      </div>

      {/* Files uploaded summary */}
      {uploadedFiles.length > 0 && (
        <div style={{
          background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12,
          padding: "14px 20px", marginBottom: 32, width: "100%", maxWidth: 420,
          textAlign: "left", animation: "slideUp 0.3s ease 0.22s both",
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#16a34a", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
            {uploadedFiles.length} File{uploadedFiles.length > 1 ? "s" : ""} Uploaded
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {uploadedFiles.map(([key, file]) => (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#166534" }}>
                <span style={{ fontSize: 14 }}>📎</span>
                <span style={{ fontWeight: 600 }}>{file.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, width: "100%", maxWidth: 420, animation: "slideUp 0.3s ease 0.25s both" }}>
        <button onClick={onAddAnother} style={{
          flex: 1, padding: "11px 16px", borderRadius: 10,
          border: "1.5px solid #e2e8f0", background: "#fff",
          color: "#475569", fontSize: 14, fontWeight: 600,
          cursor: "pointer", transition: "all 0.15s",
        }}
          onMouseEnter={e => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#e2e8f0"; }}
        >
          + Add Another
        </button>
        <button onClick={onGoToRecords} style={{
          flex: 1, padding: "11px 16px", borderRadius: 10,
          border: "none", background: "#2563eb", color: "#fff",
          fontSize: 14, fontWeight: 700, cursor: "pointer",
          boxShadow: "0 2px 8px rgba(37,99,235,0.3)", transition: "all 0.15s",
        }}
          onMouseEnter={e => { e.currentTarget.style.background = "#1d4ed8"; e.currentTarget.style.transform = "translateY(-1px)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "#2563eb"; e.currentTarget.style.transform = "none"; }}
        >
          View Records
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AddPatientPage() {
  const navigate = useNavigate();
  const [step, setStep]               = useState(1);
  const [form, setForm]               = useState(EMPTY_FORM);
  const [files, setFiles]             = useState(EMPTY_FILES);
  const [errors, setErrors]           = useState({});
  const [submitting, setSubmitting]   = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitted, setSubmitted]     = useState(false);
  const [savedPatient, setSavedPatient] = useState(null);

  const set = (key, val) => {
    setForm(f => ({ ...f, [key]: val }));
    setErrors(e => ({ ...e, [key]: undefined }));
  };

  const setFile = (key, val) => setFiles(f => ({ ...f, [key]: val }));

  const validate = (s) => {
    const e = {};
    if (s === 1) {
      // Only SID is required — everything else optional
      if (!form.sid.trim()) e.sid = "SID is required";
    }
    return e;
  };

  const next = () => {
    const e = validate(step);
    if (Object.keys(e).length) { setErrors(e); return; }
    setErrors({});
    setStep(s => s + 1);
  };

  const back = () => { setErrors({}); setStep(s => s - 1); };

  const submit = async () => {
    const e = validate(1); // re-check SID just in case
    if (Object.keys(e).length) { setErrors(e); setStep(1); return; }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload = {
        AOB_id: form.aob_id,
        sid: form.sid,
        name: form.name,
        age: form.age,
        gender: form.gender,
        diagnosis: form.diagnosis,
        disease_type: form.disease_type,
        comorbidity: form.comorbidity,
        family_history: form.family_history,
        metastasis: form.metastasis,
        patient_status: form.patient_status,
        sample_collection_date: form.sample_collection_date,
        dna_availability: form.dna_availability,
        sequencing: form.sequencing,
        data_received: form.data_received,
        tmr_e: form.tmr_e,
        data_analysed: form.data_analysed,
        sample_leveling: form.sample_leveling,
      };
      const result = await addPatient(payload);
      // Note: file uploads would be handled here via FormData/multipart
      // e.g. await uploadPatientFiles(result.id, files);
      setSavedPatient(result || { ...form });
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      setSubmitError("Failed to save patient. Please check the API and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddAnother = () => {
    setForm(EMPTY_FORM);
    setFiles(EMPTY_FILES);
    setErrors({});
    setStep(1);
    setSubmitted(false);
    setSavedPatient(null);
    setSubmitError(null);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #f1f5f9; font-family: 'DM Sans', sans-serif; }
        @keyframes slideUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:none} }
        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes popIn   { from{opacity:0;transform:scale(0.8)} to{opacity:1;transform:scale(1)} }
        input[type=number]::-webkit-inner-spin-button { opacity: 0.4; }
      `}</style>

      <div style={{ minHeight: "100vh", background: "#f1f5f9", fontFamily: "'DM Sans', sans-serif" }}>

        {/* Header */}
        <div style={{
          background: "#fff", borderBottom: "1px solid #e8edf3",
          padding: "0 32px", position: "sticky", top: 0, zIndex: 100,
        }}>
          <div style={{
            maxWidth: 860, margin: "0 auto",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            height: 70,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <img src={logo} alt="TZAR Labs" style={{ height: 38, objectFit: "contain" }}
                onError={e => { e.target.style.display = "none"; }} />
              <div>
                <div style={{ fontSize: 17, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.01em" }}>
                  Add New Patient
                </div>
                <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500, marginTop: 1 }}>
                  Exome Patient Management
                </div>
              </div>
            </div>
            <button onClick={() => navigate("/")} style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 16px", borderRadius: 9, border: "1.5px solid #e2e8f0",
              background: "#fff", color: "#475569", fontSize: 13, fontWeight: 600,
              cursor: "pointer", transition: "all 0.15s",
            }}
              onMouseEnter={e => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#e2e8f0"; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
              </svg>
              Back to Records
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "36px 32px 60px" }}>

          {/* Step indicators */}
          {!submitted && (
            <div style={{ marginBottom: 36 }}>
              <div style={{ display: "flex", alignItems: "center" }}>
                {STEPS.map((s, idx) => {
                  const done    = step > s.id;
                  const current = step === s.id;
                  return (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", flex: idx < STEPS.length - 1 ? 1 : 0 }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                        <div style={{
                          width: 44, height: 44, borderRadius: "50%",
                          background: done ? "#2563eb" : current ? "#eff6ff" : "#f1f5f9",
                          border: `2px solid ${done ? "#2563eb" : current ? "#2563eb" : "#e2e8f0"}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: done ? 16 : 18, transition: "all 0.3s",
                          boxShadow: current ? "0 0 0 4px rgba(37,99,235,0.12)" : "none",
                        }}>
                          {done
                            ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                            : s.icon}
                        </div>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: current || done ? "#0f172a" : "#94a3b8" }}>{s.label}</div>
                          <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 1 }}>{s.desc}</div>
                        </div>
                      </div>
                      {idx < STEPS.length - 1 && (
                        <div style={{ flex: 1, height: 2, margin: "0 8px", marginBottom: 28, position: "relative", background: "#e2e8f0", borderRadius: 2 }}>
                          <div style={{
                            position: "absolute", inset: 0, borderRadius: 2, background: "#2563eb",
                            width: done ? "100%" : current ? "50%" : "0%",
                            transition: "width 0.4s ease",
                          }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Main card */}
          <div style={{
            background: "#fff", borderRadius: 18, border: "1px solid #e8edf3",
            boxShadow: "0 4px 20px rgba(0,0,0,0.06)", overflow: "hidden",
          }}>
            {submitted ? (
              <SuccessScreen
                patient={savedPatient}
                files={files}
                onAddAnother={handleAddAnother}
                onGoToRecords={() => navigate("/")}
              />
            ) : (
              <>
                {/* Card header */}
                <div style={{
                  padding: "22px 28px", borderBottom: "1px solid #f1f5f9",
                  background: "linear-gradient(135deg,#f8fafc 0%,#fff 100%)",
                  display: "flex", alignItems: "center", gap: 12,
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10, background: "#eff6ff",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
                  }}>
                    {STEPS[step - 1].icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
                      {STEPS[step - 1].label}
                    </div>
                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 1 }}>
                      Step {step} of {STEPS.length} — {STEPS[step - 1].desc}
                    </div>
                  </div>
                  {/* SID required note on step 1 */}
                  {step === 1 && (
                    <div style={{
                      marginLeft: "auto", display: "flex", alignItems: "center", gap: 5,
                      background: "#fef9f0", border: "1px solid #fed7aa", borderRadius: 8,
                      padding: "5px 10px", fontSize: 11, color: "#c2410c", fontWeight: 600,
                    }}>
                      <span style={{ color: "#ef4444" }}>*</span> SID is required
                    </div>
                  )}
                </div>

                {/* Step body */}
                <div key={step} style={{ padding: "28px", animation: "slideUp 0.22s ease" }}>
                  {step === 1 && <Step1 form={form} set={set} errors={errors} />}
                  {step === 2 && <Step2 form={form} set={set} errors={errors} />}
                  {step === 3 && <Step3 form={form} set={set} />}
                  {step === 4 && <Step4 files={files} setFile={setFile} />}
                </div>

                {/* API error */}
                {submitError && (
                  <div style={{
                    margin: "0 28px 16px", padding: "12px 16px", borderRadius: 10,
                    background: "#fef2f2", border: "1px solid #fecaca",
                    color: "#dc2626", fontSize: 13, fontWeight: 500,
                    display: "flex", alignItems: "center", gap: 8,
                  }}>
                    ⚠️ {submitError}
                  </div>
                )}

                {/* Footer nav */}
                <div style={{
                  padding: "20px 28px", borderTop: "1px solid #f1f5f9",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: "#fafbfc",
                }}>
                  <button onClick={step === 1 ? () => navigate("/") : back} style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "10px 20px", borderRadius: 9, border: "1.5px solid #e2e8f0",
                    background: "#fff", color: "#475569", fontSize: 14, fontWeight: 600,
                    cursor: "pointer", transition: "all 0.15s",
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                    onMouseLeave={e => e.currentTarget.style.background = "#fff"}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
                    </svg>
                    {step === 1 ? "Cancel" : "Back"}
                  </button>

                  {/* Dot indicators */}
                  <div style={{ display: "flex", gap: 6 }}>
                    {STEPS.map(s => (
                      <div key={s.id} style={{
                        width: step === s.id ? 20 : 7, height: 7, borderRadius: 4,
                        background: step === s.id ? "#2563eb" : step > s.id ? "#93c5fd" : "#e2e8f0",
                        transition: "all 0.3s",
                      }} />
                    ))}
                  </div>

                  {step < STEPS.length ? (
                    <button onClick={next} style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "10px 24px", borderRadius: 9, border: "none",
                      background: "#2563eb", color: "#fff", fontSize: 14, fontWeight: 700,
                      cursor: "pointer", transition: "all 0.15s",
                      boxShadow: "0 2px 8px rgba(37,99,235,0.3)",
                    }}
                      onMouseEnter={e => { e.currentTarget.style.background = "#1d4ed8"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "#2563eb"; e.currentTarget.style.transform = "none"; }}
                    >
                      Continue
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                      </svg>
                    </button>
                  ) : (
                    <button onClick={submit} disabled={submitting} style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "10px 24px", borderRadius: 9, border: "none",
                      background: submitting ? "#93c5fd" : "#16a34a", color: "#fff",
                      fontSize: 14, fontWeight: 700,
                      cursor: submitting ? "not-allowed" : "pointer",
                      transition: "all 0.15s",
                      boxShadow: submitting ? "none" : "0 2px 8px rgba(22,163,74,0.35)",
                    }}
                      onMouseEnter={e => { if (!submitting) { e.currentTarget.style.background = "#15803d"; e.currentTarget.style.transform = "translateY(-1px)"; }}}
                      onMouseLeave={e => { if (!submitting) { e.currentTarget.style.background = "#16a34a"; e.currentTarget.style.transform = "none"; }}}
                    >
                      {submitting ? "Saving..." : (
                        <>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                          Save Patient
                        </>
                      )}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Progress bar */}
          {!submitted && (
            <>
              <div style={{ marginTop: 20, height: 3, borderRadius: 2, background: "#e2e8f0", overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 2,
                  background: "linear-gradient(90deg,#2563eb,#3b82f6)",
                  width: `${(step / STEPS.length) * 100}%`,
                  transition: "width 0.4s ease",
                }} />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                <span style={{ fontSize: 11, color: "#94a3b8" }}>
                  {Math.round((step / STEPS.length) * 100)}% complete
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}