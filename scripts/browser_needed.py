#!/usr/bin/env python3
"""Which of CI's browser test shards have anything to check, as a JSON list: a shard is left out
when every file changed since BASE is one the page never uses (unit, JS and end-to-end tests,
scripts, notes) or belongs to a feature that shard's tests never open (the decor, the tattoo
studio's room, the progress panel).

    python3 scripts/browser_needed.py BASE_SHA        # ["clothes", "rooms", "body"]

Anything shared (posing, walking, the page itself, the server) or unknown, or a base git can't
compare with (a new branch, a force push), runs them all.
"""
from __future__ import annotations

import json
import subprocess
import sys

SHARDS = ("clothes", "rooms", "body")       # as in .github/workflows/ci.yml
# what the page and the browser tests never read
PAGE_FREE = ("tests/unit/", "tests/js/", "tests/integration/", "scripts/", "docs/", ".claude/",
             ".github/workflows/docs.yml", ".gitignore")
S = "src/body_studio/"
# a feature's own files: nothing outside it imports them
FEATURES = {
    "decor": (S + "decor.py", S + "photo3d.py", S + "sample_venue.py", S + "static/decor.js",
              S + "static/decorate.js", S + "static/decorlook.js", S + "static/decorpics.js"),
    "studio": (S + "sample_studio.py", S + "static/parlour.js", S + "static/flash/"),
    "progress": (S + "history.py", S + "measure.py", S + "static/progress.js"),
}
# the features each shard's tests never open (rooms has the menu test, which opens every mode)
SKIPS = {"clothes": {"decor", "studio", "progress"}, "body": {"decor", "studio"}, "rooms": set()}


def feature(f: str) -> str | None:
    for name, files in FEATURES.items():
        if f.startswith(files):
            return name
    return None


def shards(changed: list) -> list:
    if not changed:
        return list(SHARDS)
    touched = set()                 # the features changed; "" for anything shared or unknown
    for f in changed:
        if f == "scripts/browser_needed.py":     # (a change to this gate runs what it gates)
            touched.add("")
        elif not (f.startswith(PAGE_FREE) or (f.endswith(".md") and "/" not in f)):
            touched.add(feature(f) or "")
    return [s for s in SHARDS if touched - SKIPS[s]]


def changed_files(base: str) -> list | None:
    if not base or set(base) == {"0"}:
        return None
    r = subprocess.run(["git", "diff", "--name-only", base, "HEAD"], capture_output=True, text=True)
    return [f for f in r.stdout.split("\n") if f] if r.returncode == 0 else None


def main() -> None:
    changed = changed_files(sys.argv[1] if len(sys.argv) > 1 else "")
    print(json.dumps(list(SHARDS) if changed is None else shards(changed)))


if __name__ == "__main__":
    main()
