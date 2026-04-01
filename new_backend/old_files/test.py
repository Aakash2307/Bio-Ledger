import pandas as pd

df = pd.read_excel("patients.xlsx", sheet_name="India_Lab")
missing = df[df["Patient ID"].isna() & df["New Case label"].notna()]
print(f"Rows with no Patient ID but have a Case Label: {len(missing)}")
print(missing[["Patient ID", "New Case label", "Name" , "SID"]].to_string())

output_df = missing[["Name", "SID", "Patient ID", "New Case label", ]]

# Save to Excel
output_df.to_excel("missing_patient_ids.xlsx", index=False)

print("Data exported to missing_patient_ids.xlsx")