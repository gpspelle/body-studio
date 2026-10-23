"""CI runs the browser tests in shards side by side: each test must be in exactly one of them."""
import re
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import browser_needed  # noqa: E402


class BrowserShards(unittest.TestCase):
    def test_every_browser_test_is_in_one_shard(self):
        ci = (ROOT / ".github" / "workflows" / "ci.yml").read_text()
        browser = ci[ci.index("\n  browser:\n"):]
        matrix = browser[browser.index("matrix:"):browser.index("\n    env:")]
        sharded = re.findall(r"\btest_\w+", matrix)
        tests = re.findall(r"^    def (test_\w+)", (ROOT / "tests" / "browser" / "test_viewer.py").read_text(), re.M)
        self.assertEqual(len(sharded), len(set(sharded)), "a test in two shards")
        self.assertEqual(sorted(sharded), sorted(tests))


class BrowserNeeded(unittest.TestCase):
    """CI skips the browser tests only when every change is one the page never uses."""

    def test_page_free_changes_skip_them(self):
        self.assertFalse(browser_needed.needed(["tests/unit/test_rig.py", "tests/js/pose.test.mjs",
                                                "scripts/screenshots.py", "CHANGELOG.md", "docs/room.md"]))

    def test_anything_the_page_uses_runs_them(self):
        for f in ("src/body_studio/static/pose.js", "src/body_studio/rig.py", "tests/browser/test_viewer.py",
                  "tests/fakes/makehuman.py", "pyproject.toml", ".github/workflows/ci.yml",
                  "scripts/browser_needed.py", "src/body_studio/static/notes.md", "something_new.txt"):
            self.assertTrue(browser_needed.needed(["README.md", f]), f)

    def test_no_base_to_compare_with_runs_them(self):
        self.assertTrue(browser_needed.needed([]))
        for base in ("", "0" * 40, "not-a-commit"):
            r = subprocess.run([sys.executable, str(ROOT / "scripts" / "browser_needed.py"), base],
                               cwd=ROOT, capture_output=True, text=True)
            self.assertEqual(r.stdout.strip(), "true", base)

    def test_the_browser_job_waits_for_it(self):
        ci = (ROOT / ".github" / "workflows" / "ci.yml").read_text()
        browser = ci[ci.index("\n  browser:\n"):]
        self.assertIn("needs.changes.outputs.browser == 'true'", browser)


if __name__ == "__main__":
    unittest.main()
