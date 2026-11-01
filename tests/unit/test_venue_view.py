"""scripts/venue_view.py: the scene it writes for venue_view.mjs, the named colours, the walkthrough's
poses, and each command run end to end on a small scene (no venue drawn: that takes 15 s)."""
import json
import math
import shutil
import struct
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import venue_view  # noqa: E402

NODE = shutil.which("node")


def small_scene(folder: Path) -> Path:
    """A grey wall along z = 0 (x 0..4) on a floor, a brick pier at (2, 1.5)."""
    splats = [((x / 20, y / 20, 0.0), (0.5, 0.5, 0.5), (0.03, 0.03, 0.01)) for x in range(81) for y in range(61)]
    splats += [((x / 10, 0.0, z / 10), (0.4, 0.4, 0.4), (0.06, 0.005, 0.06)) for x in range(41) for z in range(31)]
    return venue_view.write_scene(folder, splats, [{"item": "brick_pier", "at": [2, 0, 1.5]}], venue_view.palette())


class Scene(unittest.TestCase):
    def test_written_as_nine_floats_a_splat(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = venue_view.write_scene(Path(tmp) / "s", [((1, 2, 3), (0.1, 0.2, 0.3), 0.05), ((0, 0, 0), (1, 1, 1), (0.1, 0.2, 0.3))],
                                       [{"item": "x", "at": [0, 0, 0]}], {"W": [1, 1, 1]})
            raw = (d / "splats.f32").read_bytes()
            self.assertEqual(len(raw), 2 * 9 * 4)
            first = struct.unpack("<9f", raw[:36])
            self.assertEqual([round(v, 3) for v in first], [1, 2, 3, 0.1, 0.2, 0.3, 0.05, 0.05, 0.05], "a round scale fills all three")
            self.assertEqual(json.loads((d / "scene.json").read_text())["fixtures"][0]["item"], "x")

    def test_palette_names_the_plans_colours_and_the_decors(self):
        p = venue_view.palette()
        self.assertTrue(any(math.dist(c, (0.40, 0.43, 0.47)) <= 0.06 for c in p.values()), "the way in's cement (POLISHED) or one like it")
        self.assertIn("ivory", p)
        self.assertNotIn("HALL", p, "a box of numbers is not a colour")
        names = list(p)
        for i, a in enumerate(names):
            for b in names[i + 1:]:
                self.assertGreater(math.dist(p[a], p[b]), 0.06, f"{a} and {b} too alike to tell apart")


class Route(unittest.TestCase):
    def test_every_pose_is_a_fly_view_with_its_time(self):
        views = json.loads(venue_view.ROUTE.read_text())["views"]
        self.assertGreaterEqual(len(views), 20)
        times = [v["t"] for v in views.values()]
        self.assertEqual(times, sorted(times))
        for name, v in views.items():
            self.assertEqual(set(v) >= {"t", "at", "look", "pitch", "eye", "fov"}, True, name)
            self.assertAlmostEqual(venue_view.seconds(name), v["t"], places=1)

    def test_picked_by_nearest_time(self):
        self.assertEqual([n for n, _ in venue_view.route("0:04,1:17")][0], "0:04.08")
        self.assertEqual(len(venue_view.route("all")), len(json.loads(venue_view.ROUTE.read_text())["views"]))
        with self.assertRaises(SystemExit):
            venue_view.route("3:48")              # (none at the very end)

    def test_seconds(self):
        self.assertEqual(venue_view.seconds("1:20.5"), 80.5)
        self.assertEqual(venue_view.seconds("7"), 7.0)


@unittest.skipIf(NODE is None, "node is not installed")
class Commands(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.scene = small_scene(Path(self.tmp.name) / "scene")

    def tearDown(self):
        self.tmp.cleanup()

    def run_cli(self, *argv):
        with redirect_stdout(StringIO()):
            return venue_view.main(list(argv), scene=self.scene)

    def test_plan(self):
        out = self.run_cli("plan", "-x", "0", "4", "-z", "-0.25", "3")
        self.assertIn("################", out)
        self.assertIn("A brick_pier", out)

    def test_elevation_and_listing(self):
        out = self.run_cli("elev", "z=0", "--from", "-", "-r", "0", "4", "--by", "colour")
        self.assertIn("looking +z", out)
        self.assertIn("colours:", out)
        out = self.run_cli("list", "-x", "0", "4", "-z", "0", "3")
        self.assertIn("brick_pier at (2, 0, 1.5)", out)

    def test_view_writes_a_png(self):
        png = Path(self.tmp.name) / "v.png"
        self.run_cli("view", "--at", "2", "3", "--look", "90", "--width", "30", "--out", str(png))
        b = png.read_bytes()
        self.assertEqual(b[:8], b"\x89PNG\r\n\x1a\n")
        self.assertEqual(struct.unpack(">II", b[16:24]), (30, 53))

    @unittest.skipIf(shutil.which("ffmpeg") is None, "ffmpeg is not installed")
    def test_route_puts_the_videos_frame_beside_the_render(self):
        video = Path(self.tmp.name) / "clip.mp4"
        subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=red:s=48x84:d=6", "-pix_fmt", "yuv420p", str(video)], check=True)
        png = Path(self.tmp.name) / "r.png"
        with redirect_stdout(StringIO()):
            self.run_cli("route", "0:04", "--width", "24", "--video", str(video), "--out", str(png))
        w, h = struct.unpack(">II", png.read_bytes()[16:24])
        self.assertEqual((w, h), (24 + 4 + 24, 42))


if __name__ == "__main__":
    unittest.main()
