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
- Joints move as far as a person's, checked against published ranges of motion: an arm reaches
  across the chest at shoulder height and back behind, a bent hip crosses the legs, a bent knee
  turns the shin, and the head tilts back and sideways further.
- With the arms raised, the sides of the chest stay where they are instead of standing out like
  oversized lats: the upper arm no longer carries the skin below the armpit (rig version 4; each
  body's skeleton is found again the first time). Clothes there follow, since they take the skin's
  weights.
- An arm can no longer be moved into the body: dragging the elbow toward the chest stops the arm
  at the skin, and a forearm turned in stops at the belly. The trunk and head are measured from the
  scan.
- The wrist bends toward the palm and to the sides of the hand, and the forearm turns the hand
  (the elbow now only bends). The hand's axes come from the scan: the way its palm faces.
- Tattoos can be named; the name shows on its button and is kept with it.
- A tattoo near the armpit no longer loses parts or sinks into the body: the skin there was taken
  to face inward (its nearest bone was the upper arm, not the bones that carry it).
- Tattoos are drawn as splats on the skin, and the body's own splats under them take the ink, all
  skinned with the body's own weights: whatever hides the skin hides the ink (an arm, the other
  side of the body, clothes, a fold), so a design no longer loses parts (a dragon's head) when moved
  near a joint or posed. The stand-in body for depth and
  the separate check for ink under clothes are gone. A quality sweep in the tests lays designs all
  over the body in every pose.
- Raising the arms no longer swings the back and the sides of the chest out into wings: the
  upper arm no longer carries the shoulder blade. Rigs are rebuilt once (`<body>.rig.json`
  version 3).
- OpenCV (drops blurry frames) is installed with the app by `pip install`, so nothing needs
  installing afterwards, also inside a virtualenv.
- English and Portuguese. Version, source code and license links at the bottom.
- Clothes (experimental): the Tattoo panel is now **Try on**, with a Clothes section on top. Pick
  one of 12 outfits (Women's, Men's, Unisex), 6 pairs of shoes, 10 hairstyles and a hat; each is
  fitted to the person's shape, moves with the pose and hides the skin under it, and tattoos under
  clothes are hidden. MakeHuman's base mesh is fitted to the body once and saved as
  `<body>.fit.json`; `body-studio fit` does the same in the terminal. All items are MakeHuman's
  own CC0 assets, listed in `CREDITS.md` (linked from the page's footer). The filming guide now
  asks for long hair tied back. See `docs/wardrobe.md`.
- Clothes: a tattoo under a sleeve or a shirt no longer shows through it (it stops where the
  clothes start). Hair sits on the head: the scalp under it takes the hair's colour, so the head
  no longer looks bald under see-through strands, and hair is drawn denser. Skin no longer shows
  through loose clothes like a skirt. The fitted body is rebuilt once (`<body>.fit.json`
  version 2).
- Clothes: with the arms raised a shirt no longer flares out at the sides. Each part of an item now
  moves with the skin it hangs from, not with the nearest bone (the upper arm, beside the chest).
- Clothes: with the arms raised a T-shirt no longer breaks into loose flakes under the sleeves.
  The cloth blends the bones it follows across its surface, and its splats grow where a pose
  stretches it and shrink back after. See `docs/wardrobe.md`.
- Clothes: no more grey dots on a white T-shirt (the jeans' waistband under it no longer shows
  through, and the shading is smooth), and a hat sits over the hair instead of the hair coming
  out through it.
- Walk and jump: **W A S D** (or the arrows) walk the body across the floor with a walk cycle,
  turning to face the way it goes, the camera following; **Space** jumps (it no longer starts and
  stops the turntable); **R** brings the body back. Clothes, hair, shoes and tattoos move with it.
  A quiet line at the bottom says so until the first walk. See `docs/tattoo.md`.
- Walking: the arms no longer go back out to the scan's A-pose when the body stops; they stay down
  by its sides (an arm placed in the panel stays where it was put). **Q** / **E** raise the left /
  right arm and **Z** / **C** a knee, until pressed again. A **Guide** button (or **?**) in the top
  bar lists every control with a line on what it does.
- Clothes in a shop around the body: while the Try on panel is open, the clothes hang on a rail,
  the shoes stand on a shoe rack, T-shirts and jeans lie folded on shelves under short hair on
  mannequin heads, and long hair and the hat are on stands. Point at one to see its name, click it
  to wear it. The panel no longer lists every item (nor the Women's / Men's / Unisex filter); it
  lists what is worn, to take it off. The shop is drawn as plain 3D models, so Spark sorts no
  more splats than before. See `docs/wardrobe.md`.
- Clothes fit the person's build better: the model body first takes MakeHuman's own body-shape
  sliders (sex, muscle, weight, bust, waist, hips, girths; the shape space of NAVER's Anny,
  solved without PyTorch) set to match the scan, then the surface. `<body>.fit.json` is version
  3 (with the slider values as `shape`); older fits are remade on first use.
- Clothes come off without putting something else on: what is worn stays on its rack or stand as a
  pale outline, and clicking it takes it off (as the ✕ in the panel does). **Take everything off**
  in the panel undresses the body at once.
- Trial: the clothes' body can be fitted with NAVER's Anny (PyTorch, an optional extra:
  `pip install 'body-studio[anny]'`). When it is installed, the Try on panel switches the body
  model between Standard and Anny, with the same clothes on. The Anny fit is saved as
  `<body>.anny.fit.json`; `body-studio fit-anny BODY.ply [--no-wrap]` makes it in the terminal.
  See `docs/anny.md`.
- Anny installs itself: `body-studio setup` installs PyTorch and Anny with the other tools, and the
  first click on **Anny** in the Try on panel installs them if they're missing, so the switch is
  always there and nothing has to be typed. `body-studio check` lists Anny.
- A body that looks alive (see `docs/flesh.md`): feet stay planted when walking, the pelvis turns
  and the hips sway; standing still it breathes, sways, blinks and turns its head to the camera.
  Skin darkens where it meets skin, the biceps swells with the bent elbow, skin no longer breaks
  into flakes in the armpit with the arms up, clothes are pushed out of the body and crease at bent
  joints, and a skirt's hem and long hair swing. A soft shadow on the floor follows the pose.
- **Hands** in the pose panel: as scanned, relaxed or a fist (kept with the pose).
- Clothes look like fabric: the texture is averaged over each splat (no shimmering dots) and the
  model's folds, pockets and seams are darker. Tattoos look healed in: softer, a little greyer, the
  skin's grain showing through.
- **What if** sliders in the pose panel: lighter or heavier (about ±12 kg) and less or more
  muscle, with the kilograms shown; not saved. `<body>.fit.json` is version 4 (with `whatif`);
  older fits are remade on first use.
- The person is cut out of every frame before training, on a Mac (Apple's Vision) or with SAM 2:
  runs pass splat-studio's `--person` (the `person` job option) whenever it can find a person.
  splat-studio pinned at `8a9482e`.
- **A room around the body** (see `docs/room.md`): film a room or a house from inside it (**Room** →
  **Add a room…**, or `body-studio room VIDEO`; an iPhone capture `.zip` too) and put the body in
  it, to its scale, on its floor. Walls and furniture stop the walk (the body slides along them),
  **F** sits down on a seat nearby or leans on a wall and **F** again gets up, and the camera stays
  inside the room. Room runs keep the room (splat-studio's `--scene`, no background removal) and
  are listed in `rooms.json` in the data folder. Each room is mapped once (floor, size from the
  camera's height, walls, furniture, seats) into `<room>.room.json`; `body-studio room-map ROOM.ply`
  does it in the terminal. A **Size** slider in the Room menu corrects the scale. New API:
  `GET /api/rooms`, `GET /api/room?room=`, `POST /api/upload?kind=room`. splat-studio pinned at
  `0d31486`.
