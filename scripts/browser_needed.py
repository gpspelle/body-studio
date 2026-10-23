#!/usr/bin/env python3
"""Whether CI's browser tests have anything to check: prints "true" unless every file changed since
BASE is one the page never uses (unit, JS and end-to-end tests, scripts, notes, other workflows).

    python3 scripts/browser_needed.py BASE_SHA

Anything unknown, or a base git can't compare with (a new branch, a force push), runs them.
"""
from __future__ import annotations

import subprocess
import sys

# what the page and the browser tests never read
PAGE_FREE = ("tests/unit/", "tests/js/", "tests/integration/", "scripts/", "docs/", ".claude/",
             ".github/workflows/docs.yml", ".gitignore")


def needed(changed: list) -> bool:
    if not changed:
        return True
    for f in changed:
        if f == "scripts/browser_needed.py":     # (a change to this gate runs what it gates)
            return True
        if not (f.startswith(PAGE_FREE) or (f.endswith(".md") and "/" not in f)):
            return True
    return False


def changed_files(base: str) -> list | None:
    if not base or set(base) == {"0"}:
        return None
    r = subprocess.run(["git", "diff", "--name-only", base, "HEAD"], capture_output=True, text=True)
    return [f for f in r.stdout.split("\n") if f] if r.returncode == 0 else None


def main() -> None:
    changed = changed_files(sys.argv[1] if len(sys.argv) > 1 else "")
    print("true" if changed is None or needed(changed) else "false")


if __name__ == "__main__":
    main()
