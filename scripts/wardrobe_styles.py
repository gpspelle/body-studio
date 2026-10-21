"""Make the styled items of the wardrobe: outfits in new prints and colours (hippie, rock, indie,
punk) and accessories (glasses, a beanie, a headband, necklaces), all our own work (CC0).

    python3 scripts/wardrobe_styles.py

An outfit in a new style is one of MakeHuman's outfits (its shape, `like` in wardrobe.py's
catalogue) with a new texture: each piece of it (an island of its UV map) is the top or the bottom,
told by how high it sits on the base mesh, and is painted with the style's print where it is on the
body (a tie-dye spiral round the chest, tartan, a check, stripes), in the light and shade of the
original texture, so folds and seams still read. An accessory is made here from the base mesh
(hm08): a beanie and a headband are the skin of the head offset outward, glasses are rings and rods
in front of the eyes, a necklace is beads or links on a curve round the neck. Each vertex is bound
to the base mesh as MakeHuman's clothes are (a skin vertex plus an offset), so fit.py puts it on
any body. Writes src/body_studio/wardrobe/items/<id>.json.gz (accessories) and
src/body_studio/static/wardrobe/<id>.jpg|png (textures). Needs ffmpeg. Only needed to remake them.
"""
from __future__ import annotations

import colorsys
import gzip
import json
import math
import random
import subprocess
import sys
from array import array
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
from body_studio import wardrobe  # noqa: E402
from body_studio.wardrobe import _b64 as b64  # noqa: E402

OUT = ROOT / "src" / "body_studio" / "wardrobe" / "items"
TEX = ROOT / "src" / "body_studio" / "static" / "wardrobe"


# ---------------------------------------------------------------- images (through ffmpeg)

def read_image(path: Path) -> tuple[bytearray, int, int]:
    probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
                            "-of", "csv=p=0", str(path)], capture_output=True, text=True, check=True).stdout
    w, h = (int(v) for v in probe.strip().split(","))
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(path), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                         capture_output=True, check=True).stdout
    return bytearray(raw), w, h


def write_image(path: Path, px: bytearray, w: int, h: int, alpha: bool = False) -> None:
    fmt = "rgba" if alpha else "rgb24"
    cmd = ["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", fmt, "-s", f"{w}x{h}", "-i", "-"]
    cmd += ["-q:v", "3", str(path)] if path.suffix == ".jpg" else [str(path)]
    subprocess.run(cmd, input=bytes(px), check=True)


# ---------------------------------------------------------------- the base mesh

def skin():
    b = wardrobe.base()
    V, T, n = b["verts"], b["tris"], b["n_body"]
    N = [[0.0, 0.0, 0.0] for _ in range(n)]
    for i in range(0, len(T), 3):
        a, c, d = (V[T[i + k]] for k in range(3))
        e1, e2 = [c[j] - a[j] for j in range(3)], [d[j] - a[j] for j in range(3)]
        fn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
        for k in range(3):
            for j in range(3):
                N[T[i + k]][j] += fn[j]
    for v in N:
        L = math.sqrt(sum(x * x for x in v)) or 1
        v[:] = [x / L for x in v]
    return V[:n], [tuple(T[i:i + 3]) for i in range(0, len(T), 3)], N


V, TRIS, NRM = skin()


class Grid:
    """The skin's vertices in 0.25-unit cells, for the nearest one to a point."""
    def __init__(self, pts):
        self.c, self.pts = {}, pts
        for i, p in enumerate(pts):
            self.c.setdefault(self._k(p), []).append(i)

    def _k(self, p):
        return tuple(int(math.floor(x / 0.25)) for x in p)

    def nearest(self, p):
        k, best, bd = self._k(p), None, 1e9
        for r in range(1, 6):
            for dx in range(-r, r + 1):
                for dy in range(-r, r + 1):
                    for dz in range(-r, r + 1):
                        for i in self.c.get((k[0] + dx, k[1] + dy, k[2] + dz), ()):
                            d = sum((self.pts[i][j] - p[j]) ** 2 for j in range(3))
                            if d < bd:
                                best, bd = i, d
            if best is not None and math.sqrt(bd) < r * 0.25:
                return best
        return best


