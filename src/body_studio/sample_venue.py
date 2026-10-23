"""A wedding venue made of splats, laid out like the Casa Arandella plan Gabriel sent (a long house
with a garden behind it that runs down to the beach), for decorating a big place before filming one.
Only what the plan shows is built (the rooms, their walls, doors and windows, the stage, the
pergola, the garden and its bungalow) and the beach and the sea it meets; the rest is left to the
Decor panel. What the plan doesn't say (the pergola's glass roof on black steel, the sand under it,
the anti-room's green walls) is as the venue's own photos show it.

Drawn like the sample living room (sample_room.py, whose helpers it uses): boxes, cylinders and
leaves covered in flat splats, written as a room run so room.py maps it and the page shows it like
a filmed room. It is much bigger (90 m from the door to the water), so its surfaces take bigger
splats further apart, and what is far off (the sea, the island across the channel) is drawn see-
through enough that the map leaves it out.

In metres, y up, the floor at 0 (the file is y-down). x runs along the house from the entrance
(x < 0) to the beach; z across it, from the long straight wall on the right (z = 0) to the left.
The plan isn't to scale ("planta sem escala"), so the sizes are its measures:

- the deck at the door, the reception (6 m), the vertical garden (4.5 m, a wall of leaves) and the
  ante-room (9.3 m), each 4 m wide; the kitchen (4.7 m) beside the ante-room, opening on the hall;
- the main hall, 17.8 m by 8.6 m (narrower by 1.5 m for its first 5 m), its windows along the
  left, a half wall (3.24 m) before the hall to the toilets on the right; glass doors at its end;
- the stage, 8.6 m by 3.2 m and 70 cm high, beside the pergola (10.8 m by 7.4 m), which opens on
  the garden;
- the garden, 17.8 m wide, 20 m along the right and 30 m along the left, walled along its sides,
  the bungalow on the left near its end; its slanted far side opens on the beach.
"""
from __future__ import annotations

import math
import random
from pathlib import Path

from . import sample_room as base

VERSION = 2
PLY = "wedding_venue_clean.ply"
SEED = 23

H = 3.4                             # the ceiling, everywhere under a roof
HALL = (0.0, 17.8, 0.0, 8.6)        # x0, x1, z0, z1
NOTCH = (0.0, 5.0, 1.5)             # the hall's first 5 m are 1.5 m narrower on the right
HALF_WALL = (11.3, 3.24)            # x, how far it comes out from the right wall
WC = (11.3, 20.0, 3.2)              # the hall to the toilets: x0, x1, how wide
STAGE = (20.0, 28.6, 0.0, 3.2, 0.7)  # x0, x1, z0, z1, its height
PERGOLA = (17.8, 28.6, 3.2, 10.6)
GARDEN_X = 28.6                     # where the garden starts
GARDEN_W = 17.8
GARDEN_RIGHT, GARDEN_LEFT = 20.0, 30.0
ANTE = (-9.3, 0.0, 0.0, 4.0)
KITCHEN = (-9.3, 0.0, 4.0, 8.6)
VERTICAL = (-13.8, -9.3, 0.0, 4.0)
RECEPTION = (-19.8, -13.8, 0.0, 4.0)
DECK = (-21.8, -19.8, 0.0, 4.0)
BUNGALOW = (41.5, 50.5, 12.7, 17.5)
BEACH = 8.0                         # m of dry sand from the garden's far side to the water
SEA = 130.0                         # m out to the island across the channel

FLOOR_STEP, WALL_STEP, CEIL_STEP, LAWN_STEP = 0.055, 0.065, 0.08, 0.085

PLASTER = (0.93, 0.91, 0.87)
CEILING = (0.95, 0.94, 0.91)
OAK = (0.55, 0.40, 0.27)
BEAM = (0.36, 0.25, 0.17)
STEEL = (0.12, 0.12, 0.13)
WALNUT = (0.34, 0.23, 0.16)
BRICK = (0.66, 0.42, 0.31)
HEDGE = (0.17, 0.30, 0.15)
LEAF = (0.24, 0.40, 0.20)
OLIVE = (0.45, 0.52, 0.36)
BARK = (0.33, 0.27, 0.21)
WHITEWASH = (0.92, 0.91, 0.88)
LINEN = (0.82, 0.78, 0.70)

SAND = (0.86, 0.78, 0.62)
SEA_BLUE = (0.36, 0.50, 0.52)
FAR = 0.42                          # how opaque what is far off is drawn: under room.OPAQUE


