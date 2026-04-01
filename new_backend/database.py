import sqlite3

DB_NAME = "patients.db"


def get_connection():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def create_tables():
    conn = get_connection()
    cursor = conn.cursor()

    # =========================
    # PATIENTS
    # =========================
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS patients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id TEXT UNIQUE NOT NULL,
        aob_id TEXT,
        name TEXT,
        age INTEGER,
        gender TEXT,
        detail_disease TEXT,
        organ_type TEXT,
        comorbidity TEXT,
        family_history TEXT,
        metastasis TEXT,
        patient_status TEXT,
        consultation TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # =========================
    # SAMPLES (SID = UNIQUE)
    # =========================
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS samples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_ref INTEGER NOT NULL,
        sid TEXT NOT NULL UNIQUE,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (patient_ref)
            REFERENCES patients(id)
            ON DELETE CASCADE
    )
    """)

    # =========================
    # SAMPLE RECORDS (ALL DATA)
    # =========================
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sample_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sample_ref INTEGER NOT NULL,

        new_case_label TEXT,
        additional TEXT,
        source TEXT,
        sample_collection_date TEXT,
        dna_availability TEXT,
        sequencing TEXT,
        din TEXT,
        research_report TEXT,
        sequencing_partner TEXT,
        data_received TEXT,
        tmr_e REAL,
        old_gbp REAL,
        gbp REAL,
        data_analysed_som TEXT,
        data_analysed_germ TEXT,
        sample_labeling TEXT,
        analysis TEXT,
        report_status TEXT,
        report_release_date TEXT,
        comments TEXT,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (sample_ref)
            REFERENCES samples(id)
            ON DELETE CASCADE
    )
    """)

    # =========================
    # INDEXES
    # =========================
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_patients_patient_id ON patients(patient_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_samples_sid ON samples(sid)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_records_sample_ref ON sample_records(sample_ref)")

    conn.commit()
    conn.close()


if __name__ == "__main__":
    create_tables()
    print("✅ Database ready.")