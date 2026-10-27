"""Decor for a room: things to put round the body in a scanned room (a wedding venue, a living
room), and the layouts they are put in. Design: docs/decor.md.

    body-studio decor PHOTO [--height 80] [--name "Arch"]   a 3D object from one photo (photo3d.py)
    body-studio decor --list                                the inventory

Two kinds of item:

- Starters, drawn by the page (static/decor.js): chairs, tables, place settings, an arch, a bar,
  string lights... in metres, in a few colours. Listed here so the inventory is one list.
- Made from a photo (an Instagram picture, a shop's photo): photo3d.py turns it into a coloured
  mesh with TripoSR on this computer. The mesh is kept here at a height of 1 (the page scales it to
  the item's height in metres), standing on y = 0, centred over x = z = 0, its front toward +z.

Everything lives in decor/ in the data folder:

    decor/items/<id>/item.json    {id, name, height, on, status (working, ready, failed), error, code}
                                  or a changed starter kept: {id (v...), kind "variant", name, base, colour, opts}
    decor/items/<id>/photo.<ext>  the photo it was made from
    decor/items/<id>/mesh.json    the mesh, packed (pack()): what the page draws
    decor/layouts/<room>.json     {current, layouts: [{name, items: [{item, x, y, z, turn, colour, opts}]}]}

Layouts are in the room map's metres (room.py): x and z along the floor, y up from it.
"""
from __future__ import annotations

import argparse
import base64
import json
import math
import re
import struct
import sys
import threading
import time
from pathlib import Path

DIR = "decor"
PHOTO_EXT = {".jpg", ".jpeg", ".png", ".webp"}
MAX_PHOTO = 40 * 1024 ** 2
HEIGHT = (0.02, 6.0)            # m: the heights an item may have
CELLS = 160                     # the mesh is simplified to at most this many cells across its height
MAX_ITEMS = 2000                # placed items in one layout
MAX_LAYOUTS = 40
COLOURS = ("white", "ivory", "gold", "wood", "green", "blush", "black", "coral", "rattan", "copper", "blue")
MATERIALS = ("cloth", "satin", "wood", "metal", "glass")   # what a starter's own colour may be made of
MAX_OPTS = 12

