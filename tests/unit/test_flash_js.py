"""Runs tests/js/flash.test.mjs (the tattoo studio: the flash wall, lying on the bed, the chair and
its arm rests, the camera's views) with Node, against the sample studio's map and the MakeHuman
test body's rig. Skipped when Node isn't installed."""
import os
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from body_studio import library, rig, room, sample_room
from tests.fakes.makehuman import write_body

ROOT = Path(__file__).resolve().parents[2]
NODE = shutil.which("node")


@unittest.skipIf(NODE is None, "node is not installed")
class FlashJs(unittest.TestCase):
    def test_studio_maths(self):
        with tempfile.TemporaryDirectory() as tmp:
            ply = Path(tmp) / "body.ply"
            write_body(ply, n=80000)
            rig.build_and_save(ply)
            studio = sample_room.ensure(Path(tmp), library.STUDIO)
            room.build_and_save(studio)
            r = subprocess.run([NODE, "--test", str(ROOT / "tests" / "js" / "flash.test.mjs")],
                               env={**os.environ, "RIG_JSON": str(rig.rig_file(ply)), "ROOM_JSON": str(room.map_file(studio))},
                               capture_output=True, text=True, timeout=600)
            self.assertEqual(r.returncode, 0, r.stdout[-6000:] + r.stderr[-2000:])
            self.assertRegex(r.stdout, r"\bfail 0\b")
            self.assertIsNone(re.search(r"\bpass 0\b", r.stdout))


if __name__ == "__main__":
    unittest.main()