GRID = Grid(V)
HEAD_SCALES = [list(s) for s in wardrobe.item("fedora")["scales"]]
TORSO_SCALES = [list(s) for s in wardrobe.item("tee_jeans")["scales"]]


# ---------------------------------------------------------------- accessories: meshes bound to the skin

class Mesh:
    def __init__(self):
        self.p, self.uv, self.tris, self.tuv = [], [], [], []

    def vert(self, p, uv):
        self.p.append(tuple(p))
        self.uv.append(tuple(uv))
        return len(self.p) - 1

    def tri(self, a, b, c):
        self.tris.append((a, b, c))
        self.tuv.append((a, b, c))


def bind(mesh: Mesh, item_id: str, scales, texture: str, alpha: bool = False) -> None:
    """Each vertex hangs from its nearest skin vertex, plus an offset (MakeHuman's binding)."""
    ref, w, off = array("i"), array("f"), array("f")
    for p in mesh.p:
        v = GRID.nearest(p)
        ref.extend((v, v, v))
        w.extend((1.0, 0.0, 0.0))
        off.extend(p[j] - V[v][j] for j in range(3))
    tris, uv = array("i"), array("f")
    for t in mesh.tris:
        tris.extend(t)
    for u in mesh.uv:
        uv.extend(u)
    rec = {"id": item_id, "z_depth": 60, "scales": scales, "ref": b64(ref), "w": b64(w), "off": b64(off),
           "tris": b64(tris), "tuv": b64(tris), "uv": b64(uv), "delete": b64(array("i")), "texture": texture,
           "alpha": alpha}
    (OUT / (item_id + ".json.gz")).write_bytes(gzip.compress(json.dumps(rec).encode(), 9, mtime=0))
    print(f"{item_id}: {len(mesh.p)} vertices, {len(mesh.tris)} triangles")


def skin_shell(keep, out: float, uvmap) -> Mesh:
    """The skin triangles whose vertices all pass `keep`, moved `out` along the skin's normal."""
    m, at = Mesh(), {}
    for t in TRIS:
        if not all(keep(V[i]) for i in t):
            continue
        idx = []
        for i in t:
            if i not in at:
                p = [V[i][j] + NRM[i][j] * out for j in range(3)]
                at[i] = m.vert(p, uvmap(p))
            idx.append(at[i])
        m.tri(*idx)
    return m


HEAD_C = (0.0, 7.4, 0.62)                    # the middle of the head (base mesh units: decimetres)


def around_head(p):
    a = math.atan2(p[0] - HEAD_C[0], p[2] - HEAD_C[2])
    return ((a / (2 * math.pi)) % 1.0, min(1.0, max(0.0, (p[1] - 6.9) / 1.7)))


def beanie(item_id: str, colour) -> None:
    # over the head down to the brow in front and the nape behind (the cut is lower at the back)
    cut = lambda p: p[1] > 7.62 - 0.26 * (1.5 - p[2]) and p[1] > 7.0 and abs(p[0]) < 1.0
    m = skin_shell(cut, 0.16, around_head)
    bind(m, item_id, HEAD_SCALES, item_id + ".jpg")
    # knitted: ribs round the head, the cuff (the lowest band) a little darker
    W = H = 256
    px = bytearray(W * H * 3)
    for y in range(H):
        for x in range(W):
            rib = 0.82 + 0.18 * (0.5 + 0.5 * math.cos(x / W * 2 * math.pi * 64))
            knit = 0.94 + 0.06 * math.sin(y / H * 2 * math.pi * 90 + 2 * math.sin(x / W * 2 * math.pi * 64))
            cuff = 0.88 if y > H * 0.66 else 1.0          # (v up: the bottom rows of the image are the top)
            for k in range(3):
                px[(y * W + x) * 3 + k] = min(255, int(255 * colour[k] * rib * knit * cuff))
    write_image(TEX / (item_id + ".jpg"), px, W, H)


