import sqlite3

DB_NAME = "patients.db"


def get_connection():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row

    # Enforce foreign key constraints in SQLite
    conn.execute("PRAGMA foreign_keys = ON")

    return conn


def create_tables():
    conn = get_connection()
    cursor = conn.cursor()

    # ------------------ Patients Table ------------------
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS patients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id TEXT UNIQUE NOT NULL,
        aob_id TEXT,
        sid TEXT,
        name TEXT NOT NULL,
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

    # ------------------ Samples Table ------------------
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS samples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_ref INTEGER NOT NULL,
        new_case_label TEXT  NULL,
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
        data_analysed_som TEXT,
        data_analysed_germ TEXT,
        sample_labeling TEXT,
        analysis TEXT,
        report_status TEXT,
        report_release_date TEXT,
        comments TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (patient_ref)
            REFERENCES patients(id)
            ON DELETE CASCADE
    )
    """)

    # ------------------ Indexes (Important for Dashboard) ------------------

    cursor.execute("""
    CREATE INDEX IF NOT EXISTS idx_samples_patient_ref
    ON samples(patient_ref)
    """)

    cursor.execute("""
    CREATE INDEX IF NOT EXISTS idx_samples_case_label
    ON samples(new_case_label)
    """)

    conn.commit()
    conn.close()


if __name__ == "__main__":
    create_tables()
    print("Database tables created successfully.")