"""A wedding venue made of splats, laid out like the Casa Arandella plan Gabriel sent (a long house
with a garden behind it that runs down to the beach), for decorating a big place before filming one.
Only what the plan shows is built (the rooms, their walls, doors and windows, the stage, the
pergola, the garden and its bungalow) and the beach and the sea it meets; the rest is left to the
Decor panel. What the plan doesn't say (what each floor, wall, ceiling, door and window is made
of, the pergola's reed roof, the garden's glass rain cover and sand, the open deck that is the
bungalow) is as the venue's photos and Gabriel's mum's walkthrough videos show it.

Drawn like the sample living room (sample_room.py, whose helpers it uses): boxes, cylinders and
leaves covered in flat splats, written as a room run so room.py maps it and the page shows it like
a filmed room. It is much bigger (90 m from the door to the water), so its surfaces take bigger
splats further apart, and what is far off (the sea, the island across the channel) is drawn see-
through enough that the map leaves it out.

In metres, y up, the floor at 0 (the file is y-down). x runs along the house from the entrance
(x < 0) to the beach; z across it, from the long straight wall on the left (z = 0) to the right
as you walk in from the door (written mirrored: see make()).
The plan isn't to scale ("planta sem escala"), so the sizes are its measures:

- the deck at the door, the reception (6 m), the vertical garden (4.5 m, a wall of leaves) and the
  ante-room (9.3 m), each 4 m wide; the kitchen (4.7 m) beside the ante-room, its door open on the hall;
- the main hall, 17.8 m by 8.6 m (narrower by 1.5 m for its first 5 m), rustic tiles under a
  concrete ceiling, a band of windows along the right, a half wall (3.24 m) before the hall to the
  toilets on the left; glass doors at its end;
- the stage, 8.6 m by 3.2 m and 70 cm high, black, a screen before black curtains, beside the
  pergola (10.8 m by 7.4 m), which opens on the garden;
- the garden, 17.8 m wide, 20 m along the left and 30 m along the right, walled along its sides,
  sand with planted beds, the bungalow (an open deck) on the right near its end; its slanted far
  side opens on the beach.
"""
from __future__ import annotations

import json
import math
import random
from pathlib import Path

from . import sample_room as base

VERSION = 6
PLY = "wedding_venue_clean.ply"
SEED = 23

H = 3.4                             # the ceiling, everywhere under a roof
HALL = (0.0, 17.8, 0.0, 8.6)        # x0, x1, z0, z1
NOTCH = (0.0, 5.0, 1.5)             # the hall's first 5 m are 1.5 m narrower on the left
HALF_WALL = (11.3, 3.24)            # x, how far it comes out from the left wall
WC = (11.3, 20.0, 3.2)              # the hall to the toilets: x0, x1, how wide
STAGE = (20.0, 28.6, 0.0, 3.2, 0.7)  # x0, x1, z0, z1, its height
PERGOLA = (17.8, 28.6, 3.2, 10.6)
GARDEN_X = 28.6                     # where the garden starts
GARDEN_W = 17.8
COVER_LEN = 12.0                    # m of the garden under the glass rain cover, from the pergola on
PERGOLA_ROOF = 3.2                  # the pergola's flat reed roof
GARDEN_RIGHT, GARDEN_LEFT = 20.0, 30.0   # (along z = 0 and z = GARDEN_W: the plan's own right and left, as drawn)
ANTE = (-9.3, 0.0, 0.0, 4.0)
KITCHEN = (-9.3, 0.0, 4.0, 8.6)
KITCHEN_DOOR = (6.9, 8.0)               # z: its door on the hall
VERTICAL = (-13.8, -9.3, 0.0, 4.0)
RECEPTION = (-19.8, -13.8, 0.0, 4.0)
DECK = (-21.8, -19.8, 0.0, 4.0)
BUNGALOW = (41.5, 50.5, 12.7, 17.5)
BEACH = 8.0                         # m of dry sand from the garden's far side to the water
SEA = 130.0                         # m out to the island across the channel

FLOOR_STEP, WALL_STEP, CEIL_STEP, LAWN_STEP = 0.055, 0.065, 0.08, 0.085

