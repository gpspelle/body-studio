"""One person's scans and tape measures over time, and how they changed.

    body-studio person Anna --sex f --height 168     add a person (or change sex and height)
    body-studio tape Anna --waist 74 --neck 32 --hip 98 --weight 61 [--date 2026-10-12]
    body-studio scan Anna Anna_front/run_20261012_120000 [--date 2026-10-12]
    body-studio progress Anna                        every measure: first, latest, change

Each person is one file, people/<id>.json in the data folder, next to splat-studio's own
folders (videos/, frames/, workspace/), so either app still opens every run. A scan is a link to
a run plus what `measure` found on it (neck, waist, hips and the circumference at every height),
measured once with the person's height and kept in the file.

Body fat comes from the tape measures (decision 2026-10-12): Navy when neck and waist (and hips
for women) are there, the Army one-site equation when weight and waist are, relative fat mass
from the waist alone. One equation is the headline for the whole series, so a change in the
number is a change in the body, not a switch of formula. Changes smaller than the measurement
noise below are shown as "about the same". Standard library only.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
import threading
from pathlib import Path

from . import measure as measure_mod

TAPE_FIELDS = ("weight_kg", "waist_cm", "neck_cm", "hip_cm")
LIMITS = {"weight_kg": (20, 400), "waist_cm": (30, 250), "neck_cm": (15, 80), "hip_cm": (40, 250),
          "height_cm": (80, 250)}
# The smallest change that is more than measurement noise for the same person, same tape, same
# protocol. Inferred from tape repeatability (~1 cm at the waist and hips, ~0.5 cm at the neck),
# day-to-day water in body weight (~1 kg) and what 1 cm of waist does to the equations
# (0.5-0.8 points). See docs/progress.md.
NOISE = {"weight_kg": 1.0, "waist_cm": 1.0, "neck_cm": 0.5, "hip_cm": 1.0, "body_fat": 1.0}
EQUATIONS = ("navy", "army", "rfm")              # preference when two cover the same entries

_lock = threading.Lock()


class HistoryError(ValueError):
    """A request the page can explain: `code` is the i18n key err.<code>."""

    def __init__(self, message: str, code: str):
        super().__init__(message)
        self.code = code


# ---------------------------------------------------------------- storage

def people_dir(root: Path) -> Path:
    return Path(root) / "people"


def slug(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    return s[:40]


def _path(root: Path, pid: str) -> Path:
    if not pid or slug(pid) != pid:
        raise HistoryError(f"no person {pid!r}", "no_person")
    return people_dir(root) / f"{pid}.json"


def load(root: Path, pid: str) -> dict:
    p = _path(root, pid)
    if not p.is_file():
        raise HistoryError(f"no person {pid!r}", "no_person")
    return json.loads(p.read_text())


def save(root: Path, person: dict) -> dict:
    p = _path(root, person["id"])
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(person, indent=1))
    os.replace(tmp, p)                           # never a half-written file
    return person


def people(root: Path) -> list:
    out = []
    for p in sorted(people_dir(root).glob("*.json")):
        try:
            d = json.loads(p.read_text())
        except (OSError, ValueError):
            continue
        out.append({k: d.get(k) for k in ("id", "name", "sex", "height_cm")})
    return sorted(out, key=lambda d: d["name"].lower())


def _number(field: str, v) -> float | None:
    if v in (None, ""):
        return None
    try:
        x = float(v)
    except (TypeError, ValueError):
        raise HistoryError(f"{field} must be a number", "bad_number")
    lo, hi = LIMITS[field]
    if not lo <= x <= hi:
        raise HistoryError(f"{field} must be between {lo} and {hi}", "out_of_range")
    return round(x, 1)


def _date(v) -> str:
    if not v:
        return dt.date.today().isoformat()
    try:
        return dt.date.fromisoformat(str(v)).isoformat()
    except ValueError:
        raise HistoryError("use a date like 2026-10-12", "bad_date")


def _sex(v) -> str:
    s = str(v or "").strip().lower()[:1]
    if s not in ("m", "f"):
        raise HistoryError("sex must be m or f", "bad_sex")
    return s


def _next_id(person: dict, prefix: str) -> str:
    used = {e["id"] for e in person["tape"] + person["scans"]}
    n = len(used) + 1
    while f"{prefix}{n}" in used:
        n += 1
    return f"{prefix}{n}"


def upsert_person(root: Path, name: str, sex, height_cm) -> dict:
    """Add a person, or change the sex and height of one with the same name."""
    name = (name or "").strip()
    pid = slug(name)
    if not pid:
        raise HistoryError("give the person a name", "no_name")
    sex, height = _sex(sex), _number("height_cm", height_cm)
    if height is None:
        raise HistoryError("height is required: it gives the body its real size", "no_height")
    with _lock:
        try:
            person = load(root, pid)
        except HistoryError:
            person = {"id": pid, "name": name, "tape": [], "scans": []}
        changed = person.get("height_cm") not in (None, height)
        person.update(name=name, sex=sex, height_cm=height)
        if changed:                              # scans were scaled by the old height
            for s in person["scans"]:
                s.update(status="stale")
        return save(root, person)


def add_tape(root: Path, pid: str, date=None, **values) -> dict:
    entry = {"date": _date(date)}
    for f in TAPE_FIELDS:
        v = _number(f, values.get(f))
        if v is not None:
            entry[f] = v
    if len(entry) == 1:
        raise HistoryError("enter at least one measure", "no_values")
    with _lock:
        person = load(root, pid)
        entry["id"] = _next_id(person, "t")
        person["tape"].append(entry)
        save(root, person)
    return entry


def delete_entry(root: Path, pid: str, entry_id: str) -> None:
    with _lock:
        person = load(root, pid)
        before = len(person["tape"]) + len(person["scans"])
        person["tape"] = [e for e in person["tape"] if e["id"] != entry_id]
        person["scans"] = [e for e in person["scans"] if e["id"] != entry_id]
        if len(person["tape"]) + len(person["scans"]) == before:
            raise HistoryError(f"no entry {entry_id!r}", "no_entry")
        save(root, person)


def run_date(body_id: str) -> str | None:
    """The day a run was made, from splat-studio's folder name run_<YYYYMMDD>_<HHMMSS>."""
    m = re.search(r"run_(\d{4})(\d{2})(\d{2})", body_id)
    try:
        return dt.date(*map(int, m.groups())).isoformat() if m else None
    except ValueError:
        return None


