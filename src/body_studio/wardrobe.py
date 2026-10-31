"""The wardrobe: clothes, shoes, hair and hats, fitted to a body.

Every item is one of MakeHuman's own assets (CC0, see CREDITS.md), made for MakeHuman's base mesh:
each of its vertices is a point on a triangle of the base mesh plus a small offset. Once the base
mesh is fitted to a scan (fit.py), the same rule puts the item on that person, whatever their
shape. The page turns the item into splats, skins them with the body's skin weights and hides
the skin the item covers (the item's "delete" list). Design and sources: docs/wardrobe.md.
"""
from __future__ import annotations

import base64
import gzip
import json
import sys
from array import array
from functools import lru_cache
from pathlib import Path

DATA = Path(__file__).resolve().parent / "wardrobe"

# slot: one item per slot is worn. cut: who it was cut for ("unisex" fits anyone just as well:
# every item is fitted to the body it is put on).
_M = "makehuman_system"
CATALOG = [
    {"id": "tee_jeans_f", "slot": "outfit", "cut": "women", "source": "clothes/female_casualsuit01", "mhclo": "female_casualsuit01"},
    {"id": "tee_shorts", "slot": "outfit", "cut": "women", "source": "clothes/female_casualsuit02", "mhclo": "female_casualsuit02"},
    {"id": "shirt_skirt", "slot": "outfit", "cut": "women", "source": "clothes/female_elegantsuit01", "mhclo": "female_elegantsuit01"},
    {"id": "crop_leggings", "slot": "outfit", "cut": "women", "source": "clothes/female_sportsuit01", "mhclo": "female_sportsuit01"},
    {"id": "longsleeve_jeans", "slot": "outfit", "cut": "unisex", "source": "clothes/male_casualsuit02", "mhclo": "male_casualsuit02"},
    {"id": "tee_jeans", "slot": "outfit", "cut": "unisex", "source": "clothes/male_casualsuit04", "mhclo": "male_casualsuit04"},
    {"id": "white_tee_jeans", "slot": "outfit", "cut": "unisex", "source": "clothes/male_casualsuit06", "mhclo": "male_casualsuit06"},
    {"id": "jacket_jeans", "slot": "outfit", "cut": "unisex", "source": "clothes/male_casualsuit05", "mhclo": "male_casualsuit05"},
    {"id": "overalls", "slot": "outfit", "cut": "unisex", "source": "clothes/male_worksuit01", "mhclo": "male_worksuit01"},
    {"id": "denim_shirt_jeans", "slot": "outfit", "cut": "men", "source": "clothes/male_casualsuit01", "mhclo": "male_casualsuit01"},
    {"id": "striped_shirt_jeans", "slot": "outfit", "cut": "men", "source": "clothes/male_casualsuit03", "mhclo": "male_casualsuit03"},
    {"id": "suit", "slot": "outfit", "cut": "men", "source": "clothes/male_elegantsuit01", "mhclo": "male_elegantsuit01"},
    {"id": "brown_shoes", "slot": "shoes", "cut": "unisex", "source": "clothes/shoes01", "mhclo": "shoes01"},
    {"id": "leather_shoes", "slot": "shoes", "cut": "unisex", "source": "clothes/shoes04", "mhclo": "shoes04"},
    {"id": "dress_shoes", "slot": "shoes", "cut": "unisex", "source": "clothes/shoes03", "mhclo": "shoes03"},
    {"id": "white_sneakers", "slot": "shoes", "cut": "unisex", "source": "clothes/shoes05", "mhclo": "shoes05"},
    {"id": "blue_sneakers", "slot": "shoes", "cut": "unisex", "source": "clothes/shoes06", "mhclo": "shoes06"},
    {"id": "worn_sneakers", "slot": "shoes", "cut": "unisex", "source": "clothes/shoes02", "mhclo": "shoes02"},
    {"id": "short_dark", "slot": "hair", "cut": "unisex", "source": "hair/short01", "mhclo": "short01"},
    {"id": "short_brown", "slot": "hair", "cut": "unisex", "source": "hair/short02", "mhclo": "short02"},
    {"id": "side_part", "slot": "hair", "cut": "unisex", "source": "hair/short03", "mhclo": "short03"},
    {"id": "slicked", "slot": "hair", "cut": "unisex", "source": "hair/short04", "mhclo": "short04"},
    {"id": "afro", "slot": "hair", "cut": "unisex", "source": "hair/afro01", "mhclo": "afro01"},
    {"id": "bob_dark", "slot": "hair", "cut": "unisex", "source": "hair/bob01", "mhclo": "bob01"},
    {"id": "bob_blonde", "slot": "hair", "cut": "unisex", "source": "hair/bob02", "mhclo": "bob02"},
    {"id": "long", "slot": "hair", "cut": "unisex", "source": "hair/long01", "mhclo": "long01"},
    {"id": "ponytail", "slot": "hair", "cut": "unisex", "source": "hair/ponytail01", "mhclo": "ponytail01"},
    {"id": "braid", "slot": "hair", "cut": "unisex", "source": "hair/braid01", "mhclo": "braid01"},
    {"id": "fedora", "slot": "hat", "cut": "unisex", "source": "clothes/fedora01", "mhclo": "fedora"},
]
for _item in CATALOG:
    _item.update(author=_M, license="CC0-1.0")

