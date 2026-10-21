"""The Anny trial (anny_fit.py): without PyTorch it says how to install it; with PyTorch and Anny
installed (pip install '.[anny]') it fits the MakeHuman test body and its file is one the
clothes accept. CI has no PyTorch, so the fitting tests run only where it is installed."""
import contextlib
import io
import json
import math
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from body_studio import __main__ as cli
from body_studio import anny_fit, fit, rig, wardrobe
from tests.fakes.makehuman import skin_normals, surface, write_body
from tests.unit.test_wardrobe import distances, pct

try:
    import anny  # noqa: F401
    import torch  # noqa: F401
    HAVE = True
except ImportError:
    HAVE = False


class WithoutTorch(unittest.TestCase):
    def test_says_how_to_install_it(self):
        with tempfile.TemporaryDirectory() as tmp:
            ply = Path(tmp) / "body.ply"
            write_body(ply, n=20000)
            with mock.patch.dict(sys.modules, {"torch": None, "anny": None}):
                with self.assertRaises(SystemExit) as e:
                    cli.main(["fit-anny", str(ply)])
            self.assertIn("pip install 'body-studio[anny]'", str(e.exception.code))
            self.assertFalse(anny_fit.fit_file(ply).exists())

    def test_help_needs_no_torch(self):
        out = io.StringIO()
        with mock.patch.dict(sys.modules, {"torch": None, "anny": None}), contextlib.redirect_stdout(out):
            with self.assertRaises(SystemExit) as e:
                cli.main(["fit-anny", "--help"])
        self.assertEqual(e.exception.code, 0)
        self.assertIn("--no-wrap", out.getvalue())

    def test_face_sliders_are_left_alone(self):
        for label in ("nose-trans-up", "l-ear-lobe-incr", "mouth-scale-horiz-incr", "r-eye-bag-incr",
                      "l-hand-fingers-length-incr", "chin-width-incr"):
            self.assertFalse(anny_fit.body_slider(label), label)
        for label in ("measure-waist-circ-incr", "stomach-pregnant-incr", "l-upperarm-fat-incr",
                      "hip-scale-horiz-incr", "breast-volume-vert-up", "neck-scale-horiz-incr", "l-hand-scale-incr"):
            self.assertTrue(anny_fit.body_slider(label), label)


@unittest.skipUnless(HAVE, "PyTorch and Anny aren't installed (pip install '.[anny]')")
class WithAnny(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.ply = Path(cls.tmp.name) / "heavy.ply"
        write_body(cls.ply, n=80000, shape="heavy", yaw=25)
        cls.r = anny_fit.build_and_save(cls.ply)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_anny_mesh_is_the_base_mesh(self):
        """Its "makehuman" topology is hm08 vertex for vertex: at its middle sliders it is the base
        mesh to within a few centimetres, once turned and scaled."""
        import torch
        A = anny_fit.model()()["vertices"][0].double()
        B = torch.tensor(wardrobe.base()["verts"], dtype=torch.float64)
        self.assertEqual(A.shape, B.shape)
        s, R, t = anny_fit._procrustes(torch, A, B)
        err = ((s * A @ R.T + t) - B).norm(dim=1)
        self.assertLess(float(err.median()), 0.5)               # decimetres: 5 cm
        self.assertLess(float(err.max()), 1.0)

    def test_joint_regressor_gives_the_joints_back(self):
        base = fit.base_rig()
        for name, ws in anny_fit.joint_regressor(base["P"], base["J"], base["n_body"], base["H"]):
            got = [sum(w * base["P"][i][k] for i, w in ws) for k in range(3)]
            self.assertLess(math.dist(got, base["J"][name]), 1e-6 * base["H"], name)

    def test_the_mesh_lands_on_the_skin(self):
        f = fit.decode(self.r)
        got = [f["to_model"](v) for v in f["verts"][:f["n_body"]]]
        truth = surface("heavy", yaw=25)
        d = distances(got, truth)
        self.assertLess(pct(d, 0.5), 0.012, "median")
        self.assertLess(pct(d, 0.99), 0.04, "99th percentile")
        self.assertLess(pct(distances(truth, got), 0.99), 0.04, "and covers all of it")

    def test_the_page_takes_the_file(self):
        self.assertEqual(self.r["model"], "anny")
        self.assertTrue(anny_fit.current(self.ply))                # fit.py's version, its own file
        self.assertEqual(json.loads(anny_fit.fit_file(self.ply).read_text()), json.loads(json.dumps(self.r)))
        self.assertFalse(fit.fit_file(self.ply).exists())          # the standard fit is left alone
        f = fit.decode(self.r)
        self.assertEqual(len(f["verts"]), len(wardrobe.base()["verts"]))
        skin = surface("heavy", yaw=25)
        for item in ("tee_jeans", "white_sneakers", "bob_dark"):
            with self.subTest(item):
                V = wardrobe._arr("f", wardrobe.fitted(item, f)["verts"])
                pts = [(V[i], V[i + 1], V[i + 2]) for i in range(0, len(V), 3)]
                self.assertTrue(all(math.isfinite(x) for x in V))
                self.assertLess(pct(distances(pts, skin), 0.9), 0.05)     # worn, not floating off

    def test_clothes_stay_outside_the_skin(self):
        """No more of an outfit sinks under the skin than on the plain fit (a skirt hangs from
        helper geometry, which has to take the body's shape too)."""
        sn = skin_normals("heavy", yaw=25)
        h = fit._Hash([p[:3] for p in sn], 0.03)

        def inside(r, item):
            V = wardrobe._arr("f", wardrobe.fitted(item, fit.decode(r))["verts"])
            n = sunk = 0
            for i in range(0, len(V), 3):
                p = (V[i], V[i + 1], V[i + 2])
                near = min(h.near(p, 2), key=lambda j: fit._d2(p, sn[j][:3]), default=None)
                if near is None:
                    continue
                v = sn[near]
                n += 1
                sunk += sum((p[k] - v[k]) * v[3 + k] for k in range(3)) < -0.01
            return sunk / n
        plain = fit.build(self.ply)
        for item in ("shirt_skirt", "tee_jeans"):
            with self.subTest(item):
                self.assertLess(inside(self.r, item), inside(plain, item) + 0.03)


if __name__ == "__main__":
    unittest.main()
