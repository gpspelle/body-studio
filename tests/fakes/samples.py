"""The sample rooms (living room, tattoo studio, wedding venue) for browser tests and screenshots,
made once and then copied. Drawing them is pure Python and takes about 30 s (the venue alone 23 s),
which every browser test run and every screenshot run used to pay.

The copies are kept in ~/.cache/body-studio-tests (or BODY_STUDIO_TEST_CACHE), under a hash of the
app's Python files: any change to how a room is drawn or mapped makes them again. CI keeps that
folder between runs with actions/cache.
"""
from __future__ import annotations

import hashlib
import os
import shutil
from pathlib import Path

from body_studio import library, sample_room


def cache_root() -> Path:
    return Path(os.environ.get("BODY_STUDIO_TEST_CACHE") or Path.home() / ".cache" / "body-studio-tests")


def key() -> str:
    """A hash of every .py file in the app's package: what draws the rooms and builds their maps."""
    h = hashlib.sha256()
    pkg = Path(sample_room.__file__).parent
    for p in sorted(pkg.glob("*.py")):
        h.update(p.name.encode() + b"\0" + p.read_bytes())
    return h.hexdigest()[:16]


def names() -> list:
    return [sample_room.NAME, library.STUDIO, library.VENUE]


def ensure(data_root: Path) -> None:
    """The sample rooms in data_root, as sample_room.ensure leaves them, from the cache when it has them."""
    cache = cache_root() / "samples" / key()
    if not (cache / "done").is_file():
        tmp = cache.with_name(cache.name + ".%d" % os.getpid())
        shutil.rmtree(tmp, ignore_errors=True)
        for name in names():
            sample_room.ensure(tmp, name)
        (tmp / "done").write_text("")
        try:
            tmp.rename(cache)                      # (another process may have made them meanwhile)
        except OSError:
            shutil.rmtree(tmp, ignore_errors=True)
    for name in names():
        shutil.copytree(cache / "workspace" / name, Path(data_root) / "workspace" / name)
        library.mark_room(data_root, name)
