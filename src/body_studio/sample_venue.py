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

VERSION = 34
PLY = "wedding_venue_clean.ply"
SEED = 23

H = 3.4                             # the ceiling, everywhere under a roof
HALL = (0.0, 17.8, 0.0, 8.6)        # x0, x1, z0, z1
NOTCH = (0.0, 5.0, 1.5)
BEAM_GAP = 0.3                      # the beam where the hall widens stops this far under the ceiling (white wall over it)             # the hall's first 5 m are 1.5 m narrower on the left
HALF_WALL = (11.3, 3.24)            # x, how far it comes out from the left wall
TILES_END = 10.0                    # x: where the hall's rustic tiles give way to grey cement (the walkthrough at 1:45)
FIREPLACE = (2.2, 2.85, 0.85, 1.3)  # in its hall side: z0, z1, y0, y1
PICTURE = (0.55, 1.45, 1.05, 1.95)   # beside it: z0, z1, y0, y1
TO_STAGE, TO_STAGE_TOP = (0.2, 1.5), 2.4   # z: the passage from the toilets' hall's end to the stage, and its height
COUNTER_Z = (0.6, 1.9)                 # z: the black counter before it
SINK_Z = 2.45                          # z: the sink cabinet against that end wall
PIER = (17.85, 3.15)                   # the brick pier at the corner of the hall, the toilets' hall and the pergola
CHANGING = (11.3, 11.85, -3.0, -2.2)    # the ladies' changing table against its left wall, past the grey wall: x0, x1, z0, z1
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
BOARD = 4.0                             # m: the longest skirting board laid in one piece
KITCHEN_WAY_OUT = (6.65, 7.5)           # z: the open doorway in its far wall, out of the house
KITCHEN_DOORS = ((4.5, 5.4), (7.7, 8.4))  # z: its far wall's doors either side of that (a brown one, a maroon one)
KITCHEN_DOOR = (6.4, 7.3)               # z: its door on the hall, beside the hatch, its leaf swung out across the passage
PASSAGE_DOOR = (1.25, 8.55, 0.85, math.radians(50))   # the passage's dark panelled door at its end: its hinge (x, z), width, how far open
HATCH = (4.9, 6.2)                      # z: its serving hatch on the hall, 1 m up, in a deep white surround
PARTITION = 1.3                         # x: the reed-clad partition between the hall and that passage
VERTICAL = (-13.8, -9.3, 0.0, 4.0)
INTO_ANTE = (0.35, 3.65)                # z: the wide opening from it into the ante-room, between its planted walls
RECEPTION = (-19.8, -13.8, 0.0, 4.0)
DECK = (-21.8, -19.8, 0.0, 4.0)
RECEPTION_LAMPS = ((-17.6, 0.0), (-15.8, 4.0))   # its floor spotlights: x, the wall they light
TRACK = (-16.8, 1.85)                   # its track light's socket on the ceiling: x, z
STEP_DOWN = 0.08                    # the deck is a step down from the reception's floor (the map's floor is within 10 cm)
FRONT_LEAVES = ((2.3, 0.84, math.radians(6)), (0.8, 1.2, math.radians(70)))   # the front door's leaves: where each pivots (z), how wide, how far swung in
LANDING_GREY = (0.42, 0.44, 0.46)   # its top: the floor's cement, lighter in the door's light
LANDING = (1.25, 0.08)              # inside the front door: a landing across the front wall, how deep (the open leaf fits on it), how high
BUNGALOW = (41.5, 50.5, 12.7, 17.5)
DECK_UP = 0.09                      # its deck, a step up off the sand (any higher and the map no longer sees a floor there)
LADIES = (11.3, 14.5, -4.0, 0.0)        # the toilets, behind the toilets' hall's left wall: x0, x1, z0, z1
GENTS = (14.5, 18.6, -4.0, 0.0)
WC_DOORS = ((13.0, 13.9), (15.2, 16.1))
LADIES_SCREEN, LADIES_SCREEN_FROM = -1.65, 12.6  # z of the ladies' grey wall across the room, and where it starts (x; it runs to the right wall)
LADIES_STALLS = (13.1, -1.8, 3)                   # its cubicles in a row along its right wall: their fronts' x, the first's side (z), how many
WC_CEILING = 2.8
CORRIDOR = (1.4, 1.4)                   # on from the notch's step (left open) to the side room: x where it ends, how wide (z from 0)
SIDE = (0.0, 6.0, -3.6, 0.0)            # the small room behind it, through its louvred double door
SIDE_DOOR = (1.75, 2.75)                # x: that door, in the corridor's wall just past the corner
GARDEN_DOOR = (2.4, 4.0)                # x: the room's glass doors onto a planted patio (where the venue stops), across from it
SIDE_TILE = (0.08, 0.065, 0.055)         # its stone tiles and the corridor's (dark: a floor drawn as the furniture is is lit brighter)
OUT_WAY = 10.6                          # z: the outside passage's far side, from the kitchen's yard along the hall's
                                        # windows to the pergola (as far out as the pergola goes)
