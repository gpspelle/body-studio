"""Stands in for mflux's edit command (photoreal.py) in tests: takes the same flags, checks the
ones photoreal passes, and writes the photo it was given as the "photograph". A photo whose name
has "fail" in it fails like a broken model.

    python tests/fakes/photoreal.py --model flux2-klein-4b --image-paths IN.png --prompt ... --output OUT.png"""
import argparse
import shutil
import sys

ap = argparse.ArgumentParser()
ap.add_argument("--model", required=True)
ap.add_argument("--image-paths", nargs="+", required=True)
ap.add_argument("--prompt", required=True)
ap.add_argument("--steps", type=int, required=True)
ap.add_argument("--seed", type=int, required=True)
ap.add_argument("--width", type=int, required=True)
ap.add_argument("--height", type=int, required=True)
ap.add_argument("-q", "--quantize", type=int, choices=[3, 4, 5, 6, 8])
ap.add_argument("--output", required=True)
a = ap.parse_args()
if a.width % 16 or a.height % 16:
    sys.exit("width and height must be multiples of 16")
if "fail" in a.image_paths[0]:
    sys.exit("RuntimeError: out of memory")
shutil.copyfile(a.image_paths[0], a.output)
