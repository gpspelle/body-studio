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

    def post(self, path, body):
        req = urllib.request.Request(self.base + path, data=body, method="POST")
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



if __name__ == "__main__":
    unittest.main()
