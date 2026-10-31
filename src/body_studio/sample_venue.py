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
- the stage, 8.6 m by 3.2 m and 40 cm high, black, a screen before black curtains, beside the
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
from .venue_fittings import fittings, fixtures  # noqa: F401  (fittings: for tests)
from .venue_plan import *  # noqa: F403  (where everything is: the plan, its colours)

# ---------------------------------------------------------------- what the surfaces look like

def _cement(colour, joint=1.5, cloud=0.025, line=0.008, cut=0.82):
    """Smooth grey cement, poured in squares `joint` apart with a cut line `line` wide (as dark as
    `cut`), a little cloudy."""
    def f(x, y, z, rnd):
        if x % joint < line or z % joint < line:
            return tuple(c * cut for c in colour)
        t = cloud * math.sin(x * 1.3 + 2 * math.sin(z * 0.7)) * math.sin(z * 1.1 + x * 0.4) + rnd.uniform(-cloud * 0.4, cloud * 0.4)
        return tuple(c + t for c in colour)
    return base.finish("cement", f)


def _rustic(x, y, z, rnd):
    """The hall's floor: glazed rustic tiles, 40 cm square, a red-brown ground with patches of
    orange glaze and patches worn near black (each tile its own: a few overlapping waves above a
    level), a dark grout line round each, a pale glint where the windows light the glaze."""
    if math.floor(x / 0.05) % 8 == 0 or math.floor(z / 0.05) % 8 == 0:   # (the joints: one whole cell of the floor's 5 cm mesh, or the mesh blurs them away)
        return (0.09, 0.07, 0.06)
    r = random.Random(math.floor(x / 0.4) * 7919 + math.floor(z / 0.4))
    a, b, c, d, e = (r.uniform(0, 6.3) for _ in range(5))
    n = (math.sin(x * 9 + a) * math.sin(z * 8 + b) + 0.6 * math.sin((x - z) * 12 + c)
         + 0.25 * math.sin(x * 23 + z * 19 + d))          # (big patches, as filmed: a few to a tile)
    m = math.sin(x * 7 + e) * math.sin(z * 10 + a) + 0.5 * math.sin((x + z) * 15 + b)
    glaze = min(1.0, max(0.0, (n - r.uniform(-0.2, 0.6)) / 0.25 + 0.5))      # 0 the ground .. 1 orange
    worn = min(1.0, max(0.0, (m - r.uniform(-0.1, 0.7)) / 0.25 + 0.5)) * (1 - glaze)   # .. or near black
    shade = r.uniform(-0.05, 0.03)
    col = [g + shade + (o - g) * glaze + (w - g) * worn for g, o, w in zip(TILE_RED, TERRACOTTA, DARK_TILE)]
    glint = 0.06 * max(0.0, math.sin(z * 0.9 + 1.2)) ** 6
    return tuple(v + glint for v in col)
_rustic.finish = "tile"


def _shaded(colour, rect, reach=0.7, dark=0.8):
    """A floor a little darker toward its edges (where the walls keep the light off it): rect is
    (x0, x1, z0, z1)."""
    x0, x1, z0, z1 = rect
    def f(x, y, z, rnd):
        c = colour(x, y, z, rnd) if callable(colour) else colour
        d = min(x - x0, x1 - x, z - z0, z1 - z)
        k = dark + (1 - dark) * min(1.0, max(0.0, d) / reach) ** 0.7
        return tuple(v * k for v in c)
    f.finish = getattr(colour, "finish", "")
    return f


def _rough(colour, strength=0.06):
    """Rough cement or bare concrete: blotchy, lighter and darker in patches."""
    def f(x, y, z, rnd):
        u = x + z
        t = strength * (math.sin(u * 2.3 + 3 * math.sin(y * 1.7)) * math.sin(y * 2.9 + u * 0.8)) + rnd.uniform(-0.03, 0.03)
        return tuple(c + t for c in colour)
    return base.finish("concrete", f)


def _brickwork(along, colour=BRICK):
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
        return (colour[0] + t, colour[1] + t * 0.8, colour[2] + t * 0.7)
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
    return base.finish("wood_z", f)


def _wall(colour, skirting=SKIRTING):
    """A plastered wall, a little darker near the floor and the ceiling (where less light gets)
    and with a skirting 12 cm high (none if skirting is None)."""
    def f(x, y, z, rnd):
        if y < 0.12 and skirting:
            return skirting
        k = (0.86 + 0.14 * min(1.0, (y - 0.12) / 1.4)) * (1 - 0.06 * max(0.0, 1 - (H - y) / 0.5))
        return tuple(c * k for c in colour)
    return base.finish("plaster", f)


def _washed(wall, spots):
    """A wall lit from below by uplights at `spots` along x: a warm fan of light widening up from
    each, fading toward the ceiling (baked in: nothing to draw per frame)."""
    def f(x, y, z, rnd):
        c = wall(x, y, z, rnd)
        k = sum(math.exp(-((x - sx) / (0.12 + 0.3 * y)) ** 2) for sx in spots) * max(0.0, 1 - y / 3.0) ** 1.5
        return (c[0] + 0.32 * k, c[1] + 0.19 * k, c[2] + 0.04 * k)
    if hasattr(wall, "finish"):
        f.finish = wall.finish
    return f


def _view(x, y, z, rnd):
    """What a window shows: a pale sky, lighter toward the top (the plan says nothing of outside)."""
    k = min(1.0, max(0.0, (y - 0.7) / 2.4))
    return (0.80 + 0.1 * k, 0.86 + 0.07 * k, 0.90 + 0.05 * k)


def _shutters(x, y, z, rnd):
    """Dark wooden shutters: boards 8 cm, a dark line between them."""
    return (0.09, 0.07, 0.06) if y % 0.08 < 0.008 else (0.24, 0.16, 0.11)


def _sand(x, y, z, rnd):
    """Beach sand, pale and fine, a little darker in drifts and footprints."""
    t = 0.03 * math.sin(x * 0.9 + 2 * math.sin(z * 0.6)) * math.sin(z * 1.3 + x * 0.2) + rnd.uniform(-0.035, 0.035)
    return (SAND[0] + t, SAND[1] + t, SAND[2] + t * 0.9)
_sand.finish = "sand"


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


def door_x(z, a0, a1, out, rnd, h=2.2, colour=DOOR, frame=DOOR_FRAME):
    base._surface(rnd, (a0, a1, 0.0, h, z, z), colour, out, 0.03)
    base._surface(rnd, (a1 - 0.14, a1 - 0.06, 1.0, 1.04, z - 0.03, z + 0.03), (0.70, 0.70, 0.68), out, 0.01)
    frame_x(z, a0, a1, 0.0, h, out, rnd, colour=frame, t=0.07, d=0.04)


# ---------------------------------------------------------------- the house

