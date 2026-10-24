#!/usr/bin/env python3
"""Run the unit tests side by side: each test class in its own process, as many at once as there
are CPUs. Same tests as `python -m unittest discover -s tests/unit -t .`, in a fraction of the time.

    python3 scripts/test.py                 # every unit test
    python3 scripts/test.py --changed       # only those that touch what changed since origin/main
    python3 scripts/test.py --changed main  # ... since another base
    python3 scripts/test.py test_rig test_pose_js   # these modules

--changed picks a test module when it, or a JS test it runs, names a file that changed (`pose.js`,
`rig`, `i18n` ...). A change to something every test leans on (pyproject.toml, tests/fakes, the
test runner itself) runs them all. CI always runs them all.
"""
from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
import time
import unittest
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))                    # to find the test classes in tests.unit
UNIT = ROOT / "tests" / "unit"
# the slowest modules start first, so they aren't left running alone at the end
SLOW = ("test_wardrobe", "test_server", "test_pose_js", "test_rig", "test_anny_fit")
# changes that can break any test
EVERYTHING = ("pyproject.toml", "tests/fakes/", "tests/__init__.py", "tests/unit/__init__.py", "scripts/test.py")


def classes(modules: list) -> list:
    """The test classes to run, as dotted names, so a slow module's classes run side by side."""
    loader = unittest.TestLoader()
    out = []
    for m in modules:
        suite = loader.loadTestsFromName("tests.unit." + m)
        names = []

        def walk(s):
            for t in s:
                if isinstance(t, unittest.TestSuite):
                    walk(t)
                else:
                    name = "%s.%s" % (type(t).__module__, type(t).__name__)
                    if name not in names:
                        names.append(name)
        walk(suite)
        # a module that fails to import shows up as one class of unittest.loader's own: run it to see why
        out += [n.replace("unittest.loader._FailedTest", "tests.unit." + m) for n in names]
    return list(dict.fromkeys(out))


def changed_files(base: str) -> list:
    def git(*args):
        r = subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)
        return r.stdout.split("\n") if r.returncode == 0 else []
    files = git("diff", "--name-only", base + "...HEAD") + git("diff", "--name-only", "HEAD")
    files += git("ls-files", "--others", "--exclude-standard")
    return sorted({f for f in files if f})


def pick(changed: list, modules: list) -> list:
    """The test modules a change touches."""
    if any(f.startswith(EVERYTHING) for f in changed):
        return modules
    words = set()
    for f in changed:
        p = Path(f)
        if f.startswith("tests/unit/") and p.stem in modules:
            words.add(p.stem)
        elif f.startswith(("src/", "tests/js/", "scripts/", ".github/")):
            stem = p.name.split(".")[0]          # pose.js, pose.test.mjs, rig.py -> pose, rig
            if stem not in ("__init__", "__main__", "index"):
                words.add(stem)
            if p.parent.parent.name == "static":   # static/decor/shapes.js -> decor
                words.add(p.parent.name)
            if f.startswith(".github/"):
                words.add("ci")
    picked = []
    for m in modules:
        text = (UNIT / (m + ".py")).read_text()
        # the JS tests a module runs count as its own text
        for js in re.findall(r"(\w+)\.test\.mjs", text):
            path = ROOT / "tests" / "js" / (js + ".test.mjs")
            if path.exists():
                text += path.read_text()
        if m in words or any(re.search(r"\b%s\b" % re.escape(w), text) for w in words):
            picked.append(m)
    return picked


def run(name: str) -> tuple:
    start = time.time()
    r = subprocess.run([sys.executable, "-m", "unittest", name], cwd=ROOT, capture_output=True, text=True)
    return name, r.returncode, time.time() - start, r.stdout + r.stderr


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("modules", nargs="*", help="test modules (test_rig ...); all when none")
    ap.add_argument("--changed", nargs="?", const="origin/main", metavar="BASE",
                    help="only the tests for what changed since BASE (default origin/main)")
    ap.add_argument("-j", "--jobs", type=int, default=os.cpu_count() or 2)
    a = ap.parse_args(argv)

    modules = sorted(p.stem for p in UNIT.glob("test_*.py"))
    if a.modules:
        modules = [m for m in modules if m in a.modules]
    if a.changed:
        changed = changed_files(a.changed)
        modules = pick(changed, modules)
        print("changed: %d files, so %d test modules: %s" % (len(changed), len(modules), " ".join(modules) or "none"))
    if not modules:
        return 0
    names = sorted(classes(modules), key=lambda n: n.split(".")[2] not in SLOW)
    start, failed, ran = time.time(), [], 0
    with ThreadPoolExecutor(max_workers=max(1, a.jobs)) as pool:
        for done in as_completed([pool.submit(run, n) for n in names]):
            name, code, took, out = done.result()
            m = re.search(r"Ran (\d+) test", out)
            ran += int(m.group(1)) if m else 0
            print("%-6s %5.1fs  %s" % ("ok" if code == 0 else "FAIL", took, name), flush=True)
            if code:
                failed.append((name, out))
    for name, out in failed:
        print("\n" + "=" * 70 + "\n" + name + "\n" + out[-6000:])
    print("\n%d tests in %d classes, %.0fs, %s" % (ran, len(names), time.time() - start,
                                                     "%d classes failed" % len(failed) if failed else "OK"))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
