"""Decor (decor.py, photo3d.py): items made from photos, the packed meshes the page draws, the
layouts kept per room, and the server's /api/decor routes, with tests/fakes/photo3d.py standing in
for TripoSR."""
import io
import json
import os
import sys
import tarfile
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest import mock

from splat_studio.server.jobs import Runner
from splat_studio.server.library import DataDir

from body_studio import decor, photo3d, server
from tests.fakes import photo3d as fake
from tests.fakes.room import write_room

ROOT = Path(__file__).resolve().parents[2]
FAKE = str(ROOT / "tests" / "fakes" / "photo3d.py")
PNG = bytes.fromhex("89504e470d0a1a0a0000000d4948445200000001000000010806000000"
                    "1f15c4890000000d49444154789c63f8cfc0f01f0005000201a5d1c9a50000000049454e44ae426082")


def wait(pred, timeout=20):
    end = time.time() + timeout
    while time.time() < end:
        if pred():
            return True
        time.sleep(0.05)
    return False


class Meshes(unittest.TestCase):
    def test_stand_turns_triposr_upright_facing_front(self):
        v, c, f = fake.cone()
        s = decor.stand(v)
        ys, xs, zs = s[1::3], s[0::3], s[2::3]
        self.assertAlmostEqual(min(ys), 0, places=6)
        self.assertAlmostEqual(max(ys), 1, places=6)            # 1 high
        self.assertAlmostEqual((max(xs) + min(xs)) / 2, 0, places=6)
        self.assertAlmostEqual((max(zs) + min(zs)) / 2, 0, places=6)
        tip, nose = len(v) // 3 - 3, len(v) // 3 - 1
        self.assertAlmostEqual(s[3 * tip + 1], 1, places=6)      # TripoSR's z is up
        self.assertGreater(s[3 * nose + 2], 0.2)                 # the camera's side (+x) is the front (+z)
        self.assertAlmostEqual(s[3 * nose], 0, places=6)

    def test_turn_keeps_handedness(self):
        # a right-handed corner stays right-handed: x cross y is still z
        s = decor.stand([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], turn=True)
        o = s[0:3]
        ex, ey, ez = ([s[i + k] - o[k] for k in range(3)] for i in (3, 6, 9))
        cross = [ex[1] * ey[2] - ex[2] * ey[1], ex[2] * ey[0] - ex[0] * ey[2], ex[0] * ey[1] - ex[1] * ey[0]]
        self.assertGreater(sum(a * b for a, b in zip(cross, ez)), 0)

    def test_simplify_merges_close_vertices_and_drops_collapsed_faces(self):
        # two triangles sharing an edge, one of them tiny: it collapses
        v = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0.001, 0.001, 0, 0.002, 0.001, 0]
        c = [255, 0, 0] * 3 + [0, 0, 255] * 2
        f = [0, 1, 2, 0, 3, 4]
        nv, nc, nf = decor.simplify(v, c, f, cells=10)
        self.assertEqual(len(nf), 3)
        self.assertEqual(len(nv), 9)
        self.assertEqual(len(nc), 9)
        self.assertLessEqual(max(nf), 2)

    def test_simplify_a_dense_mesh_to_its_grid(self):
        n, v, c, f = 120, [], [], []
        for i in range(n):
            for k in range(n):
                v += [i / n, k / n, 0.0]
                c += [100, 150, 200]
        for i in range(n - 1):
            for k in range(n - 1):
                a = i * n + k
                f += [a, a + 1, a + n, a + 1, a + n + 1, a + n]
        nv, nc, nf = decor.simplify(v, c, f, cells=30)
        self.assertLess(len(nv) // 3, 32 * 32)
        self.assertGreater(len(nf) // 3, 30 * 30)               # the sheet is still whole
        self.assertEqual(set(nc), {100, 150, 200})

    def test_pack_round_trip(self):
        v, c, f = fake.cone()
        v = decor.stand(v)
        c = [round(x * 255) for x in c]
        m = decor.pack(v, c, f)
        v2, c2, f2 = decor.unpack(m)
        self.assertEqual(f2, f)
        self.assertEqual(c2, c)
        self.assertLess(max(abs(a - b) for a, b in zip(v, v2)), 1e-4)
        json.dumps(m)

    def test_finish_checks_the_raw_mesh(self):
        v, c, f = fake.cone()
        m = decor.finish({"v": v, "c": c, "f": f})
        self.assertEqual(m["version"], 1)
        self.assertAlmostEqual(m["hi"][1] - m["lo"][1], 1, places=5)
        for bad in ({"v": [], "c": [], "f": []}, {"v": v, "c": c[:-3], "f": f}, {"v": v, "c": c, "f": f + [0, 1, 9999]}):
            with self.assertRaises(decor.DecorError):
                decor.finish(bad)


class Inventory(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.d = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_starters_come_first(self):
        items = decor.items(self.d)
        self.assertEqual([i["id"] for i in items], [s["id"] for s in decor.STARTERS])
        self.assertTrue(all(i["kind"] == "starter" for i in items))

    def test_add_photo_checks_it(self):
        with self.assertRaises(decor.DecorError) as e:
            decor.add_photo(self.d, PNG, ".gif", "x", 1)
        self.assertEqual(e.exception.code, "photo_type")
        with self.assertRaises(decor.DecorError) as e:
            decor.add_photo(self.d, b"", ".png", "x", 1)
        self.assertEqual(e.exception.code, "photo_size")
        for h in ("tall", -1, 0, 7, float("nan")):
            with self.assertRaises(decor.DecorError):
                decor.add_photo(self.d, PNG, ".png", "x", h)

    def test_made_by_the_maker_in_the_background(self):
        a = decor.add_photo(self.d, PNG, ".png", "  Flower   arch ", "2.2")
        self.assertEqual(a["name"], "Flower arch")
        self.assertEqual(a["status"], "working")
        b = decor.add_photo(self.d, PNG, ".png", "", 0.5)
        self.assertNotEqual(a["id"], b["id"])
        self.assertEqual(b["name"], "Photo")
        with mock.patch.dict(os.environ, {"BODY_STUDIO_PHOTO3D": FAKE}):
            decor.Maker(self.d)                                  # picks up both, left "working"
            self.assertTrue(wait(lambda: all(decor.load_item(self.d, i)["status"] == "ready" for i in (a["id"], b["id"]))))
        self.assertTrue(decor.mesh_file(self.d, a["id"]).is_file())
        self.assertEqual(decor.photo_file(self.d, a["id"]).suffix, ".png")
        self.assertFalse((decor.item_dir(self.d, a["id"]) / "raw.json").exists())
        made = [i for i in decor.items(self.d) if i["kind"] == "photo"]
        self.assertEqual([i["id"] for i in made], [b["id"], a["id"]])       # newest first

    def test_a_failure_is_kept_on_the_item(self):
        a = decor.add_photo(self.d, b"FAIL", ".png", "x", 1)
        with mock.patch.dict(os.environ, {"BODY_STUDIO_PHOTO3D": FAKE}):
            decor.Maker(self.d, resume=False).make_one(a["id"])
        item = decor.load_item(self.d, a["id"])
        self.assertEqual(item["status"], "failed")
        self.assertEqual(item["code"], "photo3d")
        self.assertIn("the model broke", item["error"])

    def test_change_and_delete(self):
        a = decor.add_photo(self.d, PNG, ".jpeg", "x", 1)
        self.assertEqual(decor.photo_file(self.d, a["id"]).suffix, ".jpg")
        self.assertEqual(decor.change_item(self.d, a["id"], {"name": "Vase", "height": 0.4, "on": "top"})["on"], "top")
        with self.assertRaises(decor.DecorError):
            decor.change_item(self.d, a["id"], {"on": "ceiling"})
        decor.delete_item(self.d, a["id"])
        with self.assertRaises(decor.DecorError) as e:
            decor.load_item(self.d, a["id"])
        self.assertEqual(e.exception.code, "no_item")
        self.assertIsNone(decor.item_dir(self.d, "../../etc"))

    def test_layouts(self):
        room = "workspace/Hall/run_1/splat/standard_30000_clean.ply"
        self.assertEqual(decor.load_layouts(self.d, room)["layouts"][0]["items"], [])
        saved = decor.save_layouts(self.d, room, {"current": 1, "layouts": [
            {"name": "Rustic", "items": [{"item": "chair", "x": 1, "z": 2, "turn": 0.5, "colour": "wood"}]},
            {"name": "", "items": [{"item": "pabc1234", "x": 0, "y": 0.76, "z": 0}]}]})
        self.assertEqual(saved["current"], 1)
        self.assertEqual(saved["layouts"][1]["name"], "Layout")
        self.assertEqual(decor.load_layouts(self.d, room), saved)
        turned = decor.clean_layouts({"layouts": [{"items": [{"item": "chair", "x": 0, "z": 0, "turn": 10.4}]}]})
        self.assertAlmostEqual(turned["layouts"][0]["items"][0]["turn"], 10.4 - 4 * 3.141592653589793, places=3)
        self.assertTrue(decor.layout_file(self.d, room).parent.samefile(self.d / "decor" / "layouts"))
        for bad in (None, {"layouts": []}, {"layouts": [{"items": [{"item": "sofa", "x": 0, "z": 0}]}]},
                    {"layouts": [{"items": [{"item": "chair", "x": "a", "z": 0}]}]},
                    {"layouts": [{"items": [{"item": "chair", "x": 0, "z": 0, "colour": "plaid"}]}]},
                    {"layouts": [{"items": [{"item": "chair", "x": 1e9, "z": 0}]}]}):
            with self.assertRaises(decor.DecorError):
                decor.save_layouts(self.d, room, bad)


class Photo3d(unittest.TestCase):
    def test_requirements_match_the_extra(self):
        text = (ROOT / "pyproject.toml").read_text()
        line = text[text.index("photo3d = ["):]
        line = line[:line.index("]") + 1]
        self.assertEqual(json.loads(line.split("=", 1)[1]), list(photo3d.REQUIRES))

    def test_fetch_source_keeps_only_its_code(self):
        with tempfile.TemporaryDirectory() as tmp:
            buf = io.BytesIO()
            with tarfile.open(fileobj=buf, mode="w:gz") as tar:
                for name, data in ((f"TripoSR-{photo3d.COMMIT}/tsr/system.py", b"x = 1\n"),
                                   (f"TripoSR-{photo3d.COMMIT}/tsr/models/a.py", b""),
                                   (f"TripoSR-{photo3d.COMMIT}/LICENSE", b"MIT"),
                                   (f"TripoSR-{photo3d.COMMIT}/gradio_app.py", b"no"),
                                   (f"TripoSR-{photo3d.COMMIT}/../evil.py", b"no")):
                    info = tarfile.TarInfo(name)
                    info.size = len(data)
                    tar.addfile(info, io.BytesIO(data))
            arc = Path(tmp) / "a.tar.gz"
            arc.write_bytes(buf.getvalue())
            dest = photo3d.fetch_source(arc.as_uri(), Path(tmp) / "src")
            got = sorted(p.relative_to(dest).as_posix() for p in dest.rglob("*") if p.is_file())
            self.assertEqual(got, ["LICENSE", "tsr/models/a.py", "tsr/system.py"])
            self.assertFalse((Path(tmp) / "evil.py").exists())

    def test_make_reports_the_worker_failing(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.dict(os.environ, {"BODY_STUDIO_PHOTO3D": FAKE}):
            photo = Path(tmp) / "a.png"
            photo.write_bytes(b"FAIL")
            with self.assertRaises(photo3d.Failed) as e:
                photo3d.make(photo, Path(tmp) / "out.json")
            self.assertIn("the model broke", str(e.exception))

    def test_not_available_without_its_code(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.dict(os.environ, {"BODY_STUDIO_CACHE": tmp}):
            self.assertFalse(photo3d.available())
            self.assertTrue(str(photo3d.source()).startswith(tmp))

    @unittest.skipUnless(__import__("importlib").util.find_spec("mcubes") and __import__("importlib").util.find_spec("torch"),
                         "needs PyMCubes and PyTorch")
    def test_marching_cubes_stand_in_orders_axes_like_torchmcubes(self):  # pragma: no cover
        import torch
        photo3d._mcubes_shim()
        from torchmcubes import marching_cubes
        g = torch.stack(torch.meshgrid(*(torch.arange(32.0),) * 3, indexing="ij"))
        vol = ((g[0] - 8) ** 2 + (g[1] - 14) ** 2 + (g[2] - 20) ** 2).sqrt() - 4
        v, f = marching_cubes(vol, 0.0)
        self.assertEqual([round(x) for x in v.mean(0).tolist()], [20, 14, 8])   # last axis first


class Routes(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.data = DataDir(Path(self.tmp.name))
        self.room = write_room(self.data.workspace / "Hall/run_20261021_120000", n=3000)
        self._env = mock.patch.dict(os.environ, {"BODY_STUDIO_PHOTO3D": FAKE})
        self._env.start()
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.make_handler(self.data, Runner(self.data, start=False)))
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.base = f"http://127.0.0.1:{self.httpd.server_address[1]}"

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self._env.stop()
        self.tmp.cleanup()

    def call(self, path, body=None, method=None):
        data = body if isinstance(body, bytes) or body is None else json.dumps(body).encode()
        req = urllib.request.Request(self.base + path, data=data, method=method)
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                raw = r.read()
                return r.status, (json.loads(raw) if r.headers.get("Content-Type") == "application/json" else raw)
        except urllib.error.HTTPError as e:
            raw = e.read()
            try:
                return e.code, json.loads(raw)
            except ValueError:
                return e.code, raw

    def test_photo_to_placed_item(self):
        code, item = self.call("/api/decor/photo?name=arch.png&label=Flower%20arch&height=2.2", PNG)
        self.assertEqual(code, 201)
        self.assertEqual((item["name"], item["height"], item["status"]), ("Flower arch", 2.2, "working"))
        self.assertTrue(wait(lambda: self.call(f"/api/decor")[1][-1]["status"] == "ready"))
        code, mesh = self.call(f"/api/decor/{item['id']}/mesh")
        self.assertEqual(code, 200)
        self.assertEqual(mesh["version"], 1)
        code, photo = self.call(f"/api/decor/{item['id']}/photo")
        self.assertEqual((code, photo), (200, PNG))
        self.assertEqual(self.call(f"/api/decor/{item['id']}", {"height": 2.4})[1]["height"], 2.4)
        self.assertEqual(self.call(f"/api/decor/{item['id']}", {"height": 99})[0], 400)
        room = self.room.relative_to(self.data.root).as_posix() if self.room.is_absolute() else str(self.room)
        lay = {"current": 0, "layouts": [{"name": "Venue", "items": [{"item": item["id"], "x": 0.5, "z": 0, "turn": 0},
                                                                      {"item": "chair", "x": 1, "z": 1, "turn": 3.1}]}]}
        self.assertEqual(self.call("/api/decor/layout?room=" + room, lay)[0], 201)
        self.assertEqual(self.call("/api/decor/layout?room=" + room)[1]["layouts"][0]["name"], "Venue")
        self.assertEqual(self.call("/api/decor/layout?room=workspace/nope.ply")[0], 404)
        self.assertEqual(self.call("/api/decor/layout?room=" + room, b"{bad")[0], 400)
        self.assertEqual(self.call(f"/api/decor/{item['id']}", method="DELETE")[0], 200)
        self.assertEqual(self.call(f"/api/decor/{item['id']}/mesh")[0], 404)
        self.assertEqual(self.call(f"/api/decor/{item['id']}", method="DELETE")[0], 404)

    def test_retry_a_failed_item(self):
        code, item = self.call("/api/decor/photo?name=a.png&height=1", b"FAIL")
        self.assertTrue(wait(lambda: self.call("/api/decor")[1][-1]["status"] == "failed"))
        self.assertIn("the model broke", self.call("/api/decor")[1][-1]["error"])
        decor.photo_file(self.data.root, item["id"]).write_bytes(PNG)     # (say, the install is fixed)
        self.assertEqual(self.call(f"/api/decor/{item['id']}/retry", {})[1]["status"], "working")
        self.assertTrue(wait(lambda: self.call("/api/decor")[1][-1]["status"] == "ready"))
        self.assertEqual(self.call("/api/decor/photo?name=x.gif&height=1", PNG)[1]["code"], "photo_type")

    def test_bad_requests(self):
        self.assertEqual(self.call("/api/decor/pnope1234", {"name": "x"})[0], 404)
        self.assertEqual(self.call("/api/decor/photo?name=a.png", b"")[0], 400)
        self.assertEqual(self.call("/api/decor/nothing/else", {})[0], 404)


if __name__ == "__main__":
    unittest.main()