def add_scan(root: Path, pid: str, body_id: str, date=None) -> dict:
    """Link a run to a person. Its measurements come later, from measure_scan()."""
    with _lock:
        person = load(root, pid)
        if any(s["body"] == body_id for s in person["scans"]):
            raise HistoryError("this body is already in the history", "already_added")
        entry = {"id": _next_id(person, "s"), "body": body_id,
                 "date": _date(date or run_date(body_id)), "status": "measuring"}
        person["scans"].append(entry)
        save(root, person)
    return entry


def ply_for(root: Path, body_id: str) -> Path | None:
    """The body file of a run id like <video>/run_<date_time>, only inside workspace/."""
    from .library import body_file
    ws = (Path(root) / "workspace").resolve()
    run = (ws / body_id).resolve()
    if ws not in run.parents or not run.is_dir():
        return None
    return body_file(run)


def pending_scans(root: Path, pid: str) -> list:
    """Scans still to be measured: just added, or scaled by a height that has since changed."""
    return [s for s in load(root, pid)["scans"] if s.get("status") in ("measuring", "stale")]


def measure_scan(root: Path, pid: str, entry_id: str, ply: Path) -> dict:
    """Measure a linked scan with the person's height (slow on a full capture: run it in a thread)."""
    person = load(root, pid)
    result = {"status": "failed"}
    try:
        if not ply:
            raise ValueError("the body file is gone")
        r = measure_mod.measure(ply, person["sex"], person["height_cm"])
        m = r["measurements"]
        result = {"status": "done", "measurements": {k: round(m[k], 1) for k in ("neck_cm", "waist_cm", "hip_cm")},
                  "levels": {k: round(v, 4) for k, v in m["levels"].items()},
                  "profile": [[round(f, 4), round(c, 1)] for f, c in r["profile"]]}
    except (ValueError, OSError) as e:
        result["error"] = str(e)
    with _lock:
        person = load(root, pid)
        for s in person["scans"]:
            if s["id"] == entry_id:
                s.pop("error", None)
                s.update(result)
        save(root, person)
    return result


