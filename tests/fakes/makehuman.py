"""A realistic test body: the MakeHuman base mesh (hm08, released as CC0 by the MakeHuman team in
2020, https://github.com/makehumancommunity/makehuman) standing in an A-pose, with the
positions of its joints. Turned into a splat PLY like the ones Brush writes, it checks that
the skeleton finder (body_studio.rig) puts joints where an artist did.

    python tests/fakes/makehuman.py OUT.ply [--shape heavy|slim] [--yaw 30] [--arms -20]

makehuman_body.bin.gz holds the body surface (vertices and quads of the "body" group), the
joint centres and two body-shape targets (heavy man, slim woman). It was packed from the
MakeHuman repository with `python tests/fakes/makehuman.py --pack MAKEHUMAN/makehuman/data`.
"""
from __future__ import annotations

import argparse
import gzip
import math
import random
import struct
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PACKED = HERE / "makehuman_body.bin.gz"
SCALE = 2000                    # MakeHuman units (decimetres) to int16
SHAPES = {"heavy": "universal-male-young-averagemuscle-maxweight",
          "slim": "universal-female-young-minmuscle-minweight"}
# MakeHuman joint names (its "l-" side is the person's right) for the joints the rig finds
JOINTS = {"hip_l": "r-upper-leg", "knee_l": "r-knee", "ankle_l": "r-ankle", "shoulder_l": "r-shoulder",
          "elbow_l": "r-elbow", "wrist_l": "r-hand", "clavicle_l": "r-clavicle",
          "hip_r": "l-upper-leg", "knee_r": "l-knee", "ankle_r": "l-ankle", "shoulder_r": "l-shoulder",
          "elbow_r": "l-elbow", "wrist_r": "l-hand", "clavicle_r": "l-clavicle", "neck": "neck", "head": "head"}
ARM = ("elbow", "hand", "finger")


def pack(data: Path, out: Path = PACKED) -> None:
    """Pack base.obj and the shape targets from a MakeHuman checkout (only needed to remake the file)."""
    V, groups, cur = [], {}, None
    for line in open(data / "3dobjs" / "base.obj"):
        if line.startswith("v "):
            V.append([float(x) for x in line.split()[1:4]])
        elif line.startswith("g "):
            cur = line.split()[1]
        elif line.startswith("f "):
            groups.setdefault(cur, []).append([int(t.split("/")[0]) - 1 for t in line.split()[1:]])
    joints = {}
    for g, faces in groups.items():
        if g.startswith("joint-"):
            ids = {i for f in faces for i in f}
            joints[g[6:]] = [sum(V[i][k] for i in ids) / len(ids) for k in range(3)]
    used = sorted({i for f in groups["body"] for i in f})
    remap = {old: new for new, old in enumerate(used)}
    quads = [[remap[i] for i in (f + f[-1:])[:4]] for f in groups["body"]]
    targets = {}
    for name, fname in SHAPES.items():
        rows = []
        for line in open(data / "targets" / "macrodetails" / (fname + ".target")):
            if line.strip() and not line.startswith("#"):
                i, *d = line.split()
                if int(i) in remap:
                    rows.append((remap[int(i)], *(float(x) for x in d)))
        targets[name] = rows
    buf = bytearray(b"MHB1" + struct.pack("<III", len(used), len(quads), len(joints)))
    for i in used:
        buf += struct.pack("<3h", *(round(c * SCALE) for c in V[i]))
    for f in quads:
        buf += struct.pack("<4H", *f)
    for name, p in sorted(joints.items()):
        enc = name.encode()
        buf += struct.pack("<B", len(enc)) + enc + struct.pack("<3h", *(round(c * SCALE) for c in p))
    for name in sorted(targets):
        enc = name.encode()
        buf += struct.pack("<BI", len(enc), len(targets[name])) + enc
        for i, *d in targets[name]:
            buf += struct.pack("<H3h", i, *(round(c * SCALE) for c in d))
    out.write_bytes(gzip.compress(bytes(buf), 9))


def load(shape: str | None = None):
    """Vertices (decimetres, y up, the person facing +z), quads and joint centres."""
    b = gzip.decompress(PACKED.read_bytes())
    assert b[:4] == b"MHB1"
    nv, nf, nj = struct.unpack_from("<III", b, 4)
    o = 16
    V = [[c / SCALE for c in struct.unpack_from("<3h", b, o + 6 * i)] for i in range(nv)]
    o += 6 * nv
    Q = [list(struct.unpack_from("<4H", b, o + 8 * i)) for i in range(nf)]
    o += 8 * nf
    J = {}
    for _ in range(nj):
        n = b[o]
        name = b[o + 1:o + 1 + n].decode()
        J[name] = [c / SCALE for c in struct.unpack_from("<3h", b, o + 1 + n)]
        o += 1 + n + 6
    while o < len(b):
        n, count = struct.unpack_from("<BI", b, o)
        name = b[o + 5:o + 5 + n].decode()
        o += 5 + n
        for k in range(count):
            i, *d = struct.unpack_from("<H3h", b, o + 8 * k)
            if name == shape:
                for a in range(3):
                    V[i][a] += d[a] / SCALE
        o += 8 * count
    return V, Q, J


