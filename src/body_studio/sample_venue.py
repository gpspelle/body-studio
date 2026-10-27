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

VERSION = 19
PLY = "wedding_venue_clean.ply"
SEED = 23

H = 3.4                             # the ceiling, everywhere under a roof
HALL = (0.0, 17.8, 0.0, 8.6)        # x0, x1, z0, z1
NOTCH = (0.0, 5.0, 1.5)             # the hall's first 5 m are 1.5 m narrower on the left
HALF_WALL = (11.3, 3.24)            # x, how far it comes out from the left wall
WC = (11.3, 20.0, 3.2)              # the hall to the toilets: x0, x1, how wide
STAGE = (20.0, 28.6, 0.0, 3.2, 0.4)  # x0, x1, z0, z1, its height
PERGOLA = (17.8, 28.6, 3.2, 10.6)
GARDEN_X = 28.6                     # where the garden starts
GARDEN_W = 17.8
COVER_LEN = 20.0                    # m of the garden under the glass rain cover: from the pergola to the end of its wall
PERGOLA_ROOF = 3.2                  # the pergola's flat reed roof
GARDEN_RIGHT, GARDEN_LEFT = 20.0, 30.0   # (along z = 0 and z = GARDEN_W: the plan's own right and left, as drawn)
ANTE = (-9.3, 0.0, 0.0, 4.0)
ANTE_SPOTS = tuple(ANTE[0] + 1.2 + 2.3 * k for k in range(4))   # x: its floor spotlights, along both walls
ANTE_TILES = 1.2                        # m of the ante-room's end already in the hall's rustic tiles
KITCHEN = (-9.3, 0.0, 4.0, 8.6)
KITCHEN_DOOR = (7.6, 8.5)               # z: its lattice door on the hall, at the end of the passage to it
HATCH = (4.9, 7.2)                      # z: its serving hatch on the hall, a stone sill 1 m up
PARTITION = 1.3                         # x: the reed-clad partition between the hall and that passage
VERTICAL = (-13.8, -9.3, 0.0, 4.0)
INTO_ANTE = (0.35, 3.65)                # z: the wide opening from it into the ante-room, between its planted walls
RECEPTION = (-19.8, -13.8, 0.0, 4.0)
DECK = (-21.8, -19.8, 0.0, 4.0)
RECEPTION_LAMPS = ((-17.6, 0.0), (-15.8, 4.0))   # its floor spotlights: x, the wall they light
TRACK = (-16.8, 1.85)                   # its track light's socket on the ceiling: x, z
STEP_DOWN = 0.08                    # the deck is a step down from the reception's floor (the map's floor is within 10 cm)
LANDING = (0.7, 0.08)               # inside the front door: a landing across the front wall, how deep, how high
BUNGALOW = (41.5, 50.5, 12.7, 17.5)
DECK_UP = 0.09                      # its deck, a step up off the sand (any higher and the map no longer sees a floor there)
LADIES = (11.3, 14.5, -4.0, 0.0)        # the toilets, behind the toilets' hall's left wall: x0, x1, z0, z1
GENTS = (14.5, 18.6, -4.0, 0.0)
WC_DOORS = ((13.0, 13.9), (15.2, 16.1))
WC_CEILING = 2.8
PASSAGE = (5.2, 6.4, -2.0)              # off the hall's left wall where the notch ends: x0, x1, how far it goes
SIDE = (4.0, 10.0, -5.6, -2.0)          # the small room at its end, behind its louvred double door
GARDEN_DOOR = (6.4, 8.0)                # x: the room's glass doors onto a planted patio (where the venue stops)
BEACH = 8.0                         # m of dry sand from the garden's far side to the water
SEA = 130.0                         # m out to the island across the channel

FLOOR_STEP, WALL_STEP, CEIL_STEP, LAWN_STEP = 0.055, 0.07, 0.09, 0.085

# colours as the walkthrough videos show them (Gabriel's mum's, 2026-10-24), measured from the
# frames and evened out for the camera's exposure
CEMENT = (0.66, 0.66, 0.65)         # the smooth grey floors: the ante-room's step
WC_FLOOR = (0.53, 0.53, 0.52)       # the toilets' and their hall's grey cement, a shade darker
POLISHED = (0.48, 0.51, 0.54)       # the reception's and the vertical garden's: polished cement, a cool grey
SUNLIT = (0.62, 0.63, 0.63)         # the same cement out on the deck, in the sun
PERGOLA_FLOOR = (0.50, 0.52, 0.54)  # the pergola's, a darker blue-grey
ROUGH = (0.70, 0.67, 0.63)          # rough cement: the pergola's wall
CEILING = (0.95, 0.94, 0.91)
DARK_CEILING = (0.58, 0.58, 0.57)   # the reception's and the vertical garden's, painted mid grey (drawn
                                    # facing down, out of the light, it shows darker: as the video's)
SLAB = (0.74, 0.76, 0.78)           # the ante-room's pale cement slabs, a cool near-white
WC_GREY = (0.60, 0.61, 0.63)        # the toilets' walls
RUST = (0.31, 0.18, 0.13)           # the front door's pivoting leaves
CONCRETE = (0.86, 0.83, 0.78)       # the hall's ceiling, a pale warm grey (light from the windows on it)
HALL_WALL = (0.88, 0.88, 0.87)
WC_WALL = (0.78, 0.81, 0.84)        # pale blue-grey
PLASTER = (0.93, 0.92, 0.90)        # smooth white paint (the walkthrough's walls)
TERRACOTTA = (0.74, 0.40, 0.17)     # the hall's rustic tiles, glazed orange, worn black in patches
DARK_TILE = (0.17, 0.11, 0.08)
TIMBER = (0.40, 0.27, 0.19)         # beams, strips and posts in dark wood
BEAM = (0.52, 0.31, 0.17)           # the hall's beam and posts where it widens, a warm orange-brown
SCREEN = (0.90, 0.90, 0.89)
REED = (0.66, 0.54, 0.38)           # the pergola's woven reed roof
DOOR = (0.23, 0.16, 0.14)           # the doors, dark wood
DOOR_FRAME = (0.45, 0.28, 0.19)
STEEL = (0.14, 0.14, 0.15)
GREY_FRAME = (0.36, 0.37, 0.38)     # the windows' frames
BLACK = (0.10, 0.10, 0.10)          # the stage's carpet and curtains
BRICK = (0.74, 0.47, 0.33)
TILE_WHITE = (0.93, 0.93, 0.92)
LINEN = (0.90, 0.87, 0.81)          # the hall's curtains
SHEER = (0.97, 0.95, 0.91)          # the vertical garden's, paler: off-white, the light through them
DECK_WOOD = (0.50, 0.34, 0.25)      # the bungalow's deck
OAK = (0.55, 0.40, 0.27)
LIGHT_WOOD = (0.66, 0.50, 0.34)     # the posts where the reception's walls meet the planted ones
WALNUT = (0.34, 0.23, 0.16)
WHITEWASH = (0.92, 0.91, 0.88)
SAND = (0.86, 0.79, 0.66)
SEA_BLUE = (0.36, 0.50, 0.52)
SKIRTING = (0.56, 0.38, 0.24)       # the wooden skirting along the white walls
SKIRTING_BOARD = (0.46, 0.29, 0.17)  # the same as a board drawn as the furniture is (its light is brighter)
TERRACOTTA_ARCH = (0.62, 0.30, 0.17)  # the oval standing at the ante-room's end
EXIT_GREEN = (0.10, 0.58, 0.32)
WARM = (1.0, 0.86, 0.6)             # a lamp's lit face
FAR = 0.42                          # how opaque what is far off is drawn: under room.OPAQUE


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
    """The hall's floor: glazed rustic tiles, 40 cm square, orange worn through to near black in
    blotches (each tile its own: a few overlapping waves above a level), a soft edge round each
    blotch, a pale glint where the windows light the glaze."""
    if math.floor(x / 0.05) % 8 == 0 or math.floor(z / 0.05) % 8 == 0:   # (the joints: one whole cell of the floor's 5 cm mesh, or the mesh blurs them away)
        return (0.13, 0.10, 0.08)
    r = random.Random(math.floor(x / 0.4) * 7919 + math.floor(z / 0.4))
    a, b, c, d = (r.uniform(0, 6.3) for _ in range(4))
    n = (math.sin(x * 9 + a) * math.sin(z * 8 + b) + 0.6 * math.sin((x - z) * 12 + c)
         + 0.25 * math.sin(x * 23 + z * 19 + d))          # (big patches, as filmed: a few to a tile)
    k = min(1.0, max(0.0, (n - r.uniform(-0.6, 0.5)) / 0.25 + 0.5))    # 0 orange .. 1 worn black
    shade = r.uniform(-0.06, 0.04)
    col = [o + shade + (w - o) * k for o, w in zip(TERRACOTTA, DARK_TILE)]
    glint = 0.08 * max(0.0, math.sin(z * 0.9 + 1.2)) ** 6
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


