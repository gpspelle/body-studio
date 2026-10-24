"""CI runs the browser tests in shards side by side: each test file must be in exactly one of them."""
import json
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
        tests = [f.stem for f in (ROOT / "tests" / "browser").glob("test_*.py")]
        self.assertEqual(len(sharded), len(set(sharded)), "a test file in two shards")
        self.assertEqual(sorted(sharded), sorted(tests))


class BrowserNeeded(unittest.TestCase):
    """CI leaves out a browser shard only when every change is one its tests never use."""

    def test_page_free_changes_skip_them_all(self):
        self.assertEqual(browser_needed.shards(["tests/unit/test_rig.py", "tests/js/pose.test.mjs",
                                                "scripts/screenshots.py", "CHANGELOG.md", "docs/room.md"]), [])

    def test_shared_or_unknown_changes_run_them_all(self):
        for f in ("src/body_studio/static/pose.js", "src/body_studio/static/walk.js", "src/body_studio/server.py",
                  "src/body_studio/static/index.html", "src/body_studio/static/flash.js",   # (tattoo.js imports it)
                  "tests/browser/base.py", "tests/browser/test_clothes.py", "tests/fakes/makehuman.py", "pyproject.toml",
                  ".github/workflows/ci.yml", "scripts/browser_needed.py", "src/body_studio/static/notes.md",
                  "something_new.txt"):
            self.assertEqual(browser_needed.shards(["README.md", f]), ["clothes", "rooms", "body"], f)

    def test_a_feature_of_its_own_skips_the_shards_that_never_open_it(self):
        decor = ["src/body_studio/static/decorate.js", "src/body_studio/sample_venue.py", "src/body_studio/decor.py"]
        self.assertEqual(browser_needed.shards(decor), ["rooms"])
        self.assertEqual(browser_needed.shards(["src/body_studio/static/parlour.js"]), ["rooms"])
        self.assertEqual(browser_needed.shards(["src/body_studio/static/progress.js"]), ["rooms", "body"])
        self.assertEqual(browser_needed.shards(decor + ["src/body_studio/static/wardrobe.js"]),
                         ["clothes", "rooms", "body"])

    def test_no_base_to_compare_with_runs_them_all(self):
        self.assertEqual(browser_needed.shards([]), ["clothes", "rooms", "body"])
        for base in ("", "0" * 40, "not-a-commit"):
            r = subprocess.run([sys.executable, str(ROOT / "scripts" / "browser_needed.py"), base],
                               cwd=ROOT, capture_output=True, text=True)
            self.assertEqual(json.loads(r.stdout), ["clothes", "rooms", "body"], base)

    def test_the_shards_are_ci_s(self):
        ci = (ROOT / ".github" / "workflows" / "ci.yml").read_text()
        browser = ci[ci.index("\n  browser:\n"):]
        self.assertEqual(sorted(re.findall(r"- shard: (\w+)", browser)), sorted(browser_needed.SHARDS))
        self.assertEqual(set(browser_needed.SKIPS), set(browser_needed.SHARDS))
        steps = browser[browser.index("    steps:"):]
        self.assertEqual(steps.count("\n      - "), steps.count("if: contains(fromJSON(needs.changes.outputs.shards), matrix.shard)"))

    def test_a_feature_s_files_are_its_own(self):
        """Nothing outside a feature imports its page files (else a change to them could break a skipped shard)."""
        static = ROOT / "src" / "body_studio" / "static"
        for name, files in browser_needed.FEATURES.items():
            own = [Path(f).name for f in files if f.endswith(".js")]
            for js in static.glob("*.js"):
                if "src/body_studio/static/" + js.name in files:
                    continue
                imports = re.findall(r"""from ["'](?:\./|/static/)([\w.]+)["']""", js.read_text())
                self.assertFalse(set(own) & set(imports), f"{js.name} imports {name}'s files")


if __name__ == "__main__":
    unittest.main()