def _raise_arms(V, J, degrees):
    """Swing both arms about the shoulders in the frontal plane (negative: toward the body)."""
    keys = list(J)
    for side in ("l", "r"):
        sh = J[side + "-shoulder"]
        sgn = 1 if sh[0] > 0 else -1
        c, s = math.cos(math.radians(degrees) * sgn), math.sin(math.radians(degrees) * sgn)
        arm = {k for k in keys if k.startswith(side + "-") and any(w in k for w in ARM)} | {side + "-shoulder"}
        moved = [v for v in V + [J[k] for k in arm if k != side + "-shoulder"]
                 if (lambda near: near in arm and (near != side + "-shoulder" or sgn * (v[0] - sh[0]) > -0.3))(
                     min(keys, key=lambda k: (v[0] - J[k][0]) ** 2 + (v[1] - J[k][1]) ** 2 + (v[2] - J[k][2]) ** 2))]
        for v in moved:
            dx, dy = v[0] - sh[0], v[1] - sh[1]
            v[0], v[1] = sh[0] + c * dx - s * dy, sh[1] + s * dx + c * dy


def write_body(path: Path, n: int = 120000, seed: int = 1, yaw: float = 0.0, shape: str | None = None,
               arms: float = 0.0, height: float = 1.75) -> dict:
    """Write the body as a splat PLY (Brush's layout: y-down, 'Vertical axis' comment) turned by
    `yaw` degrees about the vertical, with a thin noisy shell and a few stray splats like a real
    capture. Returns the joint centres in the PLY's coordinates, named as in body_studio.rig."""
    from tests.fakes.bodyply import PROPS, _dc
    rnd = random.Random(seed)
    V, Q, J = load(shape)
    if arms:
        _raise_arms(V, J, arms)
    tris = [t for f in Q for t in ((f[0], f[1], f[2]), (f[0], f[2], f[3])) if len(set(t)) == 3]
    ys = [v[1] for v in V]
    lo, hi = min(ys), max(ys)
    k = height / (hi - lo)
    cy, sy = math.cos(math.radians(yaw)), math.sin(math.radians(yaw))

    def xf(p):          # metres, feet at 0, turned, then y-down like COLMAP with an offset
        x, y, z = p[0] * k, (p[1] - lo) * k, p[2] * k
        x, z = cy * x + sy * z, -sy * x + cy * z
        return (x + 0.3, -y + 0.1, z - 0.2)

    def area_normal(t):
        a, b, c = (V[i] for i in t)
        u, w = [b[j] - a[j] for j in range(3)], [c[j] - a[j] for j in range(3)]
        cr = (u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0])
        m = math.sqrt(sum(x * x for x in cr)) or 1e-12
        return m / 2, tuple(x / m for x in cr)
    an = [area_normal(t) for t in tris]
    light = (0.36, 0.80, 0.48)
    skin = (0.80, 0.62, 0.52)
    rows = []
    for ti in rnd.choices(range(len(tris)), weights=[a for a, _ in an], k=n):
        t, nrm = tris[ti], an[ti][1]
        r1, r2 = rnd.random(), rnd.random()
        if r1 + r2 > 1:
            r1, r2 = 1 - r1, 1 - r2
        p = [V[t[0]][j] + r1 * (V[t[1]][j] - V[t[0]][j]) + r2 * (V[t[2]][j] - V[t[0]][j]) for j in range(3)]
        d = (rnd.gauss(0, 0.003) - abs(rnd.gauss(0, 0.003))) / k          # a shell a few mm thick
        p = [p[j] + d * nrm[j] for j in range(3)]
        shade = 0.62 + 0.38 * max(0.0, sum(nrm[j] * light[j] for j in range(3)))
        rows.append((xf(p), [min(1.0, c * shade + rnd.gauss(0, 0.02)) for c in skin], 4.0))
    for _ in range(n // 100):                                             # stray splats near the body
        p = rows[rnd.randrange(n)][0]
        rows.append((tuple(c + rnd.gauss(0, 0.03) for c in p), skin, -1.0))
    header = ("ply\nformat binary_little_endian 1.0\ncomment Exported from Brush\ncomment Vertical axis: 0 -1 0\n"
              f"element vertex {len(rows)}\n" + "".join(f"property float {p}\n" for p in PROPS) + "end_header\n")
    row = struct.Struct("<" + "f" * len(PROPS))
    ls = math.log(0.003)
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "wb") as f:
        f.write(header.encode())
        for (x, y, z), col, op in rows:
            f.write(row.pack(x, y, z, 0, 0, 0, *(_dc(c) for c in col), *([0.0] * 45), op, ls, ls, ls, 1, 0, 0, 0))
    return {ours: xf(J[theirs]) for ours, theirs in JOINTS.items()}


if __name__ == "__main__":
    sys.path.insert(0, str(HERE.parent.parent))
    ap = argparse.ArgumentParser()
    ap.add_argument("out", nargs="?")
    ap.add_argument("--pack", type=Path, help="MakeHuman data folder to pack from")
    ap.add_argument("--shape", choices=sorted(SHAPES))
    ap.add_argument("--yaw", type=float, default=0.0)
    ap.add_argument("--arms", type=float, default=0.0)
    ap.add_argument("-n", type=int, default=200000)
    a = ap.parse_args()
    if a.pack:
        pack(a.pack)
    else:
        write_body(Path(a.out), n=a.n, yaw=a.yaw, shape=a.shape, arms=a.arms)
