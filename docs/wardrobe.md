# Wardrobe

Clothes, shoes, hair and a hat to try on a scanned body, from a shop of racks and shelves around it
while the **Try on** panel is open. Experimental.

## What you can try on

29 items, all MakeHuman's own assets (CC0, listed in [CREDITS.md](../CREDITS.md)):

| Kind | Items |
|---|---|
| Outfits, Women's | T-shirt and jeans, T-shirt and denim shorts, striped shirt and skirt, crop top and leggings |
| Outfits, Unisex | long-sleeve top and jeans, loose T-shirt and jeans, white T-shirt and jeans, jacket and jeans, overalls |
| Outfits, Men's | denim shirt and jeans, striped shirt and jeans, suit |
| Shoes | brown shoes, leather shoes, dress shoes, white sneakers, blue sneakers, worn sneakers |
| Hair | short dark, short brown, side part, slicked back, afro, dark bob, blonde bob, long, ponytail, braid |
| Hat | fedora |

Every item is fitted to the body it is put on, so anything can be worn by anyone ("Women's" and
"Men's" only say who the outfit was cut for). One item per kind is worn at a time.

## The shop around the body

While the Try on panel is open the items are shown around the body, not listed in the panel:

| Where | What | How it is shown |
|---|---|---|
| Clothes rail, behind on the left | suit, shirts with jeans, jacket, overalls, shirt and skirt | on a hanger: the arms turned down to the sides, the legs together, the cloth a little flatter |
| Shoe rack, in front of the rail | the 6 pairs | the two shoes side by side, toes a little down toward you |
| Shelves, behind on the right | T-shirts, long-sleeve top, crop top with jeans, shorts or leggings | folded: legs folded together along the inside seam, sleeves folded back, then folded in zigzags from the collar into a flat stack, chest on top |
| Shelves, above | 7 short hairstyles | on a mannequin head (MakeHuman's own head and neck) |
| Stands, at the right | long hair, ponytail, braid, the fedora | on a mannequin head on a pole (too long for a shelf) |

How each outfit is shown is chosen in `wardrobe.py` (`FOLDED`, `LONG_HAIR`): what a shop folds
(T-shirts, knitwear, sportswear) is folded, what has a collar, a jacket, a skirt or bibs is hung.
The layout and each shape are worked out in `static/racks.js` (tested by `tests/js/racks.test.mjs`:
no two items in each other's place, none in the body's, each on its shelf and under the next).

- **Pointing** at an item names it; **clicking** it puts it on (a drag still turns the camera, and a
  click on the body is never taken for the rack behind it). What is worn stays in its place as a
  pale outline (its own shape, washed out) and is listed at the top of the panel. Clicking the
  outline, or its ✕ in the panel, takes it off; **Take everything off** undresses the body at once.
  Nothing has to be put on to take something off.
- **The items are shown as they are made**, on MakeHuman's base mesh (`GET /api/wardrobe/<id>/shape`,
  the same for every body), sized to the person's height. They are fitted only when worn.
- **Plain meshes, not splats.** Spark sorts every splat it draws each time the view turns: a body
  is 150–300k splats and what it wears adds tens of thousands. The 29 items as splats would add
  about as many again as the body. The racks and items are ordinary three.js meshes with their
  textures, lit by two lights of their own. They stand apart from the body, so none of them cuts
  through its splats (the reason clothes on the body are splats).
- **The camera takes the shop in**: with the panel open it starts far enough back to see the whole
  shop around the body (scroll to come closer).

## How an item gets on a person

MakeHuman's clothes are made for its base mesh (hm08, 13 380 skin vertices): each vertex of a
garment is a point on a triangle of the base mesh plus a small offset (the `.mhclo` binding).
So once the base mesh is laid on a scan, the same rule puts every garment on that person.

