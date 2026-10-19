"""Pack the wardrobe (clothes, shoes, hair, hats) from MakeHuman's own assets, all CC0.

    python3 scripts/wardrobe_pack.py MAKEHUMAN_DATA BASE_OBJ

MAKEHUMAN_DATA is a MakeHuman 1.1 data folder with the system assets (clothes/, hair/): the
Ubuntu package has one, http://archive.ubuntu.com/ubuntu/pool/universe/m/makehuman/
makehuman-data_1.1.1-1_all.deb (unpack it with `ar x` and `tar xf data.tar.xz`; the data is in
usr/share/makehuman/data). BASE_OBJ is makehuman/data/3dobjs/base.obj from
https://github.com/makehumancommunity/makehuman (the hm08 base mesh every item is fitted to).
MakeHuman released all of these as CC0 in 2020 (LICENSE.md in that repository, section C).

Writes src/body_studio/wardrobe/ (the base mesh and each item's binding, read by wardrobe.py)
and src/body_studio/static/wardrobe/ (textures, read by the page). Needs ffmpeg for the textures.
Only needed to remake those files.
"""
from __future__ import annotations

import ast
import base64
import gzip
import json
import subprocess
import sys
import zipfile
from array import array
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
from body_studio.wardrobe import CATALOG  # noqa: E402

OUT = ROOT / "src" / "body_studio" / "wardrobe"
TEX = ROOT / "src" / "body_studio" / "static" / "wardrobe"
TEXTURE_PX = {"outfit": 1024, "shoes": 512, "hair": 512, "hat": 512}


def b64(arr: array) -> str:
    if sys.byteorder != "little":
        arr = array(arr.typecode, arr)
        arr.byteswap()
    return base64.b64encode(arr.tobytes()).decode()


def npy(raw: bytes) -> tuple[array, tuple]:
    """A .npy array (MakeHuman's compiled meshes) without NumPy."""
    assert raw[:6] == b"\x93NUMPY"
    hlen = int.from_bytes(raw[8:10], "little")
    head = ast.literal_eval(raw[10:10 + hlen].decode("latin1"))
    code = {"<f4": "f", "<u4": "I", "<i4": "i", "<u2": "H", "|u1": "B", "<i8": "q"}[head["descr"]]
    a = array(code)
    a.frombytes(raw[10 + hlen:])
    return a, head["shape"]


def read_mesh(npz: Path):
    """Vertices, triangles (vertex and UV indices) and UVs of an item's compiled .npz."""
    z = zipfile.ZipFile(npz)
    coord, _ = npy(z.read("coord.npy"))
    fvert, fshape = npy(z.read("fvert.npy"))
    fuvs, _ = npy(z.read("fuvs.npy"))
    texco, _ = npy(z.read("texco.npy"))
    tris, tuv = array("i"), array("i")
    for f in range(fshape[0]):
        v = fvert[4 * f:4 * f + 4]
        u = fuvs[4 * f:4 * f + 4]
        corners = [(0, 1, 2)] if v[3] in (v[0], v[2]) else [(0, 1, 2), (0, 2, 3)]
        for a, b, c in corners:
            if len({v[a], v[b], v[c]}) == 3:
                tris.extend((v[a], v[b], v[c]))
                tuv.extend((u[a], u[b], u[c]))
    return len(coord) // 3, tris, tuv, array("f", texco)


def read_mhclo(path: Path) -> dict:
    """The binding of an item to the base mesh (see MakeHuman's file format notes)."""
    out = {"scales": {}, "ref": array("i"), "w": array("f"), "off": array("f"), "delete": array("i"),
           "z_depth": 50, "material": None}
    mode = None
    for line in path.read_text(encoding="latin1").splitlines():
        s = line.split()
        if not s or s[0].startswith("#"):
            continue
        if s[0] in ("x_scale", "y_scale", "z_scale"):
            out["scales"][s[0][0]] = [int(s[1]), int(s[2]), float(s[3])]
        elif s[0] == "z_depth":
            out["z_depth"] = int(s[1])
        elif s[0] == "material":
            out["material"] = s[1]
        elif s[0] == "verts":
            mode = "verts"
        elif s[0] == "delete_verts":
            mode = "delete"
        elif mode == "verts" and len(s) == 9 and s[0].isdigit():
            out["ref"].extend(int(x) for x in s[:3])
            out["w"].extend(float(x) for x in s[3:6])
            out["off"].extend(float(x) for x in s[6:9])
        elif mode == "verts" and len(s) == 1 and s[0].isdigit():      # exactly on one base vertex
            out["ref"].extend((int(s[0]),) * 3)
            out["w"].extend((1.0, 0.0, 0.0))
            out["off"].extend((0.0, 0.0, 0.0))
        elif mode == "delete" and s[0][0].isdigit():
            i = 0
            while i < len(s):
                if i + 2 < len(s) and s[i + 1] == "-":
                    out["delete"].extend(range(int(s[i]), int(s[i + 2]) + 1))
                    i += 3
                else:
                    out["delete"].append(int(s[i]))
                    i += 1
    return out


