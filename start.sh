#!/bin/bash

set -e

# Project root = wherever this script is located
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "========================================"
echo "        Starting Project"
echo "========================================"
echo "Project root: $PROJECT_ROOT"

# ========================================
# BACKEND
# ========================================

BACKEND_DIR="$PROJECT_ROOT/backend"

gnome-terminal -- bash -c "
    cd '$BACKEND_DIR'

    echo 'Starting backend...'

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

gnome-terminal -- bash -c "
    cd '$FRONTEND_DIR'

    echo 'Starting frontend...'
    echo ''

    npm run dev

    exec bash
"

echo ""
echo "Backend and frontend startup initiated."