def house(rnd, out):
    wall = _wall(PLASTER, skirting=None)   # (the way in's skirting is a wooden board: FITTINGS)
    hall_wall = _wall(HALL_WALL, skirting=None)   # (its skirting is a wooden board too: fittings())
    # the floors: smooth grey cement from the door to the toilets, the hall's rustic tiles, the
    # kitchen's white tiles, and the ceilings over them
    for r in (RECEPTION, VERTICAL):
        base._surface(rnd, (r[0], r[1], 0, 0, r[2], r[3]), _shaded(_cement(POLISHED, joint=1.5, cloud=0.008, line=FLOOR_STEP, cut=0.86), r, dark=0.9), out, FLOOR_STEP)
    base._surface(rnd, (ANTE[0], ANTE[1] - ANTE_TILES, 0, 0, ANTE[2], ANTE[3]), _shaded(_cement(SLAB, joint=1.0), ANTE, dark=0.85), out, FLOOR_STEP)
    base._surface(rnd, (KITCHEN[0], KITCHEN[1], 0, 0, KITCHEN[2], KITCHEN[3]), (0.70, 0.71, 0.72), out, FLOOR_STEP)   # (its tiles: fittings())
    hx0, hx1, hz0, hz1 = HALL
    shaded = _shaded(_rustic, HALL, reach=1.2, dark=0.8)
    def rustic(x, y, z, rnd):                          # (darker across the way in from the ante-room)
        c = shaded(x, y, z, rnd)
        return tuple(v * 0.6 for v in c) if abs(x) < 0.2 and NOTCH[2] + 0.2 < z < 3.8 else c
    rustic.finish = shaded.finish
    base._surface(rnd, (ANTE[1] - ANTE_TILES, ANTE[1], 0, 0, ANTE[2], ANTE[3]), rustic, out, 0.05, 0.004)   # (the hall's tiles start in the ante-room)
    base._surface(rnd, (hx0, NOTCH[1], 0, 0, NOTCH[2], hz1), rustic, out, 0.05, 0.004)
    base._surface(rnd, (NOTCH[1], TILES_END, 0, 0, hz0, hz1), rustic, out, 0.05, 0.004)
    # (from beside the dining side's last table to the hall's end: smooth pale grey cement)
    cement = _shaded(_cement(HALL_CEMENT, joint=1.5), (TILES_END - 3.0, hx1, hz0, hz1), reach=1.0, dark=0.9)
    base._surface(rnd, (TILES_END, hx1, 0, 0, WC[2], hz1), cement, out, FLOOR_STEP)
    base._surface(rnd, (TILES_END, WC[0], 0, 0, hz0, WC[2]), cement, out, FLOOR_STEP)
    # (the toilets' hall, from the half wall on: grey cement, as in the toilets)
    base._surface(rnd, (WC[0], WC[1], 0, 0, 0, WC[2]), _shaded(_cement(WC_FLOOR), (WC[0] - 2, WC[1], 0, WC[2])), out, FLOOR_STEP)
    # (the deck outside the door: the same grey cement in the sun, not boards)
    base._surface(rnd, (*DECK[:2], -STEP_DOWN, -STEP_DOWN, *DECK[2:]), _cement(SUNLIT, joint=1.5, cloud=0.02), out, 0.04)   # (finer: the map's end)
    # (a step down to it at the front door; inside, a landing a step up across the front wall, its
    # edge dark)
    base._surface(rnd, (RECEPTION[0], RECEPTION[0], -STEP_DOWN, 0.0, *DECK[2:]), CEMENT, out, 0.02)
    lx = RECEPTION[0] + LANDING[0]
    base._surface(rnd, (RECEPTION[0], lx, LANDING[1], LANDING[1], 0.05, 3.95), _cement(LANDING_GREY, joint=2.0, cloud=0.008), out, 0.03)
    base._surface(rnd, (lx, lx, 0.0, LANDING[1], 0.05, 3.95), (0.17, 0.11, 0.08), out, 0.015)
    base._surface(rnd, (lx - 0.05, lx, LANDING[1] + 0.002, LANDING[1] + 0.002, 0.05, 3.95), (0.86, 0.72, 0.22), out, 0.012)   # (a yellow line along its edge)
    # (outside the door, daylight: orange steps down off the deck's far edge, and the bright street
    # beyond)
    for k in range(3):
        base._surface(rnd, (DECK[0] + 0.3 * k, DECK[0] + 0.3 * k + 0.06, -STEP_DOWN + 0.002, -STEP_DOWN + 0.002, 0.8, 3.2), (0.86, 0.50, 0.26), out, 0.02)
        base._surface(rnd, (DECK[0] + 0.3 * k + 0.06, DECK[0] + 0.3 * (k + 1), -STEP_DOWN + 0.002, -STEP_DOWN + 0.002, 0.8, 3.2), (0.93, 0.62, 0.36), out, 0.03)
    base._surface(rnd, (DECK[0] - 0.3, DECK[0] - 0.3, -STEP_DOWN, H, -0.5, 4.5), (0.96, 0.95, 0.92), out, 0.06)
    # (the ante-room's jute ceiling hangs under a black one: the page draws it, from fixtures())
    base._surface(rnd, (ANTE[0], ANTE[1], H, H, ANTE[2], ANTE[3]), base.finish("plaster", (0.12, 0.12, 0.12)), out, CEIL_STEP)
    base._surface(rnd, (*RECEPTION[:2], H, H, *RECEPTION[2:]), base.finish("plaster", DARK_CEILING), out, CEIL_STEP)
    base._surface(rnd, (*KITCHEN[:2], H, H, *KITCHEN[2:]), CEILING, out, CEIL_STEP)   # (smooth white paint)
    for (x0, x1, z0, z1) in ((hx0, NOTCH[1], NOTCH[2], hz1), (NOTCH[1], hx1, hz0, hz1), (hx1, STAGE[1], 0, WC[2])):
        base._surface(rnd, (x0, x1, H, H, z0, z1), _rough(CONCRETE), out, CEIL_STEP)
    skylight(rnd, out)

    # the long straight wall on the left (z = 0): the reception's door is at the deck end
    wall_x(0.0, RECEPTION[0], RECEPTION[1], [], _washed(wall, [x for x, z in RECEPTION_LAMPS if z == 0.0]), out, rnd)
    green_x(rnd, 0.0, VERTICAL[0], VERTICAL[1], +1, out)
    spots = ANTE_SPOTS
    wall_x(0.0, ANTE[0], ANTE[1], [], _washed(wall, spots), out, rnd)   # (the ante-room's walls: white plaster, uplit)
    # the right side of the reception (a dark door near the front), the vertical garden (green both
    # sides) and the ante-room; the kitchen behind
    wall_x(4.0, RECEPTION[0], RECEPTION[1], [(-18.7, -17.8, 0.0, 2.2)], _washed(wall, [x for x, z in RECEPTION_LAMPS if z == 4.0]), out, rnd)
    door_x(4.0, -18.7, -17.8, out, rnd, colour=(0.10, 0.09, 0.08), frame=(0.14, 0.12, 0.11))
    # (beside it: an exit sign, a white notice and a small red fire sign)
    base._surface(rnd, (-19.3, -19.09, 1.45, 1.75, 3.988, 3.988), (0.94, 0.94, 0.92), out, 0.012)
    base._surface(rnd, (-19.02, -18.88, 1.45, 1.65, 3.988, 3.988), (0.80, 0.15, 0.12), out, 0.012)
    base._surface(rnd, (-18.97, -18.93, 1.5, 1.6, 3.986, 3.986), (0.95, 0.95, 0.93), out, 0.008)
    wall_x(4.0, VERTICAL[0], VERTICAL[1], [], wall, out, rnd)
    green_x(rnd, 4.0, VERTICAL[0], VERTICAL[1], -1, out)
    # (its curtains, spotlights, the reception's track light, exit signs and speaker: FITTINGS)
    for z, side in ((0.0, 1), (4.0, -1)):             # (a wooden post where each white wall meets the green one)
        x, f = RECEPTION[1], z + side * 0.08
        base._surface(rnd, (x - 0.1, x + 0.1, 0.0, H, f, f), _boards(LIGHT_WOOD, width=0.1), out, 0.02)
        for e in (x - 0.1, x + 0.1):
            base._surface(rnd, (e, e, 0.0, H, min(z, f), max(z, f)), LIGHT_WOOD, out, 0.02)
    wall_x(4.03, ANTE[0], ANTE[1], [], TILE_WHITE, out, rnd)  # (the kitchen's side; its tiles: fittings())
    wall_x(3.98, ANTE[0], ANTE[1], [], _washed(wall, spots), out, rnd)
    kitchen(rnd, out)
    # the front: the deck and the reception's tall door. Inside, the wall is clad in rust-brown
    # panels to the ceiling, the door's two big leaves the same: the one on the left (from inside)
    # shut but a hand's width ajar, the one on the right swung in
    wall_z(RECEPTION[0], 0.0, 4.0, [(0.8, 3.2, 0.0, 2.9)], wall, out, rnd)
    wall_z(RECEPTION[0] + 0.02, 0.0, 4.0, [(0.8, 3.2, 0.0, 2.9)], _cladding, out, rnd, step=0.03)
    with base.as_decor(out):                           # (its leaves drawn as the furniture is: fittings())
        for hinge, width, swing in FRONT_LEAVES:
            leaf(rnd, out, RECEPTION[0] + 0.02, hinge, width, swing)
    # (the reception runs straight into the vertical garden, wall to wall and floor to ceiling; a
    # wide doorway from there into the ante-room)
    wall_z(VERTICAL[1], 0.0, 4.0, [INTO_ANTE + (0.0, 2.9)], wall, out, rnd)
    frame_z(VERTICAL[1], *INTO_ANTE, 0.0, 2.9, out, rnd, colour=WALNUT, t=0.1, d=0.14)
    # the ante-room into the hall (where the hall is narrower), the kitchen's back wall beside it
    wall_z(0.0, 0.0, 4.0, [(NOTCH[2] + 0.2, 4.0 - 0.2, 0.0, 2.9)], hall_wall, out, rnd)
    # (the wall's end there a slim white pillar, 12 cm: a camera and a speaker high on it, fittings())
    base._surface(rnd, (-0.12, 0.0, 0.0, 2.9, NOTCH[2] + 0.2, NOTCH[2] + 0.2), hall_wall, out, 0.03)
    base._surface(rnd, (-0.12, -0.12, 0.0, 2.9, NOTCH[2], NOTCH[2] + 0.2), hall_wall, out, 0.03)
    # the kitchen from the hall: a passage behind a grey partition with a reed mat on it, a
    # serving hatch in a deep white surround along it, and beside it the kitchen's door, a plain
    # opening, its leaf of dark wooden panels swung out across the passage
    wall_z(0.0, 4.0, hz1, [KITCHEN_DOOR + (0.0, 2.2), HATCH + (1.0, 2.1)], hall_wall, out, rnd)
    # (the kitchen's door swung into the kitchen, the passage's own dark door ajar at its end:
    # fittings(); the hatch a plain hole through the wall, its sill and sides white, nothing out)
    h0, h1 = HATCH
    for (x0, x1, y0, y1, z0, z1) in ((-0.03, 0.03, 1.0, 1.0, h0, h1), (-0.03, 0.03, 2.1, 2.1, h0, h1),
                                     (-0.03, 0.03, 1.0, 2.1, h0, h0), (-0.03, 0.03, 1.0, 2.1, h1, h1)):
        base._surface(rnd, (x0, x1, y0, y1, z0, z1), (0.93, 0.93, 0.92), out, 0.02)
    with base.as_decor(out):
        base._surface(rnd, (-0.9, 0.0, 0.0, 2.2, KITCHEN_DOOR[1] - 0.02, KITCHEN_DOOR[1] - 0.02), DOOR, out, 0.03)
        hx_, hz_, w_, a_ = PASSAGE_DOOR
        for k in range(int(w_ / 0.03)):
            u = (k + 0.5) * 0.03
            base._surface(rnd, (hx_ - u * math.cos(a_), hx_ - u * math.cos(a_), 0.0, 2.1, hz_ - u * math.sin(a_), hz_ - u * math.sin(a_)), DOOR, out, 0.03)
    for x in (PARTITION - 0.04, PARTITION + 0.04):
        wall_z(x, HATCH[0] - 0.1, hz1, [], _reed_panel, out, rnd, h=2.6, step=0.03)
    base._surface(rnd, (PARTITION - 0.04, PARTITION + 0.04, 0.0, 2.6, HATCH[0] - 0.1, HATCH[0] - 0.1), TIMBER, out, 0.02)
    # where the hall widens: a beam across it in warm orange-brown wood, a strip of light along its
    # underside, and a post of the same wood down the left wall (the beam's other end rests on the
    # windows' wall, over a window: no post there)
    # (the beam a little under the ceiling, white wall over it)
    bt = H - BEAM_GAP
    base._surface(rnd, (NOTCH[1] - 0.15, NOTCH[1] + 0.15, bt - 0.32, bt, 0.0, hz1), BEAM, out, 0.04)
    for x in (NOTCH[1] - 0.12, NOTCH[1] + 0.12):
        base._surface(rnd, (x, x, bt, H, 0.0, hz1), HALL_WALL, out, 0.04)
    for z0, z1 in ((NOTCH[2], NOTCH[2] + 0.16),):           # (on the left only: the right wall is windows there)
        for x in (NOTCH[1] - 0.1, NOTCH[1] + 0.1):
            base._surface(rnd, (x, x, 0.0, bt - 0.32, z0, z1), BEAM, out, 0.03)
        for z in (z0, z1):
            base._surface(rnd, (NOTCH[1] - 0.1, NOTCH[1] + 0.1, 0.0, bt - 0.32, z, z), BEAM, out, 0.03)
    base._surface(rnd, (NOTCH[1] - 0.06, NOTCH[1] + 0.06, bt - 0.325, bt - 0.325, 0.05, hz1 - 0.05), (1.0, 0.72, 0.42), out, 0.02)

    # the hall: the notch on the left, the half wall, the toilets' hall and the stage beside it
    wc_wall = _wall(WC_WALL, skirting=None)
    wall_x(NOTCH[2], 0.0, NOTCH[1], [], hall_wall, out, rnd)
    base._surface(rnd, (NOTCH[1], NOTCH[1], WC_CEILING, H, 0.0, NOTCH[2]), hall_wall, out, WALL_STEP)   # (the step open under it: the corridor)
    wall_x(0.0, NOTCH[1], HALF_WALL[0], [], hall_wall, out, rnd)
    side_room(rnd, out)
    wall_x(0.0, HALF_WALL[0], WC[1], [(a, b, 0.0, 2.2) for a, b in WC_DOORS], wc_wall, out, rnd)
    for k, (a, b) in enumerate(WC_DOORS):
        open_door_x(0.0, a, b, out, rnd, hinge=1 - k, frame=(0.26, 0.15, 0.10))   # (the ladies' hinged on its right, from the hall; dark frames)
        # (a black sign over each: fittings())
    toilets(rnd, out)
    hx, reach = HALF_WALL
    # (pale bare brick, to the ceiling, the end of the hall's dining side as the walkthrough shows
    # it at 1:20: a small fireplace in it on the hall's side, a framed picture beside that)
    pale = _brickwork(2, FIREPLACE_BRICK)
    a, b, y0, y1 = FIREPLACE
    with base.as_decor(out):                           # (its bricks drawn as the furniture is: fittings())
        wall_z(hx - 0.1, 0.0, reach, [(a, b, y0, y1)], pale, out, rnd, step=0.04)
        wall_z(hx + 0.1, 0.0, reach, [], pale, out, rnd, step=0.04)
        base._surface(rnd, (hx - 0.1, hx + 0.1, 0.0, H, reach, reach), _brickwork(0, FIREPLACE_BRICK), out, 0.04)
    soot = (0.05, 0.05, 0.05)
    base._surface(rnd, (hx + 0.06, hx + 0.06, y0, y1, a, b), soot, out, 0.02)
    for (x0, x1, c0, c1, z0, z1) in ((hx - 0.1, hx + 0.06, y0, y0, a, b), (hx - 0.1, hx + 0.06, y1, y1, a, b),
                                     (hx - 0.1, hx + 0.06, y0, y1, a, a), (hx - 0.1, hx + 0.06, y0, y1, b, b)):
        base._surface(rnd, (x0, x1, c0, c1, z0, z1), soot, out, 0.02)
    # (the picture: a dark wooden frame, a white mount, a thin dark ring drawn on it)
    p0, p1, q0, q1 = PICTURE
    base._surface(rnd, (hx - 0.12, hx - 0.12, q0, q1, p0, p1), (0.22, 0.15, 0.10), out, 0.015)
    pc, qc = (p0 + p1) / 2, (q0 + q1) / 2
    ring = lambda x, y, z, rnd: (0.25, 0.22, 0.2) if abs(math.hypot(z - pc, y - qc) - 0.27) < 0.012 else (0.92, 0.91, 0.88)
    base._surface(rnd, (hx - 0.125, hx - 0.125, q0 + 0.07, q1 - 0.07, p0 + 0.07, p1 - 0.07), ring, out, 0.01)
    # (bare brick on the pergola's side, lit from lights sunk in the floor: fittings())
    # the toilets' hall's end, the stage's side: bare brick, a passage through it to the stage; a
    # black counter before that, a sink cabinet under a mirror and an orange dome beside it
    # (the bricks, the counter, the cabinet: fittings(); kept here for the map)
    with base.as_decor(out):
        wall_x(WC[2], WC[1] - 2.5, WC[1], [], _brickwork(0), out, rnd)
        wall_z(WC[1], 0.0, WC[2], [TO_STAGE + (0.0, TO_STAGE_TOP)], _brickwork(2), out, rnd)
        base._surface(rnd, (WC[1] - 1.6, WC[1] - 1.0, 0.0, 1.05, *COUNTER_Z), (0.10, 0.10, 0.10), out, 0.03)
        base._surface(rnd, (WC[1] - 0.45, WC[1], 0.0, 0.85, SINK_Z - 0.4, SINK_Z + 0.4), (0.24, 0.16, 0.11), out, 0.03)
    # the windows along the right: dark grey frames, linen curtains
    # (three sets of three, the same space between the sets; dark shutters behind the glass)
    windows, lights = hall_windows()
    w0, w1 = HALL_WINDOW
    passage = (0.2, 1.1, 1.8, 2.55)                   # (and one high at the kitchen passage's end)
    wall_x(hz1, hx0, hx1, [(a, b, w0, w1) for a, b in windows] + [passage], _washed(hall_wall, lights), out, rnd)
    frame_x(hz1, *passage, out, rnd, colour=(0.24, 0.16, 0.12), t=0.05)
    base._surface(rnd, (*passage, OUT_WAY + 0.2, OUT_WAY + 0.2), _view, out, 0.04)
    for a, b in windows:
        frame_x(hz1, a, b, w0, w1, out, rnd, colour=GREY_FRAME, t=0.04)
        base._surface(rnd, (a, b, (w0 + w1) / 2 - 0.015, (w0 + w1) / 2 + 0.015, hz1 - 0.02, hz1 + 0.02), GREY_FRAME, out, 0.03)
        # (the sky through the top 40 cm; below, dark wooden shutters hinged at the top, kicked out)
        base._surface(rnd, (a, b, w0, w1, OUT_WAY + 0.2, OUT_WAY + 0.2), _view, out, 0.04)   # (past the passage outside)
        for k in range(7):
            y = w1 - 0.42 - 0.08 * (k + 1)
            base._surface(rnd, (a + 0.02, b - 0.02, y, y + 0.09, hz1 + 0.04 + 0.045 * k, hz1 + 0.04 + 0.045 * k), _shutters, out, 0.03)
    # (its curtains, tied back each side of each set of windows: fittings())
    # its end: wide open onto the pergola under a dark beam, sheer curtains drawn back each side (fittings()), a
    # column of bare brick at the corner with the toilets' hall
    base._surface(rnd, (hx1 - 0.15, hx1 + 0.15, 2.75, H, WC[2], hz1), (0.20, 0.20, 0.21), out, 0.04)
    cx, cz = PIER
    with base.as_decor(out):                           # (drawn as the furniture is: fittings())
        for (a0, a1, b0, b1) in ((cx - 0.2, cx + 0.2, cz - 0.2, cz - 0.2), (cx - 0.2, cx + 0.2, cz + 0.2, cz + 0.2)):
            base._surface(rnd, (a0, a1, 0.0, H, b0, b1), _brickwork(0), out, 0.04)
        for x in (cx - 0.2, cx + 0.2):
            base._surface(rnd, (x, x, 0.0, H, cz - 0.2, cz + 0.2), _brickwork(2), out, 0.04)
    # (short track lights here and there on its ceiling: fittings())

    # the stage: 40 cm up, all in black carpet, black curtains behind and a big white screen (Gabriel:
    # the Palco keeps it, though the walkthrough's frames don't show it)
    sx0, sx1, sz0, sz1, sh = STAGE
    base._surface(rnd, (sx0, sx1, sh, sh, sz0, sz1), BLACK, out, FLOOR_STEP)
    base._surface(rnd, (sx0, sx1, 0.0, sh, sz1, sz1), (0.13, 0.13, 0.13), out, 0.04)
    base._surface(rnd, (sx1, sx1, 0.0, sh, sz0, sz1), (0.13, 0.13, 0.13), out, 0.04)
    base._surface(rnd, (sx0, sx1, sh, H, 0.0, 0.0), _folds((0.16, 0.16, 0.17), 0), out, 0.04)
    wall_z(sx1, 0.0, sz1, [], _folds((0.16, 0.16, 0.17), 2), out, rnd)
    base._surface(rnd, (sx0 + 1.4, sx1 - 1.4, sh + 0.9, H - 0.15, 0.06, 0.06), SCREEN, out, 0.04)


