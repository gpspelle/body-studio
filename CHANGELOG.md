# Changelog

## 0.1.0 (unreleased)

- English only for now: the Portuguese translation and the Language entry in the menu are gone.
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

- **Sample living room**: the Room menu always lists a furnished living room drawn by the app
  (`sample_room.py`), so the body can be tried in a room before one is filmed. It is made in the
  data folder (in its own process) the first time the rooms are listed. Room maps are now squared with the walls
  (the sharpest rows of splats along the floor) instead of the splats' main axis; maps made
  before are made again.

- **Steady camera while walking**: the camera follows the body at the walk's even pace instead of
  the surge of each step, and the body no longer jolts back a few centimetres as each heel strikes.

- **Clothes and hair swing more naturally**: a skirt's hem and long hair hang like a pendulum
  from the hips or the head: they trail when she walks off, swing forward once when she stops and
  turn a moment behind her when she turns, without the bounce at every step, the snaps at the end
  of the swing or the hem tearing into lace that the old springs gave.

- **Decor that looks like a furniture shop's**: every part of a piece has a finish (linen, china,
  wood, brass, glass, light) lit by a small studio of soft boxes; soft shadows under each; bevelled
  edges, rounded upholstery on brass feet, draped tablecloths, roses with petals, a lacquered dance
  floor. The catalogue is a grid of pictures of each piece; the panel is paper and hairlines with
  names in a serif; a toolbar by the picked piece turns, duplicates and removes it; the handles are
  white. Fixed: the list's scrollbar covered its ✕ buttons, and two lines ran under the tabs.
- **A tidier Decor panel, with handles**: two tabs, **Add** and **In the room** (everything placed,
  by kind, to pick or take away with ✕; the layouts are there too). The picked thing sits on top
  with **Done**. Handles on it like the body's joints: a ring round it turns it, a knob over it
  raises or lowers it (**Raised**, kept as `lift` in the layout). The body's panel steps aside
  while Decor is open. What games do about this is in `docs/decor.md`.
- **More wedding decor**: about 30 more starters, shown by kind (Tables, On the table, Ceremony,
  Bar, Lights, Lounge, and From photos): cross-back chairs, benches, square, cocktail and
  sweetheart tables, place settings, centrepieces, candelabras, bud vases, table numbers, a cake, a
  champagne tower, a moon arch, a chuppah, a flower wall, flower stands, aisle flowers, a welcome
  sign, a bar with its back shelves and stools, a buffet, string lights, light poles, a
  chandelier, a fairy light curtain, uplights, a sofa, armchairs, a coffee table, a rug and a dance
  floor. Bulbs and flames glow. **Set the table** puts a place setting in front of each chair at a
  table; **Chairs round it** uses the chair last put down. Benches, sofas and bar stools can be sat on.
