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
        """The venue's metres (y up) -> the map's x and z (the file is written mirrored, z to -z)."""
        fr, q = self.map["frame"], (x, 0.0, -z)
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
        self.assertAlmostEqual(self.map["nz"] * self.map["cell"], V.GARDEN_W - V.SIDE[2] + 0.4, delta=2.0)   # (with the toilets and the side room behind the hall)   # (the beach is slanted, and is more of the splats now the garden is drawn by the page)
        self.assertLess(self.map["cell"], 0.12, "cells small enough for doorways, long and wide as it is")
        self.assertLess(self.map["splats"], 1_050_000)   # (most become the smooth shell: what is drawn as splats stays near 50k)

    def test_walk_from_the_door_to_the_garden(self):
        # through every room on the way, and its doorways
        for name, (x, z) in {"deck": (-20.8, 2.0), "reception": (-16.8, 2.0), "reception door": (-19.8, 2.0),
                             "vertical garden": (-11.5, 2.0), "ante-room": (-4.0, 2.0), "into the hall": (0.0, 2.8),
                             "hall": (9.0, 5.0), "the kitchen": (-4.0, 6.0), "the kitchen door": (0.0, 8.05), "the passage to the kitchen": (0.6, 6.0), "by the half wall": (11.3, 4.2), "toilets' hall": (14.0, 1.6),
                             "glass doors": (17.8, 3.9),
                             "into the ladies'": (13.45, -0.5), "the passage to the side room": (5.8, -1.0), "through its louvred door": (5.8, -2.1), "the side room": (7.2, -4.0), "the ladies'": (13.0, -1.8), "the gents'": (16.5, -2.0), "pergola": (23.0, 7.0), "garden, under its cover": (38.0, 8.0),
                             "on the bungalow's deck": (46.0, 15.0),
                             "beside the pergola": (22.0, 14.0), "by the far side": (52.4, 8.9),
                             "on the beach": (V._garden_end(8.9) + 3.0, 8.9)}.items():
            self.assertTrue(self.free(x, z), name)
        for name, (x, z) in {"the kitchen's back wall": (-9.3, 6.0), "the ante-room's wall": (-4.0, 4.0), "the hall's side": (9.0, 8.6),
                             "the notch": (2.5, 0.7), "the ladies' counter": (11.55, -1.5), "the trough": (15.5, -3.85),
                             "a cubicle's toilet": (14.0, -3.8), "between the toilets": (14.5, -1.5), "behind the toilets": (16.0, -4.3), "the patio past the glass doors": (7.2, -6.6), "the reed partition": (1.3, 7.0), "the stone wall at the beach": (V._garden_end(3.0) - 0.5, 3.0), "the kitchen's stove": (-2.8, 6.3), "the half wall": (11.3, 1.5), "the stage": (24.0, 1.6),
                             "the pergola's far wall": (22.0, V.PERGOLA[3]),
                             "the beds along the garden's wall": (40.0, 0.6), "the left wall": (40.0, V.GARDEN_W),
                             "outside": (40.0, 19.0), "the sea": (V._garden_end(8.9) + V.BEACH + 6.0, 8.9)}.items():
            self.assertFalse(self.free(x, z), name)

    def test_the_body_starts_in_the_hall(self):
        sx, sz = self.map["start"]
        x0, x1, z0, z1 = V.HALL
        ax, az = self.to_map(x0, z0)
        bx, bz = self.to_map(x1, z1)
        self.assertTrue(min(ax, bx) < sx < max(ax, bx) and min(az, bz) < sz < max(az, bz))

    def test_only_what_the_plan_shows(self):
        # no furniture or lamps of its own: nothing to sit on until the Decor panel brings it (the
        # trees are the ones the walkthrough shows, in the garden and on the beach)
        self.assertTrue(all(t[0] > V.GARDEN_X for t in V.TREES))
        # the page draws them as decor (starters), where the map says; the body walks round their trunks
        props = self.map["fixtures"]["trees"]
        trees = props[:len(V.TREES)]
        # and the planted walls, the beds' borders and the glass roof, as decor too
        self.assertEqual({t["item"] for t in props[len(V.TREES):]},
                         {"living_wall", "tropical_border", "glass_roof", "glass_lantern", "rattan_pendants", "jute_ceiling", "jute_swags",
                          "hanging_greenery", "bougainvillea_cloud", "wicker_pendant", "wall_fan"})
        for t, (x, z, item) in zip(trees, V.TREES):
            self.assertEqual(t["item"], item)
            mx, mz = self.to_map(x, z)
            self.assertAlmostEqual(t["at"][0], mx, delta=0.05)
            self.assertAlmostEqual(t["at"][2], mz, delta=0.05)
            self.assertAlmostEqual(t["at"][1], 0.0, delta=0.05)
            self.assertFalse(self.free(x, z), item)
        from body_studio import decor
        self.assertTrue({t[2] for t in V.TREES} <= {s["id"] for s in decor.STARTERS})
        # (but the stage, 40 cm up, can be sat on along its front edge; and the toilets, closed)
        sx0, sx1, _, sz1, sh = V.STAGE
        for st in self.map["seats"]:
            if (st["z"] < 0) == (self.to_map(0.0, -1.0)[1] < 0):    # (behind the hall's left wall: the toilets)
                lx = sorted(self.to_map(x, 0)[0] for x in (V.LADIES[0], V.GENTS[1]))
                self.assertTrue(lx[0] < st["x"] < lx[1], st)
                continue
            if st["x"] > self.to_map(V.GARDEN_X + V.GARDEN_RIGHT - 1.0, 0.0)[0]:   # (the low stone wall at the beach)
                continue
            x0, z0 = self.to_map(sx0, sz1)
            x1, _ = self.to_map(sx1, sz1)
            self.assertTrue(min(x0, x1) <= st["x"] <= max(x0, x1) and abs(st["z"] - z0) < 0.5, st)
            self.assertAlmostEqual(st["y"], sh, delta=0.08)
        for name in ("olive", "chandelier", "reception", "hedge"):
            self.assertFalse(hasattr(V, name), name)

    def test_the_sea_is_seen_not_mapped(self):
        rows = V.splats()
        far = [r for r in rows if len(r) > 3]
        self.assertGreater(len(far), 10000)
        self.assertTrue(all(r[3] < room.OPAQUE for r in far))
        # the map stops at the water: its far end within a few metres of the dry sand's
        mx, _ = self.to_map(V._garden_end(V.GARDEN_W) + V.BEACH, V.GARDEN_W)
        self.assertLess(abs(self.map["x0"] + self.map["nx"] * self.map["cell"] - mx), 4.5)   # (its thin slanted corner is cut off)

    def test_sides_as_the_plan(self):
        # walking in from the door (along +x, y up), the kitchen and the bungalow are on the right,
        # the stage on the left, by the long straight wall. The page shows the y-down file turned round (x, -y, -z
        # of the file), as the map's frame does: its z is the view's, and +z is on the right
        self.assertAlmostEqual(self.map["frame"]["z"][2], -1.0, places=3)
        hall = self.to_map(9.0, V.HALL[3] / 2)[1]
        for name, (x, z) in {"kitchen": (-4.0, 6.0), "bungalow": (46.0, 15.0)}.items():
            self.assertGreater(self.to_map(x, z)[1], hall, name)
        self.assertLess(self.to_map(24.0, 1.6)[1], hall, "stage")

    def test_as_the_videos_show_it(self):
        # the hall's rustic tiles: glazed orange worn near black in blotches, a dark grout line between them
        import random
        rnd = random.Random(1)
        seen = [V._rustic(0.013 * i + 0.003, 0.0, 0.017 * k + 0.003, rnd) for i in range(300) for k in range(300)]
        self.assertTrue(all(r >= g >= b for r, g, b in seen))
        orange, black = sum(r > 0.6 for r, g, b in seen), sum(r < 0.3 for r, g, b in seen)
        self.assertTrue(0.2 < orange / len(seen) < 0.8 and 0.15 < black / len(seen) < 0.7, (orange, black))
        self.assertEqual(V._rustic(0.0, 0.0, 1.13, rnd), V._rustic(5.1, 0.0, 0.0, rnd))
        # the ante-room's walls are plaster, not planted (only the vertical garden's are)
        walls = [t for t in V.fixtures()["trees"] if t["item"] == "living_wall" and t["at"][0] < V.HALL[0]]
        self.assertTrue(walls and all(V.VERTICAL[0] < t["at"][0] < V.VERTICAL[1] for t in walls))
        # bare brick in stretcher bond: each course half a brick on from the last
        brick = V._brickwork(2)
        self.assertNotEqual(brick(0, 0.04, 0.05, rnd), brick(0, 0.115, 0.05, rnd))
        self.assertEqual(brick(0, 0.04, 0.221, rnd), brick(0, 0.115, 0.111, rnd))
        rows = V.splats()
        # the stage's screen, the pergola's reed roof (the garden's glass cover is the page's: no splats)
        x0, x1, z0, z1 = V.PERGOLA
        reed = [r for r in rows if x0 < r[0][0] < x1 and z0 < r[0][2] < z1 and abs(r[0][1] - V.PERGOLA_ROOF - 0.01) < 1e-6]
        self.assertGreater(len(reed), 20000)
        self.assertFalse([r for r in rows if V.GARDEN_X < r[0][0] < V.GARDEN_X + V.COVER_LEN and r[0][1] > 3.2])
        screen = [r for r in rows if abs(r[0][2] - 0.06) < 1e-6 and V.STAGE[0] < r[0][0] < V.STAGE[1] and min(r[1]) > 0.8]
        self.assertGreater(len(screen), 1000)

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
