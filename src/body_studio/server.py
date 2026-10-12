"""The local web app: one page with the body in the middle, and a small JSON API.

    GET  /                 the app (static/index.html)
    GET  /static/...       our own CSS/JS
    GET  /vendor/...       three.js and Spark, served from the installed splat-studio package
    GET  /api/bodies       finished bodies, newest first
    GET  /api/jobs         queued, running and finished runs
    POST /api/upload?name= raw video bytes; saved to videos/ and queued
    GET  /files/<path>     a body's .ply (only files inside workspace/)

Standard library only, like splat-studio. Runs are processed one at a time.
"""
from __future__ import annotations

import json
import mimetypes
import queue
import re
import subprocess
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from . import library
from .pipeline import body_from_log, splat_command, splat_run_args

STATIC = Path(__file__).resolve().parent / "static"
VIDEO_EXT = {".mov", ".mp4", ".m4v"}
MAX_UPLOAD = 8 * 1024 ** 3

# splat-studio's progress lines -> the one word the page shows
STAGES = (("==> 1/3", "frames"), ("==> 2/3", "poses"), ("==> 3/3", "training"),
          ("==> Removing background fog", "cleaning"), ("==> Removing the background", "cleaning"))


def vendor_dir() -> Path:
    import splat_studio
    return Path(splat_studio.__file__).resolve().parent / "static" / "vendor"


def safe_name(name: str) -> str:
    stem, ext = Path(name).stem, Path(name).suffix.lower()
    stem = re.sub(r"[^A-Za-z0-9_-]+", "_", stem).strip("_") or "video"
    return stem[:60] + ext


def stage_of(line: str) -> str | None:
    for prefix, stage in STAGES:
        if line.startswith(prefix):
            return stage
    return None


class Jobs:
    """A queue of runs, worked through by one background thread."""

    def __init__(self, data_dir: Path, command=None):
        self.data_dir = data_dir
        self.command = command or (lambda video: splat_command(splat_run_args(video)))
        self.items: list[dict] = []
        self.lock = threading.Lock()
        self.q: queue.Queue = queue.Queue()
        threading.Thread(target=self._worker, daemon=True).start()

    def add(self, video: Path) -> dict:
        job = {"id": f"{int(time.time() * 1000)}", "name": video.stem, "video": video.name,
               "state": "queued", "stage": None, "body": None, "error": None}
        with self.lock:
            self.items.append(job)
        self.q.put(job)
        return job

    def list(self) -> list[dict]:
        with self.lock:
            return [dict(j) for j in reversed(self.items)]

    def _worker(self) -> None:
        while True:
            job = self.q.get()
            try:
                self._run(job)
            except Exception as e:  # keep the worker alive for the next run
                job.update(state="failed", error=str(e))

    def _run(self, job: dict) -> None:
        log_dir = self.data_dir / "jobs"
        log_dir.mkdir(parents=True, exist_ok=True)
        video = (self.data_dir / "videos" / job["video"]).resolve()
        job["state"] = "running"
        lines = []
        with open(log_dir / f"{job['id']}.log", "w") as log:
            with subprocess.Popen(self.command(video), cwd=self.data_dir, stdout=subprocess.PIPE,
                                  stderr=subprocess.STDOUT, text=True) as proc:
                for line in proc.stdout:
                    log.write(line)
                    lines.append(line)
                    job["stage"] = stage_of(line) or job["stage"]
            code = proc.returncode
        body = body_from_log("".join(lines))
        if code == 0 and body:
            try:
                job["body"] = body.resolve().relative_to(self.data_dir.resolve()).as_posix()
            except ValueError:
                job["body"] = str(body)
            job["state"] = "done"
        else:
            tail = [l.strip() for l in lines if l.strip()][-1:] or ["no output"]
            job.update(state="failed", error=tail[0])


def make_handler(data_dir: Path, jobs: Jobs):
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
                while chunk := f.read(1 << 20):
                    self.wfile.write(chunk)

        @staticmethod
        def _inside(root: Path, rel: str) -> Path | None:
            p = (root / rel).resolve()
            return p if root.resolve() in p.parents else None

        def do_GET(self):
            u = urlparse(self.path)
            p = unquote(u.path)
            if p in ("/", "/index.html"):
                return self._file(STATIC / "index.html")
            if p.startswith("/static/"):
                return self._file(self._inside(STATIC, p[len("/static/"):]))
            if p.startswith("/vendor/"):
                return self._file(self._inside(vendor_dir(), p[len("/vendor/"):]))
            if p == "/api/bodies":
                return self._json(library.bodies(data_dir))
            if p == "/api/jobs":
                return self._json(jobs.list())
            if p.startswith("/files/"):
                return self._file(library.safe_path(data_dir, p[len("/files/"):]))
            self.send_error(404)

        def do_POST(self):
            u = urlparse(self.path)
            if u.path != "/api/upload":
                return self.send_error(404)
            name = safe_name(parse_qs(u.query).get("name", ["video.mov"])[0])
            if Path(name).suffix not in VIDEO_EXT:
                return self._json({"error": "Use a .mov or .mp4 video."}, 400)
            size = int(self.headers.get("Content-Length") or 0)
            if not 0 < size <= MAX_UPLOAD:
                return self._json({"error": "The video is empty or too large."}, 400)
            videos = data_dir / "videos"
            videos.mkdir(parents=True, exist_ok=True)
            dest, n = videos / name, 1
            while dest.exists():
                n += 1
                dest = videos / f"{Path(name).stem}_{n}{Path(name).suffix}"
            left = size
            with open(dest, "wb") as f:
                while left:
                    chunk = self.rfile.read(min(left, 1 << 20))
                    if not chunk:
                        break
                    f.write(chunk)
                    left -= len(chunk)
            if left:
                dest.unlink(missing_ok=True)
                return self._json({"error": "The upload was cut off."}, 400)
            return self._json(jobs.add(dest), 201)

    return Handler


def serve(data_dir: Path, port: int = 8770, open_browser: bool = True) -> None:
    data_dir = data_dir.expanduser().resolve()
    data_dir.mkdir(parents=True, exist_ok=True)
    httpd = ThreadingHTTPServer(("127.0.0.1", port), make_handler(data_dir, Jobs(data_dir)))
    url = f"http://localhost:{port}"
    print(f"Body Studio: {url}  (data: {data_dir})")
    if open_browser:
        threading.Timer(0.5, webbrowser.open, [url]).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
