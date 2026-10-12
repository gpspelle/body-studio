"""Body measurements and a body fat estimate from a finished body (experimental).

    body-studio measure BODY.ply --sex m --height 178 [--weight 80] [--tape-waist 86]

The splat has no units, so the person's height scales it. The body is sliced across the up
axis; each slice is measured like a tape would be (the perimeter of its convex hull, around
the piece of the slice that is the trunk or neck, so arms and hands are left out). Neck, waist
and hip circumferences go into published tape-measure equations. Their error against DXA is
about 4-5 points of body fat for one person, so the estimate is for tracking change, not a
clinical number. Research and sources: docs/body-fat.md.
"""
from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

CM_PER_INCH = 2.54
LB_PER_KG = 2.20462

# Landmark search bands as fractions of stature (feet at 0, top of head at 1). Approximate
# adult proportions; a tape check (`--tape-waist`) catches a capture where they don't hold.
NAVEL = 0.60
HIP_BAND = (0.45, 0.56)          # widest slice: buttocks
NECK_BAND = (0.80, 0.88)         # narrowest slice between shoulders and head

SLICE_CM = 1.0                   # slice thickness
CELL_CM = 3.0                    # grid used to split a slice into separate pieces (trunk, arms)
TAPE_TOLERANCE_CM = 2.0          # scan vs tape difference that marks a capture as doubtful
ERROR_BAND = 4.5                 # typical error, points of body fat (docs/body-fat.md)


# ---------------------------------------------------------------- equations

def _sex(sex: str) -> str:
    s = sex.strip().lower()[:1]
    if s not in ("m", "f"):
        raise ValueError(f"sex must be m or f, not {sex!r}")
    return s


def navy(sex: str, height_cm: float, neck_cm: float, waist_cm: float, hip_cm: float | None = None) -> float:
    """US Navy (Hodgdon & Beckett 1984) body fat %, from circumferences in inches."""
    h, n, w = height_cm / CM_PER_INCH, neck_cm / CM_PER_INCH, waist_cm / CM_PER_INCH
    if _sex(sex) == "m":
        if w <= n:
            raise ValueError("waist must be larger than neck")
        return 86.010 * math.log10(w - n) - 70.041 * math.log10(h) + 36.76
    if hip_cm is None:
        raise ValueError("the women's Navy equation needs the hip circumference")
    return 163.205 * math.log10(w + hip_cm / CM_PER_INCH - n) - 97.684 * math.log10(h) - 78.387


def army_one_site(sex: str, weight_kg: float, waist_cm: float) -> float:
    """US Army one-site equation (2023): waist at the navel and body weight, in inches and pounds."""
    wt, w = weight_kg * LB_PER_KG, waist_cm / CM_PER_INCH
    if _sex(sex) == "m":
        return -26.97 - 0.12 * wt + 1.99 * w
    return -9.15 - 0.015 * wt + 1.27 * w


def rfm(sex: str, height_cm: float, waist_cm: float) -> float:
    """Relative fat mass (Woolcott & Bergman 2018): 64 - 20 * height / waist + 12 for women."""
    return 64 - 20 * height_cm / waist_cm + (12 if _sex(sex) == "f" else 0)


def estimates(sex: str, height_cm: float, neck_cm: float, waist_cm: float, hip_cm: float | None = None,
              weight_kg: float | None = None) -> dict:
    """Every equation the inputs allow, by name."""
    out = {"navy": navy(sex, height_cm, neck_cm, waist_cm, hip_cm), "rfm": rfm(sex, height_cm, waist_cm)}
    if weight_kg:
        out["army"] = army_one_site(sex, weight_kg, waist_cm)
    return out


def tape_check(scan_cm: float, tape_cm: float, tolerance: float = TAPE_TOLERANCE_CM) -> dict:
    """Compare a scanned circumference with the same one taken by tape on the same day.
    The offset can correct later captures of the same person that come without a tape."""
    offset = scan_cm - tape_cm
    return {"offset_cm": offset, "ok": abs(offset) <= tolerance}


# ---------------------------------------------------------------- geometry

