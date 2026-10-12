import io
import math
import random
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

from body_studio import measure
from tests.fakes.bodyply import write_body


class Equations(unittest.TestCase):
    """Worked by hand from the published equations (inches and pounds)."""

    def test_navy_men(self):
        # 70 in tall, neck 15 in, waist 34 in: 86.010*log10(19) - 70.041*log10(70) + 36.76
        self.assertAlmostEqual(measure.navy("m", 70 * 2.54, 15 * 2.54, 34 * 2.54), 17.51, places=2)

    def test_navy_women_needs_hips(self):
        # 64 in, neck 13, waist 28, hips 38: 163.205*log10(53) - 97.684*log10(64) - 78.387
        self.assertAlmostEqual(measure.navy("f", 64 * 2.54, 13 * 2.54, 28 * 2.54, 38 * 2.54), 26.59, places=2)
        with self.assertRaises(ValueError):
            measure.navy("f", 163, 33, 71)

    def test_army_one_site(self):
        self.assertAlmostEqual(measure.army_one_site("m", 180 / 2.20462, 34 * 2.54), 19.09, places=2)
        self.assertAlmostEqual(measure.army_one_site("f", 140 / 2.20462, 30 * 2.54), 26.85, places=2)

    def test_relative_fat_mass(self):
        self.assertAlmostEqual(measure.rfm("m", 175, 85), 64 - 20 * 175 / 85)
        self.assertAlmostEqual(measure.rfm("f", 175, 85), 76 - 20 * 175 / 85)

    def test_army_only_with_weight(self):
        self.assertNotIn("army", measure.estimates("m", 178, 38, 86, 98))
        self.assertIn("army", measure.estimates("m", 178, 38, 86, 98, weight_kg=80))

    def test_bad_inputs_are_refused(self):
        with self.assertRaises(ValueError):
            measure.navy("x", 178, 38, 86)
        with self.assertRaises(ValueError):
            measure.navy("m", 178, 40, 39)

    def test_tape_check(self):
        self.assertEqual(measure.tape_check(87.5, 86.0), {"offset_cm": 1.5, "ok": True})
        self.assertFalse(measure.tape_check(89.0, 86.0)["ok"])


class Geometry(unittest.TestCase):
    def test_hull_perimeter_is_what_a_tape_reads(self):
        square = [(0, 0), (1, 0), (1, 1), (0, 1), (0.5, 0.5), (0.2, 0.7)]
        self.assertAlmostEqual(measure.hull_perimeter(square), 4.0)
        # a tape bridges hollows: a C shape reads like the full circle
        c = [(math.cos(t / 100 * 2 * math.pi), math.sin(t / 100 * 2 * math.pi)) for t in range(100) if t < 80]
        self.assertAlmostEqual(measure.hull_perimeter(c), 2 * math.pi, delta=0.6)

    def test_pieces_split_trunk_from_arm(self):
        trunk = [(x * 0.5, y * 0.5) for x in range(20) for y in range(10)]
        arm = [(30 + x * 0.5, y * 0.5) for x in range(4) for y in range(4)]
        sizes = sorted(len(p) for p in measure.pieces(trunk + arm, 2.0))
        self.assertEqual(sizes, [16, 200])


def ring(cx, cz, r, n, rnd):
    return [(cx + r * math.cos(t), cz + r * math.sin(t)) for t in (rnd.uniform(0, 2 * math.pi) for _ in range(n))]


def synthetic_body(up_sign=1.0, units=0.01):
    """A stack of rings with known circumferences, 180 tall, arms hanging beside the trunk.
    Radii in cm by fraction of height: neck narrowest at 85%, waist 60%, hips widest at 50%."""
    rnd = random.Random(3)

    def radius(f):
        if f > 0.88:
            return 9.0                                 # head
        if f > 0.80:
            return 6.0 + 40 * (f - 0.85) ** 2          # neck, narrowest at 0.85
        if f > 0.56:
            return 14.0 + 30 * (f - 0.60) ** 2         # trunk, waist circle at 0.60
        return 16.0 - 200 * (f - 0.50) ** 2            # hips, widest at 0.50

    pts = []
    for i in range(0, 1800):
        h = i / 10.0
        f = h / 180.0
        if f < 0.40:
            rs = [(-10, 0, 7), (10, 0, 7)]                         # legs
        else:
            rs = [(0, 0, radius(f))]
        if 0.45 < f < 0.80:
            rs += [(-30, 0, 4), (30, 0, 4)]                        # arms, a hand-width away
        for cx, cz, r in rs:
            pts += [(x * units, up_sign * h * units, z * units) for x, z in ring(cx, cz, r, 40, rnd)]
    return pts, (0.0, up_sign, 0.0)


class Landmarks(unittest.TestCase):
    def check(self, pts, up):
        m = measure.landmarks(measure.profile(pts, up, 180.0))
        self.assertAlmostEqual(m["waist_cm"], 2 * math.pi * 14.0, delta=0.03 * 2 * math.pi * 14.0)
        self.assertAlmostEqual(m["neck_cm"], 2 * math.pi * 6.0, delta=0.03 * 2 * math.pi * 6.0)
        self.assertAlmostEqual(m["hip_cm"], 2 * math.pi * 16.0, delta=0.03 * 2 * math.pi * 16.0)

    def test_finds_neck_waist_hips_and_leaves_arms_out(self):
        self.check(*synthetic_body())

    def test_scale_comes_from_height_and_y_down_works(self):
        # COLMAP scale is arbitrary and Brush exports are y-down
        self.check(*synthetic_body(up_sign=-1.0, units=0.0037))


class FakeBodyFile(unittest.TestCase):
    def test_measures_the_fake_capture(self):
        """The viewer's stand-in body (tests/fakes/bodyply.py): trunk radius 0.16 m, 1.845 m tall
        from the soles to the top of the hair."""
        with tempfile.TemporaryDirectory() as d:
            ply = write_body(Path(d) / "body_object.ply")
            r = measure.measure(ply, "m", 184.5, weight_kg=80, tape_waist_cm=100.0)
            self.assertAlmostEqual(r["measurements"]["waist_cm"], 2 * math.pi * 16.0, delta=3.0)
            self.assertTrue(r["tape_check"]["ok"])
            self.assertEqual(set(r["body_fat"]), {"navy", "army", "rfm"})
            out = io.StringIO()
            with redirect_stdout(out):
                measure.main([str(ply), "--sex", "m", "--height", "184.5"])
            self.assertIn("% body fat", out.getvalue())
            self.assertIn("Experimental", out.getvalue())


if __name__ == "__main__":
    unittest.main()
