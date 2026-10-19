"""A skeleton, skin weights and a surface map for a finished body, so the page can pose the
body and wrap a tattoo around it (experimental).

    body-studio rig BODY.ply        writes BODY.rig.json next to the body and prints the joints

No body model and no download: the person stands in an A-pose (the capture guide asks for
it), so the joints are found from the shape. The body is cut into thin horizontal slices; each
slice falls apart into pieces (two legs, a trunk, two arms), and following the pieces from slice
to slice gives the crotch, the armpits, the fingertips and the centre line of every limb. Joints
are placed on those centre lines with adult segment proportions (Winter, "Biomechanics and
Motor Control of Human Movement"), and the wrist is moved to the narrowest slice near it.

Skin weights follow geodesic voxel binding (Dionne & de Lasa, SCA 2013): the body is filled in
as voxels, and each bone's influence falls off with the distance travelled *inside* the body,
so a hand resting near the hip doesn't move with the leg. Every splat then takes the weights of
the voxels around it; the page skins splats with Spark's dual quaternion skinning.

The surface map is, for every bone, the body's radius around the bone axis at each height and
angle (and the skin colour there): a tattoo is laid on it with its real size, without being
stretched around a limb. The trunk and each leg also get one map across their bones, so a
big tattoo isn't cut where one bone's map ends. Research and sources: docs/tattoo.md.

All positions in the rig are in the PLY's own coordinates, so the page uses them as they are.
"""
from __future__ import annotations

import argparse
import base64
import heapq
import json
import math
import sys
from array import array
from pathlib import Path

RIG_VERSION = 2          # 2: region maps (trunk, legs) for big tattoos

# (name, parent). Joints with children are bones: they rotate and carry skin weights. The
# "_end" joints only mark where the last bone of a chain ends (top of the head, fingertips, toes).
JOINTS = [
    ("pelvis", None), ("spine", "pelvis"), ("chest", "spine"), ("neck", "chest"), ("head", "neck"),
    ("head_end", "head"),
    ("clavicle_l", "chest"), ("shoulder_l", "clavicle_l"), ("elbow_l", "shoulder_l"), ("wrist_l", "elbow_l"),
    ("hand_end_l", "wrist_l"),
    ("clavicle_r", "chest"), ("shoulder_r", "clavicle_r"), ("elbow_r", "shoulder_r"), ("wrist_r", "elbow_r"),
    ("hand_end_r", "wrist_r"),
    ("hip_l", "pelvis"), ("knee_l", "hip_l"), ("ankle_l", "knee_l"), ("toe_end_l", "ankle_l"),
    ("hip_r", "pelvis"), ("knee_r", "hip_r"), ("ankle_r", "knee_r"), ("toe_end_r", "ankle_r"),
]
INDEX = {n: i for i, (n, _) in enumerate(JOINTS)}
PARENT = [INDEX[p] if p else -1 for _, p in JOINTS]
CHILDREN = [[i for i, p in enumerate(PARENT) if p == j] for j in range(len(JOINTS))]
BONES = [i for i in range(len(JOINTS)) if CHILDREN[i]]
# the child a bone points at (its axis for the surface map and for posing)
PRIMARY = {i: CHILDREN[i][0] for i in BONES}
PRIMARY[INDEX["pelvis"]] = INDEX["spine"]
PRIMARY[INDEX["chest"]] = INDEX["neck"]

# Segment lengths as fractions of stature (Winter 2009, after Drillis & Contini).
UPPER_ARM, FOREARM, HAND = 0.186, 0.146, 0.108
ANKLE_HEIGHT = 0.039

SLICE = 0.005           # slice thickness, fraction of stature (about 9 mm)
CELL = 0.015            # grid that splits a slice into pieces (about 2.6 cm)
VOXEL = 1 / 80          # voxel size for skin weights (about 2.1 cm)
REACH = 0.30            # a bone's influence stops this far inside the body (fraction of stature)
FALLOFF = 4             # weight ~ 1 / distance^FALLOFF
MAP_DT = 0.006          # surface map: step along the bone (fraction of stature)
MAP_ANGLES = 64         # surface map: steps around the bone
MAP_EXTEND = 0.5        # surface map reaches this share of the bone's length past each end,
MAP_REACH = 0.1         # and at least this far (fraction of stature), for big tattoos on short bones
C0 = 0.28209479177387814


class RigError(ValueError):
    """The body doesn't look like a person standing in an A-pose. `code` (few, legs, arms, feet or
    shape) picks the advice the page shows."""

    def __init__(self, message: str, code: str = "shape"):
        super().__init__(message)
        self.code = code


# ---------------------------------------------------------------- small vector helpers

def _dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def _mul(a, s):
    return (a[0] * s, a[1] * s, a[2] * s)


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _unit(a):
    n = math.sqrt(_dot(a, a))
    if n < 1e-12:
        raise RigError("degenerate direction")
    return (a[0] / n, a[1] / n, a[2] / n)


def _quantile(sorted_vals, q):
    return sorted_vals[min(len(sorted_vals) - 1, max(0, int(q * (len(sorted_vals) - 1))))]


def _seg_dist(p, a, b):
    """Distance from point p to segment ab."""
    ab = _sub(b, a)
    L2 = _dot(ab, ab)
    t = 0.0 if L2 < 1e-18 else max(0.0, min(1.0, _dot(_sub(p, a), ab) / L2))
    return math.dist(p, _add(a, _mul(ab, t)))


