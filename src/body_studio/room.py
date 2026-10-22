"""A map of a scanned room, so the body can stand in it, walk about without going through the
walls and the furniture, sit down and lean on a wall (experimental).

    body-studio room-map ROOM.ply     writes ROOM.room.json next to the room and prints what it found

A room is filmed from inside it (`body-studio room VIDEO`), so its splat has the walls, the floor
and the furniture. The map is made once per room, from where its opaque splats are:

- the floor is the lowest wide, flat layer of splats, and the ceiling the highest, if it was filmed;
- the size in metres comes from the camera: a phone filming a room is held at about 1.45 m, so the
  height of the camera path over the floor gives the scale. An iPhone capture (ARKit) is in metres
  already; with no cameras, a ceiling is taken as 2.5 m high. The page has a slider to correct it;
- the floor is cut into 5 cm cells. A cell is walkable where the floor was seen and nothing stands
  between 15 cm and 1.8 m (a rug or a doormat is fine, a table is not); for each cell the map keeps
  the height of the highest surface there with room above it (a seat, a bed, a table top) and the
  height of the tallest thing in it (walls are 1.5 m or more);
- seats are flat surfaces 30 to 65 cm high, big enough to sit on, next to free floor: where to sit
  on each, which way to face (to the free floor) and whether there is a back behind.

A room drawn by the app (the sample tattoo studio) also says where its furniture is, in a
`ROOM.fixtures.json` next to it (the bed, the chair, the flash wall…); the map carries it as
`fixtures`, in the map's metres. A filmed room has none.

Positions in the map are in metres, in the room's own frame: x and z along the floor (z = x × up),
y up from the floor; `frame` turns the PLY's coordinates into it. Standard library only.
"""
from __future__ import annotations

import argparse
import base64
import json
import math
import re
import sys
from array import array
from pathlib import Path

from .rig import _cross, _dot, _quantile, _unit, load_splats

ROOM_VERSION = 2
CELL = 0.05                 # m: a cell of the floor
BIN = 0.05                  # m: a step of height in a cell
TOP = 2.4                   # m: heights looked at above the floor
OBSTACLE = (0.15, 1.8)      # m: something in a cell between these heights blocks it
SEAT = (0.30, 0.65)         # m: a surface this high can be sat on (a table top, at 72 cm or more, isn't)
SEAT_ROOM = 0.45            # m: free above a seat
SEAT_AREA = 0.10            # m²: the smallest seat (a stool is about 0.1)
SEAT_IN = 0.26              # m: the hips sit this far in from the seat's front edge (the thighs on it)
SEAT_APART = 0.55           # m: between two places to sit on one seat (a sofa has several)
WALL = 1.5                  # m: something this tall is a wall (or a wardrobe) to lean on
CAMERA_HEIGHT = 1.45        # m: a phone filming a room
CEILING = 2.5               # m: a ceiling, when nothing else tells the size
MAX_CELLS = 400             # cells along a side; a bigger place takes bigger cells
MAX_SPLATS = 1_500_000      # opaque splats looked at (spread evenly over the file)
OPAQUE = 0.5


# what each key of a fixture is, to turn it from the PLY's coordinates into the map's: a point, a
# direction or a length; anything else (an angle, a name) is kept as it is
FIXTURE_KEYS = {"at": "point", "centre": "point", "head": "dir", "facing": "dir", "normal": "dir", "right": "dir",
                "length": "length", "width": "length", "height": "length"}


class RoomError(ValueError):
    """The splat doesn't look like a room (code says why, for the page's message)."""

    def __init__(self, message: str, code: str = "room"):
        super().__init__(message)
        self.code = code


# ---------------------------------------------------------------- frame and size

