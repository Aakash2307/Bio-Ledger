const BASE_URL = "http://127.0.0.1:8000";

export async function getPatients() {
  const res = await fetch(`${BASE_URL}/patients`);
  if (!res.ok) throw new Error("Failed to fetch patients");
  return res.json();
}

export async function getPatientDetails(id) {
  const res = await fetch(`${BASE_URL}/patients/${id}`);
  if (!res.ok) throw new Error("Failed to fetch patient details");
  return res.json();
}

export async function addPatient(data) {
  const res = await fetch(`${BASE_URL}/patients`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) throw new Error("Failed to add patient");
  return res.json();
}

export async function addSample(patientId, data) {
  const res = await fetch(`${BASE_URL}/patients/${patientId}/samples`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) throw new Error("Failed to add sample");
  return res.json();
}

/* ---------------- DASHBOARD ---------------- */

// export async function getDashboardSummary() {
//   const res = await fetch(`${BASE_URL}/dashboard/summary`);
//   if (!res.ok) throw new Error("Failed to fetch dashboard summary");
//   return res.json();
// }

export async function getPatientSummary() {
  const res = await fetch(`${BASE_URL}/dashboard/patient-summary`);
  if (!res.ok) throw new Error("Failed to fetch patient summary");
  return res.json();
}

export async function updatePatient(id, data) {
  const res = await fetch(`${BASE_URL}/patients/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) throw new Error("Failed to update patient");
  return res.json();
}

export async function getDashboardSummary(period = "all") {
  const res = await fetch(`${BASE_URL}/dashboard/summary?period=${period}`);
  if (!res.ok) throw new Error("Failed to fetch dashboard summary");
  return res.json();
}


export async function deletePatient(id) {
  const res = await fetch(`${BASE_URL}/patients/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete patient");
  return res.json();
}