# ---------------------------------------------------------------- what the surfaces look like

def _stone(x, y, z, rnd):
    """Pale limestone, 80 cm square, each slab its own shade, a fine grout line."""
    if x % 0.8 < 0.006 or z % 0.8 < 0.006:
        return (0.70, 0.67, 0.62)
    r = random.Random(math.floor(x / 0.8) * 7919 + math.floor(z / 0.8))
    t = r.uniform(-0.06, 0.04)
    vein = 0.02 * math.sin(x * 4.1 + z * 2.3 + 3 * math.sin(z * 0.9 + r.random() * 6))
    return (0.86 + t + vein, 0.83 + t + vein, 0.77 + t + vein)


def _oak(x, y, z, rnd):
    """Light oak boards along the hall, 20 cm wide and 2.4 m long, each its own shade."""
    k = math.floor(z / 0.2)
    r = random.Random(k * 7919 + math.floor((x + (k % 4) * 0.6) / 2.4))
    t = r.uniform(-0.04, 0.035)
    if z % 0.2 < 0.01:
        return (0.55, 0.43, 0.32)
    grain = 0.01 * math.sin(x * 9 + k * 2.3 + 2 * math.sin(x * 1.3 + k))
    return (0.76 + t + grain, 0.63 + t + grain, 0.48 + t * 0.9 + grain)


def _shaded(colour, rect, reach=0.7, dark=0.8):
    """A floor a little darker toward its edges (where the walls keep the light off it): rect is
    (x0, x1, z0, z1)."""
    x0, x1, z0, z1 = rect
    def f(x, y, z, rnd):
        c = colour(x, y, z, rnd) if callable(colour) else colour
        d = min(x - x0, x1 - x, z - z0, z1 - z)
        k = dark + (1 - dark) * min(1.0, max(0.0, d) / reach) ** 0.7
        return tuple(v * k for v in c)
    return f


def _bricks(x, y, z, rnd):
    """Old terracotta bricks in a herringbone, 20 by 10 cm, a sandy joint."""
    u, v = (x + z) / math.sqrt(2), (x - z) / math.sqrt(2)
    k = math.floor(u / 0.2)
    w = v + (0.1 if k % 2 else 0.0)
    if u % 0.2 < 0.008 or w % 0.4 < 0.008 or (w % 0.4 > 0.2 - 0.004 and w % 0.4 < 0.2 + 0.004):
        return (0.74, 0.66, 0.54)
    r = random.Random(k * 104729 + math.floor(w / 0.2))
    t = r.uniform(-0.07, 0.05)
    return (BRICK[0] + t, BRICK[1] + t * 0.8, BRICK[2] + t * 0.7)


def _boards(x, y, z, rnd):
    """Weathered deck boards along z, 14 cm, a dark gap between them."""
    if x % 0.14 < 0.01:
        return (0.24, 0.18, 0.13)
    r = random.Random(math.floor(x / 0.14))
    t = r.uniform(-0.06, 0.05)
    return (0.56 + t, 0.44 + t, 0.32 + t)


def _wall(colour):
    """A plastered wall, a little darker near the floor and the ceiling (where less light gets)
    and with a white skirting 12 cm high."""
    def f(x, y, z, rnd):
        if y < 0.12:
            return (0.97, 0.96, 0.94)
        k = (0.86 + 0.14 * min(1.0, (y - 0.12) / 1.4)) * (1 - 0.06 * max(0.0, 1 - (H - y) / 0.5))
        return tuple(c * k for c in colour)
    return f


def _view(x, y, z, rnd):
    """What a window shows: a pale sky, lighter toward the top (the plan says nothing of outside)."""
    k = min(1.0, max(0.0, (y - 0.7) / 2.4))
    return (0.80 + 0.1 * k, 0.86 + 0.07 * k, 0.90 + 0.05 * k)


def _lawn(x, y, z, rnd):
    """A lawn mown in stripes 1.5 m wide, a little patchy."""
    stripe = 0.03 if math.floor((x - GARDEN_X) / 1.5) % 2 else -0.015
    patch = 0.035 * math.sin(x * 0.7 + 2 * math.sin(z * 0.5)) * math.sin(z * 0.9)
    t = stripe + patch + rnd.uniform(-0.04, 0.04)
    return (0.32 + t * 0.8, 0.50 + t, 0.25 + t * 0.6)