# Our own (CC0, scripts/wardrobe_styles.py): outfits in new prints and colours, each one of the
# outfits above (`like`: its shape) with a new texture, and accessories made from the base mesh.
# reach: how far out from the skin an item hides it (a fraction of the height; None: the page's
# own, for clothes); 0 for what sits on the skin without covering much of it.
_OWN = "body-studio (scripts/wardrobe_styles.py)"
CATALOG += [
    {"id": "tiedye_tee_jeans", "slot": "outfit", "cut": "unisex", "like": "tee_jeans"},
    {"id": "floral_shirt_skirt", "slot": "outfit", "cut": "women", "like": "shirt_skirt"},
    {"id": "leather_jacket", "slot": "outfit", "cut": "unisex", "like": "jacket_jeans"},
    {"id": "band_tee", "slot": "outfit", "cut": "unisex", "like": "white_tee_jeans"},
    {"id": "tartan_skirt", "slot": "outfit", "cut": "women", "like": "shirt_skirt"},
    {"id": "tartan_trousers", "slot": "outfit", "cut": "unisex", "like": "longsleeve_jeans"},
    {"id": "flannel_shirt", "slot": "outfit", "cut": "men", "like": "denim_shirt_jeans"},
    {"id": "breton_tee", "slot": "outfit", "cut": "women", "like": "tee_jeans_f"},
    {"id": "beanie", "slot": "hat", "cut": "unisex"},
    {"id": "black_beanie", "slot": "hat", "cut": "unisex"},
    {"id": "headband", "slot": "hat", "cut": "unisex"},
    {"id": "round_glasses", "slot": "glasses", "cut": "unisex", "reach": 0},
    {"id": "hippie_shades", "slot": "glasses", "cut": "unisex", "reach": 0},
    {"id": "sunglasses", "slot": "glasses", "cut": "unisex", "reach": 0},
    {"id": "beads", "slot": "neck", "cut": "unisex", "reach": 0},
    {"id": "chain", "slot": "neck", "cut": "unisex", "reach": 0},
    {"id": "choker", "slot": "neck", "cut": "unisex", "reach": 0},
]
for _item in CATALOG:
    if "author" not in _item:
        _item.update(author=_OWN, license="CC0-1.0",
                     source=f"made from MakeHuman's {_item['like']}" if "like" in _item else "made from the base mesh")

