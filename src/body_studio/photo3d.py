"""A 3D object from one photo, on this computer: TripoSR (MIT, Tripo AI and Stability AI,
https://github.com/VAST-AI-Research/TripoSR), for the Decor panel's "Add from a photo" (decor.py).

The server never loads PyTorch: each photo is made by this module run as its own Python process,

    python -m body_studio.photo3d PHOTO OUT.json

which cuts the thing out of the photo (rembg), runs TripoSR (on the Mac's GPU when it can, else on
the CPU: a minute or two) and writes the raw mesh as JSON: {"frame": "triposr", "v", "c", "f"}
(positions in TripoSR's frame, z up; colours 0..1 per vertex; faces). decor.finish() does the rest.

What it needs is installed by `body-studio setup`, or by the app the first time a photo is added
(install()): PyTorch and a few pip packages, and TripoSR's own code at a pinned commit (it isn't
on PyPI), kept in ~/.cache/body-studio. Its weights (about 1.7 GB, from Hugging Face) come down the
first time it runs, or during setup. TripoSR's marching cubes (torchmcubes) needs a compiler, so a
small stand-in built on PyMCubes, which has wheels, is put in its place.
"""
from __future__ import annotations

import io
import json
import os
import subprocess
import sys
import tarfile
import threading
import urllib.request
from pathlib import Path

COMMIT = "107cefdc244c39106fa830359024f6a2f1c78871"    # TripoSR, pinned: bump it on purpose
ARCHIVE = f"https://codeload.github.com/VAST-AI-Research/TripoSR/tar.gz/{COMMIT}"
MODEL = "stabilityai/TripoSR"
REQUIRES = ("torch>=2.0", "transformers>=4.35,<5", "omegaconf>=2.3", "einops", "trimesh>=4",
            "rembg>=2.0.50", "onnxruntime", "huggingface-hub", "PyMCubes", "Pillow", "imageio", "numpy")
MODULES = ("torch", "transformers", "omegaconf", "einops", "trimesh", "rembg", "onnxruntime",
           "huggingface_hub", "mcubes", "PIL", "imageio", "numpy")
RESOLUTION = 192                # marching cubes grid: finer is slower, and the page simplifies it anyway
FOREGROUND = 0.85               # how much of TripoSR's square the thing fills
TIMEOUT = 45 * 60               # s: a first run downloads the weights too


class Missing(RuntimeError):
    code = "photo3d_install"


class Failed(RuntimeError):
    code = "photo3d"


_installing = threading.Lock()


def cache() -> Path:
    return Path(os.environ.get("BODY_STUDIO_CACHE") or Path.home() / ".cache" / "body-studio")


def source() -> Path:
    """TripoSR's code (its tsr/ package), at the pinned commit."""
    return cache() / f"TripoSR-{COMMIT[:12]}"


def available() -> bool:
    """Whether everything is installed (without importing PyTorch: that takes seconds)."""
    from importlib.util import find_spec
    return (source() / "tsr" / "system.py").is_file() and all(find_spec(m) is not None for m in MODULES)


def fetch_source(url: str = ARCHIVE, dest: Path | None = None) -> Path:
    """TripoSR's tsr/ package and its licence, from GitHub's archive of the pinned commit."""
    dest = dest or source()
    with urllib.request.urlopen(url, timeout=120) as r:
        data = r.read()
    tmp = dest.with_name(dest.name + ".tmp")
    if tmp.exists():
        import shutil
        shutil.rmtree(tmp)
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tar:
        for m in tar.getmembers():
            parts = Path(m.name).parts
            if len(parts) < 2 or not (parts[1] == "tsr" or parts[1:] == ("LICENSE",)):
                continue
            if not (m.isfile() or m.isdir()) or ".." in parts:
                continue
            out = tmp.joinpath(*parts[1:])
            if m.isdir():
                out.mkdir(parents=True, exist_ok=True)
                continue
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(tar.extractfile(m).read())
    if not (tmp / "tsr" / "system.py").is_file():
        raise Missing("TripoSR's code wasn't in the download")
    if dest.exists():
        import shutil
        shutil.rmtree(dest)
    tmp.replace(dest)
    return dest


def install(log=None, weights: bool = False) -> None:
    """Install what TripoSR needs into this Python (pip, a few minutes, once) and its code;
    with weights, also download its weights and the cut-out model (`body-studio setup`)."""
    with _installing:
        if not available():
            if log:
                log("Installing TripoSR for decor from photos (once, a few minutes)...")
            r = subprocess.run([sys.executable, "-m", "pip", "install", *REQUIRES], text=True,
                               stdout=None if log else subprocess.PIPE, stderr=subprocess.STDOUT)
            from importlib import invalidate_caches
            invalidate_caches()
            if r.returncode:
                tail = (r.stdout or "").strip().splitlines()[-3:]
                raise Missing("couldn't install TripoSR's packages" + (": " + " ".join(tail) if tail else ""))
            try:
                fetch_source()
            except OSError as e:
                raise Missing(f"couldn't download TripoSR's code: {e}") from e
            if not available():
                raise Missing("TripoSR isn't complete after installing it")
        if weights:
            if log:
                log("Downloading TripoSR's weights (once, about 1.7 GB)...")
            r = subprocess.run([sys.executable, "-m", "body_studio.photo3d", "--fetch"], text=True,
                               stdout=None if log else subprocess.PIPE, stderr=subprocess.STDOUT)
            if r.returncode:
                raise Missing("couldn't download TripoSR's weights; they come down the first time a photo is added")