def _sand(x, y, z, rnd):
    """Beach sand, pale and fine, a little darker in drifts."""
    t = 0.03 * math.sin(x * 0.9 + 2 * math.sin(z * 0.6)) * math.sin(z * 1.3 + x * 0.2) + rnd.uniform(-0.035, 0.035)
    return (SAND[0] + t, SAND[1] + t, SAND[2] + t * 0.9)


def _greenwall(x, y, z, rnd):
    """The vertical garden's wall: ferns and ivy, light and dark."""
    m = math.sin(x * 5.3 + y * 3.1) * math.sin(x * 2.1 - y * 4.7)
    t = rnd.uniform(-0.06, 0.06)
    return (0.18 + 0.08 * m + t, 0.36 + 0.10 * m + t, 0.16 + 0.05 * m + t)


def _panels(x, y, z, rnd):
    """The stage's back wall: oak boards up and down, 12 cm."""
    if x % 0.12 < 0.008:
        return (0.30, 0.21, 0.14)
    r = random.Random(math.floor(x / 0.12))
    t = r.uniform(-0.05, 0.05)
    return (OAK[0] + t, OAK[1] + t, OAK[2] + t)


def _clapboard(x, y, z, rnd):
    """The bungalow: white boards along, 18 cm, each with a shadow line under it."""
    if y % 0.18 < 0.015:
        return (0.74, 0.73, 0.70)
    return WHITEWASH


# ---------------------------------------------------------------- walls with holes in them

def wall_x(z, x0, x1, holes, colour, out, rnd, h=H, step=WALL_STEP):
    """A wall along x at z, from the floor to h, less the holes ((a0, a1, y0, y1) along x)."""
    for (a0, a1, b0, b1) in _cut((x0, x1), (0.0, h), holes):
        base._surface(rnd, (a0, a1, b0, b1, z, z), colour, out, step)


def wall_z(x, z0, z1, holes, colour, out, rnd, h=H, step=WALL_STEP):
    """A wall along z at x, from the floor to h, less the holes ((a0, a1, y0, y1) along z)."""
    for (a0, a1, b0, b1) in _cut((z0, z1), (0.0, h), holes):
        base._surface(rnd, (x, x, b0, b1, a0, a1), colour, out, step)


def _cut(along, up, holes):
    """A rectangle (along x up) less some rectangles in it, as rectangles: cut in columns at the
    holes' sides, each column less the holes over it."""
    xs = sorted({along[0], along[1], *[max(along[0], min(along[1], v)) for h in holes for v in h[:2]]})
    out = []
    for a0, a1 in zip(xs, xs[1:]):
        if a1 - a0 < 1e-6:
            continue
        m = (a0 + a1) / 2
        spans = sorted((max(up[0], h[2]), min(up[1], h[3])) for h in holes if h[0] <= m <= h[1])
        y = up[0]
        for b0, b1 in spans:
            if b0 > y:
                out.append((a0, a1, y, b0))
            y = max(y, b1)
        if y < up[1]:
            out.append((a0, a1, y, up[1]))
    return out


def frame_x(z, a0, a1, y0, y1, out, rnd, colour=STEEL, t=0.05, d=0.06):
    """A frame round an opening in a wall along x: posts each side and a head (and a sill)."""
    for x in (a0 - t, a1):
        base._surface(rnd, (x, x + t, y0, y1, z - d / 2, z + d / 2), colour, out, 0.03)
    base._surface(rnd, (a0 - t, a1 + t, y1, y1 + t, z - d / 2, z + d / 2), colour, out, 0.03)
    if y0 > 0:
        base._surface(rnd, (a0 - t, a1 + t, y0 - t, y0, z - d, z + d), colour, out, 0.03)


def frame_z(x, a0, a1, y0, y1, out, rnd, colour=STEEL, t=0.05, d=0.06):
    for z in (a0 - t, a1):
        base._surface(rnd, (x - d / 2, x + d / 2, y0, y1, z, z + t), colour, out, 0.03)
    base._surface(rnd, (x - d / 2, x + d / 2, y1, y1 + t, a0 - t, a1 + t), colour, out, 0.03)
    if y0 > 0:
        base._surface(rnd, (x - d, x + d, y0 - t, y0, a0 - t, a1 + t), colour, out, 0.03)


def door_z(x, a0, a1, out, rnd, h=2.2):
    """A closed panelled door in a wall along z (its own colour, a brass handle)."""
    base._surface(rnd, (x, x, 0.0, h, a0, a1), WALNUT, out, 0.03)
    base._surface(rnd, (x - 0.03, x + 0.03, 1.0, 1.04, a1 - 0.14, a1 - 0.06), (0.78, 0.64, 0.36), out, 0.01)
    frame_z(x, a0, a1, 0.0, h, out, rnd, colour=(0.96, 0.95, 0.92), t=0.06, d=0.04)


