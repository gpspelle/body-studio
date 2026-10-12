import os
import tempfile
import unittest
from pathlib import Path

from body_studio import library


def touch(p: Path, mtime: float) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(b"ply\n")
    os.utime(p, (mtime, mtime))


class Library(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.d = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_picks_background_free_body_newest_first(self):
        a = self.d / "workspace/anna/run_20261001_100000/splat"
        touch(a / "standard_30000.ply", 100)
        touch(a / "standard_30000_clean.ply", 101)
        touch(a / "standard_30000_object.ply", 102)
        b = self.d / "workspace/bruno/run_20261002_100000/splat"
        touch(b / "preview_5000.ply", 200)
        touch(b / "preview_5000_clean.ply", 201)
        got = library.bodies(self.d)
        self.assertEqual([x["name"] for x in got], ["bruno", "anna"])
        self.assertEqual(got[1]["file"], "workspace/anna/run_20261001_100000/splat/standard_30000_object.ply")
        self.assertTrue(got[1]["background_removed"])
        self.assertTrue(got[0]["file"].endswith("_clean.ply"))

    def test_skips_runs_without_a_splat_and_the_latest_link(self):
        (self.d / "workspace/carla/run_20261003_100000/dense").mkdir(parents=True)
        run = self.d / "workspace/carla/run_20261004_100000"
        touch(run / "splat/standard_30000_object.ply", 300)
        (self.d / "workspace/carla/run_latest").symlink_to(run.name)
        self.assertEqual(len(library.bodies(self.d)), 1)

    def test_safe_path_stays_inside_workspace(self):
        touch(self.d / "workspace/x/run_1/splat/a.ply", 1)
        touch(self.d / "secret.txt", 1)
        self.assertIsNotNone(library.safe_path(self.d, "workspace/x/run_1/splat/a.ply"))
        self.assertIsNone(library.safe_path(self.d, "workspace/../secret.txt"))
        self.assertIsNone(library.safe_path(self.d, "/etc/passwd"))


if __name__ == "__main__":
    unittest.main()
