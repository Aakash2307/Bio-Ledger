from fastapi import HTTPException # type: ignore
from database import get_connection
from app.schemas.patient_schema import SampleCreate, SampleRecordCreate, SampleRecordUpdate , PatientWithSampleCreate
from app.utils import normalize_date


def create_sample(patient_id: int, sample: SampleCreate):
    """Create a new SID entry under a patient."""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM patients WHERE id = ?", (patient_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Patient not found")

    cursor.execute("SELECT id FROM samples WHERE sid = ?", (sample.sid,))
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="SID already exists")

    cursor.execute(
        "INSERT INTO samples (patient_ref, sid) VALUES (?, ?)",
        (patient_id, sample.sid)
    )
    conn.commit()
    sample_id = cursor.lastrowid
    conn.close()
    return {"message": "Sample created successfully", "sample_id": sample_id}


def get_samples_by_patient(patient_id: int):
    """Get all SIDs and their records for a patient."""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM patients WHERE id = ?", (patient_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Patient not found")

    cursor.execute("SELECT * FROM samples WHERE patient_ref = ?", (patient_id,))
    samples = cursor.fetchall()

    result = []
    for sample in samples:
        cursor.execute(
            "SELECT * FROM sample_records WHERE sample_ref = ?", (sample["id"],)
        )
        records = cursor.fetchall()
        result.append({
            **dict(sample),
            "records": [dict(r) for r in records]
        })

    conn.close()
    return result


def delete_sample(sample_id: int):
    """Delete a SID and all its records."""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM samples WHERE id = ?", (sample_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Sample not found")

    cursor.execute("DELETE FROM samples WHERE id = ?", (sample_id,))
    conn.commit()
    conn.close()
    return {"message": "Sample deleted successfully"}


# ── SAMPLE RECORDS ────────────────────────────────────────────────────────────

def create_sample_record(sample_id: int, record: SampleRecordCreate):
    """Add a new test/sequencing record under a SID."""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM samples WHERE id = ?", (sample_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Sample not found")

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
        sample_id,
        record.aob_id, record.age, record.detail_disease, record.organ_type,
        record.comorbidity, record.family_history, record.metastasis,
        record.patient_status, record.consultation,
        record.new_case_label, record.additional, record.source,
        record.sample_collection_date, record.dna_availability,
        record.sequencing, record.din, record.research_report,
        record.sequencing_partner, normalize_date(record.data_received),
        record.tmr_e, record.old_gbp, record.gbp,
        record.data_analysed_som, record.data_analysed_germ,
        record.sample_labeling, record.analysis,
        record.report_status, record.report_release_date, record.comments,
    ))
    conn.commit()
    record_id = cursor.lastrowid
    conn.close()
    return {"message": "Record created successfully", "record_id": record_id}


def update_sample_record(record_id: int, record: SampleRecordUpdate):
    """Update a specific sample record."""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM sample_records WHERE id = ?", (record_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Record not found")

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
        record.aob_id, record.age, record.detail_disease, record.organ_type,
        record.comorbidity, record.family_history, record.metastasis,
        record.patient_status, record.consultation,
        record.new_case_label, record.additional, record.source,
        record.sample_collection_date, record.dna_availability,
        record.sequencing, record.din, record.research_report,
        record.sequencing_partner, normalize_date(record.data_received),
        record.tmr_e, record.old_gbp, record.gbp,
        record.data_analysed_som, record.data_analysed_germ,
        record.sample_labeling, record.analysis,
        record.report_status, record.report_release_date, record.comments,
        record_id,
    ))
    conn.commit()
    conn.close()
    return {"message": "Record updated successfully"}


def delete_sample_record(record_id: int):
    """Delete a specific sample record."""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM sample_records WHERE id = ?", (record_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Record not found")

    cursor.execute("DELETE FROM sample_records WHERE id = ?", (record_id,))
    conn.commit()
    conn.close()
    return {"message": "Record deleted successfully"}


def add_sample_to_patient(patient_id: int, data: PatientWithSampleCreate):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM patients WHERE id = ?", (patient_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Patient not found")

    try:
        # Insert new sample
        cursor.execute(
            "INSERT INTO samples (patient_ref, sid) VALUES (?, ?)",
            (patient_id, data.sid)
        )
        sample_db_id = cursor.lastrowid

        # Insert record with all per-sample fields
        cursor.execute("""
            INSERT INTO sample_records (
                sample_ref, aob_id, age, detail_disease, organ_type,
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
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    return {"message": "Sample added successfully", "sample_id": sample_db_id}