# The page draws these (static/decor.js STARTERS has the same ids, in the same groups). on: "floor",
# or "top" (stands on a table or anything else with a top). The names are the page's (i18n
# "decor.item.<id>", "decor.group.<group>"). A wedding first: tables and seating, what goes on the
# tables, flowers and the ceremony, the bar, lights, a lounge and the dance floor; then the flower
# shop.
STARTERS = (
    {"id": "chair", "group": "tables", "height": 0.9, "on": "floor"},
    {"id": "round_table", "group": "tables", "height": 0.76, "on": "floor"},
    {"id": "long_table", "group": "tables", "height": 0.76, "on": "floor"},
    {"id": "arch", "group": "ceremony", "height": 2.36, "on": "floor"},
    {"id": "pillar", "group": "ceremony", "height": 1, "on": "floor"},
    {"id": "runner", "group": "ceremony", "height": 0.01, "on": "floor"},
    {"id": "flowers", "group": "table", "height": 0.45, "on": "top"},
    {"id": "candle", "group": "table", "height": 0.3, "on": "top"},
    {"id": "lantern", "group": "lights", "height": 0.5, "on": "floor"},
    {"id": "cross_back_chair", "group": "tables", "height": 0.9, "on": "floor"},
    {"id": "bench", "group": "tables", "height": 0.45, "on": "floor"},
    {"id": "square_table", "group": "tables", "height": 0.76, "on": "floor"},
    {"id": "cocktail_table", "group": "tables", "height": 1.1, "on": "floor"},
    {"id": "sweetheart_table", "group": "tables", "height": 0.79, "on": "floor"},
    {"id": "place_setting", "group": "table", "height": 0.19, "on": "top"},
    {"id": "centrepiece", "group": "table", "height": 0.245, "on": "top"},
    {"id": "tall_centrepiece", "group": "table", "height": 0.94, "on": "top"},
    {"id": "candelabra", "group": "table", "height": 0.72, "on": "top"},
    {"id": "bud_vases", "group": "table", "height": 0.24, "on": "top"},
    {"id": "table_number", "group": "table", "height": 0.21, "on": "top"},
    {"id": "cake", "group": "table", "height": 0.6, "on": "top"},
    {"id": "champagne_tower", "group": "table", "height": 0.52, "on": "top"},
    {"id": "moon_arch", "group": "ceremony", "height": 2.36, "on": "floor"},
    {"id": "chuppah", "group": "ceremony", "height": 2.44, "on": "floor"},
    {"id": "flower_wall", "group": "ceremony", "height": 2.4, "on": "floor"},
    {"id": "flower_stand", "group": "ceremony", "height": 1.37, "on": "floor"},
    {"id": "aisle_flowers", "group": "ceremony", "height": 0.41, "on": "floor"},
    {"id": "welcome_sign", "group": "ceremony", "height": 1.6, "on": "floor"},
    {"id": "bar", "group": "bar", "height": 1.1, "on": "floor"},
    {"id": "back_bar", "group": "bar", "height": 2, "on": "floor"},
    {"id": "bar_stool", "group": "bar", "height": 0.76, "on": "floor"},
    {"id": "buffet", "group": "bar", "height": 0.98, "on": "floor"},
    {"id": "string_lights", "group": "lights", "height": 2.8, "on": "floor"},
    {"id": "light_pole", "group": "lights", "height": 3, "on": "floor"},
    {"id": "chandelier", "group": "lights", "height": 3.2, "on": "floor"},
    {"id": "fairy_curtain", "group": "lights", "height": 2.41, "on": "floor"},
    {"id": "uplight", "group": "lights", "height": 0.2, "on": "floor"},
    {"id": "sofa", "group": "lounge", "height": 0.82, "on": "floor"},
    {"id": "armchair", "group": "lounge", "height": 0.82, "on": "floor"},
    {"id": "coffee_table", "group": "lounge", "height": 0.42, "on": "floor"},
    {"id": "rug", "group": "lounge", "height": 0.01, "on": "floor"},
    {"id": "dance_floor", "group": "lounge", "height": 0.02, "on": "floor"},
    # the flower shop, and what its flowers stand among (from a beach wedding's photos)
    {"id": "calla_vase", "group": "flowers", "height": 0.92, "on": "top"},
    {"id": "gerbera_posy", "group": "flowers", "height": 0.24, "on": "top"},
    {"id": "baby_breath_bank", "group": "flowers", "height": 0.52, "on": "floor"},
    {"id": "tropical_bank", "group": "flowers", "height": 0.97, "on": "floor"},
    {"id": "floral_ring", "group": "flowers", "height": 2.67, "on": "floor"},
    {"id": "table_garland", "group": "flowers", "height": 0.23, "on": "top"},
    {"id": "floating_candles", "group": "flowers", "height": 0.36, "on": "top"},
    {"id": "grass_vase", "group": "flowers", "height": 0.46, "on": "top"},
    {"id": "orchid_pot", "group": "flowers", "height": 0.62, "on": "top"},
    {"id": "hydrangea_bowl", "group": "flowers", "height": 0.29, "on": "top"},
    {"id": "pampas_vase", "group": "flowers", "height": 1.65, "on": "floor"},
    {"id": "floor_arrangement", "group": "flowers", "height": 0.69, "on": "floor"},
    {"id": "petals", "group": "flowers", "height": 0.01, "on": "floor"},
    {"id": "wildflower_jar", "group": "flowers", "height": 0.42, "on": "top"},
    {"id": "hanging_greenery", "group": "flowers", "height": 2.9, "on": "floor"},
    {"id": "flower_cloud", "group": "flowers", "height": 2.9, "on": "floor"},
    {"id": "eucalyptus_runner", "group": "flowers", "height": 0.05, "on": "top"},
    {"id": "copper_lantern", "group": "lights", "height": 0.6, "on": "floor"},
    {"id": "wicker_pendant", "group": "lights", "height": 2.9, "on": "floor"},
    {"id": "wicker_lantern", "group": "lights", "height": 0.6, "on": "floor"},
    {"id": "deck_aisle", "group": "ceremony", "height": 0.06, "on": "floor"},
    {"id": "fabric_ceiling", "group": "ceremony", "height": 3, "on": "floor"},
    {"id": "cane_chair", "group": "tables", "height": 0.88, "on": "floor"},
    {"id": "farm_table", "group": "tables", "height": 0.76, "on": "floor"},
    {"id": "rattan_setting", "group": "table", "height": 0.025, "on": "top"},
    # from two decorators' proposals for the venue: hung clouds and lamps, arches, a swing, lounges
    {"id": "edison_bulbs", "group": "lights", "height": 2.9, "on": "floor"},
    {"id": "rattan_pendants", "group": "lights", "height": 2.9, "on": "floor"},
    {"id": "gourd_pendants", "group": "lights", "height": 2.9, "on": "floor"},
    {"id": "jute_pendant", "group": "lights", "height": 2.9, "on": "floor"},
    {"id": "globe_lanterns", "group": "lights", "height": 2.9, "on": "floor"},
    {"id": "tropical_cloud", "group": "flowers", "height": 2.9, "on": "floor"},
    {"id": "bougainvillea_cloud", "group": "flowers", "height": 2.9, "on": "floor"},
    {"id": "orchid_cloud", "group": "flowers", "height": 2.9, "on": "floor"},
    {"id": "green_cloud", "group": "flowers", "height": 2.9, "on": "floor"},
    {"id": "ficus_pendants", "group": "lights", "height": 2.9, "on": "floor"},
    {"id": "hanging_pots", "group": "flowers", "height": 2.9, "on": "floor"},
    {"id": "voile_swags", "group": "ceremony", "height": 3, "on": "floor"},
    {"id": "ginger_moss", "group": "flowers", "height": 0.89, "on": "top"},
    {"id": "bromeliad", "group": "flowers", "height": 0.46, "on": "floor"},
    {"id": "white_garden", "group": "flowers", "height": 0.81, "on": "floor"},
    {"id": "clay_vases", "group": "flowers", "height": 0.45, "on": "top"},
    {"id": "flower_canoe", "group": "flowers", "height": 0.71, "on": "floor"},
    {"id": "crescent_arch", "group": "ceremony", "height": 2.65, "on": "floor"},
    {"id": "tropical_arch", "group": "ceremony", "height": 2.78, "on": "floor"},
    {"id": "altar_table", "group": "ceremony", "height": 0.95, "on": "floor"},
    {"id": "altar_deck", "group": "ceremony", "height": 0.2, "on": "floor"},
    {"id": "flower_swing", "group": "ceremony", "height": 2.66, "on": "floor"},
    {"id": "bamboo_screen", "group": "ceremony", "height": 2.4, "on": "floor"},
    {"id": "green_wall", "group": "ceremony", "height": 2.4, "on": "floor"},
    {"id": "woven_wall", "group": "ceremony", "height": 2.4, "on": "floor"},
    {"id": "rattan_sofa", "group": "lounge", "height": 0.8, "on": "floor"},
    {"id": "rattan_round_chair", "group": "lounge", "height": 0.82, "on": "floor"},
    {"id": "small_tree", "group": "garden", "height": 3.3, "on": "floor"},
    {"id": "tropical_border", "group": "garden", "height": 2.05, "on": "floor"},
    {"id": "living_wall", "group": "garden", "height": 3.4, "on": "floor"},
    {"id": "glass_roof", "group": "garden", "height": 4.85, "on": "floor"},
    {"id": "glass_lantern", "group": "garden", "height": 4.6, "on": "floor"},
    {"id": "jute_ceiling", "group": "ceremony", "height": 3.4, "on": "floor"},
    {"id": "jute_swags", "group": "ceremony", "height": 3.4, "on": "floor"},
    {"id": "agave", "group": "garden", "height": 0.575, "on": "floor"},
    {"id": "pink_shrub", "group": "garden", "height": 1.025, "on": "floor"},
    {"id": "garden_bench", "group": "garden", "height": 0.45, "on": "floor"},
    {"id": "broad_tree", "group": "garden", "height": 5.65, "on": "floor"},
    {"id": "beach_almond", "group": "garden", "height": 5.89, "on": "floor"},
    {"id": "coconut_palm", "group": "garden", "height": 8.34, "on": "floor"},
    {"id": "blue_bookcase", "group": "lounge", "height": 1.9, "on": "floor"},
    {"id": "iron_shelves", "group": "lounge", "height": 2.0, "on": "floor"},
    {"id": "high_table", "group": "bar", "height": 1.1, "on": "floor"},
    {"id": "egg_planter", "group": "flowers", "height": 1.23, "on": "floor"},
    {"id": "daybed", "group": "lounge", "height": 0.42, "on": "floor"},
    {"id": "diamond_rug", "group": "lounge", "height": 0.01, "on": "floor"},
    {"id": "wall_fan", "group": "lights", "height": 0.55, "on": "floor"},
    {"id": "striped_rug", "group": "lounge", "height": 0.01, "on": "floor"},
    {"id": "wall_plates", "group": "ceremony", "height": 2.5, "on": "floor"},
    {"id": "sunburst", "group": "ceremony", "height": 2.4, "on": "floor"},
    {"id": "wicker_bench", "group": "lounge", "height": 0.45, "on": "floor"},
    {"id": "wicker_pouf", "group": "lounge", "height": 0.42, "on": "floor"},
    {"id": "jute_rug", "group": "lounge", "height": 0.01, "on": "floor"},
    {"id": "trunk_table", "group": "lounge", "height": 0.5, "on": "floor"},
    {"id": "cage_table", "group": "lounge", "height": 0.46, "on": "floor"},
    {"id": "dresser", "group": "bar", "height": 0.88, "on": "floor"},
    {"id": "wicker_stand", "group": "bar", "height": 0.62, "on": "floor"},
    {"id": "bamboo_chair", "group": "tables", "height": 0.92, "on": "floor"},
    {"id": "chiavari_chair", "group": "tables", "height": 0.92, "on": "floor"},
    {"id": "rope_lantern", "group": "lights", "height": 0.44, "on": "floor"},
    {"id": "tall_lanterns", "group": "lights", "height": 1, "on": "floor"},
    # more flowers, the dessert table, a modular bar, the beach (static/decor/extras.js)
    {"id": "bridal_bouquet", "group": "flowers", "height": 0.36, "on": "top"},
    {"id": "peony_bowl", "group": "flowers", "height": 0.24, "on": "top"},
    {"id": "tulip_vase", "group": "flowers", "height": 0.43, "on": "top"},
    {"id": "sunflower_jar", "group": "flowers", "height": 0.39, "on": "top"},
    {"id": "lavender_pot", "group": "flowers", "height": 0.39, "on": "top"},
    {"id": "anthurium_vase", "group": "flowers", "height": 0.53, "on": "top"},
    {"id": "bird_of_paradise", "group": "flowers", "height": 1.33, "on": "floor"},
    {"id": "monstera_vase", "group": "flowers", "height": 0.73, "on": "floor"},
    {"id": "wildflower_bottles", "group": "flowers", "height": 0.32, "on": "top"},
    {"id": "rose_ball", "group": "flowers", "height": 2.6, "on": "floor"},
    {"id": "dessert_tray", "group": "table", "height": 0.3, "on": "top"},
    {"id": "tiered_stand", "group": "table", "height": 0.45, "on": "top"},
    {"id": "macaron_tower", "group": "table", "height": 0.48, "on": "top"},
    {"id": "glass_cloche", "group": "table", "height": 0.36, "on": "top"},
    {"id": "fruit_bowl", "group": "table", "height": 0.27, "on": "top"},
    {"id": "taper_candles", "group": "table", "height": 0.44, "on": "top"},
    {"id": "hurricane", "group": "table", "height": 0.43, "on": "top"},
    {"id": "driftwood_centrepiece", "group": "table", "height": 0.1, "on": "top"},
    {"id": "modular_bar", "group": "bar", "height": 1.1, "on": "floor"},
    {"id": "ice_bucket", "group": "bar", "height": 0.4, "on": "top"},
    {"id": "drinks_dispensers", "group": "bar", "height": 0.56, "on": "top"},
    {"id": "tiki_torch", "group": "lights", "height": 1.62, "on": "floor"},
    {"id": "parasol", "group": "lounge", "height": 2.35, "on": "floor"},
    {"id": "deck_chair", "group": "lounge", "height": 0.92, "on": "floor"},
    {"id": "crates", "group": "lounge", "height": 0.9, "on": "floor"},
    {"id": "hexagon_arch", "group": "ceremony", "height": 2.33, "on": "floor"},
    {"id": "macrame_backdrop", "group": "ceremony", "height": 2.3, "on": "floor"},
    # a home and a tattoo studio (the sample living room's and studio's furniture is drawn by these)
    {"id": "linen_sofa", "group": "home", "height": 0.85, "on": "floor"},
    {"id": "bookshelf", "group": "home", "height": 2.0, "on": "floor"},
    {"id": "tv_console", "group": "home", "height": 1.72, "on": "floor"},
    {"id": "dining_table", "group": "home", "height": 0.76, "on": "floor"},
    {"id": "oak_bench", "group": "home", "height": 0.44, "on": "floor"},
    {"id": "side_table", "group": "home", "height": 0.79, "on": "floor"},
    {"id": "floor_lamp", "group": "home", "height": 1.7, "on": "floor"},
    {"id": "potted_fig", "group": "home", "height": 1.4, "on": "floor"},
    {"id": "ceiling_light", "group": "home", "height": 2.6, "on": "floor"},
    {"id": "tattoo_bed", "group": "home", "height": 0.68, "on": "floor"},
    {"id": "tattoo_chair", "group": "home", "height": 1.38, "on": "floor"},
    {"id": "artist_stool", "group": "home", "height": 0.55, "on": "floor"},
    {"id": "ink_trolley", "group": "home", "height": 0.94, "on": "floor"},
    {"id": "reception_counter", "group": "home", "height": 1.25, "on": "floor"},
    {"id": "waiting_bench", "group": "home", "height": 0.46, "on": "floor"},
    {"id": "ring_light", "group": "home", "height": 2.7, "on": "floor"},
    {"id": "skirting_board", "group": "home", "height": 0.12, "on": "floor"},
    {"id": "floor_spot", "group": "lights", "height": 0.133, "on": "floor"},
    {"id": "track_light", "group": "lights", "height": 0.24, "on": "floor"},
    {"id": "exit_sign", "group": "home", "height": 0.14, "on": "floor"},
    {"id": "wall_speaker", "group": "home", "height": 0.23, "on": "floor"},
    {"id": "wash_counter", "group": "home", "height": 0.31, "on": "floor"},
    {"id": "round_mirror", "group": "home", "height": 0.66, "on": "floor"},
    {"id": "strap_mirror", "group": "home", "height": 0.95, "on": "floor"},
    {"id": "globe_lamp", "group": "lights", "height": 0.24, "on": "floor"},
    {"id": "downlight", "group": "lights", "height": 0.02, "on": "floor"},
    {"id": "toilet_cubicle", "group": "home", "height": 2.1, "on": "floor"},
    {"id": "trough_urinal", "group": "home", "height": 1.24, "on": "floor"},
    {"id": "reed_roof", "group": "garden", "height": 0.03, "on": "floor"},
    {"id": "wall_sconce", "group": "lights", "height": 0.243, "on": "floor"},
    {"id": "sky_dome", "group": "garden", "height": 280, "on": "floor"},
    {"id": "sheer_curtain", "group": "home", "height": 3.25, "on": "floor"},
)
STARTER_IDS = {s["id"] for s in STARTERS}


