"""Runs tests/js/matchview.test.mjs (the Compare tool's maths: where the video's frame sits over the
room, a click on it, the clock) with Node, and checks the tags' kinds are compare.py's. Skipped
when Node isn't installed."""
import re
import unittest
from pathlib import Path

from body_studio import compare
from tests.unit.node import needs_node, run_js

ROOT = Path(__file__).resolve().parents[2]


@needs_node
class MatchviewJs(unittest.TestCase):
    def test_matchview_maths(self):
        run_js(self, "matchview", timeout=120)

    def test_same_kinds_as_the_server(self):
        js = (ROOT / "src" / "body_studio" / "static" / "matchview.js").read_text()
        kinds = re.search(r"export const KINDS = \[([^\]]*)\]", js).group(1)
        self.assertEqual(tuple(re.findall(r'"(\w+)"', kinds)), compare.KINDS)


if __name__ == "__main__":
    unittest.main()
