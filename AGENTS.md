# Notes for coding agents

## What lives where

- **Capture pipeline** (frames, COLMAP, Brush, fog and background removal, masks): in
  [splat-studio](https://github.com/gpspelle/splat-studio), pinned by commit in `pyproject.toml`.
  Don't copy its code here. If the pipeline needs a change, make it in splat-studio, merge it,
  then bump the pin here in its own PR. `tests/unit/test_pipeline.py` checks that the pinned
  splat-studio still accepts every flag we pass.
- **This repo**: body defaults (`pipeline.py`), the library of bodies (`library.py`), the local
  server (`server.py`) and the single page (`static/index.html`, `static/body.css`).
- three.js and Spark are served from the installed splat-studio package (`/vendor/...`), so
  there is one vendored copy.

## Rules

- Background and fog removal always run. Never add an option to turn them off.
- Standard library only on the Python side, like splat-studio.
- Keep the page minimal: the body in the centre, small controls at the edges. New controls
  need a reason in the PR description.
- Data stays in splat-studio's layout (`videos/`, `frames/`, `workspace/<name>/run_*/`), so
  either app can open a run.

## Keep the README current

A change a user sees (the page, a CLI flag, a default, a file the app writes) updates
`README.md` and adds a line to `CHANGELOG.md` in the same PR. A change to how the page looks
regenerates `docs/images/` and you look at every image before committing it.
