import base64
import json
import tempfile
import unittest
from pathlib import Path

from body_studio import library, room, sample_room, sample_venue as V


class SampleVenueTest(unittest.TestCase):
    """The drawn wedding venue, laid out as the Casa Arandella plan: made once beside the other
    sample rooms, its map made with it, and the body can walk from the door through the hall and
    the pergola into the garden and out onto the beach, but not through the walls, onto the stage
    or into the sea."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.d = Path(cls.tmp.name)
        cls.ply = sample_room.ensure(cls.d, library.VENUE)
        cls.map = json.loads(room.map_file(cls.ply).read_text())
        cls.walk = base64.b64decode(cls.map["walk"])

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def to_map(self, x, z):
        """The venue's metres (y up) -> the map's x and z."""
        fr, q = self.map["frame"], (x, 0.0, z)
        return [sum(a * b for a, b in zip(q, fr[k])) * fr["metres"] for k in ("x", "z")]

    def free(self, x, z):
        mx, mz = self.to_map(x, z)
        i, k = int((mx - self.map["x0"]) / self.map["cell"]), int((mz - self.map["z0"]) / self.map["cell"])
        return 0 <= i < self.map["nx"] and 0 <= k < self.map["nz"] and self.walk[k * self.map["nx"] + i] == 1

    def test_made_once_with_its_map_listed_last_never_a_body(self):
        self.assertEqual(self.ply.name, V.PLY)
        self.assertTrue(room.current(self.ply), "mapped when made: the page needn't wait")
        self.assertEqual(sample_room.ensure(self.d, library.VENUE), self.ply)
        sample_room.ensure_all(self.d)
        self.assertEqual([r["name"] for r in library.rooms(self.d)], [library.SAMPLE, library.STUDIO, library.VENUE])
        self.assertEqual(library.bodies(self.d), [])
        # each listed with its look: the surfaces as a smooth shell, and the splats left (sample_room.write_drawn)
        for r in library.rooms(self.d):
            self.assertTrue((self.d / r["shell"]).is_file() and (self.d / r["look"]).is_file(), r["name"])
            self.assertLess((self.d / r["look"]).stat().st_size, (self.d / r["file"]).stat().st_size / 2)

    def test_its_size(self):
        self.assertAlmostEqual(self.map["frame"]["metres"], 1.0, delta=0.03)
        # (from the door to the water's edge, the slanted far side's middle: its far corner is cut off
        # as a few stray splats would be)
        long = V.GARDEN_X + (V.GARDEN_LEFT + V.GARDEN_RIGHT) / 2 + V.BEACH - V.DECK[0]
        self.assertAlmostEqual(self.map["nx"] * self.map["cell"], long + 0.4, delta=3.0)
        self.assertAlmostEqual(self.map["nz"] * self.map["cell"], V.GARDEN_W + 0.4, delta=1.5)   # (the beach is slanted)
        self.assertLess(self.map["cell"], 0.11, "cells small enough for doorways, long as it is")
        self.assertLess(self.map["splats"], 900_000)

    def test_walk_from_the_door_to_the_garden(self):
        # through every room on the way, and its doorways
        for name, (x, z) in {"deck": (-20.8, 2.0), "reception": (-16.8, 2.0), "reception door": (-19.8, 2.0),
                             "vertical garden": (-11.5, 2.0), "ante-room": (-4.0, 2.0), "into the hall": (0.0, 2.8),
                             "hall": (9.0, 5.0), "the kitchen": (-4.0, 6.0), "the kitchen door": (0.0, 7.4), "by the half wall": (11.3, 4.2), "toilets' hall": (14.0, 1.6),
                             "glass doors": (17.8, 3.9), "pergola": (23.0, 7.0), "lawn": (38.0, 8.0),
                             "beside the pergola": (22.0, 14.0), "by the far side": (52.4, 8.9),
                             "on the beach": (V._garden_end(8.9) + 3.0, 8.9)}.items():
            self.assertTrue(self.free(x, z), name)
        for name, (x, z) in {"the kitchen's back wall": (-9.3, 6.0), "the ante-room's wall": (-4.0, 4.0), "the hall's side": (9.0, 8.6),
                             "the notch": (2.5, 0.7), "the half wall": (11.3, 1.5), "the stage": (24.0, 1.6),
                             "the bungalow's side": (V.BUNGALOW[0], 15.0), "the left wall": (40.0, V.GARDEN_W),
                             "outside": (40.0, 19.0), "the sea": (V._garden_end(8.9) + V.BEACH + 6.0, 8.9)}.items():
            self.assertFalse(self.free(x, z), name)

    def test_the_body_starts_in_the_hall(self):
        sx, sz = self.map["start"]
        x0, x1, z0, z1 = V.HALL
        ax, az = self.to_map(x0, z0)
        bx, bz = self.to_map(x1, z1)
        self.assertTrue(min(ax, bx) < sx < max(ax, bx) and min(az, bz) < sz < max(az, bz))

    def test_only_what_the_plan_shows(self):
        # no furniture, trees or lamps of its own: nothing to sit on until the Decor panel brings it
        self.assertEqual(self.map["seats"], [])
        for name in ("TREES", "olive", "chandelier", "reception", "hedge"):
            self.assertFalse(hasattr(V, name), name)

    def test_the_sea_is_seen_not_mapped(self):
        rows = V.splats()
        far = [r for r in rows if len(r) > 3]
        self.assertGreater(len(far), 10000)
        self.assertTrue(all(r[3] < room.OPAQUE for r in far))
        # the map stops at the water: its far end within a few metres of the dry sand's
        mx, _ = self.to_map(V._garden_end(V.GARDEN_W) + V.BEACH, V.GARDEN_W)
        self.assertLess(abs(self.map["x0"] + self.map["nx"] * self.map["cell"] - mx), 4.0)

    def test_walls_with_holes(self):
        # a wall 4 m along, 3.4 high, less a door and a window: what is left covers the rest exactly
        rects = V._cut((0.0, 4.0), (0.0, 3.4), [(0.5, 1.5, 0.0, 2.2), (2.5, 3.5, 1.0, 2.0)])
        area = sum((a1 - a0) * (b1 - b0) for a0, a1, b0, b1 in rects)
        self.assertAlmostEqual(area, 4.0 * 3.4 - 1.0 * 2.2 - 1.0 * 1.0)
        for a0, a1, b0, b1 in rects:
            m, y = (a0 + a1) / 2, (b0 + b1) / 2
            self.assertFalse(0.5 < m < 1.5 and y < 2.2)
            self.assertFalse(2.5 < m < 3.5 and 1.0 < y < 2.0)


if __name__ == "__main__":
    unittest.main()