def skylight(rnd, out):
    """The vertical garden's ceiling, dark grey, round the opening its glass roof light stands over
    (the page draws the roof light, its timber and glass, from fixtures())."""
    x0, x1, z0, z1 = VERTICAL
    cx, cz, (lw, ld) = (x0 + x1) / 2, (z0 + z1) / 2, LANTERN
    for a0, a1, b0, b1 in _cut((x0, x1), (z0, z1), [(cx - lw / 2, cx + lw / 2, cz - ld / 2, cz + ld / 2)]):
        base._surface(rnd, (a0, a1, H, H, b0, b1), base.finish("plaster", DARK_CEILING), out, CEIL_STEP)


def _cladding(x, y, z, rnd):
    """Dark rust-brown metal panels, matte, 1.2 m wide, a darker seam between them."""
    if z % 1.2 < 0.03:
        return (0.13, 0.08, 0.06)
    t = rnd.uniform(-0.012, 0.012)
    return (0.23 + t, 0.145 + t * 0.7, 0.11 + t * 0.5)


def leaf(rnd, out, x, hinge, width, swing, h=2.85, step=0.03):
    """A door's big pivoting leaf in the front wall at x, hung at z = hinge, swung `swing` radians
    into the room (toward +x), rust-brown like the wall; two faces 4 cm apart."""
    dx, dz = math.sin(swing), math.cos(swing)
    for i in range(int(width / step)):
        u = (i + 0.5) * step
        for j in range(int(h / step)):
            y = LANDING[1] + (j + rnd.random()) * step
            for off in (-0.02, 0.02):
                p = (x + u * dx + off * dz, y, hinge + u * dz - off * dx)
                out.append((p, _cladding(0, y, u + 0.3, rnd), [step * 0.7] * 3))


