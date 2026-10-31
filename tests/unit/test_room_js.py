"""Runs tests/js/room.test.mjs (the body in a scanned room: walls, seats, the camera's view,
sitting and leaning) with Node, against the fake room's map and the MakeHuman test body's rig.
Skipped when Node isn't installed."""
import json
import tempfile
import unittest
from pathlib import Path

from body_studio import rig, room
from tests.fakes import room as fake
from tests.fakes.makehuman import write_body
from tests.unit.test_room import to_map
from tests.unit.node import needs_node, run_js


@needs_node
class RoomJs(unittest.TestCase):
    def test_room_maths(self):
        with tempfile.TemporaryDirectory() as tmp:
            ply = Path(tmp) / "body.ply"
            write_body(ply, n=80000)
            rig.build_and_save(ply)
            r = room.build_and_save(fake.write_room(Path(tmp) / "room" / "run_1"))

            def xz(p):
                m = to_map(r, p)
                return [m[0], m[2]]
            wall, inside = xz((2.5, 0, 0)), xz((1.5, 0, 0))
            out = [inside[0] - wall[0], inside[1] - wall[1]]
            n = (out[0] ** 2 + out[1] ** 2) ** 0.5
            places = {"middle": xz((0, 0, 0)), "sofa": xz((0, 0, -1.5)), "sofaFront": xz((0, 0, -0.9)),
                      "wall": wall, "wallOut": [out[0] / n, out[1] / n]}
            run_js(self, "room", env={"RIG_JSON": str(rig.rig_file(ply)),
                                      "ROOM_JSON": str(room.map_file(Path(tmp) / "room" / "run_1" / "splat" / "standard_30000_clean.ply")),
                                      "ROOM_PLACES": json.dumps(places)}, timeout=600)


if __name__ == "__main__":
    unittest.main()
