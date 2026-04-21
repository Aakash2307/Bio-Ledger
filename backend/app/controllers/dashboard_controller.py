from database import get_connection
from app.utils import to_iso_sql


def get_dashboard_summary(period: str = "all"):
    conn = get_connection()
    cursor = conn.cursor()

    # ── Date filter ──────────────────────────────────────────────────────────
    if len(period) == 7 and "-" in period:
        yr, mo = period.split("-")
        next_mo = f"{yr}-{int(mo)+1:02d}" if int(mo) < 12 else f"{int(yr)+1}-01"
        record_date_filter = (
            f"AND {to_iso_sql('sr.data_received')} >= '{period}-01' "
            f"AND {to_iso_sql('sr.data_received')} < '{next_mo}-01'"
        )
        patient_date_filter = f"""
            AND id IN (
                SELECT s.patient_ref FROM samples s
                JOIN sample_records sr ON sr.sample_ref = s.id
                WHERE {to_iso_sql('sr.data_received')} >= '{period}-01'
                AND {to_iso_sql('sr.data_received')} < '{next_mo}-01'
            )
        """
    elif len(period) == 4 and period.isdigit():
        record_date_filter = (
            f"AND {to_iso_sql('sr.data_received')} >= '{period}-01-01' "
            f"AND {to_iso_sql('sr.data_received')} < '{int(period)+1}-01-01'"
        )
        patient_date_filter = f"""
            AND id IN (
                SELECT s.patient_ref FROM samples s
                JOIN sample_records sr ON sr.sample_ref = s.id
                WHERE {to_iso_sql('sr.data_received')} >= '{period}-01-01'
                AND {to_iso_sql('sr.data_received')} < '{int(period)+1}-01-01'
            )
        """
    else:
        record_date_filter = ""
        patient_date_filter = ""

    # ── Total patients ────────────────────────────────────────────────────────
    cursor.execute(f"SELECT COUNT(*) as count FROM patients WHERE 1=1 {patient_date_filter}")
    total_patients = cursor.fetchone()["count"]

    # ── Total samples (SID level) ─────────────────────────────────────────────
    cursor.execute(f"""
    SELECT COUNT(DISTINCT s.id) as count
    FROM samples s
    JOIN sample_records sr ON sr.sample_ref = s.id
    WHERE 1=1 {record_date_filter}
""")
    total_samples = cursor.fetchone()["count"]

    # ── Sequenced records ─────────────────────────────────────────────────────
    cursor.execute(f"""
        SELECT COUNT(*) as count FROM sample_records sr
        WHERE sequencing IS NOT NULL AND sequencing != ''
        {record_date_filter}
    """)
    sequenced_samples = cursor.fetchone()["count"]

    # ── Case label distribution ───────────────────────────────────────────────
    cursor.execute(f"""
        SELECT new_case_label, COUNT(*) as count
        FROM sample_records sr
        WHERE 1=1 {record_date_filter}
        GROUP BY new_case_label
    """)
    case_counts = {row["new_case_label"]: row["count"] for row in cursor.fetchall()}

    # ── Organ type distribution (non-benign) ──────────────────────────────────
    cursor.execute(f"""
        SELECT sr.organ_type, COUNT(sr.id) as count
        FROM sample_records sr
        WHERE sr.organ_type IS NOT NULL AND sr.organ_type != ''
        AND sr.new_case_label != 'Benign'
        {record_date_filter}
        GROUP BY sr.organ_type
    """)
    organ_counts = {row["organ_type"]: row["count"] for row in cursor.fetchall()}

    # ── Benign organ distribution ─────────────────────────────────────────────
    cursor.execute(f"""
        SELECT sr.organ_type, COUNT(sr.id) as count
        FROM sample_records sr
        WHERE sr.new_case_label = 'Benign'
        AND sr.organ_type IS NOT NULL AND sr.organ_type != ''
        {record_date_filter}
        GROUP BY sr.organ_type
    """)
    benign_organ_counts = {row["organ_type"]: row["count"] for row in cursor.fetchall()}

    # ── Organ × case_label breakdown (non-benign) ─────────────────────────────
    cursor.execute(f"""
        SELECT sr.organ_type, sr.new_case_label, COUNT(sr.id) as count
        FROM sample_records sr
        WHERE sr.organ_type IS NOT NULL AND sr.organ_type != ''
        AND sr.new_case_label IS NOT NULL AND sr.new_case_label != ''
        AND sr.new_case_label != 'Benign'
        {record_date_filter}
        GROUP BY sr.organ_type, sr.new_case_label
    """)
    organ_case_breakdown = {}
    for row in cursor.fetchall():
        organ = row["organ_type"]
        label = row["new_case_label"]
        count = row["count"]
        if organ not in organ_case_breakdown:
            organ_case_breakdown[organ] = {}
        organ_case_breakdown[organ][label] = count

    # ── Organ × case_label breakdown (benign only) ────────────────────────────
    cursor.execute(f"""
        SELECT sr.organ_type, sr.new_case_label, COUNT(sr.id) as count
        FROM sample_records sr
        WHERE sr.new_case_label = 'Benign'
        AND sr.organ_type IS NOT NULL AND sr.organ_type != ''
        {record_date_filter}
        GROUP BY sr.organ_type, sr.new_case_label
    """)
    benign_organ_case_breakdown = {}
    for row in cursor.fetchall():
        organ = row["organ_type"]
        label = row["new_case_label"]
        count = row["count"]
        if organ not in benign_organ_case_breakdown:
            benign_organ_case_breakdown[organ] = {}
        benign_organ_case_breakdown[organ][label] = count

    conn.close()
    return {
        "total_patients":             total_patients,
        "total_samples":              total_samples,
        "sequenced_samples":          sequenced_samples,
        "case_counts":                case_counts,
        "organ_counts":               organ_counts,
        "benign_organ_counts":        benign_organ_counts,
        "organ_case_breakdown":       organ_case_breakdown,
        "benign_organ_case_breakdown": benign_organ_case_breakdown,
    }


def get_patient_summary():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT
            p.id,
            p.patient_id,
            p.name,
            COUNT(DISTINCT s.id) as total_samples,
            MAX(sr.sample_collection_date) as latest_sample_date
        FROM patients p
        LEFT JOIN samples s ON p.id = s.patient_ref
        LEFT JOIN sample_records sr ON sr.sample_ref = s.id
        GROUP BY p.id
    """)

    patients = cursor.fetchall()
    result = []

    for patient in patients:
        cursor.execute("""
            SELECT sr.new_case_label, COUNT(*) as count
            FROM sample_records sr
            JOIN samples s ON sr.sample_ref = s.id
            WHERE s.patient_ref = ?
            GROUP BY sr.new_case_label
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
            "case_breakdown": case_breakdown,
        })

    conn.close()
    return result