# ---------------------------------------------------------------- progress

def body_fat(person: dict, entry: dict) -> dict:
    """Every equation one tape entry allows, by name."""
    sex, h = person["sex"], person["height_cm"]
    w, n, hip, kg = (entry.get(k) for k in ("waist_cm", "neck_cm", "hip_cm", "weight_kg"))
    out = {}
    if w and n and (sex == "m" or hip):
        try:
            out["navy"] = measure_mod.navy(sex, h, n, w, hip)
        except ValueError:
            pass
    if w and kg:
        out["army"] = measure_mod.army_one_site(sex, kg, w)
    if w:
        out["rfm"] = measure_mod.rfm(sex, h, w)
    return {k: round(v, 1) for k, v in out.items()}


def change(points: list, noise: float) -> dict:
    """First and latest value of a dated series, and whether the change is more than noise."""
    if not points:
        return {"points": [], "first": None, "last": None}
    first, last = points[0][1], points[-1][1]
    out = {"points": points, "first": first, "last": last, "noise": noise,
           "since_first": round(last - first, 1), "first_date": points[0][0], "last_date": points[-1][0]}
    if len(points) > 1:
        out["since_last"] = round(last - points[-2][1], 1)
    out["beyond_noise"] = len(points) > 1 and abs(last - first) >= noise
    return out


def progress(person: dict) -> dict:
    """What the page and `body-studio progress` show: one series per tape measure, body fat from
    the tape with one headline equation, and the scans with their circumference profiles."""
    tape = sorted(person["tape"], key=lambda e: e["date"])            # stable: same day keeps order
    rows = {f: change([[e["date"], e[f]] for e in tape if f in e], NOISE[f]) for f in TAPE_FIELDS}
    fats = [(e["date"], body_fat(person, e)) for e in tape]
    counts = {q: sum(q in bf for _, bf in fats) for q in EQUATIONS}
    eq = max(EQUATIONS, key=lambda q: (counts[q], -EQUATIONS.index(q))) if any(counts.values()) else None
    fat = change([[d, bf[eq]] for d, bf in fats if eq in bf], NOISE["body_fat"]) if eq else change([], 0)
    fat.update(equation=eq, error_band=measure_mod.ERROR_BAND)
    scans = sorted(person["scans"], key=lambda s: s["date"])
    scan_rows = {}
    for k in ("waist_cm", "neck_cm", "hip_cm"):
        pts = [[s["date"], s["measurements"][k]] for s in scans if s.get("status") == "done"]
        scan_rows[k] = change(pts, NOISE[k])
    return {"person": {k: person.get(k) for k in ("id", "name", "sex", "height_cm")},
            "tape": rows, "body_fat": fat, "entries": list(reversed(tape)),
            "scans": scans, "scan_rows": scan_rows}


# ---------------------------------------------------------------- command line

NAMES = {"weight_kg": ("Weight", "kg"), "waist_cm": ("Waist", "cm"), "neck_cm": ("Neck", "cm"),
         "hip_cm": ("Hips", "cm"), "body_fat": ("Body fat", "%")}


