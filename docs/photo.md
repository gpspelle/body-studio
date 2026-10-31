# Take a photo

Walking round a room is drawn the way a game draws it: fast, one sun, no shadows, light only
from the decor's soft studio. That keeps it smooth, but it never looks quite real. **Take a
photo** (bottom right, in a room) draws the view you are looking at a second way, the way
architects' renders are made: by following the light. It takes longer, from a minute or two on a
Mac's GPU, but walking round still costs exactly what it did.

What the photo gets right that the live view can't:

- the sun's shadows, soft at their edges, under tables, chairs, the pergola's reeds;
- light from the sky coming in through the doors and windows and bouncing off the walls and floor
  into the corners (no baked shading needed);
- shine on brass and china, light through glass, tinted by its colour;
- bulbs and candles that light what is round them.

It shows exactly what was put in the room: nothing is made up, so it is the one to plan with.

## How it works

- `static/photo.js` (maths, `tests/js/photo.test.mjs`): the photo's size (the window's shape, 1600
  px on its long side), what goes in, how each decor finish is made (glass as clear glass, bulbs as
  lights), the sun's way, the light's settings, the file's name.
- `static/darkroom.js`: copies the room's meshes as they are drawn (the shell, its fittings and
  the decor, not the body's splats, its clothes, the handles or the soft shadow cards) into a scene
  of their own with materials the path tracer understands, and runs it a pass at a time between
  frames (400 passes, 6 bounces) on a canvas of its own. The sky is a gradient in the sky dome's
  colours and is what lights the room; the sun is where the decor's is.
- `static/pathtracer/`: [three-gpu-pathtracer](https://github.com/gkjohnson/three-gpu-pathtracer)
  and three-mesh-bvh (both MIT), bundled by `scripts/pathtracer_bundle.sh` so they import three from
  splat-studio's copy (r180: path tracer 0.0.24, the last that takes it).

## Photo of this piece

**Photo of this piece** (in Decorate, on the thing picked) is the same photo with only that piece
in it, on a wide plain floor (the room's floor under something that hangs, so its shadow lands
there) with a pale backdrop, in the same sky and sun, the camera brought in on the line you are
looking at it from until the piece fills the photo (`frameOn`, `groundAt` and `PIECE` in
`photo.js`). It is for going round a design with a decorator: change the arch, take its photo,
change it again. It is much quicker than the room's photo:

- setting up: the path tracer builds a search tree over every triangle before the first pass. An
  arch is a few tens of thousands; the venue is millions (about a minute and a half before the first
  pass in software, seconds on a Mac's GPU).
- each pass: most of the photo is the piece or the backdrop, and a ray that misses the piece ends
  at once; with no walls and roofs to bounce between, 3 bounces do instead of 6.
- 1024 px on the long side instead of 1600 (0.4 of the pixels), and 160 passes instead of 400.

Make it a photo on a piece's photo runs the image model at 768 px (about half the pixels of 1024,
so roughly half the time) and tells it to make a product photograph of the decoration, keeping
every flower's kind, number and colour.

## Make it a photo

Once the photo is done, **Make it a photo** sends it to the app, which turns it into a
photograph with an image model that edits pictures, on the Mac itself (nothing leaves it):
[FLUX.2 klein 4B](https://huggingface.co/black-forest-labs/FLUX.2-klein-4B) (Apache 2.0) run by
[mflux](https://github.com/mflux-community/mflux) (MIT) on the Mac's GPU, about a minute at
1024 px. It is told to keep every object where it is, with the same shape, count and colour, and to
make the materials and light real. It can still change small things, so its picture is shown
beside the path-traced one, captioned, and that one stays the one to plan with.

- `photoreal.py`: keeps each photo in `photos/` in the data folder and makes it real in the
  background, one at a time (`POST /api/photoreal`, then `GET /api/photoreal/<id>` until it is
  ready, then `.../real.png`). The model runs as mflux's own command in its own process, from a
  Python of its own in `~/.cache/body-studio/mflux` (its transformers is newer than TripoSR's).
  `body-studio setup` installs it, or the app the first time; the weights (about 8 GB) come down
  on the first run. At 4 bits a weight below 32 GB of memory, else 8.
- Needs a Mac with Apple silicon and a Python 3.11 or newer; elsewhere the button says so.
- `tests/fakes/photoreal.py` stands in for mflux in tests (`BODY_STUDIO_PHOTOREAL`): it takes
  mflux's flags and gives the photo back.

## Baked light

A photo can't be walked round, so the same light can also be kept on the room itself. **Bake the
light** (above Take a photo) works out the light on every corner of the room's walls, floors,
fittings and decor, and the live view then shows that in place of its lamps: the sun's shadows
soft at their edges, the sky's light dimmer under the roofs and in the corners, the light the floor
and walls throw back, tinted by their colour. Walking round then costs what it did before. It runs
only when pressed, a slice a frame with "Working out the light · 42%" by the button, and walking is
slower until it is done (minutes in the venue). Decor drawn again where it was keeps its light;
moved or new decor shows the lamps' light until the next bake. The shine on metal and glass is still
the live view's.

- `static/bake.js` (numbers, `tests/js/bake.test.mjs`): how many rays (96 per corner), the sun's
  and the sky's light, the texture's layout and bands, the light kept as bytes, the keys.
- `static/bakelight.js`: puts the room's meshes together (without the glass) and builds a BVH over
  them (three-mesh-bvh, from `pathtracer/`); one texel per corner (two for walls, a side each);
  a shader casts from each a ray toward the sun, one round about (the sky, or the light where it
  lands) and averages them over the passes, a band of rows a frame so the page keeps moving; then
  reads it back once and keeps it on each mesh (`bake`, `bake2`), shown by copies of its materials.
  `bakelight.enable(false)` shows the lamps' light again.
- Coarse where a wall has few corners (a long wall's shadow is as sharp as its corners are close);
  bodies don't cast it (they are splats).

Not yet: the body is not in the photo (splats can't be path traced; it will be drawn over it).
Next: real photo textures for floors, walls and wood.