def headband(item_id: str) -> None:
    # a woven band round the head at the top of the forehead, lower at the back
    def band(p):
        y0 = 7.56 - 0.22 * (1.5 - p[2])
        return y0 < p[1] < y0 + 0.3 and abs(p[0]) < 1.0
    m = skin_shell(band, 0.08, around_head)
    bind(m, item_id, HEAD_SCALES, item_id + ".jpg")
    colours = [(0.85, 0.25, 0.2), (0.95, 0.7, 0.2), (0.25, 0.55, 0.35), (0.2, 0.45, 0.7), (0.95, 0.9, 0.8)]
    W = H = 256
    px = bytearray(W * H * 3)
    for y in range(H):
        for x in range(W):
            zig = abs(((x / W * 48) % 2) - 1)               # zigzags round the band
            c = colours[int((y / H * 10 + zig * 3)) % len(colours)]
            weave = 0.85 + 0.15 * ((x + y) % 4 < 2)
            for k in range(3):
                px[(y * W + x) * 3 + k] = int(255 * c[k] * weave)
    write_image(TEX / (item_id + ".jpg"), px, W, H)


def tube(m: Mesh, path, r: float, sides: int = 6, v0: float = 0.5, closed: bool = False) -> None:
    """A round rod of radius r along the points of `path`."""
    n = len(path)
    rings = []
    for i, p in enumerate(path):
        a, b = path[(i - 1) % n if closed else max(0, i - 1)], path[(i + 1) % n if closed else min(n - 1, i + 1)]
        t = [b[j] - a[j] for j in range(3)]
        L = math.sqrt(sum(x * x for x in t)) or 1
        t = [x / L for x in t]
        ref = (0.0, 1.0, 0.0) if abs(t[1]) < 0.9 else (1.0, 0.0, 0.0)
        u = [t[1] * ref[2] - t[2] * ref[1], t[2] * ref[0] - t[0] * ref[2], t[0] * ref[1] - t[1] * ref[0]]
        Lu = math.sqrt(sum(x * x for x in u))
        u = [x / Lu for x in u]
        w = [t[1] * u[2] - t[2] * u[1], t[2] * u[0] - t[0] * u[2], t[0] * u[1] - t[1] * u[0]]
        rings.append([m.vert([p[j] + r * (math.cos(2 * math.pi * s / sides) * u[j] + math.sin(2 * math.pi * s / sides) * w[j])
                              for j in range(3)], (s / sides, v0)) for s in range(sides)])
    for i in range(n if closed else n - 1):
        A, B = rings[i], rings[(i + 1) % n]
        for s in range(sides):
            a, b, c, d = A[s], A[(s + 1) % sides], B[(s + 1) % sides], B[s]
            m.tri(a, b, c)
            m.tri(a, c, d)


EYE_Y, LENS_Z = 7.27, 1.56                   # eye height and the plane of the lenses


