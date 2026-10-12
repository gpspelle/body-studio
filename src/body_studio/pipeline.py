"""Video of a person -> 3D body, using splat-studio's pipeline with body defaults.

    body-studio run IMG_1234.MOV
    body-studio run IMG_1234.MOV --quality preview

Everything heavy is splat-studio's `run`: frames (ffmpeg), camera poses (COLMAP), training
(Brush), then fog removal. Body Studio always adds background removal as well, so the floor
and the room are gone and only the person is left: NAME_object.ply. That is not an option.

Paths are relative to the data folder, laid out exactly as splat-studio lays it out
(videos/, frames/<name>/, workspace/<name>/run_<date_time>/), so either app can open a run.
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

QUALITY = ("preview", "standard", "high")

# A person is taller than most objects and is filmed from further away, so take a few more
# frames than splat-studio's default of 250 to keep the face and hands sharp.
DEFAULT_FRAMES = 300


def splat_run_args(video: Path, quality: str = "standard", frames: int = DEFAULT_FRAMES,
                   start: str | None = None, end: str | None = None) -> list[str]:
    """Arguments for `splat-studio run`. Background removal is always on (project decision)."""
    if quality not in QUALITY:
        raise ValueError(f"unknown quality {quality!r}; use one of {', '.join(QUALITY)}")
    args = [str(video), "--quality", quality, "--frames", str(frames), "--remove-background"]
    if start:
        args += ["--start", start]
    if end:
        args += ["--end", end]
    return args


def job_options(quality: str = "standard", frames: int = DEFAULT_FRAMES) -> dict:
    """Options for a splat-studio "video" job (the web app's runs). Same defaults as the CLI."""
    if quality not in QUALITY:
        raise ValueError(f"unknown quality {quality!r}; use one of {', '.join(QUALITY)}")
    return {"quality": quality, "frames": frames, "remove_background": True}


def splat_command(args: list[str]) -> list[str]:
    return [sys.executable, "-u", "-m", "splat_studio", "run", *args]


def body_from_log(text: str) -> Path | None:
    """The finished body, read from splat-studio's output.

    Prefers the background-free copy ("Object copy: ..."), then the fog-free one
    ("Clean copy: ..."), then the raw splat ("Done. Splat: ..."). These lines are the ones
    splat-studio's own web UI parses, so they are stable."""
    found: dict[str, str] = {}
    for line in text.splitlines():
        for key, prefix in (("object", "Object copy: "), ("clean", "Clean copy: "), ("raw", "Done. Splat: ")):
            if line.startswith(prefix):
                found[key] = line[len(prefix):].strip()
    for key in ("object", "clean", "raw"):
        if key in found:
            return Path(found[key])
    return None


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(prog="body-studio run", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("video", type=Path, help="video of the person (.mov / .mp4)")
    ap.add_argument("--quality", choices=QUALITY, default="standard")
    ap.add_argument("--frames", type=int, default=DEFAULT_FRAMES,
                    help=f"frames to extract (default {DEFAULT_FRAMES})")
    ap.add_argument("--start", help="trim: start time, e.g. 0:03")
    ap.add_argument("--end", help="trim: end time, e.g. 1:45")
    ap.add_argument("--data-dir", type=Path, default=Path("."), help="data folder (default: current folder)")
    return ap


def main(argv: list[str] | None = None) -> None:
    a = build_parser().parse_args(argv)
    video = a.video.resolve()
    if not video.exists():
        sys.exit(f"video not found: {a.video}")
    a.data_dir.mkdir(parents=True, exist_ok=True)
    cmd = splat_command(splat_run_args(video, a.quality, a.frames, a.start, a.end))
    env = dict(os.environ, PYTHONUNBUFFERED="1")
    proc = subprocess.Popen(cmd, cwd=a.data_dir, env=env, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, text=True)
    lines = []
    for line in proc.stdout:
        sys.stdout.write(line)
        lines.append(line)
    if proc.wait() != 0:
        sys.exit("The run failed - see the messages above.")
    body = body_from_log("".join(lines))
    print(f"\nBody: {body}" if body else "\nThe run finished but no body file was reported.")


if __name__ == "__main__":
    main()
