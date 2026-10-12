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

from body_studio import server  # noqa: E402

SHOTS = [  # name, width, height, colour scheme, language
    ("desktop-light", 1280, 800, "light", "en"),
    ("phone-dark", 390, 844, "dark", "pt"),
]


def main() -> None:
    out = ROOT / "docs" / "images"
    out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        data = DataDir(Path(tmp))
        for name, seed, mtime in (("Anna", 1, 2_000_000_000), ("Bruno", 2, 1_999_000_000)):
            p = write_body(data.workspace / name / "run_20261012_120000" / "splat" / "standard_30000_object.ply", seed=seed)
            os.utime(p, (mtime, mtime))
        httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.make_handler(data, Runner(data, start=False)))
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        url = f"http://127.0.0.1:{httpd.server_address[1]}/"
        with sync_playwright() as pw:
            browser = pw.chromium.launch(executable_path=os.environ.get("BODY_STUDIO_CHROMIUM") or None,
                                         args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
            for name, w, h, scheme, lang in SHOTS:
                page = browser.new_page(viewport={"width": w, "height": h}, color_scheme=scheme)
                page.add_init_script(f"localStorage.setItem('lang', '{lang}')")
                page.goto(url)
                page.wait_for_function("window.bodyViewer && bodyViewer.numSplats() > 0", timeout=60000)
                page.wait_for_function("document.getElementById('version').textContent.length > 0")
                page.wait_for_timeout(1500)
                page.screenshot(path=str(out / f"{name}.png"))
                print(out / f"{name}.png")
                page.close()
            browser.close()
        httpd.shutdown()


if __name__ == "__main__":
    main()