# colours as the walkthrough videos show them (Gabriel's mum's, 2026-10-24), measured from the
# frames and evened out for the camera's exposure
CEMENT = (0.66, 0.66, 0.65)         # the smooth grey floors: reception, vertical garden, ante-room, toilets
PERGOLA_FLOOR = (0.62, 0.64, 0.66)  # the pergola's, a little bluer
ROUGH = (0.70, 0.67, 0.63)          # rough cement: the pergola's wall
CEILING = (0.95, 0.94, 0.91)
CONCRETE = (0.60, 0.58, 0.55)       # the hall's bare concrete ceiling
HALL_WALL = (0.88, 0.88, 0.87)
WC_WALL = (0.78, 0.81, 0.84)        # pale blue-grey
PLASTER = (0.90, 0.88, 0.85)
TERRACOTTA = (0.52, 0.31, 0.19)     # the hall's rustic tiles, glazed
DARK_TILE = (0.30, 0.18, 0.11)
TIMBER = (0.40, 0.27, 0.19)         # beams, strips and posts in dark wood
SLATS = (0.24, 0.16, 0.11)          # the ante-room's ceiling
REED = (0.66, 0.54, 0.38)           # the pergola's woven reed roof
DOOR = (0.23, 0.16, 0.14)           # the doors, dark wood
DOOR_FRAME = (0.45, 0.28, 0.19)
STEEL = (0.14, 0.14, 0.15)
GREY_FRAME = (0.36, 0.37, 0.38)     # the windows' frames
BLACK = (0.10, 0.10, 0.10)          # the stage's carpet and curtains
SCREEN = (0.90, 0.90, 0.89)
BRICK = (0.74, 0.47, 0.33)
TILE_WHITE = (0.93, 0.93, 0.92)
LINEN = (0.90, 0.87, 0.81)          # the hall's curtains
DECK_WOOD = (0.50, 0.34, 0.25)      # the bungalow's deck
OAK = (0.55, 0.40, 0.27)
WALNUT = (0.34, 0.23, 0.16)
WHITEWASH = (0.92, 0.91, 0.88)
SAND = (0.86, 0.79, 0.66)
SEA_BLUE = (0.36, 0.50, 0.52)
FAR = 0.42                          # how opaque what is far off is drawn: under room.OPAQUE


# ---------------------------------------------------------------- what the surfaces look like

def _cement(colour, joint=1.5):
    """Smooth grey cement, poured in squares `joint` apart with a cut line, a little cloudy."""
    def f(x, y, z, rnd):
        if x % joint < 0.008 or z % joint < 0.008:
            return tuple(c * 0.82 for c in colour)
        t = 0.025 * math.sin(x * 1.3 + 2 * math.sin(z * 0.7)) * math.sin(z * 1.1 + x * 0.4) + rnd.uniform(-0.015, 0.015)
        return tuple(c + t for c in colour)
    return f


def _rustic(x, y, z, rnd):
    """The hall's floor: glazed rustic tiles, 40 cm square, each its own shade between terracotta
    and dark brown, clouded, a pale glint where the windows light the glaze."""
    if x % 0.4 < 0.006 or z % 0.4 < 0.006:
        return (0.40, 0.33, 0.27)
    r = random.Random(math.floor(x / 0.4) * 7919 + math.floor(z / 0.4))
    k = r.random()
    c = [a + (b - a) * k for a, b in zip(TERRACOTTA, DARK_TILE)]
    cloud = 0.05 * math.sin(x * 7.1 + r.random() * 6) * math.sin(z * 6.3 + r.random() * 6)
    glint = 0.08 * max(0.0, math.sin(z * 0.9 + 1.2)) ** 6
    return tuple(v + cloud + glint for v in c)


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


def _rough(colour, strength=0.06):
    """Rough cement or bare concrete: blotchy, lighter and darker in patches."""
    def f(x, y, z, rnd):
        u = x + z
        t = strength * (math.sin(u * 2.3 + 3 * math.sin(y * 1.7)) * math.sin(y * 2.9 + u * 0.8)) + rnd.uniform(-0.03, 0.03)
        return tuple(c + t for c in colour)
    return f


def _slats(x, y, z, rnd):
    """The ante-room's ceiling: dark wooden slats across it, 10 cm, a darker gap between."""
    if x % 0.14 < 0.04:
        return (0.10, 0.07, 0.05)
    r = random.Random(math.floor(x / 0.14))
    t = r.uniform(-0.03, 0.03)
    return (SLATS[0] + t, SLATS[1] + t, SLATS[2] + t)


def _reeds(x, y, z, rnd):
    """Woven reed matting: thin stalks along z, a weave across them every 12 cm, light through it."""
    if x % 0.12 < 0.015:
        return (0.42, 0.33, 0.22)
    t = 0.05 * math.sin(z * 90.0 + math.floor(x / 0.12) * 1.7) + rnd.uniform(-0.05, 0.05)
    return (REED[0] + t, REED[1] + t, REED[2] + t * 0.8)


def _tiles(colour, size, grout=(0.72, 0.72, 0.71), across=0):
    """Square tiles with a grey grout line: on a floor (across 0: x and z) or a wall along x (1: x
    and y) or along z (2: z and y)."""
    def f(x, y, z, rnd):
        a, b = ((x, z), (x, y), (z, y))[across]
        if a % size < 0.005 or b % size < 0.005:
            return grout
        t = rnd.uniform(-0.012, 0.012)
        return tuple(c + t for c in colour)
    return f


