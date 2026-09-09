import pymysql # type: ignore
import pymysql.cursors # type: ignore
from datetime import date

DB_CONFIG = {
    "host": "127.0.0.1",
    "user": "root",
    "password": "root123",
    "database": "tzar_bio",
    "port": 3307,
    "cursorclass": pymysql.cursors.DictCursor,
    "autocommit": False,
}

def get_connection():
    conn = pymysql.connect(**DB_CONFIG)
    return conn

def create_tables():
    conn = get_connection()
    cursor = conn.cursor()

    # =========================
    # PATIENTS
    # =========================
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS patients (
        id INT AUTO_INCREMENT PRIMARY KEY,
        patient_id VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255),
        gender VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
    """)

    # =========================
    # SAMPLES (SID = UNIQUE)
    # =========================
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS samples (
        id INT AUTO_INCREMENT PRIMARY KEY,
        patient_ref INT NOT NULL,
        sid VARCHAR(255) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (patient_ref)
            REFERENCES patients(id)
            ON DELETE CASCADE
    ) ENGINE=InnoDB
    """)

    # =========================
    # SAMPLE RECORDS (ALL DATA)
    # =========================
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sample_records (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sample_ref INT NOT NULL,
        aob_id VARCHAR(255),
        age VARCHAR(50),
        detail_disease TEXT,
        organ_type VARCHAR(255),
        comorbidity TEXT,
        family_history TEXT,
        metastasis TEXT,
        patient_status VARCHAR(255),
        consultation TEXT,
        new_case_label VARCHAR(255),
        additional TEXT,
        source VARCHAR(255),
        sample_collection_date VARCHAR(255),
        dna_availability VARCHAR(255),
        sequencing VARCHAR(255),
        din VARCHAR(255),
        research_report TEXT,
        sequencing_partner VARCHAR(255),
        data_received VARCHAR(255),
        tmr_e VARCHAR(50),
        gbp VARCHAR(50),
        data_analysed_som VARCHAR(255),
        data_analysed_germ VARCHAR(255),
        sample_labeling VARCHAR(255),
        analysis TEXT,
        report_status VARCHAR(255),
        report_release_date VARCHAR(255),
        comments TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sample_ref)
            REFERENCES samples(id)
            ON DELETE CASCADE
    ) ENGINE=InnoDB
    """)

    # =========================
    # INDEXES (safe to rerun)
    # =========================
    for index_sql in [
        "CREATE INDEX idx_patients_patient_id ON patients(patient_id)",
        "CREATE INDEX idx_samples_sid ON samples(sid)",
        "CREATE INDEX idx_records_sample_ref ON sample_records(sample_ref)",
    ]:
        try:
            cursor.execute(index_sql)
        except Exception as e:
            if "Duplicate key name" not in str(e):
                raise

    conn.commit()
    conn.close()


# =========================================================
# REPORT AUTOMATION - SCHEMA ADDITIONS (additive, safe to rerun)
# =========================================================
def add_report_automation_schema():
    conn = get_connection()
    cursor = conn.cursor()

    # the pipeline needs 3 pre-processed files per sample, not a raw VCF:
    # germline xlsx, somatic xlsx, PRS input xlsx
    for col in ["germline_path", "somatic_path", "prs_path"]:
        try:
            cursor.execute(f"ALTER TABLE sample_records ADD COLUMN {col} VARCHAR(500)")
        except Exception as e:
            if "Duplicate column name" not in str(e):
                raise

    # reports: one row per report-generation attempt (job history/log)
    # `stage` holds a human-readable "which step is it on right now" string
    # (e.g. "Step 3 of 5: PRS Processing"), updated live while status stays
    # 'processing' so the UI can show real pipeline position instead of a
    # simulated progress bar.
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS reports (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sample_ref INT NOT NULL,
        status ENUM('queued','processing','completed','failed') DEFAULT 'queued',
        stage VARCHAR(255),
        file_path VARCHAR(500),
        error_log TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP NULL,
        FOREIGN KEY (sample_ref)
            REFERENCES samples(id)
            ON DELETE CASCADE
    ) ENGINE=InnoDB
    """)

    try:
        cursor.execute("CREATE INDEX idx_reports_sample_ref ON reports(sample_ref)")
    except Exception as e:
        if "Duplicate key name" not in str(e): # type: ignore
            raise

    conn.commit()
    conn.close()


