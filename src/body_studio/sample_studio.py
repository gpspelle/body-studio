"""A tattoo studio made of splats, for trying a tattoo on the body where it would be made.

Drawn like the sample living room (sample_room.py, whose helpers it uses): boxes, cylinders and
slanted pads covered in small flat splats, written as a room run so room.py maps it and the page
shows it like a filmed room. Beside the splat, `NAME_clean.fixtures.json` says where the studio's
furniture is, in the PLY's coordinates, so the page knows the bed, the chair and the flash wall
(room.py turns it into the map's metres): a filmed room has no such file.

The studio is 5 m by 4.2 m and 2.7 m high, in metres, y up, the floor at 0 (the file is y-down):
a flash wall on the back wall (the designs are hung on it by the page), a tattoo bed in the middle,
a reclining tattoo chair with an arm rest each side, the artist's stool and tray, a ring light over
the bed, a full-length mirror, a counter by the door, a plant and a neon sign.
"""
from __future__ import annotations

import json
import math
import random
from pathlib import Path

from . import sample_room as base

VERSION = 4
PLY = "tattoo_studio_clean.ply"
SEED = 11

W, D, H = 5.0, 4.2, 2.7             # x from -2.5 to 2.5, z from -2.1 to 2.1
X0, X1, Z0, Z1 = -W / 2, W / 2, -D / 2, D / 2

PLASTER = (0.90, 0.88, 0.84)
TEAL = (0.15, 0.29, 0.31)           # the back wall, behind the flash
CEIL = (0.24, 0.24, 0.25)
BLACK = (0.07, 0.07, 0.08)
VINYL = (0.10, 0.10, 0.11)
CHROME = (0.70, 0.71, 0.73)
CORK = (0.72, 0.56, 0.38)
WOOD = (0.45, 0.30, 0.18)
WHITE = (0.94, 0.93, 0.90)
PINK = (1.0, 0.36, 0.72)
LEAF = (0.22, 0.42, 0.20)

# where things are, in the studio's metres (see fixtures() for what the page is told)
BED = {"x": (-1.45, 0.45), "z": (-0.65, 0.05), "top": 0.68}                 # its head at the -x end
CHAIR = {"x": (1.3, 1.8), "z": (0.15, 0.55), "seat": 0.5, "recline": 25}      # facing -x
RESTS = {"l": (0.02, 0.14), "r": (0.56, 0.68)}           # the arm rests' z, either side (the body's own left and right)
REST_X, REST_TOP, REST_AT = (1.3, 1.9), 0.82, 1.66                 # REST_AT: where the forearm lies
STOOL = (-0.25, 0.55, 0.2, 0.55)                                            # x, z, radius, height
FLASH = {"x": (-1.4, 1.4), "y": (0.85, 2.2)}                                # the panel on the back wall
MIRROR = {"z": (0.45, 1.45), "y": (0.25, 2.0)}                              # on the left wall (x = X0)
# the places to sit, for tests: (x, z) of the seat's middle, its height and the way the sitter faces
SEATS = {"chair": ((1.55, 0.35), CHAIR["seat"], (-1.0, 0.0)), "stool": ((STOOL[0], STOOL[1]), STOOL[3], None)}


def _tiles(x, y, z, rnd):
    """Black and cream tiles, 40 cm, with a thin grout line."""
    i, k = math.floor((x - X0) / 0.4), math.floor((z - Z0) / 0.4)
    if (x - X0) % 0.4 < 0.006 or (z - Z0) % 0.4 < 0.006:
        return (0.35, 0.35, 0.34)
    return (0.12, 0.12, 0.13) if (i + k) % 2 else (0.88, 0.85, 0.78)


def _mirror(x, y, z, rnd):
    """A mirror: a black frame round silver glass, lighter toward the top, with a soft streak."""
    if min(z - MIRROR["z"][0], MIRROR["z"][1] - z, y - MIRROR["y"][0], MIRROR["y"][1] - y) < 0.04:
        return BLACK
    t = (y - MIRROR["y"][0]) / (MIRROR["y"][1] - MIRROR["y"][0])
    streak = 0.06 * math.exp(-((z - 0.75 - 0.3 * t) / 0.08) ** 2)
    return tuple(c + streak for c in (0.62 + 0.12 * t, 0.66 + 0.12 * t, 0.70 + 0.12 * t))