class DecorError(ValueError):
    def __init__(self, msg: str, code: str = "decor"):
        super().__init__(msg)
        self.code = code


def root(data_dir: Path) -> Path:
    return Path(data_dir) / DIR


def _write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(obj, separators=(",", ":")))
    tmp.replace(path)


# ---------------------------------------------------------------- the inventory
def item_dir(data_dir: Path, item_id: str) -> Path | None:
    if not re.fullmatch(r"[pv][0-9a-z]{6,24}", item_id or ""):
        return None
    d = root(data_dir) / "items" / item_id
    return d if (d / "item.json").is_file() else None


def load_item(data_dir: Path, item_id: str) -> dict:
    d = item_dir(data_dir, item_id)
    if not d:
        raise DecorError("no such item", "no_item")
    return json.loads((d / "item.json").read_text())


def save_item(data_dir: Path, item: dict) -> None:
    _write_json(root(data_dir) / "items" / item["id"] / "item.json", item)


def items(data_dir: Path) -> list[dict]:
    """The inventory: the starters, then the items made from photos, newest first."""
    made = []
    for f in (root(data_dir) / "items").glob("*/item.json"):
        try:
            made.append(json.loads(f.read_text()))
        except (OSError, ValueError):
            continue
    made.sort(key=lambda i: i.get("created", 0), reverse=True)
    return [{**s, "kind": "starter"} for s in STARTERS] + [{**i, "kind": i.get("kind", "photo")} for i in made]


