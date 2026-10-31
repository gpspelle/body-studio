"""Runs tests/js/flash.test.mjs (the tattoo studio: the flash wall, lying on the bed, the chair and
its arm rests, the camera's views) with Node, against the sample studio's map and the MakeHuman
test body's rig. Skipped when Node isn't installed."""
import tempfile
import unittest
from pathlib import Path

from body_studio import library, rig, room, sample_room
from tests.fakes.makehuman import write_body
from tests.unit.node import needs_node, run_js


@needs_node
class FlashJs(unittest.TestCase):
    def test_studio_maths(self):
        with tempfile.TemporaryDirectory() as tmp:
            ply = Path(tmp) / "body.ply"
            write_body(ply, n=80000)
            rig.build_and_save(ply)
            studio = sample_room.ensure(Path(tmp), library.STUDIO)
            room.build_and_save(studio)
            run_js(self, "flash", env={"RIG_JSON": str(rig.rig_file(ply)), "ROOM_JSON": str(room.map_file(studio))}, timeout=600)


if __name__ == "__main__":
    unittest.main()
