# Plan

## How splat-studio is used

As a **pinned dependency**, not shared or copied code. `pip install .` installs splat-studio
from GitHub at one commit. Body Studio calls `splat-studio run` with body defaults and reads
its output lines (`Object copy: ...`), and serves three.js and Spark from the installed
package. Fixes to the pipeline land in splat-studio, so both apps get them; this repo bumps the
pin on purpose. A contract test fails if the pinned version drops a flag we pass.

Why not a fork or a git submodule: a fork drifts, and a submodule still needs the code on the
import path. Why not a shared library extracted from both: splat-studio already is one
(`splat_studio.pipeline`, `.splats`, `.masks`), with no runtime dependencies.

## Build order

1. **Done: scaffold.** One page, library, upload and queue, CLI, unit and browser tests, CI.
2. **Person masks.** Segment the person in every frame and train with splat-studio's `--masks`
   (Brush ignores everything else). On macOS, Apple Vision's person segmentation needs no
   download and no click; SAM 2 (already supported by splat-studio) is the fallback. This is
   the biggest quality win: no floor, no room, no fog to clean up afterwards.
3. **Capture checks for people.** Warn when the person moved (frames that COLMAP can't place,
   clustered in time), when the head or feet leave the frame, and when the take is too short
   for three loops. Reuse splat-studio's upload checks and track-break timestamps.
4. **Body-tuned training.** Mip render mode for the zoom-in-on-the-face case, more frames,
   and an LPIPS weight on High, each measured with `--eval` (see the gap survey).
5. **Viewer polish.** Front/side/back buttons, a soft ground shadow, share a body as a small
   SPZ file instead of a raw PLY.
6. **Later, if wanted.** Height and simple measurements, comparing two bodies side by side.

## Open questions

- Pin bumps: by hand for now; a scheduled check that opens a PR when splat-studio moves could come later.
