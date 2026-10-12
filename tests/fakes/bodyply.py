"""Writes a small synthetic splat shaped like a standing person (A-pose), in the standard 3DGS
PLY layout Brush exports: y-down like COLMAP data, with Brush's "Vertical axis" comment.
Used to look at the viewer without a real capture:  python tests/fakes/bodyply.py OUT.ply
"""
from __future__ import annotations

import math
import random
import struct
import sys
from pathlib import Path

C0 = 0.28209479177387814
PROPS = (["x", "y", "z", "nx", "ny", "nz", "f_dc_0", "f_dc_1", "f_dc_2"] + [f"f_rest_{i}" for i in range(45)]
         + ["opacity", "scale_0", "scale_1", "scale_2", "rot_0", "rot_1", "rot_2", "rot_3"])
SKIN, SHIRT, TROUSERS, HAIR = (0.86, 0.68, 0.56), (0.25, 0.42, 0.62), (0.22, 0.22, 0.26), (0.18, 0.12, 0.08)

# capsules: (start, end, radius, colour) in metres, y up, feet at 0
PARTS = [
    ((-0.10, 0.05, 0), (-0.11, 0.85, 0), 0.075, TROUSERS), ((0.10, 0.05, 0), (0.11, 0.85, 0), 0.075, TROUSERS),
    ((0, 0.92, 0), (0, 1.42, 0), 0.16, SHIRT),
    ((-0.20, 1.40, 0), (-0.42, 0.95, 0), 0.05, SHIRT), ((0.20, 1.40, 0), (0.42, 0.95, 0), 0.05, SHIRT),
    ((-0.42, 0.95, 0), (-0.50, 0.78, 0), 0.04, SKIN), ((0.42, 0.95, 0), (0.50, 0.78, 0), 0.04, SKIN),
    ((0, 1.45, 0), (0, 1.52, 0), 0.05, SKIN), ((0, 1.60, 0), (0, 1.66, 0), 0.10, SKIN),
    ((0, 1.70, -0.02), (0, 1.72, -0.03), 0.10, HAIR),
]


def _dc(c: float) -> float:
    return (c - 0.5) / C0


def write_body(path: Path, n: int = 40000, seed: int = 1) -> Path:
    rnd = random.Random(seed)
    lengths = [math.dist(a, b) + r for a, b, r, _ in PARTS]
    rows = []
    for _ in range(n):
        a, b, r, col = rnd.choices(PARTS, weights=lengths)[0]
        t = rnd.random()
        c = [a[i] + (b[i] - a[i]) * t for i in range(3)]
        u, v = rnd.uniform(-1, 1), rnd.random() * 2 * math.pi
        s = math.sqrt(1 - u * u)
        rows.append((c[0] + r * s * math.cos(v), c[1] + r * u, c[2] + r * s * math.sin(v), col))
    header = ("ply\nformat binary_little_endian 1.0\ncomment Exported from Brush\ncomment Vertical axis: 0 -1 0\n"
              f"element vertex {len(rows)}\n" + "".join(f"property float {p}\n" for p in PROPS) + "end_header\n")
    row = struct.Struct("<" + "f" * len(PROPS))
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    ls = math.log(0.008)
    with open(path, "wb") as f:
        f.write(header.encode())
        for x, y, z, col in rows:
            f.write(row.pack(x, -y, z, 0, 0, 0, *(_dc(c) for c in col), *([0.0] * 45), 4.0, ls, ls, ls, 1, 0, 0, 0))
    return path


if __name__ == "__main__":
    write_body(Path(sys.argv[1]))
