# Tattoo & pose

Try a tattoo on the body and move the body to see how it sits. Click **Tattoo**, add an
image, tap where it goes; drag the dots on the joints, or pick a pose. This page is how it works
and why it was built this way.

## What happens

1. **Skeleton, once per body** (`body_studio/rig.py`, `body-studio rig BODY.ply`, or
   `GET /api/rig?body=…` from the page, which builds it in the background). Saved next to the body
   as `<body>.rig.json`; built again only when the body changes. A few seconds for a 300k-splat body.
2. **Skin weights**: how much each bone moves each part of the body, stored on a voxel grid.
3. **Posing on the page** (`static/pose.js`, `static/tattoo.js`): joint angles are turned into one
   rotation and translation per bone; Spark's `SplatSkinning` moves every splat with dual quaternion
   skinning on the GPU.
4. **The tattoo** is a grid laid on the skin itself (walked out over the splats from the point
   tapped) and drawn as splats of ink on the skin, skinned with the body's own weights, so the
   renderer moves, sorts and hides them with the body's splats.

Pose, tattoos (with their images) and the person's height are kept per body in the browser
(IndexedDB). Nothing is uploaded anywhere; the image never leaves the computer.

## Why not a body model (SMPL and friends)

The usual way to pose a scanned person is to fit a parametric body model and borrow its skeleton
and weights. All the animatable Gaussian avatar papers do this (GaussianAvatar, 3DGS-Avatar, HUGS,
GART…), and they also need a *video of the person moving* to learn how the body deforms. A body
capture here is a person standing still, so there is nothing to learn from, and the licences are
a problem for a local app:

| Model | Licence | Usable here? |
|---|---|---|
| SMPL, SMPL-X, SMPL+H, STAR | Non-commercial research only; registration to download | No: can't ship the files, can't be used commercially |
| GHUM / GHUML | Apache-2.0, but TensorFlow-only and no readily usable skinned mesh | Not without a heavy runtime |
| Anny (NAVER Labs, 2025) | Apache-2.0, built on MakeHuman | Its shape space (MakeHuman's CC0 targets) is used by the clothes fit, solved without PyTorch (`docs/wardrobe.md`) |
| MHR, Momentum Human Rig (Meta, 2025) | Apache-2.0 | Possible later; needs PyTorch to fit |
| MakeHuman base mesh | CC0 | Used for **tests** (an artist-placed skeleton to check ours against) |

Fitting any of them also needs an optimiser and a pose prior, which means PyTorch or NumPy; this
repo's Python side is standard library only (AGENTS.md). So the skeleton is found from the shape
of the splat itself, which needs no model, no download and no licence, and works for any body
shape, clothing or hair.

## The skeleton

The person stands in an A-pose (the capture guide already asks for it). Up comes from Brush's
"Vertical axis" comment; front is where the feet point.

- The body is cut into horizontal slices (0.5 % of the height) and each slice into separate pieces.
  Two pieces at the bottom are the legs; they are followed up to where they meet (the crotch).
  Pieces beside the trunk are the arms, followed from the armpit to the fingertips. The trunk is
  followed up to the head.
- Joints go where anatomy puts them, from segment lengths as fractions of height (Winter,
  *Biomechanics and Motor Control of Human Movement*): the wrist at the narrowest slice of the
  arm, the elbow 56 % of the way from shoulder to wrist, the shoulder just under the top of the
  shoulder, the hip a little above the crotch (clamped to 51–55 % of the height), knee and ankle
  along each leg, the head pivot over the neck.
- Sanity checks turn a failure into advice: two legs, two arms hanging down, arms of similar
  length, an upright trunk. The page says what to change ("hold the arms a little away from the body").

Checked against the MakeHuman body (an artist placed its joints) in four shapes, turns and arm
angles: joints within 1–4 cm on a 1.75 m body (`tests/unit/test_rig.py`).

## Skin weights

Geodesic voxel binding (Dionne & de Lasa, *Geodesic Voxel Binding for Production Character
Meshes*, SCA 2013), the method behind Maya's default skin binding:

- The body becomes a solid of voxels (1/80 of the height), closed and filled.
- From each bone, a shortest-path distance *through the body*. Distance through the inside is what
  keeps the left thigh from pulling the right one, or an arm from pulling the waist it nearly touches.
- Weight ∝ 1/(d + ¼ voxel)⁴, the four strongest bones per voxel, smoothed twice, then grown a few
  voxels outward so splats just off the surface have weights.
- The upper arm's weight fades out over about 2.5 cm past the armpit crease (the plane through the
  shoulder joint halfway between the arm and the side of the body), so the shoulder blade and the
  side of the chest follow the trunk: with the arms raised, the back doesn't swing out into wings
  (and a back piece isn't stretched with it). A wider fade (10 cm, rig version 3) left the side of
  the chest 4–12 cm under the shoulder partly on the arm, and dual quaternion skinning swings such
  skin along an arc about the shoulder: with the arms up it stood 5–8 cm out, like oversized lats.
  The cost of the sharp fade: the armpit's stretch gathers at the crease, so a big tattoo across it
  thins out there with the arms up. The skin over the shoulder itself still bunches up.
- Tattoo ink takes the weights of the body splat it lies on, so it moves exactly with that skin.
- On the page, each splat takes the trilinear blend of the voxels around it, each voxel counted by
  how much its bones agree with the blend of all eight, so a voxel that belongs to another body part
  (across the gap between the thighs) drops out, while along the skin the weights change smoothly
  (a hard switch from one bone to the next tears the skin open at the armpit when the arm moves).
  The four weights are rounded down to bytes and the remainder goes to the strongest bone, so they
  always add up to exactly one.

## Joints that move like a person's

Each joint has its own axes and anatomical motions (flex/extend, sideways, twist), with ranges of
motion from the clinical references (AAOS; Soucie et al., *Range of motion measurements*, 2011;
Norkin & White, *Measurement of Joint Motion*). The right side mirrors the left.

| Joint | Motions (degrees from the anatomical position) |
|---|---|
| Shoulder | forward −60…180, out −50…180, twist −90…70; at shoulder height, across the chest to 45° past straight forward and back to 40° behind out to the side |
| Elbow | bend 0…145 (a hinge: no sideways, no twist) |
| Wrist | bend −70…80 (toward the palm), side −30…20 (toward the thumb), twist −80…80 (the forearm turning the hand: pronation, supination) |
| Hip | forward −30…125, out −25…45, twist −45…40; further across with the hip bent (crossed legs) |
| Knee | bend 0…145 (a hinge); the shin turns in 30 and out 40 once the knee is bent 90 (none when straight) |
| Ankle | foot −50…20, side ±10, tilt −15…30 |
| Neck and head together | forward 60, back 75, sideways 45, turning 85 |
| Spine, chest | forward, side and twist, a few tens of degrees each |
| Collarbone | raise −10…30, forward ±15 |

The scan's own pose is measured and always allowed. A rotation is a swing followed by a twist about
the bone. A swing has an elevation (how far from where the bone hangs) and a plane (out to the
side, forward, across the front, back). The shoulder and the hip list the furthest elevation for
each plane, because they reach much further in some than in others (an arm goes straight up, or
across the chest at shoulder height, but only 60° straight back); the other joints keep within the
ellipse between their two swing ranges. The tests check each range against the table above. Dragging a dot aims the bone at
the pointer and keeps its twist; the angle is then clamped to the joint's range.

**The hand's axes come from the scan.** The wrist's motions are measured from the thumb-forward
position (palm toward the body), the zero of forearm rotation in the clinical tables, but a scan's
hands may face down, in or back. The splats the wrist carries are flat, so the direction across the
hand they spread least in is the palm's normal (`palmNormals`); the hand's rest turn is read from it
(of the two ways it could face, the one nearer thumb-forward). The forearm turns the hand before the
wrist bends it, so "bend" always goes toward the palm, however the hand is turned. A hand that isn't
clearly flat in the scan rests thumb-forward.

**The arms stay out of the body.** A joint's range doesn't know where the trunk is: an arm swung
across the front at hip height, or a forearm bent with the arm turned in, would go into it. The rig's
surface maps already measure the trunk and the head (the body's radius around their axis at each
height and angle, at rest). `BodyVolume` takes points along each upper arm (past its first 40 %,
which starts inside the shoulder), forearm and hand back to rest through the trunk bone nearest each,
and adds up how far they are inside, allowing an arm to sink 40 % of its own thickness (flesh gives).
A move goes in steps of 2° and stops where that depth would grow (or, for a pose that was already
inside, where it would grow past what it was); then each angle is tried on its own, so a drag slides
along the body instead of sticking to it. Presets are checked to be outside. Legs aren't checked
against each other: their cones already keep them apart.

The splats are moved by **dual quaternion skinning** (Kavan et al., 2007), which Spark implements
for splats (`SplatSkinning`). Unlike plain linear blending it doesn't collapse a bent elbow or a
twisted forearm into a "candy wrapper".

**A twist spreads along the limb.** Skinning alone turns a limb's skin with the bone it is weighted
to: turning the hand (the wrist's twist) turned only the hand and the wrist's end of the forearm, so
a tattoo across the forearm sheared at the wrist. In a real forearm the radius rolls over the ulna,
so the skin turns more the nearer it is to the hand. One GPU step after skinning (flesh.js, `TWIST`)
turns each splat of the forearm about the forearm's axis by the hand's twist times how far along the
forearm it is (none at the elbow, all of it at the wrist). The upper arm and the thigh take a smaller
share of the shoulder's and the hip's twist the other way round: most at the joint, fading out by
45 % of the bone, so a twisted arm doesn't turn its skin as one block at the shoulder.

**The shoulder follows a raised arm.** Past 30° up, the shoulder blade and the collarbone turn with
the arm (the scapulohumeral rhythm, about one degree for every six of the arm: `RHYTHM` in pose.js,
up to 20°). The arm keeps pointing where it was put; the shoulder rises with it, so an arm straight
up doesn't stick out of a flat shoulder line, and the skin over the deltoid and the chest stretches
less. Arms folded across the chest take less of it.

**Skin folds where a joint bends.** At a bent elbow, knee or hip, skin of the two parts meets: the
forearm's into the upper arm, the calf's into the thigh, the belly's into the thighs. Each splat is
pushed out of the next part's capsule (flesh.js, `FOLD`), no deeper than it already was at rest, so
the fold presses together instead of passing through.

## The tattoo

- **Size**: real centimetres, from the person's height (the panel asks; it uses the height of the
  person whose Progress history holds this body, or 170 cm).
- **Placement**: a *discrete exponential map* (Schmidt, Grimm & Wyvill, *Interactive Decal
  Compositing with Discrete Exponential Maps*, SIGGRAPH 2006), the way decals are laid on meshes and
  point clouds. The opaque splats are averaged into cells of about 7 mm (each with a normal, set on
  the outside of the splats' few-millimetre scatter). A normal's direction (out, not in) comes
  from the bones that carry that skin, by their weights: the nearest bone alone gets it backwards
  where skin of one part lies close to another (the side of the chest under the arm is nearer the
  upper arm than the spine), which sank the ink into the body and stopped a design at the armpit.
  The tests check the normals against the MakeHuman mesh's own. From the point tapped, a shortest-path walk
  over the cells gives each one 2D coordinates on the skin, carrying a frame along; a cell takes the
  average of what its already placed neighbours say, leaving out a neighbour that disagrees (where
  the walk meets itself behind a limb). Each point of the image then sits where the splats with its
  coordinates are. Nothing depends on which bone or part of the body is under it, so a design runs
  across the crotch onto both thighs, over a shoulder onto the arm, or around the side of the body,
  keeping its size like a transfer pressed onto the skin.
  - The walk doesn't step to skin that faces the other way (from an arm to the flank beside it, from
    one thigh to the other), so a design doesn't jump a gap; parts of the image with no skin under
    them are left out, and the outline stops there too.
  - The grid is filled outward from the tapped point: each point takes, among the skin with its
    coordinates, the spot nearest to its neighbour, so where the map overlaps itself (the arm beside
    the chest at the armpit) a design doesn't hop between the two. A triangle whose edges come out
    much longer than in the image (it would cross a gap) isn't drawn, which leaves a small gap
    instead of a thin line.
  - Its top points along the bone it was put on (the trunk's or a leg's axis), toward the head; the
    carried frame is drawn back toward that axis over about 9 cm so the image stays upright over the
    buttocks or from a crease, at the cost of a few per cent of stretch where the body tapers. It is
    never mirrored.
  - Checked on a cylinder (every point within 2 mm of its arc length) and on the MakeHuman body:
    widths and heights within a few per cent on the back, thigh and forearm, every point on the skin
    (`tests/js/pose.test.mjs`). The tests also lay designs of 6 to 35 cm on random spots and check,
    at rest and with the arms up, flexed, walking or sitting, that no part stretches into a line and
    every ink splat lies on the skin (among its outermost splats, not standing off it) and stays next to the skin it was put on,
    and that the body's splats under it take the ink.
- **Ink is splats**: the image becomes about 40,000 small flat splats spread over its inked pixels
  (once per image; moving, turning or resizing the tattoo only moves them). Each lies on the skin,
  at the outside of the skin's own splats (two spreads of their scatter out), coloured like the skin
  under it darkened by the ink (a tattoo darkens skin, it doesn't paint over it; black ink reads as
  deep blue-grey, like healed ink), and skinned on the GPU by Spark with the skin weights of where it
  is. The body's own splats under the design (within 1 cm in or out of the skin) are darkened too,
  each by the mean ink over the patch it covers, and get their colour back when the tattoo moves
  away: a scan's skin is a shell of splats a few millimetres thick, each a centimetre or so wide, so
  where one of them ends up in front of the ink it shows a softened ink rather than bare skin, while
  the small ink splats on top keep fine lines sharp. So there is one
  body: whatever hides the skin hides the ink (an arm in front, the other side of the body, clothes,
  a fold at a bent joint), and nothing else has to agree with it. An earlier version drew the ink as
  a mesh over the splats, with its own weights, a stand-in body for depth and a mask for clothes;
  each disagreement between those showed as a bug (stray lines, a design missing its head).
  Designs drawn on white (most JPGs) have the white removed and are cropped.
- **Skinning**: the outline shown while editing is the border of the grid, moved on the CPU by the
  same dual quaternion blend as Spark's shader.

## The tattoo studio

**Sample tattoo studio** in the Room menu is a tattoo parlour drawn by the app
(`sample_studio.py`): a black tattoo bed, a reclining tattoo chair with an arm rest each side, the
artist's stool and tray, a flash wall of cork, a full-length mirror, a counter by the door and a pink
"TATTOO" neon. Next to its splat it writes `<name>.fixtures.json`, which says where the bed, the
chair and its rests, the flash wall and the mirror are; the room's map (room.py) carries them in
the map's metres. A room with fixtures for a flash wall is a studio (parlour.js):

- **The flash wall.** Sheets of flash hang on it: the body's own tattoos first, then twelve starter
  designs drawn for the app (`static/flash/`, CC0: rose, swallow, anchor, heart, dagger, snake, moth,
  mandala, geometric, wave, sun, lightning). A tap on a sheet picks its design, the panel opens and
  the next tap on the body lays it there, named after the sheet, as an image from a file is.
- **Where it is made.** **F** by the bed or the chair takes the body to where a tattoo at that spot
  is made (`stationFor`, from the bone it lies on and the way its skin faces at rest): an arm in the
  chair, that arm on its rest with the forearm turned so the tattoo faces up; the neck, the
  collarbones and the upper chest in the chair, leaning back; the back of the trunk or of a leg
  lying face down; the belly, the hips and the front of a leg lying face up; the ribs and the flank
  lying face up with that arm over the head. By the other piece of furniture, or with no tattoo yet,
  the body just lies face up or sits.
- **Clothes come off.** The worn items over the tattoo's skin come off at the bed or the chair and
  go back on when the body gets up. Clothes are separate splats fitted to the body, so they can; what
  the body was filmed in is part of the scan and stays.
- **Views.** Small chips under the body: **Room** (the room's view), **Artist** (close over the
  tattoo, from a little toward the head) and **Mirror** (from the mirror's glass, drawn mirrored;
  a drag on the body leaves it).

Lying down: the body turns to lie along the bed, its head at the head end, face up or down, and is
put down so the lowest point of its skin (from the surface maps round each bone) rests on the bed's
top; it lies down and gets up in an arc. The reclining chair tilts the body back by its recline and
opens the hips as much, so the thighs stay on the seat. The arm on a rest is found by a search over
the shoulder and the elbow for the pose that puts the middle of the forearm on the rest, level.

## Walking and jumping

**W A S D** (or the arrows) walk the body across the floor and **Space** jumps (`static/walk.js`,
tested by `tests/js/walk.test.mjs`). Nothing new is learned or stored: the same skeleton is posed
every frame, so the body, the clothes, hair, shoes and tattoos (all skinned with the body's
weights) go along on their own.

- **Where the body is.** `Skeleton.place` turns the whole skeleton about its root and moves it;
  every bone's skinning transform includes it. Keys are read the way the camera looks: W is away
  from the camera, A to its left. The body turns to face the way it goes (turning on the spot
  before it walks off) and the camera moves with it, not with the jump, so the floor stays put.
- **The walk cycle** is normal gait's joint angles, simplified (Perry & Burnfield, *Gait Analysis*,
  2010): the hip from 30° forward to 10° back, the knee bent 15° as the heel takes the weight and
  60° in the swing, the ankle up before push-off and down at toe-off, each arm swinging against the
  leg on its side, the chest turning against the hips. The cycle's speed comes from the length of
  the legs (a stride is how far a foot travels under the hip), so the foot on the floor barely
  slides. The arms come in from the A-pose, but only as far as they swing clear of the trunk.
