# Changelog

## 0.1.0 (unreleased)

- First version: one page with the body in the centre (turntable, drag to orbit, no pan),
  a row of bodies, drop a video anywhere to start a run.
- `body-studio run`, `setup`, `check`, built on splat-studio pinned at `c1d8fc3`.
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
- OpenCV (drops blurry frames) is installed with the app by `pip install`, so nothing needs
  installing afterwards, also inside a virtualenv.
- English and Portuguese. Version, source code and license links at the bottom.
