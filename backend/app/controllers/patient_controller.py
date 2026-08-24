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

    cursor.execute("SELECT * FROM patients WHERE id = %s", (patient_id,))
    patient = cursor.fetchone()

    if not patient:
        conn.close()
        raise HTTPException(status_code=404, detail="Patient not found")

    cursor.execute("SELECT * FROM samples WHERE patient_ref = %s", (patient_id,))
    samples = cursor.fetchall()

    sample_list = []
    for sample in samples:
        cursor.execute(
            "SELECT * FROM sample_records WHERE sample_ref = %s", (sample["id"],)
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
            VALUES (%s, %s, %s)
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

    cursor.execute("SELECT id FROM patients WHERE id = %s", (patient_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Patient not found")

    cursor.execute("""
        UPDATE patients SET
            name = %s, gender = %s
        WHERE id = %s
    """, (
        data.name, data.gender,
        patient_id,
    ))

    conn.commit()

    cursor.execute("SELECT * FROM patients WHERE id = %s", (patient_id,))
    updated = dict(cursor.fetchone())
    conn.close()
    return {"patient": updated}


def delete_patient(patient_id: int):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM patients WHERE id = %s", (patient_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Patient not found")

    cursor.execute("DELETE FROM patients WHERE id = %s", (patient_id,))
    conn.commit()
    conn.close()
    return {"message": "Patient deleted successfully"}


def create_patient_with_sample(data: PatientWithSampleCreate):
    conn = get_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            INSERT INTO patients (patient_id, name, gender)
            VALUES (%s, %s, %s)
        """, (
            data.patient_id,
            data.name,
            data.gender,
        ))
        patient_db_id = cursor.lastrowid

        sample_db_id = None
        if data.sid:
            cursor.execute(
                "INSERT INTO samples (patient_ref, sid) VALUES (%s, %s)",
                (patient_db_id, data.sid)
            )
            sample_db_id = cursor.lastrowid

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
                    tmr_e, gbp,
                    data_analysed_som, data_analysed_germ,
                    sample_labeling, analysis,
                    report_status, report_release_date, comments
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                sample_db_id,
                data.aob_id, data.age, data.detail_disease, data.organ_type,
                data.comorbidity, data.family_history, data.metastasis,
                data.patient_status, data.consultation,
                data.new_case_label, data.additional, data.source,
                data.sample_collection_date, data.dna_availability,
                data.sequencing, data.din, data.research_report,
                data.sequencing_partner, normalize_date(data.data_received),
                data.tmr_e, data.gbp,
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
        cursor.execute("SELECT id FROM patients WHERE id = %s", (patient_id,))
        if not cursor.fetchone():
            conn.close()
            raise HTTPException(status_code=404, detail="Patient not found")

        cursor.execute("""
            UPDATE patients SET
                name = %s, gender = %s
            WHERE id = %s
        """, (
            data.name, data.gender,
            patient_id,
        ))

        if data.sample_id and data.sid:
            cursor.execute(
                "SELECT id FROM samples WHERE id = %s AND patient_ref = %s",
                (data.sample_id, patient_id)
            )
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="Sample not found for this patient")

            cursor.execute(
                "UPDATE samples SET sid = %s WHERE id = %s",
                (data.sid, data.sample_id)
            )

        if data.record_id:
            cursor.execute(
                "SELECT id FROM sample_records WHERE id = %s", (data.record_id,)
            )
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="Sample record not found")

            cursor.execute("""
                UPDATE sample_records SET
                    aob_id = %s, age = %s, detail_disease = %s, organ_type = %s,
                    comorbidity = %s, family_history = %s, metastasis = %s,
                    patient_status = %s, consultation = %s,
                    new_case_label = %s, additional = %s, source = %s,
                    sample_collection_date = %s, dna_availability = %s,
                    sequencing = %s, din = %s, research_report = %s,
                    sequencing_partner = %s, data_received = %s,
                    tmr_e = %s, gbp = %s,
                    data_analysed_som = %s, data_analysed_germ = %s,
                    sample_labeling = %s, analysis = %s,
                    report_status = %s, report_release_date = %s, comments = %s
                WHERE id = %s
            """, (
                data.aob_id, data.age, data.detail_disease, data.organ_type,
                data.comorbidity, data.family_history, data.metastasis,
                data.patient_status, data.consultation,
                data.new_case_label, data.additional, data.source,
                data.sample_collection_date, data.dna_availability,
                data.sequencing, data.din, data.research_report,
                data.sequencing_partner, normalize_date(data.data_received),
                data.tmr_e, data.gbp,
                data.data_analysed_som, data.data_analysed_germ,
                data.sample_labeling, data.analysis,
                data.report_status, data.report_release_date, data.comments,
                data.record_id,
            ))

        conn.commit()

        cursor.execute("SELECT * FROM patients WHERE id = %s", (patient_id,))
        updated_patient = dict(cursor.fetchone())

        cursor.execute("SELECT * FROM samples WHERE patient_ref = %s", (patient_id,))
        samples = cursor.fetchall()

        sample_list = []
        for sample in samples:
            cursor.execute(
                "SELECT * FROM sample_records WHERE sample_ref = %s", (sample["id"],)
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


def get_patient_by_patient_id(patient_id: str):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM patients WHERE patient_id = %s", (patient_id,))
    patient = cursor.fetchone()
    conn.close()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return dict(patient)


def add_sample_to_patient(patient_id: int, data: PatientWithSampleCreate):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM patients WHERE id = %s", (patient_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Patient not found")

    try:
        cursor.execute(
            "INSERT INTO samples (patient_ref, sid) VALUES (%s, %s)",
            (patient_id, data.sid)
        )
        sample_db_id = cursor.lastrowid
        print(f"✅ Sample inserted: {sample_db_id}")
        print(f"📦 Data received: {data.dict()}")

        cursor.execute("""
            INSERT INTO sample_records (
                sample_ref, aob_id, age, detail_disease, organ_type,
                comorbidity, family_history, metastasis,
                patient_status, consultation,
                new_case_label, additional, source,
                sample_collection_date, dna_availability,
                sequencing, din, research_report,
                sequencing_partner, data_received,
                tmr_e, gbp,
                data_analysed_som, data_analysed_germ,
                sample_labeling, analysis,
                report_status, report_release_date, comments
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            sample_db_id,
            data.aob_id, data.age, data.detail_disease, data.organ_type,
            data.comorbidity, data.family_history, data.metastasis,
            data.patient_status, data.consultation,
            data.new_case_label, data.additional, data.source,
            data.sample_collection_date, data.dna_availability,
            data.sequencing, data.din, data.research_report,
            data.sequencing_partner, normalize_date(data.data_received),
            data.tmr_e, data.gbp,
            data.data_analysed_som, data.data_analysed_germ,
            data.sample_labeling, data.analysis,
            data.report_status, data.report_release_date, data.comments,
        ))
        print(f"✅ Sample record inserted successfully")
        conn.commit()
        print(f"✅ Committed")
    except Exception as e:
        conn.rollback()
        conn.close()
        print(f"❌ ERROR: {e}")
        raise HTTPException(status_code=400, detail=str(e))

    conn.close()
    return get_patient_by_id(patient_id)