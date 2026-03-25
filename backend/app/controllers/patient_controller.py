from fastapi import HTTPException # type: ignore
from database import get_connection
from app.schemas.patient_schema import PatientCreate, PatientUpdate, SampleCreate
from app.utils import normalize_date
# from app.services.patient_service import get_all_patients_service


def get_all_patients():
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


def get_patient_by_id(patient_id: int):
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


def create_patient(patient: PatientCreate):
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
    cursor.execute(
        "SELECT id FROM samples WHERE patient_ref = ? ORDER BY id ASC LIMIT 1",
        (patient_id,)
    )
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
            normalize_date(data.data_received),
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



def delete_patient(patient_id: int):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM patients WHERE id = ?", (patient_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Patient not found")

    # Delete samples first (foreign key constraint)
    cursor.execute("DELETE FROM samples WHERE patient_ref = ?", (patient_id,))
    cursor.execute("DELETE FROM patients WHERE id = ?", (patient_id,))

    conn.commit()
    conn.close()
    return {"message": "Patient deleted successfully"}