def _row(label: str, unit: str, c: dict) -> str:
    if c["first"] is None:
        return f"{label:<10} -"
    if len(c["points"]) == 1:
        return f"{label:<10} {c['last']:6.1f} {unit:<2}  ({c['last_date']}, first entry)"
    note = "" if c["beyond_noise"] else "  about the same"
    return (f"{label:<10} {c['last']:6.1f} {unit:<2}  {c['since_first']:+5.1f} since {c['first_date']}"
            f" ({len(c['points'])} entries){note}")


def format_progress(p: dict) -> str:
    who = p["person"]
    lines = [f"{who['name']} ({who['sex']}, {who['height_cm']:g} cm)", "", "Tape"]
    for f in TAPE_FIELDS:
        lines.append("  " + _row(*NAMES[f], p["tape"][f]))
    bf = p["body_fat"]
    if bf["equation"]:
        names = {"navy": "US Navy", "army": "US Army one-site", "rfm": "relative fat mass"}
        lines.append("  " + _row(*NAMES["body_fat"], bf) + f"  [{names[bf['equation']]}, ±{bf['error_band']:g}]")
    lines += ["", "Scans"]
    if not p["scans"]:
        lines.append("  none yet: body-studio scan NAME RUN")
    for s in p["scans"]:
        m = s.get("measurements")
        what = (f"waist {m['waist_cm']:.1f}, neck {m['neck_cm']:.1f}, hips {m['hip_cm']:.1f} cm" if m
                else s.get("error") or s["status"])
        lines.append(f"  {s['date']}  {s['body']}: {what}")
    return "\n".join(lines)


def _find(root: Path, name: str) -> str:
    pid = slug(name)
    load(root, pid)
    return pid


def main(cmd: str, argv: list, default_data: Path) -> None:
    ap = argparse.ArgumentParser(prog=f"body-studio {cmd}")
    ap.add_argument("name", help="the person's name")
    ap.add_argument("--data-dir", type=Path, default=default_data)
    if cmd == "person":
        ap.add_argument("--sex", required=True, choices=["m", "f"])
        ap.add_argument("--height", type=float, required=True, help="cm")
    elif cmd == "tape":
        ap.add_argument("--date", help="YYYY-MM-DD (default: today)")
        ap.add_argument("--weight", type=float, help="kg")
        ap.add_argument("--waist", type=float, help="cm, at the navel")
        ap.add_argument("--neck", type=float, help="cm, below the larynx")
        ap.add_argument("--hip", type=float, help="cm, widest point")
    elif cmd == "scan":
        ap.add_argument("run", help="workspace/<video>/run_<date_time>, or <video>/run_<date_time>")
        ap.add_argument("--date", help="YYYY-MM-DD (default: the run's own date)")
    a = ap.parse_args(argv)
    root = a.data_dir
    try:
        if cmd == "person":
            p = upsert_person(root, a.name, a.sex, a.height)
            print(f"{p['name']}: {p['sex']}, {p['height_cm']:g} cm. Saved in {_path(root, p['id'])}")
        pid = _find(root, a.name)
        if cmd == "tape":
            add_tape(root, pid, a.date, weight_kg=a.weight, waist_cm=a.waist, neck_cm=a.neck, hip_cm=a.hip)
        elif cmd == "scan":
            body_id = re.sub(r"^.*?workspace/", "", str(a.run).rstrip("/"))
            if not ply_for(root, body_id):
                raise HistoryError(f"no finished body in workspace/{body_id}", "no_body")
            add_scan(root, pid, body_id, a.date)
        for s in pending_scans(root, pid):     # new scans, and old ones after a height change
            print(f"Measuring {s['body']}…", file=sys.stderr)
            r = measure_scan(root, pid, s["id"], ply_for(root, s["body"]))
            if r["status"] != "done":
                print(f"Couldn't measure it: {r.get('error')}", file=sys.stderr)
        print(format_progress(progress(load(root, pid))))
    except HistoryError as e:
        sys.exit(f"body-studio {cmd}: {e}")
