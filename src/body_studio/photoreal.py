"""Make it a photo: a path-traced photo of a room (darkroom.js) turned into one that looks like a
photograph, on this Mac, by an image model that edits pictures: FLUX.2 klein 4B (Apache 2.0, Black
Forest Labs, https://huggingface.co/black-forest-labs/FLUX.2-klein-4B) run by mflux (MIT, MLX on
the Mac's GPU, https://github.com/mflux-community/mflux).

The model keeps what is where and changes how it looks: real wood, fabric and stone, real light.
It can still change small things (a flower's colour, how many glasses), so the page shows its
picture beside the path-traced one, which stays the one to plan with.

The server never loads the model: each picture is made by mflux's own command in its own process,

    python -m body_studio.photoreal PHOTO.png OUT.png

What it needs (mflux, which brings MLX and PyTorch) is installed by `body-studio setup`, or by
the app the first time a photo is made real (install()), into a Python of its own in
~/.cache/body-studio/mflux (its transformers is newer than TripoSR's, so they can't share one). Its
weights (about 8 GB, from Hugging Face) come down the first time it runs. It needs a Mac with Apple
silicon and a Python 3.11 or newer (this one, or one on the PATH). On a Mac with less than 32 GB of
memory the model runs at 4 bits a weight, else 8 (sharper, slower).

Pictures are kept in the data folder, photos/<id>.png and photos/<id>.real.png, made one at a time
in the background (Maker).
"""
from __future__ import annotations

import json
import os
import platform
import re
import shutil
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path

REQUIRES = ("mflux==0.24.0",)        # pinned: bump it on purpose
MODEL = "flux2-klein-4b"
COMMAND = "mflux-generate-flux2-edit"
STEPS = 4                       # klein is distilled: four steps
SEED = 7
LONG = 1024                     # px: the long side the model works at (multiples of 16)
PIECE_LONG = 768                # px: for one piece of decor on its own (a little under half the pixels)
MAX_PHOTO = 40 * 1024 * 1024
TIMEOUT = 60 * 60               # s: a first run downloads the weights too
PROMPT = (
    "Turn this 3D render into a real photograph taken with a full-frame camera, the same moment "
    "and the same view. Keep every object exactly where it is, with the same shape, size, count and "
    "colour: the furniture, flowers, plants, trees, lights, walls, floor and sky. Make the materials "
    "real: wood grain, woven fabric, stone, sand, leaves and petals, glass, metal. Natural daylight, "
    "soft real shadows, true colours, sharp detail. Add nothing and remove nothing; no people."
)
# one piece of decor alone on a plain floor (Photo of this piece): a product photograph of it
PIECE_PROMPT = (
    "Turn this 3D render into a real product photograph of this wedding decoration, taken in a "
    "photo studio with a full-frame camera, the same view. Keep the piece exactly as it is: the same "
    "shape, size, structure, and the same number, kind and colour of every flower, leaf, fabric, "
    "light and part. Make the materials real: petals and leaves, woven fabric, wood grain, metal, "
    "glass, candle flames. Soft daylight, a soft real shadow on the plain floor, true colours, sharp "
    "detail. Add nothing and remove nothing; no people."
)


class Missing(RuntimeError):
    code = "photoreal_install"


class Failed(RuntimeError):
    code = "photoreal"


_installing = threading.Lock()


def cache() -> Path:
    return Path(os.environ.get("BODY_STUDIO_CACHE") or Path.home() / ".cache" / "body-studio")


def venv() -> Path:
    """mflux's own Python."""
    return cache() / "mflux"


def base_python() -> str | None:
    """A Python 3.11 or newer to make mflux's own from: this one if it is, else one on the PATH."""
    if sys.version_info >= (3, 11):
        return sys.executable
    for name in ("python3.13", "python3.12", "python3.11"):
        p = shutil.which(name)
        if p:
            return p
    return None


