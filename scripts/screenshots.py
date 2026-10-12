#!/usr/bin/env python3
"""Regenerate the README screenshots in docs/images/ from synthetic bodies.

    pip install playwright && python -m playwright install chromium
    python3 scripts/screenshots.py

Look at every image before committing it. BODY_STUDIO_CHROMIUM picks a Chromium that's
already installed. Waits for the page's own state, never a fixed delay, except one short
pause so the turntable has settled into a frame.
"""
import os
import sys
import tempfile
import threading
from http.server import ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from tests.fakes.bodyply import write_body  # noqa: E402

from playwright.sync_api import sync_playwright  # noqa: E402
from splat_studio.server.jobs import Runner  # noqa: E402
from splat_studio.server.library import DataDir  # noqa: E402

from body_studio import history, server  # noqa: E402

SHOTS = [  # name, width, height, colour scheme, language, progress panel open
    ("desktop-light", 1280, 800, "light", "en", False),
    ("phone-dark", 390, 844, "dark", "pt", False),
    ("progress-desktop", 1280, 800, "light", "en", True),
    ("progress-phone", 390, 844, "dark", "pt", True),
]
# Anna's tape over ten weeks: date, weight, waist, neck, hips
TAPE = [("2026-08-03", 68.4, 82.0, 33.0, 104.0), ("2026-08-17", 67.9, 81.2, 33.0, 103.5),
        ("2026-08-31", 67.1, 80.1, 32.8, 102.6), ("2026-09-14", 66.6, 79.4, 33.0, 102.0),
        ("2026-09-28", 65.8, 78.0, 32.9, 101.1), ("2026-10-12", 65.2, 77.1, 32.8, 100.4)]


def seed_person(data) -> None:
    root = data.root
    history.upsert_person(root, "Anna", "f", 184.5)
    for d, kg, waist, neck, hip in TAPE:
        history.add_tape(root, "anna", d, weight_kg=kg, waist_cm=waist, neck_cm=neck, hip_cm=hip)
    for run in ("Anna_August/run_20260803_100000", "Anna/run_20261012_120000"):
        e = history.add_scan(root, "anna", run)
        history.measure_scan(root, "anna", e["id"], history.ply_for(root, run))


def main() -> None:
    out = ROOT / "docs" / "images"
    out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        data = DataDir(Path(tmp))
        for name, run, seed, trunk, mtime in (("Anna", "run_20261012_120000", 1, 1.0, 2_000_000_000),
                                              ("Bruno", "run_20261012_120000", 2, 1.0, 1_999_000_000),
                                              ("Anna_August", "run_20260803_100000", 3, 1.08, 1_998_000_000)):
            # dense enough that every 1 cm slice of the trunk is a closed ring, like a real capture
            p = write_body(data.workspace / name / run / "splat" / "standard_30000_object.ply",
                           n=200_000, seed=seed, trunk=trunk)
            os.utime(p, (mtime, mtime))
        seed_person(data)
        httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.make_handler(data, Runner(data, start=False)))
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        url = f"http://127.0.0.1:{httpd.server_address[1]}/"
        with sync_playwright() as pw:
            browser = pw.chromium.launch(executable_path=os.environ.get("BODY_STUDIO_CHROMIUM") or None,
                                         args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
            for name, w, h, scheme, lang, panel in SHOTS:
                page = browser.new_page(viewport={"width": w, "height": h}, color_scheme=scheme)
                page.add_init_script(f"localStorage.setItem('lang', '{lang}')")
                if panel:
                    page.add_init_script("localStorage.setItem('progress:open', '1')")
                page.goto(url)
                page.wait_for_function("window.bodyViewer && bodyViewer.numSplats() > 0", timeout=60000)
                if panel:
                    page.wait_for_selector("#profileChart polyline.before", state="attached")
                page.wait_for_function("document.getElementById('version').textContent.length > 0")
                page.wait_for_timeout(1500)
                page.screenshot(path=str(out / f"{name}.png"))
                print(out / f"{name}.png")
                page.close()
            browser.close()
        httpd.shutdown()


if __name__ == "__main__":
    main()
