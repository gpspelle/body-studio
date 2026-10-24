# Notes for coding agents

## Before you start

- A Claude Code web session is set up by `scripts/session-start.sh` (run by `.claude/settings.json`):
  the app installed editable (your edits are what tests and screenshots run), Playwright 1.56 to
  match the container's Chromium, `BODY_STUDIO_CHROMIUM` set. Elsewhere: `pip install -e . playwright`.
- The sample rooms for browser tests and screenshots are drawn once and kept in
  `~/.cache/body-studio-tests` (`tests/fakes/samples.py`); a change to the app's Python draws them again.
- CI runs a browser shard only when something its tests use changed (`scripts/browser_needed.py`:
  not the clothes for decor, studio or progress alone), and nothing for README, CHANGELOG or docs/.
- Tests while you work: `python3 scripts/test.py --changed` (only the unit tests for what you
  changed since origin/main, side by side). All of them: `python3 scripts/test.py` (about 1.5 min).
  One module: `python3 scripts/test.py test_rig`. Push and let CI run the rest; look at a CI
  failure only when your change caused it.
- Browser tests take minutes each in software rendering: run only the one you touched
  (`python -m unittest tests.browser.test_clothes`). A new one goes in its part's file and starts from
  `self.open_page()` and waits with `settled(page)` / `pick(page, item)`, never a fixed delay. A
  check that is maths (where things go, how skin moves) belongs in a JS test under `tests/js/`,
  which runs in seconds and never flakes, not in a browser test.
- Every feature touches: `static/i18n.js` (English only), `CHANGELOG.md`, `CREDITS.md`
  for any outside asset, a CI shard for a new browser test file, unit tests for new code.
- README, its screenshots and docs/images: at milestones or when asked, not on every push. A PR
  that skips them says `No docs needed: <reason>`. Screenshots: `python3 scripts/screenshots.py
  <name>` for just the one you changed; look at it at 100% before committing.
- splat-studio changes: batch them, then bump the pin once.

## What lives where

