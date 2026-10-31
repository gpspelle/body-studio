"""Runs the page's JS tests (tests/js/<name>.test.mjs) with Node, for the test_<name>_js.py modules.
Skipped where Node isn't installed."""
import os
import re
import shutil
import subprocess
import unittest
from pathlib import Path

JS = Path(__file__).resolve().parents[1] / "js"
NODE = shutil.which("node")
needs_node = unittest.skipIf(NODE is None, "node is not installed")


def run_js(case: unittest.TestCase, *names: str, env: dict = None, timeout: int = 300):
    """Runs tests/js/<name>.test.mjs for each name (with `env` added to the environment); fails `case`
    unless every test passed and at least one ran."""
    r = subprocess.run([NODE, "--test", *(str(JS / (n + ".test.mjs")) for n in names)],
                       env={**os.environ, **(env or {})}, capture_output=True, text=True, timeout=timeout)
    case.assertEqual(r.returncode, 0, r.stdout[-6000:] + r.stderr[-2000:])
    case.assertRegex(r.stdout, r"\bfail 0\b")          # "# fail 0" (TAP) or "ℹ fail 0" (spec reporter)
    case.assertIsNone(re.search(r"\bpass 0\b", r.stdout))
