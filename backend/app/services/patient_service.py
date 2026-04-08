from database import get_connection


def get_all_patients_service():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT
            p.id,
            p.patient_id,
            p.name,
            p.gender,
            s.id          AS sample_id,
            s.sid,
            sr.id         AS record_id,
            sr.aob_id,
            sr.age,
            sr.new_case_label,
            sr.sequencing,
            sr.dna_availability,
            sr.report_status
        FROM patients p
        LEFT JOIN samples s
            ON p.id = s.patient_ref
        LEFT JOIN sample_records sr
            ON sr.sample_ref = s.id
        ORDER BY p.id, s.id, sr.id
    """)

    rows = cursor.fetchall()
    conn.close()

    # FORMAT DATA — group into nested patient → samples → records
    patients = {}

    for row in rows:
        pid = row["id"]

        # --- Patient level ---
        if pid not in patients:
            patients[pid] = {
                "id":         pid,
                "patient_id": row["patient_id"],
                "name":       row["name"],
                "gender":     row["gender"],
                "samples":    {}
            }

        # --- Sample level ---
        sid = row["sample_id"]
        if sid is not None:
            if sid not in patients[pid]["samples"]:
                patients[pid]["samples"][sid] = {
                    "sample_id": sid,
                    "sid":       row["sid"],
                    "records":   []
                }

            # --- Record level ---
            if row["record_id"] is not None:
                patients[pid]["samples"][sid]["records"].append({
                    "record_id":        row["record_id"],
                    "aob_id":           row["aob_id"],
                    "age":              row["age"],
                    "new_case_label":   row["new_case_label"],
                    "sequencing":       row["sequencing"],
                    "dna_availability": row["dna_availability"],
                    "report_status":    row["report_status"],
                })

    # Convert inner samples dict → list before returning
    result = []
    for patient in patients.values():
        patient["samples"] = list(patient["samples"].values())
        result.append(patient)

    return result