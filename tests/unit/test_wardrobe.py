"""The fitted base mesh (fit.py) and the wardrobe on it (wardrobe.py), on the MakeHuman test body in
a few shapes. The test body is MakeHuman's own base mesh, so the fit can be checked against where
its skin really is (by distance to that surface: the PLY is a mirror image of MakeHuman's model,
so a vertex's number names the other side)."""
import base64
import json
import math
import sys
import tempfile
import unittest
from array import array
from pathlib import Path

from body_studio import fit, rig, wardrobe
from tests.fakes.makehuman import surface, write_body

ROOT = Path(__file__).resolve().parents[2]
STATIC = ROOT / "src" / "body_studio" / "static"


def arr(code, s):
    a = array(code)
    a.frombytes(base64.b64decode(s))
    if sys.byteorder != "little":
        a.byteswap()
    return a


def distances(points, to, cell=0.03):
    """Each point's distance to the nearest of `to` (1 m when none is near)."""
    h = fit._Hash(to, cell)
    return sorted(min((math.dist(p, to[j]) for j in h.near(p, 2)), default=1.0) for p in points)


def pct(d, q):
    return d[min(len(d) - 1, int(q * len(d)))]


class Catalog(unittest.TestCase):
    def test_every_item_is_packed(self):
        base = wardrobe.base()
        n = len(base["verts"])
        self.assertEqual(base["n_body"], 13380)
        for c in wardrobe.catalog():
            with self.subTest(c["id"]):
                self.assertIn(c["slot"], wardrobe.SLOTS)
                self.assertIn(c["cut"], ("women", "men", "unisex"))
                self.assertIsNotNone(c["texture"])
                self.assertTrue((STATIC / "wardrobe" / c["texture"]).is_file())
                it = wardrobe.item(c["id"])
                nv = len(it["ref"]) // 3
                self.assertEqual(len(it["off"]), 3 * nv)
                self.assertLess(max(it["ref"]), n)
                self.assertLess(max(it["tris"]), nv)
                self.assertLess(max(it["tuv"]), len(it["uv"]) // 2)
                self.assertTrue(all(0 <= i < n for i in it["delete"]))             # (the page hides only skin ones)
        cuts = {c["cut"] for c in wardrobe.CATALOG if c["slot"] == "outfit"}
        self.assertEqual(cuts, {"women", "men", "unisex"})

    def test_every_item_is_credited(self):
        credits = (ROOT / "CREDITS.md").read_text()
        for c in wardrobe.CATALOG:
            self.assertEqual(c["license"], "CC0-1.0")
            self.assertIn(c["mhclo"], credits)


class Fit(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.bodies = {}
        for shape in (None, "heavy", "slim"):
            ply = Path(cls.tmp.name) / f"{shape or 'default'}.ply"
            write_body(ply, n=100000, shape=shape, yaw=25)
            cls.bodies[shape] = (ply, fit.build_and_save(ply))

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_the_base_mesh_lands_on_the_skin(self):
        for shape, (ply, r) in self.bodies.items():
            with self.subTest(shape):
                f = fit.decode(r)
                truth = surface(shape, yaw=25)
                got = [f["to_model"](v) for v in f["verts"][:f["n_body"]]]
                d = distances(got, truth)
                self.assertLess(pct(d, 0.5), 0.01, "median")
                self.assertLess(pct(d, 0.99), 0.04, "99th percentile")
                back = distances(truth, got)                # and covers all of it
                self.assertLess(pct(back, 0.99), 0.04)
                self.assertGreater(r["surface_found"], 0.8)

    def test_skin_normals_point_out(self):
        for shape, (ply, r) in self.bodies.items():
            with self.subTest(shape):
                f = fit.decode(r)
                N = arr("f", r["normals"])
                self.assertEqual(len(N), 3 * f["n_body"])
                # body coordinates: x left, y up, z front. On the trunk (between the hips and the
                # armpits, arms left out), out is away from the vertical through the body's middle.
                skin = f["verts"][:f["n_body"]]
                ys = sorted(v[1] for v in skin)
                lo, hi = ys[int(0.5 * len(ys))], ys[int(0.7 * len(ys))]
                out = total = 0
                for i, v in enumerate(skin):
                    if abs(v[0]) > 0.1 * r["height"] or not lo < v[1] < hi:
                        continue
                    total += 1
                    out += v[0] * N[3 * i] + v[2] * N[3 * i + 2] > 0
                self.assertGreater(out / total, 0.9)       # (inward normals would give about 0)

    def test_saved_and_found_again(self):
        ply, r = self.bodies[None]
        self.assertTrue(fit.current(ply))
        self.assertEqual(fit.cached(ply), json.loads(json.dumps(r)))
        self.assertTrue(rig.rig_file(ply).is_file())

    def test_clothes_sit_on_the_body(self):
        for shape in (None, "heavy"):
            ply, r = self.bodies[shape]
            f = fit.decode(r)
            skin = surface(shape, yaw=25)
            joints = {j["name"]: j["pos"] for j in rig.cached(ply)["joints"]}
            for item in ("tee_jeans", "shirt_skirt", "white_sneakers", "bob_dark", "fedora"):
                with self.subTest(shape=shape, item=item):
                    d = wardrobe.fitted(item, f)
                    v = arr("f", d["verts"])
                    pts = [(v[i], v[i + 1], v[i + 2]) for i in range(0, len(v), 3)]
                    a = arr("f", d["anchors"])
                    self.assertEqual(len(a), len(v))
                    if item not in ("bob_dark", "fedora"):              # (hair and hats hang from helpers)
                        on = distances([(a[i], a[i + 1], a[i + 2]) for i in range(0, len(a), 3)], skin, 0.05)
                        self.assertLess(pct(on, 0.9), 0.025, "anchors on the skin")
                    gap = distances(pts, skin, 0.05)
                    self.assertLess(pct(gap, 0.5), 0.03, "most of it close to the skin")
                    if item not in ("bob_dark", "fedora"):
                        self.assertLess(pct(on, 0.5), pct(gap, 0.5), "anchors closer than the item")
                    self.assertLess(pct(gap, 0.9), 0.15 if item in ("bob_dark", "fedora", "shirt_skirt") else 0.06)
                    if item == "white_sneakers":            # around both ankles
                        for side in ("l", "r"):
                            a = joints["ankle_" + side]
                            self.assertLess(min(math.dist(p, a) for p in pts), 0.06)
                    if item == "fedora":                    # above the head
                        up = rig.cached(ply)["frame"]["up"]
                        top = max(sum(p[k] * up[k] for k in range(3)) for p in skin)
                        crown = max(sum(p[k] * up[k] for k in range(3)) for p in pts)
                        self.assertGreater(crown, top)

    def test_too_few_splats(self):
        with self.assertRaises(fit.FitError) as e:
            fit.fit_splats(rig.cached(self.bodies[None][0]), [0.0] * 100, [0.0] * 100, [0.0] * 100, [1.0] * 100)
        self.assertEqual(e.exception.code, "few")


if __name__ == "__main__":
    unittest.main()