- **On the floor.** After the joints are set, the body is lowered or raised so its lowest foot is at
  the floor's height in the scan: it bobs with each step and sinks into a crouch.
- **The jump**: a crouch and push (0.22 s), then a throw: up at the speed that reaches 20 % of the
  person's height under real gravity, legs tucking and arms swinging up, then a landing crouch. A
  jump while walking carries on forward.
- **Arms and knees.** Q / E raise the left / right arm (straight up, like the Arms up pose), Z / C
  the left / right knee (thigh level, shin hanging, standing on the other foot), the body's own left
  and right. Like a game's emote keys they stay until pressed again, with no key held; arms stay up
  while walking, a knee comes down to walk, and one knee at a time. Keyboard games that move single
  limbs either give each limb a key (QWOP: a key per thigh and calf) or hold a button per arm
  (Human: Fall Flat, Gang Beasts: a mouse button raises that arm). Holding was the complaint here,
  and the mouse already turns the camera, so these are toggles.
- **The Guide** (top bar, or ?) lists every control in a card, keys on the left and a line on what
  each does, grouped as a game's controls screen is: move, arms and legs, camera, panels.
- **The panel's pose stays.** The walk is blended over the pose set in the panel (or a preset), and
  the body goes back to it when it stops, where it got to, except that arms held out as in the
  scan come down by the sides (the A-pose is for the capture, not for standing about) and stay
  down; that pose, not a step of the walk, is what is kept. Changing the pose in the panel stops the walk first. **R** brings the body back to
  where it was scanned.