def _tiles(colour, size, grout=(0.72, 0.72, 0.71), across=0):
    """Square tiles with a grey grout line: on a floor (across 0: x and z) or a wall along x (1: x
    and y) or along z (2: z and y)."""
    def f(x, y, z, rnd):
        a, b = ((x, z), (x, y), (z, y))[across]
        if a % size < 0.005 or b % size < 0.005:
            return grout
        t = rnd.uniform(-0.012, 0.012)
        return tuple(c + t for c in colour)
    return base.finish("tile", f)


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


def door_z(x, a0, a1, out, rnd, h=2.2):
    """A closed door in dark wood in a wall along z, in a reddish wooden frame, a steel handle."""
    base._surface(rnd, (x, x, 0.0, h, a0, a1), DOOR, out, 0.03)
    base._surface(rnd, (x - 0.03, x + 0.03, 1.0, 1.04, a1 - 0.14, a1 - 0.06), (0.70, 0.70, 0.68), out, 0.01)
    frame_z(x, a0, a1, 0.0, h, out, rnd, colour=DOOR_FRAME, t=0.07, d=0.04)


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
    base._surface(rnd, (KITCHEN[0], KITCHEN[1], 0, 0, KITCHEN[2], KITCHEN[3]), _tiles(TILE_WHITE, 0.45), out, FLOOR_STEP)
    hx0, hx1, hz0, hz1 = HALL
    rustic = _shaded(_rustic, HALL, reach=1.2, dark=0.8)
    base._surface(rnd, (ANTE[1] - ANTE_TILES, ANTE[1], 0, 0, ANTE[2], ANTE[3]), rustic, out, 0.05, 0.004)   # (the hall's tiles start in the ante-room)
    base._surface(rnd, (hx0, NOTCH[1], 0, 0, NOTCH[2], hz1), rustic, out, 0.05, 0.004)
    base._surface(rnd, (NOTCH[1], hx1, 0, 0, WC[2], hz1), rustic, out, 0.05, 0.004)
    base._surface(rnd, (NOTCH[1], WC[0], 0, 0, hz0, WC[2]), rustic, out, 0.05, 0.004)
    # (the toilets' hall, from the half wall on: grey cement, as in the toilets)
    base._surface(rnd, (WC[0], WC[1], 0, 0, 0, WC[2]), _shaded(_cement(WC_FLOOR), (WC[0] - 2, WC[1], 0, WC[2])), out, FLOOR_STEP)
    # (the deck outside the door: the same grey cement in the sun, not boards)
    base._surface(rnd, (*DECK[:2], -STEP_DOWN, -STEP_DOWN, *DECK[2:]), _cement(SUNLIT, joint=1.5, cloud=0.02), out, 0.04)   # (finer: the map's end)
    # (a step down to it at the front door; inside, a landing a step up across the front wall, its
    # edge dark)
    base._surface(rnd, (RECEPTION[0], RECEPTION[0], -STEP_DOWN, 0.0, *DECK[2:]), CEMENT, out, 0.02)
    lx = RECEPTION[0] + LANDING[0]
    base._surface(rnd, (RECEPTION[0], lx, LANDING[1], LANDING[1], 0.05, 3.95), _cement(POLISHED, joint=2.0, cloud=0.008), out, 0.03)
    base._surface(rnd, (lx, lx, 0.0, LANDING[1], 0.05, 3.95), (0.17, 0.11, 0.08), out, 0.015)
    base._surface(rnd, (lx - 0.05, lx, LANDING[1] + 0.002, LANDING[1] + 0.002, 0.05, 3.95), (0.17, 0.11, 0.08), out, 0.015)   # (its dark nosing)
    # (outside the door, daylight: a yellow line painted along the threshold, orange steps down off
    # the deck's far edge, and the bright street beyond)
    base._surface(rnd, (RECEPTION[0] - 0.12, RECEPTION[0] - 0.07, -STEP_DOWN + 0.002, -STEP_DOWN + 0.002, *DECK[2:]), (0.86, 0.72, 0.22), out, 0.012)
    for k in range(3):
        base._surface(rnd, (DECK[0] + 0.3 * k, DECK[0] + 0.3 * k + 0.06, -STEP_DOWN + 0.002, -STEP_DOWN + 0.002, 0.8, 3.2), (0.86, 0.50, 0.26), out, 0.02)
        base._surface(rnd, (DECK[0] + 0.3 * k + 0.06, DECK[0] + 0.3 * (k + 1), -STEP_DOWN + 0.002, -STEP_DOWN + 0.002, 0.8, 3.2), (0.93, 0.62, 0.36), out, 0.03)
    base._surface(rnd, (DECK[0] - 0.3, DECK[0] - 0.3, -STEP_DOWN, H, -0.5, 4.5), (0.96, 0.95, 0.92), out, 0.06)
    # (the ante-room's jute ceiling hangs under a black one: the page draws it, from fixtures())
    base._surface(rnd, (ANTE[0], ANTE[1], H, H, ANTE[2], ANTE[3]), base.finish("plaster", (0.12, 0.12, 0.12)), out, CEIL_STEP)
    base._surface(rnd, (*RECEPTION[:2], H, H, *RECEPTION[2:]), base.finish("plaster", DARK_CEILING), out, CEIL_STEP)
    base._surface(rnd, (*KITCHEN[:2], H, H, *KITCHEN[2:]), base.finish("plaster", CEILING), out, CEIL_STEP)
    for (x0, x1, z0, z1) in ((hx0, NOTCH[1], NOTCH[2], hz1), (NOTCH[1], hx1, hz0, hz1), (hx1, STAGE[1], 0, WC[2])):
        base._surface(rnd, (x0, x1, H, H, z0, z1), _rough(CONCRETE), out, CEIL_STEP)
    skylight(rnd, out)

    # the long straight wall on the left (z = 0): the reception's door is at the deck end
    wall_x(0.0, RECEPTION[0], RECEPTION[1], [], _washed(wall, [x for x, z in RECEPTION_LAMPS if z == 0.0]), out, rnd)
    green_x(rnd, 0.0, VERTICAL[0], VERTICAL[1], +1, out)
    spots = ANTE_SPOTS
    wall_x(0.0, ANTE[0], ANTE[1], [], _washed(wall, spots), out, rnd)   # (the ante-room's walls: white plaster, uplit)
    # (near its end, a tall terracotta oval against the wall, woven in upright strands, and a
    # red-orange lamp like an eye just over it)
    ax, r, cy, hh = ANTE[1] - 1.6, 0.36, 1.05, 0.95
    _paint(rnd, out, ax - r, ax + r, cy - hh, cy + hh, 0.03,
           lambda x, y: ((x - ax) / r) ** 2 + ((y - cy) / hh) ** 2 < 1,
           lambda x, y: tuple(v * (0.8 if (x - ax) % 0.06 < 0.012 else 1.0) for v in TERRACOTTA_ARCH), step=0.015)
    ex, ey = ax + 0.15, cy + hh + 0.3
    def eye(x, y):
        u = ((x - ex) / 0.2) ** 2 + ((y - ey) / 0.09) ** 2
        return WARM if u < 0.15 else (0.90, 0.40, 0.18) if u < 0.6 else (0.55, 0.15, 0.08)
    _paint(rnd, out, ex - 0.2, ex + 0.2, ey - 0.09, ey + 0.09, 0.03,
           lambda x, y: ((x - ex) / 0.2) ** 2 + ((y - ey) / 0.09) ** 2 < 1, eye, step=0.012)
    # the right side of the reception (a dark door near the front), the vertical garden (green both
    # sides) and the ante-room; the kitchen behind
    wall_x(4.0, RECEPTION[0], RECEPTION[1], [(-18.7, -17.8, 0.0, 2.2)], _washed(wall, [x for x, z in RECEPTION_LAMPS if z == 4.0]), out, rnd)
    door_x(4.0, -18.7, -17.8, out, rnd, colour=(0.10, 0.09, 0.08), frame=(0.14, 0.12, 0.11))
    # (beside it: an exit sign, a white notice and a small red fire sign)
    base._surface(rnd, (-17.15, -16.94, 1.45, 1.75, 3.988, 3.988), (0.94, 0.94, 0.92), out, 0.012)
    base._surface(rnd, (-17.47, -17.33, 1.45, 1.65, 3.988, 3.988), (0.80, 0.15, 0.12), out, 0.012)
    base._surface(rnd, (-17.42, -17.38, 1.5, 1.6, 3.986, 3.986), (0.95, 0.95, 0.93), out, 0.008)
    wall_x(4.0, VERTICAL[0], VERTICAL[1], [], wall, out, rnd)
    green_x(rnd, 4.0, VERTICAL[0], VERTICAL[1], -1, out)
    # (its curtains, spotlights, the reception's track light, exit signs and speaker: FITTINGS)
    for z, side in ((0.0, 1), (4.0, -1)):             # (a wooden post where each white wall meets the green one)
        x, f = RECEPTION[1], z + side * 0.08
        base._surface(rnd, (x - 0.1, x + 0.1, 0.0, H, f, f), _boards(LIGHT_WOOD, width=0.1), out, 0.02)
        for e in (x - 0.1, x + 0.1):
            base._surface(rnd, (e, e, 0.0, H, min(z, f), max(z, f)), LIGHT_WOOD, out, 0.02)
    wall_x(4.03, ANTE[0], ANTE[1], [], _tiles(TILE_WHITE, 0.2, across=1), out, rnd)  # (the kitchen's side)
    wall_x(3.98, ANTE[0], ANTE[1], [], _washed(wall, spots), out, rnd)
    kitchen(rnd, out)
    # the front: the deck and the reception's tall door. Inside, the wall is clad in rust-brown
    # panels to the ceiling, the door's two big leaves the same: the one on the left (from inside)
    # shut, the one on the right swung in
    wall_z(RECEPTION[0], 0.0, 4.0, [(0.8, 3.2, 0.0, 2.9)], wall, out, rnd)
    wall_z(RECEPTION[0] + 0.02, 0.0, 3.7, [(0.8, 3.2, 0.0, 2.9)], _cladding, out, rnd, step=0.03)
    base._surface(rnd, (RECEPTION[0] + 0.02, RECEPTION[0] + 0.02, LANDING[1], 2.85, 2.3, 3.2), _cladding, out, 0.03)
    leaf(rnd, out, RECEPTION[0] + 0.02, 0.8, 1.2, math.radians(70))
    # (the reception runs straight into the vertical garden, wall to wall and floor to ceiling; a
    # wide doorway from there into the ante-room)
    wall_z(VERTICAL[1], 0.0, 4.0, [INTO_ANTE + (0.0, 2.9)], wall, out, rnd)
    frame_z(VERTICAL[1], *INTO_ANTE, 0.0, 2.9, out, rnd, colour=WALNUT, t=0.1, d=0.14)
    # the ante-room into the hall (where the hall is narrower), the kitchen's back wall beside it
    wall_z(0.0, 0.0, 4.0, [(NOTCH[2] + 0.2, 4.0 - 0.2, 0.0, 2.9)], hall_wall, out, rnd)
    frame_z(0.0, NOTCH[2] + 0.2, 4.0 - 0.2, 0.0, 2.9, out, rnd, colour=TIMBER, t=0.16, d=0.2)   # (tall wooden posts)
    # the kitchen from the hall: a passage behind a partition clad in reeds, a serving hatch on a
    # stone sill along it, and the kitchen's lattice door at its end, open, swung in against its side
    wall_z(0.0, 4.0, hz1, [KITCHEN_DOOR + (0.0, 2.2), HATCH + (1.0, 2.1)], hall_wall, out, rnd)
    frame_z(0.0, *KITCHEN_DOOR, 0.0, 2.2, out, rnd, colour=DOOR_FRAME, t=0.07, d=0.04)
    a0, a1 = KITCHEN_DOOR
    base._surface(rnd, (-(a1 - a0), -0.06, 0.0, 2.2, a0 + 0.04, a0 + 0.04), _lattice, out, 0.02)
    base._surface(rnd, (-0.15, 0.3, 0.95, 1.0, *HATCH), base.finish("cement", (0.74, 0.71, 0.66)), out, 0.03)
    for x in (PARTITION - 0.04, PARTITION + 0.04):
        wall_z(x, HATCH[0] - 0.1, hz1, [], _reed_wall, out, rnd, h=2.6, step=0.03)
    base._surface(rnd, (PARTITION - 0.04, PARTITION + 0.04, 0.0, 2.6, HATCH[0] - 0.1, HATCH[0] - 0.1), TIMBER, out, 0.02)
    # where the hall widens: a beam across it in warm orange-brown wood, a strip of light along its
    # underside, and a post of the same wood down each side
    base._surface(rnd, (NOTCH[1] - 0.15, NOTCH[1] + 0.15, H - 0.32, H, 0.0, hz1), BEAM, out, 0.04)
    for z0, z1 in ((NOTCH[2], NOTCH[2] + 0.16), (hz1 - 0.16, hz1)):
        for x in (NOTCH[1] - 0.1, NOTCH[1] + 0.1):
            base._surface(rnd, (x, x, 0.0, H - 0.32, z0, z1), BEAM, out, 0.03)
        for z in (z0, z1):
            base._surface(rnd, (NOTCH[1] - 0.1, NOTCH[1] + 0.1, 0.0, H - 0.32, z, z), BEAM, out, 0.03)
    base._surface(rnd, (NOTCH[1] - 0.06, NOTCH[1] + 0.06, H - 0.325, H - 0.325, 0.05, hz1 - 0.05), (1.0, 0.72, 0.42), out, 0.02)

    # the hall: the notch on the left, the half wall, the toilets' hall and the stage beside it
    wc_wall = _wall(WC_WALL, skirting=None)
    wall_x(NOTCH[2], 0.0, NOTCH[1], [], hall_wall, out, rnd)
    wall_z(NOTCH[1], 0.0, NOTCH[2], [(0.2, NOTCH[2] - 0.2, 1.0, 2.3)], hall_wall, out, rnd)
    frame_z(NOTCH[1], 0.2, NOTCH[2] - 0.2, 1.0, 2.3, out, rnd, colour=GREY_FRAME, t=0.04)
    base._surface(rnd, (NOTCH[1] - 0.03, NOTCH[1] - 0.03, 1.0, 2.3, 0.2, NOTCH[2] - 0.2), _view, out, 0.04)
    wall_x(0.0, NOTCH[1], HALF_WALL[0], [PASSAGE[:2] + (0.0, 2.4)], hall_wall, out, rnd)
    side_room(rnd, out)
    wall_x(0.0, HALF_WALL[0], WC[1], [(a, b, 0.0, 2.2) for a, b in WC_DOORS], wc_wall, out, rnd)
    for a, b in WC_DOORS:
        open_door_x(0.0, a, b, out, rnd)
        m = (a + b) / 2                                # (a black plaque over each)
        base._surface(rnd, (m - 0.15, m + 0.15, 2.3, 2.4, 0.03, 0.03), (0.08, 0.08, 0.08), out, 0.015)
        base._surface(rnd, (m - 0.02, m + 0.02, 2.32, 2.38, 0.031, 0.031), (0.85, 0.85, 0.83), out, 0.01)
    toilets(rnd, out)
    hx, reach = HALF_WALL
    # (bare brick, to the ceiling, a square opening through it)
    for x in (hx - 0.1, hx + 0.1):
        wall_z(x, 0.0, reach, [(1.2, 1.9, 0.9, 1.6)], _brickwork(2), out, rnd, step=0.04)
    base._surface(rnd, (hx - 0.1, hx + 0.1, 0.0, H, reach, reach), _brickwork(0), out, 0.04)
    for (y0, y1, z0, z1) in ((0.9, 0.9, 1.2, 1.9), (1.6, 1.6, 1.2, 1.9), (0.9, 1.6, 1.2, 1.2), (0.9, 1.6, 1.9, 1.9)):
        base._surface(rnd, (hx - 0.1, hx + 0.1, y0, y1, z0, z1), (0.62, 0.40, 0.29), out, 0.03)
    sunk = [WC[1] - 2.2 + 0.7 * k for k in range(4)]   # (bare brick on the pergola's side, lit from lights sunk in the floor)
    wall_x(WC[2], WC[1] - 2.5, WC[1], [], _washed(_brickwork(0), sunk), out, rnd)
    for x in sunk:
        floor_lamp(rnd, out, x, WC[2] + 0.12, sunk=True)
    # the toilets' hall's end, the stage's side: bare brick
    wall_z(WC[1], 0.0, WC[2], [], _brickwork(2), out, rnd)
    # (and a small dark bar against it)
    base._surface(rnd, (WC[1] - 0.6, WC[1], 0.0, 1.05, 0.5, 2.1), (0.15, 0.13, 0.12), out, 0.03)
    dome_pendant(rnd, out, WC[1] - 0.45, 1.3, 2.2, 0.28, (0.80, 0.42, 0.16))   # (an orange dome over it)
    # the windows along the right: dark grey frames, linen curtains
    # (three sets of three, the same space between the sets; dark shutters behind the glass)
    windows, lights = hall_windows()
    w0, w1 = 1.0, 2.0
    wall_x(hz1, hx0, hx1, [(a, b, w0, w1) for a, b in windows], _washed(hall_wall, lights), out, rnd)
    for a, b in windows:
        frame_x(hz1, a, b, w0, w1, out, rnd, colour=GREY_FRAME, t=0.04)
        base._surface(rnd, (a, b, (w0 + w1) / 2 - 0.015, (w0 + w1) / 2 + 0.015, hz1 - 0.02, hz1 + 0.02), GREY_FRAME, out, 0.03)
        # (the sky through the top 40 cm; below, dark wooden shutters hinged at the top, kicked out)
        base._surface(rnd, (a, b, w0, w1, hz1 + 0.5, hz1 + 0.5), _view, out, 0.04)
        for k in range(7):
            y = w1 - 0.42 - 0.08 * (k + 1)
            base._surface(rnd, (a + 0.02, b - 0.02, y, y + 0.09, hz1 + 0.04 + 0.045 * k, hz1 + 0.04 + 0.045 * k), _shutters, out, 0.03)
    # (its curtains, tied back each side of each set of windows: fittings())
    # its end: wide open onto the pergola under a dark beam, sheer curtains drawn back each side (fittings()), a
    # column of bare brick at the corner with the toilets' hall
    base._surface(rnd, (hx1 - 0.15, hx1 + 0.15, 2.75, H, WC[2], hz1), (0.20, 0.20, 0.21), out, 0.04)
    cx, cz = hx1 + 0.05, WC[2] - 0.05
    for (a0, a1, b0, b1) in ((cx - 0.25, cx + 0.25, cz - 0.25, cz - 0.25), (cx - 0.25, cx + 0.25, cz + 0.25, cz + 0.25)):
        base._surface(rnd, (a0, a1, 0.0, H, b0, b1), _brickwork(0), out, 0.04)
    for x in (cx - 0.25, cx + 0.25):
        base._surface(rnd, (x, x, 0.0, H, cz - 0.25, cz + 0.25), _brickwork(2), out, 0.04)
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


