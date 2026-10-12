"""The local web app: one page with the body in the middle, and a small JSON API.

    GET  /                 the app (static/index.html)
    GET  /static/...       our own CSS/JS
    GET  /vendor/...       three.js and Spark, served from the installed splat-studio package
    GET  /api/bodies       finished bodies, newest first
    GET  /api/jobs         runs: queued, running and finished, newest first
    POST /api/upload?name= raw video bytes; saved to videos/ and queued
    GET  /files/<path>     a body's .ply (only files inside workspace/)

Runs go through splat-studio's own job runner (splat_studio.server.jobs.Runner): one at a time,
under a pseudo-terminal, with measured time left, lock files, timeline.jsonl and advice in
seconds of video. Standard library only, like splat-studio.
"""
from __future__ import annotations

import json
import mimetypes
import re
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from splat_studio.server.jobs import Runner, validate_options
from splat_studio.server.library import DataDir

from . import __version__, library
from .pipeline import job_options

STATIC = Path(__file__).resolve().parent / "static"
VIDEO_EXT = {".mov", ".mp4", ".m4v"}
MAX_UPLOAD = 8 * 1024 ** 3


def vendor_dir() -> Path:
    import splat_studio
    return Path(splat_studio.__file__).resolve().parent / "static" / "vendor"


def safe_name(name: str) -> str:
    stem, ext = Path(name).stem, Path(name).suffix.lower()
    stem = re.sub(r"[^A-Za-z0-9_-]+", "_", stem).strip("_") or "video"
    return stem[:60] + ext


def job_view(v: dict) -> dict:
    """The few fields the page shows, from splat-studio's job view."""
    return {
        "id": v.get("id"),
        "name": Path(v.get("video") or "").stem,
        "status": v.get("status"),                 # queued, running, done, failed, cancelled, interrupted
        "stage": v.get("stage"),                   # 1 frames, 2 camera poses, 3 training
        "pct": v.get("step_pct"),
        "left": v.get("eta_total"),                # measured; None until there is something to measure
        "note": v.get("eta_note"),
        "body": v.get("object_splat") or v.get("clean_splat") or v.get("splat"),
        "error": v.get("error"),
        "advice": [a.get("text") for a in v.get("advice") or [] if a.get("level") != "ok"],
    }


def make_handler(data: DataDir, runner: Runner):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def _json(self, obj, code: int = 200) -> None:
            body = json.dumps(obj).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _file(self, path: Path | None) -> None:
            if not path or not path.is_file():
                self.send_error(404)
                return
            ctype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
            if path.suffix == ".js":
                ctype = "text/javascript"
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(path.stat().st_size))
            self.end_headers()
            with open(path, "rb") as f:
                while True:
                    chunk = f.read(1 << 20)
                    if not chunk:
                        break
                    self.wfile.write(chunk)

        @staticmethod
        def _inside(root: Path, rel: str) -> Path | None:
            p = (root / rel).resolve()
            return p if root.resolve() in p.parents else None

        def do_GET(self):
            p = unquote(urlparse(self.path).path)
            if p in ("/", "/index.html"):
                return self._file(STATIC / "index.html")
            if p.startswith("/static/"):
                return self._file(self._inside(STATIC, p[len("/static/"):]))
            if p.startswith("/vendor/"):
                return self._file(self._inside(vendor_dir(), p[len("/vendor/"):]))
            if p == "/api/bodies":
                return self._json(library.bodies(data.root))
            if p == "/api/jobs":
                jobs = [runner.view(j) for j in list(runner.jobs.values()) if j.type == "video"]
                return self._json(sorted((job_view(v) for v in jobs), key=lambda v: v["id"], reverse=True))
            if p == "/api/version":
                return self._json({"version": __version__})
            if p.startswith("/files/"):
                return self._file(library.safe_path(data.root, p[len("/files/"):]))
            self.send_error(404)

        def do_POST(self):
            u = urlparse(self.path)
            if u.path != "/api/upload":
                return self.send_error(404)
            name = safe_name(parse_qs(u.query).get("name", ["video.mov"])[0])
            if Path(name).suffix not in VIDEO_EXT:
                return self._json({"error": "Use a .mov or .mp4 video.", "code": "video_type"}, 400)
            size = int(self.headers.get("Content-Length") or 0)
            if not 0 < size <= MAX_UPLOAD:
                return self._json({"error": "The video is empty or too large.", "code": "video_size"}, 400)
            dest, n = data.videos / name, 1
            while dest.exists():
                n += 1
                dest = data.videos / f"{Path(name).stem}_{n}{Path(name).suffix}"
            left = size
            with open(dest, "wb") as f:
                while left:
                    chunk = self.rfile.read(min(left, 1 << 20))
                    if not chunk:
                        break
                    f.write(chunk)
                    left -= len(chunk)
            if left:
                dest.unlink()
                return self._json({"error": "The upload was cut off.", "code": "upload_cut"}, 400)
            job = runner.submit("video", video=data.rel(dest), options=validate_options(job_options()))
            return self._json(job_view(runner.view(job)), 201)

    return Handler


def serve(data_dir: Path, port: int = 8770, open_browser: bool = True) -> None:
    data = DataDir(data_dir)
    runner = Runner(data)
    httpd = ThreadingHTTPServer(("127.0.0.1", port), make_handler(data, runner))
    url = f"http://localhost:{port}"
    print(f"Body Studio: {url}  (data: {data.root})")
    if open_browser:
        threading.Timer(0.5, webbrowser.open, [url]).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        runner.stop_all()