def door_x(z, a0, a1, out, rnd, h=2.2):
    base._surface(rnd, (a0, a1, 0.0, h, z, z), WALNUT, out, 0.03)
    base._surface(rnd, (a1 - 0.14, a1 - 0.06, 1.0, 1.04, z - 0.03, z + 0.03), (0.78, 0.64, 0.36), out, 0.01)
    frame_x(z, a0, a1, 0.0, h, out, rnd, colour=(0.96, 0.95, 0.92), t=0.06, d=0.04)


# ---------------------------------------------------------------- the house

def house(rnd, out):
    wall = _wall(PLASTER)
    # the floors and the ceilings
    for r in (RECEPTION, VERTICAL, ANTE):
        base._surface(rnd, (r[0], r[1], 0, 0, r[2], r[3]), _shaded(_stone, r), out, FLOOR_STEP)
    hx0, hx1, hz0, hz1 = HALL
    oak = _shaded(_oak, HALL, reach=1.2, dark=0.8)
    base._surface(rnd, (hx0, NOTCH[1], 0, 0, NOTCH[2], hz1), oak, out, 0.04, 0.004)
    base._surface(rnd, (NOTCH[1], hx1, 0, 0, hz0, hz1), oak, out, 0.04, 0.004)
    base._surface(rnd, (hx1, WC[1], 0, 0, 0, WC[2]), _shaded(_stone, (hx1 - 6, WC[1], 0, WC[2])), out, FLOOR_STEP)
    base._surface(rnd, (*DECK[:2], 0, 0, *DECK[2:]), _boards, out, FLOOR_STEP)
    for (x0, x1, z0, z1) in (RECEPTION, ANTE, (hx0, NOTCH[1], NOTCH[2], hz1), (NOTCH[1], hx1, hz0, hz1),
                             (hx1, STAGE[1], 0, WC[2])):
        base._surface(rnd, (x0, x1, H, H, z0, z1), CEILING, out, CEIL_STEP)

    # the long straight wall on the right (z = 0): the reception's door is at the deck end
    wall_x(0.0, RECEPTION[0], RECEPTION[1], [], wall, out, rnd)
    green_x(rnd, 0.0, VERTICAL[0], VERTICAL[1], +1, out)
    # (the ante-room has walls of ferns and leaves too, the venue's own: "decoração natural permanente")
    green_x(rnd, 0.0, ANTE[0], ANTE[1], +1, out)
    # the left side of the reception, the vertical garden and the ante-room; the kitchen behind
    wall_x(4.0, RECEPTION[0], RECEPTION[1], [(-18.8, -17.6, 0.9, 2.6)], wall, out, rnd)
    frame_x(4.0, -18.8, -17.6, 0.9, 2.6, out, rnd)
    base._surface(rnd, (-18.8, -17.6, 0.9, 2.6, 4.02, 4.02), _view, out, 0.04)
    wall_x(4.0, VERTICAL[0], VERTICAL[1], [], wall, out, rnd)
    wall_x(4.0, ANTE[0], ANTE[1], [], wall, out, rnd)  # (the kitchen's side: green on the ante-room's)
    green_x(rnd, 4.0, ANTE[0] + 0.3, ANTE[1] - 0.3, -1, out)
    wall_x(KITCHEN[3], KITCHEN[0], KITCHEN[1], [], wall, out, rnd)
    wall_z(KITCHEN[0], 4.0, KITCHEN[3], [], wall, out, rnd)
    # the front: the deck and the reception's door, wide open; the rooms open one into the next
    wall_z(RECEPTION[0], 0.0, 4.0, [(1.2, 2.8, 0.0, 2.6)], wall, out, rnd)
    frame_z(RECEPTION[0], 1.2, 2.8, 0.0, 2.6, out, rnd, colour=WALNUT, t=0.08)
    for x in (RECEPTION[1], VERTICAL[1]):           # wide doorways between them
        wall_z(x, 0.0, 4.0, [(0.8, 3.2, 0.0, 2.8)], wall, out, rnd)
        frame_z(x, 0.8, 3.2, 0.0, 2.8, out, rnd, colour=(0.96, 0.95, 0.92), t=0.08, d=0.12)
    # the ante-room into the hall (where the hall is narrower), the kitchen's back wall beside it
    wall_z(0.0, 0.0, 4.0, [(NOTCH[2] + 0.2, 4.0 - 0.2, 0.0, 2.9)], wall, out, rnd)
    wall_z(0.0, 4.0, hz1, [(7.0, 7.9, 0.0, 2.2)], wall, out, rnd)
    door_z(0.0, 7.0, 7.9, out, rnd)                 # the kitchen's door, on the hall

    # the hall: the notch on the right, the half wall, the toilets' hall and the stage beside it
    wall_x(NOTCH[2], 0.0, NOTCH[1], [], wall, out, rnd)
    wall_z(NOTCH[1], 0.0, NOTCH[2], [], wall, out, rnd)
    wall_x(0.0, NOTCH[1], WC[1], [(13.0, 13.9, 0.0, 2.2), (15.2, 16.1, 0.0, 2.2)], wall, out, rnd)
    door_x(0.0, 13.0, 13.9, out, rnd)
    door_x(0.0, 15.2, 16.1, out, rnd)
    hx, reach = HALF_WALL
    base._surface(rnd, (hx - 0.1, hx + 0.1, 0.0, 1.1, 0.0, reach), _wall((0.90, 0.88, 0.84)), out, 0.04)
    base._surface(rnd, (hx - 0.13, hx + 0.13, 1.1, 1.14, 0.0, reach + 0.03), OAK, out, 0.03)
    wall_x(WC[2], WC[1] - 2.5, WC[1], [], wall, out, rnd)
    wall_z(WC[1], 0.0, WC[2], [], wall, out, rnd)
    # the windows along the left, tall, in black steel
    windows = [(1.2 + 3.2 * k, 2.6 + 3.2 * k) for k in range(5)]
    wall_x(hz1, hx0, hx1, [(a, b, 0.7, 2.9) for a, b in windows], wall, out, rnd)
    for a, b in windows:
        frame_x(hz1, a, b, 0.7, 2.9, out, rnd)
        base._surface(rnd, ((a + b) / 2 - 0.02, (a + b) / 2 + 0.02, 0.7, 2.9, hz1 - 0.02, hz1 + 0.02), STEEL, out, 0.03)
        base._surface(rnd, (a, b, 2.2, 2.24, hz1 - 0.02, hz1 + 0.02), STEEL, out, 0.03)
        base._surface(rnd, (a, b, 0.7, 2.9, hz1 + 0.03, hz1 + 0.03), _view, out, 0.04)
    # its end: glass doors onto the pergola, open; glass above them
    doors = [(3.4 + 1.3 * k, 4.4 + 1.3 * k) for k in range(4)]
    wall_z(hx1, WC[2], hz1, [(a, b, 0.0, 2.6) for a, b in doors] + [(WC[2] + 0.1, hz1 - 0.1, 2.7, 3.3)], wall, out, rnd)
    for a, b in doors:
        frame_z(hx1, a, b, 0.0, 2.6, out, rnd)
    frame_z(hx1, WC[2] + 0.1, hz1 - 0.1, 2.7, 3.3, out, rnd)
    base._surface(rnd, (hx1, hx1, 2.7, 3.3, WC[2] + 0.1, hz1 - 0.1), (0.84, 0.89, 0.92), out, 0.05)
    # mouldings on the hall's walls, as in an old house: a dado rail and tall panels above it
    for a, b in [(NOTCH[1] + 0.3, HALF_WALL[0] - 0.3)]:
        boiserie_x(0.0, a, b, +1, out, rnd)
    for a, b in [(0.3, windows[0][0] - 0.3)] + [(windows[k][1] + 0.35, windows[k + 1][0] - 0.35) for k in range(4)] + [(windows[4][1] + 0.35, hx1 - 0.3)]:
        boiserie_x(hz1, a, b, -1, out, rnd)
    # beams across the ceiling
    for k in range(7):
        x = 1.3 + 2.6 * k
        z0 = NOTCH[2] if x < NOTCH[1] else 0.0
        base._surface(rnd, (x - 0.1, x + 0.1, H - 0.28, H, z0, hz1), BEAM, out, 0.04)

    # the stage: 70 cm up, panelled behind, a lip of oak along its front
    sx0, sx1, sz0, sz1, sh = STAGE
    base._surface(rnd, (sx0, sx1, sh, sh, sz0, sz1), _boards, out, FLOOR_STEP)
    base._surface(rnd, (sx0, sx1, 0.0, sh, sz1, sz1), (0.20, 0.15, 0.11), out, 0.04)
    base._surface(rnd, (sx1, sx1, 0.0, sh, sz0, sz1), (0.20, 0.15, 0.11), out, 0.04)
    base._surface(rnd, (sx0, sx1, sh - 0.04, sh + 0.02, sz1 - 0.02, sz1 + 0.04), OAK, out, 0.02)
    base._surface(rnd, (sx0, sx1, sh, H, 0.0, 0.0), _panels, out, 0.04)
    wall_z(sx1, 0.0, sz1, [], _panels, out, rnd)


