"""Make it a photo (photoreal.py): the picture's size and the model's settings, mflux's command
line (checked by a stand-in that takes mflux's flags), the pictures kept and made one at a time,
and the server's /api/photoreal. mflux itself only runs on a Mac with Apple silicon."""
import json
import os
import struct
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
import zlib
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest import mock

from splat_studio.server.jobs import Runner
from splat_studio.server.library import DataDir

from body_studio import photoreal, server

ROOT = Path(__file__).resolve().parents[2]
FAKE = str(ROOT / "tests" / "fakes" / "photoreal.py")


def png(w=40, h=25) -> bytes:
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    raw = b"".join(b"\x00" + bytes([200, 120, 60]) * w for _ in range(h))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


def wait(f, timeout=30):
    t = time.time()
    while time.time() - t < timeout:
        v = f()
        if v:
            return v
        time.sleep(0.05)
    raise AssertionError("timed out")


class Settings(unittest.TestCase):
    def test_size_keeps_the_photo_s_shape_in_sixteens(self):
        self.assertEqual(photoreal.size(1600, 1000), (1024, 640))
        w, h = photoreal.size(780, 1688)
        self.assertEqual(h, 1024)
        self.assertEqual((w % 16, h % 16), (0, 0))
        self.assertAlmostEqual(w / h, 780 / 1688, delta=0.02)
        with self.assertRaises(photoreal.Failed):
            photoreal.size(0, 10)

    def test_bits_by_memory(self):
        self.assertEqual(photoreal.bits(16), 4)
        self.assertEqual(photoreal.bits(24), 4)
        self.assertEqual(photoreal.bits(32), 8)
        self.assertEqual(photoreal.bits(0), 4)             # can't tell: the small one

    def test_png_size(self):
        self.assertEqual(photoreal.png_size(png(33, 17)), (33, 17))
        with self.assertRaises(photoreal.Failed):
            photoreal.png_size(b"\xff\xd8\xff\xe0 a jpeg")

    def test_command_line(self):
        a = photoreal.args(Path("in.png"), Path("out.png"), 1024, 640, 8, "mflux-generate-flux2-edit")
        self.assertEqual(a[0], "mflux-generate-flux2-edit")
        flags = dict(zip(a[1::2], a[2::2]))
        self.assertEqual(flags["--model"], "flux2-klein-4b")
        self.assertEqual(flags["--image-paths"], "in.png")
        self.assertEqual((flags["--width"], flags["--height"], flags["-q"]), ("1024", "640", "8"))
        self.assertEqual(flags["--steps"], "4")                  # klein is distilled
        self.assertIn("Keep every object", flags["--prompt"])

    def test_only_on_a_mac_with_apple_silicon(self):
        with mock.patch.object(photoreal.sys, "platform", "linux"):
            self.assertIn("Apple silicon", photoreal.supported())
            with self.assertRaises(photoreal.Missing):
                photoreal.install()
        with mock.patch.object(photoreal.sys, "platform", "darwin"), \
                mock.patch.object(photoreal.platform, "machine", return_value="arm64"), \
                mock.patch.object(photoreal, "base_python", return_value="/usr/bin/python3.12"):
            self.assertIsNone(photoreal.supported())

    def test_own_python_in_the_cache(self):
        with mock.patch.dict(os.environ, {"BODY_STUDIO_CACHE": "/tmp/bs-cache"}):
            self.assertEqual(photoreal.venv(), Path("/tmp/bs-cache/mflux"))
            self.assertIsNone(photoreal.command())


