"""A furnished living room made of splats, for trying the body in a room before filming one.

It is drawn here, not filmed: boxes, cylinders and leaves covered in small flat splats, written
the way a room run leaves its splat (workspace/<name>/run_*/splat/NAME_clean.ply, y-down like
Brush's, with COLMAP's images.bin for a camera path held at 1.45 m), so room.py maps it like any
scanned room and the page shows it like one. It is made the first time the rooms are listed and
kept in the data folder; a new VERSION makes it again. The sample tattoo studio (sample_studio.py)
and the sample wedding venue (sample_venue.py) are made the same way, beside it.

The room is 5.5 m by 4.5 m and 2.6 m high, in metres, y up, the floor at 0 (the file is y-down):
a sofa along the back wall (seat 45 cm) with a picture above it, an armchair by the window, a
bookshelf, a TV on a console, a dining table, a floor lamp, a plant, a rug and a door.
"""
from __future__ import annotations

import json
import math
import random
import struct
import subprocess
import sys
import threading
from pathlib import Path

from . import library

VERSION = 2
NAME = library.SAMPLE               # its folder in workspace/ and its name in rooms.json
RUN = "run_sample"
PLY = "living_room_clean.ply"
STEP = 0.02                         # m between splats on a surface
SEED = 7
CAMERA_HEIGHT = 1.45

C0 = 0.28209479177387814
PROPS = ["x", "y", "z", "f_dc_0", "f_dc_1", "f_dc_2", "opacity", "scale_0", "scale_1", "scale_2",
         "rot_0", "rot_1", "rot_2", "rot_3"]

W, D, H = 5.5, 4.5, 2.6             # x from -2.75 to 2.75, z from -2.25 to 2.25
X0, X1, Z0, Z1 = -W / 2, W / 2, -D / 2, D / 2

PAINT = (0.88, 0.86, 0.81)
WHITE = (0.94, 0.93, 0.90)
OAK = (0.62, 0.46, 0.30)
WALNUT = (0.36, 0.24, 0.16)
LINEN = (0.42, 0.47, 0.52)          # the sofa
LINEN_LIGHT = (0.52, 0.56, 0.60)
OCHRE = (0.80, 0.60, 0.25)
TEAL = (0.20, 0.45, 0.47)
BLACK = (0.08, 0.08, 0.09)
TERRACOTTA = (0.70, 0.40, 0.28)
LEAF = (0.22, 0.42, 0.20)
SHADE = (0.97, 0.92, 0.80)
SKY = (0.80, 0.88, 0.95)

# the places to sit, for tests: (x, z) of the seat's middle, its height and the way the sitter faces
SEATS = {"sofa": ((0.0, -1.75), 0.45, (0.0, 1.0)), "armchair": ((2.2, 0.1), 0.44, (-1.0, 0.0))}


def _plank(x, y, z, rnd):
    """Oak planks along x, 18 cm wide, each its own shade, with a dark seam between them."""
    k = math.floor((z - Z0) / 0.18)
    r = random.Random(k * 7919 + math.floor((x - X0 + (k % 3) * 0.7) / 1.4))
    t = r.uniform(-0.07, 0.07)
    seam = (z - Z0) % 0.18 < 0.008
    grain = 0.03 * math.sin(x * 23 + k * 3.1 + 2 * math.sin(x * 3 + k))
    return (0.42, 0.30, 0.20) if seam else tuple(c + t + grain for c in OAK)


def _rug(x, y, z, rnd):
    """A wool rug: a terracotta border, then cream, a teal band and a cream middle."""
    e = min(x - -1.4, 1.4 - x, z - -1.2, 0.8 - z)
    if e < 0.1:
        return (0.62, 0.32, 0.24)
    if 0.18 < e < 0.26:
        return (0.22, 0.42, 0.44)
    return (0.86, 0.81, 0.70)