def boiserie_x(z, a, b, side, out, rnd):
    """On a wall along x at z (the room on its `side`): a dado rail at 90 cm and over it panels
    framed in a thin moulding, about 1.1 m wide, up to 2.75 m; a small panel under the rail."""
    if b - a < 0.5:
        return
    lip, w, colour = 0.012 * side, 0.025, (0.97, 0.96, 0.93)
    shadow = (0.80, 0.78, 0.74)

    def line(x0, x1, y0, y1):
        base._surface(rnd, (x0, x1, y0, y1, z + lip, z + lip), colour, out, 0.012)
        # its shadow just under it, on the wall
        base._surface(rnd, (x0, x1, y0 - 0.012, y0, z + lip / 3, z + lip / 3), shadow, out, 0.012)

    line(a, b, 0.88, 0.92)
    n = max(1, round((b - a) / 1.1))
    for k in range(n):
        x0, x1 = a + (b - a) * k / n + 0.09, a + (b - a) * (k + 1) / n - 0.09
        for (y0, y1) in ((1.08, 2.75), (0.22, 0.74)):
            line(x0, x1, y0, y0 + w)
            line(x0, x1, y1 - w, y1)
            base._surface(rnd, (x0, x0 + w, y0, y1, z + lip, z + lip), colour, out, 0.012)
            base._surface(rnd, (x1 - w, x1, y0, y1, z + lip, z + lip), colour, out, 0.012)