def _brickwork(along):
    """Bare orange brick, 22 by 7 cm in stretcher bond (each course half a brick on), pale joints:
    on a wall along x (along 0) or z (along 2)."""
    def f(x, y, z, rnd):
        a = (x, y, z)[along]
        k = math.floor(y / 0.075)
        w = a + (0.11 if k % 2 else 0.0)
        if y % 0.075 < 0.01 or w % 0.22 < 0.01:
            return (0.80, 0.74, 0.66)
        r = random.Random(k * 104729 + math.floor(w / 0.22))
        t = r.uniform(-0.07, 0.05)
        return (BRICK[0] + t, BRICK[1] + t * 0.8, BRICK[2] + t * 0.7)
    return f


def _folds(colour, along, width=0.16, depth=0.18):
    """A curtain: hanging folds `width` apart, each lit on one side and shadowed on the other."""
    def f(x, y, z, rnd):
        a = (x, y, z)[along]
        k = 1 - depth * (0.5 + 0.5 * math.sin(a * 2 * math.pi / width))
        return tuple(c * k for c in colour)
    return f


def _boards(colour, gap=(0.24, 0.18, 0.13), width=0.14):
    """Deck boards along z, each its own shade, a dark gap between them."""
    def f(x, y, z, rnd):
        if x % width < 0.01:
            return gap
        r = random.Random(math.floor(x / width))
        t = r.uniform(-0.06, 0.05)
        return (colour[0] + t, colour[1] + t, colour[2] + t)
    return f


def _wall(colour, skirting=(0.97, 0.96, 0.94)):
    """A plastered wall, a little darker near the floor and the ceiling (where less light gets)
    and with a skirting 12 cm high (none if skirting is None)."""
    def f(x, y, z, rnd):
        if y < 0.12 and skirting:
            return skirting
        k = (0.86 + 0.14 * min(1.0, (y - 0.12) / 1.4)) * (1 - 0.06 * max(0.0, 1 - (H - y) / 0.5))
        return tuple(c * k for c in colour)
    return f


def _view(x, y, z, rnd):
    """What a window shows: a pale sky, lighter toward the top (the plan says nothing of outside)."""
    k = min(1.0, max(0.0, (y - 0.7) / 2.4))
    return (0.80 + 0.1 * k, 0.86 + 0.07 * k, 0.90 + 0.05 * k)


def _lawn(x, y, z, rnd):
    """Grass, a little patchy."""
    patch = 0.035 * math.sin(x * 0.7 + 2 * math.sin(z * 0.5)) * math.sin(z * 0.9)
    t = patch + rnd.uniform(-0.04, 0.04)
    return (0.32 + t * 0.8, 0.50 + t, 0.25 + t * 0.6)


def _sand(x, y, z, rnd):
    """Beach sand, pale and fine, a little darker in drifts and footprints."""
    t = 0.03 * math.sin(x * 0.9 + 2 * math.sin(z * 0.6)) * math.sin(z * 1.3 + x * 0.2) + rnd.uniform(-0.035, 0.035)
    return (SAND[0] + t, SAND[1] + t, SAND[2] + t * 0.9)


def _greenwall(x, y, z, rnd):
    """The vertical garden's wall: ferns and ivy, light and dark."""
    m = math.sin(x * 5.3 + y * 3.1) * math.sin(x * 2.1 - y * 4.7)
    t = rnd.uniform(-0.06, 0.06)
    return (0.18 + 0.08 * m + t, 0.36 + 0.10 * m + t, 0.16 + 0.05 * m + t)


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
    """A closed door in dark wood in a wall along z, in a reddish wooden frame, a steel handle."""
    base._surface(rnd, (x, x, 0.0, h, a0, a1), DOOR, out, 0.03)
    base._surface(rnd, (x - 0.03, x + 0.03, 1.0, 1.04, a1 - 0.14, a1 - 0.06), (0.70, 0.70, 0.68), out, 0.01)
    frame_z(x, a0, a1, 0.0, h, out, rnd, colour=DOOR_FRAME, t=0.07, d=0.04)


def door_x(z, a0, a1, out, rnd, h=2.2):
    base._surface(rnd, (a0, a1, 0.0, h, z, z), DOOR, out, 0.03)
    base._surface(rnd, (a1 - 0.14, a1 - 0.06, 1.0, 1.04, z - 0.03, z + 0.03), (0.70, 0.70, 0.68), out, 0.01)
    frame_x(z, a0, a1, 0.0, h, out, rnd, colour=DOOR_FRAME, t=0.07, d=0.04)


# ---------------------------------------------------------------- the house

