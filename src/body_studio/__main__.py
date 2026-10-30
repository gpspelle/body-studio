"""Command line entry point.

    body-studio                       open the app (same as `body-studio ui`)
    body-studio ui [--data-dir D] [--port N] [--no-browser]
    body-studio run VIDEO [options]   whole pipeline in the terminal (see `run --help`)
    body-studio room VIDEO [options]  a room or a house filmed from inside it, for the body to stand in
    body-studio room-map ROOM.ply     its floor, size, walls and seats (the app does it by itself)
    body-studio setup                 install ffmpeg, COLMAP and Brush (splat-studio's setup), PyTorch and Anny,
                                      and TripoSR for decor from photos
    body-studio check                 show which tools are installed
    body-studio measure BODY.ply --sex m --height 178 [--weight 80] [--tape-waist 86]
                                      neck, waist, hips and a body fat estimate (experimental)
    body-studio rig BODY.ply          find the skeleton, for posing and tattoos (experimental)
    body-studio fit BODY.ply          fit the base mesh the wardrobe's clothes are made for (experimental)
    body-studio fit-anny BODY.ply     the same with Anny, a PyTorch body model (trial)
    body-studio decor PHOTO [--height 0.8] [--name N]  a 3D decor item from one photo (TripoSR, on this computer)
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
    if cmd in ("run", "room"):
        from .pipeline import main as run_main
        return run_main(rest, room=cmd == "room")
    if cmd == "room-map":
        from .room import main as map_main
        return map_main(rest)
    if cmd == "measure":
        from .measure import main as measure_main
        return measure_main(rest)
    if cmd == "rig":
        from .rig import main as rig_main
        return rig_main(rest)
    if cmd == "fit":
        from .fit import main as fit_main
        return fit_main(rest)
    if cmd == "fit-anny":
        from .anny_fit import main as anny_main
        return anny_main(rest)
    if cmd == "decor":
        from .decor import main as decor_main
        return decor_main(rest, DEFAULT_DATA)
    if cmd in ("person", "tape", "scan", "progress"):
        from .history import main as history_main
        return history_main(cmd, rest, DEFAULT_DATA)
    if cmd in ("setup", "check"):
        from splat_studio.__main__ import main as splat_main

        from . import anny_fit, photo3d, photoreal
        if cmd == "check":
            print(f"  {'✓' if anny_fit.available() else '·'} {'Anny':<9} body model trial in Try on "
                  "(PyTorch; body-studio setup installs it)")
            print(f"  {'✓' if photo3d.available() else '·'} {'TripoSR':<9} decor from a photo "
                  "(PyTorch; body-studio setup installs it)")
            print(f"  {'✓' if photoreal.available() else '·'} {'mflux':<9} Make it a photo "
                  f"({photoreal.supported() or 'a Mac with Apple silicon; body-studio setup installs it'})")
        elif not {"--masking", "--dry-run", "-h", "--help"} & set(rest):
            try:
                anny_fit.install(print)
            except anny_fit.Missing as e:      # the app works without it: say so and go on
                print(f"{e}. The Anny body model is left out; run body-studio setup again to retry.")
            try:
                photo3d.install(print, weights=True)
            except photo3d.Missing as e:
                print(f"{e}. Decor from photos is left out for now; the app installs it the first time "
                      "a photo is added.")
            if not photoreal.supported():
                try:
                    photoreal.install(print)
                except photoreal.Missing as e:
                    print(f"{e}. Make it a photo is left out for now; the app installs it the first time "
                          "a photo is made real.")
        return splat_main([cmd, *rest])
    sys.exit(f"unknown command {cmd!r}. Try: body-studio --help")


if __name__ == "__main__":
    main()