def open_door_x(z, a0, a1, out, rnd, h=2.2, hinge=0, frame=DOOR_FRAME):
    """A doorway in a wall along x at z, in a reddish wooden frame, its dark door swung open to -z
    against the wall beside it (hinged at a0, or with hinge 1 at a1)."""
    frame_x(z, a0, a1, 0.0, h, out, rnd, colour=frame, t=0.07, d=0.04)
    x = a1 - 0.06 if hinge else a0 + 0.02
    base._surface(rnd, (x, x + 0.04, 0.0, h, z - (a1 - a0), z - 0.04), DOOR, out, 0.03)


def _mural(colour, dz=0.0):
    """A wall painted with big monstera leaves in greens along z and up, dz along (the ladies'
    room's, on its left wall past its grey wall)."""
    leaves = tuple((cz + dz, cy, r, tilt) for cz, cy, r, tilt in ((-1.0, 1.2, 0.75, 0.3), (-1.9, 1.9, 0.6, -0.4), (-0.4, 2.0, 0.5, 0.6), (-1.5, 0.6, 0.55, 1.1)))
    def f(x, y, z, rnd):
        for cz, cy, r, tilt in leaves:
            u, v = z - cz, y - cy
            u, v = u * math.cos(tilt) - v * math.sin(tilt), u * math.sin(tilt) + v * math.cos(tilt)
            if (u / r) ** 2 + (v / (r * 0.8)) ** 2 < 1:
                if abs(u) < 0.012 or (abs(u) > 0.2 * r and abs(math.sin(math.atan2(v, u) * 7)) < 0.12):
                    return colour                          # (the rib and the slits)
                return (0.30, 0.47, 0.33) if v > 0 else (0.38, 0.56, 0.40)
        return colour
    return base.finish("plaster", f)


