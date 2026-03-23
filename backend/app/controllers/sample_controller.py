from fastapi import HTTPException
from database import get_connection
from app.schemas.patient_schema import SampleCreate
from app.utils import normalize_date


def create_sample(patient_id: int, sample: SampleCreate):
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
        normalize_date(sample.data_received),
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