# =========================================================
# REPORT AUTOMATION - HELPERS
# =========================================================

def set_sample_input_file(sid: str, file_type: str, file_path: str):
    """Attach an uploaded input file's path to a sample (by sid).
    file_type must be one of: 'germline', 'somatic', 'prs'.
    If the sample exists but has no sample_records row yet, one is created."""
    if file_type not in ("germline", "somatic", "prs"):
        raise ValueError("file_type must be 'germline', 'somatic', or 'prs'")

    column = f"{file_type}_path"
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(f"""
            UPDATE sample_records sr
            JOIN samples s ON sr.sample_ref = s.id
            SET sr.{column} = %s
            WHERE s.sid = %s
        """, (file_path, sid))

        if cursor.rowcount == 0:
            cursor.execute("SELECT id FROM samples WHERE sid = %s", (sid,))
            sample_row = cursor.fetchone()
            if not sample_row:
                conn.rollback()
                raise ValueError(f"No sample found with sid='{sid}'")

            sample_ref = sample_row["id"]
            cursor.execute(
                "INSERT INTO sample_records (sample_ref) VALUES (%s)",
                (sample_ref,)
            )
            cursor.execute(f"""
                UPDATE sample_records
                SET {column} = %s
                WHERE sample_ref = %s
            """, (file_path, sample_ref))

        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def get_sample_by_sid(sid: str):
    """Fetch sample + its sample_record data (including all 3 input file paths) by sid."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT s.id AS sample_id, s.sid, s.patient_ref,
               sr.id AS record_id, sr.germline_path, sr.somatic_path, sr.prs_path,
               sr.report_status, sr.report_release_date
        FROM samples s
        JOIN sample_records sr ON sr.sample_ref = s.id
        WHERE s.sid = %s
    """, (sid,))
    row = cursor.fetchone()
    conn.close()
    return row


def create_report_record(sample_ref: int):
    """Insert a new job-log row into reports, status='queued'."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO reports (sample_ref, status) VALUES (%s, 'queued')",
        (sample_ref,)
    )
    report_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return report_id


def update_report_status(report_id: int, status: str, file_path: str = None, error_log: str = None, stage: str = None):
    """Update a reports row's status/result, and mirror the simple status
    onto sample_records.report_status so existing UI/reads stay consistent.

    `stage` is optional and independent of `status` — pass it whenever you
    know the pipeline's current human-readable position (e.g. while status
    stays 'processing') so it gets recorded even when status itself hasn't
    changed on this call."""
    conn = get_connection()
    cursor = conn.cursor()

    if status == "completed":
        cursor.execute(
            "UPDATE reports SET status=%s, file_path=%s, stage=%s, completed_at=NOW() WHERE id=%s",
            (status, file_path, stage, report_id)
        )
    elif status == "failed":
        cursor.execute(
            "UPDATE reports SET status=%s, error_log=%s, stage=%s WHERE id=%s",
            (status, error_log, stage, report_id)
        )
    elif stage is not None:
        cursor.execute(
            "UPDATE reports SET status=%s, stage=%s WHERE id=%s",
            (status, stage, report_id)
        )
    else:
        cursor.execute(
            "UPDATE reports SET status=%s WHERE id=%s",
            (status, report_id)
        )

    # mirror onto sample_records so report_status/report_release_date stay in sync
    cursor.execute("SELECT sample_ref FROM reports WHERE id=%s", (report_id,))
    row = cursor.fetchone()
    if row:
        sample_ref = row["sample_ref"]
        mirrored_status = {
            "queued": "Queued",
            "processing": "Processing",
            "completed": "Completed",
            "failed": "Failed",
        }.get(status, status)

        if status == "completed":
            cursor.execute(
                "UPDATE sample_records SET report_status=%s, report_release_date=%s WHERE sample_ref=%s",
                (mirrored_status, str(date.today()), sample_ref)
            )
        else:
            cursor.execute(
                "UPDATE sample_records SET report_status=%s WHERE sample_ref=%s",
                (mirrored_status, sample_ref)
            )

    conn.commit()
    conn.close()

def add_cancel_status_to_reports():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        ALTER TABLE reports
        MODIFY COLUMN status ENUM('queued','processing','completed','failed','cancelled')
        DEFAULT 'queued'
    """)
    conn.commit()
    conn.close()


