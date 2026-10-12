"""The app in a real browser, with synthetic bodies: it loads, stands the body upright and
keeps it in frame. Needs `pip install playwright` and a Chromium (CI installs both);
skipped otherwise. Set BODY_STUDIO_CHROMIUM to use a Chromium that's already installed."""
import os
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path

from splat_studio.server.jobs import Runner
from splat_studio.server.library import DataDir

from body_studio import server
from tests.fakes.bodyply import write_body

try:
    from playwright.sync_api import sync_playwright
except ImportError:  # pragma: no cover
    sync_playwright = None


@unittest.skipIf(sync_playwright is None, "playwright is not installed")
class Viewer(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        data = DataDir(Path(cls.tmp.name))
        write_body(data.workspace / "Anna/run_20261012_120000/splat/standard_30000_object.ply", n=20000)
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.make_handler(data, Runner(data, start=False)))
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()
        cls.url = f"http://127.0.0.1:{cls.httpd.server_address[1]}/"
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(
            executable_path=os.environ.get("BODY_STUDIO_CHROMIUM") or None,
            args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.tmp.cleanup()

    def test_body_loads_upright_without_errors(self):
        for w, h in ((1280, 800), (390, 844)):
            page = self.browser.new_page(viewport={"width": w, "height": h})
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.on("console", lambda m: m.type == "error" and errors.append(m.text))
            page.goto(self.url)
            page.wait_for_function("window.bodyViewer && bodyViewer.numSplats() > 0", timeout=60000)
            sx, sy, sz = page.evaluate("bodyViewer.size()")
            self.assertGreater(sy, 1.5 * max(sx, sz), "the body should stand upright")
            self.assertEqual(page.locator(".shelf button.on").inner_text(), "Anna")
            self.assertTrue(page.locator("#version").inner_text().startswith("v"))
            self.assertEqual(errors, [])
            page.close()


if __name__ == "__main__":
    unittest.main()