def hull_perimeter(points: list) -> float:
    """Perimeter of the convex hull of 2D points (monotone chain): what a tape around them reads."""
    pts = sorted(set(points))
    if len(pts) < 2:
        return 0.0
    if len(pts) == 2:
        return 2 * math.dist(*pts)

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    hull = lower[:-1] + upper[:-1]
    return sum(math.dist(hull[i], hull[i - 1]) for i in range(len(hull)))


def pieces(points: list, cell: float) -> list:
    """Split 2D points into connected pieces on a grid of `cell` (trunk, each arm, each hand)."""
    grid: dict = {}
    for p in points:
        grid.setdefault((math.floor(p[0] / cell), math.floor(p[1] / cell)), []).append(p)
    seen, out = set(), []
    for start in grid:
        if start in seen:
            continue
        seen.add(start)
        stack, piece = [start], []
        while stack:
            cx, cy = stack.pop()
            piece.extend(grid[(cx, cy)])
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    k = (cx + dx, cy + dy)
                    if k in grid and k not in seen:
                        seen.add(k)
                        stack.append(k)
        out.append(piece)
    return out


def _basis(up):
    n = math.sqrt(sum(v * v for v in up)) or 1.0
    u = tuple(v / n for v in up)
    a = (1.0, 0.0, 0.0) if abs(u[0]) < 0.9 else (0.0, 1.0, 0.0)
    e1 = (u[1] * a[2] - u[2] * a[1], u[2] * a[0] - u[0] * a[2], u[0] * a[1] - u[1] * a[0])
    m = math.sqrt(sum(v * v for v in e1))
    e1 = tuple(v / m for v in e1)
    e2 = (u[1] * e1[2] - u[2] * e1[1], u[2] * e1[0] - u[0] * e1[2], u[0] * e1[1] - u[1] * e1[0])
    return u, e1, e2


def _surrounds(piece: list, p) -> bool:
    xs, ys = [q[0] for q in piece], [q[1] for q in piece]
    return min(xs) <= p[0] <= max(xs) and min(ys) <= p[1] <= max(ys)


def _quantile(sorted_vals, q):
    return sorted_vals[min(len(sorted_vals) - 1, max(0, int(q * (len(sorted_vals) - 1))))]


