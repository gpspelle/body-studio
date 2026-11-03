"""The sample venue's skirting boards (venue_fittings.py) against its walls (sample_venue.py): each
board lies on a wall the whole way, never across a doorway or its frame, on the floor it stands on
(the landing inside the front door), and round the slim pillar where the ante-room opens on the hall.
And its walls meet: every end of a wall touches another wall, a frame or its own end, so nothing is
seen through a gap or into a wall's inside, but where the plan leaves a wall open on purpose."""
import contextlib
import math
import random
import unittest
from unittest import mock

from body_studio import sample_room, sample_venue as V, venue_fittings as F
from body_studio.venue_plan import ANTE, DECK, KITCHEN, LANDING, NOTCH, PERGOLA, RECEPTION, RECEPTION_DOOR, HALF_WALL, HALF_WALL_T


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


def _walls():
    """Every upright face from the floor the page draws, in plan ((x0, z0), (x1, z1), top, what):
    the house's and the pergola's flat walls (not those drawn as decor), each box's four sides, and
    the walls drawn as decor (brick faces, glass, tiles, piers, benches)."""
    segs, decor = [], [False]
    surface, as_decor = sample_room._surface, sample_room.as_decor

    @contextlib.contextmanager
    def flagged(out):
        decor[0] = True
        try:
            with as_decor(out):
                yield
        finally:
            decor[0] = False

    def record(rnd, box, colour, out, *a, **k):
        x0, x1, y0, y1, z0, z1 = box
        if not decor[0] and y1 - y0 > 0.3 and y0 < 0.05:
            if z0 == z1 and x1 > x0:
                segs.append(((x0, z0), (x1, z0), y1, "wall"))
            elif x0 == x1 and z1 > z0:
                segs.append(((x0, z0), (x0, z1), y1, "wall"))
            elif x1 > x0 and z1 > z0:
                segs.extend((p, q, y1, "box") for p, q in (((x0, z0), (x1, z0)), ((x0, z1), (x1, z1)), ((x0, z0), (x0, z1)), ((x1, z0), (x1, z1))))
        return surface(rnd, box, colour, out, *a, **k)

    with mock.patch.object(sample_room, "_surface", record), mock.patch.object(sample_room, "as_decor", flagged):
        out = []
        V.house(random.Random(1), out)
        V.pergola(random.Random(1), out)
    for item, (x, y, z), turn, _, o in F.fittings():
        c, s = math.cos(turn), math.sin(turn)
        if item in ("brick_wall", "glass_pane", "wall_tiles", "brick_bench") and y < 0.05:
            w = o["w"] if isinstance(o, dict) else o
            segs.append(((x - c * w / 2, z + s * w / 2), (x + c * w / 2, z - s * w / 2), y + (o.get("h", 2.4) if isinstance(o, dict) else 0.42), item))
        elif item == "brick_pier":
            w, d = o["w"] / 2, o["d"] / 2
            p = [(x - w, z - d), (x + w, z - d), (x + w, z + d), (x - w, z + d)]
            segs += [(p[i], p[(i + 1) % 4], o["h"], item) for i in range(4)]
    return segs


def _touches(p, seg, tol=0.025):
    (ax, az), (bx, bz) = seg[0], seg[1]
    dx, dz = bx - ax, bz - az
    t = max(0.0, min(1.0, ((p[0] - ax) * dx + (p[1] - az) * dz) / (dx * dx + dz * dz)))
    return math.hypot(ax + t * dx - p[0], az + t * dz - p[1]) < tol


class WallsMeetTest(unittest.TestCase):

    def test_every_wall_end_meets_another(self):
        segs = _walls()
        loose = set()
        for i, sg in enumerate(segs):
            for p in sg[:2]:
                if not any(j != i and _touches(p, o) for j, o in enumerate(segs)):
                    loose.add((round(p[0], 2), round(p[1], 2)))
        open_on_purpose = {
            (DECK[0], DECK[2]), (DECK[0], DECK[3]),                  # (the deck's sides, where its steps rise to the forecourt)
            (KITCHEN[0] - 3.0, 5.65),                                # (the kitchen yard's low wall's end)
            (0.0, 3.8),                                              # (the ante-room's way into the hall, its edge)
            (round(HALF_WALL[0] + HALF_WALL_T / 2 + 0.25, 2), HALF_WALL[1]),   # (the bench's free end)
            (PERGOLA[1] - 2.0, PERGOLA[3]),                          # (the pergola's wall, open to the garden's beds)
        }
        self.assertEqual(loose - {(round(x, 2), round(z, 2)) for x, z in open_on_purpose}, set())