- **Decor in a room** (see `docs/decor.md`): with a room round the body, **Decor** opens a panel to
  put chairs, tables, a flower arch, a pillar, an aisle runner, flowers, candles and lanterns in it
  (in seven colours), drag them along the floor, turn them, make rows, put chairs round a table, and
  keep several layouts per room (`decor/layouts/` in the data folder). **Add from a photo…** makes a
  thing in 3D from one photo on this computer with TripoSR (MIT), at the real height given;
  `body-studio decor PHOTO --height M` does it in the terminal, and `body-studio setup` installs it
  (the `photo3d` extra, TripoSR's code at a pinned commit, its weights). Chairs and tables stop the
  walk and **F** sits on a chair. New API under `/api/decor`.
- Fix: with a room remembered from last time, opening the app could fail to get the body's
  skeleton (the room asked for it before the body had loaded).
- **A loading screen until everything is ready**: the logo turning on a turntable, with a line on
  what is happening, from the page opening (or a body being picked) until the body can really be
  used: loaded, its skeleton found, its pose and tattoos back, the clothes fitted and what was
  worn put back on, the shop set out around it, a remembered room around it. Only for a wait
  longer than 0.4 s, kept at least 0.6 s and faded out, with a word on why after 8 s. See
  `docs/loading.md`.
- **Lower shelves, more rails**: the shop's shelves are units no taller than the person, side by
  side, instead of one bookcase twice the person's height; outfits hang five to a rail, on two
  rails instead of one crowded one.
- **Styles and a clothes list**: 17 new items in hippie, rock, indie and punk styles, all CC0 and
  made by `scripts/wardrobe_styles.py` (MakeHuman outfits repainted: tie-dye, flowers, black
  leather, a band T-shirt, tartan, flannel, Breton stripes; and accessories built on the base
  mesh: two beanies, a headband, three pairs of glasses, beads, a chain, a studded choker). Two
  new kinds, **Glasses** and **Necklaces**. The Try on panel lists every item by kind with a
  **Style** filter, so the body can be dressed in a room too; on a computer the panel is open
  when the page opens (as it was last left). The shop around the body is wider to hold them.
- **Sitting and leaning in a room**: the thighs lie along the seat and the hips are put on it
  (on a seat high for the legs the feet hang a little, toes pointed), instead of the feet on the
  floor and the thighs through the cushion. **F** no longer leans the body on a wall with
  furniture in front of it (a TV on its console, a shelf): the floor just out from the wall has
  to be free.
- **Tattoo studio**: a second sample room, **Sample tattoo studio**, with a tattoo bed, a
  reclining chair with arm rests, a flash wall and a mirror. Tap a design on the flash wall (twelve
  starters drawn for the app, plus the body's own tattoos) to lay it on the body. **F** by the bed
  or the chair goes where that tattoo is made (lying face up or down, the arm over the head for the
  ribs, or in the chair with the arm on its rest), with the clothes over it off until the body gets
  up. **Room / Artist / Mirror** views under the body. A room's run can carry
  `NAME_clean.fixtures.json` (where its furniture is), which the room's map keeps.
- **Joints**: a turned hand turns the forearm's skin along its length (no more shear at the wrist),
  the upper arm and the thigh share the shoulder's and the hip's twist; the shoulder rises with a
  raised arm; skin at a bent elbow, knee or hip presses together instead of passing through; the
  deltoid, forearm and calf bulge too.
- The Body Studio menu: the name at the top left (now on a soft chip) opens a card with **Style
  your clothes**, **Style your tattoos**, **Rooms**, **Body progress**, **New body**, **Guide** and
  **Language**, in place of the buttons in the top bar. Each mode shows only its own tools: the
  clothes are picked from the racks (the panel keeps what is worn, the body model and the
  necklaces), the tattoos are done in the sample tattoo studio (tattoos and pose, no clothes list),
  and a room has the Room and Decor buttons and changes nothing worn or inked. The mode is kept in
  the browser. The sample rooms' listing is retried until they are made, and their making is
  logged in `sample_rooms.log` in the data folder.
- Rooms: **First person** (or **V**) shows the room through the body's eyes; drag to look round,
  **W A S D** walk the way you look. A sample wedding venue (`workspace/_sample_venue/`), laid out
  as the Casa Arandella floor plan: reception, ante-room, a 17.8 m hall, the stage, a pergola and a
  garden with a bungalow, 80 m long, mapped when it is made. Long places get finer map cells.
- Decor: your own colour for a piece (the last swatch: a colour picker, **HEX** and **RGB**), kept
  in the layout as `#rrggbb`. The handles answer the pointer from further (measured on the
  screen), the pointer shows a hand over a piece or a handle, and the knob under it grows.
- Walking: hold **Shift** for a brisker pace (longer steps, the feet still planted).
- Rooms: **From above** shows the room from high up with everything above 2.4 m hidden, so you see
  through the ceiling.
- The sample wedding venue now has only what its floor plan shows (no trees, chandeliers or
  furniture of ours), a glass-roof steel pergola on sand and green walls in the ante-room, and the
  beach beyond the garden: sand, the sea and the island's hills (kept out of the map).
  `sample_venue.py` version 2; the venue is redrawn once.
- Decor: a flower shop of 25 more starters (tropical and baby's breath banks, a flower ring,
  callas, gerberas, orchids, hydrangeas, pampas, petals, hanging greenery, a flower cloud,
  lanterns, a wicker pendant, a wooden aisle, a fabric ceiling, a cane chair, a wooden table and
  more), in a new Flowers group, and coral, rattan and copper colours.
- Decor: 36 more starters from two decorators' proposals for the venue: hung clouds of leaves,
  bougainvillea and orchids, filament bulbs, rattan and jute pendants, paper globes, voile swags,
  a half-moon arch, a tropical arch, a flower swing, a canoe of flowers, backdrops, a rattan
  lounge, side tables, a dresser for the cake, more chairs and lanterns.
- With reduced motion asked for by the system, panels and buttons change at once instead of sliding or fading.
