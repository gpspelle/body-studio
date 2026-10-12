"""Video in, body out, through the real splat-studio pipeline with its stand-in COLMAP and Brush.

Needs ffmpeg and a checkout of splat-studio at the pinned commit (for tests/fakes), named by
SPLAT_STUDIO_SRC; CI makes one with scripts/splat_studio_src.py. Skipped otherwise.
The fake Brush rejects any flag the real one doesn't have."""
import json
import os
import shutil
import subprocess
import tempfile
import threading
import time
import unittest
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest import mock

SRC = Path(os.environ.get("SPLAT_STUDIO_SRC", "/nonexistent"))
FAKE_BIN = SRC / "tests" / "fakes" / "bin"


@unittest.skipUnless(FAKE_BIN.is_dir() and shutil.which("ffmpeg"), "needs ffmpeg and SPLAT_STUDIO_SRC")
class EndToEnd(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        d = Path(self.tmp.name).resolve()
        self.env = mock.patch.dict(os.environ, {
            "PATH": f"{FAKE_BIN}{os.pathsep}{os.environ['PATH']}",
            "SPLAT_IN_CONTAINER": "1",                 # skip the macOS installer step
            "SPLAT_STUDIO_TIMINGS": str(d / "timings.json"), "SPLAT_STUDIO_RATES": str(d / "rates.json"),
            "SPLAT_STUDIO_TOOLS": str(d / "tools"), "HOME": str(d / "home")})
        self.env.start()
        (d / "home").mkdir()
        from splat_studio.server.jobs import Runner
        from splat_studio.server.library import DataDir

        from body_studio import server
        data = DataDir(d / "data")
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.make_handler(data, Runner(data)))
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.base = f"http://127.0.0.1:{self.httpd.server_address[1]}"
        self.video = d / "Anna.mov"
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                        "testsrc2=duration=8:size=640x360:rate=30", "-pix_fmt", "yuv420p", str(self.video)], check=True)

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.env.stop()
        self.tmp.cleanup()

    def get(self, path):
        with urllib.request.urlopen(self.base + path) as r:
            return json.loads(r.read())

    def test_video_becomes_a_background_free_body(self):
        req = urllib.request.Request(self.base + "/api/upload?name=Anna.mov", data=self.video.read_bytes(), method="POST")
        with urllib.request.urlopen(req) as r:
            self.assertEqual(r.status, 201)
        stages = set()
        for _ in range(1200):
            job = self.get("/api/jobs")[0]
            stages.add(job["stage"])
            if job["status"] not in ("queued", "running"):
                break
            time.sleep(0.05)
        self.assertEqual(job["status"], "done", job)
        self.assertTrue(job["body"].endswith("_object.ply"), job["body"])
        self.assertLessEqual({2, 3}, stages)
        bodies = self.get("/api/bodies")
        self.assertEqual(bodies[0]["file"], job["body"])
        self.assertTrue(bodies[0]["background_removed"])


if __name__ == "__main__":
    unittest.main()