LANTERN = (4.2, 3.6)                # the vertical garden's glass roof light: its foot, along x and across (nearly the whole room)


def skylight(rnd, out):
    """The vertical garden's ceiling, dark grey, round the opening its glass roof light stands over
    (the page draws the roof light, its timber and glass, from fixtures())."""
    x0, x1, z0, z1 = VERTICAL
    cx, cz, (lw, ld) = (x0 + x1) / 2, (z0 + z1) / 2, LANTERN
    for a0, a1, b0, b1 in _cut((x0, x1), (z0, z1), [(cx - lw / 2, cx + lw / 2, cz - ld / 2, cz + ld / 2)]):
        base._surface(rnd, (a0, a1, H, H, b0, b1), base.finish("plaster", DARK_CEILING), out, CEIL_STEP)


def _cylinder_y(rnd, out, x, y0, y1, z, r, colour, step=0.015):
    """A short upright cylinder, closed at the bottom (a socket or a cap on a ceiling)."""
    sc = [step * 0.8] * 3
    n, m = max(12, int(2 * math.pi * r / step)), max(1, int((y1 - y0) / step))
    for k in range(n):
        a = 2 * math.pi * k / n
        for j in range(m + 1):
            out.append(((x + r * math.cos(a), y0 + (y1 - y0) * j / m, z + r * math.sin(a)), colour, sc))
    for i in range(1, int(r / step) + 1):
        rr = r * i / int(r / step)
        q = max(6, int(2 * math.pi * rr / step))
        for k in range(q):
            a = 2 * math.pi * k / q
            out.append(((x + rr * math.cos(a), y0, z + rr * math.sin(a)), colour, sc))
    out.append(((x, y0, z), colour, sc))


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