def _line_fit(rows, at):
    """Least-squares x(y) and z(y) through rows of (y, x, z); evaluated at y = at."""
    n = len(rows)
    if n == 0:
        raise RigError("no points to fit a limb through")
    my = sum(r[0] for r in rows) / n
    mx = sum(r[1] for r in rows) / n
    mz = sum(r[2] for r in rows) / n
    syy = sum((r[0] - my) ** 2 for r in rows)
    if syy < 1e-12:
        return mx, mz
    bx = sum((r[0] - my) * (r[1] - mx) for r in rows) / syy
    bz = sum((r[0] - my) * (r[2] - mz) for r in rows) / syy
    return mx + bx * (at - my), mz + bz * (at - my)


# ---------------------------------------------------------------- loading

def load_splats(path: Path) -> dict:
    """Centres, opacity and base colour of every splat, and the up axis from Brush's comment."""
    from splat_studio.splats import PlyFile, sigmoid
    ply = PlyFile(Path(path))
    fields = ["x", "y", "z", "opacity"]
    has_colour = all(f in ply.names for f in ("f_dc_0", "f_dc_1", "f_dc_2"))
    d = ply.read(fields + (["f_dc_0", "f_dc_1", "f_dc_2"] if has_colour else []))
    out = {"x": d["x"], "y": d["y"], "z": d["z"],
           "opacity": array("f", (sigmoid(v) for v in d["opacity"])),
           "up": ply.up_axis() or (0.0, -1.0, 0.0)}           # COLMAP data is y-down
    if has_colour:
        out["rgb"] = [array("f", (min(1.0, max(0.0, 0.5 + C0 * v)) for v in d[f])) for f in ("f_dc_0", "f_dc_1", "f_dc_2")]
    return out


# ---------------------------------------------------------------- body frame

