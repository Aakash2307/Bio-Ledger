from database import get_connection

def get_all_patients_service():
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
            s.id as sample_id,
            s.new_case_label, 
            s.sequencing,
            s.dna_availability,
            s.report_status
        FROM patients p
        LEFT JOIN samples s
        ON p.id = s.patient_ref
        ORDER BY p.id
    """)

    rows = cursor.fetchall()
    conn.close()

    # 🔥 FORMAT DATA HERE
    patients = {}

    for row in rows:
        pid = row["id"]

        if pid not in patients:
            patients[pid] = {
                "id": pid,
                "patient_id": row["patient_id"],
                "aob_id": row["aob_id"],
                "sid": row["sid"],
                "name": row["name"],
                "age": row["age"],
                "gender": row["gender"],
                "samples": []
            }

        # add sample if exists
        if row["sample_id"]:
            patients[pid]["samples"].append({
                "sample_id": row["sample_id"],
                "new_case_label": row["new_case_label"],
                "sequencing": row["sequencing"],
                "dna_availability": row["dna_availability"],
                "report_status": row["report_status"]
            })

    return list(patients.values())