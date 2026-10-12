# Plan

## How splat-studio is used

As a **pinned dependency**, not shared or copied code. `pip install .` installs splat-studio
from GitHub at one commit. The CLI calls `splat-studio run` with body defaults; the web app
submits runs to splat-studio's own job runner, so it gets the pty, measured time left, lock
files and advice for free; three.js and Spark are served from the installed package. Fixes to the pipeline land in splat-studio, so both apps get them; this repo bumps the
pin on purpose. A contract test fails if the pinned version drops a flag we pass.

Why not a fork or a git submodule: a fork drifts, and a submodule still needs the code on the
import path. Why not a shared library extracted from both: splat-studio already is one
(`splat_studio.pipeline`, `.splats`, `.masks`), with no runtime dependencies.

## Checked against the 3D Capture App Playbook

| Day-one item | Body Studio |
|---|---|
| Capture guide, matcher handles its loops | Guide in README (EN/PT). Loop detection is still missing in splat-studio itself; fix it there (affects the three-loop body capture) |
| Tool versions pinned in one place | splat-studio pinned by commit in `pyproject.toml`; it pins COLMAP and Brush |
| HDR, rotation, sharpest-of-N frames, one quality setting, pose escalation | Inherited from splat-studio |
| Failures as video timestamps with advice | Inherited (job runner advice), shown in the top bar |
| Cleanup on by default, originals kept | Fog and background removal always on; `_object.ply` next to the original |
| Viewer reads up axis, frames opaque splats | Yes; frames the whole body (0.5–99.5th percentile, so hands and feet stay in) |
| Export compressed (SPZ, LoD) | Not yet: no export. Step 5 below |
| Time left measured, timings logged | Inherited (job runner, timeline.jsonl) |
| Every dialog's default checked | No dialogs; Standard quality, 300 frames |
| Unique run folders, lock files, summary.txt | Inherited |
| Fake tools rejecting unknown flags | End-to-end test uses splat-studio's fakes at the pinned commit |
| CI with and without optional deps | CI runs without OpenCV; with it is covered in splat-studio |
| Plain copy, all languages | English and Portuguese, key parity tested |
| Header, footer, logo, GitHub link | Minimal: name top left, version, source and license at the bottom |
| In-progress, recent and history for long lists | Not yet: the row of bodies grows. Step 5 below |
| Docs rule, docs CI, screenshot script | AGENTS.md, `docs.yml`, `scripts/screenshots.py` |
| Decisions written down where agents read them | AGENTS.md |

## Build order

0. **In splat-studio: loop detection in COLMAP.** The body capture is three loops; today only the
   first and last 25 frames are matched for loop closure.
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
5. **Viewer and library polish.** Front/side/back buttons, a soft ground shadow, share a body
   as a small SPZ file instead of a raw PLY. Keep the row of bodies short (recent ones, the rest
   behind a "More" list), with delete that asks first.
6. **Later, if wanted.** Comparing two bodies side by side. Measurements and a body fat
   estimate started as `body-studio measure` (experimental); next: check it against a tape on
   real underwear captures, then an input form on the page (sex, height, weight, optional tape).
   Research in `docs/body-fat.md`.

## Open questions

- Pin bumps: by hand for now; a scheduled check that opens a PR when splat-studio moves could come later.
