import json
import os
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

from unittest import mock

from splat_studio.server import jobs as splat_jobs
from splat_studio.server.library import DataDir

from body_studio import server
from tests.fakes.bodyply import write_body

# Stands in for splat-studio: reports its stages and writes a body where splat-studio would.
FAKE = r"""
import sys, pathlib
video = pathlib.Path(sys.argv[1])
run = pathlib.Path("workspace") / video.stem / "run_20261012_120000"
out = run / "splat"
out.mkdir(parents=True, exist_ok=True)
print("==> 1/3 Frames: frames/" + video.stem, flush=True)
print("==> 2/3 Camera poses (COLMAP): " + str(run.resolve()), flush=True)
print("==> 3/3 Training the splat (Brush)", flush=True)
for copy in ("clean", "object"):
    (out / f"standard_30000_{copy}.ply").write_bytes(b"ply\nformat binary_little_endian 1.0\nend_header\n")
print("Clean copy: " + str((out / "standard_30000_clean.ply").resolve()))
print("Object copy: " + str((out / "standard_30000_object.ply").resolve()))
"""


class Server(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.d = Path(self.tmp.name).resolve()
        fake = self.d / "fake.py"
        fake.write_text(FAKE)
        self.cmds = []

        def build_cmd(job):          # splat-studio's runner, with the pipeline swapped for FAKE
            self.cmds.append(splat_jobs.build_cmd.__wrapped__(job))
            return [sys.executable, str(fake), job.video]
        build_cmd.__wrapped__ = splat_jobs.build_cmd
        self._patches = [mock.patch.object(splat_jobs, "build_cmd", build_cmd),
                         mock.patch.dict(os.environ, {"SPLAT_STUDIO_TIMINGS": str(self.d / "timings.json"),
                                                      "SPLAT_STUDIO_RATES": str(self.d / "rates.json")})]
        for p in self._patches:
            p.start()
        data = DataDir(self.d / "data")
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.make_handler(data, splat_jobs.Runner(data)))
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.base = f"http://127.0.0.1:{self.httpd.server_address[1]}"

    def tearDown(self):
        for p in self._patches:
            p.stop()
        self.httpd.shutdown()
        self.httpd.server_close()
        self.tmp.cleanup()

    def get(self, path):
        with urllib.request.urlopen(self.base + path) as r:
            return r.status, r.read()

    def post(self, path, body, method="POST"):
        if isinstance(body, dict):
            body = json.dumps(body).encode()
        req = urllib.request.Request(self.base + path, data=body, method=method)
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def test_page_and_vendor_files_are_served(self):
        status, page = self.get("/")
        self.assertEqual(status, 200)
        self.assertIn(b"Body Studio", page)
        self.assertEqual(self.get("/vendor/spark/spark.module.min.js")[0], 200)
        self.assertEqual(self.get("/static/body.css")[0], 200)

    def test_upload_runs_and_the_body_appears(self):
        status, job = self.post("/api/upload?name=Anna%20front.mov", b"\x00" * 1024)
        self.assertEqual(status, 201)
        self.assertEqual(job["name"], "Anna_front")
        self.assertIn("--remove-background", self.cmds[0], "background removal must always run")
        for _ in range(200):
            jobs = json.loads(self.get("/api/jobs")[1])
            if jobs[0]["status"] in ("done", "failed"):
                break
            time.sleep(0.05)
        self.assertEqual(jobs[0]["status"], "done", jobs[0])
        self.assertEqual(jobs[0]["body"], "workspace/Anna_front/run_20261012_120000/splat/standard_30000_object.ply")
        bodies = json.loads(self.get("/api/bodies")[1])
        self.assertEqual([b["name"] for b in bodies], ["Anna_front"])
        self.assertEqual(self.get("/files/" + bodies[0]["file"])[0], 200)

    def test_a_room_is_uploaded_kept_whole_and_listed_as_a_room(self):
        status, job = self.post("/api/upload?name=Living%20room.mov&kind=room", b"\x00" * 1024)
        self.assertEqual((status, job["kind"]), (201, "room"))
        self.assertIn("--scene", self.cmds[0])
        self.assertNotIn("--remove-background", self.cmds[0])
        self.assertNotIn("--person", self.cmds[0])
        for _ in range(200):
            jobs = json.loads(self.get("/api/jobs")[1])
            if jobs[0]["status"] in ("done", "failed"):
                break
            time.sleep(0.05)
        self.assertEqual((jobs[0]["status"], jobs[0]["kind"]), ("done", "room"))
        self.assertEqual(json.loads(self.get("/api/bodies")[1]), [])
        for _ in range(900):                            # the sample rooms are made in another process
            rooms = json.loads(self.get("/api/rooms")[1])
            if len(rooms) > 2:
                break
            time.sleep(0.1)
        self.assertEqual([(r["name"], r["sample"]) for r in rooms], [("Living_room", False), ("_sample_room", True), ("_sample_studio", True)])
        self.assertEqual(self.post("/api/upload?name=house.zip&kind=room", b"PK")[0], 201)   # an iPhone capture
        self.assertEqual(self.post("/api/upload?name=house.zip", b"PK")[0], 400)             # but not a body

    def test_room_map_is_made_once_in_the_background(self):
        from tests.fakes.room import write_room
        ply = write_room(self.d / "data" / "workspace" / "Living" / "run_1", n=60000)
        url = "/api/room?room=workspace/Living/run_1/splat/" + ply.name
        deadline, statuses = time.time() + 60, []
        while time.time() < deadline:
            status, raw = self.get(url)
            statuses.append(status)
            if status != 202:
                break
            time.sleep(0.1)
        self.assertEqual((statuses[0], statuses[-1]), (202, 200))
        self.assertEqual(json.loads(raw)["scale_source"], "camera")
        self.assertTrue(ply.with_name(ply.stem + ".room.json").is_file())
        self.assertEqual(self.post("/api/room?room=../fake.py", None, method="GET")[1]["code"], "no_room")
        write_body(self.d / "data" / "workspace" / "Ball" / "run_1" / "splat" / "x.ply", n=600)
        deadline = time.time() + 60
        while time.time() < deadline:
            status, d = self.post("/api/room?room=workspace/Ball/run_1/splat/x.ply", None, method="GET")
            if status != 202:
                break
            time.sleep(0.1)
        self.assertEqual((status, d["code"]), (422, "few"))

    def test_rejects_non_video_and_paths_outside_workspace(self):
        self.assertEqual(self.post("/api/upload?name=notes.txt", b"x")[0], 400)
        with self.assertRaises(urllib.error.HTTPError) as e:
            self.get("/files/../../fake.py")
        self.assertEqual(e.exception.code, 404)

    def test_people_tape_and_scans_over_time(self):
        status, p = self.post("/api/people", {"name": "Anna", "sex": "f", "height_cm": 168})
        self.assertEqual(status, 201)
        self.assertEqual(p["person"]["id"], "anna")
        self.assertEqual(json.loads(self.get("/api/people")[1])[0]["name"], "Anna")
        self.post("/api/people/anna/tape", {"date": "2026-09-01", "waist_cm": 78, "neck_cm": 32, "hip_cm": 100})
        status, p = self.post("/api/people/anna/tape", {"date": "2026-10-12", "waist_cm": "75.5", "neck_cm": 32,
                                                        "hip_cm": 99})
        self.assertEqual(status, 201)
        self.assertEqual(p["tape"]["waist_cm"]["since_first"], -2.5)
        self.assertEqual(p["body_fat"]["equation"], "navy")

        run = "Anna/run_20261012_120000"
        write_body(self.d / "data" / "workspace" / run / "splat" / "standard_30000_object.ply")
        status, p = self.post("/api/people/anna/scans", {"body": run})
        self.assertEqual(status, 201)
        self.assertEqual(p["scans"][0]["date"], "2026-10-12")
        for _ in range(400):                    # measured in the background
            p = json.loads(self.get("/api/people/anna")[1])
            if p["scans"][0]["status"] != "measuring":
                break
            time.sleep(0.05)
        self.assertEqual(p["scans"][0]["status"], "done", p["scans"][0])
        self.assertIn("waist_cm", p["scans"][0]["measurements"])

        entry = p["entries"][0]["id"]
        status, p = self.post(f"/api/people/anna/entries/{entry}", b"", method="DELETE")
        self.assertEqual(status, 200)
        self.assertEqual(len(p["entries"]), 1)

    def test_people_errors_carry_a_code(self):
        self.assertEqual(self.post("/api/people", {"name": "Bo", "sex": "x", "height_cm": 170}),
                         (400, {"error": "sex must be m or f", "code": "bad_sex"}))
        self.assertEqual(self.post("/api/people/nobody/tape", {"waist_cm": 80})[0], 404)
        self.post("/api/people", {"name": "Bo", "sex": "m", "height_cm": 170})
        self.assertEqual(self.post("/api/people/bo/scans", {"body": "../../fake.py"})[1]["code"], "no_body")
        self.assertEqual(self.post("/api/people/bo/tape", b"not json")[1]["code"], "bad_request")

    def test_rig_is_found_once_in_the_background(self):
        from tests.fakes.makehuman import write_body as write_person
        ws = self.d / "data" / "workspace"
        write_person(ws / "Ana" / "run_20261012_120000" / "splat" / "standard_30000_object.ply", n=40000)
        ply = ws / "Ana" / "run_20261012_120000" / "splat" / "standard_30000_object.ply"
        later = time.time() + 3600                          # a clock that runs ahead: built once all the same
        os.utime(ply, (later, later))
        body = "/api/rig?body=workspace/Ana/run_20261012_120000/splat/standard_30000_object.ply"
        statuses = []
        deadline = time.time() + 120
        while time.time() < deadline:
            try:
                status, raw = self.get(body)
            except urllib.error.HTTPError as e:
                self.fail(f"{e.code}: {e.read()}")
            statuses.append(status)
            if status == 200:
                break
            time.sleep(0.2)
        self.assertEqual(statuses[0], 202)
        self.assertEqual(statuses[-1], 200)
        r = json.loads(raw)
        self.assertEqual(len(r["joints"]), 24)
        self.assertTrue((ws / "Ana" / "run_20261012_120000" / "splat" / "standard_30000_object.rig.json").is_file())
        self.assertEqual(self.get(body)[0], 200)          # saved: no second build

    def test_rig_errors_carry_a_code(self):
        write_body(self.d / "data" / "workspace" / "Ball" / "run_1" / "splat" / "x_object.ply", n=600)
        self.assertEqual(self.post("/api/rig?body=../fake.py", None, method="GET")[0], 404)
        self.assertEqual(self.post("/api/rig?body=workspace/Nobody/x.ply", None, method="GET")[1]["code"], "no_body")
        deadline = time.time() + 60
        while time.time() < deadline:
            status, d = self.post("/api/rig?body=workspace/Ball/run_1/splat/x_object.ply", None, method="GET")
            if status != 202:
                break
            time.sleep(0.1)
        self.assertEqual(status, 422)
        self.assertEqual(d["code"], "few")


    def test_clothes_are_fitted_to_the_body(self):
        from tests.fakes.makehuman import write_body as write_person
        ply = self.d / "data" / "workspace" / "Ana" / "run_20261012_120000" / "splat" / "standard_30000_object.ply"
        write_person(ply, n=60000)
        status, cat = self.post("/api/wardrobe", None, method="GET")
        self.assertEqual(status, 200)
        self.assertEqual({c["slot"] for c in cat}, {"outfit", "shoes", "hair", "hat", "glasses", "neck"})
        body = "?body=workspace/Ana/run_20261012_120000/splat/standard_30000_object.ply"
        self.assertEqual(self.post("/api/wardrobe/no_such_thing" + body, None, method="GET"),
                         (404, {"error": "no such item", "code": "no_item"}))
        self.assertEqual(self.post("/api/wardrobe/tee_jeans?body=workspace/Nobody/x.ply", None, method="GET")[1]["code"],
                         "no_body")
        statuses = []
        deadline = time.time() + 240
        while time.time() < deadline:
            status, d = self.post("/api/wardrobe/tee_jeans" + body, None, method="GET")
            statuses.append(status)
            if status != 202:
                break
            time.sleep(0.2)
        self.assertEqual((statuses[0], statuses[-1]), (202, 200))
        self.assertEqual((d["id"], d["slot"], d["texture"]), ("tee_jeans", "outfit", "tee_jeans.jpg"))
        self.assertTrue(d["verts"] and d["anchors"] and d["tris"] and d["delete"])
        self.assertTrue(ply.with_name("standard_30000_object.fit.json").is_file())
        status, f = self.post("/api/fit" + body, None, method="GET")
        self.assertEqual(status, 200)
        self.assertGreater(f["surface_found"], 0.8)

    def wait(self, path, limit=240):
        deadline = time.time() + limit
        while True:
            status, d = self.post(path, None, method="GET")
            if status != 202 or time.time() > deadline:
                return status, d
            time.sleep(0.2)

    def test_anny_is_installed_when_first_asked_for(self):
        """Anny is always offered; the first Anny fit installs PyTorch and Anny, and a failed
        install is a clear no (code "anny") rather than a hang."""
        import subprocess
        from body_studio import anny_fit
        self.assertEqual(self.post("/api/fit/models", None, method="GET"), (200, ["standard", "anny"]))
        write_body(self.d / "data" / "workspace" / "Ana" / "run_1" / "splat" / "standard_30000_object.ply")
        body = "?body=workspace/Ana/run_1/splat/standard_30000_object.ply&model=anny"
        with mock.patch.object(anny_fit, "available", lambda: False), \
                mock.patch.object(anny_fit.subprocess, "run",
                                  side_effect=lambda cmd, **kw: subprocess.CompletedProcess(cmd, 1, "offline")) as run:
            status, d = self.wait("/api/fit" + body)
        self.assertEqual((status, d["code"]), (422, "anny"))
        self.assertEqual(run.call_args.args[0][1:4], ["-m", "pip", "install"])

    def test_the_anny_fit_is_kept_apart(self):
        """?model=anny asks anny_fit for its own file; the standard fit is left as it is. (Anny itself
        isn't installed in CI: a standard fit marked as Anny's stands in for it.)"""
        from body_studio import anny_fit, fit
        from tests.fakes.makehuman import write_body as write_person
        ply = self.d / "data" / "workspace" / "Ana" / "run_1" / "splat" / "standard_30000_object.ply"
        write_person(ply, n=60000)

        def fake(p):
            r = fit.build(p)
            r["model"] = "anny"
            anny_fit.fit_file(p).write_text(json.dumps(r, separators=(",", ":")))
            return r
        body = "?body=workspace/Ana/run_1/splat/standard_30000_object.ply"
        with mock.patch.object(anny_fit, "build_and_save", fake):
            status, d = self.wait("/api/wardrobe/tee_jeans" + body + "&model=anny")
            self.assertEqual((status, d["id"]), (200, "tee_jeans"))
            self.assertEqual(self.wait("/api/fit" + body + "&model=anny")[1]["model"], "anny")
            self.assertTrue(anny_fit.current(ply))
            self.assertFalse(fit.fit_file(ply).exists())                 # not made until asked for
            status, f = self.wait("/api/fit" + body)
            self.assertEqual(status, 200)
            self.assertNotIn("model", f)

    def test_shop_shapes(self):
        """The shop around the body: each item as it is made, and the mannequin head, for any body."""
        status, d = self.post("/api/wardrobe/suit/shape", None, method="GET")
        self.assertEqual(status, 200)
        self.assertEqual((d["id"], d["display"], d["texture"]), ("suit", "hang", "suit.jpg"))
        self.assertTrue(d["verts"] and d["tris"] and d["tuv"] and d["uv"])
        self.assertEqual(self.post("/api/wardrobe/no_such_thing/shape", None, method="GET"),
                         (404, {"error": "no such item", "code": "no_item"}))
        status, m = self.post("/api/mannequin", None, method="GET")
        self.assertEqual(status, 200)
        self.assertTrue(m["verts"] and m["tris"])


if __name__ == "__main__":
    unittest.main()
