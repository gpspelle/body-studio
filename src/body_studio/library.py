"""The bodies and the rooms in a data folder: one entry per finished run, newest first.

A run folder is workspace/<name>/run_<date_time>/ (splat-studio's layout). Its body is the
newest NAME_object.ply in splat/ (floor and room removed); runs made before that existed fall
back to NAME_clean.ply, then to the raw splat.

A room (a room or a house filmed from inside it, for the body to stand in) is a run of a video
whose name is listed in rooms.json in the data folder: its runs keep the background, so its
splat is NAME_clean.ply (only the fog in the air removed), or the raw splat.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOMS = "rooms.json"            # {"rooms": [video names]}: the videos that film a room, not a person


def room_names(data_dir: Path) -> set:
    try:
        d = json.loads((Path(data_dir) / ROOMS).read_text())
    except (OSError, ValueError):
        return set()
    return {n for n in d.get("rooms", []) if isinstance(n, str)} if isinstance(d, dict) else set()


def mark_room(data_dir: Path, name: str) -> None:
    """Remember that the video `name` (its file name without the extension) films a room."""
    names = room_names(data_dir) | {name}
    f = Path(data_dir) / ROOMS
    tmp = f.with_name(f.name + ".tmp")
    tmp.write_text(json.dumps({"rooms": sorted(names)}, indent=1))
    tmp.replace(f)


def room_file(run_dir: Path) -> Path | None:
    splat = run_dir / "splat"
    if not splat.is_dir():
        return None
    plys = sorted(splat.glob("*.ply"), key=lambda p: p.stat().st_mtime, reverse=True)
    clean = [p for p in plys if p.stem.endswith("_clean")]
    raw = [p for p in plys if not p.stem.endswith(("_object", "_clean")) and "_part-" not in p.stem]
    return (clean or raw or [None])[0]


def _runs(data_dir: Path):
    for run_dir in (data_dir / "workspace").glob("*/run_*"):
        if run_dir.is_dir() and not run_dir.is_symlink():
            yield run_dir


SAMPLE = "_sample_room"           # the drawn living room (sample_room.py): listed last, never a body
STUDIO = "_sample_studio"         # the drawn tattoo studio (sample_studio.py): after it
VENUE = "_sample_venue"           # the drawn wedding venue (sample_venue.py): after that
SAMPLES = (SAMPLE, STUDIO, VENUE)


def rooms(data_dir: Path) -> list[dict]:
    names, out = room_names(data_dir) | set(SAMPLES), []
    for run_dir in _runs(data_dir):
        f = run_dir.parent.name in names and room_file(run_dir)
        if not f:
            continue
        r = {"id": f"{run_dir.parent.name}/{run_dir.name}", "name": run_dir.parent.name,
             "file": f.relative_to(data_dir).as_posix(), "updated": f.stat().st_mtime,
             "sample": run_dir.parent.name in SAMPLES}
        # a drawn room's look (sample_room.py): its flat surfaces as a shell to draw smooth, and
        # the splats it leaves
        look, shell = run_dir / "look" / f.name, run_dir / "look" / (f.stem + ".shell.bin")
        if look.is_file() and shell.is_file():
            r["look"], r["shell"] = look.relative_to(data_dir).as_posix(), shell.relative_to(data_dir).as_posix()
        out.append(r)
    # filmed rooms newest first, then the samples in their order
    return sorted(out, key=lambda b: (SAMPLES.index(b["name"]) if b["sample"] else -1, -b["updated"]))


def body_file(run_dir: Path) -> Path | None:
    splat = run_dir / "splat"
    if not splat.is_dir():
        return None
    plys = sorted(splat.glob("*.ply"), key=lambda p: p.stat().st_mtime, reverse=True)
    for suffix in ("_object", "_clean"):
        for p in plys:
            if p.stem.endswith(suffix):
                return p
    raw = [p for p in plys if not p.stem.endswith(("_object", "_clean")) and "_part-" not in p.stem]
    return raw[0] if raw else None


def bodies(data_dir: Path) -> list[dict]:
    out, names = [], room_names(data_dir) | set(SAMPLES)
    for run_dir in _runs(data_dir):
        if run_dir.parent.name in names:
            continue
        f = body_file(run_dir)
        if not f:
            continue
        out.append({
            "id": f"{run_dir.parent.name}/{run_dir.name}",
            "name": run_dir.parent.name,
            "file": f.relative_to(data_dir).as_posix(),
            "background_removed": f.stem.endswith("_object"),
            "updated": f.stat().st_mtime,
        })
    return sorted(out, key=lambda b: b["updated"], reverse=True)


def safe_path(data_dir: Path, rel: str) -> Path | None:
    """`rel` resolved inside the data folder's workspace, or None if it points anywhere else."""
    root = (data_dir / "workspace").resolve()
    p = (data_dir / rel).resolve()
    return p if p.is_file() and root in p.parents else None
