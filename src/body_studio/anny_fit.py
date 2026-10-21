"""Trial: MakeHuman's base mesh fitted to a body with Anny, a PyTorch body model, in place of
fit.py's shape solve, bone bending and shrinkwrap. Optional and experimental, to compare the two.

    pip install 'body-studio[anny]'          PyTorch and Anny (Apache-2.0 code, CC0 MakeHuman data)
    body-studio fit-anny BODY.ply [--no-wrap]  writes BODY.anny.fit.json next to BODY.fit.json

When it is installed, the Try on panel offers a switch between the two body models (the page asks
GET /api/fit?model=anny), and the server makes this file the first time it is asked for.

Anny (https://github.com/naver/anny) is MakeHuman with its shape sliders made differentiable:
eleven overall ones (gender, age, muscle, weight, height, proportions, cup size, firmness and
three for ancestry) and 254 regional ones (waist, hips, upper arm fat...). Its "makehuman"
topology is hm08 vertex for vertex, so its mesh stands in for the base mesh and every garment
keeps its binding. Once per body:

1. The sliders, the turn of each main bone and one overall turn, shift and size are found with
   Adam so that the joints the skeleton finder (rig.py) finds on the base mesh land on the
   scan's, and the skin lies on the splats both ways (skin vertices near splats, splats near the
   skin) with a robust loss, wide at first and narrowed as it goes, so stray splats and hair
   don't pull. The pose first, then the shape from a male and a female start (from the middle it
   stays between the two), the better one going on. Face and finger sliders are left alone: a
   scan can't tell them apart.
2. The skin then moves along its normals onto the splats like fit.py's last pass, for what the
   sliders can't reach (--no-wrap leaves Anny's skin as it is: further off, and more of a tight
   outfit sinks into it).
3. The helper geometry clothes and hair are bound to follows the skin under it, as in fit.py
   (Anny's own helpers drift from the skin they hang from).

The result is fit.py's format and version, in its own file, with "model": "anny" and Anny's
overall sliders as "shape". Each vertex's turn, for the clothes' offsets, comes from the same
bone transforms as in fit.py, so only where the skin is differs between the two. Results:
docs/anny.md.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from functools import lru_cache
from pathlib import Path

from . import fit, rig

ITERS = (80, 60, 160)           # Adam steps: the pose, then everything from each gender, then the better one
GENDERS = (0.2, 0.8)
LR = 0.03
SIGMA = (0.1, 0.02)             # robust loss width (fraction of stature), narrowed over the steps:
                                # wide first, so skin far off (a bust, a belly) is still pulled in
JOINT_SIGMA = 0.02
MAX_POINTS = 25000              # opaque splats used for the surface terms
BATCH = (3000, 6000)            # skin vertices and splats drawn afresh each step for the surface terms
FACE = ("ear", "eye", "nose", "mouth", "chin", "cheek", "eyebrows", "forehead", "l-ear", "r-ear",
        "l-eye", "r-eye", "l-cheek", "r-cheek", "l-hand-fingers", "r-hand-fingers")
# Anny's bones that are turned (the twist bones, fingers and toes follow their parents)
POSE_BONES = ("spine01", "spine02", "spine03", "spine04", "spine05", "neck01", "head",
              "upperleg01.L", "lowerleg01.L", "foot.L", "upperleg01.R", "lowerleg01.R", "foot.R",
              "clavicle.L", "shoulder01.L", "upperarm01.L", "lowerarm01.L", "wrist.L",
              "clavicle.R", "shoulder01.R", "upperarm01.R", "lowerarm01.R", "wrist.R")


class Missing(RuntimeError):
    code = "anny"


def available() -> bool:
    """Whether PyTorch and Anny are installed (without importing them: that takes seconds)."""
    from importlib.util import find_spec
    return find_spec("torch") is not None and find_spec("anny") is not None


def _torch():
    try:
        import torch
        import anny
    except ImportError as e:
        raise Missing("the Anny trial needs PyTorch and Anny: pip install 'body-studio[anny]'") from e
    return torch, anny


def body_slider(label: str) -> bool:
    """Whether a regional slider is fitted (face and finger ones are left at 0)."""
    return not label.startswith(FACE)


@lru_cache(maxsize=1)
def model():
    torch, anny = _torch()
    return anny.Anny(topology="makehuman", local_changes="default", phenotypes="all").to(dtype=torch.float32)


def joint_regressor(P, J, nb, H, names=None):
    """For each joint of the base mesh's skeleton, weights on nearby skin vertices whose sum is
    the joint (the smallest such weights), so the same joint can be read off any shape of the
    mesh: [(name, [(vertex, weight), ...])]."""
    torch, _ = _torch()
    out = []
    for name in names or sorted(J):
        c = J[name]
        r = 0.04 * H
        while True:
            ids = [i for i in range(nb) if fit._d2(P[i], c) < r * r]
            if len(ids) >= 24 or r > 0.3 * H:
                break
            r *= 1.5
        A = torch.tensor([[P[i][k] for i in ids] for k in range(3)] + [[1.0] * len(ids)], dtype=torch.float64)
        b = torch.tensor([c[0], c[1], c[2], 1.0], dtype=torch.float64)
        w = torch.linalg.pinv(A) @ b
        out.append((name, list(zip(ids, w.tolist()))))
    return out


def _procrustes(torch, A, B):
    """s, R, t with s R a + t closest to b."""
    ca, cb = A.mean(0), B.mean(0)
    U, S, Vt = torch.linalg.svd((B - cb).T @ (A - ca))
    d = torch.sign(torch.linalg.det(U @ Vt))
    D = torch.diag(torch.tensor([1.0, 1.0, float(d)], dtype=A.dtype))
    R = U @ D @ Vt
    s = (S * torch.diagonal(D)).sum() / ((A - ca) ** 2).sum()
    return s, R, cb - s * (R @ ca)


def _nearest(torch, a, b, chunk=2048):
    """Index of the nearest of b for every row of a (no gradient)."""
    with torch.no_grad():
        return torch.cat([torch.cdist(a[i:i + chunk], b).argmin(1) for i in range(0, len(a), chunk)])


def _robust(torch, d2, s):
    return (d2 / (d2 + s * s)).mean()


def fit_anny(rig_json: dict, xs, ys, zs, opacity, wrap: bool = True, log=None, start=None) -> dict:
    """Like fit.fit_splats, with Anny's mesh in place of the bent and shrinkwrapped base mesh."""
    torch, _ = _torch()
    import roma
    base = fit.base_rig()
    m = model()
    fr = {k: tuple(v) for k, v in rig_json["frame"].items() if k in ("origin", "left", "up", "front")}
    Hs, Hb = rig_json["height"], base["H"]
    o, L, U, F = fr["origin"], fr["left"], fr["up"], fr["front"]

    def body(p):
        d = rig._sub(p, o)
        return (rig._dot(d, L), rig._dot(d, U), rig._dot(d, F))
    Js = {j["name"]: body(j["pos"]) for j in rig_json["joints"]}
    opaque = [i for i, a in enumerate(opacity) if a >= 0.5]
    if len(opaque) < 2000:
        raise fit.FitError("too few splats to fit the body", "few")
    stride = max(1, len(opaque) // MAX_POINTS)
    pts = [body((xs[i], ys[i], zs[i])) for i in opaque[::stride]]
    T = torch.tensor(pts, dtype=torch.float32) / Hs                      # in statures
    nb = base["n_body"]

    # Anny's default mesh onto the base mesh (in the base's body coordinates, in statures)
    with torch.no_grad():
        A0 = m()["vertices"][0].double()
    Pb = torch.tensor(base["P"], dtype=torch.float64) / Hb
    s0, R0, t0 = (x.float() for x in _procrustes(torch, A0, Pb))
    names = [n for n in sorted(Js) if n in base["J"]]
    reg = joint_regressor(base["P"], base["J"], nb, Hb, names)
    Jw = torch.zeros(len(reg), len(base["P"]))
    for k, (_, ws) in enumerate(reg):
        for i, w in ws:
            Jw[k, i] = w
    Jt = torch.tensor([Js[n] for n in names], dtype=torch.float32) / Hs

    local = [k for k, lab in enumerate(m.local_change_labels) if body_slider(lab)]
    bones = [m.bone_labels.index(b) for b in POSE_BONES if b in m.bone_labels]
    eye = torch.eye(4).repeat(1, m.bone_count, 1, 1)
    gi = m.phenotype_labels.index("gender")

    def forward(p):
        lcs = torch.zeros(1, len(m.local_change_labels))
        lcs[0, local] = torch.tanh(p["lc"])
        pose = eye.clone()
        pose[0, bones, :3, :3] = roma.rotvec_to_rotmat(p["rv"])
        A = m(pose_parameters=pose, phenotype_kwargs=torch.sigmoid(p["ph"])[None],
              local_changes_kwargs=lcs)["vertices"][0]
        X = s0 * A @ R0.T + t0
        c = X[:nb].mean(0)
        return torch.exp(p["ls"]) * (X - c) @ roma.rotvec_to_rotmat(p["grv"]).T + c + p["gt"]

    gen = torch.Generator().manual_seed(0)

    def loss(p, X, surface, sigma):
        J = Jw @ X
        lj = ((J - Jt) ** 2).sum(1)
        out = _robust(torch, lj, max(sigma, JOINT_SIGMA)) * (1.0 if surface else 10.0)
        if surface:
            S = X[:nb]
            a = S[torch.randint(nb, (BATCH[0],), generator=gen)]            # skin -> nearest splat
            b = T[torch.randint(len(T), (BATCH[1],), generator=gen)]        # splat -> nearest skin
            i, j = _nearest(torch, a, T), _nearest(torch, b, S)
            out = out + _robust(torch, ((a - T[i]) ** 2).sum(1), sigma) + _robust(torch, ((b - S[j]) ** 2).sum(1), sigma)
        prior = 1e-3 * (torch.tanh(p["lc"]) ** 2).sum() + 1e-3 * (p["rv"] ** 2).sum() + 1e-2 * p["ls"].pow(2).sum()
        return out + prior

    def run(p, n, surface, sigmas, name, opt=None):
        """n Adam steps (the regional sliders only with the surface terms); the optimiser, to go on with."""
        if opt is None:
            opt = torch.optim.Adam([{"params": [v for k, v in p.items() if k != "lc"]},
                                    {"params": [p["lc"]], "lr": LR / 3}], lr=LR)
        for it in range(n):
            opt.zero_grad()
            sigma = sigmas[0] * (sigmas[1] / sigmas[0]) ** (it / max(1, n - 1))
            v = loss(p, forward(p), surface, sigma)
            v.backward()
            if not surface:
                p["lc"].grad = None
            opt.step()
            if log and it % 20 == 0:
                log(f"{name} step {it}: {v.item():.4f}")
        return opt

    def score(p, sigma):
        """The surface terms over every skin vertex and splat (to compare two fits)."""
        with torch.no_grad():
            S = forward(p)[:nb]
            i, j = _nearest(torch, S, T), _nearest(torch, T, S)
            return float(_robust(torch, ((S - T[i]) ** 2).sum(1), sigma) + _robust(torch, ((T - S[j]) ** 2).sum(1), sigma))

    def params(**init):
        return {"ph": torch.tensor([_logit(init.get(k, 0.5)) for k in m.phenotype_labels]),
                "lc": torch.zeros(len(local)), "rv": torch.zeros(len(bones), 3),
                "grv": torch.zeros(3), "gt": torch.zeros(3), "ls": torch.zeros(1)}

    def grad(p):
        return {k: v.detach().clone().requires_grad_(True) for k, v in p.items()}

    p = grad(params(**(start or {})))
    opt = run(p, ITERS[0], False, SIGMA, "pose")
    state = {k: v.detach().clone() for k, v in p.items()}, opt.state_dict()
    # Gender shapes the whole trunk (a bust, the hips), and from the middle the fit stays there:
    # a short fit from each side, then the better one goes on.
    sm = SIGMA[0] * (SIGMA[1] / SIGMA[0]) ** 0.5
    tries = []
    for g in ([start["gender"]] if start and "gender" in start else GENDERS):
        q = grad(state[0])
        with torch.no_grad():
            q["ph"][gi] = _logit(g)
        o = run(q, 0, True, SIGMA, "")
        o.load_state_dict(state[1])
        o = run(q, ITERS[1], True, (SIGMA[0], sm), f"gender {g}", o)
        tries.append((score(q, sm), g, q, o))
        if log:
            log(f"gender {g}: {tries[-1][0]:.4f}")
    _, _, p, opt = min(tries, key=lambda t: t[0])
    run(p, ITERS[2], True, (sm, SIGMA[1]), "shape", opt)
    last = score(p, SIGMA[1])

    with torch.no_grad():
        X = forward(p) * Hs
    skin = [tuple(map(float, v)) for v in X[:nb].tolist()]
    Q = _rotations(base, Js, Hs)
    if wrap:
        hsh = fit._Hash(pts, 0.01 * Hs)
        skin, hit = fit.shrinkwrap(skin, base["tris"], nb, base["nbrs"], pts, hsh, Hs, fit.PASSES[-1])
    else:
        hit = _found(skin, pts, Hs)
    # The helpers clothes and hair are bound to (tights, skirt, hair cap) follow the skin under
    # them, as in fit.py: Anny's own helpers drift up to 2% of the height from the skin they hang from.
    T = fit.bone_transforms(base["J"], base["H"], Js, Hs)
    lbs = fit._pose(base["P"], base["W"], T, len(base["P"]))
    out = list(skin)
    for i in range(nb, len(lbs)):
        move = [0.0, 0.0, 0.0]
        for j, f in base["follow"][i - nb]:
            for k in range(3):
                move[k] += f * (skin[j][k] - lbs[j][k])
        out.append(rig._add(lbs[i], move))
    if hit < 0.5:
        raise fit.FitError("the body's surface wasn't found around most of the base mesh", "shape")
    sliders = dict(zip(m.phenotype_labels, (round(x, 3) for x in torch.sigmoid(p["ph"]).tolist())))
    return {"verts": out, "rot": Q, "axes": base["axes"], "frame": fr, "height": Hs, "n_body": nb,
            "normals": fit._normals(skin, base["tris"], nb), "surface_found": round(hit, 3),
            "shape": sliders, "wrap": wrap, "loss": last}


def _logit(p):
    return math.log(p / (1 - p))


def _rotations(base, Js, Hs):
    """Each vertex's turn, as fit.py finds it (its bones' turns blended by its skin weights)."""
    T = fit.bone_transforms(base["J"], base["H"], Js, Hs)
    return [fit._blend_q([(T[b]["q"], w) for b, w in W]) for W in base["W"]]


def _found(skin, pts, H, near=0.015):
    """Share of skin vertices with a splat within `near` statures."""
    h = fit._Hash(pts, near * H)
    r2 = (near * H) ** 2
    return sum(any(fit._d2(p, pts[j]) < r2 for j in h.near(p)) for p in skin) / len(skin)


def build(ply: Path, wrap: bool = True, log=None) -> dict:
    _torch()                                                  # before the slow rig, if it's missing
    r = rig.cached(ply) or rig.build_and_save(ply)
    d = rig.load_splats(ply)
    f = fit_anny(r, d["x"], d["y"], d["z"], d["opacity"], wrap=wrap, log=log)
    out = fit.encode(f)
    out.update(model="anny", wrap=wrap)
    return out


def fit_file(ply: Path) -> Path:
    return Path(ply).with_name(Path(ply).stem + ".anny.fit.json")


def current(ply: Path) -> bool:
    """Whether the saved Anny fit is newer than the body and of fit.py's version."""
    f = fit_file(ply)
    try:
        if f.stat().st_mtime < Path(ply).stat().st_mtime:
            return False
        with open(f, "rb") as fh:
            return fh.read(32).startswith(b'{"version":%d,' % fit.FIT_VERSION)
    except OSError:
        return False


def build_and_save(ply: Path, wrap: bool = True, log=None) -> dict:
    r = build(ply, wrap, log)
    f = fit_file(ply)
    tmp = f.with_name(f.name + ".tmp")
    tmp.write_text(json.dumps(r, separators=(",", ":")))
    tmp.replace(f)
    return r


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(prog="body-studio fit-anny",
                                 description="Trial: fit MakeHuman's base mesh to a body with Anny (PyTorch) "
                                             "instead of fit.py's bone bending and shrinkwrap. Writes "
                                             "BODY.anny.fit.json; the Try on panel switches between the two.")
    ap.add_argument("ply", type=Path, help="the body: workspace/<video>/run_*/splat/*_object.ply")
    ap.add_argument("--no-wrap", action="store_true",
                    help="leave Anny's skin as it is (no last pass onto the splats, like fit.py's)")
    ap.add_argument("-v", "--verbose", action="store_true")
    a = ap.parse_args(argv)
    try:
        r = build_and_save(a.ply, not a.no_wrap, print if a.verbose else None)
    except Missing as e:
        sys.exit(str(e))
    except (rig.RigError, fit.FitError) as e:
        sys.exit(f"Can't fit this body: {e}")
    sl = ", ".join(f"{k} {v:.2f}" for k, v in r["shape"].items())
    print(f"Fitted with Anny ({sl}): a splat within 1.5% of the height of "
          f"{round(100 * r['surface_found'])}% of the skin." if a.no_wrap else
          f"Fitted with Anny ({sl}), then wrapped: the body's surface was found under "
          f"{round(100 * r['surface_found'])}% of the base mesh.")
    print(f"Saved {fit_file(a.ply)}")