def room_frame(xs, ys, zs, idx, up) -> dict:
    """Up, and the two directions along the floor: square with the walls, x along the longer side.

    Rooms have square corners, so turned square with the walls, the splats along the floor pile up
    in a few thin rows (the walls, the sides of the furniture): the way with the sharpest piles is
    the one. Searched every 2 degrees, then every quarter of a degree round the best."""
    U = _unit(up)
    a = (1.0, 0.0, 0.0) if abs(U[0]) < 0.9 else (0.0, 1.0, 0.0)
    e1 = _unit(_cross(U, a))
    e2 = _cross(e1, U)
    step = max(1, len(idx) // 30000)
    pts = [(xs[i] * e1[0] + ys[i] * e1[1] + zs[i] * e1[2], xs[i] * e2[0] + ys[i] * e2[1] + zs[i] * e2[2])
           for i in idx[::step]]
    s1 = sorted(p[0] for p in pts)
    bin_ = max(1e-9, (_quantile(s1, 0.95) - _quantile(s1, 0.05)) / 80)   # about 5 cm in a room

    def sharp(ang):
        c, s = math.cos(ang), math.sin(ang)
        h1, h2 = {}, {}
        for u, v in pts:
            k1, k2 = int((c * u + s * v) // bin_), int((c * v - s * u) // bin_)
            h1[k1] = h1.get(k1, 0) + 1
            h2[k2] = h2.get(k2, 0) + 1
        return sum(n * n for n in h1.values()) + sum(n * n for n in h2.values())

    best = max((math.radians(d) for d in range(0, 90, 2)), key=sharp)
    best = max((best + math.radians(d / 4) for d in range(-8, 9)), key=sharp)
    c, s = math.cos(best), math.sin(best)
    d1 = sorted(c * u + s * v for u, v in pts)
    d2 = sorted(c * v - s * u for u, v in pts)
    if _quantile(d2, 0.98) - _quantile(d2, 0.02) > _quantile(d1, 0.98) - _quantile(d1, 0.02):
        best += math.pi / 2
    X = _unit(tuple(e1[k] * math.cos(best) + e2[k] * math.sin(best) for k in range(3)))
    Z = _cross(X, U)
    return {"x": X, "up": U, "z": Z}


def layers(heights: list) -> tuple[float, float | None]:
    """The floor and the ceiling (None if it wasn't filmed): the lowest and the highest wide,
    flat layers of splats, from a histogram of their heights."""
    hs = sorted(heights)
    lo, hi = _quantile(hs, 0.003), _quantile(hs, 0.997)
    if hi <= lo:
        raise RoomError("the room has no height", "flat")
    n = 300
    w = (hi - lo) / n
    count = [0] * n
    for h in hs:
        k = int((h - lo) / w)
        if 0 <= k <= n:
            count[min(k, n - 1)] += 1
    top = max(count)

    def peak(rng):
        best = max(rng, key=lambda k: count[k])
        return best if count[best] >= 0.25 * top else None
    f = peak(range(0, int(0.4 * n)))
    if f is None:
        raise RoomError("no floor found: was the floor filmed?", "floor")
    c = peak(range(int(0.6 * n), n))

    def refine(k):                    # the mean height of the layer, within a bin each side
        near = [h for h in hs[_bisect(hs, lo + (k - 1) * w):_bisect(hs, lo + (k + 2) * w)]]
        return sum(near) / len(near)
    return refine(f), (refine(c) if c is not None else None)


def _bisect(a, x):
    lo, hi = 0, len(a)
    while lo < hi:
        m = (lo + hi) // 2
        if a[m] < x:
            lo = m + 1
        else:
            hi = m
    return lo


def arkit(run_dir: Path) -> bool:
    """Whether the run's camera positions are ARKit's (an iPhone capture): in metres already."""
    try:
        text = (run_dir / "summary.txt").read_text(errors="replace")
    except OSError:
        return False
    return re.search(r"^poses:\s+ARKit", text, re.M) is not None


def cameras(run_dir: Path) -> list:
    from splat_studio.splats import find_cameras
    try:
        return [c["center"] for c in find_cameras(run_dir)]
    except OSError:
        return []


def metres(run_dir: Path, U, floor: float, ceiling: float | None, cams: list) -> tuple[float, str]:
    """Metres per unit of the splat, and how that was found."""
    if arkit(run_dir):
        return 1.0, "arkit"
    above = sorted(_dot(c, U) - floor for c in cams)
    if len(above) >= 3 and _quantile(above, 0.5) > 0:
        return CAMERA_HEIGHT / _quantile(above, 0.5), "camera"
    if ceiling is not None and ceiling > floor:
        return CEILING / (ceiling - floor), "ceiling"
    raise RoomError("can't tell the room's size: no cameras and no ceiling", "size")


# ---------------------------------------------------------------- the map

def build(path: Path, run_dir: Path | None = None) -> dict:
    path = Path(path)
    run_dir = Path(run_dir) if run_dir else path.parent.parent      # workspace/<name>/run_*/splat/X.ply
    d = load_splats(path)
    xs, ys, zs, op = d["x"], d["y"], d["z"], d["opacity"]
    idx = [i for i in range(len(op)) if op[i] >= OPAQUE]
    if len(idx) < 2000:
        raise RoomError("too few splats for a room", "few")
    if len(idx) > MAX_SPLATS:
        idx = idx[::math.ceil(len(idx) / MAX_SPLATS)]
    fr = room_frame(xs, ys, zs, idx, d["up"])
    X, U, Z = fr["x"], fr["up"], fr["z"]
    H = [xs[i] * U[0] + ys[i] * U[1] + zs[i] * U[2] for i in idx]
    floor, ceiling = layers(H)
    cams = cameras(run_dir)
    mpu, source = metres(run_dir, U, floor, ceiling, cams)

    # every opaque splat in metres: along the floor, and up from it
    px = array("f", ((xs[i] * X[0] + ys[i] * X[1] + zs[i] * X[2]) * mpu for i in idx))
    pz = array("f", ((xs[i] * Z[0] + ys[i] * Z[1] + zs[i] * Z[2]) * mpu for i in idx))
    py = array("f", ((h - floor) * mpu for h in H))
    sx, sz = sorted(px), sorted(pz)
    x0, x1 = _quantile(sx, 0.002) - 0.2, _quantile(sx, 0.998) + 0.2
    z0, z1 = _quantile(sz, 0.002) - 0.2, _quantile(sz, 0.998) + 0.2
    cell = max(CELL, (x1 - x0) / MAX_CELLS, (z1 - z0) / MAX_CELLS)
    nx, nz = max(1, math.ceil((x1 - x0) / cell)), max(1, math.ceil((z1 - z0) / cell))
    nb = round(TOP / BIN)
    count = array("H", bytes(2 * nx * nz * nb))
    for x, y, z in zip(px, py, pz):
        b = int(y / BIN) if y >= 0 else -1
        if b < -1 or b >= nb:
            continue
        i, k = int((x - x0) / cell), int((z - z0) / cell)
        if 0 <= i < nx and 0 <= k < nz:
            c = (k * nx + i) * nb + max(0, b)
            if count[c] < 65535:
                count[c] += 1

    count = _blur(count, nx, nz, nb)
    # how many splats (over a cell and the 8 round it) make a layer "there": a few, more in a
    # dense scan
    filled = sorted(v for v in count if v)
    need = max(2, int(0.15 * _quantile(filled, 0.5))) if filled else 2
    ob0, ob1 = int(OBSTACLE[0] / BIN), int(OBSTACLE[1] / BIN)
    room_bins = int(SEAT_ROOM / BIN)
    floor_seen = bytearray(nx * nz)
    blocked = bytearray(nx * nz)
    top = bytearray(nx * nz)              # cm: the highest surface under 1.2 m with room above it
    tall = bytearray(nx * nz)             # cm: the top of the tallest thing in the cell
    for c in range(nx * nz):
        col = count[c * nb:(c + 1) * nb]
        occ = [v >= need for v in col]
        floor_seen[c] = 1 if occ[0] or occ[1] else 0
        # (two layers, or one dense one: a seat's top; never a stray splat or two)
        if sum(occ[ob0:ob1]) >= 2 or max(col[ob0:ob1]) >= 3 * need:
            blocked[c] = 1
        # (not a lamp hanging from the ceiling: what stands on the floor, up to 2 m)
        hi = max((b for b in range(ob0, min(nb, int(2.0 / BIN))) if occ[b]), default=-1) if blocked[c] else -1
        tall[c] = min(255, round((hi + 0.5) * BIN * 100)) if hi >= 0 else 0
        for b in range(min(nb - 1, int(1.2 / BIN)), 2, -1):
            if occ[b] and not any(occ[b + 1:b + 1 + room_bins]):
                top[c] = min(255, round((b + 0.5) * BIN * 100))
                break
    walk = _walkable(floor_seen, blocked, nx, nz)
    seats = find_seats(top, walk, blocked, tall, nx, nz, cell, x0, z0)
    start = _start(walk, nx, nz, cell, x0, z0,
                   [((_dot(c, X)) * mpu, (_dot(c, Z)) * mpu) for c in cams])
    if start is None:
        raise RoomError("no free floor to stand on", "floor")
    out = encode(fr, floor, ceiling, mpu, source, cell, nx, nz, x0, z0, walk, top, tall, seats, start, len(op))
    fx = read_fixtures(path, fr, floor, mpu)
    if fx:
        out["fixtures"] = fx
    return out


def fixtures_file(ply: Path) -> Path:
    return Path(ply).with_name(Path(ply).stem + ".fixtures.json")


def read_fixtures(ply: Path, fr: dict, floor: float, mpu: float) -> dict | None:
    """The room's fixtures (fixtures_file), turned into the map's metres; None when it has none."""
    try:
        raw = json.loads(fixtures_file(ply).read_text())
    except (OSError, ValueError):
        return None
    X, U, Z = fr["x"], fr["up"], fr["z"]

    def conv(v, key=None):
        if isinstance(v, dict):
            return {k: conv(x, k) for k, x in v.items()}
        if isinstance(v, list) and v and isinstance(v[0], dict):
            return [conv(x) for x in v]
        kind = FIXTURE_KEYS.get(key)
        if kind == "point":
            return [round(_dot(v, X) * mpu, 4), round((_dot(v, U) - floor) * mpu, 4), round(_dot(v, Z) * mpu, 4)]
        if kind == "dir":
            return _r(_unit((_dot(v, X), _dot(v, U), _dot(v, Z))))
        if kind == "length":
            return round(v * mpu, 4)
        return v
    return conv(raw) if isinstance(raw, dict) else None


def _blur(count, nx, nz, nb):
    """Each cell's counts summed with the 8 cells round it, so a sparse scan has no holes."""
    def along(src, step, length):
        out = array("I", bytes(4 * len(src)))
        for c in range(len(src) // nb):
            i = (c // step) % length
            base = c * nb
            for di in (-1, 0, 1):
                if 0 <= i + di < length:
                    o = (c + di * step) * nb
                    for b in range(nb):
                        out[base + b] += src[o + b]
        return out
    return along(along(count, 1, nx), nx, nz)


def _walkable(floor_seen, blocked, nx, nz) -> bytearray:
    """Floor that was seen, small holes in it filled (closed over 2 cells), less what stands on it."""
    def grow(m, r, keep):
        out = bytearray(nx * nz)
        for k in range(nz):
            for i in range(nx):
                hit = keep
                for dk in range(-r, r + 1):
                    for di in range(-r, r + 1):
                        ii, kk = i + di, k + dk
                        v = m[kk * nx + ii] if 0 <= ii < nx and 0 <= kk < nz else 0
                        if keep and not v:
                            hit = False
                        if not keep and v:
                            hit = True
                out[k * nx + i] = 1 if hit else 0
        return out
    closed = grow(grow(floor_seen, 2, False), 2, True)
    return bytearray(1 if (closed[c] or floor_seen[c]) and not blocked[c] else 0 for c in range(nx * nz))


def find_seats(top, walk, blocked, tall, nx, nz, cell, x0, z0) -> list:
    """Places to sit: on each flat surface 30-75 cm high, big enough, next to free floor."""
    lo, hi = round(SEAT[0] * 100), round(SEAT[1] * 100)
    seen = bytearray(nx * nz)
    seats = []
    for c0 in range(nx * nz):
        if seen[c0] or not (lo <= top[c0] <= hi) or not blocked[c0]:
            continue
        comp, stack, h0 = [], [c0], top[c0]
        seen[c0] = 1
        while stack:
            c = stack.pop()
            comp.append(c)
            i, k = c % nx, c // nx
            for ii, kk in ((i + 1, k), (i - 1, k), (i, k + 1), (i, k - 1)):
                if 0 <= ii < nx and 0 <= kk < nz:
                    n = kk * nx + ii
                    if not seen[n] and lo <= top[n] <= hi and abs(top[n] - h0) <= 8 and blocked[n]:
                        seen[n] = 1
                        stack.append(n)
        if len(comp) * cell * cell < SEAT_AREA:
            continue
        inside = set(comp)
        height = sorted(top[c] for c in comp)[len(comp) // 2] / 100
        # the front: cells of the seat with free floor right beside them, facing that floor
        edge = []
        for c in comp:
            i, k = c % nx, c // nx
            fx = fz = 0
            for di, dk in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                for r in (1, 2):
                    ii, kk = i + di * r, k + dk * r
                    if 0 <= ii < nx and 0 <= kk < nz and walk[kk * nx + ii]:
                        fx += di
                        fz += dk
                        break
            if fx or fz:
                L = math.hypot(fx, fz)
                edge.append((c, fx / L, fz / L))
        spots = []
        for c, dx, dz in edge:
            i, k = c % nx, c // nx
            cx, cz = x0 + (i + 0.5) * cell, z0 + (k + 0.5) * cell
            sx, sz = cx - dx * SEAT_IN, cz - dz * SEAT_IN
            si, sk = int((sx - x0) / cell), int((sz - z0) / cell)
            if (sk * nx + si) not in inside:
                continue                                    # too shallow to sit on here
            # a back: something tall behind the hips, within 45 cm
            back = False
            for r in range(1, round(0.45 / cell) + 1):
                bi, bk = int((sx - dx * r * cell - x0) / cell), int((sz - dz * r * cell - z0) / cell)
                if 0 <= bi < nx and 0 <= bk < nz and tall[bk * nx + bi] >= round((height + 0.25) * 100):
                    back = True
                    break
            spots.append({"x": round(sx, 3), "z": round(sz, 3), "y": round(height, 3),
                          "dir": [round(dx, 3), round(dz, 3)], "back": back})
        # the middle of the front first, then others along it, far enough apart; a seat with a back
        # is sat on facing away from it (not sideways at its end)
        if any(s["back"] for s in spots):
            spots = [s for s in spots if s["back"]]
        if not spots:
            continue
        mx = sum(s["x"] for s in spots) / len(spots)
        mz = sum(s["z"] for s in spots) / len(spots)
        spots.sort(key=lambda s: (not s["back"], (s["x"] - mx) ** 2 + (s["z"] - mz) ** 2))
        chosen = []
        for s in spots:
            if all(math.hypot(s["x"] - o["x"], s["z"] - o["z"]) >= SEAT_APART for o in chosen):
                chosen.append(s)
            if len(chosen) == 4:
                break
        seats.extend(chosen)
    return seats[:40]


def _start(walk, nx, nz, cell, x0, z0, cams) -> list | None:
    """Where the body stands at first: free floor, with 30 cm all round, nearest the middle of where
    the camera went (or of the room)."""
    if cams:
        cx = sorted(c[0] for c in cams)[len(cams) // 2]
        cz = sorted(c[1] for c in cams)[len(cams) // 2]
    else:
        cx, cz = x0 + nx * cell / 2, z0 + nz * cell / 2
    r = max(1, round(0.3 / cell))
    best, bd = None, math.inf
    for k in range(r, nz - r):
        for i in range(r, nx - r):
            x, z = x0 + (i + 0.5) * cell, z0 + (k + 0.5) * cell
            d = (x - cx) ** 2 + (z - cz) ** 2
            if d >= bd:
                continue
            if all(walk[(k + dk) * nx + i + di] for dk in range(-r, r + 1) for di in range(-r, r + 1)
                   if di * di + dk * dk <= r * r):
                best, bd = [round(x, 3), round(z, 3)], d
    return best


def _b64(b) -> str:
    return base64.b64encode(bytes(b)).decode()


def encode(fr, floor, ceiling, mpu, source, cell, nx, nz, x0, z0, walk, top, tall, seats, start, n) -> dict:
    return {"version": ROOM_VERSION,
            # PLY coordinates p -> the map's metres: x = (p·x) m, y = (p·up - floor) m, z = (p·z) m
            "frame": {"x": _r(fr["x"]), "up": _r(fr["up"]), "z": _r(fr["z"]), "floor": round(floor, 6),
                      "metres": round(mpu, 6)},
            "scale_source": source,
            "ceiling": round((ceiling - floor) * mpu, 3) if ceiling is not None else None,
            "cell": round(cell, 4), "nx": nx, "nz": nz, "x0": round(x0, 4), "z0": round(z0, 4),
            "walk": _b64(walk), "top": _b64(top), "tall": _b64(tall),
            "seats": seats, "start": start, "splats": n}


def _r(p):
    return [round(v, 6) for v in p]


# ---------------------------------------------------------------- saved next to the room

def map_file(ply: Path) -> Path:
    return Path(ply).with_name(Path(ply).stem + ".room.json")


def current(ply: Path) -> bool:
    f = map_file(ply)
    try:
        if f.stat().st_mtime < Path(ply).stat().st_mtime:
            return False
        with open(f, "rb") as fh:
            return fh.read(32).startswith(b'{"version":%d,' % ROOM_VERSION)
    except OSError:
        return False


def build_and_save(ply: Path) -> dict:
    r = build(ply)
    f = map_file(ply)
    tmp = f.with_name(f.name + ".tmp")
    tmp.write_text(json.dumps(r, separators=(",", ":")))
    tmp.replace(f)
    return r


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(prog="body-studio room-map",
                                 description="Map a scanned room: its floor, size, walls, furniture and seats, so "
                                             "the body can stand, walk and sit in it (experimental). Writes "
                                             "ROOM.room.json next to the room.")
    ap.add_argument("ply", type=Path, help="the room: workspace/<video>/run_*/splat/*_clean.ply")
    a = ap.parse_args(argv)
    try:
        r = build_and_save(a.ply)
    except RoomError as e:
        sys.exit(f"Can't map this room: {e}")
    walk = base64.b64decode(r["walk"])
    print(f"Room: {r['nx'] * r['cell']:.1f} x {r['nz'] * r['cell']:.1f} m, "
          f"{sum(walk) * r['cell'] ** 2:.1f} m² of free floor"
          + (f", ceiling at {r['ceiling']:.2f} m" if r["ceiling"] else ""))
    print(f"Size from: {r['scale_source']}")
    print(f"Places to sit: {len(r['seats'])}" + "".join(
        f"\n  {s['y'] * 100:.0f} cm high at ({s['x']:.2f}, {s['z']:.2f}){', with a back' if s['back'] else ''}"
        for s in r["seats"]))
    print(f"Saved {map_file(a.ply)}")