OUT_DOOR = (9.15, 10.05)                # z: its wooden door onto the pergola, in the wall beside the hall's end
BEACH = 8.0                         # m of dry sand from the garden's far side to the water
SEA = 130.0                         # m out to the island across the channel

FLOOR_STEP, WALL_STEP, CEIL_STEP, LAWN_STEP = 0.055, 0.07, 0.09, 0.085

# colours as the walkthrough videos show them (Gabriel's mum's, 2026-10-24), measured from the
# frames and evened out for the camera's exposure
CEMENT = (0.66, 0.66, 0.65)         # the smooth grey floors: the ante-room's step
HALL_CEMENT = (0.60, 0.59, 0.57)    # the hall's far end, past its tiles
WC_FLOOR = (0.53, 0.53, 0.52)       # the toilets' and their hall's grey cement, a shade darker
POLISHED = (0.40, 0.43, 0.47)       # the reception's, the vertical garden's and the ante-room's: one cement, a cool
                                    # grey (Gabriel: the same all along; it only looks lighter where more light comes in)
SUNLIT = (0.62, 0.63, 0.63)         # the same cement out on the deck, in the sun
PERGOLA_FLOOR = (0.50, 0.52, 0.54)  # the pergola's, a darker blue-grey
ROUGH = (0.70, 0.67, 0.63)          # rough cement: the pergola's wall
CEILING = (0.95, 0.94, 0.91)
DARK_CEILING = (0.58, 0.58, 0.57)   # the reception's and the vertical garden's, painted mid grey (drawn
                                    # facing down, out of the light, it shows darker: as the video's)
SLAB = POLISHED                     # the ante-room's slabs: the same cement
WC_GREY = (0.60, 0.61, 0.63)        # the toilets' walls
RUST = (0.31, 0.18, 0.13)           # the front door's pivoting leaves
CONCRETE = (0.60, 0.58, 0.55)       # the hall's ceiling, bare concrete, a mid warm grey (dim, as filmed)
HALL_WALL = (0.88, 0.88, 0.87)
WC_WALL = (0.78, 0.81, 0.84)        # pale blue-grey
PLASTER = (0.93, 0.92, 0.90)        # smooth white paint (the walkthrough's walls)
TERRACOTTA = (0.66, 0.42, 0.26)     # the hall's rustic tiles: patches of glazed orange on a red-brown
TILE_RED = (0.38, 0.26, 0.23)       # ground, worn near black in others
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
FIREPLACE_BRICK = (0.70, 0.56, 0.46)  # the half wall's: pale, warm
TILE_WHITE = (0.93, 0.93, 0.92)
KITCHEN_TILE = (0.88, 0.89, 0.90)    # its floor's glazed tiles, a cool white
LINEN = (0.90, 0.87, 0.81)          # the hall's curtains
SHEER = (0.97, 0.95, 0.91)          # the vertical garden's, paler: off-white, the light through them
DECK_WOOD = (0.50, 0.34, 0.25)      # the bungalow's deck
BUNGALOW_TIMBER = (0.24, 0.13, 0.10)  # its posts and beams, a dark red-brown
PERGOLA_BEAM = (0.34, 0.22, 0.15)   # the pergola's beams, dark wood
OAK = (0.55, 0.40, 0.27)
LIGHT_WOOD = (0.66, 0.50, 0.34)     # the posts where the reception's walls meet the planted ones
WALNUT = (0.34, 0.23, 0.16)
WHITEWASH = (0.92, 0.91, 0.88)
SAND = (0.86, 0.79, 0.66)
SEA_BLUE = (0.36, 0.50, 0.52)
SKIRTING = (0.56, 0.38, 0.24)       # the wooden skirting along the white walls
SKIRTING_BOARD = (0.46, 0.29, 0.17)  # the same as a board drawn as the furniture is (its light is brighter)
SAUCER = (0.85, 0.38, 0.16)          # the ante-room's orange saucer of a wall light
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


