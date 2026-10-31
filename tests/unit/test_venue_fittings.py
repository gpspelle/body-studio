"""The sample venue's skirting boards (venue_fittings.py) against its walls (sample_venue.py): each
board lies on a wall the whole way, never across a doorway or its frame, on the floor it stands on
(the landing inside the front door), and round the slim pillar where the ante-room opens on the hall."""
import math
import random
import unittest
from unittest import mock

from body_studio import sample_room, sample_venue as V, venue_fittings as F
from body_studio.venue_plan import ANTE, LANDING, NOTCH, RECEPTION, RECEPTION_DOOR


def _drawn():
    """Every upright face reaching the floor the house and pergola draw ((axis, line, a0, a1): along
    x at z = line, or along z at x = line), and every door frame's posts that stand on the floor."""
    faces, frames = [], []
    surface, frame_x, frame_z = sample_room._surface, V.frame_x, V.frame_z

    def record(rnd, box, colour, out, *a, **k):
        x0, x1, y0, y1, z0, z1 = box
        if y0 <= 0.01 and y1 >= 0.1:
            if z0 == z1 and x1 > x0:
                faces.append(("x", z0, x0, x1))
            elif x0 == x1 and z1 > z0:
                faces.append(("z", x0, z0, z1))
        return surface(rnd, box, colour, out, *a, **k)

    def fx(z, a0, a1, y0, y1, out, rnd, colour=V.STEEL, t=0.05, d=0.06):
        if y0 <= 0.01:
            frames.append(("x", z, a0 - t, a1 + t))
        return frame_x(z, a0, a1, y0, y1, out, rnd, colour=colour, t=t, d=d)

    def fz(x, a0, a1, y0, y1, out, rnd, colour=V.STEEL, t=0.05, d=0.06):
        if y0 <= 0.01:
            frames.append(("z", x, a0 - t, a1 + t))
        return frame_z(x, a0, a1, y0, y1, out, rnd, colour=colour, t=t, d=d)

    with mock.patch.object(sample_room, "_surface", record), mock.patch.object(V, "frame_x", fx), mock.patch.object(V, "frame_z", fz):
        out = []
        V.house(random.Random(1), out)
        V.pergola(random.Random(1), out)
    return faces, frames


def _boards():
    """Each skirting board as (axis, line, s0, s1, y)."""
    out = []
    for item, (x, y, z), turn, _, length in F.fittings():
        if item == "skirting_board":
            axis = "x" if abs(math.sin(turn)) < 0.5 else "z"
            line, mid = (z, x) if axis == "x" else (x, z)
            out.append((axis, line, mid - length / 2, mid + length / 2, y))
    return out


class SkirtingTest(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.faces, cls.frames = _drawn()
        cls.boards = _boards()

    def test_every_board_lies_on_a_wall_the_whole_way(self):
        for axis, line, s0, s1, _ in self.boards:
            on = [f for f in self.faces if f[0] == axis and abs(f[1] - line) < 0.05]
            u = s0 + 0.01
            while u < s1 - 0.005:
                self.assertTrue(any(f[2] - 1e-6 <= u <= f[3] + 1e-6 for f in on), f"no wall behind the board at {axis} {line} {u:.2f}")
                u += 0.02

    def test_no_board_crosses_a_doorway(self):
        for axis, line, s0, s1, _ in self.boards:
            hits = [f for f in self.frames if f[0] == axis and abs(f[1] - line) < 0.08 and f[2] < s1 - 1e-6 and f[3] > s0 + 1e-6]
            self.assertEqual(hits, [], f"board {axis} {line} {s0:.2f}..{s1:.2f}")

    def test_the_door_by_the_front_is_past_the_landing_step(self):
        self.assertGreater(RECEPTION_DOOR[0] - V.DOOR_POST, RECEPTION[0] + LANDING[0])

    def test_boards_stand_on_the_landing_where_it_is(self):
        lx = RECEPTION[0] + LANDING[0]
        for axis, line, s0, s1, y in self.boards:
            if axis == "x" and s1 <= lx + 1e-6:
                self.assertAlmostEqual(y, LANDING[1])
            elif axis == "x" and s0 < lx:
                self.fail(f"a board runs over the landing's step: {s0:.2f}..{s1:.2f}")
            else:
                self.assertEqual(y, 0.0)

    def test_round_the_ante_rooms_pillar_and_along_its_walls(self):
        pz = NOTCH[2]
        def has(axis, line, s0, s1):
            return any(b[0] == axis and abs(b[1] - line) < 0.03 and b[2] <= s0 + 0.01 and b[3] >= s1 - 0.01 for b in self.boards)
        for side in (("x", pz, -0.12, 0.0), ("x", pz + 0.2, -0.12, 0.0), ("z", -0.12, pz, pz + 0.2), ("z", 0.0, 0.0, pz)):
            self.assertTrue(has(*side), side)
        for z in (0.0, 3.98):   # (the ante-room's long walls, end to end, in pieces)
            run = sorted((b[2], b[3]) for b in self.boards if b[0] == "x" and abs(b[1] - z) < 0.01 and ANTE[0] - 0.01 <= b[2] < ANTE[1])
            self.assertAlmostEqual(run[0][0], ANTE[0]); self.assertAlmostEqual(run[-1][1], ANTE[1])
            self.assertTrue(all(abs(a[1] - b[0]) < 1e-6 for a, b in zip(run, run[1:])))


if __name__ == "__main__":
    unittest.main()