def toilets(rnd, out):
    """The toilets behind the toilets' hall's left wall, as the walkthrough shows them: grey walls
    under a white ceiling with downlights, a cement floor, small windows high on the far wall. The
    ladies': a wooden counter with two white bowls and round mirrors on its left wall, a grey wall
    2 m high across the room past it (what the door looks onto), two cubicles with lattice doors
    behind that, big leaves painted on its right wall. The gents': a long steel trough with a wooden shelf
    over it, a cubicle, a basin on a tiled splashback."""
    grey = _wall(WC_GREY, skirting=None)
    two_tone = _two_tone((0.74, 0.73, 0.70), WC_GREY, 1.22)   # (the gents': paler below the shelf's line)
    for r in (LADIES, GENTS):
        x0, x1, z0, z1 = r
        base._surface(rnd, (x0, x1, 0, 0, z0, z1), _shaded(_cement(WC_FLOOR, joint=1.2), r), out, FLOOR_STEP)
        base._surface(rnd, (x0, x1, WC_CEILING, WC_CEILING, z0, z1), base.finish("plaster", CEILING), out, CEIL_STEP)
        # the far wall, with its windows high up
        wins = [(x0 + 0.6, x0 + 1.4), (x1 - 1.4, x1 - 0.6)]
        wall_x(z0, x0, x1, [(a, b, 2.1, 2.5) for a, b in wins], grey if r == LADIES else two_tone, out, rnd, h=WC_CEILING)
        for a, b in wins:
            frame_x(z0, a, b, 2.1, 2.5, out, rnd, colour=DOOR_FRAME, t=0.04)
            base._surface(rnd, (a, b, 2.1, 2.5, z0 - 0.03, z0 - 0.03), _view, out, 0.03)
    lx0, lx1, z0, z1 = LADIES
    gx0, gx1 = GENTS[:2]
    wall_z(lx0, z0, z1, [], _mural(WC_GREY, -1.6), out, rnd, h=WC_CEILING)   # (the leaves past the grey wall)
    wall_z(gx1, z0, z1, [], two_tone, out, rnd, h=WC_CEILING)
    wall_z(lx1 - 0.01, z0, z1, [], grey, out, rnd, h=WC_CEILING)   # (the ladies' side)
    wall_z(lx1 + 0.01, z0, z1, [], two_tone, out, rnd, h=WC_CEILING)
    # (its counter, bowls, mirrors, cubicles, globe lights and downlights: fittings())
    # (kept, for the map, where they stand: the counters, the trough, the cubicles' panels and toilets)
    with base.as_decor(out):
        stand = (0.30, 0.19, 0.12)
        base._surface(rnd, (lx0, lx0 + 0.5, 0.78, 0.84, -1.6, -0.1), stand, out, 0.03)
        base._surface(rnd, (gx1 - 0.5, gx1, 0.78, 0.84, -2.3, -1.0), stand, out, 0.03)
        base._surface(rnd, (gx0 + 0.3, gx0 + 2.5, 0.45, 0.85, z0, z0 + 0.35), stand, out, 0.03)
        fx, fz, n = LADIES_STALLS
        w = (fz - z0) / n
        for k in range(n + 1):                           # (the ladies': panels between its cubicles, its toilets)
            base._surface(rnd, (fx, lx1, 0.15, 2.1, fz - k * w, fz - k * w), stand, out, 0.03)
        for k in range(n):
            base._surface(rnd, (lx1 - 0.62, lx1, 0.0, 0.42, fz - (k + 0.5) * w - 0.19, fz - (k + 0.5) * w + 0.19), stand, out, 0.025)
        base._surface(rnd, (gx1 - 1.2, gx1 - 1.2, 0.15, 2.1, z0, -2.85), stand, out, 0.03)
        base._surface(rnd, (gx1 - 0.6 - 0.19, gx1 - 0.6 + 0.19, 0.0, 0.42, z0, z0 + 0.62), stand, out, 0.025)
    # (its grey wall across the room, 2 m high, both faces and its top)
    for z in (LADIES_SCREEN - 0.05, LADIES_SCREEN + 0.05):
        base._surface(rnd, (LADIES_SCREEN_FROM, lx1, 0.0, 2.0, z, z), (0.62, 0.62, 0.63), out, 0.03)
    base._surface(rnd, (LADIES_SCREEN_FROM, lx1, 2.0, 2.0, LADIES_SCREEN - 0.05, LADIES_SCREEN + 0.05), (0.62, 0.62, 0.63), out, 0.03)
    base._surface(rnd, (LADIES_SCREEN_FROM, LADIES_SCREEN_FROM, 0.0, 2.0, LADIES_SCREEN - 0.05, LADIES_SCREEN + 0.05), (0.62, 0.62, 0.63), out, 0.03)
    # (the gents' trough, cubicle, counter and mosaic splashback; the ladies' changing table: fittings())
    with base.as_decor(out):
        base._surface(rnd, (*CHANGING[:2], 0.0, 0.9, *CHANGING[2:]), (0.93, 0.93, 0.92), out, 0.03)