def glasses(item_id: str, shape: str, frame, lens) -> None:
    """Round glasses (`shape` "round") or sunglasses ("wayfarer"): rims, a bridge and the arms to the
    ears; dark lenses if `lens` is a colour."""
    m = Mesh()
    rim_r = 0.022
    for side in (-1, 1):
        cx = side * 0.33
        pts = []
        for k in range(40):
            a = 2 * math.pi * k / 40
            if shape == "round":
                x, y = 0.24 * math.cos(a), 0.24 * math.sin(a)
            else:                                     # wider, flat on top
                x, y = 0.29 * math.cos(a), 0.2 * math.sin(a) * (1.0 if math.sin(a) < 0 else 0.85)
            pts.append((cx + x, EYE_Y + y, LENS_Z - 0.06 * (x * side > 0) * abs(x) / 0.29 * 0.8))
        tube(m, pts, rim_r * (1.4 if shape != "round" else 1.0), closed=True, v0=0.25)
        if lens:
            c = m.vert((cx, EYE_Y, LENS_Z + 0.01), (0.5, 0.75))
            ring = [m.vert(p, (0.5, 0.75)) for p in pts]
            for k in range(len(ring)):
                m.tri(c, ring[k], ring[(k + 1) % len(ring)])
        # the arm: from the outer edge of the rim, past the side of the head, to the ear
        out = max(pts, key=lambda p: p[0] * side)
        arm = [out, (side * 0.72, EYE_Y + 0.05, 1.35), (side * 0.9, EYE_Y + 0.04, 0.9), (side * 0.95, EYE_Y, 0.45),
               (side * 0.9, EYE_Y - 0.12, 0.3)]
        tube(m, arm, rim_r, v0=0.25)
    # the bridge over the nose
    w0 = 0.24 if shape == "round" else 0.29
    bridge = [(-0.33 + w0 - 0.01, EYE_Y + 0.05, LENS_Z), (0, EYE_Y + 0.1, LENS_Z + 0.04), (0.33 - w0 + 0.01, EYE_Y + 0.05, LENS_Z)]
    tube(m, bridge, rim_r, v0=0.25)
    bind(m, item_id, HEAD_SCALES, item_id + ".png", alpha=True)
    # the bottom half of the texture is the frame, the top the lenses (see-through when not dark)
    W = H = 64
    px = bytearray(W * H * 4)
    for y in range(H):
        for x in range(W):
            top = y < H // 2                          # (v up: v 0.75 is in the top half of the image)
            c, a = (lens or (1, 1, 1), 0.85 if lens else 0.0) if top else (frame, 1.0)
            shine = 1.0 + 0.25 * math.sin(x / W * math.pi * 2)
            for k in range(3):
                px[(y * W + x) * 4 + k] = min(255, int(255 * c[k] * shine))
            px[(y * W + x) * 4 + 3] = int(255 * a)
    write_image(TEX / (item_id + ".png"), px, W, H, alpha=True)


def neck_curve(n: int, drop: float):
    """A loop round the base of the neck, hanging `drop` lower in front, just off the skin."""
    out = []
    for k in range(n):
        a = 2 * math.pi * k / n                       # 0: the front
        front = 0.5 + 0.5 * math.cos(a)
        p = [0.62 * math.sin(a), 5.86 - drop * front ** 3, 0.12 + 0.62 * math.cos(a)]
        v = GRID.nearest(p)
        # pushed out of the skin: 1.6 cm over the nearest skin vertex, along its normal, so it lies
        # on a T-shirt, not under it
        d = sum((p[j] - V[v][j]) * NRM[v][j] for j in range(3))
        if d < 0.16:
            p = [p[j] + NRM[v][j] * (0.16 - d) for j in range(3)]
        out.append(p)
    return out


def beads(item_id: str) -> None:
    m = Mesh()
    rnd = random.Random(3)
    for p in neck_curve(44, 0.85):
        v = rnd.random()                               # each bead its own colour (a row of the texture)
        r = 0.055
        # a little octahedron
        tips = [m.vert((p[0] + dx * r, p[1] + dy * r, p[2] + dz * r), (0.5, v))
                for dx, dy, dz in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1))]
        for a, b, c in ((0, 2, 4), (2, 1, 4), (1, 3, 4), (3, 0, 4), (2, 0, 5), (1, 2, 5), (3, 1, 5), (0, 3, 5)):
            m.tri(tips[a], tips[b], tips[c])
    bind(m, item_id, TORSO_SCALES, item_id + ".jpg")
    W, H = 8, 64
    px = bytearray(W * H * 3)
    for y in range(H):
        h = (y * 0.618) % 1.0
        r, g, b = colorsys.hsv_to_rgb(h, 0.65, 0.9) if y % 3 else (0.35, 0.22, 0.12)   # wooden beads between
        for x in range(W):
            px[(y * W + x) * 3:(y * W + x) * 3 + 3] = bytes((int(255 * r), int(255 * g), int(255 * b)))
    write_image(TEX / (item_id + ".jpg"), px, W, H)


def chain(item_id: str) -> None:
    m = Mesh()
    tube(m, neck_curve(60, 0.6), 0.04, sides=5, closed=True)
    bind(m, item_id, TORSO_SCALES, item_id + ".jpg")
    W, H = 64, 8
    px = bytearray(W * H * 3)
    for y in range(H):
        for x in range(W):
            c = int(150 + 90 * math.sin(x / W * 2 * math.pi * 3) ** 2)
            px[(y * W + x) * 3:(y * W + x) * 3 + 3] = bytes((c, c, min(255, c + 8)))
    write_image(TEX / (item_id + ".jpg"), px, W, H)