def body_frame(xs, ys, zs, opaque, up) -> dict:
    """Up, front and left of the person, the soles, and the stature in model units.

    Left-right is the widest horizontal direction of the middle of the body (the arms are held
    away from it); front is the way the toes point."""
    U = _unit(up)
    hs = sorted(xs[i] * U[0] + ys[i] * U[1] + zs[i] * U[2] for i in opaque)
    bottom, top = _quantile(hs, 0.001), _quantile(hs, 0.999)
    H = top - bottom
    if H <= 0:
        raise RigError("the body has no height")
    a = (1.0, 0.0, 0.0) if abs(U[0]) < 0.9 else (0.0, 1.0, 0.0)
    e1 = _unit(_cross(U, a))
    e2 = _cross(U, e1)
    band = []
    for i in opaque:
        p = (xs[i], ys[i], zs[i])
        f = (_dot(p, U) - bottom) / H
        if 0.30 <= f <= 0.80:
            band.append((_dot(p, e1), _dot(p, e2)))
    if len(band) < 50:
        raise RigError("too few splats in the middle of the body", "few")
    m1 = sum(b[0] for b in band) / len(band)
    m2 = sum(b[1] for b in band) / len(band)
    c11 = sum((b[0] - m1) ** 2 for b in band)
    c22 = sum((b[1] - m2) ** 2 for b in band)
    c12 = sum((b[0] - m1) * (b[1] - m2) for b in band)
    ang = 0.5 * math.atan2(2 * c12, c11 - c22)                  # principal axis of the 2x2 covariance
    L = _unit(_add(_mul(e1, math.cos(ang)), _mul(e2, math.sin(ang))))
    F = _cross(L, U)
    centre = (sorted(b[0] for b in band)[len(band) // 2], sorted(b[1] for b in band)[len(band) // 2])
    origin = _add(_mul(U, bottom), _add(_mul(e1, centre[0]), _mul(e2, centre[1])))

    # Which way is front: the feet stick out forward of the shins.
    def coords(i):
        p = _sub((xs[i], ys[i], zs[i]), origin)
        return _dot(p, L), _dot(p, U) / H, _dot(p, F)
    feet, shins = {1: [], -1: []}, {1: [], -1: []}
    for i in opaque:
        x, f, z = coords(i)
        side = 1 if x > 0 else -1
        if f < 0.035:
            feet[side].append(z)
        elif 0.06 <= f <= 0.12:
            shins[side].append(z)
    votes = []
    for side in (1, -1):
        if len(feet[side]) > 10 and len(shins[side]) > 10:
            votes.append(sum(feet[side]) / len(feet[side]) - sum(shins[side]) / len(shins[side]))
    lean = sum(votes) / len(votes) / H if votes else 0.0
    if lean < 0:
        F, L = _mul(F, -1), _mul(L, -1)
    return {"up": U, "front": F, "left": L, "origin": origin, "height": H,
            "front_confidence": min(1.0, abs(lean) / 0.03)}


def to_body(fr, xs, ys, zs):
    """Body coordinates of every splat: x to the person's left, y up from the soles, z to the front."""
    o, L, U, F = fr["origin"], fr["left"], fr["up"], fr["front"]
    X, Y, Z = array("f"), array("f"), array("f")
    for x, y, z in zip(xs, ys, zs):
        p = (x - o[0], y - o[1], z - o[2])
        X.append(_dot(p, L))
        Y.append(_dot(p, U))
        Z.append(_dot(p, F))
    return X, Y, Z


def to_model(fr, p):
    """Body coordinates back to the PLY's coordinates."""
    o, L, U, F = fr["origin"], fr["left"], fr["up"], fr["front"]
    return tuple(o[k] + L[k] * p[0] + U[k] * p[1] + F[k] * p[2] for k in range(3))


# ---------------------------------------------------------------- slices

def slice_pieces(X, Y, Z, opaque, H) -> list:
    """For every horizontal slice, the separate pieces it falls into, with their extent."""
    n = int(round(1 / SLICE)) + 1
    rows = [[] for _ in range(n)]
    for i in opaque:
        k = int(Y[i] / H / SLICE)
        if 0 <= k < n:
            rows[k].append(i)
    cell = CELL * H
    out = []
    for k, idx in enumerate(rows):
        grid: dict = {}
        for i in idx:
            grid.setdefault((math.floor(X[i] / cell), math.floor(Z[i] / cell)), []).append(i)
        seen, pcs = set(), []
        for start in grid:
            if start in seen:
                continue
            seen.add(start)
            stack, members = [start], []
            while stack:
                cx, cz = stack.pop()
                members.extend(grid[(cx, cz)])
                for dx in (-1, 0, 1):
                    for dz in (-1, 0, 1):
                        q = (cx + dx, cz + dz)
                        if q in grid and q not in seen:
                            seen.add(q)
                            stack.append(q)
            if len(members) < max(3, 0.01 * len(idx)):
                continue                                     # a few stray splats
            xs = [X[i] for i in members]
            zs = [Z[i] for i in members]
            pcs.append({"n": len(members), "x": sum(xs) / len(xs), "z": sum(zs) / len(zs),
                        "x0": min(xs), "x1": max(xs), "z0": min(zs), "z1": max(zs)})
        out.append(pcs)
    return out


def _nearest(pcs, x, z, within):
    """The piece that covers (x, z), else the nearest one within `within`."""
    cover = [p for p in pcs if p["x0"] <= x <= p["x1"] and p["z0"] <= z <= p["z1"]]
    best, bd = None, within
    for p in cover or pcs:
        d = math.hypot(p["x"] - x, p["z"] - z)
        if d < bd or cover and best is None:
            best, bd = p, d
    return best


def find_joints(X, Y, Z, opaque, H) -> dict:
    """Joint positions in body coordinates (see the module docstring for the method)."""
    S = slice_pieces(X, Y, Z, opaque, H)
    yk = lambda k: (k + 0.5) * SLICE * H                      # height of slice k
    kf = lambda f: int(f / SLICE)                             # slice at a fraction of stature

    # --- legs: two pieces at shin height, followed up to where they meet (the crotch)
    start = None
    for k in range(kf(0.18), kf(0.12), -1):
        legs = sorted((p for p in S[k] if abs(p["x"]) < 0.15 * H), key=lambda p: -p["n"])[:2]
        if len(legs) == 2 and min(l["n"] for l in legs) > 0.2 * max(l["n"] for l in legs):
            start = k
            break
    if start is None:
        raise RigError("couldn't find two legs: stand with the feet apart", "legs")
    legs.sort(key=lambda p: -p["x"])                          # left leg first (x to the left)
    track = {1: {start: legs[0]}, -1: {start: legs[1]}}
    crotch = None
    for k in range(start + 1, kf(0.7)):
        got = {s: _nearest(S[k], track[s][k - 1]["x"], track[s][k - 1]["z"], 0.06 * H) for s in (1, -1)}
        if got[1] is None or got[-1] is None:
            raise RigError("lost a leg on the way up", "legs")
        if got[1] is got[-1]:
            crotch = k
            break
        for s in (1, -1):
            track[s][k] = got[s]
    if crotch is None or yk(crotch) < 0.35 * H:
        raise RigError("couldn't find where the legs meet", "legs")
    for k in range(start - 1, -1, -1):                        # and down to the floor
        for s in (1, -1):
            prev = track[s][k + 1]
            p = _nearest(S[k], prev["x"], prev["z"], 0.06 * H)
            if p is not None:
                track[s][k] = p

    # --- trunk: from the crotch to the top of the head
    trunk = {}
    prev = None
    for k in range(crotch, len(S)):
        if not S[k]:
            continue
        if prev is None:
            p = min(S[k], key=lambda q: abs(q["x"]))
        else:
            p = _nearest(S[k], prev["x"], prev["z"], 0.08 * H)
        if p is None:
            continue
        trunk[k] = prev = p

    # --- arms: pieces beside the trunk (or beside the legs, below the crotch)
    def beside(k, s):
        inner = trunk.get(k) if k >= crotch else track[s].get(k)
        out = []
        for p in S[k]:
            if inner is None or p is inner or p is track[-s].get(k):
                continue
            if s > 0 and p["x0"] > inner["x1"] - 0.005 * H or s < 0 and p["x1"] < inner["x0"] + 0.005 * H:
                out.append(p)
        return out

    arms = {}
    for s in (1, -1):
        top = None
        for k in range(kf(0.86), kf(0.5), -1):
            if all(beside(j, s) for j in range(k, k - 4, -1)):
                top = k
                break
        if top is None:
            raise RigError("couldn't find the arms: hold them a little away from the body (A-pose)", "arms")
        path, miss, k = {}, 0, top
        prev = max(beside(top, s), key=lambda p: p["n"])
        vel = (0.0, 0.0)
        while k >= 0 and miss <= 8:
            guess = (prev["x"] + vel[0] * (miss + 1), prev["z"] + vel[1] * (miss + 1))
            p = _nearest(beside(k, s), guess[0], guess[1], 0.05 * H)
            if p is None:
                miss += 1
            else:
                if path:
                    last = path[min(path)]
                    vel = ((p["x"] - last["x"]) / (min(path) - k), (p["z"] - last["z"]) / (min(path) - k))
                path[k] = prev = p
                miss = 0
            k -= 1
        if len(path) < 10:
            raise RigError("the arms are too short or cut off", "arms")
        arms[s] = path

    J = {}
    # --- legs
    y_crotch = yk(crotch)
    for s, tag in ((1, "l"), (-1, "r")):
        rows = [(yk(k), p["x"], p["z"]) for k, p in track[s].items()]
        thigh = [r for r in rows if y_crotch - 0.12 * H <= r[0] <= y_crotch - 0.015 * H]
        shin = [r for r in rows if 0.07 * H <= r[0] <= 0.16 * H]
        # thighs that touch meet below the crotch, so the crotch only sets a lower bound
        y_hip = min(max(y_crotch + 0.035 * H, 0.51 * H), 0.55 * H)
        y_ankle = ANKLE_HEIGHT * H
        J["hip_" + tag] = (*_xz(thigh, y_hip),)
        J["ankle_" + tag] = (*_xz(shin, y_ankle),)
        y_knee = 0.5 * (y_hip + y_ankle)
        near = [r for r in rows if abs(r[0] - y_knee) <= 0.015 * H]
        J["knee_" + tag] = (*_xz(near, y_knee),)
        # the toes: the most forward splats of the foot
        ax, _, az = J["ankle_" + tag]
        foot = [(Z[i], X[i]) for i in opaque if Y[i] < 0.035 * H and abs(X[i] - ax) < 0.08 * H
                and Z[i] > az - 0.1 * H]
        if len(foot) < 5:
            raise RigError("couldn't find the feet", "feet")
        foot.sort()
        tz = _quantile(foot, 0.98)[0]
        tip = [f[1] for f in foot if f[0] >= tz - 0.02 * H]
        J["toe_end_" + tag] = (sum(tip) / len(tip), 0.015 * H, tz)

    # --- arms
    for s, tag in ((1, "l"), (-1, "r")):
        path = arms[s]
        ks = sorted(path, reverse=True)                       # from the armpit down to the fingertips
        rows = [(yk(k), path[k]["x"], path[k]["z"]) for k in ks]
        y_pit, y_tip = rows[0][0], rows[-1][0]
        upper = [r for r in rows if r[0] >= y_pit - 0.35 * (y_pit - y_tip)]
        # the shoulder joint sits about 5 cm below the top of the shoulder, above the arm's line
        sx, _ = _line_fit(upper, y_pit + 0.04 * H)
        col = sorted(Y[i] for i in opaque if abs(X[i] - sx) < 0.02 * H and y_pit < Y[i] < 0.9 * H)
        y_sh = max(y_pit + 0.02 * H, _quantile(col, 0.98) - 0.03 * H) if col else y_pit + 0.04 * H
        sx, sz = _line_fit(upper, y_sh)
        box = sorted(Z[i] for i in opaque if abs(X[i] - sx) < 0.02 * H and abs(Y[i] - y_sh) < 0.02 * H)
        if len(box) > 10:
            sz = 0.5 * (_quantile(box, 0.05) + _quantile(box, 0.95))
        t = trunk.get(kf(y_sh / H))
        if t is not None:                                     # keep the joint inside the shoulder
            lo, hi = (t["x0"] + 0.025 * H, t["x1"] - 0.025 * H)
            sx = min(max(sx, lo), hi)
            sz = min(max(sz, t["z0"] + 0.02 * H), t["z1"] - 0.02 * H)
        J["shoulder_" + tag] = (sx, y_sh, sz)
        # centre line from the shoulder joint to the fingertip, smoothed
        pts = [(sx, y_sh, sz)] + _smooth([(r[1], r[0], r[2]) for r in rows])
        widths = _smooth_vals([max(path[k]["x1"] - path[k]["x0"], path[k]["z1"] - path[k]["z0"]) for k in ks])
        cum = [0.0]
        for a, b in zip(pts, pts[1:]):
            cum.append(cum[-1] + math.dist(a, b))
        total = cum[-1]
        arm = UPPER_ARM + FOREARM + HAND
        f_wrist = (UPPER_ARM + FOREARM) / arm
        # the wrist is the narrowest slice near where the proportions put it
        d_wrist = total * f_wrist
        cand = [(widths[i - 1], i) for i in range(1, len(pts)) if abs(cum[i] / total - f_wrist) <= 0.07]
        if cand:
            w, i = min(cand)
            if w < 0.92 * max(c[0] for c in cand):
                d_wrist = cum[i]
        J["wrist_" + tag] = _along(pts, cum, d_wrist)
        J["elbow_" + tag] = _along(pts, cum, d_wrist * UPPER_ARM / (UPPER_ARM + FOREARM))
        J["hand_end_" + tag] = pts[-1]

    # --- trunk, neck and head
    def trunk_at(y):
        k = kf(y / H)
        for d in range(0, 6):
            for kk in (k - d, k + d):
                if kk in trunk:
                    return trunk[kk]
        raise RigError("the trunk has a gap")
    hl, hr = J["hip_l"], J["hip_r"]
    J["pelvis"] = _mul(_add(hl, hr), 0.5)
    y_sh = 0.5 * (J["shoulder_l"][1] + J["shoulder_r"][1])
    y_neck = y_sh + 0.025 * H
    yp = J["pelvis"][1]
    for name, f in (("spine", 0.3), ("chest", 0.6)):
        y = yp + f * (y_neck - yp)
        t = trunk_at(y)
        J[name] = (t["x"], y, t["z0"] + 0.35 * (t["z1"] - t["z0"]))
    t = trunk_at(y_neck)
    J["neck"] = (t["x"], y_neck, t["z0"] + 0.4 * (t["z1"] - t["z0"]))
    # the neck is the narrowest slice above the shoulders; the head turns a little above it
    band = [(trunk[k]["x1"] - trunk[k]["x0"], k) for k in trunk if y_neck <= yk(k) <= 0.94 * H]
    if not band:
        raise RigError("couldn't find the head")
    neck = trunk[min(band)[1]]
    y_head = min(max(yk(min(band)[1]) + 0.04 * H, 0.88 * H), 0.93 * H)
    J["head"] = (neck["x"], y_head, neck["z0"] + 0.4 * (neck["z1"] - neck["z0"]))   # over the cervical spine
    J["head_end"] = (J["head"][0], H, J["head"][2])
    t = trunk_at(y_neck - 0.015 * H)
    for s, tag in ((1, "l"), (-1, "r")):
        J["clavicle_" + tag] = (t["x"] + s * 0.02 * H, y_neck - 0.015 * H, t["z0"] + 0.75 * (t["z1"] - t["z0"]))
    _check(J, H)
    return J


def _xz(rows, y):
    x, z = _line_fit(rows, y)
    return x, y, z


def _smooth(pts, w=2):
    out = []
    for i in range(len(pts)):
        win = pts[max(0, i - w): i + w + 1]
        out.append(tuple(sum(p[k] for p in win) / len(win) for k in range(3)))
    return out


def _smooth_vals(vals, w=2):
    return [sum(vals[max(0, i - w): i + w + 1]) / len(vals[max(0, i - w): i + w + 1]) for i in range(len(vals))]


def _along(pts, cum, d):
    for i in range(1, len(pts)):
        if cum[i] >= d:
            t = (d - cum[i - 1]) / ((cum[i] - cum[i - 1]) or 1)
            return tuple(pts[i - 1][k] + t * (pts[i][k] - pts[i - 1][k]) for k in range(3))
    return pts[-1]


def _check(J, H):
    """Refuse a skeleton that can't be a person's."""
    for s in ("l", "r"):
        chain = ["shoulder_", "elbow_", "wrist_", "hand_end_"]
        ys = [J[c + s][1] for c in chain]
        if not all(a > b for a, b in zip(ys, ys[1:])):
            raise RigError("the arms don't hang down: stand in an A-pose", "arms")
        legs = [J[c + s][1] for c in ("hip_", "knee_", "ankle_")]
        if not all(a > b for a, b in zip(legs, legs[1:])):
            raise RigError("the legs don't stand straight")
    arm = lambda s: math.dist(J["shoulder_" + s], J["hand_end_" + s])
    if not 0.75 < arm("l") / arm("r") < 1.33:
        raise RigError("the two arms differ too much: one may be cut off or touching the body", "arms")
    if not 0.30 * H < arm("l") < 0.60 * H:
        raise RigError("the arms are too short or too long for a person", "arms")
    if not J["pelvis"][1] < J["spine"][1] < J["chest"][1] < J["neck"][1] < J["head"][1] < H:
        raise RigError("the trunk isn't upright")


# ---------------------------------------------------------------- skin weights

def bone_segments(J: dict) -> dict:
    """Each bone's segments in body coordinates: from its joint to every child."""
    names = [n for n, _ in JOINTS]
    return {b: [(J[names[b]], J[names[c]]) for c in CHILDREN[b]] for b in BONES}


class Grid:
    """A box of voxels in body coordinates."""

    def __init__(self, lo, hi, size):
        self.size = size
        self.lo = tuple(lo[k] - 3 * size for k in range(3))
        self.n = tuple(int(math.ceil((hi[k] - lo[k]) / size)) + 7 for k in range(3))

    def key(self, p):
        i, j, k = (int((p[a] - self.lo[a]) // self.size) for a in range(3))
        if 0 <= i < self.n[0] and 0 <= j < self.n[1] and 0 <= k < self.n[2]:
            return (i * self.n[1] + j) * self.n[2] + k
        return -1

    def ijk(self, c):
        k = c % self.n[2]
        j = (c // self.n[2]) % self.n[1]
        return c // (self.n[1] * self.n[2]), j, k

    def centre(self, c):
        i, j, k = self.ijk(c)
        return (self.lo[0] + (i + 0.5) * self.size, self.lo[1] + (j + 0.5) * self.size,
                self.lo[2] + (k + 0.5) * self.size)

    def neighbours(self, c, full=True):
        """(cell, distance in voxels) for the 26 (or 6) neighbours inside the box."""
        i, j, k = self.ijk(c)
        n1, n2 = self.n[1], self.n[2]
        for di in (-1, 0, 1):
            ii = i + di
            if not 0 <= ii < self.n[0]:
                continue
            for dj in (-1, 0, 1):
                jj = j + dj
                if not 0 <= jj < n1:
                    continue
                for dk in (-1, 0, 1):
                    kk = k + dk
                    m = abs(di) + abs(dj) + abs(dk)
                    if m == 0 or not 0 <= kk < n2 or (not full and m > 1):
                        continue
                    yield (ii * n1 + jj) * n2 + kk, _STEP[m]


_STEP = (0.0, 1.0, math.sqrt(2), math.sqrt(3))


def solid_voxels(grid: Grid, X, Y, Z, opaque) -> set:
    """Voxels inside the body: the largest connected piece of occupied voxels, with its inside
    filled in (the splats form a shell)."""
    occ = set()
    for i in opaque:
        c = grid.key((X[i], Y[i], Z[i]))
        if c >= 0:
            occ.add(c)
    # largest 26-connected piece: drops stray splats around the body
    seen, best = set(), set()
    for c in occ:
        if c in seen:
            continue
        piece, stack = {c}, [c]
        seen.add(c)
        while stack:
            for nb, _ in grid.neighbours(stack.pop()):
                if nb in occ and nb not in seen:
                    seen.add(nb)
                    piece.add(nb)
                    stack.append(nb)
        if len(piece) > len(best):
            best = piece
    # close small holes (dilate once), fill the inside, then drop the added layer again
    shell = set(best)
    for c in best:
        for nb, _ in grid.neighbours(c, full=False):
            shell.add(nb)
    outside, stack = {0}, [0]                                # cell 0 is a padded corner
    while stack:
        for nb, _ in grid.neighbours(stack.pop(), full=False):
            if nb not in shell and nb not in outside:
                outside.add(nb)
                stack.append(nb)
    total = grid.n[0] * grid.n[1] * grid.n[2]
    inside = set(c for c in shell if c not in outside)
    inside.update(c for c in _cells_not_in(total, outside, shell))
    solid = set()
    for c in inside:
        if c in best or all(nb in inside for nb, _ in grid.neighbours(c, full=False)):
            solid.add(c)
    return solid


def _cells_not_in(total, outside, shell):
    """Enclosed empty cells (inside the body, not reached from outside)."""
    if len(outside) + len(shell) >= total:
        return ()
    return (c for c in range(total) if c not in outside and c not in shell)


def geodesic(grid: Grid, solid: set, segments, reach: float) -> dict:
    """Distance from a bone, travelling through solid voxels only, up to `reach` (body units)."""
    v = grid.size
    lo = [min(min(a[k], b[k]) for a, b in segments) for k in range(3)]
    hi = [max(max(a[k], b[k]) for a, b in segments) for k in range(3)]
    cand = []
    i0, j0, k0 = (int((lo[a] - grid.lo[a]) // v) - 3 for a in range(3))
    i1, j1, k1 = (int((hi[a] - grid.lo[a]) // v) + 3 for a in range(3))
    for i in range(max(0, i0), min(grid.n[0], i1 + 1)):
        for j in range(max(0, j0), min(grid.n[1], j1 + 1)):
            for k in range(max(0, k0), min(grid.n[2], k1 + 1)):
                c = (i * grid.n[1] + j) * grid.n[2] + k
                if c in solid:
                    p = grid.centre(c)
                    cand.append((min(_seg_dist(p, a, b) for a, b in segments), c))
    if not cand:
        return {}
    dmin = min(d for d, _ in cand)
    dist: dict = {}
    heap = []
    for d, c in cand:
        if d <= max(v, dmin + 0.5 * v):
            dist[c] = d
            heap.append((d, c))
    heapq.heapify(heap)
    while heap:
        d, c = heapq.heappop(heap)
        if d > dist.get(c, math.inf) or d > reach:
            continue
        for nb, step in grid.neighbours(c):
            if nb in solid:
                nd = d + step * v
                if nd < dist.get(nb, math.inf):
                    dist[nb] = nd
                    heapq.heappush(heap, (nd, nb))
    return dist


def bind(grid: Grid, solid: set, J: dict, H: float, smooth: int = 2, grow: int = 4) -> dict:
    """Skin weights per voxel: {cell: [(bone, weight), ...]} with at most four bones."""
    segs = bone_segments(J)
    eps = 0.25 * grid.size
    dists = {b: geodesic(grid, solid, segs[b], REACH * H) for b in BONES}
    raw: dict = {}
    for b, dist in dists.items():
        for c, d in dist.items():
            raw.setdefault(c, {})[b] = 1.0 / (d + eps) ** FALLOFF
    for c in solid:                                          # a voxel no bone reached
        if c not in raw:
            p = grid.centre(c)
            b = min(BONES, key=lambda b: min(_seg_dist(p, s, e) for s, e in segs[b]))
            raw[c] = {b: 1.0}
    w = {c: _normalised(d) for c, d in raw.items()}
    for _ in range(smooth):                                  # a little diffusion, inside the body only
        nxt = {}
        for c, d in w.items():
            acc = dict((b, 2 * x) for b, x in d.items())
            n = 2.0
            for nb, _ in grid.neighbours(c, full=False):
                e = w.get(nb)
                if e is not None:
                    n += 1
                    for b, x in e.items():
                        acc[b] = acc.get(b, 0.0) + x
            nxt[c] = _normalised({b: x / n for b, x in acc.items()})
        w = nxt
    # grow a few layers outside the body so splats on the surface (and hair) all find weights
    for _ in range(grow):
        ring = {}
        for c in w:
            for nb, _ in grid.neighbours(c, full=False):
                if nb not in w:
                    ring.setdefault(nb, []).append(c)
        for c, srcs in ring.items():
            # one neighbour's weights, not a mix: between two limbs the rings meet without blending
            w[c] = w[max(srcs, key=lambda s: max(w[s].values()))]
    return {c: sorted(d.items(), key=lambda t: -t[1]) for c, d in w.items()}


def _normalised(d: dict, keep: int = 4) -> dict:
    top = sorted(d.items(), key=lambda t: -t[1])[:keep]
    s = sum(x for _, x in top) or 1.0
    top = [(b, x / s) for b, x in top if x / s >= 0.01]
    s = sum(x for _, x in top) or 1.0
    return {b: x / s for b, x in top}


def dominant_bone(grid: Grid, weights: dict, p) -> int:
    c = grid.key(p)
    w = weights.get(c)
    return w[0][0] if w else -1


# ---------------------------------------------------------------- surface map

# Regions: one surface map across several bones, so a big tattoo (a back piece, a thigh piece)
# isn't cut where one bone's map ends. Each runs along a straight axis between two joints, past
# them by the given share of stature, and is built from the splats of its bones; a tattoo is laid
# on the region of the bone under it. Arms have none: elbows are bent even in an A-pose, so a
# straight axis from shoulder to wrist misses the elbow; each arm bone's own map reaches well past
# its ends instead.
REGIONS = {
    "trunk": ("pelvis", "neck", 0.12, 0.03, ("pelvis", "spine", "chest", "neck", "clavicle_l", "clavicle_r")),
    "leg_l": ("hip_l", "ankle_l", 0.08, 0.0, ("hip_l", "knee_l")),
    "leg_r": ("hip_r", "ankle_r", 0.08, 0.0, ("hip_r", "knee_r")),
}
REGION_OF = {b: r for r, (_, _, _, _, bones) in REGIONS.items() for b in bones}


def _axis(o, e, F, U) -> dict:
    a = _unit(_sub(e, o))
    ref = F if abs(_dot(a, F)) < 0.8 else U
    e0 = _unit(_sub(ref, _mul(a, _dot(ref, a))))
    return {"o": o, "a": a, "len": math.dist(o, e), "e0": e0, "e1": _cross(a, e0)}


def bone_axes(J: dict, F, U) -> dict:
    """For each bone: origin, unit axis, length and the two directions across it (body coordinates).
    Angle 0 looks to the front (or up, for a bone that points forward like the foot)."""
    names = [n for n, _ in JOINTS]
    return {b: _axis(J[names[b]], J[names[PRIMARY[b]]], F, U) for b in BONES}


def _radius_map(ax, before, after, idx, X, Y, Z, rgb, H) -> dict:
    """Radius (70th percentile of the splats) and colour around an axis, from `before` below its
    origin to `after` past its end, in steps of MAP_DT along and MAP_ANGLES around."""
    dt = MAP_DT * H
    t0 = -before
    nt = int(math.ceil((ax["len"] + before + after) / dt)) + 1
    bins = [[] for _ in range(nt * MAP_ANGLES)]
    o, a, e0, e1 = ax["o"], ax["a"], ax["e0"], ax["e1"]
    for i in idx:
        d = (X[i] - o[0], Y[i] - o[1], Z[i] - o[2])
        t = _dot(d, a)
        ti = int(round((t - t0) / dt))
        if not 0 <= ti < nt:
            continue
        u, w = _dot(d, e0), _dot(d, e1)
        th = math.atan2(w, u) % (2 * math.pi)
        ai = int(th / (2 * math.pi) * MAP_ANGLES) % MAP_ANGLES
        bins[ti * MAP_ANGLES + ai].append((math.hypot(u, w), i))
    radius = [0.0] * len(bins)
    colour = [(0.0, 0.0, 0.0)] * len(bins)
    for c, rows in enumerate(bins):
        if len(rows) < 2:
            continue
        rows.sort()
        radius[c] = _quantile(rows, 0.7)[0]
        outer = rows[len(rows) // 2:]
        if rgb:
            colour[c] = tuple(sum(rgb[k][i] for _, i in outer) / len(outer) for k in range(3))
    radius, colour = _fill(radius, colour, nt, MAP_ANGLES)
    return {"t0": t0, "dt": dt, "nt": nt, "na": MAP_ANGLES, "radius": radius, "colour": colour}


def surface_maps(X, Y, Z, rgb, opaque, grid, weights, J, H) -> dict:
    """Radius of the body around each bone axis and each region's axis, at every step along and
    around it, plus colour. Keyed by bone or region name."""
    F, U = (0.0, 0.0, 1.0), (0.0, 1.0, 0.0)
    names = [n for n, _ in JOINTS]
    bone_ax = bone_axes(J, F, U)
    by_bone: dict = {}
    for i in opaque:
        b = dominant_bone(grid, weights, (X[i], Y[i], Z[i]))
        if b >= 0:
            by_bone.setdefault(b, []).append(i)
    axes, maps = {}, {}
    for b in BONES:
        ax = bone_ax[b]
        idx = [i for nb in {b, PARENT[b], *CHILDREN[b]} if nb in by_bone for i in by_bone[nb]]
        ext = max(MAP_EXTEND * ax["len"], MAP_REACH * H)
        axes[names[b]] = ax
        maps[names[b]] = _radius_map(ax, ext, ext, idx, X, Y, Z, rgb, H)
    for name, (start, end, before, after, bones) in REGIONS.items():
        ax = _axis(J[start], J[end], F, U)
        idx = [i for nb in bones if INDEX[nb] in by_bone for i in by_bone[INDEX[nb]]]
        axes[name] = ax
        maps[name] = _radius_map(ax, before * H, after * H, idx, X, Y, Z, rgb, H)
    return {"axes": axes, "maps": maps}


def _fill(radius, colour, nt, na):
    """Fill empty cells from their neighbours (around the bone wraps), then smooth a little."""
    r, col = list(radius), list(colour)
    for _ in range(12):
        missing = [c for c in range(len(r)) if r[c] <= 0]
        if not missing:
            break
        upd = []
        for c in missing:
            ti, ai = divmod(c, na)
            got = [(ti, (ai - 1) % na), (ti, (ai + 1) % na), (ti - 1, ai), (ti + 1, ai)]
            vals = [(r[t * na + q], col[t * na + q]) for t, q in got if 0 <= t < nt and r[t * na + q] > 0]
            if vals:
                upd.append((c, sum(v[0] for v in vals) / len(vals),
                            tuple(sum(v[1][k] for v in vals) / len(vals) for k in range(3))))
        for c, v, cc in upd:
            r[c], col[c] = v, cc
    out = list(r)
    for c in range(len(r)):                                  # 3x3 mean, keeping holes as holes
        if r[c] <= 0:
            continue
        ti, ai = divmod(c, na)
        vals = [r[t * na + (ai + da) % na] for t in (ti - 1, ti, ti + 1) for da in (-1, 0, 1)
                if 0 <= t < nt and r[t * na + (ai + da) % na] > 0]
        out[c] = sum(vals) / len(vals)
    return out, col


# ---------------------------------------------------------------- the whole rig

def build(path: Path) -> dict:
    """The rig for a body PLY (see the module docstring). Raises RigError when the body
    doesn't look like a person in an A-pose."""
    d = load_splats(path)
    xs, ys, zs, op = d["x"], d["y"], d["z"], d["opacity"]
    opaque = [i for i, o in enumerate(op) if o >= 0.5]
    if len(opaque) < 2000:
        raise RigError("too few splats to find a skeleton", "few")
    fr = body_frame(xs, ys, zs, opaque, d["up"])
    H = fr["height"]
    X, Y, Z = to_body(fr, xs, ys, zs)
    J = find_joints(X, Y, Z, opaque, H)
    lo = [min(c[k] for c in J.values()) for k in range(3)]
    hi = [max(c[k] for c in J.values()) for k in range(3)]
    for i in opaque:
        p = (X[i], Y[i], Z[i])
        for k in range(3):
            if p[k] < lo[k]:
                lo[k] = p[k]
            elif p[k] > hi[k]:
                hi[k] = p[k]
    grid = Grid(lo, hi, VOXEL * H)
    solid = solid_voxels(grid, X, Y, Z, opaque)
    weights = bind(grid, solid, J, H)
    surf = surface_maps(X, Y, Z, d.get("rgb"), opaque, grid, weights, J, H)
    return encode(fr, J, grid, weights, surf, len(xs))


def _b64(arr) -> str:
    return base64.b64encode(arr.tobytes() if sys.byteorder == "little" else _swapped(arr)).decode()


def _swapped(arr):
    a = array(arr.typecode, arr)
    a.byteswap()
    return a.tobytes()


def encode(fr, J, grid, weights, surf, n_splats) -> dict:
    """JSON for the page: joints and bone axes in PLY coordinates; the voxel weights and the
    surface map in body coordinates, with the body frame to get there."""
    H = fr["height"]
    names = [n for n, _ in JOINTS]
    cells = sorted(weights)
    ids, bones, ws = array("i"), array("B"), array("B")
    for c in cells:
        top = weights[c][:4] + [(0, 0.0)] * (4 - len(weights[c][:4]))
        q = [int(round(w * 255)) for _, w in top]
        q[0] += 255 - sum(q)                                  # quantised weights still add up to 1
        ids.append(c)
        for b, _ in top:
            bones.append(b)
        for x in q:
            ws.append(x)
    maps = {}
    for name, m in surf["maps"].items():
        r = array("H", (min(65535, int(round(v / H * 100000))) for v in m["radius"]))
        col = array("B", (min(255, int(round(c * 255))) for rgb in m["colour"] for c in rgb))
        ax = surf["axes"][name]
        maps[name] = {"origin": to_model(fr, ax["o"]), "axis": _dir(fr, ax["a"]), "e0": _dir(fr, ax["e0"]),
                          "e1": _dir(fr, ax["e1"]), "length": ax["len"], "t0": m["t0"], "dt": m["dt"],
                          "nt": m["nt"], "na": m["na"], "radius": _b64(r), "colour": _b64(col)}
    return {
        "version": RIG_VERSION,
        "splats": n_splats,
        "height": H,
        "frame": {"origin": fr["origin"], "left": fr["left"], "up": fr["up"], "front": fr["front"],
                  "front_confidence": round(fr["front_confidence"], 3)},
        "joints": [{"name": n, "parent": PARENT[i], "pos": _r(to_model(fr, J[n]))} for i, n in enumerate(names)],
        "grid": {"lo": grid.lo, "size": grid.size, "n": grid.n, "cells": _b64(ids), "bones": _b64(bones),
                 "weights": _b64(ws)},
        "maps": maps,
        "regions": REGION_OF,                       # bone -> the region map a tattoo on it uses
        "radius_scale": H / 100000,
    }


def _dir(fr, v):
    L, U, F = fr["left"], fr["up"], fr["front"]
    return tuple(L[k] * v[0] + U[k] * v[1] + F[k] * v[2] for k in range(3))


def _r(p):
    return [round(v, 6) for v in p]


def rig_file(ply: Path) -> Path:
    return Path(ply).with_name(Path(ply).stem + ".rig.json")


def cached(ply: Path) -> dict | None:
    """The rig saved next to the body, if it is current."""
    f = rig_file(ply)
    try:
        if f.stat().st_mtime < Path(ply).stat().st_mtime:
            return None
        r = json.loads(f.read_text())
    except (OSError, ValueError):
        return None
    return r if r.get("version") == RIG_VERSION else None


def current(ply: Path) -> bool:
    """Whether the saved rig is newer than the body and of this version, without reading all of it."""
    f = rig_file(ply)
    try:
        if f.stat().st_mtime < Path(ply).stat().st_mtime:
            return False
        with open(f, "rb") as fh:
            return fh.read(32).startswith(b'{"version":%d,' % RIG_VERSION)
    except OSError:
        return False


def build_and_save(ply: Path) -> dict:
    r = build(ply)
    f = rig_file(ply)
    tmp = f.with_name(f.name + ".tmp")
    tmp.write_text(json.dumps(r, separators=(",", ":")))
    tmp.replace(f)
    return r


# ---------------------------------------------------------------- command line

def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(prog="body-studio rig",
                                 description="Find the skeleton of a finished body and its skin weights, so it "
                                             "can be posed and a tattoo laid on it (experimental). Writes "
                                             "BODY.rig.json next to the body.")
    ap.add_argument("ply", type=Path, help="the body: workspace/<video>/run_*/splat/*_object.ply")
    ap.add_argument("--height", type=float, help="height in cm, to print joint heights in cm")
    a = ap.parse_args(argv)
    try:
        r = build_and_save(a.ply)
    except RigError as e:
        sys.exit(f"Can't find a skeleton in this body: {e}")
    H = r["height"]
    U, o = r["frame"]["up"], r["frame"]["origin"]
    unit, scale = ("cm", a.height / H) if a.height else ("% of height", 100 / H)
    print(f"Skeleton: {len([j for j in r['joints'] if not j['name'].endswith('_end')])} joints "
          f"(heights in {unit})")
    for j in r["joints"]:
        h = _dot(_sub(j["pos"], o), U) * scale
        print(f"  {j['name']:<12} {h:6.1f}")
    if r["frame"]["front_confidence"] < 0.5:
        print("Couldn't tell front from back with confidence (are the feet in the scan?).")
    print(f"Saved {rig_file(a.ply)}")