Limits: one walking speed, no running; a foot slides a little at the start and end of a walk (the
legs blend in and out rather than taking a first and last step); with the panel's pose far from
standing (sitting) the walk is still a walk. The pelvis turns about 5° each way with the step and
rocks over the planted foot, but the spine doesn't counter it beyond the chest's turn, so the steps
look a little stiff.

## Limits

- **A-pose capture needed.** Arms touching the body or legs together make the skeleton fail (with
  advice) or the weights leak between the touching parts.
- **Skin bulges and folds by rule, not by learning.** The biceps, deltoid, forearm and calf swell and
  bent skin presses together (see above and [flesh.md](flesh.md)), but muscles don't slide under the
  skin and a crease doesn't wrinkle. Real deformation needs a model learned from moving people.
- **Clothing moves like skin.** A loose shirt bends with the arm as if it were skin.
- **Hands and feet are one piece each.** No fingers or toes.
- **Lighting is baked in.** The tattoo picks up the skin colour under it, including baked-in shadows,
  but a moved arm keeps the light it had in the scan.
- **A design is laid like a transfer, from the point you tap.** On strongly curved skin (a thin
  forearm, the buttocks) a large design bends the way a sticker would; where it wraps around the
  side of the body, its far part is out of sight from behind, as on a real body. A design centred in
  the gap between the legs wraps into the crotch rather than across the air.

What the skin does beyond the bones (contact shading, bulges, stretch, the push out of the body
for clothes, the swing of loose things), the shadow on the floor and the "what if" sliders:
[flesh.md](flesh.md).