def neck_ring(y: float, out: float, n: int = 48):
    """A loop round the neck at height y, `out` off the skin: for each way round, the skin vertex
    furthest out that way near that height."""
    near = [i for i, v in enumerate(V) if abs(v[1] - y) < 0.1 and abs(v[0]) < 0.9 and -0.6 < v[2] < 1.0]
    ring = []
    for k in range(n):
        a = 2 * math.pi * k / n
        d = (math.sin(a), math.cos(a))
        i = max(near, key=lambda i: V[i][0] * d[0] + (V[i][2] - 0.2) * d[1])
        r = V[i][0] * d[0] + (V[i][2] - 0.2) * d[1] + out
        ring.append((r * d[0], y, 0.2 + r * d[1]))
    return ring


def choker(item_id: str) -> None:
    m, n = Mesh(), 48
    lo, hi = neck_ring(5.86, 0.05, n), neck_ring(6.0, 0.05, n)
    A = [m.vert(p, (k / n, 0.0)) for k, p in enumerate(lo)] + [m.vert(lo[0], (1.0, 0.0))]
    B = [m.vert(p, (k / n, 1.0)) for k, p in enumerate(hi)] + [m.vert(hi[0], (1.0, 1.0))]
    for k in range(n):
        m.tri(A[k], A[k + 1], B[k + 1])
        m.tri(A[k], B[k + 1], B[k])
    bind(m, item_id, TORSO_SCALES, item_id + ".jpg")
    W, H = 256, 32
    px = bytearray(W * H * 3)
    for y in range(H):
        for x in range(W):
            sx, sy = (x % 16) - 8, y - H / 2
            stud = sx * sx + sy * sy < 22
            c = (200, 200, 210) if stud else (22, 20, 22)
            px[(y * W + x) * 3:(y * W + x) * 3 + 3] = bytes(c)
    write_image(TEX / (item_id + ".jpg"), px, W, H)


# ---------------------------------------------------------------- outfits in a new style

