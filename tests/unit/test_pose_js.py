"""Runs tests/js/pose.test.mjs, walk.test.mjs and flesh.test.mjs (the posing, walking, tattoo and skin maths the page uses) with Node against the
MakeHuman body and the rig built from it. Skipped when Node isn't installed."""
import json
import tempfile
import unittest
from pathlib import Path

from body_studio import rig
from tests.fakes.makehuman import skin_normals, write_body
from tests.unit.node import needs_node, run_js


@needs_node
class PoseJs(unittest.TestCase):
    def test_pose_maths(self):
        with tempfile.TemporaryDirectory() as tmp:
            ply = Path(tmp) / "body.ply"
            write_body(ply, n=80000)
            rig.build_and_save(ply)
            normals = Path(tmp) / "normals.json"            # the mesh's own: what the skin's should agree with
            normals.write_text(json.dumps(skin_normals()))
            run_js(self, "pose", "walk", "flesh", env={"RIG_JSON": str(rig.rig_file(ply)), "BODY_PLY": str(ply),
                                                       "SKIN_NORMALS": str(normals)}, timeout=600)


if __name__ == "__main__":
    unittest.main()
