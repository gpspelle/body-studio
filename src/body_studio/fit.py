"""MakeHuman's base mesh fitted to a finished body, so clothes, shoes and hair made for that mesh
can be put on the person (experimental).

    body-studio fit BODY.ply        writes BODY.fit.json next to the body

No body model and no download. The base mesh (hm08, CC0, shipped in body_studio/wardrobe/) gets a
skeleton and skin weights by the same method as a scan (rig.py), so its joints mean the same as
the scan's. Then, once per body:

1. Every bone of the base mesh is turned onto the scan's bone, stretched to its length and scaled
   across by the ratio of the two heights; each vertex follows its bones by its skin weights.
2. Each skin vertex moves along its normal onto the nearest layer of the scan's splats, and those
   moves are smoothed over the mesh, so a vertex with no splats in front of it (a gap, the soles)
   moves with its neighbours. Done twice, the second time closer in.
3. The helper geometry that clothes and hair are bound to (tights, skirt, hair cap) follows the
   skin under it.

Positions are kept in the scan's body coordinates (x to the person's left, y up from the soles,
z to the front; rig.py) with the scan's frame, plus a rotation per vertex (how much its limb
turned) for the clothes' offsets. Design and sources: docs/wardrobe.md.
"""
from __future__ import annotations

import argparse
import base64
import json
import math
import random
import sys
from array import array
from functools import lru_cache
from pathlib import Path

from . import rig, wardrobe

FIT_VERSION = 1
SAMPLES = 100000        # points on the base mesh for its skeleton and weights
PASSES = (0.06, 0.025)  # how far (fraction of stature) a vertex looks along its normal, per pass
LATERAL = 0.006         # splats this close to the normal's line count (fraction of stature)
SMOOTH = 40             # smoothing steps of the moves over the mesh
MAX_SPLATS = 150000     # opaque splats used (every n-th, beyond this)


class FitError(ValueError):
    def __init__(self, message: str, code: str = "shape"):
        super().__init__(message)
        self.code = code


def _q_between(a, b):
    d = rig._dot(a, b)
    if d < -0.999999:
        ax = rig._cross((1.0, 0.0, 0.0), a)
        if rig._dot(ax, ax) < 1e-12:
            ax = rig._cross((0.0, 1.0, 0.0), a)
        ax = rig._unit(ax)
        return (ax[0], ax[1], ax[2], 0.0)
    c = rig._cross(a, b)
    n = math.sqrt(c[0] ** 2 + c[1] ** 2 + c[2] ** 2 + (1 + d) ** 2)
    return (c[0] / n, c[1] / n, c[2] / n, (1 + d) / n)


def _q_rot(q, v):
    x, y, z, w = q
    tx, ty, tz = 2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])
    return (v[0] + w * tx + y * tz - z * ty, v[1] + w * ty + z * tx - x * tz, v[2] + w * tz + x * ty - y * tx)


class _Hash:
    """Points in cubic cells, for neighbour searches."""

    def __init__(self, pts, size):
        self.size, self.cells, self.pts = size, {}, pts
        for i, p in enumerate(pts):
            self.cells.setdefault(self.key(p), []).append(i)

    def key(self, p):
        s = self.size
        return (int(math.floor(p[0] / s)), int(math.floor(p[1] / s)), int(math.floor(p[2] / s)))

    def near(self, p, rings=1):
        cx, cy, cz = self.key(p)
        for dx in range(-rings, rings + 1):
            for dy in range(-rings, rings + 1):
                for dz in range(-rings, rings + 1):
                    yield from self.cells.get((cx + dx, cy + dy, cz + dz), ())


