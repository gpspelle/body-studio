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
from tests.fakes.makehuman import surface, write_body
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
            self.assertFalse(fit.fit_file(ply).exists())             # the plain fit is left alone

    def test_help_needs_no_torch(self):
        out = io.StringIO()
        with mock.patch.dict(sys.modules, {"torch": None, "anny": None}), contextlib.redirect_stdout(out):
            with self.assertRaises(SystemExit) as e:
                cli.main(["fit-anny", "--help"])
        self.assertEqual(e.exception.code, 0)
        self.assertIn("--wrap", out.getvalue())

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
        self.assertTrue(fit.current(self.ply))                     # same version as fit.py's
        self.assertEqual(fit.cached(self.ply), json.loads(json.dumps(self.r)))
        f = fit.decode(self.r)
        self.assertEqual(len(f["verts"]), len(wardrobe.base()["verts"]))
        skin = surface("heavy", yaw=25)
        for item in ("tee_jeans", "white_sneakers", "bob_dark"):
            with self.subTest(item):
                V = wardrobe._arr("f", wardrobe.fitted(item, f)["verts"])
                pts = [(V[i], V[i + 1], V[i + 2]) for i in range(0, len(V), 3)]
                self.assertTrue(all(math.isfinite(x) for x in V))
                self.assertLess(pct(distances(pts, skin), 0.9), 0.05)     # worn, not floating off


if __name__ == "__main__":
    unittest.main()
