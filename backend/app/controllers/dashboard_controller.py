from database import get_connection
from app.utils import to_iso_sql


def get_dashboard_summary(period: str = "all"):
    conn = get_connection()
    cursor = conn.cursor()

    # ── Build date filter based on period ──
    # period = "all" | "YYYY-MM" (month) | "YYYY" (year)
    if len(period) == 7 and "-" in period:
        yr, mo = period.split("-")
        next_mo = f"{yr}-{int(mo)+1:02d}" if int(mo) < 12 else f"{int(yr)+1}-01"
        date_filter = (
            f"AND {to_iso_sql('s.data_received')} >= '{period}-01' "
            f"AND {to_iso_sql('s.data_received')} < '{next_mo}-01'"
        )
        patient_date_filter = f"""
            AND id IN (
                SELECT patient_ref FROM samples
                WHERE {to_iso_sql('data_received')} >= '{period}-01'
                AND {to_iso_sql('data_received')} < '{next_mo}-01'
            )
        """
    elif len(period) == 4 and period.isdigit():
        date_filter = (
            f"AND {to_iso_sql('s.data_received')} >= '{period}-01-01' "
            f"AND {to_iso_sql('s.data_received')} < '{int(period)+1}-01-01'"
        )
        patient_date_filter = f"""
            AND id IN (
                SELECT patient_ref FROM samples
                WHERE {to_iso_sql('data_received')} >= '{period}-01-01'
                AND {to_iso_sql('data_received')} < '{int(period)+1}-01-01'
            )
        """
    else:
        date_filter = ""
        patient_date_filter = ""

    # ── Total patients ──
    cursor.execute(f"SELECT COUNT(*) as count FROM patients WHERE 1=1 {patient_date_filter}")
    total_patients = cursor.fetchone()["count"]

    # ── Total samples ──
    cursor.execute(f"SELECT COUNT(*) as count FROM samples s WHERE 1=1 {date_filter}")
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
    case_counts = {row["new_case_label"]: row["count"] for row in cursor.fetchall()}

    # ── Organ type distribution (non-benign) ──
    cursor.execute(f"""
        SELECT p.organ_type, COUNT(s.id) as count
        FROM samples s
        JOIN patients p ON s.patient_ref = p.id
        WHERE p.organ_type IS NOT NULL AND p.organ_type != ''
        AND s.new_case_label != 'Benign'
        {date_filter}
        GROUP BY p.organ_type
    """)
    organ_counts = {row["organ_type"]: row["count"] for row in cursor.fetchall()}

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
    benign_organ_counts = {row["organ_type"]: row["count"] for row in cursor.fetchall()}

    conn.close()

    return {
        "total_patients": total_patients,
        "total_samples": total_samples,
        "sequenced_samples": sequenced_samples,
        "case_counts": case_counts,
        "organ_counts": organ_counts,
        "benign_organ_counts": benign_organ_counts,
    }


def get_patient_summary():
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
        LEFT JOIN samples s ON p.id = s.patient_ref
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
            "case_breakdown": case_breakdown,
        })

    conn.close()
    return result