def green_x(rnd, z, x0, x1, side, out):
    """A wall of leaves along x at z (the room on its `side`): ferns and ivy, light and dark, the
    leaves standing out from it."""
    base._surface(rnd, (x0, x1, 0.0, H, z + 0.005 * side, z + 0.005 * side), _greenwall, out, 0.04)
    for _ in range(int(3000 * (x1 - x0))):
        x, y = rnd.uniform(x0 + 0.05, x1 - 0.05), rnd.uniform(0.15, H - 0.2)
        t = rnd.uniform(-0.06, 0.08)
        out.append(((x, y, z + side * rnd.uniform(0.02, 0.16)), (0.20 + t, 0.40 + t, 0.18 + t), [0.03, 0.03, 0.012]))


# ---------------------------------------------------------------- outside: the pergola and the garden

def pergola(rnd, out):
    """The pergola as the photos show it: a glass roof, pitched, on black steel posts and rafters,
    over sand; open on the garden and on the stage."""
    x0, x1, z0, z1 = PERGOLA
    base._surface(rnd, (x0, x1, 0, 0, z0, z1), _sand, out, FLOOR_STEP)
    eave, ridge, zm = 3.0, 4.1, (z0 + z1) / 2
    roof = lambda z: eave + (ridge - eave) * (1 - abs(z - zm) / ((z1 - z0) / 2))
    bars = [x0 + 0.05 + k * (x1 - x0 - 0.1) / 6 for k in range(7)]
    for x in bars:
        for z in (z1 - 0.06,):                      # posts along the open side, the house on the other
            base._surface(rnd, (x - 0.05, x + 0.05, 0.0, eave, z - 0.05, z + 0.05), STEEL, out, 0.03)
        # a rafter across, up to the ridge and down
        for k in range(int((z1 - z0) / 0.03)):
            z = z0 + (k + 0.5) * 0.03
            out.append(((x, roof(z), z), STEEL, [0.03, 0.04, 0.02]))
    for z in (z0 + 0.06, z1 - 0.06, zm):             # the eaves' beams and the ridge, along x
        base._surface(rnd, (x0, x1, roof(z) - 0.12, roof(z), z - 0.04, z + 0.04), STEEL, out, 0.03)
    # the glass: faint, so the sky shows through it (and the map leaves it out)
    for k in range(int((x1 - x0) / 0.3)):
        for m in range(int((z1 - z0) / 0.3)):
            x, z = x0 + (k + rnd.random()) * 0.3, z0 + (m + rnd.random()) * 0.3
            out.append(((x, roof(z) + 0.02, z), (0.86, 0.91, 0.93), [0.22, 0.01, 0.22], 0.06))


