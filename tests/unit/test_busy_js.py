"""Runs tests/js/busy.test.mjs (when the spinner over the body shows, what it says, when it goes)
with Node. Skipped when Node isn't installed."""
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NODE = shutil.which("node")


@unittest.skipIf(NODE is None, "node is not installed")
class BusyJs(unittest.TestCase):
    def test_busy(self):
        r = subprocess.run([NODE, "--test", str(ROOT / "tests" / "js" / "busy.test.mjs")],
                           capture_output=True, text=True, timeout=120)
        self.assertEqual(r.returncode, 0, r.stdout[-4000:] + r.stderr[-2000:])
        self.assertRegex(r.stdout, r"\bfail 0\b")
        self.assertIsNone(re.search(r"\bpass 0\b", r.stdout))


if __name__ == "__main__":
    unittest.main()