def _picture(x, y, z, rnd):
    """An abstract print: three soft blocks of colour on paper, in a thin black frame."""
    if min(x + 0.6, 0.6 - x, y - 1.3, 1.9 - y) < 0.025:
        return BLACK
    if (x + 0.15) ** 2 / 0.06 + (y - 1.62) ** 2 / 0.03 < 1:
        return OCHRE
    if -0.5 < x < 0.0 and 1.38 < y < 1.55:
        return TEAL
    if 0.25 < x < 0.5 and 1.45 < y < 1.82:
        return (0.70, 0.36, 0.30)
    return (0.95, 0.93, 0.88)


def _window(x, y, z, rnd):
    """A window: a white frame and a cross bar, sky and a hint of a tree outside."""
    if min(z + 1.7, -0.5 - z, y - 0.9, 2.2 - y) < 0.05 or abs(z + 1.1) < 0.025 or abs(y - 1.6) < 0.025:
        return WHITE
    if (z + 0.8) ** 2 + (y - 1.15) ** 2 < 0.12:
        return (0.48, 0.62, 0.45)
    return tuple(c + 0.05 * (y - 1.5) for c in SKY)


def _door(x, y, z, rnd):
    if 2.32 < x < 2.38 and 0.98 < y < 1.04:
        return (0.75, 0.72, 0.65)                  # the handle
    if min(x - 1.55, 2.45 - x, y, 2.05 - y) < 0.05:
        return WHITE                               # the frame
    if min(x - 1.65, 2.35 - x, y - 0.1, 1.95 - y) < 0.02 or 1.0 < y < 1.04:
        return tuple(c - 0.05 for c in WALNUT)
    return WALNUT


def _books(rnd):
    """Books on the bookshelf's shelves, spines out (toward +x), each its own size and colour."""
    out = []
    colours = [(0.55, 0.20, 0.18), (0.20, 0.30, 0.45), (0.85, 0.80, 0.68), (0.25, 0.40, 0.30),
               (0.80, 0.55, 0.22), BLACK, (0.60, 0.58, 0.55), (0.45, 0.30, 0.45)]
    for shelf in (0.03, 0.43, 0.83, 1.23, 1.63):
        z = -1.57
        while z < -0.45:
            w = rnd.uniform(0.025, 0.06)
            if rnd.random() < 0.12:                # a gap
                z += rnd.uniform(0.08, 0.2)
                continue
            h = rnd.uniform(0.22, 0.34)
            out.append(((X0 + 0.06, X0 + rnd.uniform(0.26, 0.3), shelf, shelf + h, z, z + w), rnd.choice(colours)))
            z += w + 0.003
    return out