# The styles the page filters by (an item may be in several). Casual for everything not listed.
STYLES = ["casual", "smart", "hippie", "rock", "indie", "punk"]
_STYLE = {
    "suit": ["smart"], "shirt_skirt": ["smart"], "overalls": ["casual", "indie"],
    "striped_shirt_jeans": ["casual", "indie"], "jacket_jeans": ["casual", "rock"],
    "worn_sneakers": ["casual", "punk", "indie"], "white_sneakers": ["casual", "indie"],
    "brown_shoes": ["casual", "hippie"], "leather_shoes": ["smart", "rock"], "dress_shoes": ["smart"],
    "afro": ["casual", "hippie"], "long": ["casual", "hippie", "rock"], "braid": ["casual", "hippie"],
    "slicked": ["smart", "rock"], "short_dark": ["casual", "punk"], "bob_dark": ["casual", "indie"],
    "fedora": ["smart", "indie"],
    "tiedye_tee_jeans": ["hippie"], "floral_shirt_skirt": ["hippie"], "leather_jacket": ["rock"],
    "band_tee": ["rock", "punk"], "tartan_skirt": ["punk"], "tartan_trousers": ["punk"],
    "flannel_shirt": ["indie", "rock"], "breton_tee": ["indie"], "beanie": ["indie"],
    "black_beanie": ["punk", "rock"], "headband": ["hippie"], "round_glasses": ["indie"],
    "hippie_shades": ["hippie"], "sunglasses": ["rock"], "beads": ["hippie"], "chain": ["rock", "punk"],
    "choker": ["punk"],
}
BY_ID = {item["id"]: item for item in CATALOG}
SLOTS = ["outfit", "shoes", "hair", "hat", "glasses", "neck"]

# How the shop around the body shows each item (static/racks.js): outfits on hangers on the rail
# ("hang") or folded on the shelves ("fold"), shoes in pairs on the shoe rack, hair on mannequin
# heads on the shelves ("head") or, when it is too long for a shelf, on a stand ("stand"), hats on a
# mannequin head on a stand ("hat"). Folded: what a shop folds (T-shirts, knitwear, sportswear, with
# jeans or shorts); hung: what has a collar, a jacket, a skirt or bibs.
FOLDED = {"tee_jeans_f", "tee_shorts", "crop_leggings", "longsleeve_jeans", "tee_jeans", "white_tee_jeans"}
LONG_HAIR = {"long", "ponytail", "braid"}       # reaches below the shoulders (tests/unit/test_wardrobe.py)
DISPLAYS = {"hang", "fold", "shoes", "head", "stand", "hat", "none"}


def display(item_id: str) -> str:
    """How the shop shows it; a necklace isn't in the shop ("none": it would hang in the air under
    a mannequin head), only in the panel's list."""
    slot = BY_ID[item_id]["slot"]
    item_id = BY_ID[item_id].get("like", item_id)
    if slot == "outfit":
        return "fold" if item_id in FOLDED else "hang"
    if slot == "neck":
        return "none"
    if slot == "glasses" or (slot == "hat" and item_id != "fedora"):
        return "head"
    if slot == "hair":
        return "stand" if item_id in LONG_HAIR else "head"
    return slot



def _arr(code: str, s: str) -> array:
    a = array(code)
    a.frombytes(base64.b64decode(s))
    if sys.byteorder != "little":
        a.byteswap()
    return a


