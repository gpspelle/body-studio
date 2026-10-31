"""The sample wedding venue's plan (sample_venue.py draws it): where every room, door, window and
tree is, in metres, and the colours as the walkthrough videos show them. Read by sample_venue.py
(the splats) and venue_fittings.py (what the page draws as decor). Coordinates as sample_venue.py
explains: x along the house from the entrance, z across it from the long straight wall, y up."""
from __future__ import annotations

import math

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
SHEER = (0.97, 0.95, 0.91)          # the vertical garden's, paler: off-white, the light through them
DECK_WOOD = (0.50, 0.34, 0.25)      # the bungalow's deck
BUNGALOW_TIMBER = (0.24, 0.13, 0.10)  # its posts and beams, a dark red-brown
PERGOLA_BEAM = (0.34, 0.22, 0.15)   # the pergola's beams, dark wood
LIGHT_WOOD = (0.66, 0.50, 0.34)     # the posts where the reception's walls meet the planted ones
WALNUT = (0.34, 0.23, 0.16)
SAND = (0.86, 0.79, 0.66)
SEA_BLUE = (0.36, 0.50, 0.52)
SKIRTING = (0.56, 0.38, 0.24)       # the wooden skirting along the white walls
SKIRTING_BOARD = (0.46, 0.29, 0.17)  # the same as a board drawn as the furniture is (its light is brighter)
SAUCER = (0.85, 0.38, 0.16)          # the ante-room's orange saucer of a wall light
EXIT_GREEN = (0.10, 0.58, 0.32)
FAR = 0.42                          # how opaque what is far off is drawn: under room.OPAQUE


HALL_WINDOW = (1.05, 2.9)           # y: the hall's windows' sills and heads (up near its ceiling)
LANTERN = (4.2, 3.6)                # the vertical garden's glass roof light: its foot, along x and across (nearly the whole room)


PIERS = (PERGOLA[2] + 0.2, PERGOLA[3] - 0.3)   # z: the brick piers on its garden side


def strips():
    """x: the wooden strips up the pergola's wall, every 2.6 m."""
    x0, x1 = PERGOLA[:2]
    return [x0 + 1.6 + 2.6 * k for k in range(int((x1 - 2.0 - x0) / 2.6))]


def pergola_beams():
    """x: the pergola's beams across it, five, the first and last at its ends."""
    x0, x1 = PERGOLA[:2]
    return [x0 + 0.1 + k * (x1 - x0 - 0.2) / 4 for k in range(5)]


def garden_end(z):
    """Where the garden ends along x, at z across: its far side is slanted."""
    return GARDEN_X + GARDEN_RIGHT + (GARDEN_LEFT - GARDEN_RIGHT) * z / GARDEN_W


# the trees the walkthrough shows (x, z, the decor starter that draws it): a broad tree in the sand
# under the rain cover (its crown up through it), a big one beside the bungalow, two beach almonds at the sand's edge by the
# sea, and coconut palms standing up behind the garden's walls. The page draws them as it draws
# the decor (decor.js), from the fixtures make() writes; here only their trunks' feet, inside those,
# so the map walks round them
TREES = ((44.5, 3.2, "broad_tree"), (52.5, 10.8, "broad_tree"),
         (garden_end(3.0) + 2.5, 3.0, "beach_almond"), (garden_end(13.0) + 2.0, 13.0, "beach_almond"),
         (34.0, -1.4, "coconut_palm"), (47.0, -1.4, "coconut_palm"), (36.0, GARDEN_W + 1.4, "coconut_palm"),
         (30.5, -1.6, "coconut_palm"), (39.5, -1.5, "coconut_palm"), (43.0, -1.7, "coconut_palm"),
         (31.0, GARDEN_W + 1.5, "coconut_palm"), (41.0, GARDEN_W + 1.6, "coconut_palm"), (45.5, GARDEN_W + 1.4, "coconut_palm"))
TREE_SCALE = {"broad_tree": 1.35}      # (the walkthrough's are big: tall dark trunks, crowns filling a bay)
TRUNK = {"small_tree": 0.05, "broad_tree": 0.1, "beach_almond": 0.1, "coconut_palm": 0.07}


def far_side():
    """The garden's slanted far side, where it meets the beach: its ends, length, the way along it
    and the way in from it (toward the house)."""
    (ax, az), (bx, bz) = (GARDEN_X + GARDEN_RIGHT, 0.0), (GARDEN_X + GARDEN_LEFT, GARDEN_W)
    L = math.hypot(bx - ax, bz - az)
    return (ax, az), L, ((bx - ax) / L, (bz - az) / L), (-(bz - az) / L, (bx - ax) / L)


SEA_GAP = 0.12                          # the opening in the sea wall for the path down to the beach: either side of its middle, a share of its length


def hall_windows():
    """The hall's windows along its right wall, three sets of three the same space apart: each
    (x0, x1); and the x of the uplights between the sets and at the ends."""
    hx0, hx1 = HALL[:2]
    gap = (hx1 - hx0 - 3 * 3 * 1.1) / 4
    windows = [(hx0 + gap * (j + 1) + 3.3 * j + 1.1 * k, hx0 + gap * (j + 1) + 3.3 * j + 1.1 * (k + 1) - 0.08)
               for j in range(3) for k in range(3)]
    return windows, [hx0 + gap * (j + 0.5) + 3.3 * j for j in range(4)]