def parts(rnd) -> list:
    """(box (x0, x1, y0, y1, z0, z1), colour or colour(x, y, z, rnd)) for every flat thing in the room."""
    p = [
        # the room: floor, ceiling, walls and the skirting round them
        ((X0, X1, 0, 0, Z0, Z1), _plank),
        ((X0, X1, H, H, Z0, Z1), WHITE),
        ((X0, X1, 0, H, Z0, Z0), PAINT), ((X0, X1, 0, H, Z1, Z1), PAINT),
        ((X0, X0, 0, H, Z0, Z1), PAINT), ((X1, X1, 0, H, Z0, Z1), PAINT),
        ((X0, X1, 0, 0.08, Z0, Z0 + 0.012), WHITE), ((X0, X1, 0, 0.08, Z1 - 0.012, Z1), WHITE),
        ((X0, X0 + 0.012, 0, 0.08, Z0, Z1), WHITE), ((X1 - 0.012, X1, 0, 0.08, Z0, Z1), WHITE),
        # on the walls: a window (right), a door (front), a picture over the sofa (back)
        ((X1 - 0.01, X1 - 0.01, 0.9, 2.2, -1.7, -0.5), _window),
        ((X1 - 0.06, X1, 0.86, 0.9, -1.75, -0.45), WHITE),                     # the sill
        ((1.55, 2.45, 0, 2.05, Z1 - 0.01, Z1 - 0.01), _door),
        ((-0.6, 0.6, 1.3, 1.9, Z0 + 0.012, Z0 + 0.012), _picture),
        # the sofa: base, two seat cushions, the back, two back cushions, arms, two pillows
        ((-1.1, 1.1, 0.06, 0.28, -2.2, -1.35), LINEN),
        ((-0.95, -0.005, 0.28, 0.45, -1.98, -1.35), LINEN_LIGHT),
        ((0.005, 0.95, 0.28, 0.45, -1.98, -1.35), LINEN_LIGHT),
        ((-1.1, 1.1, 0.28, 0.62, -2.2, -2.0), LINEN),
        ((-0.95, -0.005, 0.45, 0.86, -2.0, -1.84), LINEN_LIGHT),
        ((0.005, 0.95, 0.45, 0.86, -2.0, -1.84), LINEN_LIGHT),
        ((-1.1, -0.95, 0.06, 0.7, -2.2, -1.35), LINEN), ((0.95, 1.1, 0.06, 0.7, -2.2, -1.35), LINEN),
        ((-0.9, -0.55, 0.45, 0.8, -1.84, -1.72), OCHRE), ((0.55, 0.9, 0.45, 0.8, -1.84, -1.72), TEAL),
        # a side table by the sofa, the floor lamp's base on the other side
        ((1.2, 1.6, 0.68, 0.71, -2.2, -1.8), WALNUT),
        # the rug
        ((-1.4, 1.4, 0, 0.008, -1.2, 0.8), _rug),
        # the armchair by the window, facing into the room: base, seat, back, arms
        ((1.85, 2.55, 0.08, 0.3, -0.3, 0.5), TEAL),
        ((1.9, 2.4, 0.3, 0.44, -0.18, 0.38), (0.26, 0.52, 0.54)),
        ((2.4, 2.55, 0.3, 0.98, -0.3, 0.5), TEAL),
        ((1.85, 2.4, 0.3, 0.68, -0.3, -0.18), TEAL), ((1.85, 2.4, 0.3, 0.68, 0.38, 0.5), TEAL),
        # the bookshelf on the left wall: back, sides, top and shelves
        ((X0, X0 + 0.02, 0, 2.0, -1.6, -0.4), WALNUT),
        ((X0, X0 + 0.32, 0, 2.0, -1.6, -1.57), WALNUT), ((X0, X0 + 0.32, 0, 2.0, -0.43, -0.4), WALNUT),
        *[((X0, X0 + 0.32, y, y + 0.03, -1.6, -0.4), WALNUT) for y in (0.0, 0.4, 0.8, 1.2, 1.6, 1.97)],
        # the TV on its console, by the front wall
        ((-1.0, 1.0, 0.1, 0.76, Z1 - 0.42, Z1 - 0.02), WALNUT),
        ((-0.98, 0.98, 0.14, 0.72, Z1 - 0.43, Z1 - 0.42), (0.40, 0.27, 0.18)),
        ((-0.72, 0.72, 0.9, 1.72, Z1 - 0.12, Z1 - 0.08), BLACK),
        ((-0.12, 0.12, 0.76, 0.9, Z1 - 0.15, Z1 - 0.1), BLACK),
        # the dining table in the corner by the door, with a bench tucked under it
        ((-2.4, -1.4, 0.72, 0.76, 1.0, 1.9), OAK),
        ((-2.3, -1.5, 0.4, 0.44, 1.55, 1.85), OAK),
    ]
    legs = [((x, x + 0.05, 0, 0.72, z, z + 0.05), OAK) for x in (-2.38, -1.47) for z in (1.02, 1.83)]
    legs += [((x, x + 0.04, 0, 0.1, z, z + 0.04), BLACK) for x in (-1.05, 1.01) for z in (-2.15, -1.42)]
    legs += [((x, x + 0.04, 0, 0.08, z, z + 0.04), BLACK) for x in (1.88, 2.5) for z in (-0.27, 0.45)]
    legs += [((x, x + 0.03, 0, 0.68, z, z + 0.03), WALNUT) for x in (1.22, 1.55) for z in (-2.18, -1.85)]
    legs += [((x, x + 0.04, 0, 0.4, z, z + 0.3), OAK) for x in (-2.28, -1.56) for z in (1.55,)]
    return p + legs + _books(rnd)