def house(rnd, out):
    wall = _wall(PLASTER)
    hall_wall = _wall(HALL_WALL)
    # the floors: smooth grey cement from the door to the toilets, the hall's rustic tiles, the
    # kitchen's white tiles, and the ceilings over them
    for r in (RECEPTION, VERTICAL, ANTE):
        base._surface(rnd, (r[0], r[1], 0, 0, r[2], r[3]), _shaded(_cement(CEMENT), r), out, FLOOR_STEP)
    base._surface(rnd, (KITCHEN[0], KITCHEN[1], 0, 0, KITCHEN[2], KITCHEN[3]), _tiles(TILE_WHITE, 0.45), out, FLOOR_STEP)
    hx0, hx1, hz0, hz1 = HALL
    rustic = _shaded(_rustic, HALL, reach=1.2, dark=0.8)
    base._surface(rnd, (hx0, NOTCH[1], 0, 0, NOTCH[2], hz1), rustic, out, 0.05, 0.004)
    base._surface(rnd, (NOTCH[1], hx1, 0, 0, hz0, hz1), rustic, out, 0.05, 0.004)
    base._surface(rnd, (hx1, WC[1], 0, 0, 0, WC[2]), _shaded(_cement(CEMENT), (hx1 - 6, WC[1], 0, WC[2])), out, FLOOR_STEP)
    base._surface(rnd, (*DECK[:2], 0, 0, *DECK[2:]), _boards((0.56, 0.44, 0.32)), out, 0.04)   # (finer: the map's end)
    base._surface(rnd, (ANTE[0], ANTE[1], H, H, ANTE[2], ANTE[3]), _slats, out, 0.05)
    base._surface(rnd, (*KITCHEN[:2], H, H, *KITCHEN[2:]), CEILING, out, CEIL_STEP)
    for (x0, x1, z0, z1) in ((hx0, NOTCH[1], NOTCH[2], hz1), (NOTCH[1], hx1, hz0, hz1), (hx1, STAGE[1], 0, WC[2])):
        base._surface(rnd, (x0, x1, H, H, z0, z1), _rough(CONCRETE), out, CEIL_STEP)
    skylight(rnd, out)

    # the long straight wall on the left (z = 0): the reception's door is at the deck end
    wall_x(0.0, RECEPTION[0], RECEPTION[1], [], wall, out, rnd)
    green_x(rnd, 0.0, VERTICAL[0], VERTICAL[1], +1, out)
    # (the ante-room has walls of ferns and leaves too, the venue's own: "decoração natural permanente")
    green_x(rnd, 0.0, ANTE[0], ANTE[1], +1, out)
    # the right side of the reception, the vertical garden (green both sides) and the ante-room; the kitchen behind
    wall_x(4.0, RECEPTION[0], RECEPTION[1], [(-18.8, -17.6, 0.9, 2.6)], wall, out, rnd)
    frame_x(4.0, -18.8, -17.6, 0.9, 2.6, out, rnd)
    base._surface(rnd, (-18.8, -17.6, 0.9, 2.6, 4.02, 4.02), _view, out, 0.04)
    wall_x(4.0, VERTICAL[0], VERTICAL[1], [], wall, out, rnd)
    green_x(rnd, 4.0, VERTICAL[0], VERTICAL[1], -1, out)
    wall_x(4.0, ANTE[0], ANTE[1], [], _tiles(TILE_WHITE, 0.2, across=1), out, rnd)  # (the kitchen's side: green on the ante-room's)
    green_x(rnd, 4.0, ANTE[0] + 0.3, ANTE[1] - 0.3, -1, out)
    kitchen(rnd, out)
    # the front: the deck and the reception's door, wide open; the rooms open one into the next
    wall_z(RECEPTION[0], 0.0, 4.0, [(1.2, 2.8, 0.0, 2.6)], wall, out, rnd)
    frame_z(RECEPTION[0], 1.2, 2.8, 0.0, 2.6, out, rnd, colour=DOOR, t=0.08)
    for x in (RECEPTION[1], VERTICAL[1]):           # wide doorways between them
        wall_z(x, 0.0, 4.0, [(0.8, 3.2, 0.0, 2.8)], wall, out, rnd)
        frame_z(x, 0.8, 3.2, 0.0, 2.8, out, rnd, colour=TIMBER, t=0.08, d=0.12)
    # the ante-room into the hall (where the hall is narrower), the kitchen's back wall beside it
    wall_z(0.0, 0.0, 4.0, [(NOTCH[2] + 0.2, 4.0 - 0.2, 0.0, 2.9)], hall_wall, out, rnd)
    # the kitchen's door, on the hall: open, swung in against the kitchen's side
    wall_z(0.0, 4.0, hz1, [KITCHEN_DOOR + (0.0, 2.2)], hall_wall, out, rnd)
    frame_z(0.0, *KITCHEN_DOOR, 0.0, 2.2, out, rnd, colour=DOOR_FRAME, t=0.07, d=0.04)
    a0, a1 = KITCHEN_DOOR
    base._surface(rnd, (-(a1 - a0), -0.06, 0.0, 2.2, a1 - 0.04, a1 - 0.04), DOOR, out, 0.03)

    # the hall: the notch on the left, the half wall, the toilets' hall and the stage beside it
    wc_wall = _wall(WC_WALL, skirting=None)
    wall_x(NOTCH[2], 0.0, NOTCH[1], [], hall_wall, out, rnd)
    wall_z(NOTCH[1], 0.0, NOTCH[2], [], hall_wall, out, rnd)
    wall_x(0.0, NOTCH[1], HALF_WALL[0], [], hall_wall, out, rnd)
    wall_x(0.0, HALF_WALL[0], WC[1], [(13.0, 13.9, 0.0, 2.2), (15.2, 16.1, 0.0, 2.2)], wc_wall, out, rnd)
    door_x(0.0, 13.0, 13.9, out, rnd)
    door_x(0.0, 15.2, 16.1, out, rnd)
    hx, reach = HALF_WALL
    base._surface(rnd, (hx - 0.1, hx + 0.1, 0.0, 1.1, 0.0, reach), _wall((0.90, 0.88, 0.84)), out, 0.04)
    base._surface(rnd, (hx - 0.13, hx + 0.13, 1.1, 1.14, 0.0, reach + 0.03), OAK, out, 0.03)
    wall_x(WC[2], WC[1] - 2.5, WC[1], [], wc_wall, out, rnd)
    # the toilets' hall's end, the stage's side: bare brick
    wall_z(WC[1], 0.0, WC[2], [], _brickwork(2), out, rnd)
    # the windows along the right: a high band, dark grey frames, a curtain of linen each side
    windows = [(1.2 + 3.2 * k, 2.6 + 3.2 * k) for k in range(5)]
    w0, w1 = 1.5, 2.8
    wall_x(hz1, hx0, hx1, [(a, b, w0, w1) for a, b in windows], hall_wall, out, rnd)
    for a, b in windows:
        frame_x(hz1, a, b, w0, w1, out, rnd, colour=GREY_FRAME, t=0.04)
        for m in (a + (b - a) / 3, a + 2 * (b - a) / 3):
            base._surface(rnd, (m - 0.015, m + 0.015, w0, w1, hz1 - 0.02, hz1 + 0.02), GREY_FRAME, out, 0.03)
        base._surface(rnd, (a, b, w0, w1, hz1 + 0.03, hz1 + 0.03), _view, out, 0.04)
        for c in (a - 0.55, b + 0.05):
            base._surface(rnd, (c, c + 0.5, 0.05, H - 0.15, hz1 - 0.1, hz1 - 0.1), _folds(LINEN, 0), out, 0.04)
    # its end: glass doors onto the pergola, open; glass above them
    doors = [(3.4 + 1.3 * k, 4.4 + 1.3 * k) for k in range(4)]
    wall_z(hx1, WC[2], hz1, [(a, b, 0.0, 2.6) for a, b in doors] + [(WC[2] + 0.1, hz1 - 0.1, 2.7, 3.3)], hall_wall, out, rnd)
    for a, b in doors:
        frame_z(hx1, a, b, 0.0, 2.6, out, rnd)
    frame_z(hx1, WC[2] + 0.1, hz1 - 0.1, 2.7, 3.3, out, rnd)
    base._surface(rnd, (hx1, hx1, 2.7, 3.3, WC[2] + 0.1, hz1 - 0.1), (0.84, 0.89, 0.92), out, 0.05)
    # track lights along the concrete ceiling
    for z in (2.6, 6.0):
        base._surface(rnd, (hx0 + 0.5, hx1 - 0.5, H - 0.04, H, z - 0.02, z + 0.02), STEEL, out, 0.03)

    # the stage: 70 cm up, all in black carpet, black curtains behind and a big white screen
    sx0, sx1, sz0, sz1, sh = STAGE
    base._surface(rnd, (sx0, sx1, sh, sh, sz0, sz1), BLACK, out, FLOOR_STEP)
    base._surface(rnd, (sx0, sx1, 0.0, sh, sz1, sz1), (0.13, 0.13, 0.13), out, 0.04)
    base._surface(rnd, (sx1, sx1, 0.0, sh, sz0, sz1), (0.13, 0.13, 0.13), out, 0.04)
    base._surface(rnd, (sx0, sx1, sh, H, 0.0, 0.0), _folds((0.16, 0.16, 0.17), 0), out, 0.04)
    wall_z(sx1, 0.0, sz1, [], _folds((0.16, 0.16, 0.17), 2), out, rnd)
    base._surface(rnd, (sx0 + 1.4, sx1 - 1.4, sh + 0.9, H - 0.15, 0.06, 0.06), SCREEN, out, 0.04)


