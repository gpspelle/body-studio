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

    def test_rooms_are_listed_apart_from_bodies(self):
        touch(self.d / "workspace/anna/run_1/splat/standard_30000_object.ply", 100)
        room = self.d / "workspace/living/run_2/splat"
        touch(room / "standard_30000.ply", 200)
        touch(room / "standard_30000_clean.ply", 201)
        self.assertEqual([b["name"] for b in library.bodies(self.d)], ["living", "anna"])   # not yet known as a room
        library.mark_room(self.d, "living")
        library.mark_room(self.d, "hall")
        self.assertEqual(library.room_names(self.d), {"living", "hall"})
        self.assertEqual([b["name"] for b in library.bodies(self.d)], ["anna"])
        rooms = library.rooms(self.d)
        self.assertEqual([(r["name"], r["file"]) for r in rooms],
                         [("living", "workspace/living/run_2/splat/standard_30000_clean.ply")])
        (self.d / "rooms.json").write_text("not json")
        self.assertEqual(library.room_names(self.d), set())

    def test_the_sample_rooms_are_listed_last_and_never_as_bodies(self):
        touch(self.d / "workspace/living/run_2/splat/standard_30000_clean.ply", 100)
        touch(self.d / f"workspace/{library.STUDIO}/run_sample/splat/tattoo_studio_clean.ply", 300)
        touch(self.d / f"workspace/{library.SAMPLE}/run_sample/splat/living_room_clean.ply", 200)
        touch(self.d / f"workspace/{library.VENUE}/run_sample/splat/wedding_venue_clean.ply", 250)
        library.mark_room(self.d, "living")
        self.assertEqual([(r["name"], r["sample"]) for r in library.rooms(self.d)],
                         [("living", False), (library.SAMPLE, True), (library.STUDIO, True), (library.VENUE, True)])
        (self.d / "rooms.json").unlink()                # even when the list of rooms is lost
        names = [b["name"] for b in library.bodies(self.d)]
        self.assertNotIn(library.SAMPLE, names)
        self.assertNotIn(library.STUDIO, names)
        self.assertNotIn(library.VENUE, names)

    def test_safe_path_stays_inside_workspace(self):
        touch(self.d / "workspace/x/run_1/splat/a.ply", 1)
        touch(self.d / "secret.txt", 1)
        self.assertIsNotNone(library.safe_path(self.d, "workspace/x/run_1/splat/a.ply"))
        self.assertIsNone(library.safe_path(self.d, "workspace/../secret.txt"))
        self.assertIsNone(library.safe_path(self.d, "/etc/passwd"))


if __name__ == "__main__":
    unittest.main()
