"""Runs tests/js/matchview.test.mjs (the Compare tool's maths: where the video's frame sits over the
room, a click on it, the clock) with Node, and checks the tags' kinds are compare.py's. Skipped
when Node isn't installed."""
import re
import shutil
import subprocess
import unittest
from pathlib import Path

from body_studio import compare

ROOT = Path(__file__).resolve().parents[2]
NODE = shutil.which("node")


@unittest.skipIf(NODE is None, "node is not installed")
class MatchviewJs(unittest.TestCase):
    def test_matchview_maths(self):
        r = subprocess.run([NODE, "--test", str(ROOT / "tests" / "js" / "matchview.test.mjs")],
                           capture_output=True, text=True, timeout=120)
        self.assertEqual(r.returncode, 0, r.stdout[-4000:] + r.stderr[-2000:])
        self.assertRegex(r.stdout, r"\bfail 0\b")
        self.assertIsNone(re.search(r"\bpass 0\b", r.stdout))

    def test_same_kinds_as_the_server(self):
        js = (ROOT / "src" / "body_studio" / "static" / "matchview.js").read_text()
        kinds = re.search(r"export const KINDS = \[([^\]]*)\]", js).group(1)
        self.assertEqual(tuple(re.findall(r'"(\w+)"', kinds)), compare.KINDS)


if __name__ == "__main__":
    unittest.main()
