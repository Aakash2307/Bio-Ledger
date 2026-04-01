from fastapi import FastAPI, HTTPException
from database import get_connection, create_tables
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

create_tables()


# -------------------- Models --------------------

class PatientCreate(BaseModel):
    patient_id: str
    aob_id: Optional[str] = None
    sid: Optional[str] = None
    name: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    detail_disease: Optional[str] = None
    organ_type: Optional[str] = None
    comorbidity: Optional[str] = None
    family_history: Optional[str] = None
    metastasis: Optional[str] = None
    patient_status: Optional[str] = None
    consultation: Optional[str] = None


class PatientUpdate(BaseModel):
    # patients table fields
    aob_id: Optional[str] = None
    sid: Optional[str] = None
    name: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    detail_disease: Optional[str] = None
    organ_type: Optional[str] = None
    comorbidity: Optional[str] = None
    family_history: Optional[str] = None
    metastasis: Optional[str] = None
    patient_status: Optional[str] = None
    consultation: Optional[str] = None
    # samples table fields (updates the first/primary sample)
    new_case_label: Optional[str] = None
    additional: Optional[str] = None
    source: Optional[str] = None
    sample_collection_date: Optional[str] = None
    dna_availability: Optional[str] = None
    sequencing: Optional[str] = None
    din: Optional[str] = None
    research_report: Optional[str] = None
    sequencing_partner: Optional[str] = None
    data_received: Optional[str] = None
    tmr_e: Optional[float] = None
    data_analysed_som: Optional[str] = None
    data_analysed_germ: Optional[str] = None
    sample_labeling: Optional[str] = None
    analysis: Optional[str] = None
    report_status: Optional[str] = None
    report_release_date: Optional[str] = None
    comments: Optional[str] = None


class SampleCreate(BaseModel):
    new_case_label: Optional[str] = None
    additional: Optional[str] = None
    source: Optional[str] = None
    sample_collection_date: Optional[str] = None
    dna_availability: Optional[str] = None
    sequencing: Optional[str] = None
    din: Optional[str] = None
    research_report: Optional[str] = None
    sequencing_partner: Optional[str] = None
    data_received: Optional[str] = None
    tmr_e: Optional[float] = None
    data_analysed_som: Optional[str] = None
    data_analysed_germ: Optional[str] = None
    sample_labeling: Optional[str] = None
    analysis: Optional[str] = None
    report_status: Optional[str] = None
    report_release_date: Optional[str] = None
    comments: Optional[str] = None


# -------------------- Basic Routes --------------------

@app.get("/")
def home():
    return {"message": "Patient Portal API Running"}


@app.get("/patients")
def get_patients():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT 
            p.id,
            p.patient_id,
            p.aob_id,
            p.sid,
            p.name,
            p.age,
            p.gender,
            s.new_case_label
        FROM patients p
        LEFT JOIN samples s
        ON p.id = s.patient_ref
    """)

    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


@app.get("/patients/{patient_id}")
def get_patient_details(patient_id: int):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM patients WHERE id = ?", (patient_id,))
    patient = cursor.fetchone()

    if not patient:
        conn.close()
        raise HTTPException(status_code=404, detail="Patient not found")

    cursor.execute("SELECT * FROM samples WHERE patient_ref = ?", (patient_id,))
    samples = cursor.fetchall()

    conn.close()

    return {
        "patient": dict(patient),
        "samples": [dict(sample) for sample in samples]
    }


# -------------------- Insert Routes --------------------

@app.post("/patients")
def add_patient(patient: PatientCreate):
    conn = get_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            INSERT INTO patients (
                patient_id, aob_id, sid, name, age, gender,
                detail_disease, organ_type,
                comorbidity, family_history,
                metastasis, patient_status, consultation
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            patient.patient_id,
            patient.aob_id,
            patient.sid,
            patient.name,
            patient.age,
            patient.gender,
            patient.detail_disease,
            patient.organ_type,
            patient.comorbidity,
            patient.family_history,
            patient.metastasis,
            patient.patient_status,
            patient.consultation,
        ))

        conn.commit()

    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))

    conn.close()
    return {"message": "Patient added successfully"}


@app.post("/patients/{patient_id}/samples")
def add_sample(patient_id: int, sample: SampleCreate):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM patients WHERE id = ?", (patient_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Patient not found")

    cursor.execute("""
        INSERT INTO samples (
            patient_ref, new_case_label, additional, source,
            sample_collection_date, dna_availability,
            sequencing, din, research_report,
            sequencing_partner, data_received,
            tmr_e, data_analysed_som,
            data_analysed_germ,
            sample_labeling, analysis,
            report_status, report_release_date,
            comments
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        patient_id,
        sample.new_case_label,
        sample.additional,
        sample.source,
        sample.sample_collection_date,
        sample.dna_availability,
        sample.sequencing,
        sample.din,
        sample.research_report,
        sample.sequencing_partner,
        sample.data_received,
        sample.tmr_e,
        sample.data_analysed_som,
        sample.data_analysed_germ,
        sample.sample_labeling,
        sample.analysis,
        sample.report_status,
        sample.report_release_date,
        sample.comments,
    ))

    conn.commit()
    conn.close()

    return {"message": "Sample added successfully"}


