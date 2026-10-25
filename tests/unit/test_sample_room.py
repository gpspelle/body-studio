import math
import os
import tempfile
import unittest
from pathlib import Path

from body_studio import decor, library, room, sample_room


class SampleRoomTest(unittest.TestCase):
    """The drawn living room: made once in the data folder, and mapped like a filmed room."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.d = Path(cls.tmp.name)
        cls.ply = sample_room.ensure(cls.d)
        cls.map = room.build(cls.ply)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def to_map(self, x, z):
        """The room's metres (sample_room's own frame) -> the map's."""
        fr, p = self.map["frame"], (x, 0.0, z)         # in the file: y-down, but y is 0 here
        return [sum(a * b for a, b in zip(p, fr[k])) * fr["metres"] for k in ("x", "z")]

    def test_made_once_and_listed_as_a_room(self):
        stamp = os.stat(self.ply).st_mtime_ns
        self.assertEqual(sample_room.ensure(self.d), self.ply)
        self.assertEqual(os.stat(self.ply).st_mtime_ns, stamp, "not made again")
        self.assertEqual([r["sample"] for r in library.rooms(self.d)], [True])
        self.assertEqual(library.bodies(self.d), [])

    def test_its_size_floor_and_ceiling(self):
        fr = self.map["frame"]
        self.assertAlmostEqual(fr["metres"], 1.0, delta=0.03)            # from the cameras, 1.45 m up
        self.assertAlmostEqual(self.map["ceiling"], sample_room.H, delta=0.05)
        self.assertAlmostEqual(self.map["nx"] * self.map["cell"], sample_room.W + 0.4, delta=0.2)
        self.assertAlmostEqual(self.map["nz"] * self.map["cell"], sample_room.D + 0.4, delta=0.2)

    def test_the_sofa_and_the_armchair_are_seats_and_nothing_else_is(self):
        seats = self.map["seats"]
        found = set()
        for s in seats:
            near = [name for name, ((x, z), h, way) in sample_room.SEATS.items()
                    if sum((a - b) ** 2 for a, b in zip(self.to_map(x, z), (s["x"], s["z"]))) < 1.2 ** 2]
            self.assertEqual(len(near), 1, f"a seat that isn't one: {s}")
            name = near[0]
            (x, z), h, way = sample_room.SEATS[name]
            want = self.to_map(*way)
            self.assertGreater(want[0] * s["dir"][0] + want[1] * s["dir"][1], 0.9, f"{name} faces the room")
            self.assertAlmostEqual(s["y"], h, delta=0.05)
            self.assertTrue(s["back"])
            found.add(name)
        self.assertEqual(found, {"sofa", "armchair"})
        self.assertGreaterEqual(sum(1 for s in seats if self.to_map(0, -1.75)[1] * s["z"] > 0), 2, "room on the sofa for two")

    def test_its_furniture_is_drawn_as_decor_and_left_out_of_the_look(self):
        trees = self.map["fixtures"]["trees"]
        self.assertEqual([t["item"] for t in trees], [f[0] for f in sample_room.FIXTURES])
        self.assertTrue({t["item"] for t in trees} <= decor.STARTER_IDS)
        for t, (item, (x, z), way, colour, size) in zip(trees, sample_room.FIXTURES):
            mx, mz = self.to_map(x, z)
            self.assertAlmostEqual(t["at"][0], mx, delta=0.03, msg=item)
            self.assertAlmostEqual(t["at"][2], mz, delta=0.03, msg=item)
            want = [a - b for a, b in zip(self.to_map(x + way[0], z + way[1]), self.to_map(x, z))]
            self.assertGreater((t["facing"][0] * want[0] + t["facing"][2] * want[1]) / math.hypot(*want), 0.99, item)
            self.assertRegex(t["colour"], r"^#[0-9a-f]{6}$")
        # the look (the shell and the splats it leaves) has nothing where the sofa is; the splat has
        rows, rest, sheets = sample_room.drawing(sample_room.splats)
        on_sofa = lambda p: -1.1 < p[0] < 1.1 and 0.1 < p[1] < 0.9 and -2.2 < p[2] < -1.35   # noqa: E731
        self.assertGreater(sum(1 for r in rows if on_sofa(r[0])), 1000)
        self.assertEqual(sum(1 for r in rest if on_sofa(r[0])), 0)
        self.assertFalse([s for s in sheets if on_sofa([s[0][k] + (s[1][k] + s[2][k]) / 2 for k in range(3)])])
        self.assertTrue(any(s[6] == "wood_x" for s in sheets), "the floor is still in the shell")

    def test_the_body_starts_on_free_floor_in_the_middle(self):
        x, z = self.map["start"]
        self.assertLess(abs(x), 1.0)
        self.assertLess(abs(z), 1.0)


if __name__ == "__main__":
    unittest.main()