def add_variant(data_dir: Path, d) -> dict:
    """A starter changed and kept as a new thing (a taller bar in brass, a bouquet of 60 roses):
    {name, base (the starter), colour, opts}. Placing it places its starter with these."""
    if not isinstance(d, dict) or d.get("base") not in STARTER_IDS:
        raise DecorError("a new thing is made from a starter", "bad_request")
    item = {"kind": "variant", "name": clean_name(d.get("name") or "Mine"), "base": d["base"], "status": "ready",
            "created": time.time()}
    if d.get("colour") is not None:
        item["colour"] = clean_colour(d["colour"])
    if d.get("opts"):
        item["opts"] = clean_opts(d["opts"])
    item_id = "v" + format(int(time.time() * 1000), "x")
    while (root(data_dir) / "items" / item_id).exists():
        item_id += "0"
    item["id"] = item_id
    save_item(data_dir, item)
    return item


def clean_name(name) -> str:
    name = re.sub(r"\s+", " ", str(name or "")).strip()[:40]
    return name or "Photo"


def clean_height(h) -> float:
    try:
        h = float(h)
    except (TypeError, ValueError):
        raise DecorError("give the height in metres", "height")
    if not math.isfinite(h) or not HEIGHT[0] <= h <= HEIGHT[1]:
        raise DecorError(f"the height must be {HEIGHT[0]}-{HEIGHT[1]} m", "height")
    return round(h, 3)


