"""Stands in for photo3d.py's worker (TripoSR) in tests: writes a raw mesh in TripoSR's frame (z up,
the photo's camera along +x) for any photo: a cone 1.2 high on a 0.4 wide base, red, with a nose
toward the camera so a test can tell its front. A "photo" whose bytes start with FAIL fails like
a broken model.

    python tests/fakes/photo3d.py PHOTO OUT.json"""
import json
import math
import sys
from pathlib import Path


def cone(seg=24):
    v, c, f = [], [], []
    for k in range(seg):
        a = 2 * math.pi * k / seg
        v += [0.2 * math.cos(a), 0.2 * math.sin(a), -0.3]
        c += [0.8, 0.1, 0.1]
    v += [0, 0, 0.9, 0, 0, -0.3, 0.45, 0, -0.1]           # the tip, the base's middle, the nose (+x)
    c += [0.8, 0.1, 0.1, 0.8, 0.1, 0.1, 0.1, 0.1, 0.8]
    tip, mid, nose = seg, seg + 1, seg + 2
    for k in range(seg):
        f += [k, (k + 1) % seg, tip, (k + 1) % seg, k, mid]
    f += [0, nose, tip]
    return v, c, f


if __name__ == "__main__":
    photo, out = Path(sys.argv[1]), Path(sys.argv[2])
    if photo.read_bytes().startswith(b"FAIL"):
        sys.exit("RuntimeError: the model broke")
    v, c, f = cone()
    out.write_text(json.dumps({"frame": "triposr", "v": v, "c": c, "f": f}))
