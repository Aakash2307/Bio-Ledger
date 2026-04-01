from fastapi import FastAPI, HTTPException # type: ignore
from database import get_connection, create_tables
from fastapi.middleware.cors import CORSMiddleware # type: ignore
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
    sid: Optional[str] = None 
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


# ── Date normaliser ──────────────────────────────────────────────────────────
# Accepts "28-Nov-24", "10/17/2025", "2025-10-17" and always returns YYYY-MM-DD
def normalize_date(value: str | None) -> str | None:
    if not value or not value.strip():
        return value
    value = value.strip()
    from datetime import datetime
    # Try YYYY-MM-DD already clean
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d-%b-%y", "%d-%b-%Y"):
        try:
            return datetime.strptime(value, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    # Return as-is if nothing matched (don't crash)
    return value

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


# -------------------- Dashboard --------------------

@app.get("/dashboard/summary")
def dashboard_summary(period: str = "all"):
    from datetime import date
    conn = get_connection()
    cursor = conn.cursor()
    today = date.today()

    # ── Build date filter using data_received ──
    # data_received is stored as "28-Nov-24" (DD-Mon-YY) format
    # SQLite does not parse this natively, so we use strftime + date() conversion:
    #   date(substr(dr,8,2) || '-' || ...) to convert to YYYY-MM-DD for comparison
    #
    # Conversion expression for SQLite:
    # ('20' || substr(dr,8,2) || '-' || CASE substr(dr,4,3)
    #   WHEN 'Jan' THEN '01' WHEN 'Feb' THEN '02' ... END || '-' || substr(dr,1,2))
    
    def to_iso(col):
        # Converts any stored format to YYYY-MM-DD for comparison.
        # After Excel migration all values will be YYYY-MM-DD already.
        # Also handles MM/DD/YYYY and DD-Mon-YY for any remaining old rows.
        return f"""CASE
            WHEN {col} LIKE '__/__/____' THEN
                substr({col},7,4) || '-' || substr({col},1,2) || '-' || substr({col},4,2)
            WHEN {col} LIKE '__-___-__' THEN
                '20' || substr({col},8,2) || '-' ||
                CASE substr({col},4,3)
                    WHEN 'Jan' THEN '01' WHEN 'Feb' THEN '02' WHEN 'Mar' THEN '03'
                    WHEN 'Apr' THEN '04' WHEN 'May' THEN '05' WHEN 'Jun' THEN '06'
                    WHEN 'Jul' THEN '07' WHEN 'Aug' THEN '08' WHEN 'Sep' THEN '09'
                    WHEN 'Oct' THEN '10' WHEN 'Nov' THEN '11' WHEN 'Dec' THEN '12'
                END || '-' || substr({col},1,2)
            ELSE {col}
        END"""

    # period = "all" | "YYYY-MM" (month) | "YYYY" (year)
    if len(period) == 7 and "-" in period:
        # Month filter e.g. "2026-03"
        yr, mo = period.split("-")
        next_mo = f"{yr}-{int(mo)+1:02d}" if int(mo) < 12 else f"{int(yr)+1}-01"
        date_filter = f"AND {to_iso('s.data_received')} >= '{period}-01' AND {to_iso('s.data_received')} < '{next_mo}-01'"
        patient_date_filter = f"""
            AND id IN (
                SELECT patient_ref FROM samples
                WHERE {to_iso('data_received')} >= '{period}-01'
                AND {to_iso('data_received')} < '{next_mo}-01'
            )
        """
    elif len(period) == 4 and period.isdigit():
        # Year filter e.g. "2026"
        date_filter = f"AND {to_iso('s.data_received')} >= '{period}-01-01' AND {to_iso('s.data_received')} < '{int(period)+1}-01-01'"
        patient_date_filter = f"""
            AND id IN (
                SELECT patient_ref FROM samples
                WHERE {to_iso('data_received')} >= '{period}-01-01'
                AND {to_iso('data_received')} < '{int(period)+1}-01-01'
            )
        """
    else:
        # All time
        date_filter = ""
        patient_date_filter = ""

    # ── Total patients ──
    cursor.execute(f"SELECT COUNT(*) as count FROM patients WHERE 1=1 {patient_date_filter}")
    total_patients = cursor.fetchone()["count"]

    # ── Total samples ──
    cursor.execute(f"""
        SELECT COUNT(*) as count FROM samples s
        WHERE 1=1 {date_filter}
    """)
    total_samples = cursor.fetchone()["count"]

    # ── Sequenced samples ──
    cursor.execute(f"""
        SELECT COUNT(*) as count FROM samples s
        WHERE sequencing IS NOT NULL AND sequencing != ''
        {date_filter}
    """)
    sequenced_samples = cursor.fetchone()["count"]

    # ── Case label distribution ──
    cursor.execute(f"""
        SELECT new_case_label, COUNT(*) as count
        FROM samples s
        WHERE 1=1 {date_filter}
        GROUP BY new_case_label
    """)
    case_counts = {
        row["new_case_label"]: row["count"]
        for row in cursor.fetchall()
    }

    # ── Organ type distribution ──
    cursor.execute(f"""
        SELECT p.organ_type, COUNT(s.id) as count
        FROM samples s
        JOIN patients p ON s.patient_ref = p.id
        WHERE p.organ_type IS NOT NULL AND p.organ_type != ''
        AND s.new_case_label != 'Benign'
        {date_filter}
        GROUP BY p.organ_type
    """)
    organ_counts = {
        row["organ_type"]: row["count"]
        for row in cursor.fetchall()
    }


    # ── Benign organ distribution ──
    cursor.execute(f"""
        SELECT p.organ_type, COUNT(s.id) as count
        FROM samples s
        JOIN patients p ON s.patient_ref = p.id
        WHERE s.new_case_label = 'Benign'
        AND p.organ_type IS NOT NULL AND p.organ_type != ''
        {date_filter}
        GROUP BY p.organ_type
    """)
    benign_organ_counts = {
        row["organ_type"]: row["count"]
        for row in cursor.fetchall()
    }

    conn.close()

    return {
        "total_patients": total_patients,
        "total_samples": total_samples,
        "sequenced_samples": sequenced_samples,
        "case_counts": case_counts,
        "organ_counts": organ_counts,
        "benign_organ_counts" : benign_organ_counts
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