def add_stage_column_to_reports():
    """Migration for existing databases created before `stage` existed on
    reports. Safe to rerun — a duplicate-column error is swallowed."""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("ALTER TABLE reports ADD COLUMN stage VARCHAR(255)")
    except Exception as e:
        if "Duplicate column name" not in str(e):
            raise
    conn.commit()
    conn.close()


def get_report(report_id: int):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM reports WHERE id=%s", (report_id,))
    row = cursor.fetchone()
    conn.close()
    return row


def get_report_stats():
    """Counts for the Reports page header: total completed, currently in process."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) AS total FROM reports WHERE status = 'completed'")
    completed = cursor.fetchone()["total"]
    cursor.execute("SELECT COUNT(*) AS total FROM reports WHERE status IN ('queued', 'processing')")
    in_process = cursor.fetchone()["total"]
    conn.close()
    return {"total_completed": completed, "total_in_process": in_process}


def get_completed_reports_list():
    """List of samples with a successfully completed report, for the Reports page table."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT p.patient_id, p.name, s.sid, sr.organ_type,
               sr.report_release_date,
               r.id AS report_id, r.file_path, r.completed_at
        FROM reports r
        JOIN samples s ON r.sample_ref = s.id
        JOIN patients p ON s.patient_ref = p.id
        LEFT JOIN sample_records sr ON sr.id = (
            SELECT id FROM sample_records
            WHERE sample_ref = s.id
            ORDER BY report_release_date DESC, id DESC
            LIMIT 1
        )
        WHERE r.status = 'completed'
        AND r.id = (
            SELECT id FROM reports r2
            WHERE r2.sample_ref = r.sample_ref AND r2.status = 'completed'
            ORDER BY r2.completed_at DESC
            LIMIT 1
        )
        ORDER BY r.completed_at DESC
    """)
    rows = cursor.fetchall()
    conn.close()
    return rows


def get_total_reports_generated():
    """Count of successfully completed reports — feeds the dashboard's
    'Total Reports Generated' stat."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) AS total FROM reports WHERE status = 'completed'")
    row = cursor.fetchone()
    conn.close()
    return row["total"] if row else 0


def get_report_automation_list():
    """Full list for the Report Automation page: patient + sample + status."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT p.patient_id, p.name, s.sid, sr.organ_type,
               sr.germline_path, sr.somatic_path, sr.prs_path,
               sr.report_status, sr.report_release_date,
               s.id AS sample_ref,
               r.id AS latest_report_id,
               r.status AS latest_report_job_status
        FROM patients p
        JOIN samples s ON s.patient_ref = p.id
        LEFT JOIN sample_records sr ON sr.id = (
            SELECT id FROM sample_records
            WHERE sample_ref = s.id
            ORDER BY report_release_date DESC, id DESC
            LIMIT 1
        )
        LEFT JOIN reports r ON r.id = (
            SELECT id FROM reports
            WHERE sample_ref = s.id
            ORDER BY created_at DESC
            LIMIT 1
        )
        ORDER BY p.created_at DESC
    """)
    rows = cursor.fetchall()
    conn.close()
    return rows


def delete_report_row(report_id: int):
    """Delete a report row by id."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM reports WHERE id = %s", (report_id,))
    conn.commit()
    conn.close()


def sync_sample_report_status_after_delete(sample_ref: int):
    """After a reports row is deleted, recompute sample_records.report_status
    from whatever report (if any) is now the most recent for this sample.
    If there's no report left at all, clears the status/release date back
    to unset so the sample shows as 'Not Generated' again."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT status FROM reports
        WHERE sample_ref = %s
        ORDER BY created_at DESC
        LIMIT 1
    """, (sample_ref,))
    latest = cursor.fetchone()

    if latest is None:
        cursor.execute(
            "UPDATE sample_records SET report_status=NULL, report_release_date=NULL WHERE sample_ref=%s",
            (sample_ref,)
        )
    else:
        mirrored_status = {
            "queued": "Queued",
            "processing": "Processing",
            "completed": "Completed",
            "failed": "Failed",
            "cancelled": "Cancelled",
        }.get(latest["status"], latest["status"])
        cursor.execute(
            "UPDATE sample_records SET report_status=%s WHERE sample_ref=%s",
            (mirrored_status, sample_ref)
        )

    conn.commit()
    conn.close()


if __name__ == "__main__":
    create_tables()
    add_report_automation_schema()
    add_cancel_status_to_reports()
    add_stage_column_to_reports()
    print("✅ MySQL database ready.")