def _garden_end(z):
    """Where the garden ends along x, at z across: its far side is slanted."""
    return GARDEN_X + GARDEN_RIGHT + (GARDEN_LEFT - GARDEN_RIGHT) * z / GARDEN_W


def garden(rnd, out):
    # the lawn, from the stage's end (where the house ends) and the pergola to the far side
    z = 0.0
    while z < GARDEN_W:
        x = GARDEN_X
        end = _garden_end(z)
        while x < end:
            p = (x + rnd.random() * LAWN_STEP, 0.0, z + rnd.random() * LAWN_STEP)
            if p[0] < end:
                out.append((p, _lawn(*p, rnd), [LAWN_STEP * 0.75, LAWN_STEP * 0.09, LAWN_STEP * 0.75]))
            x += LAWN_STEP
        z += LAWN_STEP
    # beside the pergola, the lawn to the garden's left wall
    base._surface(rnd, (PERGOLA[0], GARDEN_X, 0, 0, PERGOLA[3], GARDEN_W), _lawn, out, LAWN_STEP)
    # its walls, along the right (on from the house's) and the left, and across beside the pergola,
    # whitewashed, 2 m high, to where the sand starts
    white = _wall(WHITEWASH)
    wall_x(0.0, GARDEN_X, _garden_end(0.0), [], white, out, rnd, h=2.0)
    wall_x(GARDEN_W, PERGOLA[0], _garden_end(GARDEN_W), [], white, out, rnd, h=2.0)
    wall_z(PERGOLA[0], PERGOLA[3], GARDEN_W, [], white, out, rnd, h=2.0)
    bungalow(rnd, out)


def beach(rnd, out):
    """Past the garden's far side, the beach: dry sand down to the water (walkable), then the sea
    out to the island across the channel, a long blue ridge under the haze; both far enough off,
    and drawn faintly enough, that the map leaves them out."""
    a, b = (GARDEN_X + GARDEN_RIGHT, 0.0), (GARDEN_X + GARDEN_LEFT, GARDEN_W)
    L = math.hypot(b[0] - a[0], b[1] - a[1])
    t, n = ((b[0] - a[0]) / L, (b[1] - a[1]) / L), ((b[1] - a[1]) / L, -(b[0] - a[0]) / L)   # along it, out to sea
    def at(u, v):                                     # u along the shore from a, v out from the garden
        return (a[0] + t[0] * u + n[0] * v, a[1] + t[1] * u + n[1] * v)
    # dry sand along the garden's width, for the body to walk out on
    step = LAWN_STEP
    for i in range(int(L / step)):
        for k in range(int(BEACH / step)):
            x, z = at((i + rnd.random()) * step, (k + rnd.random()) * step)
            y = -0.004 * k * step                    # (sloping a few centimetres to the water)
            out.append(((x, y, z), _sand(x, y, z, rnd), [step * 0.75, step * 0.09, step * 0.75]))
    # the beach on along the shore each way, and the wet sand at the water: seen, not walked
    far = lambda p, c, s: out.append((p, c, s, FAR))
    for u0, u1, v0, v1, colour, st in ((-40.0, 0.0, 0.0, BEACH, SAND, 0.3), (L, L + 40.0, 0.0, BEACH, SAND, 0.3),
                                       (-40.0, L + 40.0, BEACH, BEACH + 3.0, (0.70, 0.63, 0.50), 0.3)):
        for i in range(int((u1 - u0) / st)):
            for k in range(int((v1 - v0) / st)):
                x, z = at(u0 + (i + rnd.random()) * st, v0 + (k + rnd.random()) * st)
                c = tuple(v + rnd.uniform(-0.03, 0.03) for v in colour)
                far((x, -0.05, z), c, [st * 1.3, 0.02, st * 1.3])
    # the sea: gentle swell lines toward the shore, bigger splats further out
    v = BEACH + 3.0
    while v < SEA:
        st = 0.35 + v * 0.012
        for i in range(int(200.0 / st)):
            u = -100.0 + (i + rnd.random()) * st
            x, z = at(u, v + rnd.random() * st)
            swell = 0.04 * math.sin(v * 1.7 + 0.3 * math.sin(u * 0.2))
            c = (SEA_BLUE[0] + swell, SEA_BLUE[1] + swell, SEA_BLUE[2] + swell * 0.8)
            if v < BEACH + 4.0 and rnd.random() < 0.5:   # the foam where it breaks
                c = (0.88, 0.9, 0.88)
            far((x, -0.25, z), c, [st * 1.4, 0.02, st * 1.4])
        v += st
    # the island: a ridge across the channel, hazy blue-grey, its peaks 15 to 30 m up (low in the sky, as from the garden)
    # (its skyline in smaller splats, so it is a hill's edge and not a cloud's)
    for i in range(int(320.0 / 0.9)):
        u = -140.0 + i * 0.9
        top = 15 + 8 * math.sin(u * 0.021 + 1) + 5 * math.sin(u * 0.067) + 3 * math.sin(u * 0.17 + 2)
        y = 0.0
        while y < top:
            s = 1.3 if y < top - 3.0 else 0.6
            x, z = at(u + rnd.uniform(-0.4, 0.4), SEA + 10 * (1 - y / top))
            k = 0.88 + 0.12 * y / top
            far((x, min(y, top - 0.3), z), (0.56 * k, 0.63 * k, 0.69 * k), [0.4, s, s])   # (flat to the garden)
            y += 1.0 if s > 1 else 0.5


