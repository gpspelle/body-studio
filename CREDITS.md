# Credits

Everything you can try on in Body Studio (clothes, shoes, hair and the hat) comes from
[MakeHuman](https://github.com/makehumancommunity/makehuman), made by the MakeHuman team and
released under **CC0 1.0 Universal** (public domain): anyone may use, change and share them, with
no conditions. They are credited here all the same, because they are the work of the people who
made them.

Each item was converted for Body Studio: its binding to MakeHuman's base mesh and its triangles
packed into `src/body_studio/wardrobe/`, its texture scaled down (with the ambient occlusion
multiplied in) into `src/body_studio/static/wardrobe/`, by `scripts/wardrobe_pack.py`. The
base mesh (hm08) the items are fitted to is MakeHuman's too, also CC0, and so are the 54
body-shape targets it is shaped with (`targets.npz` in the data folder, packed into
`src/body_studio/wardrobe/shapes.json.gz`).

Source: the system assets of MakeHuman 1.1 (`makehuman/data` in the MakeHuman repository; the
same files are in Ubuntu's `makehuman-data` 1.1.1 package). Licence: section C of
[MakeHuman's LICENSE.md](https://github.com/makehumancommunity/makehuman/blob/master/LICENSE.md)
and [LICENSE.ASSETS.md](https://github.com/makehumancommunity/makehuman/blob/master/LICENSE.ASSETS.md).
Older copies of these files carry an AGPL header from 2016; MakeHuman released all its bundled
assets under CC0 since.

| Item | Kind | MakeHuman file | Author | Licence |
|---|---|---|---|---|
| T-shirt and jeans | Outfit | `clothes/female_casualsuit01/female_casualsuit01.mhclo` | MakeHuman team | CC0 1.0 |
| T-shirt and denim shorts | Outfit | `clothes/female_casualsuit02/female_casualsuit02.mhclo` | MakeHuman team | CC0 1.0 |
| Striped shirt and skirt | Outfit | `clothes/female_elegantsuit01/female_elegantsuit01.mhclo` | MakeHuman team | CC0 1.0 |
| Crop top and leggings | Outfit | `clothes/female_sportsuit01/female_sportsuit01.mhclo` | MakeHuman team | CC0 1.0 |
| Long-sleeve top and jeans | Outfit | `clothes/male_casualsuit02/male_casualsuit02.mhclo` | MakeHuman team | CC0 1.0 |
| Loose T-shirt and jeans | Outfit | `clothes/male_casualsuit04/male_casualsuit04.mhclo` | MakeHuman team | CC0 1.0 |
| White T-shirt and jeans | Outfit | `clothes/male_casualsuit06/male_casualsuit06.mhclo` | MakeHuman team | CC0 1.0 |
| Jacket and jeans | Outfit | `clothes/male_casualsuit05/male_casualsuit05.mhclo` | MakeHuman team | CC0 1.0 |
| Overalls | Outfit | `clothes/male_worksuit01/male_worksuit01.mhclo` | MakeHuman team | CC0 1.0 |
| Denim shirt and jeans | Outfit | `clothes/male_casualsuit01/male_casualsuit01.mhclo` | MakeHuman team | CC0 1.0 |
| Striped shirt and jeans | Outfit | `clothes/male_casualsuit03/male_casualsuit03.mhclo` | MakeHuman team | CC0 1.0 |
| Suit and tie | Outfit | `clothes/male_elegantsuit01/male_elegantsuit01.mhclo` | MakeHuman team | CC0 1.0 |
| Brown shoes | Shoes | `clothes/shoes01/shoes01.mhclo` | MakeHuman team | CC0 1.0 |
| Leather shoes | Shoes | `clothes/shoes04/shoes04.mhclo` | MakeHuman team | CC0 1.0 |
| Black dress shoes | Shoes | `clothes/shoes03/shoes03.mhclo` | MakeHuman team | CC0 1.0 |
| White sneakers | Shoes | `clothes/shoes05/shoes05.mhclo` | MakeHuman team | CC0 1.0 |
| Blue sneakers | Shoes | `clothes/shoes06/shoes06.mhclo` | MakeHuman team | CC0 1.0 |
| Worn sneakers | Shoes | `clothes/shoes02/shoes02.mhclo` | MakeHuman team | CC0 1.0 |
| Short, dark | Hair | `hair/short01/short01.mhclo` | MakeHuman team | CC0 1.0 |
| Short, brown | Hair | `hair/short02/short02.mhclo` | MakeHuman team | CC0 1.0 |
| Side part | Hair | `hair/short03/short03.mhclo` | MakeHuman team | CC0 1.0 |
| Slicked back | Hair | `hair/short04/short04.mhclo` | MakeHuman team | CC0 1.0 |
| Afro | Hair | `hair/afro01/afro01.mhclo` | MakeHuman team | CC0 1.0 |
| Bob, dark | Hair | `hair/bob01/bob01.mhclo` | MakeHuman team | CC0 1.0 |
| Bob, blonde | Hair | `hair/bob02/bob02.mhclo` | MakeHuman team | CC0 1.0 |
| Long | Hair | `hair/long01/long01.mhclo` | MakeHuman team | CC0 1.0 |
| Ponytail | Hair | `hair/ponytail01/ponytail01.mhclo` | MakeHuman team | CC0 1.0 |
| Braid | Hair | `hair/braid01/braid01.mhclo` | MakeHuman team | CC0 1.0 |
| Fedora | Hat | `clothes/fedora01/fedora.mhclo` | MakeHuman team | CC0 1.0 |

Items from other authors (for example CC-BY packs from the MakeHuman community asset site) will
be added to this table with their author's name and licence before they ship.

## Decor from a photo

Things made from a photo in the Decor panel are made on your computer by
[TripoSR](https://github.com/VAST-AI-Research/TripoSR) by Tripo AI and Stability AI, released under
the **MIT License** (its code and its weights). Body Studio doesn't include it: `body-studio setup`
(or the first photo) downloads its code at a pinned commit and its weights from Hugging Face
(`stabilityai/TripoSR`). The thing is cut out of the photo with [rembg](https://github.com/danielgatis/rembg)
(MIT) and its U²-Net model (Apache 2.0). The starters (chairs, tables, the arch, flowers…) are drawn
by Body Studio itself.

## Styled outfits and accessories

Made for Body Studio by `scripts/wardrobe_styles.py` and released under **CC0 1.0** like the
rest: the outfits are MakeHuman's (above) with new textures painted from theirs, the accessories
are built from MakeHuman's base mesh.

| Item | Kind | Made from | Licence |
|---|---|---|---|
| Tie-dye T-shirt and jeans | Outfit | Loose T-shirt and jeans | CC0 1.0 |
| Flower shirt and long skirt | Outfit | Striped shirt and skirt | CC0 1.0 |
| Black leather jacket and jeans | Outfit | Jacket and jeans | CC0 1.0 |
| Band T-shirt and black jeans | Outfit | White T-shirt and jeans | CC0 1.0 |
| Black top and tartan skirt | Outfit | Striped shirt and skirt | CC0 1.0 |
| Black top and tartan trousers | Outfit | Long-sleeve top and jeans | CC0 1.0 |
| Flannel shirt and jeans | Outfit | Denim shirt and jeans | CC0 1.0 |
| Breton stripes and jeans | Outfit | T-shirt and jeans | CC0 1.0 |
| Mustard beanie | Hat | the base mesh's head | CC0 1.0 |
| Black beanie | Hat | the base mesh's head | CC0 1.0 |
| Woven headband | Hat | the base mesh's head | CC0 1.0 |
| Round glasses | Glasses | rings and rods by the base mesh's eyes | CC0 1.0 |
| Round tinted shades | Glasses | rings and rods by the base mesh's eyes | CC0 1.0 |
| Black sunglasses | Glasses | rings and rods by the base mesh's eyes | CC0 1.0 |
| Bead necklace | Necklace | beads round the base mesh's neck | CC0 1.0 |
| Silver chain | Necklace | a rod round the base mesh's neck | CC0 1.0 |
| Studded choker | Necklace | a band round the base mesh's neck | CC0 1.0 |

## The tattoo studio

The sample tattoo studio (`sample_studio.py`) and the twelve starter designs on its flash wall
(`src/body_studio/static/flash/`: rose, swallow, anchor, heart, dagger, snake, moth, mandala,
geometric, wave, sun, lightning) are drawn by Body Studio itself and released under **CC0 1.0**.
