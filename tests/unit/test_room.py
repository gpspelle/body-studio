import base64
import json
import math
import os
import tempfile
import unittest
from pathlib import Path

from body_studio import room
from tests.fakes import room as fake


def to_map(r, p, unit=2.5, yaw=0.4):
    """A point of the fake room (metres, y up) in the map's frame."""
    f = fake._to_file(p, unit, yaw)
    fr = r["frame"]
    dot = lambda a, b: sum(x * y for x, y in zip(a, b))          # noqa: E731
    return (dot(f, fr["x"]) * fr["metres"], (dot(f, fr["up"]) - fr["floor"]) * fr["metres"],
            dot(f, fr["z"]) * fr["metres"])


def cell(r, name, x, z):
    i, k = math.floor((x - r["x0"]) / r["cell"]), math.floor((z - r["z0"]) / r["cell"])
    if not (0 <= i < r["nx"] and 0 <= k < r["nz"]):
        return 0                                                    # off the map
    return base64.b64decode(r[name])[k * r["nx"] + i]


class RoomMap(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.ply = fake.write_room(Path(cls.tmp.name) / "run_1")
        cls.r = room.build(cls.ply)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def at(self, name, p):
        x, _, z = to_map(self.r, p)
        return cell(self.r, name, x, z)

    def test_floor_and_size_from_the_camera(self):
        r = self.r
        self.assertEqual(r["scale_source"], "camera")
        self.assertAlmostEqual(r["frame"]["metres"], 1 / 2.5, delta=0.02 / 2.5)
        self.assertAlmostEqual(abs(r["frame"]["up"][1]), 1, places=3)
        self.assertAlmostEqual(r["ceiling"], fake.CEIL, delta=0.1)
        self.assertAlmostEqual(to_map(r, (0, 0, 0))[1], 0, delta=0.03)         # the floor is at 0

    def test_walls_and_furniture_block_the_way(self):
        for p in ((0, 0, 0), (1.5, 0, -0.5), (-1.5, 0, -0.3), (0, 0, 1.6)):
            self.assertEqual(self.at("walk", p), 1, p)                         # free floor (the rug too)
        for p in ((0, 0, -1.5), (1.8, 0, 0.8), (-1.4, 0, 1.0), (2.5, 0, 0), (0, 0, -2.0)):
            self.assertEqual(self.at("walk", p), 0, p)                         # sofa, chair, table, walls
        self.assertEqual(self.at("walk", (3.2, 0, 0)), 0)                     # outside the room
        self.assertEqual(self.at("walk", (0.0, 0, 0.0)), 1)                   # under the lamp
        self.assertGreaterEqual(self.at("tall", (2.5, 0, 0)), 150)            # a wall, to lean on
        self.assertLess(self.at("tall", (0, 0, -1.4)), 100)                   # the sofa isn't one
        self.assertAlmostEqual(self.at("top", (-1.4, 0, 1.0)), 75, delta=5)   # the table's top

    def test_seats_where_to_sit_and_which_way_to_face(self):
        seats = self.r["seats"]
        front = to_map(self.r, (0, 0, -1.36))
        sofa = [s for s in seats if math.hypot(s["x"] - front[0], s["z"] - front[2]) < 1.1]
        self.assertEqual(len(sofa), 3, seats)                                  # three along a 2 m sofa
        chair = [s for s in seats if s not in sofa]
        self.assertEqual(len(chair), 1, seats)
        for s, (h, face), at in ((sofa[0], fake.SEATS["sofa"], (0, 0, -1.36)), (chair[0], fake.SEATS["chair"], (1.86, 0, 0.82))):
            self.assertAlmostEqual(s["y"], h, delta=0.04)
            self.assertTrue(s["back"])
            # facing the free floor: the sitter's front in the map's frame
            o, f = to_map(self.r, (0, 0, 0)), to_map(self.r, (face[0], 0, face[1]))
            want = (f[0] - o[0], f[2] - o[2])
            self.assertGreater(s["dir"][0] * want[0] + s["dir"][1] * want[1], 0.95, s)
        x, _, z = to_map(self.r, (1.86, 0, 0.82))
        self.assertLess(math.hypot(chair[0]["x"] - x, chair[0]["z"] - z), 0.15)
        x, _, z = to_map(self.r, (0, 0, -1.36))
        self.assertLess(min(math.hypot(s["x"] - x, s["z"] - z) for s in sofa), 0.15)

    def test_starts_on_free_floor_in_the_middle(self):
        x, z = self.r["start"]
        o = to_map(self.r, (0, 0, 0))
        self.assertLess(math.hypot(x - o[0], z - o[2]), 0.5)
        self.assertEqual(cell(self.r, "walk", x, z), 1)

    def test_size_without_cameras_or_from_an_iphone(self):
        with tempfile.TemporaryDirectory() as tmp:
            ply = fake.write_room(Path(tmp) / "run_1", n=80000, cameras=False)
            r = room.build(ply)
            self.assertEqual(r["scale_source"], "ceiling")
            self.assertAlmostEqual(r["frame"]["metres"], 1 / 2.5, delta=0.03 / 2.5)
            (Path(tmp) / "run_1" / "summary.txt").write_text("poses:                 ARKit: 40 frames, 900 points in 1.0 s\n")
            r = room.build(ply)
            self.assertEqual((r["scale_source"], r["frame"]["metres"]), ("arkit", 1.0))

    def test_not_a_room(self):
        from tests.fakes.bodyply import write_body
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(room.RoomError):
                room.build(write_body(Path(tmp) / "run_1" / "splat" / "b.ply", n=1000))

    def test_saved_next_to_the_room_and_kept_while_current(self):
        with tempfile.TemporaryDirectory() as tmp:
            ply = fake.write_room(Path(tmp) / "run_1", n=60000)
            self.assertFalse(room.current(ply))
            room.build_and_save(ply)
            self.assertTrue(room.current(ply))
            self.assertEqual(json.loads(room.map_file(ply).read_text())["version"], room.ROOM_VERSION)
            later = room.map_file(ply).stat().st_mtime + 10
            os.utime(ply, (later, later))                                    # the room was made again
            self.assertFalse(room.current(ply))


if __name__ == "__main__":
    unittest.main()