def _tiles(colour, size, grout=(0.72, 0.72, 0.71), across=0, joint=0.005):
    """Square tiles with a grey grout line: on a floor (across 0: x and z) or a wall along x (1: x
    and y) or along z (2: z and y). (A floor's joint as wide as its mesh's 5 cm cells, or it blurs away.)"""
    def f(x, y, z, rnd):
        a, b = ((x, z), (x, y), (z, y))[across]
        if a % size < joint or b % size < joint:
            return grout
        t = rnd.uniform(-0.012, 0.012)
        return tuple(c + t for c in colour)
    return base.finish("tile", f)


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


HALL_WINDOW = (1.05, 2.9)           # y: the hall's windows' sills and heads (up near its ceiling)
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


def _reed_wall(x, y, z, rnd):
    """Woven reed cladding: thin stalks standing side by side, each its own straw shade."""
    r = random.Random(math.floor(z / 0.012))
    t = r.uniform(-0.08, 0.06) + 0.03 * math.sin(y * 9 + r.random() * 6)
    return (REED[0] + t, REED[1] + t, REED[2] + t * 0.8)


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
    for x in _strips():
        base._surface(rnd, (x - 0.05, x + 0.05, 0.6, 2.8, z1 - 0.02, z1 - 0.02), TIMBER, out, 0.02)
    # (its exit sign and the up-and-down lights between the strips: fittings())
    # the roof: beams across in dark wood, two along under them, a post at each end of the
    # garden side (the reed matting over them, and the track lights on them: fittings())
    for x in _pergola_beams():
        base._surface(rnd, (x - 0.08, x + 0.08, PERGOLA_ROOF - 0.22, PERGOLA_ROOF, z0, z1), PERGOLA_BEAM, out, 0.05)
    base._surface(rnd, (x0, x1, PERGOLA_ROOF - 0.22, PERGOLA_ROOF, z0, z0 + 0.16), PERGOLA_BEAM, out, 0.05)
    for z in (z0 + (z1 - z0) / 3, z0 + 2 * (z1 - z0) / 3):
        base._surface(rnd, (x0, x1, PERGOLA_ROOF - 0.36, PERGOLA_ROOF - 0.22, z - 0.07, z + 0.07), PERGOLA_BEAM, out, 0.05)
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
    # (the sea wall's stones and the trees' trunks, for the map: the page draws them, fixtures())
    with base.as_decor(out):
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
         (34.0, -1.4, "coconut_palm"), (47.0, -1.4, "coconut_palm"), (36.0, GARDEN_W + 1.4, "coconut_palm"),
         (30.5, -1.6, "coconut_palm"), (39.5, -1.5, "coconut_palm"), (43.0, -1.7, "coconut_palm"),
         (31.0, GARDEN_W + 1.5, "coconut_palm"), (41.0, GARDEN_W + 1.6, "coconut_palm"), (45.5, GARDEN_W + 1.4, "coconut_palm"))
TREE_SCALE = {"broad_tree": 1.35}      # (the walkthrough's are big: tall dark trunks, crowns filling a bay)
TRUNK = {"small_tree": 0.05, "broad_tree": 0.1, "beach_almond": 0.1, "coconut_palm": 0.07}


