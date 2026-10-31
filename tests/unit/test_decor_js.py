"""Runs tests/js/decor.test.mjs (decor in a room: the starters' shapes, meshes made from photos, rows,
chairs round tables, what blocks the walk) with Node, against decor.py's starters and a mesh
packed by decor.py. Skipped when Node isn't installed."""
import json
import tempfile
import unittest
from pathlib import Path

from body_studio import decor
from tests.fakes import photo3d as fake
from tests.unit.node import needs_node, run_js


@needs_node
class DecorJs(unittest.TestCase):
    def test_decor(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp)
            v, c, f = fake.cone()
            mesh = decor.finish({"v": v, "c": c, "f": f})
            rv, rc, rf = decor.unpack(mesh)
            for name, obj in (("starters", list(decor.STARTERS)), ("mesh", mesh), ("ref", {"v": rv, "c": rc, "f": rf})):
                (d / f"{name}.json").write_text(json.dumps(obj))
            run_js(self, "decor", env={"STARTERS": str(d / "starters.json"), "MESH": str(d / "mesh.json"),
                                       "MESH_REF": str(d / "ref.json")})


if __name__ == "__main__":
    unittest.main()