def add_photo(data_dir: Path, photo: bytes, ext: str, name: str, height) -> dict:
    """A new item from a photo, to be made (Maker): saved with status "working"."""
    ext = ext.lower()
    if ext not in PHOTO_EXT:
        raise DecorError("use a .jpg, .png or .webp photo", "photo_type")
    if not 0 < len(photo) <= MAX_PHOTO:
        raise DecorError("the photo is empty or too large", "photo_size")
    item_id = "p" + format(int(time.time() * 1000), "x") + format(len(photo) % 4096, "03x")
    while (root(data_dir) / "items" / item_id).exists():
        item_id = item_id[:-1] + format((int(item_id[-1], 16) + 1) % 16, "x")
    d = root(data_dir) / "items" / item_id
    d.mkdir(parents=True)
    (d / ("photo" + (".jpg" if ext == ".jpeg" else ext))).write_bytes(photo)
    item = {"id": item_id, "name": clean_name(name), "height": clean_height(height), "on": "floor",
            "status": "working", "created": time.time()}
    save_item(data_dir, item)
    return item


def photo_file(data_dir: Path, item_id: str) -> Path | None:
    d = item_dir(data_dir, item_id)
    return next((p for p in sorted(d.glob("photo.*")) if p.suffix in PHOTO_EXT), None) if d else None


