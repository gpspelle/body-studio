# Wardrobe

Clothes, shoes, hair and a hat to try on a scanned body, in the **Try on** panel. Experimental.

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

"Women's" and "Men's" say who the outfit was cut for, nothing more: every item is fitted to the
body it is put on, so anything can be worn by anyone. The filter only shortens the list.
One item per kind is worn at a time.

## How an item gets on a person

MakeHuman's clothes are made for its base mesh (hm08, 13 380 skin vertices): each vertex of a
garment is a point on a triangle of the base mesh plus a small offset (the `.mhclo` binding).
So once the base mesh is laid on a scan, the same rule puts every garment on that person.

1. **Fit the base mesh to the scan** (`fit.py`, once per body, saved as `<body>.fit.json`).
   - The skeleton is found on the base mesh with the same code that finds it on the scan
     (`rig.py`), so the two have the same joints.
   - Each bone of the base mesh is turned onto the scan's bone, stretched along it to the scan's
     bone length and scaled across by the ratio of heights. The vertices follow with the base
     mesh's own skin weights (linear blend).
   - Then each skin vertex moves along its normal to the nearest layer of opaque splats, in two
     passes (6% then 2.5% of the person's height), with the moves smoothed over the mesh, so the
     base mesh takes the person's own shape: belly, chest, hips.
   - On the MakeHuman test body in three shapes, the fitted skin is a median 0.3–0.4 cm from the
     true surface, 99% of it within about 2 cm (`tests/unit/test_wardrobe.py`).
2. **Put the item on the fitted mesh** (`wardrobe.py`, per request). MakeHuman's rule: the
   offsets are scaled by how wide, deep and tall the body is at three pairs of reference
   vertices, and turned with the limb they sit on.
3. **Draw it as splats** (`static/dress.js`). About one flat disc per 6 mm on its surface, coloured
   from its texture (with MakeHuman's ambient occlusion baked in, so folds read as folds) and
   lit a little from above and in front. Hair is drawn denser, and see-through parts of its
   cards get no splats.
4. **Move it with the body.** Its splats take the body's skin weights where they are, so the
   pose moves the clothes exactly as it moves the skin under them.
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
7. **Keep tattoos under clothes.** Ink is drawn over the splats, and splats don't hide what is
   drawn after them, so each point of a tattoo is checked against the covered skin and left out
   where something is worn over it: a tattoo half under a sleeve stops at the cuff.

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