def _sample(V, tris, n, rnd):
    """n points on the triangles, spread by area."""
    area = []
    for t in range(len(tris) // 3):
        a, b, c = (V[tris[3 * t + k]] for k in range(3))
        cr = rig._cross(rig._sub(b, a), rig._sub(c, a))
        area.append(0.5 * math.sqrt(rig._dot(cr, cr)))
    xs, ys, zs = array("f"), array("f"), array("f")
    for t in rnd.choices(range(len(area)), weights=area, k=n):
        a, b, c = (V[tris[3 * t + k]] for k in range(3))
        r1, r2 = rnd.random(), rnd.random()
        if r1 + r2 > 1:
            r1, r2 = 1 - r1, 1 - r2
        for out, k in ((xs, 0), (ys, 1), (zs, 2)):
            out.append(a[k] + r1 * (b[k] - a[k]) + r2 * (c[k] - a[k]))
    return xs, ys, zs


def _neighbours(tris, n):
    nb = [set() for _ in range(n)]
    for t in range(len(tris) // 3):
        a, b, c = tris[3 * t], tris[3 * t + 1], tris[3 * t + 2]
        nb[a].update((b, c)); nb[b].update((a, c)); nb[c].update((a, b))
    return [sorted(s) for s in nb]


def _normals(P, tris, n):
    N = [[0.0, 0.0, 0.0] for _ in range(n)]
    for t in range(len(tris) // 3):
        a, b, c = tris[3 * t], tris[3 * t + 1], tris[3 * t + 2]
        cr = rig._cross(rig._sub(P[b], P[a]), rig._sub(P[c], P[a]))          # area weighted
        for i in (a, b, c):
            N[i][0] += cr[0]; N[i][1] += cr[1]; N[i][2] += cr[2]
    return [rig._unit(v) if any(v) else (0.0, 1.0, 0.0) for v in N]


def _weights_at(grid, weights, p, segs):
    """Skin weights at a point: the blend of the voxels around it, else the nearest bone."""
    acc = {}
    f = [(p[k] - grid.lo[k]) / grid.size - 0.5 for k in range(3)]
    i0 = [int(math.floor(x)) for x in f]
    for c in range(8):
        ijk = [i0[k] + ((c >> k) & 1) for k in range(3)]
        if any(ijk[k] < 0 or ijk[k] >= grid.n[k] for k in range(3)):
            continue
        frac = 1.0
        for k in range(3):
            t = f[k] - i0[k]
            frac *= t if (c >> k) & 1 else 1 - t
        w = weights.get((ijk[0] * grid.n[1] + ijk[1]) * grid.n[2] + ijk[2])
        if w and frac > 0:
            for b, x in w:
                acc[b] = acc.get(b, 0.0) + frac * x
    if not acc:
        b = min(segs, key=lambda b: min(rig._seg_dist(p, s, e) for s, e in segs[b]))
        return [(b, 1.0)]
    top = sorted(acc.items(), key=lambda t: -t[1])[:4]
    s = sum(x for _, x in top)
    return [(b, x / s) for b, x in top]


@lru_cache(maxsize=1)
def base_rig() -> dict:
    """The base mesh in its own body coordinates, with its skeleton and per-vertex weights
    (found exactly as for a scan), its skin's neighbours, and for every helper vertex the skin
    vertices it follows."""
    B = wardrobe.base()
    V, tris, nb = B["verts"], B["tris"], B["n_body"]
    xs, ys, zs = _sample(V, tris, SAMPLES, random.Random(0))
    opaque = range(len(xs))
    fr = rig.body_frame(xs, ys, zs, opaque, (0.0, 1.0, 0.0))
    H = fr["height"]
    X, Y, Z = rig.to_body(fr, xs, ys, zs)
    J = rig.find_joints(X, Y, Z, list(opaque), H)
    lo = [min(min(X), min(c[0] for c in J.values())), min(Y), min(Z)]
    hi = [max(max(X), max(c[0] for c in J.values())), max(Y), max(Z)]
    grid = rig.Grid(lo, hi, rig.VOXEL * H)
    solid = rig.solid_voxels(grid, X, Y, Z, list(opaque))
    weights = rig.bind(grid, solid, J, H)
    segs = rig.bone_segments(J)
    Xa, Ya, Za = rig.to_body(fr, [v[0] for v in V], [v[1] for v in V], [v[2] for v in V])
    P = [(Xa[i], Ya[i], Za[i]) for i in range(len(V))]
    W = [_weights_at(grid, weights, P[i], segs) for i in range(nb)]
    nbrs = _neighbours(tris, nb)
    for _ in range(3):                                      # smooth along the skin
        nxt = []
        for i in range(nb):
            acc = {}
            for j in [i, i] + nbrs[i]:
                for b, x in W[j]:
                    acc[b] = acc.get(b, 0.0) + x
            top = sorted(acc.items(), key=lambda t: -t[1])[:4]
            s = sum(x for _, x in top)
            nxt.append([(b, x / s) for b, x in top])
        W = nxt
    # helpers (tights, skirt, hair cap, eyes…) follow the nearest few skin vertices
    hs = _Hash(P[:nb], 0.03 * H)
    follow = []
    for i in range(nb, len(P)):
        best = []
        rings = 1
        while len(best) < 4 and rings < 8:
            best = sorted(hs.near(P[i], rings), key=lambda j: _d2(P[i], P[j]))[:4]
            rings += 2
        ws = [1.0 / (math.sqrt(_d2(P[i], P[j])) + 0.002 * H) for j in best]
        s = sum(ws)
        follow.append([(j, w / s) for j, w in zip(best, ws)])
    for i in range(nb, len(P)):
        acc = {}
        for j, f in follow[i - nb]:
            for b, x in W[j]:
                acc[b] = acc.get(b, 0.0) + f * x
        top = sorted(acc.items(), key=lambda t: -t[1])[:4]
        s = sum(x for _, x in top)
        W.append([(b, x / s) for b, x in top])
    # MakeHuman's axes in these body coordinates (clothes' offsets are written in them)
    axes = [tuple(rig._dot(e, (fr["left"], fr["up"], fr["front"])[k]) for k in range(3))
            for e in ((1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0))]
    return {"P": P, "J": J, "H": H, "W": W, "tris": tris, "n_body": nb, "nbrs": nbrs, "follow": follow,
            "axes": axes}


def _d2(a, b):
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2


def bone_transforms(Jb: dict, Hb: float, Js: dict, Hs: float) -> dict:
    """For every bone: x -> a_s + q * (g (x - a_b) + (s - g) ((x - a_b).u) u), turning the base
    mesh's bone onto the scan's, stretched to its length (s) and scaled across by the heights (g)."""
    names = [n for n, _ in rig.JOINTS]
    g = Hs / Hb
    out = {}
    for b in rig.BONES:
        c = rig.PRIMARY[b]
        ab, eb, as_, es = Jb[names[b]], Jb[names[c]], Js[names[b]], Js[names[c]]
        lb, ls = math.dist(ab, eb), math.dist(as_, es)
        u, v = rig._unit(rig._sub(eb, ab)), rig._unit(rig._sub(es, as_))
        out[b] = {"a": ab, "to": as_, "q": _q_between(u, v), "u": u, "s": ls / lb if lb > 0 else g, "g": g}
    return out


def _apply(T, p):
    d = rig._sub(p, T["a"])
    along = rig._dot(d, T["u"]) * (T["s"] - T["g"])
    x = (T["g"] * d[0] + along * T["u"][0], T["g"] * d[1] + along * T["u"][1], T["g"] * d[2] + along * T["u"][2])
    return rig._add(T["to"], _q_rot(T["q"], x))


def _blend_q(qs):
    """Weighted quaternion blend (signs aligned to the heaviest), normalised."""
    acc = [0.0, 0.0, 0.0, 0.0]
    ref = None
    for q, w in qs:
        if ref is None:
            ref = q
        s = w if sum(q[k] * ref[k] for k in range(4)) >= 0 else -w
        for k in range(4):
            acc[k] += s * q[k]
    n = math.sqrt(sum(x * x for x in acc)) or 1.0
    return tuple(x / n for x in acc)


def shrinkwrap(P, tris, nb, nbrs, pts, hsh, H, reach):
    """Move skin vertices along their normals onto the nearest layer of points; moves are
    smoothed over the mesh (a vertex with no points in front of it moves with its neighbours)."""
    N = _normals(P, tris, nb)
    lat2 = (LATERAL * H) ** 2
    R = reach * H
    step = 0.5 * hsh.size
    meas, conf = [0.0] * nb, [0.0] * nb
    for i in range(nb):
        p, n = P[i], N[i]
        seen = set()
        k = -R
        while k <= R:
            seen.update(hsh.cells.get(hsh.key((p[0] + k * n[0], p[1] + k * n[1], p[2] + k * n[2])), ()))
            k += step
        ts = []
        for j in seen:
            d = rig._sub(pts[j], p)
            t = rig._dot(d, n)
            if abs(t) <= R and rig._dot(d, d) - t * t <= lat2:
                ts.append(t)
        if len(ts) >= 2:
            ts.sort(key=abs)
            near = sorted(ts[:max(2, len(ts) // 8)])
            meas[i], conf[i] = near[len(near) // 2], 1.0
    d = meas[:]
    lam = 2.0
    for _ in range(SMOOTH):
        d = [(lam * conf[i] * meas[i] + sum(d[j] for j in nbrs[i])) / (lam * conf[i] + len(nbrs[i]) or 1.0)
             for i in range(nb)]
    return [rig._add(P[i], rig._mul(N[i], max(-R, min(R, d[i])))) for i in range(nb)], sum(conf) / nb


def fit_splats(rig_json: dict, xs, ys, zs, opacity) -> dict:
    """The fitted base mesh for a body whose rig is `rig_json` (rig.py's file) and whose splat
    centres and opacities are given (PLY coordinates)."""
    base = base_rig()
    fr = {k: tuple(v) for k, v in rig_json["frame"].items() if k in ("origin", "left", "up", "front")}
    Hs = rig_json["height"]
    o, L, U, F = fr["origin"], fr["left"], fr["up"], fr["front"]

    def body(p):
        d = rig._sub(p, o)
        return (rig._dot(d, L), rig._dot(d, U), rig._dot(d, F))
    Js = {j["name"]: body(j["pos"]) for j in rig_json["joints"]}
    opaque = [i for i, a in enumerate(opacity) if a >= 0.5]
    if len(opaque) < 2000:
        raise FitError("too few splats to fit the body", "few")
    stride = max(1, len(opaque) // MAX_SPLATS)
    pts = [body((xs[i], ys[i], zs[i])) for i in opaque[::stride]]
    T = bone_transforms(base["J"], base["H"], Js, Hs)
    P0, W, nb = base["P"], base["W"], base["n_body"]
    P, Q = [], []
    for i, p in enumerate(P0):
        x = [0.0, 0.0, 0.0]
        for b, w in W[i]:
            y = _apply(T[b], p)
            x[0] += w * y[0]; x[1] += w * y[1]; x[2] += w * y[2]
        P.append(tuple(x))
        Q.append(_blend_q([(T[b]["q"], w) for b, w in W[i]]))
    lbs = P
    skin = P[:nb]
    hsh = _Hash(pts, 0.01 * Hs)
    hit = 0.0
    for reach in PASSES:
        skin, hit = shrinkwrap(skin, base["tris"], nb, base["nbrs"], pts, hsh, Hs, reach)
    if hit < 0.5:
        raise FitError("the body's surface wasn't found around most of the base mesh", "shape")
    out = list(skin)
    for i in range(nb, len(P0)):
        move = [0.0, 0.0, 0.0]
        for j, f in base["follow"][i - nb]:
            for k in range(3):
                move[k] += f * (skin[j][k] - lbs[j][k])
        out.append(rig._add(lbs[i], move))
    return {"verts": out, "rot": Q, "axes": base["axes"], "frame": fr, "height": Hs, "n_body": nb,
            "surface_found": round(hit, 3)}


def build(ply: Path) -> dict:
    r = rig.cached(ply) or rig.build_and_save(ply)
    d = rig.load_splats(ply)
    return encode(fit_splats(r, d["x"], d["y"], d["z"], d["opacity"]))


def _b64(a: array) -> str:
    if sys.byteorder != "little":
        a = array(a.typecode, a)
        a.byteswap()
    return base64.b64encode(a.tobytes()).decode()


def encode(f: dict) -> dict:
    return {"version": FIT_VERSION, "height": f["height"], "n_body": f["n_body"], "frame": f["frame"],
            "axes": f["axes"], "surface_found": f["surface_found"],
            "verts": _b64(array("f", (c for p in f["verts"] for c in p))),
            "rot": _b64(array("f", (c for q in f["rot"] for c in q)))}


def decode(d: dict) -> dict:
    V, R = array("f"), array("f")
    V.frombytes(base64.b64decode(d["verts"]))
    R.frombytes(base64.b64decode(d["rot"]))
    if sys.byteorder != "little":
        V.byteswap(); R.byteswap()
    fr = d["frame"]
    o, L, U, F = fr["origin"], fr["left"], fr["up"], fr["front"]
    return {"verts": [(V[3 * i], V[3 * i + 1], V[3 * i + 2]) for i in range(len(V) // 3)],
            "rot": [(R[4 * i], R[4 * i + 1], R[4 * i + 2], R[4 * i + 3]) for i in range(len(R) // 4)],
            "axes": d["axes"], "height": d["height"], "n_body": d["n_body"], "frame": fr,
            "to_model": lambda p: tuple(o[k] + L[k] * p[0] + U[k] * p[1] + F[k] * p[2] for k in range(3))}


def fit_file(ply: Path) -> Path:
    return Path(ply).with_name(Path(ply).stem + ".fit.json")


def current(ply: Path) -> bool:
    """Whether the saved fit is newer than the body (and its rig) and of this version."""
    f = fit_file(ply)
    try:
        if f.stat().st_mtime < Path(ply).stat().st_mtime:
            return False
        with open(f, "rb") as fh:
            return fh.read(32).startswith(b'{"version":%d,' % FIT_VERSION)
    except OSError:
        return False


def cached(ply: Path) -> dict | None:
    if not current(ply):
        return None
    try:
        return json.loads(fit_file(ply).read_text())
    except (OSError, ValueError):
        return None


def build_and_save(ply: Path) -> dict:
    r = build(ply)
    f = fit_file(ply)
    tmp = f.with_name(f.name + ".tmp")
    tmp.write_text(json.dumps(r, separators=(",", ":")))
    tmp.replace(f)
    return r


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(prog="body-studio fit",
                                 description="Fit MakeHuman's base mesh to a finished body, so clothes, shoes and "
                                             "hair can be tried on it (experimental). Writes BODY.fit.json next "
                                             "to the body (and BODY.rig.json if it isn't there yet).")
    ap.add_argument("ply", type=Path, help="the body: workspace/<video>/run_*/splat/*_object.ply")
    a = ap.parse_args(argv)
    try:
        r = build_and_save(a.ply)
    except (rig.RigError, FitError) as e:
        sys.exit(f"Can't fit this body: {e}")
    print(f"Fitted: the body's surface was found under {round(100 * r['surface_found'])}% of the base mesh.")
    print(f"Saved {fit_file(a.ply)}")
