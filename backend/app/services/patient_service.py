from database import get_connection


def get_all_patients_service():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT 
            p.id,
            p.patient_id,
            p.name,
            p.age,
            p.gender,
            s.id as sample_id,
            s.new_case_label
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
                "name": row["name"],
                "age": row["age"],
                "gender": row["gender"],
                "samples": []
            }

        # add sample if exists
        if row["sample_id"]:
            patients[pid]["samples"].append({
                "sample_id": row["sample_id"],
                "case_label": row["new_case_label"]
            })

    return list(patients.values())