def bungalow(rnd, out):
    """A small white bungalow: board walls, a door to the lawn, a pitched roof of grey shingles."""
    x0, x1, z0, z1 = BUNGALOW
    h = 2.6
    door = ((x0 + x1) / 2 - 0.5, (x0 + x1) / 2 + 0.5)
    wall_x(z0, x0, x1, [(door[0], door[1], 0.0, 2.1), (x0 + 0.8, x0 + 1.9, 1.0, 1.9), (x1 - 1.9, x1 - 0.8, 1.0, 1.9)],
           _clapboard, out, rnd, h=h, step=0.04)
    door_x(z0, door[0], door[1], out, rnd, h=2.1)
    for a in (x0 + 0.8, x1 - 1.9):
        frame_x(z0, a, a + 1.1, 1.0, 1.9, out, rnd, colour=(0.98, 0.98, 0.96))
        base._surface(rnd, (a, a + 1.1, 1.0, 1.9, z0 + 0.03, z0 + 0.03), (0.30, 0.33, 0.35), out, 0.03)
    wall_x(z1, x0, x1, [], _clapboard, out, rnd, h=h, step=0.05)
    for x in (x0, x1):
        wall_z(x, z0, z1, [], _clapboard, out, rnd, h=h, step=0.05)
        # the gables
        zm, top = (z0 + z1) / 2, 1.1
        for k in range(int((z1 - z0) / 0.04)):
            z = z0 + (k + rnd.random()) * 0.04
            peak = h + top * (1 - abs(z - zm) / ((z1 - z0) / 2))
            y = h
            while y < peak:
                out.append(((x, y, z), _clapboard(x, y, z, rnd), [0.03, 0.03, 0.005]))
                y += 0.04
    # the roof: two slopes from the eaves (30 cm out) to the ridge
    zm, top = (z0 + z1) / 2, 1.1
    for side in (-1, 1):
        ze = zm + side * ((z1 - z0) / 2 + 0.3)
        n = int(math.hypot(ze - zm, top + 0.17) / 0.05)
        for k in range(n):
            f = (k + 0.5) / n
            zz, yy = zm + (ze - zm) * f, h + top - (top + 0.17) * f
            x = x0 - 0.3
            while x < x1 + 0.3:
                t = 0.04 if int((f * n) / 3) % 2 else -0.02
                out.append(((x + rnd.random() * 0.05, yy, zz), (0.36 + t, 0.37 + t, 0.39 + t), [0.04, 0.012, 0.04]))
                x += 0.05


def splats(seed: int = SEED) -> list:
    """(position (x, y, z) in metres, y up; colour; scale per axis in metres) for every splat."""
    rnd = random.Random(seed)
    out = []
    house(rnd, out)
    pergola(rnd, out)
    garden(rnd, out)
    beach(rnd, out)
    return [(r[0], tuple(min(1.0, max(0.0, v)) for v in r[1]), *r[2:]) for r in out]


def make(d: Path) -> Path:
    """The venue's splat and cameras in run folder d (the cameras held round the hall's middle),
    and its map, made here (it is big: a minute's work the page shouldn't wait for)."""
    base.write_cameras(d / "dense" / "sparse" / "0" / "images.bin", ring=(1.6, 1.2), centre=(8.0, 5.0))
    ply = base.write_ply(d / "splat" / PLY, splats())
    from . import room
    room.build_and_save(ply)
    return ply
