"""The skeleton finder and skin weights (body_studio.rig) against the MakeHuman body, whose
joints an artist placed, in several shapes, turns and arm positions."""
import base64
import io
import json
import math
import os
import tempfile
import time
import unittest
from array import array
from contextlib import redirect_stdout
from pathlib import Path

from body_studio import rig
from tests.fakes import bodyply
from tests.fakes.makehuman import write_body

# shape, turn about the vertical, arms swung toward the body (degrees)
VARIANTS = [(None, 0, 0), ("heavy", 37, 0), ("slim", -120, -12), (None, 180, -20)]


def b64(s, code):
    a = array(code)
    a.frombytes(base64.b64decode(s))
    return a


class Skeleton(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.cases = []
        for k, (shape, yaw, arms) in enumerate(VARIANTS):
            p = Path(cls.tmp.name) / f"body{k}.ply"
            truth = write_body(p, n=60000, seed=k + 1, shape=shape, yaw=yaw, arms=arms)
            cls.cases.append((p, truth, rig.build(p), yaw))

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_joints_are_where_the_artist_put_them(self):
        for p, truth, r, yaw in self.cases:
            got = {j["name"]: j["pos"] for j in r["joints"]}
            for name, want in truth.items():
                # the head pivot is a matter of definition; everything else within 5 cm of a 1.75 m body
                limit = 0.07 if name == "head" else 0.05
                with self.subTest(body=p.name, joint=name):
                    self.assertLess(math.dist(got[name], want), limit)

    def test_left_is_the_persons_left_and_front_is_where_the_feet_point(self):
        for p, truth, r, yaw in self.cases:
            fr = r["frame"]
            want = (math.sin(math.radians(yaw)), 0, math.cos(math.radians(yaw)))     # the body faced +z, PLY is y-down
            self.assertGreater(rig._dot(fr["front"], (want[0], 0, want[2])), 0.95, p.name)
            self.assertGreater(fr["front_confidence"], 0.5)
            self.assertAlmostEqual(r["height"], 1.75, delta=0.03)
            got = {j["name"]: j["pos"] for j in r["joints"]}
            self.assertGreater(rig._dot(rig._sub(got["shoulder_l"], got["shoulder_r"]), fr["left"]), 0.25)

    def test_weights_add_up_and_stay_on_their_side(self):
        p, truth, r, _ = self.cases[0]
        names = [j["name"] for j in r["joints"]]
        g = r["grid"]
        bones, weights = b64(g["bones"], "B"), b64(g["weights"], "B")
        cells = b64(g["cells"], "i")
        self.assertEqual(len(bones), 4 * len(cells))
        nx, ny, nz = g["n"]
        for c in range(len(cells)):
            w = weights[4 * c:4 * c + 4]
            self.assertEqual(sum(w), 255)
            self.assertTrue(all(w[0] + 1 >= x for x in w), "heaviest bone first (give or take rounding)")
        # cells of the left leg (left of the middle, low down) carry no right-side bones
        lo, size = g["lo"], g["size"]
        H = r["height"]
        seen = 0
        for c, cell in enumerate(cells):
            i, j = cell // (ny * nz), (cell // nz) % ny                   # rig.Grid.key
            x, y = lo[0] + (i + 0.5) * size, lo[1] + (j + 0.5) * size
            if x > 0.04 * H and y < 0.35 * H:
                used = {names[bones[4 * c + k]] for k in range(4) if weights[4 * c + k]}
                self.assertFalse(any(n.endswith("_r") for n in used), used)
                seen += 1
        self.assertGreater(seen, 100)

    def test_surface_maps_wrap_the_limbs(self):
        p, truth, r, _ = self.cases[1]
        H, scale = r["height"], r["radius_scale"]
        for bone, (lo, hi) in {"elbow_l": (0.015, 0.06), "knee_l": (0.025, 0.08), "chest": (0.045, 0.2)}.items():
            m = r["maps"][bone]
            radius = [v * scale for v in b64(m["radius"], "H") if v]
            self.assertGreater(len(radius), 0.8 * m["nt"] * m["na"], bone)
            mid = sorted(radius)[len(radius) // 2]
            self.assertTrue(lo * H < mid < hi * H, (bone, mid / H))
            self.assertEqual(len(base64.b64decode(m["colour"])), 3 * m["nt"] * m["na"])

    def test_not_a_person(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "ball.ply"
            rnd = __import__("random").Random(3)
            pts = []
            for _ in range(20000):
                v = [rnd.gauss(0, 1) for _ in range(3)]
                n = math.sqrt(sum(x * x for x in v))
                pts.append([x / n * 0.4 for x in v])
            bodyply.write_points(p, pts)
            with self.assertRaises(rig.RigError) as e:
                rig.build(p)
            self.assertIn(e.exception.code, {"few", "legs", "arms", "feet", "shape"})
            bodyply.write_points(p, pts[:500])
            with self.assertRaises(rig.RigError) as e:
                rig.build(p)
            self.assertEqual(e.exception.code, "few")


class Saved(unittest.TestCase):
    def test_saved_next_to_the_body_and_rebuilt_when_the_body_changes(self):
        with tempfile.TemporaryDirectory() as tmp:
            ply = Path(tmp) / "standard_30000_object.ply"
            write_body(ply, n=40000)
            self.assertFalse(rig.current(ply))
            self.assertIsNone(rig.cached(ply))
            out = io.StringIO()
            with redirect_stdout(out):
                rig.main([str(ply), "--height", "175"])
            self.assertIn("knee_l", out.getvalue())
            self.assertEqual(rig.rig_file(ply).name, "standard_30000_object.rig.json")
            self.assertTrue(rig.current(ply))
            r = rig.cached(ply)
            self.assertEqual(r["version"], rig.RIG_VERSION)
            self.assertEqual(r["splats"], 40000 + 400)
            self.assertEqual(json.loads(rig.rig_file(ply).read_text())["joints"][0]["name"], "pelvis")
            later = time.time() + 5
            os.utime(ply, (later, later))
            self.assertFalse(rig.current(ply))
            self.assertIsNone(rig.cached(ply))

    def test_command_line_says_why_it_failed(self):
        with tempfile.TemporaryDirectory() as tmp:
            ply = Path(tmp) / "tiny.ply"
            bodyply.write_points(ply, [[0, -i * 0.001, 0] for i in range(100)])
            with self.assertRaises(SystemExit) as e:
                rig.main([str(ply)])
            self.assertIn("Can't find a skeleton", str(e.exception.code))
            self.assertFalse(rig.rig_file(ply).exists())


if __name__ == "__main__":
    unittest.main()
