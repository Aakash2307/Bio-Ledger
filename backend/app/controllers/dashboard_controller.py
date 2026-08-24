from database import get_connection
from app.utils import to_iso_sql
from app.normalize_organ import normalize_organ_type


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



    # ── Source distribution ───────────────────────────────────────────────────
    cursor.execute(f"""
        SELECT sr.source, COUNT(*) as count
        FROM sample_records sr
        WHERE sr.source IS NOT NULL AND sr.source != ''
        {record_date_filter}
        GROUP BY sr.source
    """)
    source_counts = {row["source"]: row["count"] for row in cursor.fetchall()}

    # ── Single organ x case_label query (all labels including Benign) ─────────
    # We fetch everything in one shot and derive all 4 dicts in Python.
    # This ensures that when e.g. "Colon" (Benign) normalizes to "Colon cancer",
    # its Benign case label is correctly carried into the merged organ bucket.
    cursor.execute(f"""
        SELECT sr.organ_type, sr.new_case_label, COUNT(sr.id) as count
        FROM sample_records sr
        WHERE sr.organ_type IS NOT NULL AND sr.organ_type != ''
        AND sr.new_case_label IS NOT NULL AND sr.new_case_label != ''
        {record_date_filter}
        GROUP BY sr.organ_type, sr.new_case_label
    """)

    # all_organ_case holds every organ -> { case_label -> count } after normalization
    all_organ_case: dict = {}

    for row in cursor.fetchall():
        organ = normalize_organ_type(row["organ_type"])
        label = row["new_case_label"]
        count = row["count"]
        if organ not in all_organ_case:
            all_organ_case[organ] = {}
        all_organ_case[organ][label] = all_organ_case[organ].get(label, 0) + count

    # Derive the 4 dicts from all_organ_case
    organ_counts = {}
    benign_organ_counts = {}
    organ_case_breakdown = {}
    benign_organ_case_breakdown = {}

    for organ, label_counts in all_organ_case.items():
        non_benign_total = sum(c for lbl, c in label_counts.items() if lbl != "Benign")
        benign_total = label_counts.get("Benign", 0)

        if non_benign_total > 0:
            organ_counts[organ] = non_benign_total
            organ_case_breakdown[organ] = {
                lbl: c for lbl, c in label_counts.items() if lbl != "Benign"
            }

        if benign_total > 0:
            benign_organ_counts[organ] = benign_total
            benign_organ_case_breakdown[organ] = {"Benign": benign_total}

    conn.close()
    return {
        "total_patients":              total_patients,
        "total_samples":               total_samples,
        "sequenced_samples":           sequenced_samples,
        "case_counts":                 case_counts,
        "source_counts":               source_counts,
        "organ_counts":                organ_counts,
        "benign_organ_counts":         benign_organ_counts,
        "organ_case_breakdown":        organ_case_breakdown,
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