# ---------------------------------------------------------------- the shell
# A drawn room's flat surfaces (walls, floors, ceilings, the lawn) are also written as a shell:
# smooth sheets the page draws as meshes in place of their splats, which up close show as soft
# blobs a few centimetres across; the splat file keeps them all, for room.py's map. A sheet is a
# grid of cells over a parallelogram (corner o, sides du and dv), each cell the colour of the splat
# drawn in it (none: no cell). While `drawing()` is on, _surface and sheet() note theirs here.
_shell = None                       # {"sheets": [(o, du, dv, na, nb, cells)], "meshed": ids of their splats' positions}
SHELL_MAGIC, SHELL_VERSION = b"BSSH", 1


def drawing(make_splats):
    """The splats make_splats() draws, and the shell: (rows, the rows not in the shell, sheets)."""
    global _shell
    _shell = {"sheets": [], "meshed": set()}
    try:
        rows = make_splats()
        shell = _shell
    finally:
        _shell = None
    rest = [r for r in rows if id(r[0]) not in shell["meshed"]]
    return rows, rest, shell["sheets"]


def _note(o, du, dv, na, nb, cells, points):
    if _shell is not None:
        _shell["sheets"].append((tuple(o), tuple(du), tuple(dv), na, nb, cells))
        _shell["meshed"].update(id(p) for p in points)


def sheet(rnd, o, du, dv, na, nb, colour, out, scale, keep=None):
    """A splat in each cell of the grid over o + u du + v dv (u, v in 0..1, na by nb cells) whose
    point `keep(x, z)` keeps (all, if None), coloured colour(x, y, z, rnd); scales as given."""
    cells, points = [None] * (na * nb), []
    for k in range(nb):
        for i in range(na):
            u, v = (i + rnd.random()) / na, (k + rnd.random()) / nb
            p = tuple(o[j] + u * du[j] + v * dv[j] for j in range(3))
            if keep and not keep(p[0], p[2]):
                continue
            c = colour(*p, rnd) if callable(colour) else colour
            out.append((p, c, scale))
            cells[k * na + i] = c
            points.append(p)
    _note(o, du, dv, na, nb, cells, points)


def write_shell(path: Path, sheets: list) -> Path:
    """The sheets, in the splat file's coordinates (y-down, as write_ply): "BSSH", version, count,
    then each sheet's o, du, dv (9 float32), na, nb (uint32) and its cells as RGBA bytes, row by
    row (alpha 0: no cell)."""
    flip = lambda v: (v[0], 0.0 - v[1], v[2])
    out = bytearray(SHELL_MAGIC + struct.pack("<II", SHELL_VERSION, len(sheets)))
    for o, du, dv, na, nb, cells in sheets:
        out += struct.pack("<9f2I", *flip(o), *flip(du), *flip(dv), na, nb)
        for c in cells:
            out += bytes((0, 0, 0, 0)) if c is None else bytes(
                [round(255 * min(1.0, max(0.0, v))) for v in c[:3]] + [255])
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(bytes(out))
    return path


def look_files(ply: Path) -> tuple:
    """Where a drawn room's look is kept beside its run (not in splat/, so it is never taken for
    the room's splat): the splats the shell leaves, and the shell."""
    d = Path(ply).parent.parent / "look"
    return d / Path(ply).name, d / (Path(ply).stem + ".shell.bin")


def write_drawn(ply: Path, make_splats, mirror: bool = False) -> Path:
    """A drawn room's splat (everything: room.py maps it) and its look (the shell, and the splats
    it leaves); mirrored (z to -z) if asked."""
    rows, rest, sheets = drawing(make_splats)
    if mirror:
        m = lambda v: (v[0], v[1], 0.0 - v[2])
        rows, rest = ([(m(r[0]), *r[1:]) for r in rs] for rs in (rows, rest))
        sheets = [(m(o), m(du), m(dv), *r) for (o, du, dv, *r) in sheets]
    look, shell = look_files(ply)
    write_ply(look, rest)
    write_shell(shell, sheets)
    return write_ply(ply, rows)