def supported() -> str | None:
    """Why this computer can't run it, or None when it can."""
    if sys.platform != "darwin" or platform.machine() != "arm64":
        return "Make it a photo needs a Mac with Apple silicon"
    if not base_python() and not command():
        return "Make it a photo needs Python 3.11 or newer (brew install python)"
    return None


def command() -> str | None:
    """mflux's edit command, in its own Python."""
    p = venv() / "bin" / COMMAND
    return str(p) if p.is_file() else None


def available() -> bool:
    return supported() is None and command() is not None


def install(log=None) -> None:
    """Make mflux's own Python and install mflux into it (pip, a few minutes, once)."""
    why = supported()
    if why:
        raise Missing(why)
    with _installing:
        if available():
            return
        if log:
            log("Installing the image model for Make it a photo (once, a few minutes)...")
        quiet = {"stdout": None if log else subprocess.PIPE, "stderr": subprocess.STDOUT, "text": True}
        r = subprocess.run([base_python(), "-m", "venv", str(venv())], **quiet)
        if not r.returncode:
            r = subprocess.run([str(venv() / "bin" / "python"), "-m", "pip", "install", *REQUIRES], **quiet)
        if r.returncode or not available():
            tail = (r.stdout or "").strip().splitlines()[-3:]
            raise Missing("couldn't install mflux" + (": " + " ".join(tail) if tail else ""))


def memory_gb() -> float:
    """This Mac's memory in GB (0 when it can't be told)."""
    try:
        return int(subprocess.run(["sysctl", "-n", "hw.memsize"], capture_output=True, text=True,
                                  timeout=10).stdout.strip()) / 2**30
    except (OSError, ValueError, subprocess.SubprocessError):
        return 0.0


def bits(memory: float) -> int:
    """How many bits a weight the model runs at: 8 with room for it, else 4."""
    return 8 if memory >= 32 else 4


def size(w: int, h: int, long: int = LONG) -> tuple:
    """The picture's size for the model: the photo's shape, its long side `long`, both sides
    multiples of 16 (mflux rounds down to them, and the picture should line up with the photo)."""
    if w <= 0 or h <= 0:
        raise Failed("the photo has no size")
    k = long / max(w, h)
    return max(16, int(round(w * k / 16)) * 16), max(16, int(round(h * k / 16)) * 16)


def png_size(data: bytes) -> tuple:
    """A PNG's width and height, from its header."""
    if data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        raise Failed("send the photo as a PNG")
    return int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big")


def args(photo: Path, out: Path, w: int, h: int, quantize: int, cmd: str = COMMAND, piece: bool = False) -> list:
    """mflux's command line for one picture (`piece`: one piece of decor on its own)."""
    return [cmd, "--model", MODEL, "--image-paths", str(photo), "--prompt", PIECE_PROMPT if piece else PROMPT,
            "--steps", str(STEPS), "--seed", str(SEED), "--width", str(w), "--height", str(h),
            "-q", str(quantize), "--output", str(out)]


def make(photo: Path, out: Path, piece: bool = False) -> None:
    """The photograph for `photo`, written to `out` (mflux in its own process); `piece`: a photo of
    one piece of decor, made at PIECE_LONG with its own prompt. Installs what it needs the first
    time. BODY_STUDIO_PHOTOREAL names a stand-in script instead (the tests' fake)."""
    photo, out = Path(photo), Path(out)
    w, h = size(*png_size(photo.read_bytes()), PIECE_LONG if piece else LONG)
    fake = os.environ.get("BODY_STUDIO_PHOTOREAL")
    if fake:
        cmd = [sys.executable, fake, *args(photo, out, w, h, 4, piece=piece)[1:]]
    else:
        install()
        cmd = args(photo, out, w, h, bits(memory_gb()), command(), piece)
    try:
        r = subprocess.run(cmd, text=True, capture_output=True, timeout=TIMEOUT)
    except subprocess.TimeoutExpired:
        raise Failed("it took too long")
    if r.returncode or not out.is_file():
        lines = [ln for ln in (r.stderr or r.stdout or "").strip().splitlines() if ln.strip()]
        raise Failed(lines[-1][:300] if lines else "the image model stopped")


