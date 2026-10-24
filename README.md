# Body Studio

**Turn a phone video of a person into a 3D body you can orbit, on your own Mac.**

One screen: the body stands in the middle and turns slowly; drag to look around, pick another
body from the row at the bottom, or drop a new video anywhere on the page. Until everything is
ready to use (the body, its skeleton, the clothes fitted and put back on, the shop around it, a
room), a loading screen shows the logo turning and a line on what is happening (and, if it takes
a while, why), so you never see a body you can't move yet.

**Body Studio**, at the top left, opens the menu of what to do: **Style your clothes** (the shop
around the body), **Style your tattoos** (in the tattoo studio), **Rooms**, **Body progress**,
**New body** and **Guide**. Each mode shows only its own tools: the clothes are
picked from the racks, the tattoo studio has the tattoos and the pose, and in a room nothing worn
or inked changes. On a computer the page opens on the clothes the first time, then in the mode
you left it in.

![The Body Studio menu](docs/images/menu-desktop.png)

![Body Studio on a laptop](docs/images/desktop-light.png)

<img src="docs/images/phone-dark.png" width="220" align="right" alt="Body Studio on a phone, dark mode">

Everything runs locally: no uploads, no accounts, no cloud GPU. The capture pipeline is
[Splat Studio](https://github.com/gpspelle/splat-studio)'s, installed as a dependency:

| Step | Tool |
|---|---|
| Video → frames | ffmpeg |
| Frames → camera poses | COLMAP |
| Poses → splat | Brush (Metal on Apple Silicon) |
| Fog, floor and room removed | Splat Studio (always on for bodies; a room keeps itself) |
| Runs, time left, advice | Splat Studio's job runner |
| Body on screen | Spark + three.js |

<br clear="right">

## Install

You need a Mac with Apple Silicon and Python 3.9 or newer.

```bash
git clone https://github.com/gpspelle/body-studio.git
cd body-studio
python3 -m venv .venv && source .venv/bin/activate
pip install -e .
body-studio setup        # installs ffmpeg, COLMAP, builds Brush, PyTorch, Anny and TripoSR, once (10–30 min)
body-studio              # opens http://localhost:8770
```

`pip install -e .` also installs OpenCV, which drops blurry frames. `body-studio check` shows what's installed. Videos and bodies are kept in `~/BodyStudio`
(change it with `--data-dir`), in the same layout Splat Studio uses.

## Filming a person

- The person stands **still** in an A-pose: feet shoulder-width apart, arms a little away from the body.
  Any movement during the take blurs that part of the body.
- Walk around them **three times**: at knee height, at chest height, and holding the phone above their head.
  1½–3 minutes in total, one continuous take, on the 1× lens.
- **Soft, even light** and a background with some texture (not a plain white wall). Lock focus and exposure.
- **Long hair tied back** (a bun or a ponytail), so the head and neck keep their shape. Hair tried on in the
  app is drawn over the head, and it can't hide hair that was filmed loose over the shoulders.

## Command line

```bash
body-studio run IMG_1234.MOV                     # whole pipeline in the terminal
body-studio run IMG_1234.MOV --quality preview   # quick look
body-studio run IMG_1234.MOV --start 0:03 --end 2:10
body-studio room LIVING_ROOM.MOV                 # a room filmed from inside, for the body to stand in
body-studio decor ARCH.JPG --height 2.2           # a 3D decor item from one photo, for the Decor panel
```

The finished body is `workspace/<video>/run_<date_time>/splat/<quality>_<steps>_object.ply`.
Background removal always runs; the untouched splat and the fog-free copy are kept next to it.
On a Mac (with Apple's Vision) or with SAM 2 installed, the person is also cut out of every
frame before training (splat-studio's `--person`), so nothing of the room is learnt; the masks
are kept in `frames/<video>/masks/`.

While a video is processed, the top bar shows the stage and the time left, measured from the
run itself. If a run fails, it says why in terms of the video (for example, which seconds to film again).

### Measurements and body fat (experimental)

```bash
body-studio measure workspace/<video>/run_<date_time>/splat/standard_30000_object.ply \
    --sex m --height 178 --weight 80 --tape-waist 86
```

Prints neck, waist (at the navel) and hip circumferences, measured on the body like a tape, and
a body fat estimate from the US Navy, US Army one-site and relative fat mass equations.
`--height` is required: it gives the body its real size. `--weight` adds the Army equation.
`--tape-waist` (your own tape measure, same day) checks the capture: more than 2 cm apart means
something is off. Film in underwear or tight clothing, waistband below the navel, long hair tied up.
Expect about ±4.5 points of body fat for one person; it is best for following the same person
over time. Research and sources: [docs/body-fat.md](docs/body-fat.md).

## Following a person over time

Pick **Body progress** in the menu to follow one person: a tape measure every week or two, a scan now and then.
The body stays in the middle; the panel sits at the right edge (at the bottom on a phone).

![Progress panel](docs/images/progress-desktop.png)

- **Body fat**, from the tape measures, with its trend. One formula for the whole series (US Navy
  when neck and waist are there, and hips for women), so a change in the number is a change in
  the body. It is about ±4.5 points off for one person; the change over time is what counts.
- **Tape measures**: weight, waist, neck and hips, each with its latest value, the change since
  the first entry and a small line of every entry. A change smaller than the measurement noise
  (1 kg, 1 cm, 0.5 cm at the neck) reads "about the same", in grey.
- **Scans**: add the body on screen to the person's history (dated by its run). Each scan is
  measured once, with the person's height, and the panel draws the circumference at every
  height of the body on screen over the first scan, with the change at the neck, waist and hips.
  Tap a date to show that body.

The same from the terminal:

```bash
body-studio person Anna --sex f --height 168
body-studio tape Anna --waist 74 --neck 32 --hip 98 --weight 61     # today; --date 2026-10-01 for another day
body-studio scan Anna Anna_front/run_20261012_120000
body-studio progress Anna
```

Each person is one file, `people/<name>.json` in the data folder. How the design was chosen:
[docs/progress.md](docs/progress.md).

## Clothes, tattoo & pose

Pick **Style your clothes** in the menu to dress the body, or **Style your tattoos** to try a
tattoo on it and move it to see how it sits. The panel sits at the left edge (at the bottom on a
phone): for the clothes it holds what is worn, for the tattoos the tattoo and the pose.

![Trying on clothes](docs/images/wardrobe-desktop.png)

![Clothes, tattoo & pose panel](docs/images/tattoo-desktop.png)

- **Clothes**: while the panel is open, a small shop stands around the body: outfits on hangers
  on clothes rails (five hangers to a rail at most, side by side), shoes on a shoe rack, folded
  T-shirts and jeans on shelf units no taller than the person (side by side, as many as it takes)
  with short hair on mannequin heads above them, and long hair and the fedora on stands. Point at an item to see its
  name, click it to put it on. The panel lists the necklaces, which have no rack. There are 20 outfits (tie-dye, a flower shirt and long skirt, a black
  leather jacket, a band T-shirt, tartan skirt and trousers, a flannel shirt, Breton stripes among
  them), 6 pairs of shoes, 10 hairstyles, 4 hats (fedora, two beanies, a woven headband), 3 pairs
  of glasses and 3 necklaces (beads, a chain, a studded choker). Each is fitted to this person's shape, moves with the pose, and hides the skin under
  it. What is worn stays in its place on the rack as a pale outline and is listed in the panel:
  click the outline (or its ✕ in the panel) to take it off, or **Take everything off**. What
  is worn is kept in this browser, per body. The first time, the app fits a model body to the
  scan (a few seconds): it takes the person's build first (MakeHuman's own body-shape sliders,
  set to match the scan), then their exact surface, so clothes sit closer.
  All are free to use (CC0): MakeHuman's own assets, and the styled ones made from them by
  `scripts/wardrobe_styles.py`; see [CREDITS.md](CREDITS.md).

- **Add an image** (PNG, JPG, WebP, SVG), then tap the body where it goes. Drag it to move it;
  set its width in centimetres, its turn and how strong the ink is, and give it a name to tell
  it apart from the others. Designs drawn on white have
  the white removed. The tattoo follows the skin wherever you put it: around an arm, across the
  back, over a shoulder, from the lower back onto both thighs. It is drawn into the skin as
  ink, so the skin shows through it, and whatever covers the skin (an arm, clothes) covers it.
- **Move the body**: drag the dot on a joint (the elbow dot turns the shoulder, the wrist dot
  the elbow…), or pick a pose: standing, arms up, flex, walking, sitting. Each joint only moves
  the way a person's can, within its normal range: an arm reaches across the chest or back behind,
  a bent knee turns the shin, the wrist bends toward the palm and to the sides and the forearm turns
  the hand. An arm stops at the body instead of going into it. Pick a joint to set its angles with
  sliders.
  The tattoo moves with the skin.
- **Walk it around**: press **W A S D** (or the arrow keys) and the body walks across the floor,
  away from you, toward you or to the sides, turning to face the way it goes; the camera follows
  at an even pace, without bobbing with each step.
  **Space** jumps. **Q** / **E** raise the left / right arm and **Z** / **C** the left / right
  knee (the body's own left and right); they stay up until pressed again. Clothes, hair, shoes and
  tattoos go along. Let go and it stands where it got to, in the pose from the panel, with arms
  that were held out as in the scan now down by its sides; **R** brings it back. The first press
  finds the skeleton if the panel hasn't yet. **Guide** in the menu (or **?**) lists every control.

  ![Walking](docs/images/walk-desktop.png)

  ![The Guide](docs/images/guide-desktop.png)
- **It looks alive**: standing still, the body breathes, sways a little, blinks and turns its head
  to you. Walking, its feet stay planted. Skin darkens where it meets skin, the biceps swells as
  the arm bends, a turned hand turns the whole forearm's skin (so a tattoo on it turns too), the
  shoulder rises with a raised arm, bent skin presses together instead of passing through, a skirt or a ponytail trails behind as it walks and turns and swings on when it
  stops, and a soft shadow on the floor follows it. Pick
  **Hands**: as scanned, relaxed or a fist. **What if** sliders show the person lighter or heavier
  (about ±12 kg) and with less or more muscle; they aren't saved. How it works:
  [docs/flesh.md](docs/flesh.md).
- The first time, the app finds the body's skeleton (a few seconds). It needs the A-pose from the
  filming guide: arms a little away from the body, feet apart. Tattoos and pose are kept in this
  browser, per body.

`body-studio rig BODY.ply` does the skeleton step in the terminal and prints the joint heights.
It saves `BODY.rig.json` next to the body. How it works, the body models that were considered
and their licences, and the limits: [docs/tattoo.md](docs/tattoo.md).

`body-studio fit BODY.ply` does the clothes fitting step in the terminal and saves `BODY.fit.json`
next to the body. How the clothes are fitted and drawn, where they come from, and the limits:
[docs/wardrobe.md](docs/wardrobe.md).

Trial: the clothes panel shows **Body model: Standard / Anny (trial)**, to see the same clothes on a
body fitted either way ([Anny](https://github.com/naver/anny) is a body model that runs on PyTorch).
`body-studio setup` installs PyTorch and Anny; if they aren't there, the first click on Anny installs
them, with nothing to type (a few minutes, once). The Anny fit takes about two minutes the first time
per body and is saved as `BODY.anny.fit.json`; `body-studio fit-anny BODY.ply` makes it in the
terminal. PyTorch is only needed for this. Results so far: [docs/anny.md](docs/anny.md).

## A room around the body

Film a room, or your whole house, from inside it, and the body stands in it: to its own scale, on
its floor. Walk it round with **W A S D**: walls and furniture stop it (it slides along them).
Press **F** next to the sofa or a chair to sit down, or next to a wall to lean on it; **F** again
gets up. The camera stays inside the room. **First person** at the top (or **V**) shows the room
through the body's eyes: drag to look round, **W A S D** walk the way you look; **Third person**
(or **V** again) goes back behind the body.

![The body sitting on the sofa of the sample living room](docs/images/room-desktop.png)

- Pick **Rooms** in the menu: the body goes into the room it was in last (the sample living room
  the first time). **Room** at the top then opens the list of rooms filmed so far. **Add a room…** takes its video (an
  iPhone capture from Splat Capture works too, and is in metres). Pick a room to put the body in
  it, **No room** to take it out. **Size** corrects the room's size if it looks off.
- **Sample living room** is always in the list, so you can try it before filming anything: a
  furnished room drawn by the app (sofa, armchair, bookshelf, TV, dining table, plant), made in
  the data folder the first time the list opens (`workspace/_sample_room/`).
- **Sample wedding venue** too, laid out like a real one's floor plan (Casa Arandella): the
  deck and the reception, a vertical garden, the ante-room, the main hall (17.8 m by 8.6 m, oak
  floor, panelled walls, tall windows, chandeliers), the stage, a pergola with a brick floor and a
  garden with olive trees, hedges, a path to the gate and a bungalow; 80 m from the door to the
  gate, to decorate a big place before filming one (`workspace/_sample_venue/`).

  ![The sample wedding venue in first person: the hall set with round tables, the glass doors to the pergola and the garden](docs/images/venue-desktop.png)
- **Sample tattoo studio** is there too: a tattoo bed, a reclining chair with arm rests, a flash
  wall of designs and a mirror (`workspace/_sample_studio/`). **Style your tattoos** in the menu
  puts the body in it. Tap a design on the flash wall to
  pick it, then tap the body to lay it there. **F** by the bed or the chair goes where that tattoo
  is made: in the chair with the arm on its rest for an arm, lying face down for the back, face up
  for the belly or a leg, with the arm over the head for the ribs. The clothes over the tattoo
  come off there and go back on when the body gets up. **Room**, **Artist** and **Mirror** under
  the body change the view. More: [docs/tattoo.md](docs/tattoo.md#the-tattoo-studio).

  ![The body in the tattoo chair of the sample tattoo studio](docs/images/studio-desktop.png)
- Filming a room: walk slowly round it with the phone at chest height, pointing at the walls, and
  get the floor (and the ceiling, if you can) in view. One take, 1–3 minutes; for a house, walk
  from room to room without stopping.
- A room's run keeps the room: no background removal (splat-studio's `--scene`, where only the fog
  in the air is removed). Its name is kept in `rooms.json` in the data folder, so it is listed as a
  room, not a body. The first time, the app maps it (a few seconds): the floor, the size (from the
  height the phone was held at), the walls, the furniture and the seats; it saves
  `NAME_clean.room.json` next to it. `body-studio room-map ROOM.ply` does it in the terminal.

How it works and the limits (flat floors only, the size is a guess within about 10%):
[docs/room.md](docs/room.md).

## Decor in a room

In **Rooms**, with a room round the body, **Decor** in the top bar opens a panel for putting things in it, about
40 wedding pieces in a few colours, by kind: **Tables** (chairs, cross-back chairs, benches, round,
long, square, cocktail and sweetheart tables), **On the table** (place settings, centrepieces low
and tall, candelabras, bud vases, table numbers, the cake, a champagne tower, flowers, candles),
**Ceremony** (arches, a moon arch, a chuppah, a flower wall, flower stands, aisle flowers, a
runner, a welcome sign), **Bar** (a bar, its back shelves, bar stools, a buffet), **Lights**
(string lights, light poles, a chandelier, a curtain of fairy lights, uplights, lanterns; they
glow) and **Lounge** (a sofa, armchairs, a coffee table, a rug, a dance floor), or things made in
3D from a photo. Planning a wedding venue is what it is for: film the venue as a room, set it,
walk the aisle.

![A wedding table in the sample living room under string lights, picked, with the list of what is in the room](docs/images/decor-desktop.png)

- **Add** lists the things; tap one to put it in the room, then drag it along the floor. Flowers
  and candles go on the table they are dropped on. **In the room** lists everything placed, by
  kind: tap a line to pick it, ✕ to take it away. While Decor is open, the body's panel steps aside.
- The picked thing has handles, like the body's joints: drag the ring round it to turn it (Shift
  for any angle), the knob over it to raise or lower it (**Raised** does the same). A small
  toolbar above it turns it a step, duplicates it or removes it.
- The things look like a furniture shop's: linen, brass, wood and glass in soft studio light,
  a soft shadow under each, a picture of each in the catalogue. **Turn** (or `[` `]`), a colour
  (or your own: the last swatch opens a colour picker with **HEX** and **RGB**), **Make a row** of up to 12, **Chairs
  round it** for a table, **Set the table** (a place setting in front of each chair), **Remove**
  (or Delete).
- **Add from a photo…**: a photo of one thing (an Instagram picture is fine), its name and its real
  height in cm. It is made into 3D **on this computer** with TripoSR (MIT) in a minute or two. The
  first time also installs it and downloads its weights (about 2 GB); `body-studio setup` does that
  beforehand. The back of the thing is guessed, so it works best on one whole thing on a plain
  background.
- Chairs and tables stop the walk; **F** sits on a chair, a bench, a sofa or a bar stool you put there.
- **Layout**: several arrangements per room (**New**, **Copy**, **Delete**). Everything is kept in
  `decor/` in the data folder.

How it works and its limits: [docs/decor.md](docs/decor.md).

## Development

```bash
pip install -e .
python -m unittest discover -s tests/unit -t .

# end to end: the real splat-studio pipeline with its stand-in COLMAP and Brush (needs ffmpeg)
export SPLAT_STUDIO_SRC="$(python3 scripts/splat_studio_src.py)"
python -m unittest tests.integration.test_end_to_end

pip install playwright && python -m playwright install chromium
python -m unittest discover -s tests/browser -t .   # the app in a real browser (one file per part of the page)
python3 scripts/screenshots.py                      # regenerates docs/images/
```

See [AGENTS.md](AGENTS.md) for conventions and [docs/plan.md](docs/plan.md) for what comes next.

