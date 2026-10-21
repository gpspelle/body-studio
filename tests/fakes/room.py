"""Writes a synthetic room filmed from inside it, as splat-studio leaves a room run: a splat PLY in
the layout Brush exports (y-down like COLMAP data, Brush's "Vertical axis" comment) and COLMAP's
images.bin with the camera path, held at 1.45 m and looking at the walls.

The room is 5 m by 4 m and 2.5 m high: a sofa along one wall (seat 45 cm high, a back), a chair
with a back, a table (top at 75 cm), a rug and a lamp hanging from the ceiling. It is stored in
arbitrary units (`unit` per metre) and turned by `yaw` about the vertical, as a real scan is, so a
map has to find the floor, the size and the walls by itself. Everything is listed in metres in
LAYOUT, for tests to check the map against.

    python tests/fakes/room.py OUT_RUN_DIR       writes OUT_RUN_DIR/splat/standard_30000_clean.ply
"""
from __future__ import annotations

import math
import random
import struct
import sys
from pathlib import Path

from body_studio.sample_room import write_cameras      # n cameras on a loop round the middle, 1.45 m up, looking out

C0 = 0.28209479177387814
PROPS = (["x", "y", "z", "nx", "ny", "nz", "f_dc_0", "f_dc_1", "f_dc_2"] + [f"f_rest_{i}" for i in range(45)]
         + ["opacity", "scale_0", "scale_1", "scale_2", "rot_0", "rot_1", "rot_2", "rot_3"])

W, D, CEIL = 5.0, 4.0, 2.5                      # room: x from -2.5 to 2.5, z from -2 to 2 (metres)
WALL, FLOOR, WOOD, FABRIC, RUG, LAMP = (0.86, 0.84, 0.78), (0.55, 0.40, 0.27), (0.42, 0.28, 0.18), \
    (0.30, 0.38, 0.55), (0.62, 0.30, 0.25), (0.95, 0.92, 0.80)
# boxes (x0, x1, y0, y1, z0, z1) in metres, and their colour
LAYOUT = {
    "sofa_seat": ((-1.0, 1.0, 0.0, 0.45, -2.0, -1.1), FABRIC),
    "sofa_back": ((-1.0, 1.0, 0.0, 0.85, -2.0, -1.8), FABRIC),
    "chair_seat": ((1.6, 2.05, 0.42, 0.46, 0.6, 1.05), WOOD),
    "chair_back": ((2.0, 2.05, 0.46, 0.95, 0.6, 1.05), WOOD),
    "table_top": ((-2.0, -0.8, 0.72, 0.75, 0.6, 1.4), WOOD),
    "rug": ((-0.8, 0.8, 0.0, 0.01, -0.6, 0.4), RUG),
    "lamp": ((-0.15, 0.15, 2.1, 2.5, -0.15, 0.15), LAMP),
}
LEGS = [((x, x + 0.04, 0.0, 0.42, z, z + 0.04), WOOD) for x in (1.6, 2.01) for z in (0.6, 1.01)] + \
       [((x, x + 0.05, 0.0, 0.72, z, z + 0.05), WOOD) for x in (-2.0, -0.85) for z in (0.6, 1.35)]
CAMERA_HEIGHT = 1.45
SEATS = {"sofa": (0.45, (0.0, 1.0)), "chair": (0.46, (-1.0, 0.0))}   # height, which way the sitter faces (x, z)


def _dc(c: float) -> float:
    return (c - 0.5) / C0


def _box_surface(rnd, box, n):
    """n points on the faces of a box, spread by area."""
    x0, x1, y0, y1, z0, z1 = box
    faces = [("y", y1, (x0, x1), (z0, z1)), ("y", y0, (x0, x1), (z0, z1)),
             ("x", x0, (y0, y1), (z0, z1)), ("x", x1, (y0, y1), (z0, z1)),
             ("z", z0, (x0, x1), (y0, y1)), ("z", z1, (x0, x1), (y0, y1))]
    area = [(a[1] - a[0]) * (b[1] - b[0]) for _, _, a, b in faces]
    out = []
    for _ in range(n):
        axis, v, a, b = rnd.choices(faces, weights=area)[0]
        u, w = rnd.uniform(*a), rnd.uniform(*b)
        out.append({"y": (u, v, w), "x": (v, u, w), "z": (u, w, v)}[axis])
    return out


def points(n: int = 200000, seed: int = 2) -> list:
    """(x, y, z, colour) in metres, y up, the floor at 0."""
    rnd = random.Random(seed)
    parts = [((-W / 2, W / 2, 0, 0, -D / 2, D / 2), FLOOR), ((-W / 2, W / 2, CEIL, CEIL, -D / 2, D / 2), WALL)]
    walls = [((-W / 2, W / 2, 0, CEIL, -D / 2, -D / 2), WALL), ((-W / 2, W / 2, 0, CEIL, D / 2, D / 2), WALL),
             ((-W / 2, -W / 2, 0, CEIL, -D / 2, D / 2), WALL), ((W / 2, W / 2, 0, CEIL, -D / 2, D / 2), WALL)]
    parts += walls + list(LAYOUT.values()) + LEGS

    def area(b):
        x0, x1, y0, y1, z0, z1 = b
        return 2 * ((x1 - x0) * (z1 - z0) + (x1 - x0) * (y1 - y0) + (y1 - y0) * (z1 - z0)) or 1e-6
    total = sum(area(b) for b, _ in parts)
    out = []
    for box, col in parts:
        k = max(30, round(n * area(box) / total))
        for p in _box_surface(rnd, box, k):
            out.append((*p, tuple(min(1, max(0, c + rnd.uniform(-0.04, 0.04))) for c in col)))
    return out


def _to_file(p, unit, yaw):
    """Metres (y up) -> the file's units: turned by yaw about up, scaled, y-down."""
    x, y, z = p
    c, s = math.cos(yaw), math.sin(yaw)
    return ((c * x + s * z) * unit, -y * unit, (-s * x + c * z) * unit)


def write_room(run_dir: Path, n: int = 200000, unit: float = 2.5, yaw: float = 0.4, seed: int = 2,
               cameras: bool = True, name: str = "standard_30000_clean.ply") -> Path:
    run_dir = Path(run_dir)
    rows = [(*_to_file(p[:3], unit, yaw), p[3]) for p in points(n, seed)]
    header = ("ply\nformat binary_little_endian 1.0\ncomment Exported from Brush\ncomment Vertical axis: 0 -1 0\n"
              f"element vertex {len(rows)}\n" + "".join(f"property float {p}\n" for p in PROPS) + "end_header\n")
    row = struct.Struct("<" + "f" * len(PROPS))
    path = run_dir / "splat" / name
    path.parent.mkdir(parents=True, exist_ok=True)
    ls = math.log(0.018 * unit)
    with open(path, "wb") as f:
        f.write(header.encode())
        for x, y, z, col in rows:
            f.write(row.pack(x, y, z, 0, 0, 0, *(_dc(c) for c in col), *([0.0] * 45), 4.0, ls, ls, ls, 1, 0, 0, 0))
    if cameras:
        write_cameras(run_dir / "dense" / "sparse" / "0" / "images.bin", to_file=lambda p: _to_file(p, unit, yaw))
    return path


if __name__ == "__main__":
    print(write_room(Path(sys.argv[1] if len(sys.argv) > 1 else "room_run")))
