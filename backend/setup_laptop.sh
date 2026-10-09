#!/usr/bin/env bash
# =====================================================================
# setup_laptop.sh - one-shot setup of auto-provisioning on a laptop
#
# Put this file in the backend folder (next to main.py) and run:
#     bash setup_laptop.sh            # code already merged
#     bash setup_laptop.sh --merge    # merge the feature branch first
#
# Safe to re-run: it never overwrites an existing .env value, never
# deletes data, and skips steps that are already done.
# Windows: run it in Git Bash or WSL.
# =====================================================================
set -euo pipefail

BRANCH="${PROVISION_BRANCH:-feature/auto-provisioning}"
DO_MERGE=false

for arg in "$@"; do
    case "$arg" in
        --merge) DO_MERGE=true ;;
        -h|--help)
            sed -n '2,12p' "$0"
            exit 0 ;;
        *) echo "Unknown option: $arg (use --merge or --help)"; exit 1 ;;
    esac
done

step() { printf '\n==> %s\n' "$*"; }
ok()   { printf '    ok: %s\n' "$*"; }
warn() { printf '    WARNING: %s\n' "$*"; }
die()  { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

cd "$(dirname "$0")"
[ -f main.py ] && [ -f database.py ] || die "Run this from the backend folder (main.py and database.py not found)."

# ---------------------------------------------------------------------
# 1. Optional: merge the feature branch
# ---------------------------------------------------------------------
if $DO_MERGE; then
    step "Merging origin/${BRANCH} into the current branch"
    git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "Not a git repository."
    if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
        die "You have uncommitted changes. Commit or stash them, then re-run."
    fi
    git fetch origin
    if ! git merge --no-edit "origin/${BRANCH}"; then
        git merge --abort || true
        die "Merge conflict (usually main.py or database.py). Merge was undone.
Resolve it by hand: keep BOTH your lines and the new ones
(load_dotenv block, start_provisioning() call, UNIQUE KEY line),
commit, then re-run this script without --merge."
    fi
    ok "merged"
fi

# ---------------------------------------------------------------------
# 2. Check the merged code is really there
# ---------------------------------------------------------------------
step "Checking code files"
[ -f app/services/provisioning.py ] || die "app/services/provisioning.py is missing. Merge the branch first (run with --merge)."
grep -q "start_provisioning" main.py   || die "main.py does not call start_provisioning(). Merge/resolve main.py first."
grep -q "load_dotenv"        database.py || die "database.py does not call load_dotenv(). Merge/resolve database.py first."
ok "provisioning.py, main.py and database.py look right"

# ---------------------------------------------------------------------
# 3. Python environment + packages
# ---------------------------------------------------------------------
step "Python environment"
if command -v python3 >/dev/null 2>&1; then PY=python3
elif command -v python >/dev/null 2>&1; then PY=python
else die "Python not found. Install Python 3 first."; fi

if [ -z "${VIRTUAL_ENV:-}" ]; then
    if [ ! -d venv ]; then
        "$PY" -m venv venv
        ok "created venv/"
    fi
    if   [ -f venv/bin/activate ];     then . venv/bin/activate
    elif [ -f venv/Scripts/activate ]; then . venv/Scripts/activate
    else die "venv exists but has no activate script. Delete venv/ and re-run."; fi
    PY=python
    ok "activated venv/"
else
    PY=python
    ok "using active environment: $VIRTUAL_ENV"
fi

if [ -f requirements.txt ]; then
    pip install -q -r requirements.txt
    ok "installed requirements.txt"
fi
pip install -q python-dotenv pymysql
ok "python-dotenv and pymysql installed"

# ---------------------------------------------------------------------
# 4. .env
# ---------------------------------------------------------------------
step "Environment file (.env)"
if [ ! -f .env ]; then
    echo "    No .env found - enter your LOCAL MySQL details."
    read -rp "    DB host [127.0.0.1]: " DB_HOST;  DB_HOST="${DB_HOST:-127.0.0.1}"
    read -rp "    DB port [3306]: "      DB_PORT;  DB_PORT="${DB_PORT:-3306}"
    read -rp "    DB user [root]: "      DB_USER;  DB_USER="${DB_USER:-root}"
    read -rsp "    DB password (hidden): " DB_PASSWORD; echo
    read -rp "    DB name [tzar_bio]: "  DB_NAME;  DB_NAME="${DB_NAME:-tzar_bio}"
    case "$DB_PASSWORD" in *"'"*) die "Passwords containing a single quote are not supported by this script. Edit .env by hand." ;; esac
    {
        echo "DB_HOST=${DB_HOST}"
        echo "DB_PORT=${DB_PORT}"
        echo "DB_USER=${DB_USER}"
        echo "DB_PASSWORD='${DB_PASSWORD}'"
        echo "DB_NAME=${DB_NAME}"
    } > .env
    ok "created .env"
