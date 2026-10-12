"""Command line entry point.

    body-studio                       open the app (same as `body-studio ui`)
    body-studio ui [--data-dir D] [--port N] [--no-browser]
    body-studio run VIDEO [options]   whole pipeline in the terminal (see `run --help`)
    body-studio setup                 install ffmpeg, COLMAP and Brush (splat-studio's setup)
    body-studio check                 show which tools are installed
    body-studio measure BODY.ply --sex m --height 178 [--weight 80] [--tape-waist 86]
                                      neck, waist, hips and a body fat estimate (experimental)
    body-studio person NAME --sex m --height 178     add a person whose progress you follow
    body-studio tape NAME --waist 86 [--neck 38] [--hip 98] [--weight 80] [--date 2026-10-12]
    body-studio scan NAME VIDEO/run_DATE_TIME        add a finished body to their history
    body-studio progress NAME                        tape, body fat and scans over time
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from . import __version__

DEFAULT_DATA = Path(os.environ.get("BODY_STUDIO_DATA", Path.home() / "BodyStudio"))


def main(argv: list[str] | None = None) -> None:
    argv = list(sys.argv[1:] if argv is None else argv)
    if argv and not argv[0].startswith("-") or argv[:1] in (["-h"], ["--help"], ["-V"], ["--version"]):
        cmd, rest = argv[0], argv[1:]
    else:
        cmd, rest = "ui", argv

    if cmd in ("-h", "--help", "help"):
        print(__doc__)
        return
    if cmd in ("-V", "--version", "version"):
        print(__version__)
        return
    if cmd == "ui":
        ap = argparse.ArgumentParser(prog="body-studio ui", description="Open the Body Studio app.")
        ap.add_argument("--data-dir", type=Path, default=DEFAULT_DATA,
                        help=f"where videos and bodies are kept (default: {DEFAULT_DATA})")
        ap.add_argument("--port", type=int, default=8770)
        ap.add_argument("--no-browser", action="store_true", help="don't open a browser tab")
        a = ap.parse_args(rest)
        from .server import serve
        return serve(a.data_dir, a.port, not a.no_browser)
    if cmd == "run":
        from .pipeline import main as run_main
        return run_main(rest)
    if cmd == "measure":
        from .measure import main as measure_main
        return measure_main(rest)
    if cmd in ("person", "tape", "scan", "progress"):
        from .history import main as history_main
        return history_main(cmd, rest, DEFAULT_DATA)
    if cmd in ("setup", "check"):
        from splat_studio.__main__ import main as splat_main
        return splat_main([cmd, *rest])
    sys.exit(f"unknown command {cmd!r}. Try: body-studio --help")


if __name__ == "__main__":
    main()
