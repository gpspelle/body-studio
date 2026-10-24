"""scripts/test.py: runs every unit test class, and --changed picks the tests a change touches."""
import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("runner", ROOT / "scripts" / "test.py")
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
MODULES = sorted(p.stem for p in (ROOT / "tests" / "unit").glob("test_*.py"))


class Runner(unittest.TestCase):
    def test_every_test_class_is_run(self):
        names = runner.classes(MODULES)
        found = set()

        def walk(s):
            for t in s:
                walk(t) if isinstance(t, unittest.TestSuite) else found.add("%s.%s" % (type(t).__module__, type(t).__name__))
        walk(unittest.TestLoader().discover(str(ROOT / "tests" / "unit"), top_level_dir=str(ROOT)))
        self.assertEqual(sorted(names), sorted(found))

    def test_a_change_picks_its_tests(self):
        self.assertIn("test_pose_js", runner.pick(["src/body_studio/static/pose.js"], MODULES))
        self.assertIn("test_pose_js", runner.pick(["tests/js/walk.test.mjs"], MODULES))   # a JS test it runs
        self.assertIn("test_rig", runner.pick(["src/body_studio/rig.py"], MODULES))
        self.assertIn("test_decor_js", runner.pick(["src/body_studio/static/decor/wedding.js"], MODULES))   # its folder
        self.assertIn("test_i18n", runner.pick(["src/body_studio/static/i18n.js"], MODULES))
        self.assertIn("test_measure", runner.pick(["tests/unit/test_measure.py"], MODULES))
        self.assertIn("test_ci", runner.pick([".github/workflows/ci.yml"], MODULES))
        self.assertEqual(runner.pick(["README.md", "CHANGELOG.md"], MODULES), [])

    def test_a_change_under_everything_runs_everything(self):
        for f in ("pyproject.toml", "tests/fakes/makehuman.py", "scripts/test.py"):
            self.assertEqual(runner.pick([f], MODULES), MODULES, f)


if __name__ == "__main__":
    unittest.main()