def trunk(rnd, out, x, z, item):
    """A tree's trunk to 1.9 m, for the map (the page draws the tree)."""
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
    40 cm thick), open in the middle for the path, for the map: the page draws it (stone_wall, fixtures())
    and the clipped hedge along its top."""
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
    out += [("exit_sign", (-16.5, 2.25, 0.0), 0.0, EXIT_GREEN, None), ("exit_sign", (-18.95, 1.95, 4.0), math.pi, EXIT_GREEN, None),
            ("wall_speaker", (-15.3, 2.4, 0.0), 0.0, (0.07, 0.07, 0.07), None),
            ("wall_speaker", (ANTE[0] + 0.55, 2.55, 3.98), math.pi, (0.07, 0.07, 0.07), None)]
    # the front door's two big leaves of rusted steel (the nearly shut one with a long bar)
    for k, (hinge, width, swing) in enumerate(FRONT_LEAVES):
        at = (RECEPTION[0] + 0.02 + width / 2 * math.sin(swing), LANDING[1], hinge + width / 2 * math.cos(swing))
        out.append(("pivot_door", tuple(round(v, 3) for v in at), round(swing - math.pi / 2, 4), RUST, {"w": width, "h": 2.85, "bar": int(k == 0)}))
    # the floors in slabs and tiles, their joints where the walkthrough has them: the reception's
    # and the vertical garden's polished cement, the ante-room's pale slabs, the kitchen's tiles
    lx = RECEPTION[0] + LANDING[0]
    for (x0, x1), colour, (tx, tz) in (((lx, VERTICAL[0]), POLISHED, (1.5, 2.0)), (VERTICAL[:2], POLISHED, (1.5, 2.0)),
                                       ((ANTE[0], ANTE[1] - ANTE_TILES), SLAB, (2.5, 4 / 3))):
        out.append(("tile_floor", (round((x0 + x1) / 2, 3), 0.0, 2.0), 0.0, colour, {"w": round(x1 - x0, 3), "d": 4.0, "tx": tx, "tz": tz, "matte": 1}))
    # the hall's rustic tiles drawn as the furniture is, each 40 cm tile its own (from the ante-room's
    # end to where the cement starts), their joints on the floor's own 40 cm grid
    for x0, x1, z0, z1 in ((ANTE[1] - ANTE_TILES, ANTE[1], ANTE[2], ANTE[3]), (HALL[0], NOTCH[1], NOTCH[2], HALL[3]),
                           (NOTCH[1], TILES_END, HALL[2], HALL[3])):
        out.append(("rustic_tiles", (round((x0 + x1) / 2, 3), 0.0, round((z0 + z1) / 2, 3)), 0.0, None,
                    {"w": round(x1 - x0, 3), "d": round(z1 - z0, 3), "ox": round(-x0 % 0.4, 3), "oz": round(-z0 % 0.4, 3)}))
    # the side room's and its corridor's dark stone tiles, and skirting boards along their khaki walls
    end, w = CORRIDOR
    sx0, sx1, sz0, sz1 = SIDE
    for x0, x1, z0, z1 in ((end, NOTCH[1], 0.0, w), (sx0, sx1, sz0, sz1)):
        out.append(("tile_floor", (round((x0 + x1) / 2, 3), 0.0, round((z0 + z1) / 2, 3)), 0.0, SIDE_TILE,
                    {"w": round(x1 - x0, 3), "d": round(z1 - z0, 3), "tx": 0.5, "tz": 0.5, "ox": round(-x0 % 0.5, 3), "oz": round(-z0 % 0.5, 3), "matte": 1, "grout": 0.006}))
    ga, gb = GARDEN_DOOR
    d0, d1 = SIDE_DOOR
    for x0, x1, z, turn in ((end, NOTCH[1], w, math.pi), (end, d0 - 0.07, 0.0, 0.0), (d1 + 0.07, NOTCH[1], 0.0, 0.0),
                            (sx0, d0 - 0.07, sz1, math.pi), (d1 + 0.07, sx1, sz1, math.pi), (sx0, ga - 0.08, sz0, 0.0), (gb + 0.08, sx1, sz0, 0.0)):
        if x1 - x0 > 0.5:                              # (none in the short bit by the door's frame)
            out.append(("skirting_board", (round((x0 + x1) / 2, 3), 0.0, z), turn, SKIRTING_BOARD, round(x1 - x0, 3)))
    for z0, z1, x, turn in ((0.0, w, end, math.pi / 2), (sz0, sz1, sx0 + 0.02, math.pi / 2), (sz0, sz1, sx1, -math.pi / 2)):
        out.append(("skirting_board", (x, 0.0, round((z0 + z1) / 2, 3)), turn, SKIRTING_BOARD, round(z1 - z0, 3)))
    # the vertical garden's curtains, each tied back to the wooden post (or the doorway's frame) beside it
    for x, turn, ties in ((VERTICAL[0] + 0.2, -math.pi / 2, ((0.35, 1), (3.65, 0))), (VERTICAL[1] - 0.2, math.pi / 2, ((0.6, 0), (3.4, 1)))):
        out += [("sheer_curtain", (x, 0.0, z), turn, SHEER, {"tie": 0.25, "left": left}) for z, left in ties]
    # the kitchen: stainless sink benches under its windows, a gas range in the middle under a
    # hood, its duct along the ceiling to the windows' wall; a fire extinguisher on its far wall
    kx0, _, _, kz1 = KITCHEN
    out += [("steel_sink", (x, 0.0, kz1 - 0.33), math.pi, None, 3.0) for x in (kx0 + 2.3, kx0 + 5.9)]
    stove = (kx0 + 4.5, 5.8)
    out += [("gas_range", (stove[0], 0.0, stove[1]), math.pi / 2, None, None),
            ("steel_hood", (stove[0], 2.45, stove[1]), math.pi / 2, None, None),
            ("steel_duct", ((stove[0] + kx0 + 0.4) / 2, H - 0.3, stove[1]), 0.0, None, round(stove[0] - kx0 - 0.4, 3)),
            ("steel_duct", (kx0 + 0.4, H - 0.3, (stove[1] + KITCHEN_DOORS[1][1]) / 2), math.pi / 2, None, round(KITCHEN_DOORS[1][1] - stove[1], 3)),
            ("fire_extinguisher", (kx0, 0.95, 6.15), math.pi / 2, None, None)]
    kx1, kz0 = KITCHEN[1], KITCHEN[2]
    out.append(("tile_floor", ((kx0 + kx1) / 2, 0.0, (kz0 + kz1) / 2), 0.0, KITCHEN_TILE, {"w": round(kx1 - kx0, 3), "d": round(kz1 - kz0, 3), "tx": 0.45, "tz": 0.45}))
    # (white tiles up its walls: under the windows, along the ante-room's side, round the doors)
    out.append(("wall_tiles", ((kx0 + kx1) / 2, 0.0, kz1 - 0.005), math.pi, TILE_WHITE, {"w": round(kx1 - kx0, 3), "h": 1.4}))
    out.append(("wall_tiles", ((kx0 + kx1) / 2, 0.0, kz0 + 0.035), 0.0, TILE_WHITE, {"w": round(kx1 - kx0, 3), "h": 2.2}))
    a, b = KITCHEN_WAY_OUT
    (d0, d1), (m0, m1) = KITCHEN_DOORS
    for z0, z1 in ((kz0, d0), (d1, a), (b, m0), (m1, kz1)):
        out.append(("wall_tiles", (kx0 + 0.005, 0.0, (z0 + z1) / 2), math.pi / 2, TILE_WHITE, {"w": round(z1 - z0, 3), "h": 2.2}))
    h0, h1 = HATCH
    for z0, z1, h in ((kz0, h0, 2.2), (h0, h1, 1.0), (h1, KITCHEN_DOOR[0], 2.2), (KITCHEN_DOOR[1], kz1, 2.2)):
        out.append(("wall_tiles", (kx1 - 0.005, 0.0, (z0 + z1) / 2), -math.pi / 2, TILE_WHITE, {"w": round(z1 - z0, 3), "h": h}))
    # its doors: the far wall's brown and maroon ones shut, its own door on the hall swung in against
    # the wall; the passage's dark panelled door ajar at its end
    for (z0, z1), c in zip(KITCHEN_DOORS, ((0.36, 0.20, 0.15), (0.42, 0.12, 0.12))):
        out.append(("panel_door", (kx0 + 0.02, 0.0, (z0 + z1) / 2), math.pi / 2, c, {"w": round(z1 - z0 - 0.1, 3), "h": 2.15}))
    a0, a1 = KITCHEN_DOOR
    out.append(("panel_door", (-(a1 - a0) / 2, 0.0, a1 - 0.03), math.pi, DOOR, {"w": round(a1 - a0, 3), "h": 2.2, "rows": 5}))
    hx_, hz_, w_, open_ = PASSAGE_DOOR
    out.append(("panel_door", (round(hx_ - w_ / 2 * math.cos(open_), 3), 0.0, round(hz_ - w_ / 2 * math.sin(open_), 3)), round(math.pi - open_, 4), DOOR, {"w": w_, "h": 2.1, "rows": 5}))
    # the bricks drawn as the furniture is: the half wall (pale, the fireplace's hole left in its
    # hall side), the toilets' hall's walls (a passage to the stage), the pier at the corner
    hx, reach = HALF_WALL
    a, b, y0, y1 = FIREPLACE
    pale = FIREPLACE_BRICK
    for z0, z1, f0, f1 in ((0.0, a, 0.0, H), (b, reach, 0.0, H), (a, b, 0.0, y0), (a, b, y1, H)):
        out.append(("brick_wall", (hx - 0.1, f0, (z0 + z1) / 2), -math.pi / 2, pale, {"w": round(z1 - z0, 3), "h": round(f1 - f0, 3)}))
    out.append(("brick_wall", (hx + 0.1, 0.0, reach / 2), math.pi / 2, pale, {"w": reach, "h": H}))
    out.append(("brick_wall", (hx, 0.0, reach), 0.0, pale, {"w": 0.2, "h": H}))
    out.append(("brick_bench", (hx + 0.1 + 0.25, 0.0, reach / 2), math.pi / 2, (0.88, 0.84, 0.76), round(reach - 0.3, 3)))
    wx1, wz = WC[1], WC[2]
    out.append(("brick_wall", (wx1 - 1.25, 0.0, wz), math.pi, BRICK, {"w": 2.5, "h": H}))
    s0, s1 = TO_STAGE
    for z0, z1, f0, f1 in ((0.0, s0, 0.0, H), (s1, wz, 0.0, H), (s0, s1, TO_STAGE_TOP, H)):
        out.append(("brick_wall", (wx1, f0, (z0 + z1) / 2), -math.pi / 2, BRICK, {"w": round(z1 - z0, 3), "h": round(f1 - f0, 3)}))
    out.append(("brick_pier", (PIER[0], 0.0, PIER[1]), 0.0, BRICK, {"w": 0.4, "d": 0.4, "h": H}))
    out.append(("plain_counter", (wx1 - 1.3, 0.0, sum(COUNTER_Z) / 2), -math.pi / 2, (0.10, 0.10, 0.10), {"w": round(COUNTER_Z[1] - COUNTER_Z[0], 3), "d": 0.6, "h": 1.05}))
    out += [("sink_cabinet", (wx1 - 0.23, 0.0, SINK_Z), -math.pi / 2, (0.24, 0.16, 0.11), None),
            ("round_mirror", (wx1, 1.2, SINK_Z), -math.pi / 2, None, None),
            ("dome_pendant", (wx1 - 0.55, H - 1.2, SINK_Z), 0.0, (0.80, 0.42, 0.16), None)]
    # the toilets' signs over their doors, the ladies' changing table, the gents' mosaic splashback
    out += [("door_sign", ((a0 + a1) / 2, 2.3, 0.0), 0.0, None, {"man": k}) for k, (a0, a1) in enumerate(WC_DOORS)]
    out.append(("changing_table", (CHANGING[0] + 0.275, 0.0, (CHANGING[2] + CHANGING[3]) / 2), math.pi / 2, None, None))
    out.append(("mosaic_splash", (GENTS[1], 0.84, -1.65), -math.pi / 2, (0.70, 0.62, 0.52), {"w": 1.3, "h": 0.46}))
    # the hall's dining side: a row of downlights over its brick end
    out += [("downlight", (HALF_WALL[0] - 0.35, H - 0.02, 0.35 + 0.5 * k), 0.0, None, None) for k in range(6)]
    # the ante-room: an orange saucer of a wall light near its end
    out.append(("saucer_light", (ANTE[1] - 1.7, 1.95, 0.0), 0.0, SAUCER, {"drop": 1.2}))   # (hung from the ceiling on a cord)
    # the slim pillar where the ante-room opens on the hall: a camera and a speaker high on it, an
    # exit sign on the wall beside it, a floor light at its foot
    pz = NOTCH[2] + 0.2
    out += [("security_camera", (-0.06, 2.75, pz), 0.0, None, None), ("wall_speaker", (-0.06, 2.4, pz), 0.0, (0.07, 0.07, 0.07), None),
            ("exit_sign", (0.95, 2.0, NOTCH[2]), 0.0, EXIT_GREEN, None), ("floor_spot", (0.4, 0.0, NOTCH[2] + 0.15), 0.0, None, None)]
    # the hall: skirting along its white walls (not the toilets' hall's), uplights, its curtains
    # tied back each side of each set of windows, short track lights on its ceiling
    hx0, hx1, _, hz1 = HALL
    nx, nz = NOTCH[1], NOTCH[2]
    for x0, x1, z, turn in ((hx0, hx1, hz1, math.pi), (hx0, nx, nz, 0.0), (nx, HALF_WALL[0], 0.0, 0.0)):
        out.append(("skirting_board", ((x0 + x1) / 2, 0.0, z), turn, SKIRTING_BOARD, x1 - x0))
    out.append(("skirting_board", (hx0, 0.0, (4.0 + KITCHEN_DOOR[0]) / 2), math.pi / 2, SKIRTING_BOARD, KITCHEN_DOOR[0] - 4.0))
    windows, lights = hall_windows()
    out += [("floor_spot", (x, 0.0, hz1 - 0.15), math.pi, None, None) for x in lights]
    out += [("floor_spot", (hx0 + 0.3, 0.0, 3.6), math.pi / 2, None, None)]
    for j in range(3):
        a, b = windows[3 * j][0], windows[3 * j + 2][1]
        mids = [(windows[3 * j + k][1] + windows[3 * j + k + 1][0]) / 2 for k in range(2)]   # (and in front of the mullions between)
        out += [("sheer_curtain", (round(c, 3), 0.0, hz1 - 0.12), math.pi, SHEER, {"full": 2.2}) for c in (a - 0.3, *mids, b + 0.3)]   # (wide, gathered at the tie)
    for x, z in ((2.5, 4.0), (6.5, 2.6), (6.5, 6.4), (10.5, 2.6), (10.5, 6.4), (14.5, 2.6), (14.5, 6.4)):
        out.append(("track_light", (x, H - 0.24, z), math.pi / 2, None, 1.2))   # (across the hall)
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
    counter, lattice = (0.30, 0.16, 0.10), (0.18, 0.11, 0.07)
    out.append(("wash_counter", (lx0 + 0.25, 0.78, -0.85), math.pi / 2, counter, 1.5))
    out += [("round_mirror", (lx0, 1.22, z), math.pi / 2, None, None) for z in (-0.45, -1.25)]
    fx, fz, n = LADIES_STALLS                           # (three in a row along its right wall, facing its left; the middle one's lattice door open)
    w = (fz - z0) / n
    out += [("toilet_cubicle", ((fx + lx1) / 2, 0.0, fz - w * (k + 0.5)), -math.pi / 2, lattice, {"w": round(w, 3), "d": round(lx1 - fx, 3), "open": int(k == 1), "plain": int(k != 1)}) for k in range(n)]
    out.append(("trough_urinal", (gx0 + 1.4, 0.0, z0 + 0.175), 0.0, (0.16, 0.16, 0.17), 2.2))
    out.append(("toilet_cubicle", (gx1 - 0.6, 0.0, (z0 - 2.7) / 2), 0.0, (0.62, 0.46, 0.30), {"w": 1.2, "d": 1.3, "plain": 1}))
    out.append(("wall_plates", (gx0 + 0.01, 0.0, -1.6), math.pi / 2, None, None))   # (three woven plates by the gents' door)
    out.append(("wash_counter", (gx1 - 0.25, 0.78, -1.65), -math.pi / 2, counter, 1.3))
    out.append(("strap_mirror", (gx1, 1.29, -1.65), -math.pi / 2, None, None))
    out += [("globe_lamp", (lx1 - 0.01, 2.28, -1.6), -math.pi / 2, (0.80, 0.92, 0.74), None),
            ("globe_lamp", (lx1 + 0.01, 2.28, -1.6), math.pi / 2, (0.80, 0.92, 0.74), None)]
    # the lights sunk in the floor along the bare brick on the pergola's side; the side room's glass
    # doors and the planted patio's terracotta through them
    out += [("sunk_light", (WC[1] - 2.2 + 0.7 * k, 0.0, WC[2] + 0.12), 0.0, None, None) for k in range(4)]
    ga, gb = GARDEN_DOOR
    sx0, sx1, sz0, _ = SIDE
    out.append(("glass_pane", ((ga + gb) / 2, 0.0, sz0), 0.0, (0.80, 0.86, 0.87), {"w": gb - ga, "h": 2.4}))
    out.append(("tile_floor", ((sx0 + sx1) / 2, -0.01, sz0 - 1.0), 0.0, (0.52, 0.33, 0.24), {"w": sx1 - sx0, "d": 2.0, "tx": 0.3, "tz": 0.3, "matte": 1}))
    # (a skirting board longer than a starter can be made, 5 m, laid as several end to end)
    boards = []
    for f in out:
        item, (x, y, z), turn, colour, length = f
        n = math.ceil(length / BOARD) if item == "skirting_board" else 1
        if n == 1:
            boards.append(f)
            continue
        along = (abs(math.cos(turn)), abs(math.sin(turn)))   # (turn 0: along x)
        for k in range(n):
            u = (k + 0.5) * length / n - length / 2
            boards.append((item, (x + u * along[0], y, z + u * along[1]), turn, colour, length / n))
    return boards


def fixtures() -> dict:
    """What the page is told besides the splat (room.py's map, in its metres): the trees, and the
    things it draws as it draws the decor (decor.js starters), so they look as the decor does: the
    planted walls, the borders along the garden's walls and the glass rain cover over it."""
    props = [dict({"item": item, "at": [x, 0.0, z]}, **({"scale": [TREE_SCALE[item]] * 3} if item in TREE_SCALE else {})) for x, z, item in TREES]
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
              {"item": "gourd_pendants", "at": [cx, 0.2, cz], "scale": [1.0, 1.2, 1.0]}]   # (a tight cluster, hung low under the glass)
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
    # (none by the bungalow's front: Gabriel, none there)
    props += [{"item": "wicker_pendant", "at": [round(GARDEN_X + 2.0 + 4.0 * k, 3), 0.5, GARDEN_W / 2 + side]}
              for k in range(int(COVER_LEN / 4.0)) for side in (-3.0, 3.0)
              if not (side > 0 and BUNGALOW[0] - 1.0 < GARDEN_X + 2.0 + 4.0 * k < BUNGALOW[1])]
    # plants round the bungalow's deck, at its ends and behind it
    bx0, bx1, bz0, bz1 = BUNGALOW
    for x, turn in ((bx0 - 1.0, -math.pi / 2), (bx1 + 1.0, math.pi / 2)):
        props += [{"item": "tropical_border", "at": [x, 0.0, round(bz0 + 1.2 + 2.0 * k, 3)], "turn": round(turn, 4)} for k in range(2)]
    # the low wall of dark stones where the garden meets the beach, open in the middle for the path
    # down to it, in lengths of about 3.4 m; on it a low clipped hedge
    (ax, az), L, (tx, tz), (nx, nz) = _far_side()
    for u0, u1 in ((0.0, L * (0.5 - SEA_GAP)), (L * (0.5 + SEA_GAP), L)):
        n = max(1, math.ceil((u1 - u0) / 3.4))
        for k in range(n):
            u = u0 + (k + 0.5) * (u1 - u0) / n
            props.append({"item": "stone_wall", "at": [round(ax + tx * u + 0.5 * nx, 3), 0.0, round(az + tz * u + 0.5 * nz, 3)],
                          "turn": round(-math.atan2(tz, tx), 4), "opts": {"w": round((u1 - u0) / n, 3)}})
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