def skylight(rnd, out):
    """The reception's roof: glass between dark timber beams, the sky through it."""
    x0, x1, z0, z1 = RECEPTION
    for k in range(int((x1 - x0) / 1.0) + 1):
        x = min(x1 - 0.06, x0 + 0.06 + k * 1.0)
        base._surface(rnd, (x - 0.06, x + 0.06, H - 0.2, H, z0, z1), TIMBER, out, 0.05)
    for k in range(int((x1 - x0) / 0.3)):
        for m in range(int((z1 - z0) / 0.3)):
            out.append(((x0 + (k + rnd.random()) * 0.3, H, z0 + (m + rnd.random()) * 0.3), (0.86, 0.91, 0.93), [0.22, 0.01, 0.22], 0.06))


def kitchen(rnd, out):
    """The kitchen: white tiles up its walls, a high row of windows in grey frames on its outside wall."""
    x0, x1, z0, z1 = KITCHEN
    windows = [(x0 + 0.6 + 1.5 * k, x0 + 1.8 + 1.5 * k) for k in range(5)]
    w0, w1 = 1.5, 2.6
    wall_x(z1, x0, x1, [(a, b, w0, w1) for a, b in windows], _tiles(TILE_WHITE, 0.2, across=1), out, rnd)
    for a, b in windows:
        frame_x(z1, a, b, w0, w1, out, rnd, colour=GREY_FRAME, t=0.04)
        base._surface(rnd, ((a + b) / 2 - 0.015, (a + b) / 2 + 0.015, w0, w1, z1 - 0.02, z1 + 0.02), GREY_FRAME, out, 0.03)
        base._surface(rnd, (a, b, (w0 + w1) / 2 - 0.015, (w0 + w1) / 2 + 0.015, z1 - 0.02, z1 + 0.02), GREY_FRAME, out, 0.03)
        base._surface(rnd, (a, b, w0, w1, z1 + 0.03, z1 + 0.03), _view, out, 0.04)
    wall_z(x0, z0, z1, [], _tiles(TILE_WHITE, 0.2, across=2), out, rnd)


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
    """The pergola (pergolado) as the videos show it: a grey cement floor under a flat roof of woven
    reed on dark timber beams; a wall of rough cement on its far side, with wooden strips, square
    lights and a drain along its foot; open on the stage and the garden."""
    x0, x1, z0, z1 = PERGOLA
    base._surface(rnd, (x0, x1, 0, 0, z0, z1), _shaded(_cement(PERGOLA_FLOOR, joint=1.8), PERGOLA, reach=1.0, dark=0.9), out, FLOOR_STEP)
    # the drain along the wall: a black grate 12 cm wide
    base._surface(rnd, (x0, x1 - 2.0, 0.003, 0.003, z1 - 0.2, z1 - 0.08), (0.12, 0.12, 0.12), out, 0.02)
    # the wall, to 2 m short of the garden (where the beds go round the corner)
    wall_x(z1, x0, x1 - 2.0, [], _rough(ROUGH, 0.08), out, rnd, h=PERGOLA_ROOF)
    for k in range(int((x1 - 2.0 - x0) / 2.6)):
        x = x0 + 1.6 + 2.6 * k
        base._surface(rnd, (x - 0.05, x + 0.05, 0.6, 2.8, z1 - 0.02, z1 - 0.02), TIMBER, out, 0.02)
        for side in (-0.7, 0.7):
            base._surface(rnd, (x + side - 0.06, x + side + 0.06, 2.4, 2.52, z1 - 0.03, z1 - 0.03), (0.08, 0.08, 0.08), out, 0.02)
    # the roof: beams across, a post at each end of the garden side, the reed matting over them
    for k in range(5):
        x = x0 + 0.1 + k * (x1 - x0 - 0.2) / 4
        base._surface(rnd, (x - 0.08, x + 0.08, PERGOLA_ROOF - 0.22, PERGOLA_ROOF, z0, z1), TIMBER, out, 0.05)
    base._surface(rnd, (x0, x1, PERGOLA_ROOF - 0.22, PERGOLA_ROOF, z0, z0 + 0.16), TIMBER, out, 0.05)
    for z in (z0 + 0.1, z1 - 0.3):
        base._surface(rnd, (x1 - 0.18, x1 - 0.02, 0.0, PERGOLA_ROOF - 0.22, z - 0.08, z + 0.08), TIMBER, out, 0.05)
    base._surface(rnd, (x0, x1, PERGOLA_ROOF + 0.01, PERGOLA_ROOF + 0.01, z0, z1), _reeds, out, 0.05)