def profile(points: list, up, height_cm: float, lo: float = 0.40, hi: float = 0.92) -> list:
    """Circumference (cm) of the central piece of each slice between `lo` and `hi` of stature.

    Returns [(fraction of stature, circumference cm)]. `points` are (x, y, z) splat centres of the
    person alone (floor and room already removed); `up` points from feet to head."""
    u, e1, e2 = _basis(up)
    hs = [p[0] * u[0] + p[1] * u[1] + p[2] * u[2] for p in points]
    order = sorted(hs)
    # ignore a few stray splats at either end when finding the soles and the top of the head
    bottom, top = _quantile(order, 0.001), _quantile(order, 0.999)
    if top <= bottom:
        raise ValueError("the body has no height")
    scale = height_cm / (top - bottom)                      # cm per model unit
    nslices = int(height_cm / SLICE_CM)
    slices: dict = {}
    for p, h in zip(points, hs):
        f = (h - bottom) / (top - bottom)
        if lo <= f <= hi:
            slices.setdefault(min(int(f * nslices), nslices - 1), []).append(
                ((p[0] * e1[0] + p[1] * e1[1] + p[2] * e1[2]) * scale,
                 (p[0] * e2[0] + p[1] * e2[1] + p[2] * e2[2]) * scale))
    # the trunk's axis: middle of the body around the navel, where the trunk dominates
    mid = [q for k, s in slices.items() if abs((k + 0.5) / nslices - NAVEL) < 0.05 for q in s]
    if not mid:
        raise ValueError("no splats at waist height")
    ax = (sorted(q[0] for q in mid)[len(mid) // 2], sorted(q[1] for q in mid)[len(mid) // 2])
    out = []
    for k in sorted(slices):
        parts = pieces(slices[k], CELL_CM)
        # the trunk (or neck) surrounds the axis; failing that, it is the piece nearest to it
        best = min(parts, key=lambda pc: (not _surrounds(pc, ax), min(math.dist(q, ax) for q in pc)))
        if len(best) >= 8:
            out.append(((k + 0.5) / nslices, hull_perimeter(best)))
    return out


def landmarks(prof: list) -> dict:
    """Neck, waist and hip circumferences from a profile (see the bands at the top)."""
    def band(lo, hi):
        rows = [r for r in prof if lo <= r[0] <= hi]
        if not rows:
            raise ValueError(f"nothing measured between {lo:.0%} and {hi:.0%} of height")
        return rows
    waist = min(prof, key=lambda r: abs(r[0] - NAVEL))
    if abs(waist[0] - NAVEL) > 0.02:
        raise ValueError("nothing measured at navel height")
    neck, hip = min(band(*NECK_BAND), key=lambda r: r[1]), max(band(*HIP_BAND), key=lambda r: r[1])
    return {"neck_cm": neck[1], "waist_cm": waist[1], "hip_cm": hip[1],
            "levels": {"neck_cm": neck[0], "waist_cm": waist[0], "hip_cm": hip[0]}}   # fraction of stature


# ---------------------------------------------------------------- file and command line

def load_points(ply_path: Path, min_opacity: float = 0.5):
    """Opaque splat centres and the up axis of a body PLY (Brush's 'Vertical axis' comment)."""
    from splat_studio.splats import PlyFile, load
    ply = PlyFile(Path(ply_path))
    d = load(ply)
    pts = [(x, y, z) for x, y, z, o in zip(d["x"], d["y"], d["z"], d["opacity"]) if o >= min_opacity]
    return pts, ply.up_axis() or (0.0, -1.0, 0.0)          # COLMAP data is y-down


def measure(ply_path: Path, sex: str, height_cm: float, weight_kg: float | None = None,
            tape_waist_cm: float | None = None) -> dict:
    pts, up = load_points(ply_path)
    prof = profile(pts, up, height_cm)
    m = landmarks(prof)
    out = {"measurements": m, "body_fat": estimates(sex, height_cm, m["neck_cm"], m["waist_cm"],
                                                    m["hip_cm"], weight_kg),
           "profile": prof}
    if tape_waist_cm:
        out["tape_check"] = tape_check(m["waist_cm"], tape_waist_cm)
    return out


def format_report(r: dict) -> str:
    m, bf = r["measurements"], r["body_fat"]
    lines = [f"Neck   {m['neck_cm']:6.1f} cm", f"Waist  {m['waist_cm']:6.1f} cm  (at the navel)",
             f"Hips   {m['hip_cm']:6.1f} cm", ""]
    names = {"navy": "US Navy", "army": "US Army one-site", "rfm": "Relative fat mass"}
    for k in ("navy", "army", "rfm"):
        if k in bf:
            lines.append(f"{names[k]:<18} {bf[k]:5.1f} % body fat")
    lines.append(f"\nExperimental. Expect about ±{ERROR_BAND:g} points for one person; "
                 "compare captures of the same person over time.")
    tc = r.get("tape_check")
    if tc:
        verdict = "agrees" if tc["ok"] else "differs by more than 2 cm: check the capture or the tape"
        lines.append(f"Waist vs tape: {tc['offset_cm']:+.1f} cm, {verdict}.")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(prog="body-studio measure",
                                 description="Neck, waist and hips from a finished body, and a body fat "
                                             "estimate (experimental, about ±4.5 points).")
    ap.add_argument("ply", type=Path, help="the body: workspace/<video>/run_*/splat/*_object.ply")
    ap.add_argument("--sex", required=True, choices=["m", "f"])
    ap.add_argument("--height", type=float, required=True, help="height in cm (scales the body)")
    ap.add_argument("--weight", type=float, help="weight in kg, same day (adds the Army equation)")
    ap.add_argument("--tape-waist", type=float, help="waist at the navel by tape, cm (checks the capture)")
    a = ap.parse_args(argv)
    try:
        r = measure(a.ply, a.sex, a.height, a.weight, a.tape_waist)
    except ValueError as e:
        sys.exit(f"Can't measure this body: {e}")
    print(format_report(r))