def _paint(rnd, out, x0, x1, y0, y1, z, inside, colour, step=0.03):
    """Paint on a wall along x, just in front of it at z: splats where inside(x, y) holds."""
    for i in range(int((x1 - x0) / step)):
        for k in range(int((y1 - y0) / step)):
            x, y = x0 + (i + rnd.random()) * step, y0 + (k + rnd.random()) * step
            if inside(x, y):
                c = colour(x, y) if callable(colour) else colour
                out.append(((x, y, z), tuple(v + rnd.uniform(-0.02, 0.02) for v in c), [step * 0.75, step * 0.75, 0.004]))


def floor_lamp(rnd, out, x, z, sunk=False):
    """A small spotlight on the floor turned up at a wall: a black can and its warm face (or, sunk,
    only its lit face in the floor)."""
    if not sunk:
        base._cylinder(rnd, x, z, 0.04, 0.04, 0.0, 0.07, (0.22, 0.22, 0.23), out, top=False, step=0.02)
    y = 0.003 if sunk else 0.071
    for k in range(16):
        a, r = 2 * math.pi * k / 7, 0.036 * math.sqrt(k / 16)
        out.append(((x + r * math.cos(a), y, z + r * math.sin(a)), WARM, [0.018, 0.004, 0.018]))


def exit_sign(rnd, out, x, y, z, axis):
    """A green exit sign on a wall (along x if axis is 0, along z if 2), a white figure on it."""
    w, h = 0.32, 0.13
    if axis == 0:
        base._surface(rnd, (x - w / 2, x + w / 2, y, y + h, z, z), EXIT_GREEN, out, 0.015)
        base._surface(rnd, (x - 0.04, x + 0.04, y + 0.03, y + 0.1, z, z), (0.95, 0.95, 0.93), out, 0.01)
    else:
        base._surface(rnd, (x, x, y, y + h, z - w / 2, z + w / 2), EXIT_GREEN, out, 0.015)
        base._surface(rnd, (x, x, y + 0.03, y + 0.1, z - 0.04, z + 0.04), (0.95, 0.95, 0.93), out, 0.01)


def globe(rnd, out, x, y, z, r, colour):
    """A glass globe light: a ball of splats, lit."""
    n = int(4 * math.pi * r * r / 0.0004)
    for _ in range(n):
        u, a = rnd.uniform(-1, 1), rnd.uniform(0, 2 * math.pi)
        q = math.sqrt(1 - u * u)
        out.append(((x + r * q * math.cos(a), y + r * u, z + r * q * math.sin(a)), colour, [0.02, 0.02, 0.02]))


def dome_pendant(rnd, out, x, z, y, r, colour):
    """A dome lampshade hung on its cord from the ceiling, its lit bulb under it."""
    for k in range(8):
        t = k / 8 * math.pi / 2
        _ring(rnd, out, x, y + r * math.sin(t), z, r * math.cos(t), colour, 1, max(8, int(60 * math.cos(t))), 0.025)
    globe(rnd, out, x, y - 0.03, z, 0.05, WARM)
    base._surface(rnd, (x - 0.006, x + 0.006, y + r, H, z - 0.006, z + 0.006), STEEL, out, 0.02)


def open_door_x(z, a0, a1, out, rnd, h=2.2):
    """A doorway in a wall along x at z, in a reddish wooden frame, its dark door swung open to -z
    against the wall beside it (hinged at a0)."""
    frame_x(z, a0, a1, 0.0, h, out, rnd, colour=DOOR_FRAME, t=0.07, d=0.04)
    base._surface(rnd, (a0 + 0.02, a0 + 0.06, 0.0, h, z - (a1 - a0), z - 0.04), DOOR, out, 0.03)


def _mural(colour):
    """A wall painted with big monstera leaves in greens, from (x0, y0) along z and up (the
    ladies' room's, on its far wall)."""
    leaves = ((-1.0, 1.2, 0.75, 0.3), (-1.9, 1.9, 0.6, -0.4), (-0.4, 2.0, 0.5, 0.6), (-1.5, 0.6, 0.55, 1.1))
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


def _lattice(x, y, z, rnd):
    """A cubicle's door: dark wood in a fine diagonal lattice."""
    u = (x + z + y) % 0.06 < 0.012 or (x + z - y) % 0.06 < 0.012
    return (0.13, 0.08, 0.05) if u else (0.33, 0.21, 0.13)


def _ring(rnd, out, cx, cy, cz, r, colour, axis, n=40, s=0.02):
    """A ring of splats round (cx, cy, cz), radius r, in the plane across `axis` (0 x, 1 y, 2 z)."""
    for k in range(n):
        a = 2 * math.pi * k / n
        u, v = r * math.cos(a), r * math.sin(a)
        p = [(cx, cy + u, cz + v), (cx + u, cy, cz + v), (cx + u, cy + v, cz)][axis]
        out.append((p, colour, [s, s, s]))