def _surface(rnd, box, colour, out, step=STEP, jitter=0.025):
    """Flat splats about `step` apart over the faces of a box (a box flat on one axis is one face),
    each colour a little off by up to `jitter`."""
    x0, x1, y0, y1, z0, z1 = box
    flat = step * 0.12
    if y1 == y0:
        faces = [(1, y0, (0, x0, x1), (2, z0, z1))]
    elif x1 == x0:
        faces = [(0, x0, (1, y0, y1), (2, z0, z1))]
    elif z1 == z0:
        faces = [(2, z0, (0, x0, x1), (1, y0, y1))]
    else:
        faces = [(1, y1, (0, x0, x1), (2, z0, z1)), (1, y0, (0, x0, x1), (2, z0, z1)),
                 (0, x0, (1, y0, y1), (2, z0, z1)), (0, x1, (1, y0, y1), (2, z0, z1)),
                 (2, z0, (0, x0, x1), (1, y0, y1)), (2, z1, (0, x0, x1), (1, y0, y1))]
    for axis, v, (a, a0, a1), (b, b0, b1) in faces:
        na, nb = max(1, round((a1 - a0) / step)), max(1, round((b1 - b0) / step))
        cells, points = [None] * (na * nb), []
        for i in range(na):
            for k in range(nb):
                p = [0.0, 0.0, 0.0]
                p[axis] = v
                p[a] = a0 + (i + rnd.random()) * (a1 - a0) / na
                p[b] = b0 + (k + rnd.random()) * (b1 - b0) / nb
                c = colour(*p, rnd) if callable(colour) else colour
                s = [step * 0.75] * 3
                s[axis] = flat
                c = tuple(min(1.0, max(0.0, ch + rnd.uniform(-jitter, jitter))) for ch in c)
                out.append((p, c, s))
                cells[k * na + i] = c
                points.append(p)
        if _shell is not None:
            o, du, dv = [0.0] * 3, [0.0] * 3, [0.0] * 3
            o[axis], o[a], o[b] = v, a0, b0
            du[a], dv[b] = a1 - a0, b1 - b0
            _note(o, du, dv, na, nb, cells, points)


def _cylinder(rnd, cx, cz, r0, r1, y0, y1, colour, out, top=True, step=STEP):
    """The side (radius r0 at y0 to r1 at y1) and the top of a round thing."""
    n_up = max(1, round((y1 - y0) / step))
    for i in range(n_up):
        y = y0 + (i + rnd.random()) * (y1 - y0) / n_up
        r = r0 + (r1 - r0) * (y - y0) / (y1 - y0)
        for k in range(max(6, round(2 * math.pi * r / step))):
            a = rnd.uniform(0, 2 * math.pi)
            out.append(((cx + r * math.cos(a), y, cz + r * math.sin(a)), colour, [step * 0.6] * 3))
    if top:
        for _ in range(max(4, round(math.pi * r1 * r1 / step ** 2))):
            a, r = rnd.uniform(0, 2 * math.pi), r1 * math.sqrt(rnd.random())
            out.append(((cx + r * math.cos(a), y1, cz + r * math.sin(a)), colour, [step * 0.6] * 3))


def _leaves(rnd, cx, cz, y0, y1, out):
    """A leafy plant: clumps of green splats over a rough ball."""
    for _ in range(9000):
        u, v = rnd.uniform(-1, 1), rnd.uniform(0, 2 * math.pi)
        r = 0.32 * (0.6 + 0.4 * rnd.random()) * (1 - 0.3 * abs(u))
        y = y0 + (y1 - y0) * (0.5 + 0.5 * u)
        p = (cx + r * math.sqrt(1 - u * u) * math.cos(v), y, cz + r * math.sqrt(1 - u * u) * math.sin(v))
        t = rnd.uniform(-0.08, 0.1)
        out.append((p, tuple(c + t for c in LEAF), [0.012, 0.012, 0.012]))


