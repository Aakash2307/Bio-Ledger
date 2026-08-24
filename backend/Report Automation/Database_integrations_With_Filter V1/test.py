import pandas as pd

def compare_excels(old_file, new_file):

    old_xls = pd.ExcelFile(old_file)
    new_xls = pd.ExcelFile(new_file)

    old_sheets = set(old_xls.sheet_names)
    new_sheets = set(new_xls.sheet_names)

    print("\n📊 Sheet Comparison")
    print("Only in OLD:", old_sheets - new_sheets)
    print("Only in NEW:", new_sheets - old_sheets)

    common_sheets = old_sheets & new_sheets

    print("\n📄 Checking sheet contents...\n")

    for sheet in common_sheets:
        print(f"🔍 Sheet: {sheet}")

        old_df = pd.read_excel(old_file, sheet_name=sheet).fillna("")
        new_df = pd.read_excel(new_file, sheet_name=sheet).fillna("")

        # Normalize columns
        old_df.columns = old_df.columns.astype(str).str.strip()
        new_df.columns = new_df.columns.astype(str).str.strip()

        # Sort columns
        old_df = old_df.reindex(sorted(old_df.columns), axis=1)
        new_df = new_df.reindex(sorted(new_df.columns), axis=1)

        # Sort rows (important)
        old_df = old_df.sort_values(by=list(old_df.columns)).reset_index(drop=True)
        new_df = new_df.sort_values(by=list(new_df.columns)).reset_index(drop=True)

        # Compare shape
        if old_df.shape != new_df.shape:
            print(f"❌ Shape mismatch: OLD {old_df.shape} vs NEW {new_df.shape}")
            continue

        # Compare content
        diff = old_df.compare(new_df)

        if diff.empty:
            print("✅ Match")
        else:
            print("❌ Differences found")
            print(diff.head())

        print("-" * 40)


# 🔥 USE THIS
compare_excels("4A1804_Somatic_Results_Integrated_Somamut_new.xlsx", "4A1804_Somatic_Results_Integrated_Somamut_old.xlsx")