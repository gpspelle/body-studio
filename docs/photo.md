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

Not yet: the body is not in the photo (splats can't be path traced; it will be drawn over it).
Next: real photo textures for floors, walls and wood.