def splats(seed: int = SEED) -> list:
    """(position (x, y, z) in metres, y up; colour; scale per axis in metres) for every splat."""
    rnd = random.Random(seed)
    out = []
    for box, colour in parts(rnd):
        _surface(rnd, box, colour, out)
    # the plant in the corner by the window, the floor lamp by the sofa, the light in the ceiling
    _cylinder(rnd, 2.4, -2.0, 0.15, 0.19, 0.0, 0.38, TERRACOTTA, out)
    _leaves(rnd, 2.4, -2.0, 0.4, 1.35, out)
    _cylinder(rnd, -1.45, -2.0, 0.16, 0.16, 0.0, 0.03, BLACK, out)
    _cylinder(rnd, -1.45, -2.0, 0.012, 0.012, 0.03, 1.45, BLACK, out, top=False)
    _cylinder(rnd, -1.45, -2.0, 0.22, 0.15, 1.4, 1.7, SHADE, out, top=False)
    _cylinder(rnd, 0.0, 0.0, 0.25, 0.25, H - 0.02, H - 0.005, (1.0, 0.98, 0.92), out, top=False)
    return out


def write_ply(path: Path, rows: list) -> Path:
    """A splat PLY as Brush writes it, y-down, with only the base colour (no higher bands). A row
    is (position, colour, scales), opaque, or with a fourth item, its opacity (0..1): what is seen
    but not mapped (a sea far off) is under room.OPAQUE."""
    header = ("ply\nformat binary_little_endian 1.0\ncomment Made by body-studio (sample room)\n"
              "comment Vertical axis: 0 -1 0\n"
              f"element vertex {len(rows)}\n" + "".join(f"property float {p}\n" for p in PROPS) + "end_header\n")
    row = struct.Struct("<" + "f" * len(PROPS))
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    with open(tmp, "wb") as f:
        f.write(header.encode())
        for r in rows:
            (x, y, z), col, s = r[:3]
            op = 5.0 if len(r) < 4 else math.log(r[3] / (1 - r[3]))
            f.write(row.pack(x, -y, z, *((c - 0.5) / C0 for c in col), op,
                             *(math.log(v) for v in s), 1, 0, 0, 0))
    tmp.replace(path)
    return path


def write_cameras(path: Path, n: int = 40, to_file=lambda p: (p[0], -p[1], p[2]),
                  ring=(0.8, 0.6), centre=(0.0, 0.0)) -> Path:
    """COLMAP images.bin: n cameras on a loop round `centre`, 1.45 m up, looking out at the walls.
    `to_file` turns metres (y up) into the file's coordinates."""
    out = bytearray(struct.pack("<Q", n))
    o = to_file((0.0, 0.0, 0.0))
    up = [a - b for a, b in zip(to_file((0.0, 1.0, 0.0)), o)]
    nu = math.sqrt(sum(v * v for v in up))
    up = [v / nu for v in up]                      # the way up, in the file
    for i in range(n):
        a = 2 * math.pi * i / n
        c = to_file((centre[0] + ring[0] * math.cos(a), CAMERA_HEIGHT + 0.05 * math.sin(3 * a),
                     centre[1] + ring[1] * math.sin(a)))
        ahead = [p - q for p, q in zip(to_file((math.cos(a), 0.0, math.sin(a))), o)]
        z = [v / math.sqrt(sum(w * w for w in ahead)) for v in ahead]
        x = [up[1] * z[2] - up[2] * z[1], up[2] * z[0] - up[0] * z[2], up[0] * z[1] - up[1] * z[0]]
        nx = math.sqrt(sum(v * v for v in x))
        x = [v / nx for v in x]
        y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]]
        R = [x, y, z]                              # world -> camera rows
        t = [-sum(R[r][k] * c[k] for k in range(3)) for r in range(3)]
        out += struct.pack("<I7dI", i + 1, *_quat(R), *t, 1)
        out += f"frame_{i + 1:04d}.jpg".encode() + b"\0" + struct.pack("<Q", 0)
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(bytes(out))
    return path