1. **Fit the base mesh to the scan** (`fit.py`, once per body, saved as `<body>.fit.json`).
   - The skeleton is found on the base mesh with the same code that finds it on the scan
     (`rig.py`), so the two have the same joints.
   - The base mesh first takes the person's build: MakeHuman's own body-shape sliders (54 CC0
     targets: sex, muscle and weight, bust and cup, waist, hips, stomach, buttocks, torso width and
     depth, neck, upper arm, thigh and calf girths) are set to what best matches the scan. This is
     the shape space NAVER's Anny model uses, solved without PyTorch: the targets are linear, so
     it is a non-negative least-squares solve of how far each skin vertex is from the splats along
     its normal (every third vertex, weighted by its area, sliders pulled lightly towards 0), done
     three times as the mesh settles, after the bones below are fitted. The helper geometry
     clothes and hair hang from (tights, skirt, hair cap) changes shape with it. The values found
     are saved in the fit as `shape`. Lengths are left to the bones.
   - Each bone of the base mesh is turned onto the scan's bone, stretched along it to the scan's
     bone length and scaled across by the ratio of heights. The vertices follow with the base
     mesh's own skin weights (linear blend).
   - Then each skin vertex moves along its normal to the nearest layer of opaque splats, in two
     passes (6% then 2.5% of the person's height), with the moves smoothed over the mesh, so the
     base mesh takes the person's own shape: belly, chest, hips.
   - On the MakeHuman test body in three shapes, the fitted skin is a median 0.3–0.4 cm from the
     true surface, 99% of it within about 1.2 cm (`tests/unit/test_wardrobe.py`). The shape step
     brings 90% of the skin within 0.7–0.8 cm, from 0.8–0.9 cm without it; before the last step
     (the moves along the normals) it matters more: on the slim body 99% of the skin is within
     1.5 cm, from 4.2 cm. The test also checks the solve picks the very target the heavy and slim
     test bodies were made with.
2. **Put the item on the fitted mesh** (`wardrobe.py`, per request). MakeHuman's rule: the
   offsets are scaled by how wide, deep and tall the body is at three pairs of reference
   vertices, and turned with the limb they sit on.
3. **Draw it as splats** (`static/dress.js`). About one flat disc per 6 mm on its surface, coloured
   from its texture (with MakeHuman's ambient occlusion baked in, so folds read as folds) and
   lit a little from above and in front, with the normal smoothed over the item (flat-shaded
   triangles showed as grey facets on a white shirt). Hair is drawn denser, and see-through parts
   of its cards get no splats.
   - An outfit is one piece with layers: the jeans' dark waistband runs under the shirt's hem, and
     showed through the gaps between the shirt's splats as grey dots. A splat is left out when
     the line out from it meets the item again within about 4.5 cm, on a part hanging from the
     same skin (so a sleeve beside the chest is kept).
   - **A hat goes over the hair.** MakeHuman's hats are made for a bald head, and the strands came
     out through the crown. When hair is worn, the hat is scaled about its brim's height just
     enough for its crown to hold the hair above the brim (up to half as big again), and fitted
     again when the hair changes.
4. **Move it with the body.** Each splat takes the skin weights of the skin it hangs from: the
   point of the fitted mesh it is bound to, without its offset (its anchor), and the skin vertex
   nearest that. Weights looked up where the splat itself is went wrong off the skin: beside the
   chest under the armpit the nearest bone is the upper arm, so a shirt's sides took the arm's
   motion and flew out up to 23 cm with the arms raised. Bound to their skin they stay within 4 cm
   of it in every pose (99% of splats), and across the armpit they bridge the hollow.
   - The weights are then smoothed over the item's own surface. Skin shears where one bone hands
     over to the next, cloth doesn't: under a raised arm, splats that each copied the skin under
     them pulled apart into loose flakes, the sleeve going with the arm and the side with the chest.
   - **Stretched cloth grows its splats.** Raising the arms stretches the cloth under them to about
     twice its size at rest (up to 4 to 6 times in the armpit), and splats sized for the cloth at
     rest left gaps between them. After each pose, each splat grows by how far its two nearest
     neighbours at rest have moved from it (up to 3 times its size), and shrinks back when they
     come back. While the body walks this runs a few times a second.
5. **Hide the skin under it.** A skin vertex of the fitted mesh is covered when MakeHuman's list
   for the garment has it, or when the line out from the skin along its normal meets the garment
   within 4% of the person's height (7 cm). MakeHuman's list alone leaves out skin that a loose
   garment hangs over, like the thighs under a skirt, and the scan's skin there showed through.
   Every splat of the body is matched to its nearest fitted skin vertex once; the body's splats
   on covered vertices are hidden while the item is worn, and shown again when it comes off.
6. **Colour the scalp under hair.** Hair is cards with see-through strands, so hiding the skin
   under it would leave holes, and the scan's skin between the strands made the head look bald
   with the hair floating off it. The splats of the skin within 2 cm under the hair take the
   hair's average colour instead (keeping their light and shade).
7. **Tattoos stay under clothes**: ink is splats in the skin, sorted with the clothes' splats, and
   where the body's skin is hidden under an item, the ink in that skin is hidden with it (each ink
   splat follows the body splat nearest it), so a tight sleeve hides it the way it hides the skin.

Why splats and not a mesh: the body is splats, and Spark sorts and blends everything it draws
together. A mesh in the same scene would cut through the splats wrongly at every edge.

## Limits

- **Hair is drawn over the head.** It can't remove hair that was filmed loose over the shoulders,
  so the filming guide asks for long hair tied back.
- **One layer.** A jacket can't go over a tee; each outfit is one piece.
- **Loose clothes on the scan** confuse the fit (it finds the clothes' surface, not the skin).
  Film in tight clothes or underwear.
- **No cloth simulation.** Skirts and loose sleeves move rigidly with the nearest bone, so they can
  pass through a thigh in a sitting pose.
- **Only CC0 items for now.** CC-BY packs from the MakeHuman community (more hairstyles, dresses,
  more shoes) need their author credited; they will be added with entries in `CREDITS.md`.

## Remaking the packed data

```bash
python3 scripts/wardrobe_pack.py MAKEHUMAN_DATA BASE_OBJ
```

`MAKEHUMAN_DATA` is a MakeHuman 1.1 data folder (Ubuntu's `makehuman-data` 1.1.1 package has one in
`usr/share/makehuman/data`), `BASE_OBJ` is `makehuman/data/3dobjs/base.obj` from the MakeHuman
repository. Needs ffmpeg for the textures. To add an item: add a line to `CATALOG` in
`wardrobe.py`, its names to `static/i18n.js` (English and Portuguese) and a row to `CREDITS.md`,
then run the script.

## What comes next

See `roadmap-wardrobe.md` in the project files: CC-BY packs, layering, then garments made
from a picture or a pattern (GarmentCode, TRELLIS.2).

How clothes stay out of the body, crease, swing and look like fabric: [flesh.md](flesh.md).
