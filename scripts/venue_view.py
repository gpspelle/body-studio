#!/usr/bin/env python3
"""See the sample venue without the browser, in seconds: text from above, text against a wall, the
fittings in an area, or a tiny picture from where a person stands (beside the walkthrough's frame).
Look here first; take a real screenshot only to check tones or a final result.

  python3 scripts/venue_view.py plan  -x -20 0 -z 0 8.6           # walls, doors, fittings from above
  python3 scripts/venue_view.py plan  -x 0 18 -z 0 9 --by colour  # each cell's nearest named colour
  python3 scripts/venue_view.py elev  z=4 --from - -r -20 0       # the z = 4 wall seen from inside
  python3 scripts/venue_view.py list  -x 11 21 -z -4 3.2          # the fittings there, and what they fill
  python3 scripts/venue_view.py view  --at -17 2 --look 180 --frame 0:03 --out /tmp/v.png
  python3 scripts/venue_view.py view  --views views.json --out /tmp/v.png   # compare.js's kept views
  python3 scripts/venue_view.py route 0:04,1:20 --out /tmp/r.png  # walkthrough frame | render, per pose
  python3 scripts/venue_view.py route all --out /tmp/r.png         # every pose in venue_route.json

Coordinates are the venue's own metres (venue_plan.py): x along the house (the deck at -21.8, the
beach far +x), y up, z across (0 the right-hand wall walking in). A view's `look` is in degrees: 0
looks along +x, 90 turns left (toward -z), 180 back toward the front door. The splats are drawn once
and kept in ~/.cache/body-studio-view until the venue's Python changes."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import shutil
import struct
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
JS = ROOT / "scripts" / "venue_view.mjs"
CACHE = Path.home() / ".cache" / "body-studio-view"
VIDEO = Path("/mnt/project-files/body-studio/venue/hq-video/walkthrough.mp4")
SOURCES = ("sample_venue.py", "venue_plan.py", "venue_fittings.py", "sample_room.py")
FRAME = (480, 848)          # the walkthrough's frame (portrait)
ROUTE = ROOT / "scripts" / "venue_route.json"   # camera poses along the walkthrough, by its time


def palette() -> dict:
    """The named colours a cell is matched to: the venue plan's (its (r, g, b) constants) and the
    decor's own (static/decor/shapes.js COLOURS)."""
    from body_studio import venue_plan
    out = {k: list(v) for k, v in vars(venue_plan).items()
           if k.isupper() and isinstance(v, tuple) and len(v) == 3 and all(isinstance(c, float) and 0 <= c <= 1 for c in v)}
    js = (ROOT / "src/body_studio/static/decor/shapes.js").read_text()
    body = js[js.index("export const COLOURS"):].split("};", 1)[0]
    for name, r, g, b in __import__("re").findall(r"(\w+): \[([\d.]+), ([\d.]+), ([\d.]+)\]", body):
        out.setdefault(name, [float(r), float(g), float(b)])
    # (one name for colours too alike to tell apart in a render: the first kept)
    kept = {}
    for name, c in out.items():
        if all(sum((a - b) ** 2 for a, b in zip(c, k)) > 0.06 ** 2 for k in kept.values()):
            kept[name] = c
    return kept


def write_scene(folder: Path, splats, fixtures: list, pal: dict) -> Path:
    """The scene venue_view.mjs reads: splats.f32 (9 floats a splat: x y z r g b sx sy sz) and
    scene.json ({fixtures, palette})."""
    folder.mkdir(parents=True, exist_ok=True)
    with open(folder / "splats.f32", "wb") as f:
        for (p, c, s, *_) in splats:
            f.write(struct.pack("<9f", *p, *c, *(s if isinstance(s, (list, tuple)) else (s, s, s))))
    (folder / "scene.json").write_text(json.dumps({"fixtures": fixtures, "palette": pal}))
    return folder


def venue_scene() -> Path:
    """The sample venue's scene, its splats drawn again only when its Python changed (the fixtures
    are cheap: always fresh)."""
    from body_studio import sample_venue
    h = hashlib.sha1(b"".join((ROOT / "src/body_studio" / n).read_bytes() for n in SOURCES)).hexdigest()[:12]
    folder = CACHE / h
    if not (folder / "splats.f32").exists():
        for old in CACHE.glob("*"):
            shutil.rmtree(old, ignore_errors=True)
        print("drawing the venue's splats (once, ~15 s)...", file=sys.stderr)
        write_scene(folder, sample_venue.splats(), [], {})
    (folder / "scene.json").write_text(json.dumps({"fixtures": sample_venue.fixtures()["trees"], "palette": palette()}))
    return folder


def run(folder: Path, job: dict) -> str:
    r = subprocess.run(["node", str(JS), str(folder), json.dumps(job)], capture_output=True, text=True)
    if r.returncode:
        raise SystemExit(r.stderr[-3000:])
    return r.stdout


def frame(t: str, w: int, h: int, out: Path, video: Path = VIDEO) -> Path:
    """The walkthrough's frame at t ("1:20" or seconds) as raw RGB, w x h."""
    secs = seconds(t)
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(secs), "-i", str(video), "-frames:v", "1",
                          "-vf", f"scale={w}:{h}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, check=True).stdout
    out.write_bytes(raw)
    return out


def seconds(t) -> float:
    return sum(float(p) * 60 ** k for k, p in enumerate(reversed(str(t).split(":"))))


