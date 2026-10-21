# A body that looks alive

What the page adds on top of the skeleton (`docs/tattoo.md`) and the clothes (`docs/wardrobe.md`)
so the body moves and looks more like a person than a posed statue. Everything here runs on the
page; nothing is saved but the hands' setting.

## Standing and walking

- **Feet stay planted** (`static/walk.js`). While a foot is in its stance, the body moves by how
  far that foot would have slid, so the foot stays where it touched the floor. The heel and the
  toe both count, whichever is lower. The pelvis turns against the chest at each step and the hips
  sway over the standing leg.
- **Alive when still** (`walk.js` `Life`): breathing (14 a minute, the chest rises and the
  shoulders lift a little), a slow sway of the pelvis and spine, a blink every 2 to 6 seconds, and
  the head turning to the camera (up to 40° to the side, 15° up or down, the neck taking 40% of it).
  Walking, the head faces where it goes. A browser driven by a script (tests, screenshots) gets a
  body that holds still (`navigator.webdriver`).
- **Blinks**: two small ellipsoids over the eyes (the fitted base mesh's eye joints), the colour of
  the skin just above, grow down from the brow (Spark `SplatEdit`).
- **Hands**: as scanned, relaxed or a fist (the pose panel). Past the knuckles the fingers curl
  along an arc toward the palm.

## What skin does that bones don't

One GPU step after Spark's skinning, for the body, the ink and every item of clothing
(`static/flesh.js`, the maths; `static/fleshgpu.js`, the same in GLSL). The body is also kept as
up to 24 capsules (limbs, the head, two side by side for each part of the trunk), sized from the
skin.

- **Contact shading**: skin is darker where another part of the body comes close (an arm down by
  the side, the thighs together, the inside of a bent elbow), compared with how close it already
  was in the scan, whose own shading is in its colours.
- **Bulges**: the biceps swells as the elbow bends, the chest and belly rise with a breath.
- **Skin that stays closed**: where a pose pulls the skin apart between two bones (the armpit with
  the arms up), its splats grow along the skin, so it doesn't break into flakes.
- **Clothes stay out of the body**: an item's splats are pushed out of the capsules of other
  parts (a skirt out of the thighs, a sleeve out of the side), no deeper than they were in the
  scan's pose. Cloth gathers into wrinkles on the inside of a bent elbow, knee or hip.
- **Loose things swing**: a skirt's hem, a ponytail and hair over the shoulders lag behind as the
  body moves, and swing back. There is one damped spring for the hips (clothes) and one for the
  head (hair). Each splat follows it by how far it hangs off the skin, from not at all within
  6 mm to fully beyond 5 cm.

## The floor and the fabric

- **Shadow** (`static/ground.js`): soft discs on the floor under each capsule, as for light from
  above with a soft edge (an overcast sky). They are darkest under the feet, and fainter and wider
  for parts higher up, so a jump lifts off its shadow.
- **Fabric**: each splat of an item takes the texture's colour averaged over the patch it covers
  (a pyramid of the texture), so a fine weave doesn't shimmer as random dots. Folds of the model
  (pockets, seams, creases) are darker, where less light gets in.
- **Healed tattoos**: ink sits under the skin. Its colours are a little greyer than the design,
  its edges soft, and the skin's own colour (each splat's, not only the area's) still shows through.

## What if

Two sliders in the pose panel, **Lighter · heavier** and **Less · more muscle**. They move the skin
the way MakeHuman's universal weight and muscle targets move the fitted base mesh for this
person's sex, on top of their fitted shape. Every splat, the ink and the clothes take the moves of
the skin nearest them. The kilograms shown are the change in the body's volume at 1010 kg/m³,
for the height set in the panel. They are a look at what could be, not a prediction, and they
aren't saved. `<body>.fit.json` is version 4 (with `whatif`). Older fits are made again on first
use.

## Limits

- The capsules are rough: contact shading and the push out of the body are about right for limbs,
  less so where the trunk meets the arms.
- The swing is two springs, not cloth: a skirt sways as a whole, it doesn't ripple.
- The shadow assumes light from above, whatever lit the scan.
- The heavier and lighter body follows MakeHuman's targets, which put weight on and off in the
  same places for everyone of a sex.