def mesh_file(data_dir: Path, item_id: str) -> Path | None:
    d = item_dir(data_dir, item_id)
    return d / "mesh.json" if d and (d / "mesh.json").is_file() else None


def change_item(data_dir: Path, item_id: str, d: dict) -> dict:
    item = load_item(data_dir, item_id)
    if "name" in d:
        item["name"] = clean_name(d["name"])
    if "height" in d:
        item["height"] = clean_height(d["height"])
    if "on" in d:
        if d["on"] not in ("floor", "top"):
            raise DecorError("on is floor or top", "bad_request")
        item["on"] = d["on"]
    save_item(data_dir, item)
    return item


def delete_item(data_dir: Path, item_id: str) -> None:
    d = item_dir(data_dir, item_id)
    if not d:
        raise DecorError("no such item", "no_item")
    for f in d.iterdir():
        f.unlink()
    d.rmdir()


# ---------------------------------------------------------------- meshes
def stand(v: list, turn: bool = True) -> list:
    """TripoSR's mesh (z up, the photo's camera along +x) to the page's: y up, its front toward +z,
    standing on y = 0, centred over x = z = 0, 1 high. v: flat [x, y, z, ...]."""
    out = []
    for i in range(0, len(v), 3):
        x, y, z = v[i], v[i + 1], v[i + 2]
        out += [y, z, x] if turn else [x, y, z]        # (the photo's camera, at +x, ends up at +z)
    if not out:
        return out
    xs, ys, zs = out[0::3], out[1::3], out[2::3]
    h = max(ys) - min(ys)
    if h <= 0:
        raise DecorError("the mesh has no height", "mesh")
    cx, cz, y0 = (max(xs) + min(xs)) / 2, (max(zs) + min(zs)) / 2, min(ys)
    for i in range(0, len(out), 3):
        out[i] = (out[i] - cx) / h
        out[i + 1] = (out[i + 1] - y0) / h
        out[i + 2] = (out[i + 2] - cz) / h
    return out


