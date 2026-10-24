"""The app in a real browser, with synthetic bodies, for the browser tests (tests/browser/test_*.py,
one file per part of the page; CI runs them in shards, .github/workflows/ci.yml). Needs `pip install
playwright` and a Chromium (CI installs both); skipped otherwise. Set BODY_STUDIO_CHROMIUM to use a
Chromium that's already installed. One data folder, server and browser serve every test file run in
the same process, started by the first and closed at exit."""
import atexit
import os
import struct
import tempfile
import threading
import unittest
import zlib
from http.server import ThreadingHTTPServer
from pathlib import Path
from types import SimpleNamespace

from splat_studio.server.jobs import Runner
from splat_studio.server.library import DataDir

from body_studio import library, server
from tests.fakes import samples
from tests.fakes.bodyply import write_body
from tests.fakes.makehuman import write_body as write_person
from tests.fakes.room import write_room

try:
    from playwright.sync_api import TimeoutError as PlaywrightTimeout, sync_playwright
except ImportError:  # pragma: no cover
    PlaywrightTimeout = TimeoutError
    sync_playwright = None

_shared = None


def _start():
    """The bodies, rooms and design every test uses, the server and the browser: once per process."""
    global _shared
    if _shared:
        return _shared
    tmp = tempfile.TemporaryDirectory()
    data = DataDir(Path(tmp.name))
    write_body(data.workspace / "Anna/run_20261012_120000/splat/standard_30000_object.ply", n=20000)
    write_person(data.workspace / "Mia/run_20261011_120000/splat/standard_30000_object.ply", n=60000)
    old = 1_700_000_000                          # older than Anna: Anna opens first
    os.utime(data.workspace / "Mia/run_20261011_120000/splat/standard_30000_object.ply", (old, old))
    write_room(data.workspace / "Living_room/run_20261021_120000", n=40000)    # a room filmed from inside
    library.mark_room(data.root, "Living_room")
    samples.ensure(data.root)           # there before the page opens, so they aren't made while tests run
    design = Path(tmp.name) / "design.png"
    design.write_bytes(arrow_png())
    # decor from a photo: tests/fakes/photo3d.py stands in for TripoSR
    env = {k: os.environ.get(k) for k in ("BODY_STUDIO_PHOTO3D",)}
    os.environ["BODY_STUDIO_PHOTO3D"] = str(Path(__file__).resolve().parents[1] / "fakes" / "photo3d.py")
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.make_handler(data, Runner(data, start=False)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    pw = sync_playwright().start()
    try:
        browser = pw.chromium.launch(
            executable_path=os.environ.get("BODY_STUDIO_CHROMIUM") or None,
            args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    except Exception:
        pw.stop()
        httpd.shutdown()
        tmp.cleanup()
        raise
    _shared = SimpleNamespace(tmp=tmp, design=design, httpd=httpd, url=f"http://127.0.0.1:{httpd.server_address[1]}/",
                              pw=pw, browser=browser, env=env)
    atexit.register(_stop)
    return _shared


def _stop():
    s = _shared
    s.browser.close()
    s.pw.stop()
    s.httpd.shutdown()
    s.httpd.server_close()
    s.tmp.cleanup()
    for k, v in s.env.items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v


@unittest.skipIf(sync_playwright is None, "playwright is not installed")
class Viewer(unittest.TestCase):
    """What every browser test starts from: self.url, self.browser, self.design (a tattoo design
    PNG), self.new_page() and self.open_page()."""

    @classmethod
    def setUpClass(cls):
        s = _start()
        cls.url, cls.browser, cls.design, cls.httpd = s.url, s.browser, s.design, s.httpd

    def new_page(self, **kw):
        """A page in no mode at first: just the body, every tool reachable from code, no room or
        panel of its own (each test opens what it needs; test_the_menu_shows_each_mode_its_tools
        checks the modes, and test_clothes_go_on_and_come_off the clothes one a computer opens in)."""
        # reduced motion: no CSS transitions to wait out (software rendering never settles them)
        page = self.browser.new_page(**{"reduced_motion": "reduce", **kw})
        page.add_init_script("localStorage.getItem('mode') === null && localStorage.setItem('mode', 'none')")
        return page

    def open_page(self, url=None, **kw):
        """For a new test: a page in no mode with the body loaded, closed when the test ends, and
        the list its errors collect in (assert it's empty at the end)."""
        page = self.new_page(**{"viewport": {"width": 1280, "height": 800}, **kw})
        self.addCleanup(page.close)              # (a failed test leaves no page rendering behind)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: m.type == "error" and errors.append(m.text))
        page.goto(url or self.url)
        page.wait_for_function("window.bodyViewer && bodyViewer.numSplats() > 0", timeout=60000)
        return page, errors



def off_rack(page):
    """The items the panel's list shows (sorted)."""
    return sorted(page.evaluate("[...document.querySelectorAll('#wearPick button')].filter((b) => b.offsetParent).map((b) => b.dataset.item)"))


def pick(page, item):
    """Click an item on the racks around the body, where it shows on the screen."""
    # (after a reload the camera may still be moving to frame the shop: wait until the item stays
    # put over a few frames)
    page.wait_for_function(f"""(() => {{
        const a = wardrobe.onScreen('{item}'), v = bodyApp.viewer.spark.current.version, b = window._pickAt;
        if (!a) return false;
        if (!b || Math.hypot(a.x - b.x, a.y - b.y) > 2) {{ window._pickAt = {{ ...a, v, n: 0 }}; return false; }}
        if (v !== b.v) {{ b.v = v; b.n++; }} else b.still = (b.still || 0) + 1;
        return b.n >= 3 || b.still >= 20;
    }})()""", polling="raf", timeout=120000)
    at = page.evaluate(f"wardrobe.onScreen('{item}')")
    page.mouse.click(at["x"], at["y"])


def settled(page):
    """Wait until the loading screen is gone and the splats on screen are the latest ones."""
    page.wait_for_function("document.getElementById('busy').hidden", timeout=300000)
    page.wait_for_function("tattooStudio.tattoos().every((t) => t.inked)", timeout=60000)
    # Spark makes them again only when something changed, and `current` can be swapped for
    # another of its buffers with its own count: so either three new versions, or twenty frames
    # drawn with the shown buffer the latest and no new version
    page.evaluate("window._settle = { v: bodyApp.viewer.spark.current.version, n: 0, still: 0 }")
    page.wait_for_function("""(() => { const s = window._settle, S = bodyApp.viewer.spark, v = S.current.version;
        if (v !== s.v) { s.v = v; s.n++; s.still = 0; } else if (S.display === S.current) s.still++;
        return s.n >= 3 || s.still >= 20; })()""", polling="raf", timeout=300000)


def ink_pixels(page, at, r=40):
    """How many pixels around point `at` (body coordinates) the first tattoo's ink changes: the
    page with the ink as it is, against the page with the faintest ink."""
    x, y = page.evaluate(f"tattooStudio.screen({at})")
    clip = {"x": max(0, x - r), "y": max(0, y - r), "width": 2 * r, "height": 2 * r}
    before = page.evaluate("tattooStudio.ink(0)")
    shots = []
    for ink in (before, 0.2):
        page.evaluate(f"tattooStudio.ink(0, {ink})")
        settled(page)
        shots.append(png_pixels(page.screenshot(clip=clip, timeout=180000)))   # (software rendering is slow)
    page.evaluate(f"tattooStudio.ink(0, {before})")
    settled(page)
    (w, h, a), (_, _, b) = shots
    return sum(1 for i in range(0, w * h * 4, 4) if sum(abs(a[i + k] - b[i + k]) for k in range(3)) > 60)


def png_pixels(data: bytes):
    """(width, height, RGBA bytes) of an 8-bit RGB or RGBA PNG (what screenshots are)."""
    pos, idat, w, h, ch = 8, b"", 0, 0, 4
    while pos < len(data):
        n, kind = struct.unpack(">I4s", data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + n]
        if kind == b"IHDR":
            w, h, depth, colour = struct.unpack(">IIBB", body[:10])
            assert depth == 8 and colour in (2, 6)
            ch = 4 if colour == 6 else 3
        elif kind == b"IDAT":
            idat += body
        pos += 12 + n
    raw, out, prev, stride = zlib.decompress(idat), bytearray(), bytearray(w * ch), w * ch
    for row in range(h):
        f, line = raw[row * (stride + 1)], bytearray(raw[row * (stride + 1) + 1:(row + 1) * (stride + 1)])
        for i in range(stride):
            a = line[i - ch] if i >= ch else 0
            b, c = prev[i], prev[i - ch] if i >= ch else 0
            if f == 1: line[i] = (line[i] + a) & 255
            elif f == 2: line[i] = (line[i] + b) & 255
            elif f == 3: line[i] = (line[i] + (a + b) // 2) & 255
            elif f == 4:
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                line[i] = (line[i] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        prev = line
        for i in range(w):
            out += line[i * ch:i * ch + 3] + (line[i * ch + 3:i * ch + 4] if ch == 4 else b"\xff")
    return w, h, out


def dist(a, b):
    return sum((x - y) ** 2 for x, y in zip(a, b)) ** 0.5


def arrow_png(w=160, h=80) -> bytes:
    """A black arrow on white, like a scanned tattoo design."""
    rows = b"".join(b"\0" + b"".join(b"\x14\x14\x14" if (abs(y - h / 2) < 8 and 10 < x < 110) or
                                       (x >= 110 and abs(y - h / 2) < 150 - x) else b"\xff\xff\xff"
                                       for x in range(w)) for y in range(h))

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b""))
