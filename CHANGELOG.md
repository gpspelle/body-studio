# Changelog

## 0.1.0 (unreleased)

- First version: one page with the body in the centre (turntable, drag to orbit, no pan),
  a row of bodies, drop a video anywhere to start a run.
- `body-studio run`, `setup`, `check`, built on splat-studio pinned at `ac7c892`.
- Background and fog removal always run.
- Runs use splat-studio's job runner: stage and measured time left in the top bar, failures
  explained in seconds of video.
- `body-studio measure`: neck, waist and hip circumferences from a finished body, scaled by
  the person's height, and an experimental body fat estimate (US Navy, US Army one-site,
  relative fat mass), with an optional tape-measure check. See `docs/body-fat.md`.
- Progress: follow one person over time. A panel at the edge (Progress) with body fat from the
  tape measures and its trend, weight, waist, neck and hips with the change since the first
  entry (grey when within measurement noise), and scans compared by the circumference at every
  height. `body-studio person`, `tape`, `scan` and `progress` do the same in the terminal. Each
  person is kept in `people/<name>.json` in the data folder. See `docs/progress.md`.
- Tattoo & pose (experimental): a panel at the left edge. Add an image and tap the body to lay
  it on the skin as ink, sized in centimetres; drag the dots on the joints or pick a pose
  (arms up, flex, walking, sitting) and the body and the tattoo move, each joint within a
  person's range of motion. The skeleton is found from the A-pose shape once per body and saved
  as `<body>.rig.json`; `body-studio rig` does the same in the terminal. Pose and tattoos are
  kept in the browser. See `docs/tattoo.md`.
- Tattoos: a big design on the back (or a thigh) is no longer cut where one bone's surface ends;
  the trunk and each leg are one surface. Less of a tattoo is hidden where the skin turns away at
  the flanks. Rigs are rebuilt once (`<body>.rig.json` version 2).
- Tattoos are laid on the skin itself, wherever they go: a design no longer stops where one
  part of the body ends, so it runs from the lower back onto both thighs, over a shoulder onto
  the arm, or around the side of the body. Parts of a design with no skin under them (between
  the legs) are left out, and its outline stops there too. Tattoos saved before come back in
  the same place.
- Tattoos no longer grow a thin line out of the design in some spots and poses (near the armpit,
  the tail of a design on the chest): the design stays on one surface where the arm meets the
  chest, the skin no longer tears at the armpit when the arm moves, and splats no longer fly off
  when posed because of a rounding error in their weights.
- Raising the arms no longer swings the back and the sides of the chest out into wings: the
  upper arm no longer carries the shoulder blade. Rigs are rebuilt once (`<body>.rig.json`
  version 3).
- OpenCV (drops blurry frames) is installed with the app by `pip install`, so nothing needs
  installing afterwards, also inside a virtualenv.
- English and Portuguese. Version, source code and license links at the bottom.