class Making(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.d = Path(self.tmp.name)
        p = mock.patch.dict(os.environ, {"BODY_STUDIO_PHOTOREAL": FAKE})
        p.start()
        self.addCleanup(p.stop)
        self.addCleanup(self.tmp.cleanup)

    def test_make_runs_the_model_on_the_photo(self):
        src = self.d / "p.png"
        src.write_bytes(png(1600, 1000))
        photoreal.make(src, self.d / "out.png")
        self.assertEqual((self.d / "out.png").read_bytes(), src.read_bytes())

    def test_a_failure_says_why(self):
        src = self.d / "fail.png"
        src.write_bytes(png())
        with self.assertRaisesRegex(photoreal.Failed, "out of memory"):
            photoreal.make(src, self.d / "out.png")

    def test_kept_and_made_in_the_background(self):
        st = photoreal.add(self.d, png())
        self.assertEqual(st["status"], "working")
        self.assertTrue(photoreal.valid_id(st["id"]))
        self.assertIsNotNone(photoreal.picture(self.d, st["id"], False))
        self.assertIsNone(photoreal.picture(self.d, st["id"], True))
        photoreal.Maker(self.d, resume=False).add(st["id"])
        done = wait(lambda: (photoreal.status(self.d, st["id"]) or {}).get("status") != "working" and photoreal.status(self.d, st["id"]))
        self.assertEqual(done["status"], "ready", done)
        self.assertIsNotNone(photoreal.picture(self.d, st["id"], True))

    def test_left_working_is_made_again_at_start(self):
        st = photoreal.add(self.d, png())
        photoreal.Maker(self.d)
        wait(lambda: (photoreal.status(self.d, st["id"]) or {}).get("status") == "ready")

    def test_failure_kept_with_its_reason(self):
        def broken(src, out, piece=False):
            raise photoreal.Failed("the image model stopped")
        st = photoreal.add(self.d, png())
        photoreal.Maker(self.d, make=broken, resume=False).add(st["id"])
        done = wait(lambda: (photoreal.status(self.d, st["id"]) or {}).get("status") == "failed" and photoreal.status(self.d, st["id"]))
        self.assertEqual((done["code"], done["error"]), ("photoreal", "the image model stopped"))

    def test_a_piece_is_made_smaller_with_its_own_prompt(self):
        a = photoreal.args(Path("in.png"), Path("out.png"), 768, 480, 4, piece=True)
        self.assertEqual(a[a.index("--prompt") + 1], photoreal.PIECE_PROMPT)
        self.assertNotEqual(photoreal.PIECE_PROMPT, photoreal.PROMPT)
        self.assertIn("decoration", photoreal.PIECE_PROMPT)
        self.assertEqual(photoreal.size(1024, 640, photoreal.PIECE_LONG), (768, 480))
        self.assertLess(photoreal.PIECE_LONG, photoreal.LONG)
        seen = []
        st = photoreal.add(self.d, png(), piece=True)
        self.assertTrue(st["piece"])
        self.assertFalse(photoreal.add(self.d, png())["piece"])
        photoreal.Maker(self.d, make=lambda src, out, piece: (seen.append(piece), out.write_bytes(png())), resume=False).add(st["id"])
        wait(lambda: (photoreal.status(self.d, st["id"]) or {}).get("status") == "ready")
        self.assertEqual(seen, [True])

    def test_ids_are_checked(self):
        self.assertIsNone(photoreal.status(self.d, "../../etc"))
        self.assertIsNone(photoreal.picture(self.d, "../x", True))
        with self.assertRaises(photoreal.Failed):
            photoreal.add(self.d, b"not a png")


class Api(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        p = mock.patch.dict(os.environ, {"BODY_STUDIO_PHOTOREAL": FAKE})
        p.start()
        self.addCleanup(p.stop)
        data = DataDir(Path(self.tmp.name) / "data")
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.make_handler(data, Runner(data, start=False)))
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.addCleanup(self.httpd.server_close)
        self.addCleanup(self.httpd.shutdown)
        self.base = f"http://127.0.0.1:{self.httpd.server_address[1]}"

    def test_post_then_poll_then_get_the_picture(self):
        body = png(64, 40)
        with urllib.request.urlopen(urllib.request.Request(self.base + "/api/photoreal", data=body, method="POST")) as r:
            self.assertEqual(r.status, 201)
            st = json.loads(r.read())
        pid = st["id"]

        def ready():
            with urllib.request.urlopen(f"{self.base}/api/photoreal/{pid}") as r:
                s = json.loads(r.read())
            return s if s["status"] != "working" else None
        self.assertEqual(wait(ready)["status"], "ready")
        with urllib.request.urlopen(f"{self.base}/api/photoreal/{pid}/real.png") as r:
            self.assertEqual(r.read(), body)
        with urllib.request.urlopen(f"{self.base}/api/photoreal/{pid}/photo.png") as r:
            self.assertEqual(r.headers["Content-Type"], "image/png")

    def test_a_piece_s_photo_is_marked(self):
        req = urllib.request.Request(self.base + "/api/photoreal?piece=1", data=png(64, 40), method="POST")
        with urllib.request.urlopen(req) as r:
            self.assertTrue(json.loads(r.read())["piece"])

    def test_bad_requests(self):
        with self.assertRaises(urllib.error.HTTPError) as e:
            urllib.request.urlopen(urllib.request.Request(self.base + "/api/photoreal", data=b"GIF89a", method="POST"))
        self.assertEqual(e.exception.code, 400)
        with self.assertRaises(urllib.error.HTTPError) as e:
            urllib.request.urlopen(self.base + "/api/photoreal/0123456789ab")
        self.assertEqual(e.exception.code, 404)

    def test_not_on_this_computer(self):
        with mock.patch.dict(os.environ, {"BODY_STUDIO_PHOTOREAL": ""}), \
                mock.patch.object(photoreal.sys, "platform", "linux"):
            with self.assertRaises(urllib.error.HTTPError) as e:
                urllib.request.urlopen(urllib.request.Request(self.base + "/api/photoreal", data=png(), method="POST"))
        self.assertEqual(e.exception.code, 400)
        self.assertEqual(json.loads(e.exception.read())["code"], "photoreal_unsupported")


if __name__ == "__main__":
    unittest.main()