@lru_cache(maxsize=1)
def base() -> dict:
    """MakeHuman's base mesh (hm08): every vertex, and the triangles of the skin."""
    d = json.loads(gzip.decompress((DATA / "base.json.gz").read_bytes()))
    V = _arr("f", d["verts"])
    return {"verts": [(V[3 * i], V[3 * i + 1], V[3 * i + 2]) for i in range(len(V) // 3)],
            "tris": _arr("i", d["body_tris"]), "n_body": d["n_body"]}


@lru_cache(maxsize=8)
def item(item_id: str) -> dict:
    like = BY_ID.get(item_id, {}).get("like")
    d = json.loads(gzip.decompress((DATA / "items" / ((like or item_id) + ".json.gz")).read_bytes()))
    if like:                                  # the same shape in a new texture
        d["id"], d["texture"] = item_id, _texture(item_id)
    for key, code in (("ref", "i"), ("w", "f"), ("off", "f"), ("tris", "i"), ("tuv", "i"), ("uv", "f"),
                      ("delete", "i")):
        d[key] = _arr(code, d[key])
    return d


def _texture(item_id: str) -> str | None:
    return next((p.name for p in (DATA.parent / "static" / "wardrobe").glob(item_id + ".*")), None)


def catalog() -> list:
    """What the page lists: id, slot, cut, styles and texture of every item (names are in i18n.js)."""
    return [{"id": c["id"], "slot": c["slot"], "cut": c["cut"], "texture": _texture(c["id"]), "display": display(c["id"]),
             "styles": _STYLE.get(c["id"], ["casual"]), "reach": c.get("reach")} for c in CATALOG]


@lru_cache(maxsize=None)
def shape(item_id: str) -> str:
    """The item as it is made, on MakeHuman's base mesh (not fitted to anyone), for the shop's
    racks and shelves: vertices in MakeHuman's units and axes (decimetres, y up, z to the front,
    the feet at y = -8.2), triangles and UVs. As JSON, cached: it is the same for every body."""
    it, V = item(item_id), base()["verts"]
    ref, w, off = it["ref"], it["w"], it["off"]
    out = array("f")
    for i in range(len(ref) // 3):
        r = ref[3 * i:3 * i + 3]
        out.extend(sum(w[3 * i + m] * V[r[m]][j] for m in range(3)) + off[3 * i + j] for j in range(3))
    return json.dumps({"id": item_id, "slot": BY_ID[item_id]["slot"], "display": display(item_id),
                       "texture": it["texture"], "alpha": it["alpha"], "verts": _b64(out), "tris": _b64(it["tris"]),
                       "tuv": _b64(it["tuv"]), "uv": _b64(it["uv"])})


NECK = 5.75                      # the mannequin head is the base mesh's skin above this (decimetres)


@lru_cache(maxsize=1)
def mannequin() -> str:
    """The base mesh's head and neck, for the mannequin heads the hair and the hat are shown on,
    as JSON: vertices in MakeHuman's units and axes, and triangles."""
    b = base()
    V, T = b["verts"], b["tris"]
    keep, out, tris = {}, array("f"), array("i")
    for t in range(len(T) // 3):
        tri = T[3 * t:3 * t + 3]
        if all(V[i][1] > NECK for i in tri):
            for i in tri:
                if i not in keep:
                    keep[i] = len(keep)
                    out.extend(V[i])
                tris.append(keep[i])
    return json.dumps({"verts": _b64(out), "tris": _b64(tris), "neck": NECK})


def fitted(item_id: str, fit: dict) -> dict:
    """The item on one body: its vertices in the body's PLY coordinates (at rest), triangles, UVs,
    and the base mesh vertices whose skin it covers. Each vertex's anchor is the point on the
    fitted mesh it hangs from (the vertex without its offset): the item moves the way the skin
    there moves.

    A vertex is w1*r1 + w2*r2 + w3*r3 plus an offset, with r the fitted base mesh. The offset is
    in MakeHuman's axes and scaled by how wide, deep and tall the body is at three pairs of base
    mesh vertices (MakeHuman's own rule); it is turned with the limb it sits on."""
    it = item(item_id)
    V, R, ax = fit["verts"], fit["rot"], fit["axes"]          # body coordinates; rotations; MH axes
    scale = []
    for k, (a, b, den) in enumerate(it["scales"]):
        d = [V[a][j] - V[b][j] for j in range(3)]
        scale.append(abs(sum(d[j] * ax[k][j] for j in range(3))) / den)
    ref, w, off = it["ref"], it["w"], it["off"]
    out, anchors = array("f"), array("f")
    for i in range(len(ref) // 3):
        r = ref[3 * i:3 * i + 3]
        p = [sum(w[3 * i + m] * V[r[m]][j] for m in range(3)) for j in range(3)]
        o = [sum(off[3 * i + k] * scale[k] * ax[k][j] for k in range(3)) for j in range(3)]
        o = _rot(R[r[0]], o)
        out.extend(fit["to_model"]((p[0] + o[0], p[1] + o[1], p[2] + o[2])))
        anchors.extend(fit["to_model"](p))
    return {"id": item_id, "slot": BY_ID[item_id]["slot"], "z_depth": it["z_depth"], "texture": it["texture"],
            "alpha": it["alpha"], "verts": _b64(out), "anchors": _b64(anchors), "tris": _b64(it["tris"]), "tuv": _b64(it["tuv"]),
            "uv": _b64(it["uv"]), "delete": _b64(it["delete"])}


def _rot(q, v):
    x, y, z, w = q
    tx, ty, tz = 2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])
    return [v[0] + w * tx + y * tz - z * ty, v[1] + w * ty + z * tx - x * tz, v[2] + w * tz + x * ty - y * tx]


def _b64(a: array) -> str:
    if sys.byteorder != "little":
        a = array(a.typecode, a)
        a.byteswap()
    return base64.b64encode(a.tobytes()).decode()


