#!/bin/bash

set -e

# ========================================
# PROJECT ROOT
# ========================================

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "========================================"
echo "        Starting Project"
echo "========================================"
echo "Project root: $PROJECT_ROOT"


# ========================================
# DATABASE / XAMPP
# ========================================

echo ""
echo "========================================"
echo "        Checking Database"
echo "========================================"

if sudo /opt/lampp/lampp status | grep -qi "MySQL is running"; then

    echo "MySQL is already running."

else

    echo "MySQL is not running."
    echo "Starting XAMPP..."

    sudo /opt/lampp/lampp start

    echo "XAMPP started."

fi


# ========================================
# BACKEND
# ========================================

BACKEND_DIR="$PROJECT_ROOT/backend"

echo ""
echo "========================================"
echo "        Starting Backend"
echo "========================================"

env -u GTK_PATH -u GTK_MODULES -u GIO_EXTRA_MODULES gnome-terminal -- bash -c "
    cd '$BACKEND_DIR'

    echo 'Starting backend...'
    echo ''

    source venv/bin/activate

    echo 'Virtual environment activated:'
    which python

    echo ''
    echo 'Starting FastAPI...'
    echo ''

    uvicorn main:app --reload

    exec bash
"


# ========================================
# FRONTEND
# ========================================

FRONTEND_DIR="$PROJECT_ROOT/frontend/my-project"

echo ""
echo "========================================"
echo "        Starting Frontend"
echo "========================================"

env -u GTK_PATH -u GTK_MODULES -u GIO_EXTRA_MODULES gnome-terminal -- bash -c "
    cd '$FRONTEND_DIR'

    echo 'Starting frontend...'
    echo ''

    npm run dev

    exec bash
"


# ========================================
# COMPLETE
# ========================================

echo ""
echo "========================================"
echo " Backend and frontend startup initiated"
echo "========================================"