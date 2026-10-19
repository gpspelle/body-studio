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
4. **The tattoo** is a grid laid on the skin by arc length, carried by the same weights and the
   same blend as the splats, and drawn as ink (it multiplies the skin colour under it).

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
- On the page, each splat takes the trilinear blend of the voxels around it, but only from voxels
  that belong to the same body part (no blending across the gap between the thighs).

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
- **Placement**: a surface map gives the radius of the body around an axis at every length and
  angle, from the splats. The trunk has one map from below the pelvis to the neck, and each leg one
  from the buttock to the ankle, so a back piece or a thigh piece is laid on one surface; arms (bent
  at the elbow even in an A-pose) use each bone's own map, which reaches well past both ends. The
  image is laid along that surface by arc length, so it wraps around a forearm or across the back
  without stretching; its top points toward the head and it is never mirrored.
- **Skinning**: every point of the grid gets skin weights from the same voxels as the splats and is
  moved by the same dual quaternion blend (computed on the CPU, matched to Spark's shader), so the
  tattoo stays glued to the skin when a joint moves.
- **Ink**: drawn after the splats with multiply blending (a tattoo darkens skin, it doesn't paint
  over it); black ink reads as deep blue-grey, like healed ink. Designs drawn on white (most JPGs)
  have the white removed and are cropped.
- **Hidden behind the body**: the splats don't write depth (a moved splat is sorted late, so writing
  depth would punch holes at its soft edges). Instead a stand-in, a dot per opaque splat skinned on
  the GPU with the same blend, writes depth only, just before the ink. Each dot is pushed back about
  2 cm, so where the skin turns away (the flanks, under the arms) the dots don't cover ink lying on
  the skin; ink still hides behind an arm or the other side of the body.

## Limits

- **A-pose capture needed.** Arms touching the body or legs together make the skeleton fail (with
  advice) or the weights leak between the touching parts.
- **Skin doesn't bulge or crease.** Bending the elbow doesn't swell the biceps; skin at a sharply bent
  knee or hip folds into itself. Real deformation needs a model learned from moving people.
- **Clothing moves like skin.** A loose shirt bends with the arm as if it were skin.
- **Hands and feet are one piece each.** No fingers or toes.
- **Lighting is baked in.** The tattoo picks up the skin colour under it, including baked-in shadows,
  but a moved arm keeps the light it had in the scan.
- **Very large designs are cut at the map's edge.** A back piece can run from the buttocks to the
  neck, but not onto the arms or the head; a sleeve from shoulder to wrist is cut about halfway down
  the forearm. Use two tattoos. Where a design wraps around the side of the body, its far part is
  out of sight from behind, as on a real body.
