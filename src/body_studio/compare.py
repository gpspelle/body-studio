"""Matching a room to a video of the real place: the page's Compare tool (static/compare.js),
opened from the Decor panel. Design: docs/compare.md.

Gabriel filmed the venue in one take; the drawn venue (sample_venue.py) is made to look like it.
The page shows a frame of the video over the 3D view; he moves the camera until the two line up,
keeps that view (the video's time, where the camera is, its lens), and tags what is missing or
wrong right on the frame, in his words. Each kept view takes a picture of both, the frame and the
render, so the export says exactly what was seen.

Everything lives in compare/<room>/ in the data folder (the room as its layouts are named:
decor.layout_file):

    compare/<room>/video.<ext>        the video, as uploaded (one per room; a new one replaces it)
    compare/<room>/views.json         {room, video, views: [{id, t, view, tags, made}]}
    compare/<room>/snaps/<id>-video.jpg, <id>-render.jpg

A view's `view` is the fly-through camera: {at: [x, z] in the room map's metres, look (its yaw),
pitch, eye (m up from the floor), fov (degrees, up and down)}. A tag is {x, y} on the frame (0..1
from its top left), a kind (KINDS) and a note.

export() puts it all in one zip with notes.md, a list a person (or Claude) can work through.
"""
from __future__ import annotations

import io
import json
import math
import re
import secrets
import time
import zipfile
from pathlib import Path

from . import decor

DIR = "compare"
VIDEO_EXT = {".mp4", ".mov", ".m4v", ".webm"}
MAX_VIDEO = 2 * 1024 ** 3
MAX_SNAP = 6 * 1024 ** 2
MAX_VIEWS = 500
MAX_TAGS = 60
MAX_NOTE = 600
KINDS = ("missing", "wrong", "remove", "note")
SNAPS = ("video", "render")


class CompareError(ValueError):
    def __init__(self, msg: str, code: str = "compare"):
        super().__init__(msg)
        self.code = code


def folder(data_dir: Path, room_file: str) -> Path:
    return Path(data_dir) / DIR / decor.layout_file(data_dir, room_file).stem


def _views_file(data_dir: Path, room_file: str) -> Path:
    return folder(data_dir, room_file) / "views.json"


def state(data_dir: Path, room_file: str) -> dict:
    """The room's video (its file name, or None) and its kept views, oldest first."""
    f = _views_file(data_dir, room_file)
    try:
        d = json.loads(f.read_text())
    except (OSError, ValueError):
        d = {}
    v = video_file(data_dir, room_file)
    return {"room": room_file, "video": v.name if v else None, "views": d.get("views", []) if isinstance(d, dict) else []}


def _write(data_dir: Path, room_file: str, views: list) -> dict:
    f = _views_file(data_dir, room_file)
    f.parent.mkdir(parents=True, exist_ok=True)
    tmp = f.with_suffix(".tmp")
    tmp.write_text(json.dumps({"room": room_file, "views": views}, indent=1))
    tmp.replace(f)
    return state(data_dir, room_file)


def video_file(data_dir: Path, room_file: str) -> Path | None:
    d = folder(data_dir, room_file)
    for ext in sorted(VIDEO_EXT):
        if (d / ("video" + ext)).is_file():
            return d / ("video" + ext)
    return None


def save_video(data_dir: Path, room_file: str, chunks, size: int, name: str) -> dict:
    """The room's video, read from `chunks` (bytes pieces, `size` in all): it replaces the one
    before. The views kept stay (their times are the same video's, filmed again or not)."""
    ext = Path(name or "").suffix.lower()
    if ext not in VIDEO_EXT:
        raise CompareError("Use a .mp4, .mov or .webm video.", "video_type")
    if not 0 < size <= MAX_VIDEO:
        raise CompareError("The video is empty or too large.", "video_size")
    d = folder(data_dir, room_file)
    d.mkdir(parents=True, exist_ok=True)
    tmp, got = d / "upload.part", 0
    with open(tmp, "wb") as f:
        for c in chunks:
            f.write(c)
            got += len(c)
    if got != size:
        tmp.unlink()
        raise CompareError("The upload was cut off.", "upload_cut")
    for old in d.glob("video.*"):
        old.unlink()
    tmp.replace(d / ("video" + ext))
    return state(data_dir, room_file)


def _num(x, lo, hi, what) -> float:
    try:
        x = float(x)
    except (TypeError, ValueError):
        raise CompareError(f"{what} must be a number", "bad_request")
    if not math.isfinite(x) or not lo <= x <= hi:
        raise CompareError(f"{what} is out of range", "bad_request")
    return round(x, 4)


def _view(v) -> dict:
    if not isinstance(v, dict) or not isinstance(v.get("at"), list) or len(v["at"]) != 2:
        raise CompareError("a view needs where the camera is", "bad_request")
    return {"at": [_num(a, -1e4, 1e4, "at") for a in v["at"]], "look": _num(v.get("look"), -100, 100, "look"),
            "pitch": _num(v.get("pitch"), -1.6, 1.6, "pitch"), "eye": _num(v.get("eye"), 0.05, 20, "eye"),
            "fov": _num(v.get("fov"), 10, 140, "fov")}


