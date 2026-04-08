from fastapi import HTTPException  # type: ignore
from database import get_connection
from app.schemas.patient_schema import PatientCreate, PatientUpdate
from app.schemas.patient_schema import PatientWithSampleCreate
from app.utils import normalize_date
from app.schemas.patient_schema import PatientWithSampleUpdate


def get_all_patients():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT
            p.id,
            p.patient_id,
            p.name,
            p.gender,
            COUNT(s.id) as total_samples
        FROM patients p
        LEFT JOIN samples s ON p.id = s.patient_ref
        GROUP BY p.id
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

    sample_list = []
    for sample in samples:
        cursor.execute(
            "SELECT * FROM sample_records WHERE sample_ref = ?", (sample["id"],)
        )
        records = cursor.fetchall()
        sample_list.append({
            **dict(sample),
            "records": [dict(r) for r in records]
        })

    conn.close()
    return {
        "patient": dict(patient),
        "samples": sample_list
    }


def create_patient(patient: PatientCreate):
    conn = get_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            INSERT INTO patients (patient_id, name, gender)
            VALUES (?, ?, ?)
        """, (
            patient.patient_id,
            patient.name,
            patient.gender,
        ))
        conn.commit()
        new_id = cursor.lastrowid
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))

    conn.close()
    return {"message": "Patient created successfully", "id": new_id}


def update_patient(patient_id: int, data: PatientUpdate):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM patients WHERE id = ?", (patient_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Patient not found")

    cursor.execute("""
        UPDATE patients SET
            name = ?, gender = ?
        WHERE id = ?
    """, (
        data.name, data.gender,
        patient_id,
    ))

    conn.commit()

    cursor.execute("SELECT * FROM patients WHERE id = ?", (patient_id,))
    updated = dict(cursor.fetchone())
    conn.close()
    return {"patient": updated}


def delete_patient(patient_id: int):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM patients WHERE id = ?", (patient_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Patient not found")

    cursor.execute("DELETE FROM patients WHERE id = ?", (patient_id,))
    conn.commit()
    conn.close()
    return {"message": "Patient deleted successfully"}


def create_patient_with_sample(data: PatientWithSampleCreate):
    conn = get_connection()
    cursor = conn.cursor()

    try:
        # ── 1. Insert Patient ─────────────────────────────────────────────────
        cursor.execute("""
            INSERT INTO patients (patient_id, name, gender)
            VALUES (?, ?, ?)
        """, (
            data.patient_id,
            data.name,
            data.gender,
        ))
        patient_db_id = cursor.lastrowid

        # ── 2. Insert Sample (SID) — only if SID provided ────────────────────
        sample_db_id = None
        if data.sid:
            cursor.execute(
                "INSERT INTO samples (patient_ref, sid) VALUES (?, ?)",
                (patient_db_id, data.sid)
            )
            sample_db_id = cursor.lastrowid

        # ── 3. Insert Sample Record — only if sample was created ──────────────
        if sample_db_id:
            cursor.execute("""
                INSERT INTO sample_records (
                    sample_ref,
                    aob_id, age, detail_disease, organ_type,
                    comorbidity, family_history, metastasis,
                    patient_status, consultation,
                    new_case_label, additional, source,
                    sample_collection_date, dna_availability,
                    sequencing, din, research_report,
                    sequencing_partner, data_received,
                    tmr_e, old_gbp, gbp,
                    data_analysed_som, data_analysed_germ,
                    sample_labeling, analysis,
                    report_status, report_release_date, comments
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                sample_db_id,
                data.aob_id, data.age, data.detail_disease, data.organ_type,
                data.comorbidity, data.family_history, data.metastasis,
                data.patient_status, data.consultation,
                data.new_case_label, data.additional, data.source,
                data.sample_collection_date, data.dna_availability,
                data.sequencing, data.din, data.research_report,
                data.sequencing_partner, normalize_date(data.data_received),
                data.tmr_e, data.old_gbp, data.gbp,
                data.data_analysed_som, data.data_analysed_germ,
                data.sample_labeling, data.analysis,
                data.report_status, data.report_release_date, data.comments,
            ))

        conn.commit()

    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))

    conn.close()
    return {
        "message": "Patient and sample created successfully",
        "patient_id": patient_db_id,
        "sample_id": sample_db_id,
    }


