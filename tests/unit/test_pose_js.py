"""Runs tests/js/pose.test.mjs (the posing and tattoo maths the page uses) with Node against the
MakeHuman body and the rig built from it. Skipped when Node isn't installed."""
import os
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from body_studio import rig
from tests.fakes.makehuman import write_body

ROOT = Path(__file__).resolve().parents[2]
NODE = shutil.which("node")


@unittest.skipIf(NODE is None, "node is not installed")
class PoseJs(unittest.TestCase):
    def test_pose_maths(self):
        with tempfile.TemporaryDirectory() as tmp:
            ply = Path(tmp) / "body.ply"
            write_body(ply, n=80000)
            rig.build_and_save(ply)
            r = subprocess.run([NODE, "--test", str(ROOT / "tests" / "js" / "pose.test.mjs")],
                               env={**os.environ, "RIG_JSON": str(rig.rig_file(ply)), "BODY_PLY": str(ply)},
                               capture_output=True, text=True, timeout=600)
            self.assertEqual(r.returncode, 0, r.stdout[-4000:] + r.stderr[-2000:])
            self.assertRegex(r.stdout, r"\bfail 0\b")          # "# fail 0" (TAP) or "ℹ fail 0" (spec reporter)
            self.assertIsNone(re.search(r"\bpass 0\b", r.stdout))


if __name__ == "__main__":
    unittest.main()
