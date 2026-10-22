# Notes for coding agents

## What lives where

- **Capture pipeline** (frames, COLMAP, Brush, fog and background removal, masks): in
  [splat-studio](https://github.com/gpspelle/splat-studio), pinned by commit in `pyproject.toml`.
  Don't copy its code here. If the pipeline needs a change, make it in splat-studio, merge it,
  then bump the pin here in its own PR. `tests/unit/test_pipeline.py` checks that the pinned
  splat-studio still accepts every flag we pass.
- **This repo**: body defaults (`pipeline.py`), the library of bodies (`library.py`), the local
  server (`server.py`) and the single page (`static/index.html`, `static/body.css`). The spinner over
  the body while it isn't ready yet in `static/busy.js` (tested by `tests/js/busy.test.mjs`; see
  `docs/loading.md`). Tattoo &
  pose: skeleton and skin weights in `rig.py` (once per body, `<body>.rig.json`), posing and tattoo
  maths in `static/pose.js` (tested by `tests/js/pose.test.mjs` through `tests/unit/test_pose_js.py`),
  the panel in `static/tattoo.js`. Splats are moved by Spark's `SplatSkinning`; don't fit a body
  model with a non-commercial licence (SMPL and its family). See `docs/tattoo.md`.
  Clothes: MakeHuman's base mesh fitted to the body in `fit.py` (once per body, `<body>.fit.json`),
  the catalogue and each item's fit in `wardrobe.py` (data packed by `scripts/wardrobe_pack.py` into
  `wardrobe/` and `static/wardrobe/`; the styled outfits and accessories, our own, by
  `scripts/wardrobe_styles.py`), items as splats in `static/dress.js` (tested by
  `tests/js/dress.test.mjs`), the Clothes section and the shop around the body in `static/wardrobe.js`
(its layout and how each item is hung, folded or shown on a mannequin head in `static/racks.js`,
tested by `tests/js/racks.test.mjs`; plain three.js meshes, so Spark sorts no extra splats). Only CC0 or CC-BY items,
  each listed in `CREDITS.md`. See `docs/wardrobe.md`.
  Life and flesh: breathing, blinks, head look and planted feet in `static/walk.js`; what skin does
  beyond the bones (contact shading, bulges, stretch, clothes out of the body, swing, "what if"
  sliders) as maths in `static/flesh.js` (tested by `tests/js/flesh.test.mjs`) and as one Spark
  object modifier in `static/fleshgpu.js`; the floor shadow in `static/ground.js`. See `docs/flesh.md`.
  A room around the body: room runs and `rooms.json` in `pipeline.py` and `library.py`, the room's
  map (floor, size, walls, seats) in `room.py` (once per room, `<room>.room.json`), walls, seats,
  the camera's view and where the room sits round the body as maths in `static/room.js` (tested by
  `tests/js/room.test.mjs`), sitting and leaning in `static/walk.js`, the page side (the Room menu,
  F, the camera kept inside) in `static/house.js`. The sample living room (drawn, listed before
  any room is filmed) in `sample_room.py`. The fake room for tests is `tests/fakes/room.py`. See
  `docs/room.md`.
  Decor in a room: the inventory, items made from photos and the layouts per room in `decor.py`
  (`decor/` in the data folder), a photo to a mesh with TripoSR in its own process in `photo3d.py`
  (installed by setup or on first use, never imported by the server), the starters' shapes and where
  things go as maths in `static/decor.js` (tested by `tests/js/decor.test.mjs`), the Decor panel and
  dragging in `static/decorate.js`. The stand-in for TripoSR in tests is `tests/fakes/photo3d.py`
  (`BODY_STUDIO_PHOTO3D`). See `docs/decor.md`.
- Runs go through splat-studio's job runner (`splat_studio.server.jobs.Runner`): pty, measured
  time left, lock files, timeline.jsonl, advice in seconds of video. Don't write a second runner.
- three.js and Spark are served from the installed splat-studio package (`/vendor/...`), so
  there is one vendored copy.

## Rules

- Background and fog removal always run on bodies. Never add an option to turn them off. A room
  (`body-studio room`, splat-studio's `--scene`) is a different kind of run, not an option: the
  room is what it keeps, and fog removal still runs.
- Standard library only on the Python side, like splat-studio.
- Keep the page minimal: the body in the centre, small controls at the edges. New controls
  need a reason in the PR description.
- Data stays in splat-studio's layout (`videos/`, `frames/`, `workspace/<name>/run_*/`), so
  either app can open a run.
- Every string on the page lives in `static/i18n.js`, in English and Portuguese.

## Tests

- `tests/unit`: fast, no tools needed. Includes the contract tests against the pinned splat-studio.
- `tests/integration/test_end_to_end.py`: the real splat-studio pipeline with splat-studio's own
  stand-in COLMAP and Brush (the fake Brush rejects unknown flags). Needs ffmpeg and
  `SPLAT_STUDIO_SRC="$(python3 scripts/splat_studio_src.py)"`.
- `tests/browser`: the page in Chromium. Wait for page state, never a fixed delay.
- `tests/fakes/makehuman.py`: the MakeHuman base mesh (CC0) with artist-placed joints, as a
  splat PLY in several shapes and poses; the realistic body for skeleton and tattoo tests.

## Keep the README current

A change a user sees (the page, a CLI flag, a default, a file the app writes) updates
`README.md` (both languages) and adds a line to `CHANGELOG.md` in the same PR. CI
(`.github/workflows/docs.yml`) fails a PR that touches user-facing code without touching
`README.md` or `docs/`, unless the PR description has a line `No docs needed: <reason>`.
A change to how the page looks regenerates `docs/images/` with `python3 scripts/screenshots.py`,
and you look at every image before committing it.
