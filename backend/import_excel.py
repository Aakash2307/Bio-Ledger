import pandas as pd
from database import get_connection, create_tables

EXCEL_FILE = "patients.xlsx"
SHEET_NAME = "India_Lab"


def clean_value(value):
    if pd.isna(value):
        return None
    return str(value).strip()


create_tables()

conn = get_connection()
cursor = conn.cursor()

df = pd.read_excel(EXCEL_FILE, sheet_name=SHEET_NAME)

skipped_patients = 0
inserted_patients = 0
inserted_samples = 0
skipped_samples = 0

for _, row in df.iterrows():

    if pd.isna(row.get("Patient ID")):
        skipped_patients += 1
        continue

    patient_id_value = clean_value(row.get("Patient ID"))

    cursor.execute("SELECT id FROM patients WHERE patient_id = ?", (patient_id_value,))
    existing_patient = cursor.fetchone()

    if existing_patient:
        patient_db_id = existing_patient["id"]
    else:
        cursor.execute("""
            INSERT INTO patients (
                patient_id, aob_id, sid, name, age, gender,
                detail_disease, organ_type,
                comorbidity, family_history,
                metastasis, patient_status, consultation
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            patient_id_value,
            clean_value(row.get("AOB ID")),
            clean_value(row.get("SID")),
            clean_value(row.get("Name")),
            clean_value(row.get("Age")),
            clean_value(row.get("Gender")),
            clean_value(row.get("Detail Disease")),
            clean_value(row.get("Organ Type")),
            clean_value(row.get("Comorbidity")),
            clean_value(row.get("Family history")),
            clean_value(row.get("Metastasis")),
            clean_value(row.get("Patient status")),
            clean_value(row.get("Consultation")),
        ))
        patient_db_id = cursor.lastrowid
        inserted_patients += 1

    new_case_label = clean_value(row.get("New Case label"))

    if new_case_label:
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
            patient_db_id,
            new_case_label,
            clean_value(row.get("Additional")),
            clean_value(row.get("Source")),
            clean_value(row.get("Sample Collection Date")),
            clean_value(row.get("DNA availability")),
            clean_value(row.get("Sequencing")),
            clean_value(row.get("DIN")),
            clean_value(row.get("Research/Report")),
            clean_value(row.get("Sequencing partner (E)")),
            clean_value(row.get("Data received (E)")),
            clean_value(row.get("TMR-E  (Gbp)")),
            clean_value(row.get("Data analysed-E (Som)")),
            clean_value(row.get("Data analysed-E (Germ)")),
            clean_value(row.get("Sample lebeling")),
            clean_value(row.get("Analysis")),
            clean_value(row.get("Report (made/release)")),
            clean_value(row.get("Report Release Date")),
            clean_value(row.get("Comments (report sample ID)")),
        ))
        inserted_samples += 1
    else:
        skipped_samples += 1

conn.commit()
conn.close()

print(f"✅ Import complete!")
print(f"   Patients inserted : {inserted_patients}")
print(f"   Patients skipped  : {skipped_patients} (no Patient ID)")
print(f"   Samples inserted  : {inserted_samples}")
print(f"   Samples skipped   : {skipped_samples} (no Case Label)")