def simplify(v: list, c: list, f: list, cells: int = CELLS):
    """Vertices merged cell by cell (a grid of `cells` across the height), colours averaged, faces
    that collapse dropped. A photo's mesh comes with hundreds of thousands of faces; the page draws
    many copies (a row of chairs), so it is kept to tens of thousands."""
    s = cells / max(1e-9, max(v[1::3]) - min(v[1::3]))
    where, nv, nc, sums = {}, [], [], []
    remap = [0] * (len(v) // 3)
    for i in range(len(v) // 3):
        key = (math.floor(v[3 * i] * s), math.floor(v[3 * i + 1] * s), math.floor(v[3 * i + 2] * s))
        j = where.get(key)
        if j is None:
            j = where[key] = len(sums)
            sums.append([0.0] * 7)
        a = sums[j]
        a[0] += v[3 * i]; a[1] += v[3 * i + 1]; a[2] += v[3 * i + 2]
        a[3] += c[3 * i]; a[4] += c[3 * i + 1]; a[5] += c[3 * i + 2]; a[6] += 1
        remap[i] = j
    for a in sums:
        n = a[6]
        nv += [a[0] / n, a[1] / n, a[2] / n]
        nc += [round(a[3] / n), round(a[4] / n), round(a[5] / n)]
    nf, seen = [], set()
    for t in range(0, len(f), 3):
        a, b, d = remap[f[t]], remap[f[t + 1]], remap[f[t + 2]]
        if a == b or b == d or a == d:
            continue
        key = tuple(sorted((a, b, d)))
        if key in seen:
            continue
        seen.add(key)
        nf += [a, b, d]
    return nv, nc, nf


def _b64(fmt: str, values) -> str:
    return base64.b64encode(struct.pack("<%d%s" % (len(values), fmt), *values)).decode()


def pack(v: list, c: list, f: list) -> dict:
    """The mesh for the page: positions as int16 over the box lo..hi, colours as bytes, faces as
    uint32, each base64 (static/decor.js unpack())."""
    if not v or not f:
        raise DecorError("the mesh is empty", "mesh")
    lo = [min(v[k::3]) for k in range(3)]
    hi = [max(v[k::3]) for k in range(3)]
    q = []
    for i in range(0, len(v), 3):
        for k in range(3):
            span = hi[k] - lo[k] or 1.0
            q.append(round((v[i + k] - lo[k]) / span * 65535) - 32768)
    return {"version": 1, "n": len(v) // 3, "lo": [round(x, 6) for x in lo], "hi": [round(x, 6) for x in hi],
            "v": _b64("h", q), "c": _b64("B", [max(0, min(255, int(x))) for x in c]), "f": _b64("I", f)}


def unpack(m: dict):
    """pack() undone (to within its rounding): (v, c, f)."""
    q = struct.unpack("<%dh" % (3 * m["n"]), base64.b64decode(m["v"]))
    v = [m["lo"][i % 3] + (q[i] + 32768) / 65535 * ((m["hi"][i % 3] - m["lo"][i % 3]) or 1.0) for i in range(len(q))]
    c = list(base64.b64decode(m["c"]))
    fb = base64.b64decode(m["f"])
    return v, c, list(struct.unpack("<%dI" % (len(fb) // 4), fb))


def finish(raw: dict) -> dict:
    """photo3d.py's raw mesh ({v, c, f}, TripoSR's frame, colours 0..1) to the packed mesh."""
    v, c, f = raw.get("v") or [], raw.get("c") or [], raw.get("f") or []
    if len(v) < 9 or len(v) % 3 or len(c) != len(v) or len(f) < 3 or len(f) % 3:
        raise DecorError("nothing was made from this photo", "mesh")
    n = len(v) // 3
    if min(f) < 0 or max(f) >= n:
        raise DecorError("the mesh is broken", "mesh")
    v = stand(v, turn=raw.get("frame", "triposr") == "triposr")
    c = [x * 255 if x <= 1.0 else x for x in c]
    return pack(*simplify(v, c, f))


# ---------------------------------------------------------------- making items from photos
class Maker:
    """Items from photos, made one at a time in the background (photo3d.py, in its own Python
    process: PyTorch is loaded there, never in the server). Items left "working" when the app
    stopped are made again when it starts."""

    def __init__(self, data_dir: Path, make=None, resume: bool = True):
        self.data_dir = Path(data_dir)
        self.make = make                         # (photo, out json) -> None, raises on failure
        self.lock = threading.Lock()
        self.queue: list = []
        self.busy = False
        for i in items(self.data_dir) if resume else ():
            if i["kind"] == "photo" and i.get("status") == "working":
                self.queue.append(i["id"])
        if self.queue:
            self._start()

    def add(self, item_id: str) -> None:
        with self.lock:
            self.queue.append(item_id)
        self._start()

    def _start(self) -> None:
        with self.lock:
            if self.busy or not self.queue:
                return
            self.busy = True
        threading.Thread(target=self._work, daemon=True).start()

    def _work(self) -> None:
        while True:
            with self.lock:
                if not self.queue:
                    self.busy = False
                    return
                item_id = self.queue.pop(0)
            self.make_one(item_id)

    def make_one(self, item_id: str) -> None:
        d = item_dir(self.data_dir, item_id)
        if not d:
            return
        out = d / "raw.json"
        try:
            from . import photo3d
            (self.make or photo3d.make)(photo_file(self.data_dir, item_id), out)
            mesh = finish(json.loads(out.read_text()))
            _write_json(d / "mesh.json", mesh)
            status = {"status": "ready", "error": None, "code": None, "faces": len(base64.b64decode(mesh["f"])) // 12}
        except Exception as e:                   # noqa: BLE001 - any failure is shown on the item
            status = {"status": "failed", "error": str(e) or type(e).__name__,
                      "code": getattr(e, "code", None) or "photo3d"}
        finally:
            if out.exists():
                out.unlink()
        try:
            item = load_item(self.data_dir, item_id)
        except DecorError:                       # removed while it was being made
            return
        item.update(status)
        save_item(self.data_dir, item)


# ---------------------------------------------------------------- layouts
def layout_file(data_dir: Path, room_file: str) -> Path:
    slug = re.sub(r"[^A-Za-z0-9_-]+", "_", room_file).strip("_")[:150] or "room"
    return root(data_dir) / "layouts" / (slug + ".json")


def _num(x, lo, hi, what) -> float:
    try:
        x = float(x)
    except (TypeError, ValueError):
        raise DecorError(f"{what} must be a number", "bad_request")
    if not math.isfinite(x) or not lo <= x <= hi:
        raise DecorError(f"{what} is out of range", "bad_request")
    return round(x, 4)


def clean_layouts(d) -> dict:
    """A room's layouts as the page sends them, checked: every placed item names a starter or an
    item id, and its place is a few numbers."""
    if not isinstance(d, dict) or not isinstance(d.get("layouts"), list):
        raise DecorError("send {current, layouts: [...]}", "bad_request")
    if not 1 <= len(d["layouts"]) <= MAX_LAYOUTS:
        raise DecorError("too many layouts", "bad_request")
    out = []
    for lay in d["layouts"]:
        if not isinstance(lay, dict) or not isinstance(lay.get("items"), list) or len(lay["items"]) > MAX_ITEMS:
            raise DecorError("a layout is {name, items: [...]}", "bad_request")
        placed = []
        for p in lay["items"]:
            if not isinstance(p, dict):
                raise DecorError("an item is {item, x, y, z, turn}", "bad_request")
            item = str(p.get("item") or "")
            if item not in STARTER_IDS and not re.fullmatch(r"p[0-9a-z]{6,24}", item):
                raise DecorError("no such item", "bad_request")
            q = {"item": item, "x": _num(p.get("x"), -1e4, 1e4, "x"), "y": _num(p.get("y", 0), -10, 50, "y"),
                 "z": _num(p.get("z"), -1e4, 1e4, "z"),
                 "turn": round(math.remainder(_num(p.get("turn", 0), -1e3, 1e3, "turn"), 2 * math.pi), 4)}
            if p.get("lift"):
                q["lift"] = round(_num(p["lift"], 0, 5, "lift"), 3)
            if p.get("colour") is not None:
                q["colour"] = clean_colour(p["colour"])
            if p.get("opts"):
                q["opts"] = clean_opts(p["opts"])
            placed.append(q)
        out.append({"name": clean_name(lay.get("name") or "Layout"), "items": placed})
    cur = d.get("current", 0)
    cur = cur if isinstance(cur, int) and 0 <= cur < len(out) else 0
    return {"current": cur, "layouts": out}


def clean_colour(c) -> str:
    c = str(c).lower()
    if c not in COLOURS and not re.fullmatch(r"#[0-9a-f]{6}", c):
        raise DecorError("no such colour", "bad_request")
    return c


def clean_opts(o) -> dict:
    """A starter's knobs as the page changed them (static/decor.js knobs()): sizes in metres and
    counts by name, and what its colour is made of. The page keeps each in its range."""
    if not isinstance(o, dict) or len(o) > MAX_OPTS:
        raise DecorError("opts is a few {knob: value}", "bad_request")
    out = {}
    for k, v in o.items():
        if not re.fullmatch(r"[a-z]{1,16}", str(k)):
            raise DecorError("no such knob", "bad_request")
        if k == "finish":
            if v not in MATERIALS:
                raise DecorError("no such material", "bad_request")
            out[k] = v
        else:
            out[k] = _num(v, 0, 1000, k)
    return out


def load_layouts(data_dir: Path, room_file: str) -> dict:
    try:
        return clean_layouts(json.loads(layout_file(data_dir, room_file).read_text()))
    except (OSError, ValueError):
        return {"current": 0, "layouts": [{"name": "Layout 1", "items": []}]}


def save_layouts(data_dir: Path, room_file: str, d) -> dict:
    d = clean_layouts(d)
    _write_json(layout_file(data_dir, room_file), d)
    return d


# ---------------------------------------------------------------- the command line
def main(argv: list[str] | None = None, data_dir: Path | None = None) -> None:
    ap = argparse.ArgumentParser(prog="body-studio decor",
                                 description="Make a 3D decor item from one photo, for the Decor panel.")
    ap.add_argument("photo", nargs="?", type=Path, help="a .jpg, .png or .webp photo of the thing")
    ap.add_argument("--height", type=float, default=0.8, help="its real height in metres (default 0.8)")
    ap.add_argument("--name", help="what to call it (default: the photo's name)")
    ap.add_argument("--list", action="store_true", help="show the inventory")
    ap.add_argument("--data-dir", type=Path, default=data_dir)
    a = ap.parse_args(argv)
    if a.list or not a.photo:
        for i in items(a.data_dir):
            if i["kind"] == "photo":
                print(f"  {i['id']}  {i['name']:<24} {i['height'] * 100:.0f} cm  {i.get('status')}")
        return
    try:
        item = add_photo(a.data_dir, a.photo.read_bytes(), a.photo.suffix, a.name or a.photo.stem, a.height)
    except (OSError, DecorError) as e:
        sys.exit(str(e))
    print(f"Making {item['name']} from {a.photo.name} (on this computer, a minute or two)...")
    Maker(a.data_dir, resume=False).make_one(item["id"])
    item = load_item(a.data_dir, item["id"])
    if item["status"] != "ready":
        sys.exit(f"Couldn't make it: {item.get('error')}")
    print(f"Done: {item['name']} ({item.get('faces')} faces). Open the Decor panel in a room to place it.")