def _garden_end(z):
    """Where the garden ends along x, at z across: its far side is slanted."""
    return GARDEN_X + GARDEN_RIGHT + (GARDEN_LEFT - GARDEN_RIGHT) * z / GARDEN_W


def garden(rnd, out):
    # sand, from the stage's end (where the house ends) and the pergola to the far side; grass
    # round the bungalow
    bx0, bx1, bz0, bz1 = BUNGALOW
    def ground(x, y, z, rnd):
        near = bx0 - 2.0 < x < bx1 + 1.0 and bz0 - 2.0 < z
        return _lawn(x, y, z, rnd) if near else _sand(x, y, z, rnd)
    z = 0.0
    while z < GARDEN_W:
        x = GARDEN_X
        end = _garden_end(z)
        while x < end:
            p = (x + rnd.random() * LAWN_STEP, 0.0, z + rnd.random() * LAWN_STEP)
            if p[0] < end:
                out.append((p, ground(*p, rnd), [LAWN_STEP * 0.75, LAWN_STEP * 0.09, LAWN_STEP * 0.75]))
            x += LAWN_STEP
        z += LAWN_STEP
    # beside the pergola, to the garden's right wall
    base._surface(rnd, (PERGOLA[0], GARDEN_X, 0, 0, PERGOLA[3], GARDEN_W), _sand, out, LAWN_STEP)
    # its walls, along the left (on from the house's) and the right, and across beside the pergola,
    # whitewashed, 2 m high, to where the sand starts; tropical beds along them behind a kerb
    white = _wall(WHITEWASH)
    wall_x(0.0, GARDEN_X, _garden_end(0.0), [], white, out, rnd, h=2.0)
    wall_x(GARDEN_W, PERGOLA[0], _garden_end(GARDEN_W), [], white, out, rnd, h=2.0)
    wall_z(PERGOLA[0], PERGOLA[3], GARDEN_W, [], white, out, rnd, h=2.0)
    bed_x(rnd, 0.0, GARDEN_X, _garden_end(0.0) - 1.0, +1, out)
    bed_x(rnd, GARDEN_W, PERGOLA[0] + 1.0, _garden_end(GARDEN_W) - 1.0, -1, out)
    cover(rnd, out)
    bungalow(rnd, out)
    for t in TREES:
        trunk(rnd, out, *t)


