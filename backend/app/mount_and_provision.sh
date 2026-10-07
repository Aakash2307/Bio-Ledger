#!/bin/bash

set -e

ENV_FILE="/home/vedantjoshi/Desktop/vedant/Github/Bio-Ledger/backend/.env"
# ENV_FILE path changed from "/home/ngs/Desktop/SKY/Website/backend/.env" to "/home/vedantjoshi/Desktop/vedant/Github/Bio-Ledger/backend/.env" after merging

if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: .env file not found: $ENV_FILE"
    exit 1
fi

# Load .env
set -a
source "$ENV_FILE"
set +a

echo "Creating mount point at ${MOUNT_POINT}..."
mkdir -p "${MOUNT_POINT}"

# Check if already mounted
if mountpoint -q "${MOUNT_POINT}"; then
    echo "${MOUNT_POINT} is already mounted."
else
    echo "Mounting ${SMB_SHARE}..."

    mount -t cifs "${SMB_SHARE}" "${MOUNT_POINT}" \
        -o "username=${SMB_USER},password=${SMB_PASSWORD},uid=1000,gid=1000"

    echo "Mounted successfully."
fi

# Target directory
TARGET_DIR="${MOUNT_POINT}/Mibiome/Bioledger/data/sample_data"

if [ ! -d "${TARGET_DIR}" ]; then
    echo "ERROR: ${TARGET_DIR} does not exist."
    exit 1
fi

echo "Confirmed target directory:"
echo "${TARGET_DIR}"

export SAMPLE_DATA_DIR="${TARGET_DIR}"

# Check Python
if [ ! -x "${VENV_PYTHON}" ]; then
    echo "ERROR: venv Python not found:"
    echo "${VENV_PYTHON}"
    exit 1
fi

# Check provision script
if [ ! -f "${PROVISION_SCRIPT}" ]; then
    echo "ERROR: provision script not found:"
    echo "${PROVISION_SCRIPT}"
    exit 1
fi

echo "Using Python:"
echo "${VENV_PYTHON}"

echo "Running:"
echo "${PROVISION_SCRIPT}"

"${VENV_PYTHON}" "${PROVISION_SCRIPT}"