# -------------------- Update Route --------------------

@app.put("/patients/{patient_id}")
def update_patient(patient_id: int, data: PatientUpdate):
    conn = get_connection()
    cursor = conn.cursor()

    # Check patient exists
    cursor.execute("SELECT id FROM patients WHERE id = ?", (patient_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Patient not found")

    # Update patients table
    cursor.execute("""
        UPDATE patients SET
            aob_id = ?,
            sid = ?,
            name = ?,
            age = ?,
            gender = ?,
            detail_disease = ?,
            organ_type = ?,
            comorbidity = ?,
            family_history = ?,
            metastasis = ?,
            patient_status = ?,
            consultation = ?
        WHERE id = ?
    """, (
        data.aob_id,
        data.sid,
        data.name,
        data.age,
        data.gender,
        data.detail_disease,
        data.organ_type,
        data.comorbidity,
        data.family_history,
        data.metastasis,
        data.patient_status,
        data.consultation,
        patient_id,
    ))

    # Update the first/primary sample if one exists
    cursor.execute("SELECT id FROM samples WHERE patient_ref = ? ORDER BY id ASC LIMIT 1", (patient_id,))
    sample = cursor.fetchone()

    if sample:
        cursor.execute("""
            UPDATE samples SET
                new_case_label = ?,
                additional = ?,
                source = ?,
                sample_collection_date = ?,
                dna_availability = ?,
                sequencing = ?,
                din = ?,
                research_report = ?,
                sequencing_partner = ?,
                data_received = ?,
                tmr_e = ?,
                data_analysed_som = ?,
                data_analysed_germ = ?,
                sample_labeling = ?,
                analysis = ?,
                report_status = ?,
                report_release_date = ?,
                comments = ?
            WHERE id = ?
        """, (
            data.new_case_label,
            data.additional,
            data.source,
            data.sample_collection_date,
            data.dna_availability,
            data.sequencing,
            data.din,
            data.research_report,
            data.sequencing_partner,
            data.data_received,
            data.tmr_e,
            data.data_analysed_som,
            data.data_analysed_germ,
            data.sample_labeling,
            data.analysis,
            data.report_status,
            data.report_release_date,
            data.comments,
            sample["id"],
        ))

    conn.commit()

    # Return updated patient + samples
    cursor.execute("SELECT * FROM patients WHERE id = ?", (patient_id,))
    updated_patient = dict(cursor.fetchone())

    cursor.execute("SELECT * FROM samples WHERE patient_ref = ?", (patient_id,))
    updated_samples = [dict(s) for s in cursor.fetchall()]

    conn.close()

    return {
        "patient": updated_patient,
        "samples": updated_samples,
    }


# -------------------- Dashboard --------------------

@app.get("/dashboard/summary")
def dashboard_summary():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) as count FROM patients")
    total_patients = cursor.fetchone()["count"]

    cursor.execute("SELECT COUNT(*) as count FROM samples")
    total_samples = cursor.fetchone()["count"]

    cursor.execute("""
        SELECT new_case_label, COUNT(*) as count
        FROM samples
        GROUP BY new_case_label
    """)
    case_counts = {
        row["new_case_label"]: row["count"]
        for row in cursor.fetchall()
    }

    cursor.execute("""
        SELECT COUNT(*) as count FROM samples
        WHERE sequencing IS NOT NULL AND sequencing != ''
    """)
    sequenced_samples = cursor.fetchone()["count"]

    conn.close()

    return {
        "total_patients": total_patients,
        "total_samples": total_samples,
        "sequenced_samples": sequenced_samples,
        "case_counts": case_counts
    }


@app.get("/dashboard/patient-summary")
def patient_summary():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT
            p.id,
            p.patient_id,
            p.name,
            COUNT(s.id) as total_samples,
            MAX(s.sample_collection_date) as latest_sample_date
        FROM patients p
        LEFT JOIN samples s
            ON p.id = s.patient_ref
        GROUP BY p.id
    """)

    patients = cursor.fetchall()
    result = []

    for patient in patients:
        cursor.execute("""
            SELECT new_case_label, COUNT(*) as count
            FROM samples
            WHERE patient_ref = ?
            GROUP BY new_case_label
        """, (patient["id"],))

        case_breakdown = {
            row["new_case_label"]: row["count"]
            for row in cursor.fetchall()
        }

        result.append({
            "patient_id": patient["patient_id"],
            "name": patient["name"],
            "total_samples": patient["total_samples"],
            "latest_sample_date": patient["latest_sample_date"],
            "case_breakdown": case_breakdown
        })

    conn.close()
    return result