def _two_tone(lower, upper, at):
    """A wall painted one colour below `at` and another above."""
    lo, up = _wall(lower, skirting=None), _wall(upper, skirting=None)
    return base.finish("plaster", lambda x, y, z, rnd: lo(x, y, z, rnd) if y < at else up(x, y, z, rnd))


def _reed_panel(x, y, z, rnd):
    """The kitchen passage's partition: grey plaster, a mat of pale grey reeds on it."""
    if y < 0.3 or y > 2.35 or z < HATCH[0] + 0.1 or z > HALL[3] - 0.2:
        return (0.58, 0.56, 0.52)
    r = random.Random(math.floor(z / 0.012))
    t = r.uniform(-0.07, 0.05) + 0.03 * math.sin(y * 9 + r.random() * 6)
    return (0.70 + t, 0.68 + t, 0.62 + t * 0.8)


def _louvres(x, y, z, rnd):
    """A louvred door in dark wood: slats 4 cm, a light line between them, a stile round them."""
    return (0.42, 0.30, 0.20) if y % 0.04 < 0.008 else (0.24, 0.15, 0.10)


def side_room(rnd, out):
    """The small room behind the hall (the walkthrough at 1:22-1:33): the notch's step is open, a
    short corridor running on from it along the outside of the hall's left wall; just past its
    corner, in its wall on the right, a louvred double door (swung in), and right behind it the
    room: khaki walls (the corridor's too), dark stone tiles (drawn as the furniture is, and the
    skirting: fittings()) and across it wooden glass doors onto a planted patio. The kitchen's staff come in this way; the
    venue stops at the glass doors, the patio only seen through them (faint: the map leaves it
    out; the page draws its plants, from fixtures())."""
    end, w = CORRIDOR
    x0, x1, z0, z1 = SIDE
    d0, d1 = SIDE_DOOR
    beige = _wall((0.60, 0.57, 0.47), skirting=None)   # (khaki, as filmed: the corridor too)
    floor = (0.30, 0.26, 0.23)
    base._surface(rnd, (end, NOTCH[1], 0, 0, 0.0, w), floor, out, FLOOR_STEP)
    base._surface(rnd, (end, NOTCH[1], WC_CEILING, WC_CEILING, 0.0, w), base.finish("plaster", CEILING), out, CEIL_STEP)
    wall_x(w, end, NOTCH[1], [], beige, out, rnd, h=WC_CEILING)
    wall_z(end, 0.0, w, [], beige, out, rnd, h=WC_CEILING)
    frame_x(z1, d0, d1, 0.0, 2.3, out, rnd, colour=DOOR_FRAME, t=0.07, d=0.04)
    for x in (d0 + 0.02, d1 - 0.06):                  # the louvred leaves, swung into the room
        base._surface(rnd, (x, x + 0.04, 0.0, 2.25, z1 - (d1 - d0) / 2, z1 - 0.04), _louvres, out, 0.02)
    base._surface(rnd, (x0, x1, 0, 0, z0, z1), _shaded(floor, SIDE), out, FLOOR_STEP)
    base._surface(rnd, (x0, x1, WC_CEILING, WC_CEILING, z0, z1), base.finish("plaster", CEILING), out, CEIL_STEP)
    wall_z(x0 + 0.02, z0, z1, [], beige, out, rnd, h=WC_CEILING)   # (just off the ante-room's wall)
    wall_z(x1, z0, z1, [], beige, out, rnd, h=WC_CEILING)
    wall_x(z1, x0, NOTCH[1], [(d0, d1, 0.0, 2.3)], beige, out, rnd, h=WC_CEILING)
    wall_x(z1 - 0.03, NOTCH[1], x1, [], beige, out, rnd, h=WC_CEILING)   # (behind the hall's own wall)
    ga, gb = GARDEN_DOOR
    wall_x(z0, x0, x1, [(ga, gb, 0.0, 2.4)], beige, out, rnd, h=WC_CEILING)
    wood = (0.42, 0.28, 0.18)
    frame_x(z0, ga, gb, 0.0, 2.4, out, rnd, colour=wood, t=0.08, d=0.1)
    m = (ga + gb) / 2
    for x in (m - 0.04, m, ga + (m - ga) / 2, m + (gb - m) / 2):        # the leaves' stiles and their bars
        base._surface(rnd, (x - 0.025, x + 0.025, 0.0, 2.4, z0 - 0.02, z0 + 0.02), wood, out, 0.02)
    for y in (0.05, 0.9, 2.35):
        base._surface(rnd, (ga, gb, y, y + 0.06, z0 - 0.02, z0 + 0.02), wood, out, 0.02)
    # (the glass, kept for the map; the page draws it, and the patio's terracotta through it: fittings())
    with base.as_decor(out):
        for i in range(int((gb - ga) / 0.05)):
            for k in range(int(2.4 / 0.05)):
                out.append(((ga + (i + rnd.random()) * 0.05, (k + rnd.random()) * 0.05, z0), (0.80, 0.86, 0.87), [0.03, 0.03, 0.005], 0.12))


