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