def material(path: Path) -> dict:
    m = {}
    for line in path.read_text(encoding="latin1").splitlines():
        s = line.split(None, 1)
        if len(s) == 2 and not s[0].startswith(("#", "//")):
            m[s[0]] = s[1].strip()
    return m


def texture(src: Path, ao: Path | None, out: Path, px: int, alpha: bool) -> None:
    """Scaled down; ambient occlusion multiplied in (it is what makes folds read as folds)."""
    cmd = ["ffmpeg", "-loglevel", "error", "-y", "-i", str(src)]
    if ao and not alpha:
        cmd += ["-i", str(ao), "-filter_complex",
                f"[0]scale={px}:{px},format=gbrp[d];[1]scale={px}:{px},format=gbrp[a];"
                "[d][a]blend=all_mode=multiply"]
    else:
        cmd += ["-vf", f"scale={px}:{px}" + (",format=rgba" if alpha else ",format=rgb24")]
    cmd += ["-q:v", "4", str(out)] if out.suffix == ".jpg" else [str(out)]
    subprocess.run(cmd, check=True)


def pack_base(obj: Path) -> None:
    V, body = array("f"), array("i")
    group = None
    for line in obj.read_text().splitlines():
        if line.startswith("v "):
            V.extend(float(x) for x in line.split()[1:4])
        elif line.startswith("g "):
            group = line.split()[1]
        elif line.startswith("f ") and group == "body":
            f = [int(t.split("/")[0]) - 1 for t in line.split()[1:]]
            body.extend((f[0], f[1], f[2]))
            if len(f) == 4:
                body.extend((f[0], f[2], f[3]))
    n_body = max(body) + 1
    (OUT / "base.json.gz").write_bytes(gzip.compress(json.dumps(
        {"verts": b64(V), "body_tris": b64(body), "n_body": n_body}).encode(), 9, mtime=0))
    print(f"base: {len(V) // 3} vertices, {n_body} on the body, {len(body) // 3} triangles")


def pack_item(data: Path, item: dict) -> None:
    folder = data / item["source"]
    mhclo = folder / (item["mhclo"] + ".mhclo")
    b = read_mhclo(mhclo)
    n, tris, tuv, uv = read_mesh(mhclo.with_suffix(".npz"))
    if n * 3 != len(b["ref"]):
        raise SystemExit(f"{item['id']}: {n} vertices but {len(b['ref']) // 3} bindings")
    mat_path = folder / (b["material"] or item["mhclo"] + ".mhmat")
    m = material(mat_path)
    alpha = m.get("transparent") == "True"
    tex = TEX / (item["id"] + (".png" if alpha else ".jpg"))
    ao = m.get("aomapTexture")
    texture(mat_path.parent / m["diffuseTexture"], ao and mat_path.parent / ao, tex,
            TEXTURE_PX[item["slot"]], alpha)
    rec = {"id": item["id"], "z_depth": b["z_depth"], "scales": [b["scales"][k] for k in "xyz"],
           "ref": b64(b["ref"]), "w": b64(b["w"]), "off": b64(b["off"]), "tris": b64(tris), "tuv": b64(tuv),
           "uv": b64(uv), "delete": b64(b["delete"]), "texture": tex.name, "alpha": alpha}
    (OUT / "items" / (item["id"] + ".json.gz")).write_bytes(gzip.compress(json.dumps(rec).encode(), 9, mtime=0))
    print(f"{item['id']}: {n} vertices, {len(tris) // 3} triangles, {len(b['delete'])} skin vertices hidden")


def main() -> None:
    data, obj = Path(sys.argv[1]), Path(sys.argv[2])
    (OUT / "items").mkdir(parents=True, exist_ok=True)
    TEX.mkdir(parents=True, exist_ok=True)
    pack_base(obj)
    for item in CATALOG:
        pack_item(data, item)


if __name__ == "__main__":
    main()
