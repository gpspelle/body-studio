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
- English and Portuguese. Version, source code and license links at the bottom.
