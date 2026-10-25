import math
import tempfile
import unittest
from pathlib import Path

from body_studio import decor, library, room, sample_room, sample_studio


class SampleStudioTest(unittest.TestCase):
    """The drawn tattoo studio: made once beside the living room, mapped like a filmed room, its
    furniture (the bed, the chair and its arm rests, the flash wall, the mirror) in the map."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.d = Path(cls.tmp.name)
        cls.ply = sample_room.ensure(cls.d, library.STUDIO)
        cls.map = room.build(cls.ply)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def to_map(self, p):
        """The studio's metres (y up) -> the map's."""
        fr, q = self.map["frame"], (p[0], -p[1], p[2])  # in the file: y down
        return [round((sum(a * b for a, b in zip(q, fr[k])) - (fr["floor"] if k == "up" else 0)) * fr["metres"], 3)
                for k in ("x", "up", "z")]

    def test_made_once_listed_after_the_living_room_never_a_body(self):
        self.assertEqual(self.ply.name, sample_studio.PLY)
        self.assertEqual(sample_room.ensure(self.d, library.STUDIO), self.ply)
        sample_room.ensure(self.d)
        self.assertEqual([r["name"] for r in library.rooms(self.d)], [library.SAMPLE, library.STUDIO])
        self.assertEqual(library.bodies(self.d), [])

    def test_its_size(self):
        self.assertAlmostEqual(self.map["frame"]["metres"], 1.0, delta=0.03)
        self.assertAlmostEqual(self.map["ceiling"], sample_studio.H, delta=0.05)
        self.assertAlmostEqual(self.map["nx"] * self.map["cell"], sample_studio.W + 0.4, delta=0.2)

    def test_the_map_knows_where_its_furniture_is(self):
        fx, want = self.map["fixtures"], sample_studio.fixtures()
        self.assertEqual(set(fx), set(want))
        for name in ("bed", "chair"):
            got, w = fx[name]["at"], want[name]["at"]
            x, z = self.to_map(w)[0], self.to_map(w)[2]
            self.assertAlmostEqual(got[0], x, delta=0.03, msg=name)
            self.assertAlmostEqual(got[2], z, delta=0.03, msg=name)
        self.assertAlmostEqual(fx["bed"]["at"][1], sample_studio.BED["top"], delta=0.03, msg="heights from the floor")
        self.assertAlmostEqual(fx["bed"]["length"], want["bed"]["length"], delta=0.03)
        self.assertAlmostEqual(fx["chair"]["recline"], sample_studio.CHAIR["recline"])
        self.assertEqual(sorted(r["side"] for r in fx["rests"]), ["l", "r"])
        for k in ("normal", "right"):
            self.assertAlmostEqual(sum(v * v for v in fx["flash"][k]), 1.0, delta=1e-3)
        self.assertGreater(fx["flash"]["width"], 2.0)

    def test_the_chair_and_the_stool_are_seats(self):
        seats = self.map["seats"]
        for name, ((x, z), h, way) in sample_studio.SEATS.items():
            mx, _, mz = self.to_map((x, 0, z))
            near = [s for s in seats if (s["x"] - mx) ** 2 + (s["z"] - mz) ** 2 < 0.4 ** 2]
            self.assertEqual(len(near), 1, name)
            self.assertAlmostEqual(near[0]["y"], h, delta=0.06, msg=name)

    def test_its_furniture_is_drawn_as_decor_where_its_splats_are(self):
        trees = self.map["fixtures"]["trees"]
        self.assertEqual([t["item"] for t in trees], [f[0] for f in sample_studio.FIXTURES])
        self.assertTrue({t["item"] for t in trees} <= decor.STARTER_IDS)
        for t, (item, (x, z), (fx, fz), colour, size) in zip(trees, sample_studio.FIXTURES):
            mx, _, mz = self.to_map((x, 0, z))
            self.assertAlmostEqual(t["at"][0], mx, delta=0.03, msg=item)
            self.assertAlmostEqual(t["at"][2], mz, delta=0.03, msg=item)
            self.assertAlmostEqual(t["at"][1], 0.0, delta=0.03, msg=item + " stands on the floor")
            # the way it faces, turned with the map's frame as its splats are
            want = [a - b for a, b in zip(self.to_map((x + fx, 0, z + fz)), self.to_map((x, 0, z)))]
            n = math.hypot(want[0], want[2])
            self.assertGreater((t["facing"][0] * want[0] + t["facing"][2] * want[2]) / n, 0.99, item)
        chair = trees[1]
        self.assertGreater(chair["facing"][0] * self.map["fixtures"]["chair"]["facing"][0]
                           + chair["facing"][2] * self.map["fixtures"]["chair"]["facing"][2], 0.99, "the chair faces as the body sits")

    def test_a_filmed_room_has_no_fixtures(self):
        self.assertIsNone(room.read_fixtures(self.d / "nothing.ply", self.map["frame"], 0.0, 1.0))


if __name__ == "__main__":
    unittest.main()
