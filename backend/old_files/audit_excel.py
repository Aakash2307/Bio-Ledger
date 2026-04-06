import pandas as pd

EXCEL_FILE = "patients.xlsx"
SHEET_NAME = "India_Lab"


def clean(value):
    if pd.isna(value):
        return None
    return str(value).strip()


# =========================
# LOAD DATA
# =========================
df = pd.read_excel(EXCEL_FILE, sheet_name=SHEET_NAME)
df.columns = df.columns.str.strip()

# Add row number for tracking (VERY IMPORTANT)
df["row_number"] = df.index + 2  # +2 for Excel (header + 1-based)

print("\n📊 TOTAL ROWS:", len(df))


# =========================
# CLEAN IMPORTANT COLUMNS
# =========================
df["Patient ID"] = df["Patient ID"].apply(clean)
df["SID"] = df["SID"].apply(clean)


# =========================
# MISSING DATA ANALYSIS
# =========================
missing_patient = df["Patient ID"].isna()
missing_sid = df["SID"].isna()

missing_both = missing_patient & missing_sid
missing_only_patient = missing_patient & (~missing_sid)
missing_only_sid = (~missing_patient) & missing_sid

print("\n🚨 MISSING DATA REPORT")
print("Missing Patient ID:", missing_patient.sum())
print("Missing SID:", missing_sid.sum())
print("Missing BOTH:", missing_both.sum())
print("Only Patient ID missing:", missing_only_patient.sum())
print("Only SID missing:", missing_only_sid.sum())


# =========================
# DUPLICATE SID CHECK (FIXED)
# =========================
duplicate_sid = df["SID"].notna() & df.duplicated(subset=["SID"], keep=False)

print("\n🔁 DUPLICATE SID COUNT:", duplicate_sid.sum())


# =========================
# SID → MULTIPLE PATIENT CHECK
# =========================
sid_patient_map = df.groupby("SID")["Patient ID"].nunique()
conflict_sids = sid_patient_map[sid_patient_map > 1]

print("\n❌ SID CONFLICTS (linked to multiple patients):", len(conflict_sids))


# =========================
# EXPORT REPORT FILES
# =========================

def export_if_not_empty(dataframe, filename):
    if not dataframe.empty:
        dataframe.to_excel(filename, index=False)
        print(f"✔ Generated: {filename}")
    else:
        print(f"⚪ Skipped (no data): {filename}")


export_if_not_empty(df[missing_patient], "missing_patient_id.xlsx")
export_if_not_empty(df[missing_sid], "missing_sid.xlsx")
export_if_not_empty(df[missing_both], "missing_both.xlsx")
export_if_not_empty(df[missing_only_patient], "missing_only_patient.xlsx")
export_if_not_empty(df[missing_only_sid], "missing_only_sid.xlsx")
export_if_not_empty(df[duplicate_sid], "duplicate_sid.xlsx")
export_if_not_empty(df[df["SID"].isin(conflict_sids.index)], "sid_conflicts.xlsx")


# =========================
# FINAL SUMMARY
# =========================
print("\n📁 Audit files generated (check above)")
print("✅ Audit Complete\n")