def toilets(rnd, out):
    """The toilets behind the toilets' hall's left wall, as the walkthrough shows them: grey walls
    under a white ceiling with downlights, a cement floor, small windows high on the far wall. The
    ladies': a wooden counter with two white bowls and round mirrors, two cubicles with lattice
    doors, big leaves painted on the far wall. The gents': a long steel trough with a wooden shelf
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
    wall_z(lx0, z0, z1, [], grey, out, rnd, h=WC_CEILING)
    wall_z(gx1, z0, z1, [], two_tone, out, rnd, h=WC_CEILING)
    wall_z(lx1 - 0.01, z0, z1, [], _mural(WC_GREY), out, rnd, h=WC_CEILING)   # (the ladies' side)
    wall_z(lx1 + 0.01, z0, z1, [], two_tone, out, rnd, h=WC_CEILING)
    # (its counter, bowls, mirrors, cubicles, globe lights and downlights: fittings())
    # (kept, for the map, where they stand: the counters, the trough, the cubicles' panels and toilets)
    with base.as_decor(out):
        stand = (0.30, 0.19, 0.12)
        base._surface(rnd, (lx0, lx0 + 0.5, 0.78, 0.84, -2.6, -0.5), stand, out, 0.03)
        base._surface(rnd, (gx1 - 0.5, gx1, 0.78, 0.84, -2.3, -1.0), stand, out, 0.03)
        base._surface(rnd, (gx0 + 0.3, gx0 + 2.5, 0.45, 0.85, z0, z0 + 0.35), stand, out, 0.03)
        for x in (lx0 + 1.0, lx0 + 2.1, gx1 - 1.2):
            base._surface(rnd, (x, x, 0.15, 2.1, z0, -2.65), stand, out, 0.03)
        for x in (lx0 + 1.55, lx0 + 2.65, gx1 - 0.6):
            base._surface(rnd, (x - 0.19, x + 0.19, 0.0, 0.42, z0, z0 + 0.62), stand, out, 0.025)
    # (and a white baby-changing counter against the painted wall, its pad on top)
    base._surface(rnd, (lx1 - 0.6, lx1 - 0.02, 0.0, 0.9, -2.45, -1.75), (0.93, 0.93, 0.92), out, 0.03)
    base._surface(rnd, (lx1 - 0.55, lx1 - 0.07, 0.9, 0.96, -2.4, -1.8), (0.82, 0.76, 0.82), out, 0.02)
    # the gents': a tiled splashback behind its basin (the trough, the cubicle, the counter: fittings())
    base._surface(rnd, (gx1 - 0.01, gx1 - 0.01, 0.84, 1.3, -2.3, -1.0), _tiles((0.70, 0.66, 0.60), 0.05, across=2), out, 0.02)


def _two_tone(lower, upper, at):
    """A wall painted one colour below `at` and another above."""
    lo, up = _wall(lower, skirting=None), _wall(upper, skirting=None)
    return base.finish("plaster", lambda x, y, z, rnd: lo(x, y, z, rnd) if y < at else up(x, y, z, rnd))


def _reed_wall(x, y, z, rnd):
    """Woven reed cladding: thin stalks standing side by side, each its own straw shade."""
    r = random.Random(math.floor(z / 0.012))
    t = r.uniform(-0.08, 0.06) + 0.03 * math.sin(y * 9 + r.random() * 6)
    return (REED[0] + t, REED[1] + t, REED[2] + t * 0.8)


def _louvres(x, y, z, rnd):
    """A louvred door in dark wood: slats 4 cm, a light line between them, a stile round them."""
    return (0.42, 0.30, 0.20) if y % 0.04 < 0.008 else (0.24, 0.15, 0.10)


def side_room(rnd, out):
    """The small room off the hall (the walkthrough at 1:22-1:33): from the hall's left wall where
    the notch ends, a short passage to a louvred double door (swung in), then a room with beige
    walls, dark stone tiles and wooden glass doors onto a planted patio. The kitchen's staff come in
    this way; the venue stops at the glass doors, the patio only seen through them (faint: the map
    leaves it out; the page draws its plants, from fixtures())."""
    a, b, end = PASSAGE
    x0, x1, z0, z1 = SIDE
    beige = _wall((0.66, 0.58, 0.47))
    floor = _tiles((0.30, 0.26, 0.23), 0.5, grout=(0.22, 0.19, 0.17))
    base._surface(rnd, (a, b, 0, 0, end, 0.0), floor, out, FLOOR_STEP)
    base._surface(rnd, (a, b, WC_CEILING, WC_CEILING, end, 0.0), base.finish("plaster", CEILING), out, CEIL_STEP)
    for x in (a, b):
        wall_z(x, end, 0.0, [], _wall(HALL_WALL), out, rnd, h=WC_CEILING)
    frame_x(0.0, a, b, 0.0, 2.4, out, rnd, colour=DOOR_FRAME, t=0.07, d=0.04)
    frame_x(end, a, b, 0.0, 2.3, out, rnd, colour=DOOR_FRAME, t=0.07, d=0.04)
    for x in (a + 0.02, b - 0.06):                   # the louvred leaves, swung into the room
        base._surface(rnd, (x, x + 0.04, 0.0, 2.25, end - (b - a) / 2, end - 0.04), _louvres, out, 0.02)
    base._surface(rnd, (x0, x1, 0, 0, z0, z1), _shaded(floor, SIDE), out, FLOOR_STEP)
    base._surface(rnd, (x0, x1, WC_CEILING, WC_CEILING, z0, z1), base.finish("plaster", CEILING), out, CEIL_STEP)
    wall_z(x0, z0, z1, [], beige, out, rnd, h=WC_CEILING)
    wall_z(x1, z0, z1, [], beige, out, rnd, h=WC_CEILING)
    wall_x(z1, x0, x1, [(a, b, 0.0, 2.3)], beige, out, rnd, h=WC_CEILING)
    ga, gb = GARDEN_DOOR
    wall_x(z0, x0, x1, [(ga, gb, 0.0, 2.4)], beige, out, rnd, h=WC_CEILING)
    wood = (0.42, 0.28, 0.18)
    frame_x(z0, ga, gb, 0.0, 2.4, out, rnd, colour=wood, t=0.08, d=0.1)
    m = (ga + gb) / 2
    for x in (m - 0.04, m, ga + (m - ga) / 2, m + (gb - m) / 2):        # the leaves' stiles and their bars
        base._surface(rnd, (x - 0.025, x + 0.025, 0.0, 2.4, z0 - 0.02, z0 + 0.02), wood, out, 0.02)
    for y in (0.05, 0.9, 2.35):
        base._surface(rnd, (ga, gb, y, y + 0.06, z0 - 0.02, z0 + 0.02), wood, out, 0.02)
    # (the glass, and the patio's terracotta through it: seen, not walked)
    for i in range(int((gb - ga) / 0.05)):
        for k in range(int(2.4 / 0.05)):
            out.append(((ga + (i + rnd.random()) * 0.05, (k + rnd.random()) * 0.05, z0), (0.80, 0.86, 0.87), [0.03, 0.03, 0.005], 0.12))
    for i in range(int((x1 - x0) / 0.1)):
        for k in range(int(2.0 / 0.1)):
            c = tuple(v + rnd.uniform(-0.03, 0.03) for v in (0.52, 0.33, 0.24))
            out.append(((x0 + (i + rnd.random()) * 0.1, 0.0, z0 - (k + rnd.random()) * 0.1), c, [0.07, 0.005, 0.07], FAR))


def kitchen(rnd, out):
    """The kitchen, as Gabriel's frame of it shows it: white tiles up its walls, a high row of
    windows in dark wooden frames on its outside wall (frosted, some panes tipped open) over
    stainless sinks; a stove under a steel hood in the middle, its duct to the wall; a tall white
    fridge; two dark doors in its far wall, the staff's way out (to the room by the hall's louvred
    door)."""
    x0, x1, z0, z1 = KITCHEN
    windows = [(x0 + 0.6 + 1.5 * k, x0 + 1.8 + 1.5 * k) for k in range(5)]
    w0, w1 = 1.4, 2.5
    frame = (0.30, 0.20, 0.15)
    wall_x(z1, x0, x1, [(a, b, w0, w1) for a, b in windows], _tiles(TILE_WHITE, 0.2, across=1), out, rnd)
    for k, (a, b) in enumerate(windows):
        frame_x(z1, a, b, w0, w1, out, rnd, colour=frame, t=0.05)
        for m in (1, 2):
            x = a + (b - a) * m / 3
            base._surface(rnd, (x - 0.02, x + 0.02, w0, w1, z1 - 0.02, z1 + 0.02), frame, out, 0.03)
        base._surface(rnd, (a, b, (w0 + w1) / 2 - 0.02, (w0 + w1) / 2 + 0.02, z1 - 0.02, z1 + 0.02), frame, out, 0.03)
        base._surface(rnd, (a, b, w0, w1, z1 + 0.03, z1 + 0.03), (0.86, 0.88, 0.88), out, 0.04)    # (frosted)
        if k % 2 == 0:                               # a pane tipped open into the room
            base._surface(rnd, (a + 0.05, a + (b - a) / 3 - 0.05, w0 + 0.42, w0 + 0.46, z1 - 0.3, z1 - 0.02), (0.84, 0.86, 0.86), out, 0.02)
    wall_z(x0, z0, z1, [(4.4, 5.3, 0.0, 2.2), (6.4, 7.3, 0.0, 2.2)], _tiles(TILE_WHITE, 0.2, across=2), out, rnd)
    door_z(x0, 4.4, 5.3, out, rnd)
    door_z(x0, 6.4, 7.3, out, rnd)
    steel = (0.70, 0.71, 0.72)
    # the sinks along the windows' wall: a steel top with a basin in it, an upstand, a shelf below
    base._surface(rnd, (x0 + 0.6, x0 + 5.6, 0.86, 0.9, z1 - 0.65, z1), steel, out, 0.03)
    base._surface(rnd, (x0 + 0.6, x0 + 5.6, 0.9, 1.05, z1 - 0.03, z1), steel, out, 0.03)
    base._surface(rnd, (x0 + 0.6, x0 + 5.6, 0.15, 0.17, z1 - 0.6, z1), (0.62, 0.63, 0.64), out, 0.04)
    for x in (x0 + 1.4, x0 + 3.9):
        base._surface(rnd, (x - 0.3, x + 0.3, 0.9, 0.9, z1 - 0.55, z1 - 0.1), (0.45, 0.46, 0.47), out, 0.02)
    # the stove in the middle, on a steel frame, under its hood; the duct along the ceiling
    cx, cz = x0 + 6.5, (z0 + z1) / 2
    base._surface(rnd, (cx - 0.5, cx + 0.5, 0.82, 0.86, cz - 0.45, cz + 0.45), (0.22, 0.22, 0.23), out, 0.03)
    base._surface(rnd, (cx - 0.5, cx + 0.5, 0.2, 0.22, cz - 0.45, cz + 0.45), steel, out, 0.04)
    base._surface(rnd, (cx - 0.8, cx + 0.8, 2.25, 2.5, cz - 0.7, cz + 0.7), steel, out, 0.04)
    base._surface(rnd, (cx - 0.3, cx + 0.3, 2.5, H, cz - 0.3, cz + 0.3), steel, out, 0.04)
    base._surface(rnd, (x0, cx - 0.3, H - 0.4, H - 0.1, cz - 0.15, cz + 0.15), steel, out, 0.04)
    # the fridge against the ante-room's wall, near the far end
    base._surface(rnd, (x0 + 0.3, x0 + 1.05, 0.0, 1.9, z0, z0 + 0.72), (0.94, 0.94, 0.93), out, 0.03)


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
    for x in _strips():
        base._surface(rnd, (x - 0.05, x + 0.05, 0.6, 2.8, z1 - 0.02, z1 - 0.02), TIMBER, out, 0.02)
    # (its exit sign and the up-and-down lights between the strips: fittings())
    # the roof: beams across in orange-brown wood, two along under them, a post at each end of the
    # garden side (the reed matting over them, and the track lights on them: fittings())
    for x in _pergola_beams():
        base._surface(rnd, (x - 0.08, x + 0.08, PERGOLA_ROOF - 0.22, PERGOLA_ROOF, z0, z1), BEAM, out, 0.05)
    base._surface(rnd, (x0, x1, PERGOLA_ROOF - 0.22, PERGOLA_ROOF, z0, z0 + 0.16), BEAM, out, 0.05)
    for z in (z0 + (z1 - z0) / 3, z0 + 2 * (z1 - z0) / 3):
        base._surface(rnd, (x0, x1, PERGOLA_ROOF - 0.36, PERGOLA_ROOF - 0.22, z - 0.07, z + 0.07), BEAM, out, 0.05)
    for z in PIERS:                                  # (on the garden side, piers of bare brick)
        pier(rnd, out, x1 - 0.1, z, 0.18, PERGOLA_ROOF - 0.22)
    # 14: along its edge on the garden, a strip of irregular flagstones
    base._surface(rnd, (x1 - 0.7, x1, 0.004, 0.004, z0, z1), _flagstones, out, 0.03)


PIERS = (PERGOLA[2] + 0.2, PERGOLA[3] - 0.3)   # z: the brick piers on its garden side


def _strips():
    """x: the wooden strips up the pergola's wall, every 2.6 m."""
    x0, x1 = PERGOLA[:2]
    return [x0 + 1.6 + 2.6 * k for k in range(int((x1 - 2.0 - x0) / 2.6))]


