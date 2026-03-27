import pandas as pd

df = pd.read_excel("patients.xlsx", sheet_name="India_Lab")

print(df.columns.tolist())