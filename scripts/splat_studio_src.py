#!/usr/bin/env python3
"""Check out splat-studio at the commit pinned in pyproject.toml (for its test fakes).

    python3 scripts/splat_studio_src.py DEST     # prints DEST when done
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def pin() -> tuple[str, str]:
    m = re.search(r'"splat-studio @ git\+(\S+?)@([0-9a-f]{40})"', (ROOT / "pyproject.toml").read_text())
    if not m:
        sys.exit("pyproject.toml must pin splat-studio to a full commit hash")
    return m.group(1), m.group(2)


def main() -> None:
    dest = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / ".splat-studio-src")
    url, sha = pin()
    if not (dest / ".git").is_dir():
        subprocess.run(["git", "init", "-q", str(dest)], check=True)
    subprocess.run(["git", "-C", str(dest), "fetch", "-q", "--depth", "1", url, sha], check=True)
    subprocess.run(["git", "-C", str(dest), "checkout", "-q", "FETCH_HEAD"], check=True)
    print(dest)


if __name__ == "__main__":
    main()
