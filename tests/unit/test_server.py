import json
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

from body_studio import server

# Stands in for splat-studio: reports its stages and writes a body where splat-studio would.
FAKE = r"""
import sys, pathlib
video = pathlib.Path(sys.argv[1])
out = pathlib.Path("workspace") / video.stem / "run_20261012_120000" / "splat"
out.mkdir(parents=True, exist_ok=True)
for s in ("==> 1/3 Frames", "==> 2/3 Camera poses", "==> 3/3 Training"):
    print(s, flush=True)
(out / "standard_30000_object.ply").write_bytes(b"ply\nformat binary_little_endian 1.0\nend_header\n")
print("Object copy: " + str((out / "standard_30000_object.ply").resolve()))
"""


class Server(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.d = Path(self.tmp.name).resolve()
        fake = self.d / "fake.py"
        fake.write_text(FAKE)
        jobs = server.Jobs(self.d, command=lambda video: [sys.executable, str(fake), str(video)])
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.make_handler(self.d, jobs))
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.base = f"http://127.0.0.1:{self.httpd.server_address[1]}"

    def tearDown(self):
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
        self.assertEqual(job["video"], "Anna_front.mov")
        for _ in range(100):
            jobs = json.loads(self.get("/api/jobs")[1])
            if jobs[0]["state"] in ("done", "failed"):
                break
            time.sleep(0.05)
        self.assertEqual(jobs[0]["state"], "done", jobs[0])
        self.assertEqual(jobs[0]["body"], "workspace/Anna_front/run_20261012_120000/splat/standard_30000_object.ply")
        bodies = json.loads(self.get("/api/bodies")[1])
        self.assertEqual([b["name"] for b in bodies], ["Anna_front"])
        self.assertEqual(self.get("/files/" + bodies[0]["file"])[0], 200)

    def test_rejects_non_video_and_paths_outside_workspace(self):
        self.assertEqual(self.post("/api/upload?name=notes.txt", b"x")[0], 400)
        with self.assertRaises(urllib.error.HTTPError) as e:
            self.get("/files/../fake.py")
        self.assertEqual(e.exception.code, 404)

    def test_stage_names(self):
        self.assertEqual(server.stage_of("==> 2/3 Camera poses (COLMAP): /x"), "poses")
        self.assertEqual(server.stage_of("==> Removing the background (the original is kept)"), "cleaning")
        self.assertIsNone(server.stage_of("Elapsed 1:00"))


if __name__ == "__main__":
    unittest.main()