class StreetFrontTest(unittest.TestCase):
    """The street front as Gabriel's street-view photos show it (2026-11-03)."""

    @classmethod
    def setUpClass(cls):
        cls.rows = []
        V.street(random.Random(1), cls.rows)
        cls.props = F.street_front()

    def items(self, name):
        return [t for t in self.props if t["item"] == name]

    def test_the_deck_is_sunk_below_the_forecourt_and_only_it_is_mapped(self):
        fy = V.FORECOURT_Y
        self.assertGreater(fy, 0.1, "too high for the map's floor: it is seen, not walked on")
        steps = V.well_steps()
        rises = [steps[0][2] + V.STEP_DOWN] + [b[2] - a[2] for a, b in zip(steps, steps[1:])] + [fy - steps[-1][2]]
        self.assertTrue(all(abs(r - rises[0]) < 1e-9 for r in rises), "even steps")
        self.assertTrue(all(r < 0.18 for r in rises))
        mapped = [r for r in self.rows if len(r) < 4]
        self.assertTrue(mapped and all(DECK[0] - 0.01 <= r[0][0] <= DECK[1] + 0.01 and r[0][1] < 0.25 for r in mapped), "no seats on the top steps")
        self.assertTrue(all(r[3] == V.FAR for r in self.rows if len(r) > 3))
        # (the forecourt at its level, yellow parking lines on it)
        court = [c for p, c, *_ in self.rows if abs(p[1] - fy) < 0.005 and p[0] < DECK[0]]
        self.assertTrue(court and sum(c[0] > 0.75 and c[2] < 0.3 for c in court) > 0.02 * len(court))

    def test_the_front_left_to_right_as_seen_from_the_street(self):
        # (+z on the right facing the door: the glass entry, bare concrete, the door, brick, the gate)
        bays = [b[2] for b in sorted(V.FRONT_BAYS)]
        self.assertEqual(bays, ["glass entry", "concrete", "door", "brick", "gate"])
        door = next(b for b in V.FRONT_BAYS if b[2] == "door")
        self.assertEqual(door[:2], (DECK[2], DECK[3]))
        bricks = self.items("brick_wall")
        self.assertTrue(bricks and all(t["at"][2] > DECK[3] and t["opts"]["w"] <= 5.0 for t in bricks))
        # (the pots either side of the steps, the handrails on them, the palms left of the glass entry)
        pots = sorted(t["at"][2] for t in self.items("egg_planter"))
        self.assertEqual(len(pots), 2)
        self.assertLess(pots[0], DECK[2])
        self.assertGreater(pots[1], DECK[3])
        rails = self.items("stair_rail")
        self.assertEqual(len(rails), 2)
        self.assertTrue(all(DECK[2] < t["at"][2] < DECK[3] and abs(t["opts"]["drop"] - V.FORECOURT_Y - V.STEP_DOWN) < 1e-3 for t in rails))
        self.assertTrue(all(t["at"][2] < V.FRONT_BAYS[0][0] for t in self.items("traveller_palm")))
        self.assertEqual(len(self.items("round_mirror")), len(V.MIRRORS))
        self.assertTrue(any(t.get("opts", {}).get("trail") for t in self.items("leafy_border")), "vines off the ledge")
        # (each built size within what its knobs allow)
        self.assertTrue(all(t["opts"]["w"] <= 4.0 for t in self.items("glass_pane")))
        self.assertTrue(all(t["opts"]["h"] <= 1.125 for t in self.items("stone_wall")))

if __name__ == "__main__":
    unittest.main()