def make(photo: Path, out: Path) -> None:
    """The raw mesh for `photo`, written to `out` (in a separate Python process). Installs what it
    needs the first time. BODY_STUDIO_PHOTO3D names a stand-in script instead (the tests' fake)."""
    fake = os.environ.get("BODY_STUDIO_PHOTO3D")
    if fake:
        cmd = [sys.executable, fake, str(photo), str(out)]
    else:
        install()
        cmd = [sys.executable, "-m", "body_studio.photo3d", str(photo), str(out)]
    try:
        r = subprocess.run(cmd, text=True, capture_output=True, timeout=TIMEOUT)
    except subprocess.TimeoutExpired:
        raise Failed("it took too long")
    if r.returncode or not Path(out).is_file():
        lines = [ln for ln in (r.stderr or r.stdout or "").strip().splitlines() if ln.strip()]
        raise Failed(lines[-1][:300] if lines else "TripoSR stopped")


# ---------------------------------------------------------------- in the worker process
def _mcubes_shim() -> None:
    """torchmcubes' marching_cubes, as TripoSR calls it, from PyMCubes. torchmcubes gives the
    vertices' coordinates last axis first (TripoSR turns them back), PyMCubes first axis first."""
    import types

    import mcubes
    import numpy as np
    import torch

    def marching_cubes(vol, level):
        v, f = mcubes.marching_cubes(vol.detach().cpu().numpy().astype(np.float32), float(level))
        return (torch.from_numpy(np.ascontiguousarray(v[:, ::-1]).astype(np.float32)),
                torch.from_numpy(f.astype(np.int64)))
    m = types.ModuleType("torchmcubes")
    m.marching_cubes = marching_cubes
    sys.modules["torchmcubes"] = m


def _load(src: Path):
    sys.path.insert(0, str(src))
    _mcubes_shim()
    from tsr.system import TSR
    return TSR


def _devices(torch) -> list:
    out = []
    if torch.cuda.is_available():
        out.append("cuda:0")
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        out.append("mps")
    return out + ["cpu"]


def run(photo: Path, out: Path, src: Path, model_path: str = MODEL) -> None:
    os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
    import numpy as np
    import torch
    from PIL import Image

    TSR = _load(src)
    from tsr.utils import remove_background, resize_foreground

    image = Image.open(photo)
    image = image.convert("RGBA" if "A" in image.getbands() or image.mode == "P" else "RGB")
    cut = image.mode == "RGBA" and image.getextrema()[3][0] < 255     # already cut out
    if not cut:
        import rembg
        image = remove_background(image, rembg.new_session())
    image = resize_foreground(image, FOREGROUND)
    a = np.array(image).astype(np.float32) / 255.0
    a = a[:, :, :3] * a[:, :, 3:4] + (1 - a[:, :, 3:4]) * 0.5
    image = Image.fromarray((a * 255.0).astype(np.uint8))

    model = TSR.from_pretrained(model_path, config_name="config.yaml", weight_name="model.ckpt")
    model.renderer.set_chunk_size(8192)
    err = None
    for device in _devices(torch):
        try:
            model.to(device)
            with torch.no_grad():
                codes = model([image], device=device)
            mesh = model.extract_mesh(codes, True, resolution=RESOLUTION)[0]
            break
        except RuntimeError as e:               # an op the GPU can't do: the next device
            err = e
            print(f"{device} failed ({e}); trying the next", file=sys.stderr, flush=True)
    else:
        raise err
    v = np.asarray(mesh.vertices, dtype=np.float64)
    c = np.asarray(mesh.visual.vertex_colors, dtype=np.float64)[:, :3] / 255.0
    f = np.asarray(mesh.faces, dtype=np.int64)
    Path(out).write_text(json.dumps({"frame": "triposr", "v": np.round(v, 5).ravel().tolist(),
                                     "c": np.round(c, 3).ravel().tolist(), "f": f.ravel().tolist()}))


def fetch_weights() -> None:
    from huggingface_hub import hf_hub_download
    import rembg
    for name in ("config.yaml", "model.ckpt"):
        hf_hub_download(repo_id=MODEL, filename=name)
    hf_hub_download(repo_id="facebook/dino-vitb16", filename="config.json")
    rembg.new_session()


def main(argv: list[str] | None = None) -> None:
    import argparse
    ap = argparse.ArgumentParser(prog="python -m body_studio.photo3d")
    ap.add_argument("photo", nargs="?", type=Path)
    ap.add_argument("out", nargs="?", type=Path)
    ap.add_argument("--src", type=Path, default=None, help="TripoSR's code (default: the cached copy)")
    ap.add_argument("--model", default=MODEL, help="TripoSR's weights: a Hugging Face id or a folder")
    ap.add_argument("--fetch", action="store_true", help="only download the weights")
    a = ap.parse_args(argv)
    if a.fetch:
        return fetch_weights()
    if not a.photo or not a.out:
        ap.error("give a photo and where to write the mesh")
    run(a.photo, a.out, a.src or source(), a.model)


if __name__ == "__main__":
    main()
