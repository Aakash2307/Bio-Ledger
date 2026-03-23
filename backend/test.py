import pandas as pd

df = pd.read_excel("patients.xlsx", sheet_name="India_Lab")
missing = df[df["Patient ID"].isna() & df["New Case label"].notna()]
print(f"Rows with no Patient ID but have a Case Label: {len(missing)}")
print(missing[["Patient ID", "New Case label", "Name" , "SID"]].to_string())