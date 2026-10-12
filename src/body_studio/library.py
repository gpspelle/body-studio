"""The bodies in a data folder: one entry per finished run, newest first.

A run folder is workspace/<name>/run_<date_time>/ (splat-studio's layout). Its body is the
newest NAME_object.ply in splat/ (floor and room removed); runs made before that existed fall
back to NAME_clean.ply, then to the raw splat.
"""
from __future__ import annotations

from pathlib import Path


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
    out = []
    for run_dir in (data_dir / "workspace").glob("*/run_*"):
        if not run_dir.is_dir() or run_dir.is_symlink():
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
