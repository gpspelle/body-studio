"""CI runs the browser tests in shards side by side: each test must be in exactly one of them."""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


class BrowserShards(unittest.TestCase):
    def test_every_browser_test_is_in_one_shard(self):
        ci = (ROOT / ".github" / "workflows" / "ci.yml").read_text()
        browser = ci[ci.index("\n  browser:\n"):]
        matrix = browser[browser.index("matrix:"):browser.index("\n    env:")]
        sharded = re.findall(r"\btest_\w+", matrix)
        tests = re.findall(r"^    def (test_\w+)", (ROOT / "tests" / "browser" / "test_viewer.py").read_text(), re.M)
        self.assertEqual(len(sharded), len(set(sharded)), "a test in two shards")
        self.assertEqual(sorted(sharded), sorted(tests))


if __name__ == "__main__":
    unittest.main()
