#!/usr/bin/env python3
import subprocess
import sys
import os

from config import PROJECT_ROOT, GERMLINE_DIR

GERMLINE_SCRIPT = os.path.join(GERMLINE_DIR, "germline_V4.py")


def main():
    print("\n==============================")
    print("  GERMLINE PIPELINE RUN       ")
    print("==============================")

    if not os.path.exists(GERMLINE_SCRIPT):
        raise FileNotFoundError(f"Missing script: {GERMLINE_SCRIPT}")

    ret = subprocess.call(
        [sys.executable, GERMLINE_SCRIPT],
        cwd=PROJECT_ROOT   # 🔥 critical fix
    )

    if ret != 0:
        raise SystemExit("❌ Germline pipeline failed")

    print("\n==============================")
    print(" ✅ GERMLINE COMPLETED        ")
    print("==============================\n")


if __name__ == "__main__":
    main()
