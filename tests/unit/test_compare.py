"""Matching a room to a video of the real place (compare.py and its routes in server.py)."""
import io
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from http.server import ThreadingHTTPServer
from pathlib import Path

from splat_studio.server.jobs import Runner
from splat_studio.server.library import DataDir

from body_studio import compare, server
from tests.fakes.room import write_room

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64 + b"\xff\xd9"
VIEW = {"at": [1.5, -2.25], "look": 0.4, "pitch": -0.1, "eye": 1.45, "fov": 72}


class Compare(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.d = Path(self.tmp.name)
        self.room = "workspace/Venue/run_1/splat/venue.ply"

    def tearDown(self):
        self.tmp.cleanup()

    def test_views_tags_and_pictures_kept_per_room(self):
        self.assertEqual(compare.state(self.d, self.room), {"room": self.room, "video": None, "views": []})
        st = compare.save_video(self.d, self.room, [b"a" * 10, b"b" * 6], 16, "Walkthrough.MP4")
        self.assertEqual(st["video"], "video.mp4")
        self.assertEqual(compare.video_file(self.d, self.room).read_bytes(), b"a" * 10 + b"b" * 6)
        # a new video replaces the old (one per room), even of another kind
        compare.save_video(self.d, self.room, [b"w" * 4], 4, "again.webm")
        self.assertEqual([f.name for f in compare.folder(self.d, self.room).glob("video.*")], ["video.webm"])
        with self.assertRaises(compare.CompareError):
            compare.save_video(self.d, self.room, [b"x"], 1, "notes.txt")
        with self.assertRaises(compare.CompareError):
            compare.save_video(self.d, self.room, [b"x"], 5, "cut.mp4")     # (fewer bytes than said)
        self.assertEqual(compare.state(self.d, self.room)["video"], "video.webm")
        # views, kept in the video's order; one changed, its tags added
        late = compare.save_view(self.d, self.room, {"t": 83.5, "view": VIEW})["id"]
        early = compare.save_view(self.d, self.room, {"t": 12, "view": VIEW, "tags": [
            {"x": 0.25, "y": 0.5, "kind": "missing", "note": "  An exit sign over the door  "}]})["id"]
        st = compare.state(self.d, self.room)
        self.assertEqual([v["id"] for v in st["views"]], [early, late])
        self.assertEqual(st["views"][0]["tags"][0]["note"], "An exit sign over the door")
        compare.save_view(self.d, self.room, {"id": late, "t": 83.5, "view": {**VIEW, "fov": 90},
                                              "tags": [{"x": 1, "y": 0, "kind": "wrong", "note": "the skirting is wood", "on": "room"}]})
        st = compare.state(self.d, self.room)
        self.assertEqual((st["views"][1]["view"]["fov"], st["views"][1]["tags"][0]["kind"]), (90, "wrong"))
        # the side a tag was placed on: the room's, or the video's when not said
        self.assertEqual([st["views"][0]["tags"][0]["on"], st["views"][1]["tags"][0]["on"]], ["video", "room"])
        for bad in ({"t": -1, "view": VIEW}, {"t": 1, "view": {**VIEW, "at": [1]}}, {"t": 1, "view": {**VIEW, "fov": 400}},
                    {"t": 1, "view": VIEW, "tags": [{"x": 2, "y": 0, "kind": "missing"}]},
                    {"t": 1, "view": VIEW, "tags": [{"x": 0, "y": 0, "kind": "maybe"}]},
                    {"t": 1, "view": VIEW, "tags": [{"x": 0, "y": 0, "kind": "note", "on": "left"}]},
                    {"id": "abcdef1234", "t": 1, "view": VIEW}, "not a dict"):
            with self.assertRaises(compare.CompareError, msg=bad):
                compare.save_view(self.d, self.room, bad)
        # each with a picture of the frame and of the render
        compare.save_snap(self.d, self.room, early, "video", JPEG)
        compare.save_snap(self.d, self.room, early, "render", JPEG)
        with self.assertRaises(compare.CompareError):
            compare.save_snap(self.d, self.room, early, "video", b"\x89PNG")
        with self.assertRaises(compare.CompareError):
            compare.save_snap(self.d, self.room, early, "../x", JPEG)
        # the export: a list to work through, the views and the pictures (not the video)
        z = zipfile.ZipFile(io.BytesIO(compare.export(self.d, self.room)))
        self.assertEqual(sorted(z.namelist()), ["notes.md", "snaps/%s-render.jpg" % early, "snaps/%s-video.jpg" % early, "views.json"])
        notes = z.read("notes.md").decode()
        self.assertIn("## 0:12.0", notes)
        self.assertIn("## 1:23.5", notes)
        self.assertIn("1. **missing** at (0.25, 0.50): An exit sign over the door", notes)
        self.assertIn("1. **wrong** at (1.00, 0.00) on the render: the skirting is wood", notes)
        self.assertEqual(json.loads(z.read("views.json"))["views"][1]["id"], late)
        # forgotten, with its pictures
        compare.delete_view(self.d, self.room, early)
        self.assertFalse(compare.snap_file(self.d, self.room, early, "video").exists())
        self.assertEqual([v["id"] for v in compare.state(self.d, self.room)["views"]], [late])
        with self.assertRaises(compare.CompareError):
            compare.delete_view(self.d, self.room, early)
        # another room has its own
        self.assertEqual(compare.state(self.d, "workspace/Hall/run_2/splat/hall.ply")["views"], [])

    def test_clock(self):
        self.assertEqual([compare.clock(t) for t in (0, 9.94, 83.5, 600)], ["0:00.0", "0:09.9", "1:23.5", "10:00.0"])


class Routes(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.data = DataDir(Path(self.tmp.name))
        ply = write_room(self.data.workspace / "Hall/run_20261021_120000", n=2000)
        self.room = urllib.parse.quote(Path(ply).resolve().relative_to(self.data.root.resolve()).as_posix())
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.make_handler(self.data, Runner(self.data, start=False)))
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.base = f"http://127.0.0.1:{self.httpd.server_address[1]}"

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.tmp.cleanup()

    def call(self, path, body=None, method=None):
        data = body if isinstance(body, bytes) or body is None else json.dumps(body).encode()
        req = urllib.request.Request(self.base + path, data=data, method=method)
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                raw = r.read()
                return r.status, (json.loads(raw) if r.headers.get("Content-Type") == "application/json" else raw), r.headers
        except urllib.error.HTTPError as e:
            raw = e.read()
            try:
                return e.code, json.loads(raw), e.headers
            except ValueError:
                return e.code, raw, e.headers

    def test_the_pages_routes(self):
        r = "room=" + self.room
        self.assertEqual(self.call("/api/compare?" + r)[1]["views"], [])
        self.assertEqual(self.call("/api/compare?room=workspace/nope.ply")[0], 404)
        self.assertEqual(self.call(f"/api/compare/video?name=walk.mov&{r}", b"moov" * 100)[:2], (201, {
            "room": urllib.parse.unquote(self.room), "video": "video.mov", "views": []}))
        self.assertEqual(self.call(f"/api/compare/video?name=walk.gif&{r}", b"GIF8")[0], 400)
        code, raw, _ = self.call("/api/compare/video?" + r)
        self.assertEqual((code, raw), (200, b"moov" * 100))
        code, d, _ = self.call("/api/compare/view?" + r, {"t": 3.5, "view": VIEW})
        self.assertEqual(code, 201)
        vid = d["id"]
        self.assertEqual(self.call("/api/compare/view?" + r, b"{nope")[0], 400)
        self.assertEqual(self.call(f"/api/compare/snap?id={vid}&which=render&{r}", JPEG)[0], 201)
        self.assertEqual(self.call(f"/api/compare/snap?id={vid}&which=render&{r}")[1], JPEG)
        self.assertEqual(self.call(f"/api/compare/snap?id=zzzzzz&which=render&{r}", JPEG)[0], 404)
        code, raw, h = self.call("/api/compare/export?" + r)
        self.assertEqual((code, h["Content-Type"]), (200, "application/zip"))
        self.assertIn("attachment", h["Content-Disposition"])
        self.assertIn("notes.md", zipfile.ZipFile(io.BytesIO(raw)).namelist())
        self.assertEqual(self.call(f"/api/compare/view/{vid}?{r}", method="DELETE")[1]["views"], [])
        self.assertEqual(self.call(f"/api/compare/view/{vid}?{r}", method="DELETE")[0], 404)


if __name__ == "__main__":
    unittest.main()
