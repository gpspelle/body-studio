"""A skeleton, skin weights and a surface map for a finished body, so the page can pose the
body and wrap a tattoo around it (experimental).

    body-studio rig BODY.ply        writes BODY.rig.json next to the body and prints the joints

No body model and no download: the person stands in an A-pose (the capture guide asks for
it), so the joints are found from the shape. The body is cut into thin horizontal slices; each
slice falls apart into pieces (two legs, a trunk, two arms), and following the pieces from slice
to slice gives the crotch, the armpits, the fingertips and the centre line of every limb. Joints
are placed on those centre lines with adult segment proportions (Winter, "Biomechanics and
Motor Control of Human Movement"), and the wrist is moved to the narrowest slice near it.

Skin weights (geodesic voxel binding) and the surface map a tattoo is laid on are in
rig_weights.py; the page skins splats with Spark's dual quaternion skinning. Research and
sources: docs/tattoo.md.

All positions in the rig are in the PLY's own coordinates, so the page uses them as they are.
"""
from __future__ import annotations

import argparse
import base64
import json
import math
import sys
from array import array
from pathlib import Path

RIG_VERSION = 4          # 2: region maps (trunk, legs) for big tattoos; 3: arm weights off the back;
                         # 4: arm weights off the side of the chest

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
    from . import rig_weights as W           # (it imports this file's skeleton)
    grid = W.Grid(lo, hi, W.VOXEL * H)
    solid = W.solid_voxels(grid, X, Y, Z, opaque)
    weights = W.bind(grid, solid, J, H)
    surf = W.surface_maps(X, Y, Z, d.get("rgb"), opaque, grid, weights, J, H)
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
    from . import rig_weights
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
        "regions": rig_weights.REGION_OF,           # bone -> the region map a tattoo on it uses
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