def _tags(tags) -> list:
    if tags is None:
        return []
    if not isinstance(tags, list) or len(tags) > MAX_TAGS:
        raise CompareError(f"at most {MAX_TAGS} tags on a view", "bad_request")
    out = []
    for g in tags:
        if not isinstance(g, dict) or g.get("kind") not in KINDS:
            raise CompareError("a tag's kind is one of " + ", ".join(KINDS), "bad_request")
        out.append({"x": _num(g.get("x"), 0, 1, "x"), "y": _num(g.get("y"), 0, 1, "y"), "kind": g["kind"],
                    "note": str(g.get("note") or "").strip()[:MAX_NOTE]})
    return out


def _id(x) -> str:
    if not isinstance(x, str) or not re.fullmatch(r"[a-z0-9]{6,16}", x):
        raise CompareError("no such view", "no_view")
    return x


def save_view(data_dir: Path, room_file: str, d: dict) -> dict:
    """A view kept or changed: {id (none for a new one), t, view, tags}. -> {state, id}."""
    if not isinstance(d, dict):
        raise CompareError("send a JSON object", "bad_request")
    views = state(data_dir, room_file)["views"]
    new = {"t": _num(d.get("t"), 0, 36000, "t"), "view": _view(d.get("view")), "tags": _tags(d.get("tags"))}
    if d.get("id"):
        vid = _id(d["id"])
        old = next((v for v in views if v["id"] == vid), None)
        if old is None:
            raise CompareError("no such view", "no_view")
        old.update(new)
    else:
        if len(views) >= MAX_VIEWS:
            raise CompareError(f"at most {MAX_VIEWS} views", "too_many")
        vid = secrets.token_hex(5)
        views.append({"id": vid, **new, "made": time.strftime("%Y-%m-%dT%H:%M:%S")})
        views.sort(key=lambda v: v["t"])
    return {"state": _write(data_dir, room_file, views), "id": vid}


def delete_view(data_dir: Path, room_file: str, vid: str) -> dict:
    vid = _id(vid)
    views = state(data_dir, room_file)["views"]
    if not any(v["id"] == vid for v in views):
        raise CompareError("no such view", "no_view")
    for which in SNAPS:
        snap_file(data_dir, room_file, vid, which).unlink(missing_ok=True)
    return _write(data_dir, room_file, [v for v in views if v["id"] != vid])


def snap_file(data_dir: Path, room_file: str, vid: str, which: str) -> Path:
    if which not in SNAPS:
        raise CompareError("a picture is of the video or the render", "bad_request")
    return folder(data_dir, room_file) / "snaps" / f"{_id(vid)}-{which}.jpg"


def save_snap(data_dir: Path, room_file: str, vid: str, which: str, jpeg: bytes | None) -> dict:
    """A kept view's picture: the video's frame or the render, as a JPEG."""
    if not any(v["id"] == _id(vid) for v in state(data_dir, room_file)["views"]):
        raise CompareError("no such view", "no_view")
    if not jpeg or len(jpeg) > MAX_SNAP or not jpeg.startswith(b"\xff\xd8"):
        raise CompareError("send the picture as a JPEG", "snap_type")
    f = snap_file(data_dir, room_file, vid, which)
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_bytes(jpeg)
    return {"id": vid, "which": which}


def clock(t: float) -> str:
    """Seconds as the video's clock: 83.5 -> "1:23.5"."""
    m, s = divmod(round(t * 10) / 10, 60)
    return f"{int(m)}:{s:04.1f}"


def notes(data_dir: Path, room_file: str) -> str:
    """The kept views and their tags as a list to work through (Markdown)."""
    st = state(data_dir, room_file)
    lines = [f"# Matched to the video: {room_file}", "",
             f"Video: {st['video'] or 'none'}. {len(st['views'])} views kept, "
             f"{sum(len(v['tags']) for v in st['views'])} tags. Positions on a frame are from its top left (0 to 1).", ""]
    for v in st["views"]:
        w = v["view"]
        lines.append(f"## {clock(v['t'])}  (view {v['id']})")
        lines.append(f"Camera at x {w['at'][0]}, z {w['at'][1]} (map metres), {w['eye']} m up, "
                     f"look {w['look']}, pitch {w['pitch']}, lens {w['fov']}°. "
                     f"Pictures: snaps/{v['id']}-video.jpg, snaps/{v['id']}-render.jpg")
        for k, g in enumerate(v["tags"], 1):
            lines.append(f"{k}. **{g['kind']}** at ({g['x']:.2f}, {g['y']:.2f}): {g['note'] or '(no note)'}")
        lines.append("")
    return "\n".join(lines)


def export(data_dir: Path, room_file: str) -> bytes:
    """One zip: notes.md, views.json and the pictures (not the video: the other side has it)."""
    buf = io.BytesIO()
    st = state(data_dir, room_file)
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("notes.md", notes(data_dir, room_file))
        z.writestr("views.json", json.dumps(st, indent=1))
        for v in st["views"]:
            for which in SNAPS:
                f = snap_file(data_dir, room_file, v["id"], which)
                if f.is_file():
                    z.write(f, f"snaps/{f.name}")
    return buf.getvalue()