def _pergola_beams():
    """x: the pergola's beams across it, five, the first and last at its ends."""
    x0, x1 = PERGOLA[:2]
    return [x0 + 0.1 + k * (x1 - x0 - 0.2) / 4 for k in range(5)]


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


def _garden_end(z):
    """Where the garden ends along x, at z across: its far side is slanted."""
    return GARDEN_X + GARDEN_RIGHT + (GARDEN_LEFT - GARDEN_RIGHT) * z / GARDEN_W


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
               keep=lambda x, z: x < _garden_end(z))
    # beside the pergola, to the garden's right wall
    base._surface(rnd, (PERGOLA[0], GARDEN_X, 0, 0, PERGOLA[3], GARDEN_W), _sand, out, LAWN_STEP)
    # its walls, along the left (on from the house's) and the right, and across beside the pergola,
    # 2 m high and painted near black, to where the sand starts; tropical beds along them behind a
    # kerb (planted all along: the page draws the borders in front of them, from fixtures())
    dark = _rough((0.17, 0.18, 0.17), 0.03)
    wall_x(0.0, GARDEN_X, _garden_end(0.0), [], dark, out, rnd, h=2.0)
    wall_x(GARDEN_W, PERGOLA[0], _garden_end(GARDEN_W), [], dark, out, rnd, h=2.0)
    wall_z(PERGOLA[0], PERGOLA[3], GARDEN_W, [], dark, out, rnd, h=2.0)
    # a cement path out from the pergola's corner into the sand
    base._surface(rnd, (GARDEN_X, GARDEN_X + 3.0, 0.006, 0.006, PERGOLA[3] - 1.7, PERGOLA[3] - 0.2), _cement(PERGOLA_FLOOR, joint=1.0), out, FLOOR_STEP)
    # the planted beds along the walls: the page draws them (tropical_border); here their tops, a metre
    # up and green, so the map keeps the body out of them
    for z0, z1, x0, x1 in ((0.0, 1.5, GARDEN_X, _garden_end(0.0) - 0.5), (GARDEN_W - 1.5, GARDEN_W, PERGOLA[0] + 0.3, _garden_end(GARDEN_W) - 0.5)):
        base._surface(rnd, (x0, x1, 1.0, 1.0, z0, z1), (0.20, 0.36, 0.17), out, 0.08)
    bungalow(rnd, out)
    sea_wall(rnd, out)
    for t in TREES:
        trunk(rnd, out, *t)


# the trees the walkthrough shows (x, z, the decor starter that draws it): a broad tree in the sand
# under the rain cover (its crown up through it), a big one beside the bungalow, two beach almonds at the sand's edge by the
# sea, and coconut palms standing up behind the garden's walls. The page draws them as it draws
# the decor (decor.js), from the fixtures make() writes; here only their trunks' feet, inside those,
# so the map walks round them
TREES = ((44.5, 3.2, "broad_tree"), (52.5, 10.8, "broad_tree"),
         (_garden_end(3.0) + 2.5, 3.0, "beach_almond"), (_garden_end(13.0) + 2.0, 13.0, "beach_almond"),
         (34.0, -1.4, "coconut_palm"), (47.0, -1.4, "coconut_palm"), (36.0, GARDEN_W + 1.4, "coconut_palm"))
TRUNK = {"small_tree": 0.05, "broad_tree": 0.1, "beach_almond": 0.1, "coconut_palm": 0.07}


def trunk(rnd, out, x, z, item):
    """A tree's trunk to 1.9 m, well inside the one the page draws over it (so it never shows)."""
    r, y = TRUNK[item], 0.0
    while y < 1.9:
        for k in range(10):
            a = 2 * math.pi * (k + rnd.random()) / 10
            out.append(((x + r * math.cos(a), y, z + r * math.sin(a)), (0.42, 0.36, 0.30), [0.03, 0.03, 0.03]))
        y += 0.05


def _far_side():
    """The garden's slanted far side, where it meets the beach: its ends, length, the way along it
    and the way in from it (toward the house)."""
    (ax, az), (bx, bz) = (GARDEN_X + GARDEN_RIGHT, 0.0), (GARDEN_X + GARDEN_LEFT, GARDEN_W)
    L = math.hypot(bx - ax, bz - az)
    return (ax, az), L, ((bx - ax) / L, (bz - az) / L), (-(bz - az) / L, (bx - ax) / L)