def _quat(R):
    tr = R[0][0] + R[1][1] + R[2][2]
    if tr > 0:
        s = 0.5 / math.sqrt(tr + 1)
        return 0.25 / s, (R[2][1] - R[1][2]) * s, (R[0][2] - R[2][0]) * s, (R[1][0] - R[0][1]) * s
    if R[0][0] > R[1][1] and R[0][0] > R[2][2]:
        s = 2 * math.sqrt(1 + R[0][0] - R[1][1] - R[2][2])
        return (R[2][1] - R[1][2]) / s, 0.25 * s, (R[0][1] + R[1][0]) / s, (R[0][2] + R[2][0]) / s
    if R[1][1] > R[2][2]:
        s = 2 * math.sqrt(1 + R[1][1] - R[0][0] - R[2][2])
        return (R[0][2] - R[2][0]) / s, (R[0][1] + R[1][0]) / s, 0.25 * s, (R[1][2] + R[2][1]) / s
    s = 2 * math.sqrt(1 + R[2][2] - R[0][0] - R[1][1])
    return (R[1][0] - R[0][1]) / s, (R[0][2] + R[2][0]) / s, (R[1][2] + R[2][1]) / s, 0.25 * s


def _make_living_room(d: Path) -> Path:
    write_cameras(d / "dense" / "sparse" / "0" / "images.bin", ring=(0.7, 0.5), centre=(0.0, -0.3))
    return write_drawn(d / "splat" / PLY, splats)


def _samples() -> dict:
    """Each sample room's folder name: (its VERSION, its splat's name, what makes it in a run folder)."""
    from . import sample_studio, sample_venue
    return {NAME: (VERSION, PLY, _make_living_room),
            library.STUDIO: (sample_studio.VERSION, sample_studio.PLY, sample_studio.make),
            library.VENUE: (sample_venue.VERSION, sample_venue.PLY, sample_venue.make)}


def run_dir(data_dir: Path, name: str = NAME) -> Path:
    return Path(data_dir) / "workspace" / name / RUN


_lock = threading.Lock()
_making: dict = {}                  # data folder -> the process making the rooms there


def ready(data_dir: Path, name: str = NAME) -> bool:
    version, ply, _ = _samples()[name]
    d = run_dir(data_dir, name)
    try:
        return (d / "splat" / ply).is_file() and json.loads((d / "sample.json").read_text()).get("version") == version
    except (OSError, ValueError):
        return False


def start(data_dir: Path) -> bool:
    """Whether the sample rooms are there; if not, start making them in another process (a few
    seconds of work that would hold up the server's other requests)."""
    if all(ready(data_dir, name) for name in _samples()):
        return True
    with _lock:
        key = str(Path(data_dir).resolve())
        proc = _making.get(key)
        if proc is None or proc.poll() is not None:
            # (what went wrong, if anything, is kept in the data folder: sample_rooms.log)
            with open(Path(key) / "sample_rooms.log", "wb") as log:
                _making[key] = subprocess.Popen([sys.executable, "-m", "body_studio.sample_room", key],
                                                stdout=log, stderr=subprocess.STDOUT)
    return False


def ensure(data_dir: Path, name: str = NAME) -> Path:
    """A sample room's splat in the data folder (the living room unless named), made here and now
    if it isn't there yet."""
    with _lock:
        return _ensure(data_dir, name)


def ensure_all(data_dir: Path) -> list:
    return [ensure(data_dir, name) for name in _samples()]


def _ensure(data_dir: Path, name: str) -> Path:
    version, ply, make = _samples()[name]
    d = run_dir(data_dir, name)
    stamp = d / "sample.json"
    if ready(data_dir, name):
        return d / "splat" / ply
    d.mkdir(parents=True, exist_ok=True)
    library.mark_room(data_dir, name)              # before the splat, so it never shows as a body
    out = make(d)
    stamp.write_text(json.dumps({"version": version}))
    return out


if __name__ == "__main__":
    ensure_all(Path(sys.argv[1]))