def route(pick: str, path: Path = ROUTE) -> list:
    """The poses in venue_route.json picked by "all" or times ("0:04,1:20", each the nearest pose
    within 1.5 s): [(name, view with its t)]."""
    views = json.loads(Path(path).read_text())["views"]
    if pick == "all":
        return list(views.items())
    out = []
    for t in pick.split(","):
        s = seconds(t)
        name, v = min(views.items(), key=lambda kv: abs(kv[1]["t"] - s))
        if abs(v["t"] - s) > 1.5:
            raise SystemExit(f"no pose near {t} in {path.name}: add one (venue_route.json), or use view --at")
        out.append((name, v))
    return out


def view_of(a) -> dict:
    return {"at": a.at, "look": math.radians(a.look), "pitch": math.radians(a.pitch), "eye": a.eye, "fov": a.fov}


def main(argv=None, scene: Path = None) -> str:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="what", required=True)
    for name in ("plan", "list"):
        p = sub.add_parser(name)
        p.add_argument("-x", nargs=2, type=float, default=[-22.0, 52.0], metavar=("X0", "X1"))
        p.add_argument("-z", nargs=2, type=float, default=[-4.5, 18.0], metavar=("Z0", "Z1"))
        if name == "plan":
            p.add_argument("--cell", type=float, default=0.25)
            p.add_argument("--top", type=float, default=2.3, help="ignore what is higher (ceilings)")
            p.add_argument("--by", choices=("what", "colour"), default="what")
    p = sub.add_parser("elev")
    p.add_argument("plane", help="the wall's plane: z=4 or x=-9.3")
    p.add_argument("--from", dest="side", choices="-+", default="-", help="stand on its lower (-) or higher (+) side")
    p.add_argument("-r", "--range", nargs=2, type=float, required=True, metavar=("A0", "A1"), help="along the wall (x for z=..)")
    p.add_argument("--cell", type=float, default=0.1)
    p.add_argument("--depth", type=float, default=1.0, help="how far in front of the plane counts")
    p.add_argument("--up", type=float, default=3.2)
    p.add_argument("--by", choices=("what", "colour", "depth"), default="what")
    p = sub.add_parser("view")
    p.add_argument("--at", nargs=2, type=float, metavar=("X", "Z"))
    p.add_argument("--look", type=float, default=0.0, help="degrees; 0 along +x, 90 toward -z")
    p.add_argument("--pitch", type=float, default=0.0, help="degrees up")
    p.add_argument("--eye", type=float, default=1.6)
    p.add_argument("--fov", type=float, default=100.0, help="vertical, degrees (the walkthrough: ~100)")
    p.add_argument("--views", help="compare.js's views.json (or {name: view}): one picture each, in a row")
    p.add_argument("--width", type=int, default=180)
    p.add_argument("--frame", help="put the walkthrough's frame at this time (1:20) on the left")
    p.add_argument("--video", type=Path, default=VIDEO)
    p.add_argument("--out", type=Path, required=True)
    p = sub.add_parser("route")
    p.add_argument("pick", help='"all" or times along the walkthrough: 0:04,1:20')
    p.add_argument("--width", type=int, default=150)
    p.add_argument("--cols", type=int, default=4, help="pairs a row")
    p.add_argument("--fov", type=float, help="instead of each pose's")
    p.add_argument("--route", type=Path, default=ROUTE)
    p.add_argument("--video", type=Path, default=VIDEO)
    p.add_argument("--out", type=Path, required=True)
    a = ap.parse_args(argv)
    folder = scene or venue_scene()
    if a.what in ("plan", "list"):
        job = {"what": a.what, "box": [*a.x, *a.z]}
        if a.what == "plan":
            job.update(cell=a.cell, top=a.top, by=a.by)
    elif a.what == "elev":
        axis, at = a.plane.split("=")
        job = {"what": "elev", "axis": axis.strip(), "at": float(at), "from": a.side, "range": a.range,
               "cell": a.cell, "depth": a.depth, "up": a.up, "by": a.by}
    elif a.what == "route":
        w = a.width
        h = round(w * FRAME[1] / FRAME[0])
        pairs = []
        for k, (name, v) in enumerate(route(a.pick, a.route)):
            v = dict(v, fov=a.fov or v.get("fov", 100))
            f = frame(v["t"], w, h, folder / f"frame{k}.rgb", a.video) if a.video.exists() else None
            pairs.append({"view": v, "frame": f and str(f)})
            print(f"{k + 1:2}. {name}  at ({v['at'][0]:.2f}, {v['at'][1]:.2f}) look {math.degrees(v['look']):.0f}", file=sys.stderr)
        job = {"what": "view", "w": w, "h": h, "out": str(a.out), "pairs": pairs, "cols": a.cols}
    else:
        w = a.width
        h = round(w * FRAME[1] / FRAME[0])
        job = {"what": "view", "w": w, "h": h, "out": str(a.out)}
        if a.views:
            v = json.loads(Path(a.views).read_text())
            v = v.get("views", v)
            job["views"] = list(v.values()) if isinstance(v, dict) else v
        else:
            if not a.at:
                ap.error("view needs --at X Z or --views")
            job["view"] = view_of(a)
        if a.frame:
            job["frame"] = str(frame(a.frame, w, h, folder / "frame.rgb", a.video))
    out = run(folder, job)
    print(out, end="")
    return out


if __name__ == "__main__":
    main()
