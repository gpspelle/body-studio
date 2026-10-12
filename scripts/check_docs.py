#!/usr/bin/env python3
"""Fail when a change touches user-facing code but not the README or docs/.

    python3 scripts/check_docs.py origin/main     # compares HEAD with the merge base

Opt out for one PR with a line starting `No docs needed:` in the PR description (read from
the PR_BODY environment variable in CI). Same rule as splat-studio.
"""
from __future__ import annotations

import os
import re
import subprocess
import sys
from fnmatch import fnmatch

USER_FACING = [
    "src/body_studio/static/*",
    "src/body_studio/__main__.py",
    "src/body_studio/pipeline.py",
    "src/body_studio/server.py",
    "src/body_studio/library.py",
]
DOCS = ["README.md", "docs/*"]
OPT_OUT = re.compile(r"^\s*no docs needed:\s*\S", re.I | re.M)


def problems(changed: list, pr_body: str = "") -> list:
    code = [p for p in changed if any(fnmatch(p, g) for g in USER_FACING)]
    if not code or any(fnmatch(p, g) for p in changed for g in DOCS) or OPT_OUT.search(pr_body or ""):
        return []
    return code


def main() -> int:
    base = sys.argv[1] if len(sys.argv) > 1 else "origin/main"
    changed = subprocess.run(["git", "diff", "--name-only", f"{base}...HEAD"], check=True,
                             capture_output=True, text=True).stdout.split()
    code = problems(changed, os.environ.get("PR_BODY", ""))
    if not code:
        print("Docs check passed.")
        return 0
    print("These user-facing files changed, but README.md and docs/ did not:")
    print("\n".join(f"  {p}" for p in code))
    print("\nUpdate the README and, if the page looks different, run `python3 scripts/screenshots.py`.\n"
          "If nothing a user sees changed, add `No docs needed: <reason>` to the PR description. See AGENTS.md.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