def item_parts(item_id: str):
    """The outfit's vertices on the base mesh, and for every triangle whether it is on the top half
    (a shirt, a jacket) or the bottom (trousers, a skirt): by the height of its piece of cloth."""
    it, Vb = wardrobe.item(item_id), wardrobe.base()["verts"]
    ref, w, off = it["ref"], it["w"], it["off"]
    P = []
    for i in range(len(ref) // 3):
        r = ref[3 * i:3 * i + 3]
        P.append(tuple(sum(w[3 * i + m] * Vb[r[m]][j] for m in range(3)) + off[3 * i + j] for j in range(3)))
    tris, tuv = it["tris"], it["tuv"]
    nt = len(tris) // 3
    parent = list(range(len(it["uv"]) // 2))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    for t in range(nt):
        a = find(tuv[3 * t])
        for k in (1, 2):
            b = find(tuv[3 * t + k])
            if a != b:
                parent[b] = a
    ys = {}
    for t in range(nt):
        isl = find(tuv[3 * t])
        y = sum(P[tris[3 * t + k]][1] for k in range(3)) / 3
        ys.setdefault(isl, []).append(y)
    top = {isl: sum(v) / len(v) > 0.9 for isl, v in ys.items()}    # above the hips (y 0.9: about the waist)
    return it, P, [top[find(tuv[3 * t])] for t in range(nt)]


def lum(c):
    return 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]


def repaint(item_id: str, like: str, paint) -> None:
    """`like`'s texture with every texel of its cloth painted paint(top, p) (an RGB in 0..1, or None
    to keep it), in the light and shade of the original."""
    it, P, top = item_parts(like)
    src = TEX / it["texture"]
    px, W, H = read_image(src)
    out = bytearray(px)
    tris, tuv, uv = it["tris"], it["tuv"], it["uv"]
    # how light the cloth is, on average, on each half: the shade is the texel against that
    sums = {True: [0.0, 0], False: [0.0, 0]}
    jobs = []
    for t in range(len(tris) // 3):
        T = [(uv[2 * tuv[3 * t + k]] * W, (1 - uv[2 * tuv[3 * t + k] + 1]) * H) for k in range(3)]
        Q = [P[tris[3 * t + k]] for k in range(3)]
        jobs.append((T, Q, top[t]))
    done = bytearray(W * H)
    for T, Q, is_top in jobs:
        (x0, y0), (x1, y1), (x2, y2) = T
        den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
        if abs(den) < 1e-9:
            continue
        for y in range(max(0, int(min(y0, y1, y2)) - 1), min(H, int(max(y0, y1, y2)) + 2)):
            for x in range(max(0, int(min(x0, x1, x2)) - 1), min(W, int(max(x0, x1, x2)) + 2)):
                a = ((y1 - y2) * (x + 0.5 - x2) + (x2 - x1) * (y + 0.5 - y2)) / den
                b = ((y2 - y0) * (x + 0.5 - x2) + (x0 - x2) * (y + 0.5 - y2)) / den
                c = 1 - a - b
                if min(a, b, c) < -0.08 or done[y * W + x]:     # (a little over the edge: no seams)
                    continue
                done[y * W + x] = 1 if is_top else 2
                i = (y * W + x) * 3
                l = lum(px[i:i + 3]) / 255
                sums[is_top][0] += l
                sums[is_top][1] += 1
    mean = {k: (s / n if n else 0.5) for k, (s, n) in sums.items()}
    for T, Q, is_top in jobs:
        (x0, y0), (x1, y1), (x2, y2) = T
        den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
        if abs(den) < 1e-9:
            continue
        for y in range(max(0, int(min(y0, y1, y2)) - 1), min(H, int(max(y0, y1, y2)) + 2)):
            for x in range(max(0, int(min(x0, x1, x2)) - 1), min(W, int(max(x0, x1, x2)) + 2)):
                if done[y * W + x] != (1 if is_top else 2):
                    continue
                a = ((y1 - y2) * (x + 0.5 - x2) + (x2 - x1) * (y + 0.5 - y2)) / den
                b = ((y2 - y0) * (x + 0.5 - x2) + (x0 - x2) * (y + 0.5 - y2)) / den
                c = 1 - a - b
                if min(a, b, c) < -0.08:
                    continue
                p = [a * Q[0][j] + b * Q[1][j] + c * Q[2][j] for j in range(3)]
                col = paint(is_top, p)
                if col is None:
                    continue
                i = (y * W + x) * 3
                shade = min(1.3, max(0.35, (lum(px[i:i + 3]) / 255 / max(0.05, mean[is_top])) ** 0.85))
                for k in range(3):
                    out[i + k] = max(0, min(255, int(255 * col[k] * shade)))
                done[y * W + x] = 3
    write_image(TEX / (item_id + ".jpg"), out, W, H)
    print(f"{item_id}: {like} repainted")


def tiedye(top, p):
    if not top:
        return None
    dx, dy = p[0], p[1] - 3.6
    a, r = math.atan2(dy, dx), math.hypot(dx, dy)
    h = (a / (2 * math.pi) + r * 0.35) % 1.0
    s = 0.75 if (r * 3.1 + a) % 1.0 > 0.12 else 0.12          # white streaks between the colours
    return colorsys.hsv_to_rgb(h, s, 0.95)


def plaid(base, lines, scale):
    """A check: bands of `lines` [(colour, width, period offset)] across and down the cloth."""
    def at(u):
        for col, width, off in lines:
            if (u + off) % 1.0 < width:
                return col
        return None

    def paint(p):
        u = (p[0] + 0.7 * p[2]) / scale
        v = p[1] / scale
        a, b = at(u % 1.0), at(v % 1.0)
        if a and b:
            return tuple(0.5 * (a[k] + b[k]) for k in range(3))
        c = a or b
        return tuple(0.55 * c[k] + 0.45 * base[k] for k in range(3)) if c else base
    return paint


RED_TARTAN = plaid((0.62, 0.08, 0.1), [((0.05, 0.05, 0.06), 0.32, 0.0), ((0.9, 0.8, 0.3), 0.04, 0.55),
                                       ((0.05, 0.05, 0.06), 0.08, 0.75)], 1.1)
FLANNEL = plaid((0.7, 0.12, 0.12), [((0.08, 0.08, 0.08), 0.5, 0.0), ((0.9, 0.85, 0.8), 0.03, 0.72)], 0.9)


def black_jacket(top, p):
    return (0.11, 0.105, 0.1) if top else (0.12, 0.12, 0.14)


def band_tee(top, p):
    if not top:
        return (0.13, 0.13, 0.15)                      # black jeans
    # a black tee with a white star in a ring on the chest
    if p[2] > 0.8:
        x, y = p[0], p[1] - 3.3
        r, a = math.hypot(x, y), math.atan2(y, x) - math.pi / 2
        star = 0.22 + 0.2 * (0.5 + 0.5 * math.cos(5 * a)) ** 3
        if 0.5 < r < 0.58 or r < star:
            return (0.92, 0.9, 0.85)
    return (0.1, 0.1, 0.11)


def breton(top, p):
    if not top:
        return None
    return (0.12, 0.16, 0.32) if (p[1] % 0.32) < 0.12 else (0.93, 0.92, 0.88)


def floral(top, p):
    if not top:
        return (0.55, 0.38, 0.2)                       # a long brown skirt
    rnd = random.Random(int(math.floor(p[0] / 0.45)) * 7919 + int(math.floor(p[1] / 0.45)) * 31 + int(math.floor(p[2] / 0.45)))
    cx, cy = (math.floor(p[0] / 0.45) + 0.2 + 0.6 * rnd.random()) * 0.45, (math.floor(p[1] / 0.45) + 0.2 + 0.6 * rnd.random()) * 0.45
    dx, dy = p[0] - cx, p[1] - cy
    r, a = math.hypot(dx, dy), math.atan2(dy, dx)
    petal = 0.11 + 0.05 * math.cos(5 * a)
    if r < 0.04:
        return (0.95, 0.8, 0.2)
    if r < petal:
        return colorsys.hsv_to_rgb(rnd.choice((0.0, 0.08, 0.85, 0.6)), 0.6, 0.9)
    return (0.94, 0.9, 0.78)


def punk_top(top, p):
    return (0.08, 0.08, 0.09) if top else RED_TARTAN(p)


def tartan_trousers(top, p):
    return (0.08, 0.08, 0.09) if top else RED_TARTAN(p)


def flannel(top, p):
    return FLANNEL(p) if top else None


STYLED = [("tiedye_tee_jeans", "tee_jeans", tiedye), ("floral_shirt_skirt", "shirt_skirt", floral),
          ("leather_jacket", "jacket_jeans", black_jacket), ("band_tee", "white_tee_jeans", band_tee),
          ("tartan_skirt", "shirt_skirt", punk_top), ("tartan_trousers", "longsleeve_jeans", tartan_trousers),
          ("flannel_shirt", "denim_shirt_jeans", flannel), ("breton_tee", "tee_jeans_f", breton)]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    only = set(sys.argv[1:])
    for item_id, like, paint in STYLED:
        if not only or item_id in only:
            repaint(item_id, like, paint)
    acc = {"beanie": lambda: beanie("beanie", (0.85, 0.62, 0.18)),
           "black_beanie": lambda: beanie("black_beanie", (0.13, 0.13, 0.14)),
           "headband": lambda: headband("headband"),
           "round_glasses": lambda: glasses("round_glasses", "round", (0.75, 0.6, 0.3), None),
           "hippie_shades": lambda: glasses("hippie_shades", "round", (0.75, 0.6, 0.3), (0.55, 0.3, 0.45)),
           "sunglasses": lambda: glasses("sunglasses", "wayfarer", (0.06, 0.06, 0.06), (0.07, 0.07, 0.08)),
           "beads": lambda: beads("beads"), "chain": lambda: chain("chain"), "choker": lambda: choker("choker")}
    for item_id, make in acc.items():
        if not only or item_id in only:
            make()


if __name__ == "__main__":
    main()
