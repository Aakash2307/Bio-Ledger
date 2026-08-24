#!/usr/bin/env python3
import os
import shutil

# =========================
# SAFE PATH SETUP
# =========================
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MAIN_FOLDER = os.path.join(SCRIPT_DIR, "Output", "somatic")

KEYWORD = "Integrated_Somamut"

# Toggle this to True for testing (no deletions)
DRY_RUN = False


def extract_and_clean(main_folder):
    if not os.path.exists(main_folder):
        print(f"❌ Folder not found: {main_folder}")
        return

    print(f"\n📁 Target directory locked: {main_folder}")

    for folder in os.listdir(main_folder):
        folder_path = os.path.join(main_folder, folder)

        if not os.path.isdir(folder_path):
            continue

        print(f"\n📂 Processing: {folder_path}")

        for file in os.listdir(folder_path):
            file_path = os.path.join(folder_path, file)

            if not os.path.isfile(file_path):
                continue

            # =========================
            # TARGET FILE
            # =========================
            if KEYWORD in file and file.endswith(".xlsx"):
                dest_path = os.path.join(main_folder, file)

                base, ext = os.path.splitext(file)
                counter = 1
                while os.path.exists(dest_path):
                    dest_path = os.path.join(
                        main_folder, f"{base}_{counter}{ext}"
                    )
                    counter += 1

                print(f"✅ Moving: {file} → {dest_path}")

                if not DRY_RUN:
                    shutil.move(file_path, dest_path)

            # =========================
            # DELETE OTHER FILES
            # =========================
            else:
                print(f"🗑 Deleting: {file}")
                if not DRY_RUN:
                    os.remove(file_path)

        # =========================
        # CLEAN EMPTY FOLDER
        # =========================
        if not os.listdir(folder_path):
            print(f"🧹 Removing empty folder: {folder_path}")
            if not DRY_RUN:
                os.rmdir(folder_path)
        else:
            print(f"⚠️ Folder not empty (skipped): {folder_path}")

    print("\n🎉 Extraction + Cleanup completed!")


if __name__ == "__main__":
    extract_and_clean(MAIN_FOLDER)