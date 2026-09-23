#!/bin/bash
# mount_and_provision.sh
#
# 1. Mounts the SMB share to a local mountpoint.
# 2. Runs provision_sample_folders.py against the real mounted path.
#
# Edit the four placeholder values below, then run:
#   chmod +x mount_and_provision.sh
#   sudo ./mount_and_provision.sh

set -e  # stop immediately if any step fails

# ---- EDIT THESE ----
SMB_USER="your_username"          # <-- change this
SMB_PASSWORD="your_password"      # <-- change this
SMB_SHARE="//10.10.2.7/genome-data"
MOUNT_POINT="/mnt/genome-data"
# ---------------------

echo "Creating mount point at ${MOUNT_POINT} (if not already present)..."
mkdir -p "${MOUNT_POINT}"

# Skip mounting if something is already mounted there
if mountpoint -q "${MOUNT_POINT}"; then
    echo "${MOUNT_POINT} is already mounted -- skipping mount step."
else
    echo "Mounting ${SMB_SHARE} to ${MOUNT_POINT}..."
    mount -t cifs "${SMB_SHARE}" "${MOUNT_POINT}" \
        -o username="${SMB_USER}",password="${SMB_PASSWORD}",uid=$(id -u),gid=$(id -g)
    echo "Mounted successfully."
fi

# Sanity check: the target folder must actually be reachable now
TARGET_DIR="${MOUNT_POINT}/Mibiome/Bioledger/data/sample_data"
if [ ! -d "${TARGET_DIR}" ]; then
    echo "ERROR: ${TARGET_DIR} does not exist on the mounted share."
    echo "Check the folder path under the share is correct, then re-run."
    exit 1
fi
echo "Confirmed target directory exists: ${TARGET_DIR}"

# Point the python script at the REAL mounted path (not smb://) and run it.
#
# IMPORTANT: this script is run with `sudo` for the mount step above, but
# `sudo` does NOT inherit your activated venv -- it runs a plain system
# python3 with no pandas installed. So we explicitly call the venv's own
# python3 binary here instead of a bare `python3` / `python3.11` etc.
export SAMPLE_DATA_DIR="${TARGET_DIR}"
VENV_PYTHON="/home/ngs/Desktop/BioLedger/backend/venv/bin/python3"

if [ ! -x "${VENV_PYTHON}" ]; then
    echo "ERROR: venv python not found at ${VENV_PYTHON}"
    echo "Update VENV_PYTHON in this script to your actual venv path."
    exit 1
fi

echo "Running provision_sample_folders.py using ${VENV_PYTHON}..."
"${VENV_PYTHON}" provision_sample_folders.py