"""Runs tests/js/decor.test.mjs (decor in a room: the starters' shapes, meshes made from photos, rows,
chairs round tables, what blocks the walk) with Node, against decor.py's starters and a mesh
packed by decor.py. Skipped when Node isn't installed."""
import json
import os
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from body_studio import decor
from tests.fakes import photo3d as fake

ROOT = Path(__file__).resolve().parents[2]
NODE = shutil.which("node")


@unittest.skipIf(NODE is None, "node is not installed")
class DecorJs(unittest.TestCase):
    def test_decor(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp)
            v, c, f = fake.cone()
            mesh = decor.finish({"v": v, "c": c, "f": f})
            rv, rc, rf = decor.unpack(mesh)
            for name, obj in (("starters", list(decor.STARTERS)), ("mesh", mesh), ("ref", {"v": rv, "c": rc, "f": rf})):
                (d / f"{name}.json").write_text(json.dumps(obj))
            r = subprocess.run([NODE, "--test", str(ROOT / "tests" / "js" / "decor.test.mjs")],
                               env={**os.environ, "STARTERS": str(d / "starters.json"), "MESH": str(d / "mesh.json"),
                                    "MESH_REF": str(d / "ref.json")}, capture_output=True, text=True, timeout=300)
            self.assertEqual(r.returncode, 0, r.stdout[-6000:] + r.stderr[-2000:])
            self.assertRegex(r.stdout, r"\bfail 0\b")
            self.assertIsNone(re.search(r"\bpass 0\b", r.stdout))


if __name__ == "__main__":
    unittest.main()