SEA_GAP = 0.12                          # the opening in the sea wall for the path down to the beach: either side of its middle, a share of its length


def sea_wall(rnd, out):
    """The low wall of dark stones along the garden's far side, between it and the beach (45 cm high,
    40 cm thick), open in the middle for the path; the page draws the clipped hedge along its top."""
    (ax, az), L, (tx, tz), (nx, nz) = _far_side()
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


def _along(item, x0, x1, z, turn, width, depth=0.0):
    """Copies of a decor starter `width` wide in a row along x from x0 to x1 at z, each stretched a
    little so the row fits; `depth` out from z (on the side it faces)."""
    n = max(1, math.ceil((x1 - x0) / width - 0.01))
    w = (x1 - x0) / n
    zz = z + depth * math.cos(turn)
    return [{"item": item, "at": [x0 + (k + 0.5) * w, 0.0, round(zz, 3)], "turn": turn, "scale": [round(w / width, 4), 1, 1]}
            for k in range(n)]


def hall_windows():
    """The hall's windows along its right wall, three sets of three the same space apart: each
    (x0, x1); and the x of the uplights between the sets and at the ends."""
    hx0, hx1 = HALL[:2]
    gap = (hx1 - hx0 - 3 * 3 * 1.1) / 4
    windows = [(hx0 + gap * (j + 1) + 3.3 * j + 1.1 * k, hx0 + gap * (j + 1) + 3.3 * j + 1.1 * (k + 1) - 0.08)
               for j in range(3) for k in range(3)]
    return windows, [hx0 + gap * (j + 0.5) + 3.3 * j for j in range(4)]


def fittings() -> list:
    """The way in's fittings, drawn by the page as the decor and furniture are (sample_room's
    FIXTURES): wooden skirting boards along the white walls, small floor spotlights, the
    reception's track light, exit signs, a speaker and the vertical garden's tied-back sheer
    curtains, the toilets' counters, mirrors and cubicles. Each (item, (x, y, z), turn, colour or None,
    length or its knobs or None); turn 0 faces +z."""
    out = []
    rx0, rx1 = RECEPTION[:2]
    ax0, ax1 = ANTE[:2]
    for x0, x1, z, turn in ((rx0, rx1, 0.0, 0.0), (rx0, -18.7, 4.0, math.pi), (-17.8, rx1, 4.0, math.pi),
                            (ax0, ax1, 0.0, 0.0), (ax0, ax1, 3.98, math.pi)):
        out.append(("skirting_board", ((x0 + x1) / 2, 0.0, z), turn, SKIRTING_BOARD, x1 - x0))
    out.append(("skirting_board", (ax1, 0.0, NOTCH[2] / 2 + 0.1), -math.pi / 2, SKIRTING_BOARD, NOTCH[2] + 0.2))
    lamps = [(x, z) for x, z in RECEPTION_LAMPS] + [(VERTICAL[0] + 0.75 + 1.0 * k, z) for k in range(4) for z in (0.0, 4.0)]
    lamps += [(x, z) for x in ANTE_SPOTS for z in (0.0, 4.0)]
    for x, z in lamps:
        out.append(("floor_spot", (x, 0.0, 0.15 if z == 0.0 else 3.85), 0.0 if z == 0.0 else math.pi, None, None))
    track = RECEPTION[1] - 0.2 - TRACK[0]
    out.append(("track_light", (TRACK[0] + track / 2, H - 0.24, TRACK[1]), 0.0, None, track))
    out += [("exit_sign", (-16.5, 2.25, 0.0), 0.0, EXIT_GREEN, None), ("exit_sign", (-17.4, 1.95, 4.0), math.pi, EXIT_GREEN, None),
            ("wall_speaker", (-15.3, 2.4, 0.0), 0.0, (0.07, 0.07, 0.07), None)]
    for x, turn in ((VERTICAL[0] + 0.2, -math.pi / 2), (VERTICAL[1] - 0.2, math.pi / 2)):
        out += [("sheer_curtain", (x, 0.0, z), turn, SHEER, None) for z in (0.5, 3.5)]
    # the ante-room's end wall: an exit sign and a speaker high up, beside the way into the hall
    out += [("exit_sign", (0.0, 2.4, 0.9), -math.pi / 2, EXIT_GREEN, None), ("wall_speaker", (0.0, 2.85, 1.3), -math.pi / 2, (0.07, 0.07, 0.07), None)]
    # the hall: skirting along its white walls (not the toilets' hall's), uplights, its curtains
    # tied back each side of each set of windows, short track lights on its ceiling
    hx0, hx1, _, hz1 = HALL
    nx, nz = NOTCH[1], NOTCH[2]
    pb = PASSAGE[1]
    for x0, x1, z, turn in ((hx0, hx1, hz1, math.pi), (hx0, nx, nz, 0.0), (pb, HALF_WALL[0], 0.0, 0.0)):
        out.append(("skirting_board", ((x0 + x1) / 2, 0.0, z), turn, SKIRTING_BOARD, x1 - x0))
    for z0, z1, x, turn in ((4.0, KITCHEN_DOOR[0], hx0, math.pi / 2), (0.0, nz, nx, math.pi / 2)):
        out.append(("skirting_board", (x, 0.0, (z0 + z1) / 2), turn, SKIRTING_BOARD, z1 - z0))
    windows, lights = hall_windows()
    out += [("floor_spot", (x, 0.0, hz1 - 0.15), math.pi, None, None) for x in lights]
    out += [("floor_spot", (hx0 + 0.3, 0.0, z), math.pi / 2, None, None) for z in (nz + 0.4, 3.6)]
    for j in range(3):
        a, b = windows[3 * j][0], windows[3 * j + 2][1]
        out += [("sheer_curtain", (c, 0.0, hz1 - 0.12), math.pi, SHEER, None) for c in (a - 0.3, b + 0.3)]
    for x, z in ((2.5, 4.0), (6.5, 2.6), (6.5, 6.4), (10.5, 2.6), (10.5, 6.4), (14.5, 2.6), (14.5, 6.4)):
        out.append(("track_light", (x, H - 0.24, z), 0.0, None, 1.2))
    out += [("sheer_curtain", (hx1 - 0.2, 0.0, z), -math.pi / 2, SHEER, None) for z in (WC[2] + 0.75, hz1 - 0.35)]
    # the pergola: its woven reed roof on the beams, black track lights along the middle beams,
    # up-and-down lights between the strips on its wall, an exit sign by the hall
    px0, px1, pz0, pz1 = PERGOLA
    out.append(("reed_roof", ((px0 + px1) / 2, PERGOLA_ROOF, (pz0 + pz1) / 2), 0.0, REED, {"w": round(px1 - px0, 3), "d": round(pz1 - pz0, 3)}))
    out += [("track_light", (x, PERGOLA_ROOF - 0.22 - 0.24, (pz0 + pz1) / 2), math.pi / 2, None, 2.0) for x in _pergola_beams()[1:4]]
    out += [("wall_sconce", (x + side, 2.3, pz1), math.pi, None, None) for x in _strips() for side in (-0.7, 0.7)]
    out.append(("exit_sign", (px0 + 2.4, 2.3, pz1), math.pi, EXIT_GREEN, None))
    # the sky over it all, blue as filmed (seen through the garden's glass cover, over the beach)
    out.append(("sky_dome", (GARDEN_X, -30.0, GARDEN_W / 2), 0.0, None, None))
    # the toilets: downlights in their ceilings; in the ladies' a wooden counter on the wall at the
    # door's left with two bowls and two round mirrors, two cubicles at the far end (the first one's
    # door open); in the gents' the trough on the far wall, a cubicle, a counter with one bowl and a
    # mirror on a strap; a green glass globe on the wall between them, on each side
    for x0, x1, z0, z1 in (LADIES, GENTS):
        out += [("downlight", (x, WC_CEILING - 0.02, z), 0.0, None, None) for x in (x0 + 0.9, x1 - 0.9) for z in (z0 + 1.0, z1 - 1.0)]
    lx0, lx1, z0, _ = LADIES
    gx0, gx1 = GENTS[:2]
    counter, lattice = (0.14, 0.08, 0.05), (0.18, 0.11, 0.07)
    out.append(("wash_counter", (lx0 + 0.25, 0.78, -1.55), math.pi / 2, counter, 2.1))
    out += [("round_mirror", (lx0, 1.22, z), math.pi / 2, None, None) for z in (-1.05, -2.05)]
    w = (lx1 - lx0 - 1.0) / 2
    out += [("toilet_cubicle", (lx0 + 1.0 + w * (k + 0.5), 0.0, (z0 - 2.6) / 2), 0.0, lattice, {"w": round(w, 3), "d": 1.4, "open": 1 - k}) for k in range(2)]
    out.append(("trough_urinal", (gx0 + 1.4, 0.0, z0 + 0.175), 0.0, (0.16, 0.16, 0.17), 2.2))
    out.append(("toilet_cubicle", (gx1 - 0.6, 0.0, (z0 - 2.7) / 2), 0.0, lattice, {"w": 1.2, "d": 1.3}))
    out.append(("wash_counter", (gx1 - 0.25, 0.78, -1.65), -math.pi / 2, counter, 1.3))
    out.append(("strap_mirror", (gx1, 1.29, -1.65), -math.pi / 2, None, None))
    out += [("globe_lamp", (lx1 - 0.01, 2.28, -1.6), -math.pi / 2, (0.80, 0.92, 0.74), None),
            ("globe_lamp", (lx1 + 0.01, 2.28, -1.6), math.pi / 2, (0.80, 0.92, 0.74), None)]
    return out


