"""The local web app: one page with the body in the middle, and a small JSON API.

    GET  /                 the app (static/index.html)
    GET  /static/...       our own CSS/JS
    GET  /vendor/...       three.js and Spark, served from the installed splat-studio package
    GET  /api/bodies       finished bodies, newest first
    GET  /api/jobs         runs: queued, running and finished, newest first
    POST /api/upload?name= raw video bytes; saved to videos/ and queued
                           &kind=room: a room filmed from inside it (an iPhone capture .zip too), kept whole
    GET  /api/rooms        finished rooms, newest first, then the sample living room (started the first time, listed once made)
    GET  /api/room?room=<file>  the room's map: floor, size, walls, furniture and seats (room.py); 202
                           while it is being worked out, 422 if it doesn't look like a room
    GET  /files/<path>     a body's .ply (only files inside workspace/)
    GET  /api/rig?body=<file>  the body's skeleton, skin weights and surface map (rig.py); 202 while
                           it is being worked out in the background, 422 if the body isn't a person
    GET  /api/fit?body=<file>  MakeHuman's base mesh fitted to the body (fit.py); 202 and 422 the same.
                           &model=anny: fitted with Anny instead (anny_fit.py; installs it the first time)
    GET  /api/fit/models       the body models the fit can use: ["standard", "anny"]
    GET  /api/wardrobe         the clothes, shoes, hair and hats (wardrobe.py)
    GET  /api/wardrobe/<id>?body=<file>[&model=anny]  one item fitted to the body; 202 while the body is fitted
    GET  /api/wardrobe/<id>/shape        the item as it is made, for the shop around the body
    GET  /api/mannequin                  the mannequin head the hair and hats are shown on

    GET  /api/people                    people whose progress is followed
    GET  /api/people/<id>               one person's tape measures, body fat and scans over time
    POST /api/people                    {name, sex, height_cm}: add a person or change them
    POST /api/people/<id>/tape          {date, weight_kg, waist_cm, neck_cm, hip_cm}
    POST /api/people/<id>/scans         {body, date}: add a finished body; measured in the background
    DELETE /api/people/<id>/entries/<e> remove one tape entry or scan
    GET  /api/decor                     the decor inventory: starters, then items made from photos (decor.py)
    POST /api/decor/photo?name=&height= a photo's bytes: a new item, made from it in the background (photo3d.py)
    GET  /api/decor/<id>/mesh | /photo  a made item's mesh (packed), or its photo
    POST /api/decor/variant             {name, base, colour, opts}: a changed starter kept as a new thing
    POST /api/decor/<id>                {name, height, on}: change an item; .../retry makes a failed one again
    DELETE /api/decor/<id>              remove an item
    GET  /api/decor/layout?room=<file>  the room's decor layouts; POST the same to save them

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

from . import __version__, anny_fit, compare, decor, fit, history, library, rig, room, sample_room, wardrobe
from .pipeline import job_options, room_job_options

STATIC = Path(__file__).resolve().parent / "static"
VIDEO_EXT = {".mov", ".mp4", ".m4v"}
ROOM_EXT = VIDEO_EXT | {".zip"}             # a room may also be an iPhone capture (Splat Capture): in metres
MAX_UPLOAD = 8 * 1024 ** 3
MAX_JSON = 64 * 1024
MAX_LAYOUT = 2 * 1024 ** 2


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


def job_view(v: dict, rooms: set = frozenset()) -> dict:
    """The few fields the page shows, from splat-studio's job view."""
    name = Path(v.get("video") or "").stem
    return {
        "id": v.get("id"),
        "name": name,
        "kind": "room" if name in rooms else "body",
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
    anny_fits = Builder(anny_fit, anny_fit.fit_file, (rig.RigError, fit.FitError, anny_fit.Missing))
    maps = Builder(room, room.map_file, room.RoomError)
    fitted = {}                                # (fit file, its mtime) -> decoded fit, the latest only
    maker = decor.Maker(data.root)             # decor items made from photos, one at a time

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def _json(self, obj, code: int = 200) -> None:
            self._raw_json(json.dumps(obj), code)

        def _raw_json(self, text: str, code: int = 200) -> None:
            body = text.encode()
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
            st = path.stat()
            # the browser asks each time (after an update, the page's new code at once) but keeps
            # what it has while the file is the same: a reload moves no splats, three.js nor Spark
            tag = '"%x-%x"' % (st.st_mtime_ns, st.st_size)
            if tag in (self.headers.get("If-None-Match") or "").replace(" ", "").split(","):
                self.send_response(304)
                self.send_header("ETag", tag)
                self.send_header("Cache-Control", "no-cache")
                self.end_headers()
                return
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Cache-Control", "no-cache")
            self.send_header("ETag", tag)
            self.send_header("Content-Length", str(st.st_size))
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
                rooms = library.room_names(data.root)
                return self._json(sorted((job_view(v, rooms) for v in jobs), key=lambda v: v["id"], reverse=True))
            if p == "/api/rooms":
                try:
                    sample_room.start(data.root)        # the drawn living room and tattoo studio: listed once made
                except OSError:
                    pass
                out = library.rooms(data.root)
                for r in out:                           # (an older drawing, being made again: the page asks again)
                    if r["sample"] and not sample_room.ready(data.root, r["name"]):
                        r["making"] = True
                return self._json(out)
            if p == "/api/room":
                state, out = self._built(maps, "room")
                return self._file(out) if state == "ready" else None
            if p == "/api/version":
                return self._json({"version": __version__})
            if p.startswith("/files/"):
                return self._file(library.safe_path(data.root, p[len("/files/"):]))
            if p == "/api/fit/models":
                return self._json(["standard", "anny"])
            if p in ("/api/rig", "/api/fit"):
                state, out = self._built(rigs if p == "/api/rig" else self._fits())
                return self._file(out) if state == "ready" else None
            if p == "/api/wardrobe":
                return self._json(wardrobe.catalog())
            if p == "/api/mannequin":
                return self._raw_json(wardrobe.mannequin())
            m = re.fullmatch(r"/api/wardrobe/([a-z0-9_]+)/shape", p)
            if m:
                if m.group(1) not in wardrobe.BY_ID:
                    return self._json({"error": "no such item", "code": "no_item"}, 404)
                return self._raw_json(wardrobe.shape(m.group(1)))
            m = re.fullmatch(r"/api/wardrobe/([a-z0-9_]+)", p)
            if m:
                if m.group(1) not in wardrobe.BY_ID:
                    return self._json({"error": "no such item", "code": "no_item"}, 404)
                state, out = self._built(self._fits())
                if state != "ready":
                    return None
                key = (str(out), out.stat().st_mtime)
                if key not in fitted:
                    fitted.clear()
                    fitted[key] = fit.decode(json.loads(out.read_text()))
                return self._json(wardrobe.fitted(m.group(1), fitted[key]))
            if p == "/api/decor":
                return self._json(decor.items(data.root))
            if p == "/api/decor/layout":
                f = self._room_file()
                return f and self._json(decor.load_layouts(data.root, f))
            m = re.fullmatch(r"/api/decor/([a-z0-9]+)/(mesh|photo)", p)
            if m:
                fn = decor.mesh_file if m.group(2) == "mesh" else decor.photo_file
                return self._file(fn(data.root, m.group(1)))
            if p.startswith("/api/compare"):
                return self._compare(lambda: self._compare_get(p), 200)
            if p == "/api/people":
                return self._json(history.people(data.root))
            m = re.fullmatch(r"/api/people/([^/]+)", p)
            if m:
                return self._history(lambda: history.progress(history.load(data.root, m.group(1))))
            self.send_error(404)

        def _fits(self):
            """The fit asked for: the standard one, or Anny's (?model=anny)."""
            model = parse_qs(urlparse(self.path).query).get("model", ["standard"])[0]
            return anny_fits if model == "anny" else fits

        def _built(self, builder, what="body"):
            """The body's rig or fit, or a room's map: ('ready', path), or the reply (202 working, 404,
            422) already sent."""
            ply = library.safe_path(data.root, parse_qs(urlparse(self.path).query).get(what, [""])[0])
            if not ply or ply.suffix != ".ply":
                self._json({"error": f"no such {what}", "code": f"no_{what}"}, 404)
                return "sent", None
            state, out = builder.get(ply)
            if state == "working":
                self._json({"status": "working"}, 202)
            elif state == "failed":
                self._json({"error": out[0], "code": out[1]}, 422)
            return state, out

        def _room_file(self):
            """The room named by ?room= (its splat, as /api/rooms lists it), or None (404 sent)."""
            rel = parse_qs(urlparse(self.path).query).get("room", [""])[0]
            ply = library.safe_path(data.root, rel)
            if not ply or ply.suffix != ".ply":
                self._json({"error": "no such room", "code": "no_room"}, 404)
                return None
            return ply.relative_to(data.root.resolve()).as_posix()

        def _read(self, limit: int) -> bytes | None:
            size = int(self.headers.get("Content-Length") or 0)
            if not 0 < size <= limit:
                return None
            data_ = self.rfile.read(size)
            return data_ if len(data_) == size else None

        def _decor_post(self, u):
            q = parse_qs(u.query)
            if u.path == "/api/decor/photo":
                photo = self._read(decor.MAX_PHOTO)
                if photo is None:
                    raise decor.DecorError("the photo is empty or too large", "photo_size")
                name = q.get("name", ["photo.jpg"])[0]
                item = decor.add_photo(data.root, photo, Path(name).suffix, q.get("label", [Path(name).stem])[0],
                                       q.get("height", ["0.8"])[0])
                maker.add(item["id"])
                return item
            if u.path == "/api/decor/variant":
                body = self._read(MAX_JSON)
                try:
                    d = json.loads(body) if body else None
                except ValueError:
                    d = None
                return decor.add_variant(data.root, d)
            if u.path == "/api/decor/layout":
                f = self._room_file()
                if not f:
                    return "sent"
                body = self._read(MAX_LAYOUT)
                try:
                    d = json.loads(body) if body else None
                except ValueError:
                    d = None
                return decor.save_layouts(data.root, f, d)
            m = re.fullmatch(r"/api/decor/([a-z0-9]+)(/retry)?", u.path)
            if not m:
                return None
            if m.group(2):
                item = decor.load_item(data.root, m.group(1))
                if item.get("status") == "failed":
                    item.update(status="working", error=None, code=None)
                    decor.save_item(data.root, item)
                    maker.add(item["id"])
                return item
            body = self._read(MAX_JSON)
            try:
                d = json.loads(body) if body else None
            except ValueError:
                d = None
            if not isinstance(d, dict):
                raise decor.DecorError("send a small JSON object", "bad_request")
            return decor.change_item(data.root, m.group(1), d)

        def _decor(self, fn, code: int = 201):
            try:
                r = fn()
            except decor.DecorError as e:
                return self._json({"error": str(e), "code": e.code}, 404 if e.code == "no_item" else 400)
            if r == "sent":
                return None
            return self._json(r, code) if r is not None else self.send_error(404)

        def _compare(self, fn, code: int = 201):
            """A Compare route (compare.py): its JSON, or its error; None from fn: the reply was sent."""
            try:
                r = fn()
            except compare.CompareError as e:
                return self._json({"error": str(e), "code": e.code}, 404 if e.code == "no_view" else 400)
            return self._json(r, code) if r is not None else None

        def _compare_get(self, p: str):
            f = self._room_file()
            if not f:
                return None
            q = parse_qs(urlparse(self.path).query)
            if p == "/api/compare":
                return compare.state(data.root, f)
            if p == "/api/compare/video":
                return self._file(compare.video_file(data.root, f))
            if p == "/api/compare/snap":
                return self._file(compare.snap_file(data.root, f, q.get("id", [""])[0], q.get("which", [""])[0]))
            if p == "/api/compare/export":
                body = compare.export(data.root, f)
                self.send_response(200)
                self.send_header("Content-Type", "application/zip")
                self.send_header("Content-Disposition", 'attachment; filename="%s-views.zip"' % compare.folder(data.root, f).name)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return None
            self.send_error(404)
            return None

        def _compare_post(self, u):
            f = self._room_file()
            if not f:
                return None
            q = parse_qs(u.query)
            if u.path == "/api/compare/video":
                size = int(self.headers.get("Content-Length") or 0)
                if not 0 < size <= compare.MAX_VIDEO:
                    raise compare.CompareError("The video is empty or too large.", "video_size")

                def chunks(left=size):
                    while left:
                        c = self.rfile.read(min(left, 1 << 20))
                        if not c:
                            return
                        left -= len(c)
                        yield c
                return compare.save_video(data.root, f, chunks(), size, q.get("name", [""])[0])
            if u.path == "/api/compare/view":
                body = self._read(MAX_JSON)
                try:
                    d = json.loads(body) if body else None
                except ValueError:
                    d = None
                return compare.save_view(data.root, f, d)
            if u.path == "/api/compare/snap":
                return compare.save_snap(data.root, f, q.get("id", [""])[0], q.get("which", [""])[0], self._read(compare.MAX_SNAP))
            self.send_error(404)
            return None

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
            m = re.fullmatch(r"/api/compare/view/([a-z0-9]+)", unquote(urlparse(self.path).path))
            if m:
                return self._compare(lambda: (f := self._room_file()) and compare.delete_view(data.root, f, m.group(1)), 200)
            m = re.fullmatch(r"/api/decor/([a-z0-9]+)", unquote(urlparse(self.path).path))
            if m:
                return self._decor(lambda: decor.delete_item(data.root, m.group(1)) or {"deleted": m.group(1)}, 200)
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
            if u.path.startswith("/api/decor/"):
                return self._decor(lambda: self._decor_post(u))
            if u.path.startswith("/api/compare/"):
                return self._compare(lambda: self._compare_post(u))
            if u.path != "/api/upload":
                return self.send_error(404)
            q = parse_qs(u.query)
            name = safe_name(q.get("name", ["video.mov"])[0])
            is_room = q.get("kind", ["body"])[0] == "room"
            if Path(name).suffix not in (ROOM_EXT if is_room else VIDEO_EXT):
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
            if is_room:                     # remembered before the run starts, so it never shows as a body
                library.mark_room(data.root, dest.stem)
            opts = room_job_options() if is_room else job_options()
            job = runner.submit("video", video=data.rel(dest), options=validate_options(opts))
            return self._json(job_view(runner.view(job), library.room_names(data.root)), 201)

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
