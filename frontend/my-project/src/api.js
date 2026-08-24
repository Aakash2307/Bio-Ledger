const BASE_URL = "http://127.0.0.1:8000";

// ─── Patients ─────────────────────────────────────────────────────────────────

export async function getPatients() {
  const res = await fetch(`${BASE_URL}/patients/`);
  if (!res.ok) throw new Error("Failed to fetch patients");
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("Invalid patients response");
  return data;
}

export async function getPatientDetails(id) {
  const res = await fetch(`${BASE_URL}/patients/${id}`);
  if (!res.ok) throw new Error("Failed to fetch patient details");
  return res.json();
}

// Patient only (no sample) — kept for simple patient-field-only updates
export async function addPatient(data) {
  const res = await fetch(`${BASE_URL}/patients/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to add patient");
  return res.json();
}

export async function updatePatient(id, data) {
  const res = await fetch(`${BASE_URL}/patients/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update patient");
  return res.json();
}

export async function deletePatient(id) {
  const res = await fetch(`${BASE_URL}/patients/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete patient");
  return res.json();
}

// ─── Combined patient + sample + record (used by Add/Edit Patient page) ───────

export async function addPatientWithSample(data) {
  const res = await fetch(`${BASE_URL}/patients/with-sample`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to add patient");
  }
  return res.json();
}

export async function updatePatientWithSample(id, data) {
  const res = await fetch(`${BASE_URL}/patients/${id}/with-sample`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to update patient");
  }
  return res.json();
}

// ─── Samples ──────────────────────────────────────────────────────────────────

export async function addSample(patientId, data) {
  const res = await fetch(`${BASE_URL}/patients/${patientId}/samples`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to add sample");
  return res.json();
}

export async function deleteSample(sampleId) {
  const res = await fetch(`${BASE_URL}/samples/${sampleId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete sample");
  return res.json();
}

// ─── Sample Records ───────────────────────────────────────────────────────────

export async function addSampleRecord(sampleId, data) {
  const res = await fetch(`${BASE_URL}/samples/${sampleId}/records`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to add record");
  return res.json();
}

export async function updateSampleRecord(recordId, data) {
  const res = await fetch(`${BASE_URL}/records/${recordId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update record");
  return res.json();
}

export async function deleteSampleRecord(recordId) {
  const res = await fetch(`${BASE_URL}/records/${recordId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete record");
  return res.json();
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export async function getDashboardSummary(period = "all") {
  const res = await fetch(`${BASE_URL}/dashboard/summary?period=${period}`);
  if (!res.ok) throw new Error("Failed to fetch dashboard summary");
  return res.json();
}

export async function getPatientSummary() {
  const res = await fetch(`${BASE_URL}/dashboard/patient-summary`);
  if (!res.ok) throw new Error("Failed to fetch patient summary");
  return res.json();
}

// Check if a patient_id string already exists
export async function getPatientByPatientId(patientId) {
  const res = await fetch(`${BASE_URL}/patients/by-patient-id/${patientId}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to check patient");
  return res.json(); // returns { id, patient_id, name, gender }
}

// Add a new sample to an existing patient (by db id)
export async function addSampleToPatient(dbId, payload) {
  const res = await fetch(`${BASE_URL}/patients/${dbId}/add-sample`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ─── Report Automation ────────────────────────────────────────────────────────

export async function getReportAutomationList() {
  const res = await fetch(`${BASE_URL}/report-automation`);
  if (!res.ok) throw new Error("Failed to fetch report automation list");
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("Invalid report automation response");
  return data;
}

// export async function uploadReportInputs(sid, { germlineFile, somaticFile, prsFile }) {
//   const formData = new FormData();
//   formData.append("germline_file", germlineFile);
//   formData.append("somatic_file", somaticFile);
//   formData.append("prs_file", prsFile);

//   const res = await fetch(`${BASE_URL}/samples/${sid}/upload-inputs`, {
//     method: "POST",
//     body: formData,
//   });
//   if (!res.ok) {
//     const err = await res.json().catch(() => ({}));
//     throw new Error(err.detail || "Failed to upload input files");
//   }
//   return res.json();
// }

export async function uploadReportInputs(sid, { germlineFile, somaticFile, prsFile }) {
  const formData = new FormData();
  if (germlineFile) formData.append("germline_file", germlineFile);
  if (somaticFile) formData.append("somatic_file", somaticFile);
  if (prsFile) formData.append("prs_file", prsFile);

  const res = await fetch(`${BASE_URL}/samples/${sid}/upload-inputs`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to upload input files");
  }
  return res.json();
}

export async function generateReport(sid) {
  const res = await fetch(`${BASE_URL}/reports/generate/${sid}`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to start report generation");
  }
  return res.json();
}

export async function getReportStatus(reportId) {
  const res = await fetch(`${BASE_URL}/reports/${reportId}`);
  if (!res.ok) throw new Error("Failed to fetch report status");
  return res.json();
}

export async function getReportStats() {
  const res = await fetch(`${BASE_URL}/reports/stats`);
  if (!res.ok) throw new Error("Failed to fetch report stats");
  return res.json();
}

export async function getCompletedReports() {
  const res = await fetch(`${BASE_URL}/reports/completed`);
  if (!res.ok) throw new Error("Failed to fetch completed reports");
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("Invalid completed reports response");
  return data;
}

// Direct-link helpers (used as href, not fetched via JS)
export function getReportDownloadUrl(reportId) {
  return `${BASE_URL}/reports/${reportId}/download`;
}

export function getReportViewUrl(reportId) {
  return `${BASE_URL}/reports/${reportId}/view`;
}

export async function cancelReport(reportId) {
  const res = await fetch(`${BASE_URL}/reports/${reportId}/cancel`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to cancel the pipeline");
  }
  return res.json();
}

export async function deleteReport(reportId) {
  const res = await fetch(`${API_BASE_URL}/reports/${reportId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || "Failed to delete report.");
  }
  return res.json().catch(() => ({}));
}

// ─── Variant Visualization ──────────────────────────────────────────────────

export async function uploadVariantFile(file, { includeLowImpact = true } = {}) {
  const formData = new FormData();
  formData.append("file", file);

  const url = `${BASE_URL}/variants/upload?include_low_impact=${includeLowImpact}`;
  const res = await fetch(url, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to upload and parse the file");
  }
  return res.json();
}