def update_patient_with_sample(patient_id: int, data: PatientWithSampleUpdate):
    conn = get_connection()
    cursor = conn.cursor()

    try:
        # ── 1. Check patient exists ───────────────────────────────────────────
        cursor.execute("SELECT id FROM patients WHERE id = ?", (patient_id,))
        if not cursor.fetchone():
            conn.close()
            raise HTTPException(status_code=404, detail="Patient not found")

        # ── 2. Update patient ─────────────────────────────────────────────────
        cursor.execute("""
            UPDATE patients SET
                name = ?, gender = ?
            WHERE id = ?
        """, (
            data.name, data.gender,
            patient_id,
        ))

        # ── 3. Update sample SID if sample_id provided ────────────────────────
        if data.sample_id and data.sid:
            cursor.execute(
                "SELECT id FROM samples WHERE id = ? AND patient_ref = ?",
                (data.sample_id, patient_id)
            )
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="Sample not found for this patient")

            cursor.execute(
                "UPDATE samples SET sid = ? WHERE id = ?",
                (data.sid, data.sample_id)
            )

        # ── 4. Update sample record if record_id provided ─────────────────────
        if data.record_id:
            cursor.execute(
                "SELECT id FROM sample_records WHERE id = ?", (data.record_id,)
            )
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="Sample record not found")

            cursor.execute("""
                UPDATE sample_records SET
                    aob_id = ?, age = ?, detail_disease = ?, organ_type = ?,
                    comorbidity = ?, family_history = ?, metastasis = ?,
                    patient_status = ?, consultation = ?,
                    new_case_label = ?, additional = ?, source = ?,
                    sample_collection_date = ?, dna_availability = ?,
                    sequencing = ?, din = ?, research_report = ?,
                    sequencing_partner = ?, data_received = ?,
                    tmr_e = ?, old_gbp = ?, gbp = ?,
                    data_analysed_som = ?, data_analysed_germ = ?,
                    sample_labeling = ?, analysis = ?,
                    report_status = ?, report_release_date = ?, comments = ?
                WHERE id = ?
            """, (
                data.aob_id, data.age, data.detail_disease, data.organ_type,
                data.comorbidity, data.family_history, data.metastasis,
                data.patient_status, data.consultation,
                data.new_case_label, data.additional, data.source,
                data.sample_collection_date, data.dna_availability,
                data.sequencing, data.din, data.research_report,
                data.sequencing_partner, normalize_date(data.data_received),
                data.tmr_e, data.old_gbp, data.gbp,
                data.data_analysed_som, data.data_analysed_germ,
                data.sample_labeling, data.analysis,
                data.report_status, data.report_release_date, data.comments,
                data.record_id,
            ))

        conn.commit()

        # ── 5. Return updated full record ─────────────────────────────────────
        cursor.execute("SELECT * FROM patients WHERE id = ?", (patient_id,))
        updated_patient = dict(cursor.fetchone())

        cursor.execute("SELECT * FROM samples WHERE patient_ref = ?", (patient_id,))
        samples = cursor.fetchall()

        sample_list = []
        for sample in samples:
            cursor.execute(
                "SELECT * FROM sample_records WHERE sample_ref = ?", (sample["id"],)
            )
            records = cursor.fetchall()
            sample_list.append({
                **dict(sample),
                "records": [dict(r) for r in records]
            })

        conn.close()
        return {
            "patient": updated_patient,
            "samples": sample_list,
        }

    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))