def fixtures() -> dict:
    """What the page is told besides the splat (room.py's map, in its metres): the trees, and the
    things it draws as it draws the decor (decor.js starters), so they look as the decor does: the
    planted walls, the borders along the garden's walls and the glass rain cover over it."""
    props = [{"item": item, "at": [x, 0.0, z]} for x, z, item in TREES]
    for item, at, turn, colour, length in fittings():
        t = {"item": item, "at": [round(v, 4) for v in at], "turn": round(turn, 4)}
        if colour:
            t["colour"] = base.hexed(colour)
        if isinstance(length, dict):
            t["opts"] = length
        elif length:
            t["opts"] = {"w": round(length, 3)}
        props.append(t)
    # the planted patio beyond the side room's glass doors
    props += _along("tropical_border", SIDE[0], SIDE[1], SIDE[2] - 2.0, 0.0, 2.0, 0.0)
    x0, x1 = VERTICAL[:2]
    props += _along("living_wall", x0, x1, 0.0, 0.0, 2.0, 0.15)
    props += _along("living_wall", x0, x1, 4.0, math.pi, 2.0, 0.15)
    # the vertical garden's glass roof light, a cluster of rattan lamps hung in it
    cx, cz = (x0 + x1) / 2, (VERTICAL[2] + VERTICAL[3]) / 2
    props += [{"item": "glass_lantern", "at": [cx, 0.0, cz], "scale": [round(LANTERN[0] / 4.5, 4), 1, round(LANTERN[1] / 4.0, 4)]},
              {"item": "gourd_pendants", "at": [cx, 0.45, cz], "scale": [1.2, 1.2, 1.2]}]
    # the jute ceilings: with black bands over the ante-room, plain over the stage
    for item, (a0, a1, b0, b1) in (("jute_ceiling", ANTE), ("jute_swags", STAGE[:4])):
        nx = max(1, round((a1 - a0) / 4.0))
        props += [{"item": item, "at": [round(a0 + (k + 0.5) * (a1 - a0) / nx, 3), 0.0, (b0 + b1) / 2],
                   "scale": [round((a1 - a0) / nx / 4.0, 4), 1, round((b1 - b0) / 4.0, 4)]} for k in range(nx)]
    # the beds along the garden's dark walls
    for z, turn, x0 in ((0.0, 0.0, GARDEN_X), (GARDEN_W, math.pi, PERGOLA[0])):
        props += _along("tropical_border", x0 + 0.3, _garden_end(z) - 0.5, z, turn, 2.0, 0.95)
    # climbers and bougainvillea falling over the pergola's edge on the garden
    px1, pz1 = PERGOLA[1], PERGOLA[3]
    props += [{"item": "hanging_greenery", "at": [px1 - 0.6, 0.3, z]} for z in (4.6, 7.0)]
    props += [{"item": "bougainvillea_cloud", "at": [px1 - 0.6, 0.3, pz1 - 1.0], "turn": round(math.pi / 2, 4)}]
    # rattan lamps hung down the middle of the glass cover, either side of the aisle
    props += [{"item": "wicker_pendant", "at": [round(GARDEN_X + 2.0 + 4.0 * k, 3), 0.5, GARDEN_W / 2 + side]}
              for k in range(int(COVER_LEN / 4.0)) for side in (-3.0, 3.0)]
    # plants round the bungalow's deck, at its ends and behind it
    bx0, bx1, bz0, bz1 = BUNGALOW
    for x, turn in ((bx0 - 1.0, -math.pi / 2), (bx1 + 1.0, math.pi / 2)):
        props += [{"item": "tropical_border", "at": [x, 0.0, round(bz0 + 1.2 + 2.0 * k, 3)], "turn": round(turn, 4)} for k in range(2)]
    # a low clipped hedge where the garden meets the beach, open in the middle for the path down to it
    # (on the low stone wall there)
    (ax, az), L, (tx, tz), (nx, nz) = _far_side()
    for k in range(int(L / 2.0)):
        u = (k + 0.5) * 2.0
        if abs(u / L - 0.5) > SEA_GAP + 0.04:
            props.append({"item": "tropical_border", "at": [round(ax + tx * u + 0.5 * nx, 3), 0.45, round(az + tz * u + 0.5 * nz, 3)],
                          "turn": round(-math.atan2(tz, tx), 4), "scale": [1, 0.35, 0.3]})
    # the fans on the walls: the hall's, between its sets of windows; the pergola's, on its far wall;
    # one on the brick column at the hall's end
    hx0, hx1, _, hz1 = HALL
    gap = (hx1 - hx0 - 3 * 3 * 1.1) / 4
    # (each 20 cm out from its wall: its bracket's depth)
    props += [{"item": "wall_fan", "at": [round(hx0 + gap * (j + 0.5) + 3.3 * j, 3), 2.0, hz1 - 0.2], "turn": round(math.pi, 4)} for j in (1, 2)]
    props += [{"item": "wall_fan", "at": [x, 2.0, PERGOLA[3] - 0.2], "turn": round(math.pi, 4)} for x in (20.6, 25.8)]
    props += [{"item": "wall_fan", "at": [round(hx1 + 0.5, 3), 2.0, round(WC[2] - 0.05, 3)], "turn": round(math.pi / 2, 4)}]
    # rattan lamps hung in the tree under the cover
    tx, tz = TREES[0][:2]
    props += [{"item": "wicker_pendant", "at": [round(tx + dx, 3), -0.2, round(tz + dz, 3)]} for dx, dz in ((-1.2, 0.5), (0.9, 1.0), (0.2, -0.9))]
    # pink flowering shrubs at the foot of the pergola's corner pier by the garden
    props += [{"item": "pink_shrub", "at": [round(PERGOLA[1] + 0.6, 3), 0.0, round(z, 3)]} for z in (PIERS[1] - 0.9, PIERS[1] + 0.6)]
    # agaves along the bungalow's front, either side of its steps
    bx0, bx1, bz0, bz1 = BUNGALOW
    props += [{"item": "agave", "at": [round(x, 3), 0.0, round(z, 3)]}
              for x, z in ((bx0 + 0.8, bz0 - 0.6), (bx0 + 2.6, bz0 - 0.6), (bx1 - 2.6, bz0 - 0.6), (bx1 - 0.8, bz0 - 0.6))]
    # fans on the brick piers, turned to the garden
    props += [{"item": "wall_fan", "at": [round(PERGOLA[1] + 0.28, 3), 2.0, round(z, 3)], "turn": round(math.pi / 2, 4)} for z in PIERS]
    bays = round(COVER_LEN / 3.3)
    props += [{"item": "glass_roof", "at": [round(GARDEN_X + (k + 0.5) * COVER_LEN / bays, 3), 0.0, GARDEN_W / 2],
               "scale": [round(COVER_LEN / bays / 3.3, 4), 1, 1]} for k in range(bays)]
    return {"trees": props}


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
    timber, posts and beams, no walls and no roof."""
    x0, x1, z0, z1 = BUNGALOW
    h, top = DECK_UP, 2.7
    base._surface(rnd, (x0, x1, h, h, z0, z1), _boards(DECK_WOOD, gap=(0.20, 0.13, 0.10), width=0.15), out, FLOOR_STEP)
    for (a, b, c, d) in ((x0, x1, z0, z0), (x0, x1, z1, z1), (x0, x0, z0, z1), (x1, x1, z0, z1)):
        base._surface(rnd, (a, b, 0.0, h, c, d), (0.30, 0.21, 0.15), out, 0.03)
    # (a wooden step up to it in the middle of its front, from the garden's aisle)
    cx = (x0 + x1) / 2
    base._surface(rnd, (cx - 0.7, cx + 0.7, 0.0, h / 2, z0 - 0.35, z0), DECK_WOOD, out, 0.03)
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