# the trees the walkthrough shows (x, z, the decor starter that draws it): a broad tree in the sand
# past the rain cover, a big one beside the bungalow, two beach almonds at the sand's edge by the
# sea, and coconut palms standing out of the beds along the walls. The page draws them as it draws
# the decor (decor.js), from the fixtures make() writes; here only their trunks' feet, inside those,
# so the map walks round them
TREES = ((44.5, 3.2, "broad_tree"), (52.5, 10.8, "broad_tree"),
         (_garden_end(3.0) + 2.5, 3.0, "beach_almond"), (_garden_end(13.0) + 2.0, 13.0, "beach_almond"),
         (34.0, 0.6, "coconut_palm"), (47.0, 0.6, "coconut_palm"), (36.0, GARDEN_W - 0.6, "coconut_palm"))
TRUNK = {"broad_tree": 0.1, "beach_almond": 0.1, "coconut_palm": 0.07}


def trunk(rnd, out, x, z, item):
    """A tree's trunk to 1.9 m, well inside the one the page draws over it (so it never shows)."""
    r, y = TRUNK[item], 0.0
    while y < 1.9:
        for k in range(10):
            a = 2 * math.pi * (k + rnd.random()) / 10
            out.append(((x + r * math.cos(a), y, z + r * math.sin(a)), (0.42, 0.36, 0.30), [0.03, 0.03, 0.03]))
        y += 0.05


def fixtures() -> dict:
    """What the page is told besides the splat (room.py's map, in its metres): the trees."""
    return {"trees": [{"item": item, "at": [x, 0.0, z]} for x, z, item in TREES]}


def bed_x(rnd, z, x0, x1, side, out):
    """A planted bed along a wall at z (the garden on its `side`), 1.2 m deep: palms, ferns and
    bromeliads in many greens, a few red, 1 to 1.6 m high, a scalloped cement kerb along its front."""
    deep = 1.2
    base._surface(rnd, (x0, x1, 0.0, 0.0, *sorted((z, z + side * deep))), (0.30, 0.24, 0.17), out, 0.08)
    for _ in range(int(450 * (x1 - x0))):
        x, d = rnd.uniform(x0, x1), rnd.uniform(0.05, deep - 0.1)
        top = 1.0 + 0.6 * (1 - d / deep) * math.sin(x * 1.9) ** 2
        y = rnd.uniform(0.05, top)
        t = rnd.uniform(-0.07, 0.08)
        c = (0.62, 0.14, 0.13) if rnd.random() < 0.03 and y < 0.5 else (0.17 + t, 0.38 + t * 1.3, 0.14 + t)
        out.append(((x, y, z + side * d), c, [0.05, 0.03, 0.05]))
    zk = z + side * deep
    for k in range(int((x1 - x0) / 0.3)):
        a = x0 + k * 0.3
        base._surface(rnd, (a + 0.02, a + 0.28, 0.0, 0.12, zk - 0.04, zk + 0.04), (0.72, 0.70, 0.66), out, 0.05)