- **Capture pipeline** (frames, COLMAP, Brush, fog and background removal, masks): in
  [splat-studio](https://github.com/gpspelle/splat-studio), pinned by commit in `pyproject.toml`.
  Don't copy its code here. If the pipeline needs a change, make it in splat-studio, merge it,
  then bump the pin here in its own PR. `tests/unit/test_pipeline.py` checks that the pinned
  splat-studio still accepts every flag we pass.
- **This repo**, by feature. Python in `src/body_studio/`, the page in `src/body_studio/static/`
  (S/ below). Maths a page part needs is kept free of three.js in its own file with a JS test in
  `tests/js/`, run by a unit test of the same name (`pose.js` -> `pose.test.mjs` -> `test_pose_js.py`);
  three.js and the DOM stay in the page file. A browser test file per part, `tests/browser/test_<part>.py`
  (the shared fixture in `tests/browser/base.py`).

  | Feature | Python (once per body or room, cached) | Page: maths (JS test) | Page: three.js and DOM | Browser test | Doc |
  |---|---|---|---|---|---|
  | The page, body, server | `pipeline.py` (body defaults), `library.py`, `server.py` | S/`busy.js` (loading screen) | S/`index.html` (viewer), S/`body.css`, S/`modes.js` (the menu: `<body data-mode>` hides the other modes' tools), S/`i18n.js` | `test_body`, `test_menu` | `docs/loading.md` |
  | Tattoo and pose | `rig.py` (`<body>.rig.json`) | S/`pose.js` | S/`tattoo.js` | `test_tattoo` | `docs/tattoo.md` |
  | Life and flesh | | S/`walk.js` (breathing, blinks, feet, sitting, lying), S/`flesh.js` | S/`fleshgpu.js` (one Spark modifier), S/`ground.js` (floor shadow) | `test_body` | `docs/flesh.md` |
  | Clothes | `fit.py` (`<body>.fit.json`), `wardrobe.py`, `anny_fit.py` (trial); data by `scripts/wardrobe_pack.py`, `scripts/wardrobe_styles.py` | S/`dress.js`, S/`racks.js` (the shop's layout) | S/`wardrobe.js` | `test_clothes` | `docs/wardrobe.md`, `docs/anny.md` |
  | A room | `room.py` (`<room>.room.json`), `sample_room.py` (the drawn living room); fake: `tests/fakes/room.py` | S/`room.js`, S/`shell.js` | S/`house.js` | `test_room` | `docs/room.md` |
  | Tattoo studio | `sample_studio.py` (fixtures; room.py maps them) | S/`flash.js` | S/`parlour.js`, designs in S/`flash/` | `test_studio` | `docs/tattoo.md` |
  | Decor | `decor.py` (`decor/` in the data folder), `photo3d.py` (TripoSR), `sample_venue.py`; fake: `tests/fakes/photo3d.py` | S/`decor.js` (where things go), S/`decor/*.js` (the starters' shapes) | S/`decorate.js`, S/`decorlook.js`, S/`decorpics.js` (worker) | `test_decor` | `docs/decor.md` |
  | Progress | `history.py`, `measure.py` | | S/`progress.js` | `test_progress` | `docs/progress.md`, `docs/body-fat.md` |

  Rules per feature: splats are moved by Spark's `SplatSkinning`; don't fit a body model with a
  non-commercial licence (SMPL and its family). Clothes are only CC0 or CC-BY items, each listed in
  `CREDITS.md`, and the shop is plain three.js meshes, so Spark sorts no extra splats. TripoSR runs
  in its own process (`photo3d.py`, installed by setup or on first use, never imported by the
  server; `BODY_STUDIO_PHOTO3D` swaps in the fake). Starter tattoo designs are ours, CC0.
- Runs go through splat-studio's job runner (`splat_studio.server.jobs.Runner`): pty, measured
  time left, lock files, timeline.jsonl, advice in seconds of video. Don't write a second runner.
- three.js and Spark are served from the installed splat-studio package (`/vendor/...`), so
  there is one vendored copy.

## Rules

- Background and fog removal always run on bodies. Never add an option to turn them off. A room
  (`body-studio room`, splat-studio's `--scene`) is a different kind of run, not an option: the
  room is what it keeps, and fog removal still runs.
- Standard library only on the Python side, like splat-studio.
- One look (top of `body.css`): colours only from the tokens in `:root`, no panel sets its own;
  text as title (serif), body, caption, overline or the one big number; buttons as `btn primary`
  (one per place), `btn`, `.chips button` or `link` (`danger` if it takes something away, `close`
  for a panel's x). `tests/unit/test_css.py` checks it.
- Keep the page minimal: the body in the centre, small controls at the edges. New controls
  need a reason in the PR description.
- Data stays in splat-studio's layout (`videos/`, `frames/`, `workspace/<name>/run_*/`), so
  either app can open a run.
- Every string on the page lives in `static/i18n.js`, in English (the app is English only for now).

## Tests

- `tests/unit`: fast, no tools needed. Includes the contract tests against the pinned splat-studio.
- `tests/integration/test_end_to_end.py`: the real splat-studio pipeline with splat-studio's own
  stand-in COLMAP and Brush (the fake Brush rejects unknown flags). Needs ffmpeg and
  `SPLAT_STUDIO_SRC="$(python3 scripts/splat_studio_src.py)"`.
- `tests/browser`: the page in Chromium. Wait for page state, never a fixed delay. CI runs them in
  shards side by side (`.github/workflows/ci.yml`): put a new test in one, by how long it takes
  (`tests/unit/test_ci.py` checks).
- `tests/fakes/makehuman.py`: the MakeHuman base mesh (CC0) with artist-placed joints, as a
  splat PLY in several shapes and poses; the realistic body for skeleton and tattoo tests.

## Keep the README current

A change a user sees (the page, a CLI flag, a default, a file the app writes) adds a line to
`CHANGELOG.md` in the same PR; `README.md` catches up at milestones. CI
(`.github/workflows/docs.yml`) fails a PR that touches user-facing code without touching
`README.md` or `docs/`, unless the PR description has a line `No docs needed: <reason>`.
A change to how the page looks regenerates `docs/images/` with `python3 scripts/screenshots.py`,
and you look at every image before committing it.
