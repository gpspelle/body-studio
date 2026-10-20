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
BY_ID = {item["id"]: item for item in CATALOG}
SLOTS = ["outfit", "shoes", "hair", "hat"]


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
    d = json.loads(gzip.decompress((DATA / "items" / (item_id + ".json.gz")).read_bytes()))
    for key, code in (("ref", "i"), ("w", "f"), ("off", "f"), ("tris", "i"), ("tuv", "i"), ("uv", "f"),
                      ("delete", "i")):
        d[key] = _arr(code, d[key])
    return d


def catalog() -> list:
    """What the page lists: id, slot, cut and texture of every item (names are in i18n.js)."""
    out = []
    for c in CATALOG:
        tex = next((p.name for p in (DATA.parent / "static" / "wardrobe").glob(c["id"] + ".*")), None)
        out.append({"id": c["id"], "slot": c["slot"], "cut": c["cut"], "texture": tex})
    return out


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


def credits() -> list:
    return [{"id": c["id"], "author": c["author"], "license": c["license"], "source": c["source"]} for c in CATALOG]

