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
| Anny (NAVER Labs, 2025) | Apache-2.0, built on MakeHuman | Possible later; needs PyTorch to fit |
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
- The upper arm's weight fades out over about 10 cm past the armpit crease (the plane through the
  shoulder joint halfway between the arm and the side of the body), so the shoulder blade and the
  side of the chest follow the trunk: with the arms raised, the back doesn't swing out into wings
  (and a back piece isn't stretched with it). The skin over the shoulder itself still bunches up.
- On the page, each splat takes the trilinear blend of the voxels around it, each voxel counted by
  how much its bones agree with the blend of all eight, so a voxel that belongs to another body part
  (across the gap between the thighs) drops out, while along the skin the weights change smoothly
  (a hard switch from one bone to the next tears the skin open at the armpit when the arm moves).
  The four weights are rounded down to bytes and the remainder goes to the strongest bone, so they
  always add up to exactly one.

## Joints that move like a person's

Each joint has its own axes and anatomical motions (flex/extend, sideways, twist), with ranges of
motion from the clinical references (AAOS; Soucie et al., *Range of motion measurements*, 2011).
The right side mirrors the left.

| Joint | Motions (degrees from the anatomical position) |
|---|---|
| Shoulder | forward −50…180, out −30…180, twist −90…70 |
| Elbow | bend 0…145, twist −80…80 (a hinge: no sideways) |
| Wrist | bend −70…80, side −30…20 |
| Hip | forward −20…120, out −25…45, twist −45…40 |
| Knee | bend 0…145 (a hinge) |
| Ankle | foot −50…20, side ±10, tilt −15…30 |
| Spine, chest, neck, head | forward, side and twist, a few tens of degrees each |
| Collarbone | raise −10…30, forward ±15 |

The scan's own pose is measured and always allowed. A rotation is a swing (limited by an ellipse
between the two swing ranges) followed by a twist about the bone. Dragging a dot aims the bone at
the pointer and keeps its twist; the angle is then clamped to the joint's range.

The splats are moved by **dual quaternion skinning** (Kavan et al., 2007), which Spark implements
for splats (`SplatSkinning`). Unlike plain linear blending it doesn't collapse a bent elbow or a
twisted forearm into a "candy wrapper".

## The tattoo

- **Size**: real centimetres, from the person's height (the panel asks; it uses the height of the
  person whose Progress history holds this body, or 170 cm).
- **Placement**: a *discrete exponential map* (Schmidt, Grimm & Wyvill, *Interactive Decal
  Compositing with Discrete Exponential Maps*, SIGGRAPH 2006), the way decals are laid on meshes and
  point clouds. The opaque splats are averaged into cells of about 7 mm (each with a normal, set on
  the outside of the splats' few-millimetre scatter). From the point tapped, a shortest-path walk
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
    every ink splat lies on the skin (within 1 cm of it) and stays next to the skin it was put on,
    and that the body's splats under it take the ink.
- **Ink is splats**: the image becomes about 40,000 small flat splats spread over its inked pixels
  (once per image; moving, turning or resizing the tattoo only moves them). Each lies on the skin,
  among the skin's own splats, coloured like the skin under it darkened by the ink (a tattoo darkens
  skin, it doesn't paint over it; black ink reads as deep blue-grey, like healed ink), and skinned on
  the GPU by Spark with the skin weights of where it is. The body's own splats under the design
  (within 1 cm in or out of the skin) are darkened by the same ink, and get their colour back when
  the tattoo moves away: a scan's skin is a shell of splats a few millimetres thick, so either an ink
  splat or a skin splat can be in front at any pixel, and both show the ink. So there is one
  body: whatever hides the skin hides the ink (an arm in front, the other side of the body, clothes,
  a fold at a bent joint), and nothing else has to agree with it. An earlier version drew the ink as
  a mesh over the splats, with its own weights, a stand-in body for depth and a mask for clothes;
  each disagreement between those showed as a bug (stray lines, a design missing its head).
  Designs drawn on white (most JPGs) have the white removed and are cropped.
- **Skinning**: the outline shown while editing is the border of the grid, moved on the CPU by the
  same dual quaternion blend as Spark's shader.

## Limits

- **A-pose capture needed.** Arms touching the body or legs together make the skeleton fail (with
  advice) or the weights leak between the touching parts.
- **Skin doesn't bulge or crease.** Bending the elbow doesn't swell the biceps; skin at a sharply bent
  knee or hip folds into itself. Real deformation needs a model learned from moving people.
- **Clothing moves like skin.** A loose shirt bends with the arm as if it were skin.
- **Hands and feet are one piece each.** No fingers or toes.
- **Lighting is baked in.** The tattoo picks up the skin colour under it, including baked-in shadows,
  but a moved arm keeps the light it had in the scan.
- **A design is laid like a transfer, from the point you tap.** On strongly curved skin (a thin
  forearm, the buttocks) a large design bends the way a sticker would; where it wraps around the
  side of the body, its far part is out of sight from behind, as on a real body. A design centred in
  the gap between the legs wraps into the crotch rather than across the air.