def kitchen(rnd, out):
    """The kitchen, as Gabriel's frame of it shows it: white tiles up its walls, a high row of
    windows in dark wooden frames on its outside wall (frosted, some panes tipped open) over
    stainless sinks; a stove under a steel hood in the middle, its duct to the wall; a tall white
    fridge; in its far wall a red door and an open doorway, the staff's way out (to the passage
    outside along the hall's windows: out_way()); its sinks, range, hood and duct drawn as the furniture is (fittings())."""
    x0, x1, z0, z1 = KITCHEN
    windows = [(x0 + 0.6 + 1.5 * k, x0 + 1.8 + 1.5 * k) for k in range(5)]
    w0, w1 = 1.4, 2.5
    frame = (0.30, 0.20, 0.15)
    wall_x(z1, x0, x1, [(a, b, w0, w1) for a, b in windows], TILE_WHITE, out, rnd)   # (its tiles: fittings())
    for k, (a, b) in enumerate(windows):
        frame_x(z1, a, b, w0, w1, out, rnd, colour=frame, t=0.05)
        for m in (1, 2):
            x = a + (b - a) * m / 3
            base._surface(rnd, (x - 0.02, x + 0.02, w0, w1, z1 - 0.02, z1 + 0.02), frame, out, 0.03)
        base._surface(rnd, (a, b, (w0 + w1) / 2 - 0.02, (w0 + w1) / 2 + 0.02, z1 - 0.02, z1 + 0.02), frame, out, 0.03)
        base._surface(rnd, (a, b, w0, w1, z1 + 0.03, z1 + 0.03), (0.86, 0.88, 0.88), out, 0.04)    # (frosted)
        if k % 2 == 0:                               # a pane tipped open into the room
            base._surface(rnd, (a + 0.05, a + (b - a) / 3 - 0.05, w0 + 0.42, w0 + 0.46, z1 - 0.3, z1 - 0.02), (0.84, 0.86, 0.86), out, 0.02)
    wall_z(x0, z0, z1, [d + (0.0, 2.2) for d in KITCHEN_DOORS] + [KITCHEN_WAY_OUT + (0.0, 2.2)], TILE_WHITE, out, rnd)
    for (a, b), c in zip(KITCHEN_DOORS, ((0.22, 0.13, 0.10), (0.30, 0.09, 0.09))):   # (their leaves: fittings())
        frame_z(x0, a, b, 0.0, 2.2, out, rnd, colour=c, t=0.06, d=0.04)
    # (through the doorway, the outside in daylight: a sunlit yard, a low white wall, the sky)
    a, b = KITCHEN_WAY_OUT
    frame_z(x0, a, b, 0.0, 2.2, out, rnd, colour=(0.80, 0.80, 0.78), t=0.05, d=0.04)
    base._surface(rnd, (x0 - 3.0, x0, 0.0, 0.0, a - 1.0, z1), _cement(SUNLIT, joint=1.2), out, 0.05)
    base._surface(rnd, (x0 - 3.0, x0 - 3.0, 0.0, 1.3, a - 1.0, OUT_WAY), (0.94, 0.93, 0.90), out, 0.05)
    base._surface(rnd, (x0 - 3.2, x0 - 3.2, 1.3, 4.0, a - 1.5, OUT_WAY + 0.5), _view, out, 0.06)
    out_way(rnd, out)
    # (kept, for the map, where they stand: the sink benches and the range, drawn by fittings())
    with base.as_decor(out):
        for x in (x0 + 2.3, x0 + 5.9):
            base._surface(rnd, (x - 1.5, x + 1.5, 0.0, 0.9, z1 - 0.65, z1), (0.70, 0.71, 0.72), out, 0.04)
        base._surface(rnd, (x0 + 4.05, x0 + 4.95, 0.0, 0.86, 5.3, 6.3), (0.70, 0.71, 0.72), out, 0.04)
    # the fridge against the ante-room's wall, near the far end
    base._surface(rnd, (x0 + 0.3, x0 + 1.05, 0.0, 1.9, z0, z0 + 0.72), (0.94, 0.94, 0.93), out, 0.03)


def out_way(rnd, out):
    """The passage outside, along the house's long side (Gabriel's drawing): out of the kitchen's
    left door into its yard, round the corner and along the kitchen's and the hall's windows, in
    cement behind a low white wall like the yard's, to a wooden door onto the pergola, in a wall of
    the pergola's rough cement closing its corner beside the hall's end (an open doorway)."""
    x0, z0 = KITCHEN[0] - 3.0, HALL[3]
    x1 = PERGOLA[0]
    base._surface(rnd, (x0, x1, 0.0, 0.0, z0, OUT_WAY), _cement(SUNLIT, joint=1.2), out, 0.05)
    wall_x(OUT_WAY, x0, x1, [], (0.94, 0.93, 0.90), out, rnd, h=1.3, step=0.05)
    a, b = OUT_DOOR
    wall_z(x1, z0, OUT_WAY, [(a, b, 0.0, 2.2)], _rough(ROUGH, 0.08), out, rnd, h=PERGOLA_ROOF)
    frame_z(x1, a, b, 0.0, 2.2, out, rnd, colour=TIMBER, t=0.06, d=0.06)


def green_x(rnd, z, x0, x1, side, out):
    """A wall of leaves along x at z (the room on its `side`): here only its backing, green; the page
    draws the planted wall over it (living_wall, from fixtures())."""
    base._surface(rnd, (x0, x1, 0.0, H, z + 0.005 * side, z + 0.005 * side), _greenwall, out, 0.04)


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
    # (near the hall a tall door of vertical wooden slats, shut, flush with it; an exit sign)
    slats = lambda x, y, z, rnd: (0.17, 0.11, 0.08) if x % 0.1 < 0.014 else (0.47, 0.31, 0.21)
    base._surface(rnd, (x0 + 0.3, x0 + 1.5, 0.0, 2.7, z1 - 0.03, z1 - 0.03), slats, out, 0.02)
    for x in strips():
        base._surface(rnd, (x - 0.05, x + 0.05, 0.6, 2.8, z1 - 0.02, z1 - 0.02), TIMBER, out, 0.02)
    # (its exit sign and the up-and-down lights between the strips: fittings())
    # the roof: beams across in dark wood, two along under them, a post at each end of the
    # garden side (the reed matting over them, and the track lights on them: fittings())
    for x in pergola_beams():
        base._surface(rnd, (x - 0.08, x + 0.08, PERGOLA_ROOF - 0.22, PERGOLA_ROOF, z0, z1), PERGOLA_BEAM, out, 0.05)
    base._surface(rnd, (x0, x1, PERGOLA_ROOF - 0.22, PERGOLA_ROOF, z0, z0 + 0.16), PERGOLA_BEAM, out, 0.05)
    for z in (z0 + (z1 - z0) / 3, z0 + 2 * (z1 - z0) / 3):
        base._surface(rnd, (x0, x1, PERGOLA_ROOF - 0.36, PERGOLA_ROOF - 0.22, z - 0.07, z + 0.07), PERGOLA_BEAM, out, 0.05)
    for z in PIERS:                                  # (on the garden side, piers of bare brick)
        pier(rnd, out, x1 - 0.1, z, 0.18, PERGOLA_ROOF - 0.22)
    # 14: along its edge on the garden, a strip of irregular flagstones
    base._surface(rnd, (x1 - 0.7, x1, 0.004, 0.004, z0, z1), _flagstones, out, 0.03)


def _flagstones(x, y, z, rnd):
    """Crazy paving: grey stones of every shape, about 30 cm across, dark joints between them."""
    i0, k0, near = math.floor(x / 0.3), math.floor(z / 0.3), []
    for i in (i0 - 1, i0, i0 + 1):
        for k in (k0 - 1, k0, k0 + 1):
            r = random.Random(i * 7919 + k * 104729)
            px, pz = (i + r.random()) * 0.3, (k + r.random()) * 0.3
            near.append((math.hypot(x - px, z - pz), r.random()))
    near.sort()
    if near[1][0] - near[0][0] < 0.025:
        return (0.30, 0.29, 0.27)
    t = 0.15 * near[0][1] - 0.07
    return (0.58 + t, 0.56 + t, 0.52 + t)