def _cork(x, y, z, rnd):
    """The flash wall: cork in a wooden frame, a little mottled."""
    if min(x - FLASH["x"][0], FLASH["x"][1] - x, y - FLASH["y"][0], FLASH["y"][1] - y) < 0.035:
        return WOOD
    m = 0.04 * math.sin(x * 41 + 3 * math.sin(y * 17)) + 0.03 * math.sin(y * 53 + x * 7)
    return tuple(c + m for c in CORK)


def _door(x, y, z, rnd):
    if -0.82 < x < -0.76 and 0.98 < y < 1.04:
        return CHROME                              # the handle
    if min(x + 1.65, -0.65 - x, y, 2.1 - y) < 0.05:
        return BLACK                               # the frame
    return (0.32, 0.12, 0.10)                      # oxblood


def _frame(x0, x1, y0, y1, colours):
    """A framed print on the right wall: stripes of colour in a black frame."""
    def paint(x, y, z, rnd):
        if min(z - x0, x1 - z, y - y0, y1 - y) < 0.025:
            return BLACK
        return colours[int((y - y0) / (y1 - y0) * len(colours)) % len(colours)]
    return paint


def parts(rnd) -> list:
    """(box (x0, x1, y0, y1, z0, z1), colour or colour(x, y, z, rnd)) for every flat thing."""
    bx, bz, top = BED["x"], BED["z"], BED["top"]
    cx, cz, seat = CHAIR["x"], CHAIR["z"], CHAIR["seat"]
    p = [
        # the room: tiles, a dark ceiling, the teal back wall, plaster round the rest, black skirting
        ((X0, X1, 0, 0, Z0, Z1), _tiles),
        ((X0, X1, H, H, Z0, Z1), CEIL),
        ((X0, X1, 0, H, Z0, Z0), TEAL), ((X0, X1, 0, H, Z1, Z1), PLASTER),
        ((X0, X0, 0, H, Z0, Z1), PLASTER), ((X1, X1, 0, H, Z0, Z1), PLASTER),
        ((X0, X1, 0, 0.1, Z0, Z0 + 0.012), BLACK), ((X0, X1, 0, 0.1, Z1 - 0.012, Z1), BLACK),
        ((X0, X0 + 0.012, 0, 0.1, Z0, Z1), BLACK), ((X1 - 0.012, X1, 0, 0.1, Z0, Z1), BLACK),
        # the flash wall, the mirror, the door, two prints by the counter
        ((FLASH["x"][0], FLASH["x"][1], FLASH["y"][0], FLASH["y"][1], Z0 + 0.03, Z0 + 0.03), _cork),
        ((X0 + 0.012, X0 + 0.012, MIRROR["y"][0], MIRROR["y"][1], MIRROR["z"][0], MIRROR["z"][1]), _mirror),
        ((-1.65, -0.65, 0, 2.1, Z1 - 0.01, Z1 - 0.01), _door),
        ((X1 - 0.012, X1 - 0.012, 1.35, 1.85, 0.35, 0.75), _frame(0.35, 0.75, 1.35, 1.85, [(0.80, 0.25, 0.20), (0.95, 0.85, 0.70), (0.15, 0.35, 0.40)])),
        ((X1 - 0.012, X1 - 0.012, 1.35, 1.85, 0.95, 1.35), _frame(0.95, 1.35, 1.35, 1.85, [(0.90, 0.70, 0.20), BLACK, (0.95, 0.85, 0.70)])),
        # the tattoo bed: a black vinyl top on a chrome column and a foot
        ((bx[0], bx[1], top - 0.08, top, bz[0], bz[1]), VINYL),
        ((bx[0] + 0.05, bx[1] - 0.05, top - 0.12, top - 0.08, bz[0] + 0.05, bz[1] - 0.05), BLACK),
        ((-0.85, -0.15, 0.0, 0.04, -0.55, -0.05), CHROME),
        # the tattoo chair: base, seat cushion; its back is a slanted pad (below)
        ((cx[0] + 0.05, cx[1] - 0.05, 0.0, 0.04, cz[0] + 0.05, cz[1] - 0.05), CHROME),
        ((cx[0], cx[1], seat - 0.1, seat, cz[0], cz[1]), VINYL),
        # an arm rest either side: a padded top on a post
        *[((REST_X[0], REST_X[1], REST_TOP - 0.05, REST_TOP, z0, z1), VINYL) for z0, z1 in RESTS.values()],
        *[((REST_X[1] - 0.12, REST_X[1] - 0.08, 0.0, REST_TOP - 0.05, (z0 + z1) / 2 - 0.02, (z0 + z1) / 2 + 0.02), CHROME)
          for z0, z1 in RESTS.values()],
        # the artist's tray: a cart with a steel top, ink caps and a machine on it
        ((0.35, 0.85, 0.88, 0.9, -1.05, -0.7), CHROME),
        ((0.35, 0.85, 0.3, 0.32, -1.05, -0.7), CHROME),
        # the counter by the door, with a dark top
        ((1.2, 2.45, 0.0, 1.0, 1.5, 2.05), WOOD),
        ((1.18, 2.47, 1.0, 1.04, 1.48, 2.07), BLACK),
        # a bench by the door to wait on
        ((-2.45, -2.0, 0.42, 0.46, 0.0, 1.2), WOOD),
    ]
    legs = [((x, x + 0.03, 0, 0.88, z, z + 0.03), CHROME) for x in (0.36, 0.81) for z in (-1.04, -0.74)]
    legs += [((x, x + 0.05, 0, 0.42, z, z + 0.05), BLACK) for x in (-2.42, -2.08) for z in (0.03, 1.12)]
    return p + legs