# ---------------------------------------------------------------- the pictures, kept
def photos_dir(data_dir: Path) -> Path:
    return Path(data_dir) / "photos"


def _status_file(data_dir: Path, pid: str) -> Path:
    return photos_dir(data_dir) / f"{pid}.json"


def valid_id(pid: str) -> bool:
    return bool(re.fullmatch(r"[0-9a-f]{12}", pid or ""))


def status(data_dir: Path, pid: str) -> dict | None:
    f = _status_file(data_dir, pid)
    if not valid_id(pid) or not f.is_file():
        return None
    return json.loads(f.read_text())


def _save_status(data_dir: Path, pid: str, s: dict) -> None:
    f = _status_file(data_dir, pid)
    tmp = f.with_suffix(".tmp")
    tmp.write_text(json.dumps(s))
    tmp.replace(f)


def picture(data_dir: Path, pid: str, real: bool) -> Path | None:
    if not valid_id(pid):
        return None
    p = photos_dir(data_dir) / f"{pid}{'.real' if real else ''}.png"
    return p if p.is_file() else None


def add(data_dir: Path, png: bytes, piece: bool = False) -> dict:
    """Keep a path-traced photo to be made real: {id, status: "working", piece}."""
    png_size(png)
    d = photos_dir(data_dir)
    d.mkdir(parents=True, exist_ok=True)
    pid = uuid.uuid4().hex[:12]
    (d / f"{pid}.png").write_bytes(png)
    s = {"id": pid, "status": "working", "error": None, "code": None, "started": time.time(), "piece": bool(piece)}
    _save_status(data_dir, pid, s)
    return s


class Maker:
    """Photos made real one at a time in the background (the model in its own process). Photos
    left "working" when the app stopped are made again when it starts."""

    def __init__(self, data_dir: Path, make=None, resume: bool = True):
        self.data_dir = Path(data_dir)
        self.make = make                         # (photo, out png, piece) -> None, raises on failure
        self.lock = threading.Lock()
        self.queue: list = []
        self.busy = False
        d = photos_dir(self.data_dir)
        for f in sorted(d.glob("*.json")) if resume and d.is_dir() else ():
            try:
                s = json.loads(f.read_text())
            except ValueError:
                continue
            if s.get("status") == "working":
                self.queue.append(s["id"])
        if self.queue:
            self._start()

    def add(self, pid: str) -> None:
        with self.lock:
            self.queue.append(pid)
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
                pid = self.queue.pop(0)
            self.make_one(pid)

    def make_one(self, pid: str) -> None:
        s = status(self.data_dir, pid)
        src = picture(self.data_dir, pid, False)
        if not s or not src:
            return
        out = photos_dir(self.data_dir) / f"{pid}.real.png"
        try:
            (self.make or make)(src, out, bool(s.get("piece")))
            s.update(status="ready", error=None, code=None)
        except Exception as e:                   # noqa: BLE001 - any failure is shown on the page
            s.update(status="failed", error=str(e) or type(e).__name__, code=getattr(e, "code", None) or "photoreal")
        s["took"] = round(time.time() - s.get("started", time.time()), 1)
        _save_status(self.data_dir, pid, s)


def main(argv: list[str] | None = None) -> None:
    import argparse
    ap = argparse.ArgumentParser(prog="python -m body_studio.photoreal")
    ap.add_argument("photo", type=Path, help="a path-traced photo (PNG)")
    ap.add_argument("out", type=Path, help="where to write the photograph (PNG)")
    ap.add_argument("--piece", action="store_true", help="one piece of decor on its own")
    a = ap.parse_args(argv)
    make(a.photo, a.out, a.piece)
    print(a.out)


if __name__ == "__main__":
    main()