def pier(rnd, out, cx, cz, hw, h):
    """A square pier of bare brick, hw either side of (cx, cz), from the floor to h."""
    for z in (cz - hw, cz + hw):
        base._surface(rnd, (cx - hw, cx + hw, 0.0, h, z, z), _brickwork(0), out, 0.04)
    for x in (cx - hw, cx + hw):
        base._surface(rnd, (x, x, 0.0, h, cz - hw, cz + hw), _brickwork(2), out, 0.04)


def garden(rnd, out):
    # sand, from the stage's end (where the house ends) and the pergola to the far side, round the
    # bungalow too (the walkthrough shows no grass: plants stand in the sand)
    def ground(x, y, z, rnd):
        return _sand(x, y, z, rnd)
    # (one sheet, so the page draws it smooth: the cells past the slanted far side left out)
    long = max(GARDEN_LEFT, GARDEN_RIGHT)
    ground.finish = "sand"
    base.sheet(rnd, (GARDEN_X, 0.0, 0.0), (long, 0.0, 0.0), (0.0, 0.0, GARDEN_W), round(long / LAWN_STEP),
               round(GARDEN_W / LAWN_STEP), ground, out, [LAWN_STEP * 0.75, LAWN_STEP * 0.09, LAWN_STEP * 0.75],
               keep=lambda x, z: x < garden_end(z))
    # beside the pergola, to the garden's right wall
    base._surface(rnd, (PERGOLA[0], GARDEN_X, 0, 0, PERGOLA[3], GARDEN_W), _sand, out, LAWN_STEP)
    # its walls, along the left (on from the house's) and the right, and across beside the pergola,
    # 2 m high and painted near black, to where the sand starts; tropical beds along them behind a
    # kerb (planted all along: the page draws the borders in front of them, from fixtures())
    dark = _rough((0.17, 0.18, 0.17), 0.03)
    wall_x(0.0, GARDEN_X, garden_end(0.0), [], dark, out, rnd, h=2.0)
    wall_x(GARDEN_W, PERGOLA[0], garden_end(GARDEN_W), [], dark, out, rnd, h=2.0)
    wall_z(PERGOLA[0], PERGOLA[3], GARDEN_W, [], dark, out, rnd, h=2.0)
    # a cement path out from the pergola's corner into the sand
    base._surface(rnd, (GARDEN_X, GARDEN_X + 3.0, 0.006, 0.006, PERGOLA[3] - 1.7, PERGOLA[3] - 0.2), _cement(PERGOLA_FLOOR, joint=1.0), out, FLOOR_STEP)
    # the planted beds along the walls: the page draws them (tropical_border); here their tops, a metre
    # up and green, so the map keeps the body out of them
    for z0, z1, x0, x1 in ((0.0, 1.5, GARDEN_X, garden_end(0.0) - 0.5), (GARDEN_W - 1.5, GARDEN_W, PERGOLA[0] + 0.3, garden_end(GARDEN_W) - 0.5)):
        base._surface(rnd, (x0, x1, 1.0, 1.0, z0, z1), (0.20, 0.36, 0.17), out, 0.08)
    bungalow(rnd, out)
    # (the sea wall's stones and the trees' trunks, for the map: the page draws them, fixtures())
    with base.as_decor(out):
        sea_wall(rnd, out)
        for t in TREES:
            trunk(rnd, out, *t)


def trunk(rnd, out, x, z, item):
    """A tree's trunk to 1.9 m, for the map (the page draws the tree)."""
    r, y = TRUNK[item], 0.0
    while y < 1.9:
        for k in range(10):
            a = 2 * math.pi * (k + rnd.random()) / 10
            out.append(((x + r * math.cos(a), y, z + r * math.sin(a)), (0.42, 0.36, 0.30), [0.03, 0.03, 0.03]))
        y += 0.05


def sea_wall(rnd, out):
    """The low wall of dark stones along the garden's far side, between it and the beach (45 cm high,
    40 cm thick), open in the middle for the path, for the map: the page draws it (stone_wall, fixtures())
    and the clipped hedge along its top."""
    (ax, az), L, (tx, tz), (nx, nz) = far_side()
    st, h, w = 0.05, 0.45, 0.4
    def stone(u, y):
        r = random.Random(math.floor(u / 0.32 + (0.5 if math.floor(y / 0.15) % 2 else 0)) * 7 + math.floor(y / 0.15))
        joint = (u / 0.32 + (0.5 if math.floor(y / 0.15) % 2 else 0)) % 1 < 0.06 or y % 0.15 < 0.012
        k = 0.55 if joint else 1 + r.uniform(-0.18, 0.15)
        return (0.36 * k, 0.35 * k, 0.32 * k)
    for i in range(int(L / st)):
        u = (i + 0.5) * st
        if abs(u / L - 0.5) < SEA_GAP:
            continue
        for side in (0.0, w):
            for j in range(int(h / st)):
                y = (j + 0.5) * st
                p = (ax + tx * u + nx * (0.3 + side), y, az + tz * u + nz * (0.3 + side))
                out.append((p, stone(u, y), [st * 0.7, st * 0.7, st * 0.7]))
        for v in (0.1, 0.2, 0.3):
            out.append(((ax + tx * u + nx * (0.3 + v), h, az + tz * u + nz * (0.3 + v)), stone(u + 0.37, 0.07), [st * 0.7, st * 0.3, st * 0.7]))


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
    """The bungalow (bangalô): an open wooden deck a step up off the sand, under a frame of dark
    red-brown timber, heavy posts and beams (three across, over the posts), no walls and no roof."""
    x0, x1, z0, z1 = BUNGALOW
    h, top = DECK_UP, 2.7
    base._surface(rnd, (x0, x1, h, h, z0, z1), _boards(DECK_WOOD, gap=(0.20, 0.13, 0.10), width=0.15), out, FLOOR_STEP)
    for (a, b, c, d) in ((x0, x1, z0, z0), (x0, x1, z1, z1), (x0, x0, z0, z1), (x1, x1, z0, z1)):
        base._surface(rnd, (a, b, 0.0, h, c, d), (0.30, 0.21, 0.15), out, 0.03)
    # (a wooden step up to it in the middle of its front, from the garden's aisle)
    cx = (x0 + x1) / 2
    base._surface(rnd, (cx - 0.7, cx + 0.7, 0.0, h / 2, z0 - 0.35, z0), DECK_WOOD, out, 0.03)
    posts = [(x, z) for x in (x0 + 0.1, (x0 + x1) / 2, x1 - 0.1) for z in (z0 + 0.1, z1 - 0.1)]
    for x, z in posts:                                   # (heavy square posts, as filmed)
        base._surface(rnd, (x - 0.11, x + 0.11, h, top, z - 0.11, z + 0.11), BUNGALOW_TIMBER, out, 0.05)
    for z in (z0 + 0.1, z1 - 0.1):                       # the beams along it, and a few across on them over the posts
        base._surface(rnd, (x0 - 0.3, x1 + 0.3, top, top + 0.25, z - 0.08, z + 0.08), BUNGALOW_TIMBER, out, 0.05)
    for x in (x0 + 0.1, (x0 + x1) / 2, x1 - 0.1):
        base._surface(rnd, (x - 0.07, x + 0.07, top + 0.25, top + 0.45, z0 - 0.3, z1 + 0.3), BUNGALOW_TIMBER, out, 0.05)


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