def _slab(rnd, o, u, v, colour, out, size=base.STEP * 0.6):
    """Round splats about STEP apart over the parallelogram o + a u + b v (a, b in 0..1)."""
    lu, lv = math.sqrt(sum(c * c for c in u)), math.sqrt(sum(c * c for c in v))
    nu, nv = max(1, round(lu / base.STEP)), max(1, round(lv / base.STEP))
    for i in range(nu):
        for k in range(nv):
            a, b = (i + rnd.random()) / nu, (k + rnd.random()) / nv
            out.append((tuple(o[j] + a * u[j] + b * v[j] for j in range(3)), colour, [size] * 3))


def _letters(rnd, text, x, y0, z0, height, colour, out):
    """Neon letters on the right wall (x), reading along -z: a 5 x 7 grid per letter, a bright dot
    per lit cell and a soft glow round it."""
    font = {"T": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
            "A": [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
            "O": [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."]}
    c = height / 7
    for n, ch in enumerate(text):
        for r, row in enumerate(font[ch]):
            for k, on in enumerate(row):
                if on != "#":
                    continue
                zc, yc = z0 - (n * 6 + k) * c, y0 + (6 - r) * c
                for _ in range(6):
                    out.append(((x, yc + rnd.uniform(-0.3, 0.3) * c, zc + rnd.uniform(-0.3, 0.3) * c), colour, [0.28 * c, 0.28 * c, 0.002]))
                out.append(((x + 0.003, yc, zc), tuple(0.5 + 0.5 * v for v in colour), [0.9 * c, 0.9 * c, 0.002]))


def splats(seed: int = SEED) -> list:
    """(position (x, y, z) in metres, y up; colour; scale per axis in metres) for every splat."""
    rnd = random.Random(seed)
    out = []
    for box, colour in parts(rnd):
        base._surface(rnd, box, colour, out)
    cx, cz, seat, rec = CHAIR["x"], CHAIR["z"], CHAIR["seat"], math.radians(CHAIR["recline"])
    # the chair's back, leaning back from the seat's rear edge, and a head rest on top of it
    back, up = 0.85, (math.sin(rec), math.cos(rec), 0.0)
    for off in (0.0, 0.07):
        _slab(rnd, (cx[1] - 0.02 + off, seat - 0.05, cz[0]), tuple(back * c for c in up), (0.0, 0.0, cz[1] - cz[0]), VINYL, out)
    _cylinder = base._cylinder
    _cylinder(rnd, (cx[0] + cx[1]) / 2, (cz[0] + cz[1]) / 2, 0.06, 0.06, 0.04, seat - 0.1, CHROME, out, top=False)
    # the bed's column, the stool (a round seat on a chrome post) and the tray's ink caps
    _cylinder(rnd, (BED["x"][0] + BED["x"][1]) / 2, (BED["z"][0] + BED["z"][1]) / 2, 0.07, 0.07, 0.04, BED["top"] - 0.12, CHROME, out, top=False)
    sx, sz, sr, sh = STOOL
    _cylinder(rnd, sx, sz, sr, sr, sh - 0.07, sh, VINYL, out)
    _cylinder(rnd, sx, sz, 0.025, 0.025, 0.05, sh - 0.07, CHROME, out, top=False)
    _cylinder(rnd, sx, sz, 0.22, 0.22, 0.0, 0.04, CHROME, out)
    for k, col in enumerate([(0.08, 0.08, 0.1), (0.75, 0.12, 0.12), (0.12, 0.35, 0.70), (0.15, 0.55, 0.25), (0.92, 0.75, 0.15)]):
        _cylinder(rnd, 0.42 + 0.07 * k, -0.95, 0.018, 0.018, 0.9, 0.925, col, out)
    base._surface(rnd, (0.5, 0.7, 0.9, 0.95, -0.82, -0.76), BLACK, out)          # the machine
    # the ring light over the bed, on its cable, and its glow
    lx, lz = (BED["x"][0] + BED["x"][1]) / 2, (BED["z"][0] + BED["z"][1]) / 2
    _cylinder(rnd, lx, lz, 0.38, 0.38, 2.12, 2.16, (1.0, 0.99, 0.95), out, top=False)
    _cylinder(rnd, lx, lz, 0.006, 0.006, 2.16, H, BLACK, out, top=False)
    # a plant in the corner by the flash wall
    _cylinder(rnd, X0 + 0.35, Z0 + 0.35, 0.16, 0.2, 0.0, 0.4, (0.20, 0.20, 0.21), out)
    base._leaves(rnd, X0 + 0.35, Z0 + 0.35, 0.42, 1.4, out)
    # the neon sign on the right wall
    _letters(rnd, "TATTOO", X1 - 0.02, 1.95, -0.05, 0.26, PINK, out)
    return out


def fixtures() -> dict:
    """Where the studio's furniture is, in the studio's metres (y up): what the page needs to put
    the body on the bed or in the chair and to hang the designs (room.py turns these into the map's
    metres; each key's kind is in room.FIXTURE_KEYS)."""
    bx, bz = BED["x"], BED["z"]
    cx, cz, rec = CHAIR["x"], CHAIR["z"], CHAIR["recline"]
    mid = lambda a: (a[0] + a[1]) / 2                       # noqa: E731
    return {
        # the bed's top: its middle, the way to its head end, its length and width
        "bed": {"at": [mid(bx), BED["top"], mid(bz)], "head": [-1.0, 0.0, 0.0], "length": bx[1] - bx[0], "width": bz[1] - bz[0]},
        # the chair: where the hips go (on the seat, near its back), the way it faces, how far its back leans
        "chair": {"at": [cx[1] - 0.18, CHAIR["seat"], mid(cz)], "facing": [-1.0, 0.0, 0.0], "height": CHAIR["seat"],
                  "recline": rec},
        # the arm rests' tops (the body's right and left, sitting in the chair)
        "rests": [{"side": s, "at": [REST_AT, REST_TOP, mid(RESTS[s])]} for s in ("r", "l")],
        # the flash wall's face: where the designs hang
        "flash": {"centre": [mid(FLASH["x"]), mid(FLASH["y"]), Z0 + 0.035], "normal": [0.0, 0.0, 1.0],
                  "right": [1.0, 0.0, 0.0], "width": FLASH["x"][1] - FLASH["x"][0] - 0.1, "height": FLASH["y"][1] - FLASH["y"][0] - 0.1},
        # the mirror's face
        "mirror": {"centre": [X0 + 0.015, mid(MIRROR["y"]), mid(MIRROR["z"])], "normal": [1.0, 0.0, 0.0],
                   "width": MIRROR["z"][1] - MIRROR["z"][0], "height": MIRROR["y"][1] - MIRROR["y"][0]},
        # the ring light over the bed, which the artist's view looks from beside
        "light": {"at": [mid(bx), 2.14, mid(bz)]},
    }


def to_file(fx: dict) -> dict:
    """fixtures() in the PLY's coordinates (y-down): points and directions have y flipped."""
    from .room import FIXTURE_KEYS

    def conv(v, key=None):
        if isinstance(v, dict):
            return {k: conv(x, k) for k, x in v.items()}
        if isinstance(v, list) and v and isinstance(v[0], dict):
            return [conv(x) for x in v]
        if FIXTURE_KEYS.get(key) in ("point", "dir"):
            return [v[0], -v[1], v[2]]
        return v
    return conv(fx)


def make(d: Path) -> Path:
    """The studio's splat, cameras and fixtures in run folder d."""
    base.write_cameras(d / "dense" / "sparse" / "0" / "images.bin", ring=(0.5, 0.35), centre=(0.5, 1.1))
    ply = base.write_ply(d / "splat" / PLY, splats())
    from .room import fixtures_file
    fixtures_file(ply).write_text(json.dumps(to_file(fixtures()), indent=1))
    return ply
