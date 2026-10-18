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
(out / "standard_30000_object.ply").write_bytes(b"ply\nformat binary_little_endian 1.0\nend_header\n")
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


if __name__ == "__main__":
    unittest.main()
