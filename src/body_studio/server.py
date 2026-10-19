"""The local web app: one page with the body in the middle, and a small JSON API.

    GET  /                 the app (static/index.html)
    GET  /static/...       our own CSS/JS
    GET  /vendor/...       three.js and Spark, served from the installed splat-studio package
    GET  /api/bodies       finished bodies, newest first
    GET  /api/jobs         runs: queued, running and finished, newest first
    POST /api/upload?name= raw video bytes; saved to videos/ and queued
    GET  /files/<path>     a body's .ply (only files inside workspace/)
    GET  /api/rig?body=<file>  the body's skeleton, skin weights and surface map (rig.py); 202 while
                           it is being worked out in the background, 422 if the body isn't a person
    GET  /api/fit?body=<file>  MakeHuman's base mesh fitted to the body (fit.py); 202 and 422 the same
    GET  /api/wardrobe         the clothes, shoes, hair and hats (wardrobe.py)
    GET  /api/wardrobe/<id>?body=<file>  one item fitted to the body; 202 while the body is fitted

    GET  /api/people                    people whose progress is followed
    GET  /api/people/<id>               one person's tape measures, body fat and scans over time
    POST /api/people                    {name, sex, height_cm}: add a person or change them
    POST /api/people/<id>/tape          {date, weight_kg, waist_cm, neck_cm, hip_cm}
    POST /api/people/<id>/scans         {body, date}: add a finished body; measured in the background
    DELETE /api/people/<id>/entries/<e> remove one tape entry or scan

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

from . import __version__, fit, history, library, rig, wardrobe
from .pipeline import job_options

STATIC = Path(__file__).resolve().parent / "static"
VIDEO_EXT = {".mov", ".mp4", ".m4v"}
MAX_UPLOAD = 8 * 1024 ** 3
MAX_JSON = 64 * 1024


class Builder:
    """Files worked out one at a time per body in the background and saved next to it: the
    skeleton (rig.py) and the fitted base mesh (fit.py)."""

    def __init__(self, module, file, errors):
        self.module, self.file, self.errors = module, file, errors   # module: build_and_save, current
        self.lock = threading.Lock()
        self.failed: dict = {}                  # body path -> (its mtime, why)
        self.built: dict = {}                   # body path -> its mtime when its file was saved
        self.busy: set = set()

    def get(self, ply: Path):
        """('ready', path to the file) | ('working', None) | ('failed', (reason, code))."""
        key, stamp = str(ply), ply.stat().st_mtime
        # (a body dated in the future is never older than its file: remember what was built)
        if self.module.current(ply) or (self.built.get(key) == stamp and self.file(ply).is_file()):
            return "ready", self.file(ply)
        with self.lock:
            if key in self.failed and self.failed[key][0] == stamp:
                return "failed", self.failed[key][1]
            if key not in self.busy:
                self.busy.add(key)
                threading.Thread(target=self._build, args=(ply, stamp), daemon=True).start()
        return "working", None

    def _build(self, ply: Path, stamp: float) -> None:
        try:
            self.module.build_and_save(ply)
            with self.lock:
                self.built[str(ply)] = stamp
        except Exception as e:                   # noqa: BLE001 - any failure is reported to the page
            with self.lock:
                self.failed[str(ply)] = (stamp, (str(e), e.code) if isinstance(e, self.errors)
                                         else (f"{type(e).__name__}: {e}", "shape"))
        finally:
            with self.lock:
                self.busy.discard(str(ply))


def measure_pending(root: Path, pid: str) -> threading.Thread:
    """Measure a person's new (or re-scaled) scans one after another, off the request thread."""
    def work():
        for s in history.pending_scans(root, pid):
            history.measure_scan(root, pid, s["id"], history.ply_for(root, s["body"]))
    th = threading.Thread(target=work, daemon=True)
    th.start()
    return th


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
    rigs = Builder(rig, rig.rig_file, rig.RigError)
    fits = Builder(fit, fit.fit_file, (rig.RigError, fit.FitError))
    fitted = {}                                # (fit file, its mtime) -> decoded fit, the latest only

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
            if p in ("/api/rig", "/api/fit"):
                state, out = self._built(rigs if p == "/api/rig" else fits)
                return self._file(out) if state == "ready" else None
            if p == "/api/wardrobe":
                return self._json(wardrobe.catalog())
            m = re.fullmatch(r"/api/wardrobe/([a-z0-9_]+)", p)
            if m:
                if m.group(1) not in wardrobe.BY_ID:
                    return self._json({"error": "no such item", "code": "no_item"}, 404)
                state, out = self._built(fits)
                if state != "ready":
                    return None
                key = (str(out), out.stat().st_mtime)
                if key not in fitted:
                    fitted.clear()
                    fitted[key] = fit.decode(json.loads(out.read_text()))
                return self._json(wardrobe.fitted(m.group(1), fitted[key]))
            if p == "/api/people":
                return self._json(history.people(data.root))
            m = re.fullmatch(r"/api/people/([^/]+)", p)
            if m:
                return self._history(lambda: history.progress(history.load(data.root, m.group(1))))
            self.send_error(404)

        def _built(self, builder):
            """The body's rig or fit: ('ready', path), or the reply (202 working, 404, 422) already sent."""
            ply = library.safe_path(data.root, parse_qs(urlparse(self.path).query).get("body", [""])[0])
            if not ply or ply.suffix != ".ply":
                self._json({"error": "no such body", "code": "no_body"}, 404)
                return "sent", None
            state, out = builder.get(ply)
            if state == "working":
                self._json({"status": "working"}, 202)
            elif state == "failed":
                self._json({"error": out[0], "code": out[1]}, 422)
            return state, out

        def _history(self, fn, code: int = 200):
            try:
                return self._json(fn(), code)
            except history.HistoryError as e:
                return self._json({"error": str(e), "code": e.code}, 404 if e.code == "no_person" else 400)

        def _body_json(self) -> dict:
            size = int(self.headers.get("Content-Length") or 0)
            if not 0 < size <= MAX_JSON:
                raise history.HistoryError("send a small JSON object", "bad_request")
            try:
                d = json.loads(self.rfile.read(size))
            except ValueError:
                raise history.HistoryError("send a small JSON object", "bad_request")
            if not isinstance(d, dict):
                raise history.HistoryError("send a small JSON object", "bad_request")
            return d

        def _people_post(self, path: str):
            root = data.root
            if path == "/api/people":
                d = self._body_json()
                person = history.upsert_person(root, d.get("name"), d.get("sex"), d.get("height_cm"))
                measure_pending(root, person["id"])
                return history.progress(history.load(root, person["id"]))
            m = re.fullmatch(r"/api/people/([^/]+)/(tape|scans)", path)
            if not m:
                return None
            pid, what = m.groups()
            history.load(root, pid)
            d = self._body_json()
            if what == "tape":
                history.add_tape(root, pid, d.get("date"), **{f: d.get(f) for f in history.TAPE_FIELDS})
            else:
                body = str(d.get("body") or "")
                if not history.ply_for(root, body):
                    raise history.HistoryError("no finished body with that id", "no_body")
                history.add_scan(root, pid, body, d.get("date"))
                measure_pending(root, pid)
            return history.progress(history.load(root, pid))

        def do_DELETE(self):
            m = re.fullmatch(r"/api/people/([^/]+)/entries/([^/]+)", unquote(urlparse(self.path).path))
            if not m:
                return self.send_error(404)

            def delete():
                history.delete_entry(data.root, *m.groups())
                return history.progress(history.load(data.root, m.group(1)))
            return self._history(delete)

        def do_POST(self):
            u = urlparse(self.path)
            if u.path.startswith("/api/people"):
                try:
                    r = self._people_post(u.path)
                except history.HistoryError as e:
                    return self._json({"error": str(e), "code": e.code}, 404 if e.code == "no_person" else 400)
                return self._json(r, 201) if r is not None else self.send_error(404)
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