def cover(rnd, out):
    """The garden's rain cover, from the pergola on: a pitched glass roof on dark steel rafters,
    the posts in the beds along the walls."""
    x0, x1, z0, z1 = GARDEN_X, GARDEN_X + COVER_LEN, 0.6, GARDEN_W - 0.6
    eave, ridge, zm = 3.4, 4.8, (z0 + z1) / 2
    roof = lambda z: eave + (ridge - eave) * (1 - abs(z - zm) / ((z1 - z0) / 2))
    bars = [x0 + 0.05 + k * (x1 - x0 - 0.1) / 6 for k in range(7)]
    for x in bars:
        for z in (z0, z1):
            base._surface(rnd, (x - 0.05, x + 0.05, 0.0, eave, z - 0.05, z + 0.05), STEEL, out, 0.05)
        for k in range(int((z1 - z0) / 0.03)):
            z = z0 + (k + 0.5) * 0.03
            out.append(((x, roof(z), z), STEEL, [0.03, 0.04, 0.02]))
    for z in (z0, z1, zm, (z0 + zm) / 2, (zm + z1) / 2):   # the eaves' beams, the purlins and the ridge
        base._surface(rnd, (x0, x1, roof(z) - 0.08, roof(z), z - 0.03, z + 0.03), STEEL, out, 0.05)
    # the glass: faint, so the sky shows through it (and the map leaves it out)
    for k in range(int((x1 - x0) / 0.3)):
        for m in range(int((z1 - z0) / 0.3)):
            x, z = x0 + (k + rnd.random()) * 0.3, z0 + (m + rnd.random()) * 0.3
            out.append(((x, roof(z) + 0.02, z), (0.86, 0.91, 0.93), [0.22, 0.01, 0.22], 0.06))


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
    na, nb = int(L / step), int(BEACH / step)
    o, u, v = at(0.0, 0.0), at(na * step, 0.0), at(0.0, nb * step)
    base.sheet(rnd, (o[0], 0.0, o[1]), (u[0] - o[0], 0.0, u[1] - o[1]),
               (v[0] - o[0], -0.004 * nb * step, v[1] - o[1]),      # (sloping a few centimetres to the water)
               na, nb, _sand, out, [step * 0.75, step * 0.09, step * 0.75])
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
    """The bungalow (bangalô): an open wooden deck a step up off the grass, under a frame of dark
    timber, posts and beams, no walls and no roof."""
    x0, x1, z0, z1 = BUNGALOW
    h, top = 0.08, 2.7
    base._surface(rnd, (x0, x1, h, h, z0, z1), _boards(DECK_WOOD, gap=(0.20, 0.13, 0.10), width=0.15), out, FLOOR_STEP)
    for (a, b, c, d) in ((x0, x1, z0, z0), (x0, x1, z1, z1), (x0, x0, z0, z1), (x1, x1, z0, z1)):
        base._surface(rnd, (a, b, 0.0, h, c, d), (0.30, 0.21, 0.15), out, 0.03)
    posts = [(x, z) for x in (x0 + 0.1, (x0 + x1) / 2, x1 - 0.1) for z in (z0 + 0.1, z1 - 0.1)]
    for x, z in posts:
        base._surface(rnd, (x - 0.08, x + 0.08, h, top, z - 0.08, z + 0.08), TIMBER, out, 0.05)
    for z in (z0 + 0.1, z1 - 0.1):                       # the beams along it, and across on them
        base._surface(rnd, (x0 - 0.3, x1 + 0.3, top, top + 0.22, z - 0.05, z + 0.05), TIMBER, out, 0.05)
    for k in range(int((x1 - x0) / 0.9) + 1):
        x = min(x1, x0 + k * 0.9)
        base._surface(rnd, (x - 0.04, x + 0.04, top + 0.22, top + 0.36, z0 - 0.3, z1 + 0.3), TIMBER, out, 0.05)


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
    # (written mirrored, z to -z: the page shows the y-down file turned round, which would put the
    # kitchen and the stage on the wrong sides of the walk in from the door)
    base.write_cameras(d / "dense" / "sparse" / "0" / "images.bin", ring=(1.6, 1.2), centre=(8.0, -5.0))
    ply = base.write_drawn(d / "splat" / PLY, splats, mirror=True)
    from .room import fixtures_file
    # (in the file's coordinates: y down, and mirrored as the splats are)
    fx = {"trees": [dict(t, at=[t["at"][0], -t["at"][1], -t["at"][2]]) for t in fixtures()["trees"]]}
    fixtures_file(ply).write_text(json.dumps(fx, indent=1))
    from . import room
    room.build_and_save(ply)
    return ply
