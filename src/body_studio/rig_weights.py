"""Skin weights and surface maps for a rig (rig.py finds the skeleton and writes the file).

Skin weights follow geodesic voxel binding (Dionne & de Lasa, SCA 2013): the body is filled in
as voxels, and each bone's influence falls off with the distance travelled *inside* the body,
so a hand resting near the hip doesn't move with the leg. Every splat then takes the weights of
the voxels around it.

The surface map is, for every bone, the body's radius around the bone axis at each height and
angle (and the skin colour there), so a tattoo is laid on it with its real size; the trunk and
each leg also get one map across their bones. Research and sources: docs/tattoo.md.
"""
from __future__ import annotations

import heapq
import math

from .rig import BONES, CHILDREN, INDEX, JOINTS, PARENT, PRIMARY
from .rig import _cross, _dot, _mul, _quantile, _seg_dist, _sub, _unit

VOXEL = 1 / 80          # voxel size for skin weights (about 2.1 cm)
REACH = 0.30            # a bone's influence stops this far inside the body (fraction of stature)
FALLOFF = 4             # weight ~ 1 / distance^FALLOFF
ARM_FADE = 0.015        # the upper arm's weight fades out this far past the armpit crease (2.6 cm
                         # on 1.75 m: wider, and with the arms up the side of the chest swings out)
MAP_DT = 0.006          # surface map: step along the bone (fraction of stature)
MAP_ANGLES = 64         # surface map: steps around the bone
MAP_EXTEND = 0.5        # surface map reaches this share of the bone's length past each end,
MAP_REACH = 0.1         # and at least this far (fraction of stature), for big tattoos on short bones


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
    # the upper arm doesn't pull the side of the chest or the shoulder blade: its weight fades out
    # over a few centimetres past the armpit crease (the plane through the shoulder joint halfway
    # between the arm and the side of the body), so a raised arm doesn't swing the back and the
    # sides out into wings (the skin there follows the trunk and the clavicle instead)
    down = _unit(_sub(J["pelvis"], J["neck"]))
    for tag in ("l", "r"):
        sh = J["shoulder_" + tag]
        out = _unit(_sub(_unit(_sub(J["elbow_" + tag], sh)), down))
        b = INDEX["shoulder_" + tag]
        for c, d in raw.items():
            if b in d:
                s = _dot(_sub(grid.centre(c), sh), out) / (ARM_FADE * H)
                if s < 0:
                    d[b] *= max(0.0, 1.0 + s) ** 2
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