else
    ok ".env already exists - keeping your values"
fi

# add the laptop settings only if they are missing
add_default() {
    if ! grep -qE "^$1=" .env; then
        printf '%s=%s\n' "$1" "$2" >> .env
        ok "added $1=$2"
    fi
}
add_default REQUIRE_MOUNT    false
add_default MOUNT_POINT      ./local_data
add_default SAMPLE_DATA_DIR  ./local_data/sample_data

if grep -qE '^REQUIRE_MOUNT=true' .env; then
    warn "REQUIRE_MOUNT=true in .env: provisioning will be skipped unless an SMB share is mounted. Set it to false on a laptop."
fi

# never let .env be committed
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    if ! git check-ignore -q .env; then
        echo ".env" >> .gitignore
        ok "added .env to .gitignore"
    fi
fi

# ---------------------------------------------------------------------
# 5. Database: create DB/tables, add UNIQUE key on sample_records.sample_ref
# ---------------------------------------------------------------------
step "Database setup"
"$PY" - <<'PYEOF'
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
import pymysql

load_dotenv(Path(".env"))

host = os.getenv("DB_HOST", "127.0.0.1")
port = int(os.getenv("DB_PORT", "3306"))
user = os.getenv("DB_USER")
password = os.getenv("DB_PASSWORD") or ""
db = os.getenv("DB_NAME", "tzar_bio")

try:
    conn = pymysql.connect(host=host, port=port, user=user, password=password)
except Exception as e:
    sys.exit(f"ERROR: cannot connect to MySQL at {host}:{port} as '{user}': {e}\n"
             f"Check that MySQL is running and fix DB_* in .env, then re-run.")

with conn.cursor() as cur:
    cur.execute(f"CREATE DATABASE IF NOT EXISTS `{db}`")
conn.close()
print(f"    ok: database '{db}' is available")

sys.path.insert(0, os.getcwd())
from database import create_tables, add_report_automation_schema, get_connection

create_tables()
add_report_automation_schema()
print("    ok: tables are in place")

conn = get_connection()
try:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT index_name
            FROM information_schema.statistics
            WHERE table_schema = DATABASE()
              AND table_name = 'sample_records'
              AND non_unique = 0
            GROUP BY index_name
            HAVING COUNT(*) = 1 AND MAX(column_name) = 'sample_ref'
            """
        )
        if cur.fetchone():
            print("    ok: UNIQUE key on sample_records.sample_ref already exists")
        else:
            cur.execute(
                "SELECT sample_ref, COUNT(*) AS c FROM sample_records "
                "GROUP BY sample_ref HAVING c > 1"
            )
            dups = cur.fetchall()
            if dups:
                print("\nERROR: duplicate sample_records rows block the UNIQUE key:")
                for d in dups:
                    print(f"  sample_ref={d['sample_ref']}  rows={d['c']}")
                print("Remove the extra rows (keep one per sample_ref), then re-run.")
                sys.exit(2)
            cur.execute(
                "ALTER TABLE sample_records ADD UNIQUE KEY uq_sample_ref (sample_ref)"
            )
            conn.commit()
            print("    ok: added UNIQUE key uq_sample_ref")
finally:
    conn.close()
PYEOF

# ---------------------------------------------------------------------
# 6. Run provisioning once to prove it works
# ---------------------------------------------------------------------
step "Test run of provisioning"
"$PY" - <<'PYEOF'
import os
import sys
sys.path.insert(0, os.getcwd())
from app.services.provisioning import provision_all
provision_all()
PYEOF

cat <<'EOF'

==> Done.
    Start the backend the usual way, for example:
        uvicorn main:app --reload
    On every start you should see a line like:
        [provision] samples=... new_folders=... already_there=... failed=0
    Folders appear under ./local_data/sample_data/raw/
EOF
