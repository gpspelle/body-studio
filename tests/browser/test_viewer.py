"""The app in a real browser, with synthetic bodies: it loads, stands the body upright and
keeps it in frame. Needs `pip install playwright` and a Chromium (CI installs both);
skipped otherwise. Set BODY_STUDIO_CHROMIUM to use a Chromium that's already installed."""
import os
import struct
import tempfile
import threading
import unittest
import zlib
from http.server import ThreadingHTTPServer
from pathlib import Path

from splat_studio.server.jobs import Runner
from splat_studio.server.library import DataDir

from body_studio import server
from tests.fakes.bodyply import write_body
from tests.fakes.makehuman import write_body as write_person

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
        mia = write_person(data.workspace / "Mia/run_20261011_120000/splat/standard_30000_object.ply", n=60000)
        old = 1_700_000_000                          # older than Anna: Anna opens first
        os.utime(data.workspace / "Mia/run_20261011_120000/splat/standard_30000_object.ply", (old, old))
        cls.design = Path(cls.tmp.name) / "design.png"
        cls.design.write_bytes(arrow_png())
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

    def test_progress_panel_follows_a_person(self):
        page = self.browser.new_page(viewport={"width": 1280, "height": 800})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: m.type == "error" and errors.append(m.text))
        page.on("dialog", lambda d: d.accept())
        page.goto(self.url)
        page.wait_for_function("window.bodyViewer && bodyViewer.numSplats() > 0", timeout=60000)
        page.click("#progressBtn")
        form = page.locator("#personForm")
        form.wait_for()
        form.locator("[name=name]").fill("Anna")
        form.locator("[name=sex]").select_option("m")
        form.locator("[name=height_cm]").fill("184.5")
        form.locator("button").click()
        page.locator("#personView").wait_for()
        tape = page.locator("#tapeForm")
        for date, waist in (("2026-09-01", "92"), ("2026-10-12", "89.5")):
            tape.locator("[name=date]").fill(date)
            tape.locator("[name=waist_cm]").fill(waist)
            tape.locator("[name=neck_cm]").fill("39")
            tape.locator("button").click()
            page.wait_for_function(f"document.querySelector('#entries summary').textContent.includes('{1 if date < '2026-10' else 2}')")
        waist = page.locator("#tapeRows .row").nth(1)
        self.assertIn("89.5 cm", waist.inner_text())
        self.assertIn("−2.5 cm since", waist.inner_text())
        self.assertIn("%", page.locator("#fatNow").inner_text())
        self.assertIn("US Navy", page.locator("#fatNote").inner_text())

        page.click("#addScan")                   # the body on screen joins the history and is measured
        page.wait_for_selector("#profileChart polyline", state="attached", timeout=60000)
        self.assertEqual(page.locator("#scanList button").count(), 1)
        self.assertTrue(page.locator("#addScan").is_hidden())

        page.locator("#entries summary").click()
        page.locator("#entries li button").first.click()     # delete the newest entry
        page.wait_for_function("document.querySelector('#entries summary').textContent.includes('1')")
        self.assertEqual(errors, [])
        page.close()

    def test_tattoo_follows_the_body_as_it_moves(self):
        page = self.browser.new_page(viewport={"width": 1280, "height": 800})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: m.type == "error" and errors.append(m.text))
        page.goto(self.url)
        page.wait_for_function("window.bodyViewer && bodyViewer.numSplats() > 0", timeout=60000)
        page.locator(".shelf button", has_text="Mia").click()
        page.wait_for_function("bodyViewer.file().includes('Mia') && bodyViewer.numSplats() > 0", timeout=60000)
        page.click("#studioBtn")
        page.wait_for_function("tattooStudio.ready", timeout=180000)
        page.evaluate("bodyApp.viewer.controls.autoRotate = false")

        # a preset moves the joints and the splats with them
        hand = page.evaluate("tattooStudio.splatNear('wrist_l')")
        before = page.evaluate(f"tattooStudio.splat({hand})")
        page.locator("#presets button", has_text="Arms up").click()
        after = page.evaluate(f"tattooStudio.splat({hand})")
        wrist = page.evaluate("tattooStudio.joint('wrist_l')")
        head = page.evaluate("tattooStudio.joint('head')")
        self.assertLess(wrist[1], head[1], "the hand is above the head (the PLY is y-down)")
        self.assertLess(dist(after, wrist), 0.06)
        self.assertGreater(dist(before, after), 0.5)
        page.click("#poseReset")
        self.assertEqual(page.evaluate("tattooStudio.pose()"), {})

        # drag the dot on the left elbow: the shoulder turns, within its range
        x, y = page.evaluate("tattooStudio.screen(tattooStudio.joint('elbow_l'))")
        page.mouse.move(x, y)
        page.mouse.down()
        for k in range(1, 6):
            page.mouse.move(x + 12 * k, y - 25 * k)
        page.mouse.up()
        pose = page.evaluate("tattooStudio.pose()")
        self.assertIn("shoulder_l", pose)
        self.assertEqual(page.locator("#jointName").inner_text(), "Left shoulder")
        self.assertEqual(page.locator("#jointSliders input").count(), 3)
        page.click("#poseReset")

        # a tattoo on the forearm: pick the image, tap the arm
        page.set_input_files("#tatPick", str(self.design))
        page.wait_for_function("document.getElementById('tatHint').textContent.length > 0")
        elbow, wrist = page.evaluate("[tattooStudio.joint('elbow_l'), tattooStudio.joint('wrist_l')]")
        mid = [(a + b) / 2 for a, b in zip(elbow, wrist)]
        page.mouse.click(*page.evaluate(f"tattooStudio.screen({mid})"))
        page.wait_for_function("tattooStudio.tattoos().length === 1")
        tat = page.evaluate("tattooStudio.tattoos()[0]")
        self.assertIn(tat["bone"], ("elbow_l", "wrist_l"))
        self.assertGreater(tat["points"], 100)
        self.assertLess(dist(tat["centre"], mid), 0.08)
        page.fill("#tatSize", "6")
        page.dispatch_event("#tatSize", "input")
        self.assertEqual(page.evaluate("tattooStudio.tattoos()[0].widthCm"), 6)

        # bend the arm: the tattoo stays where it was on the forearm
        def along(t):
            e, w = page.evaluate("[tattooStudio.joint('elbow_l'), tattooStudio.joint('wrist_l')]")
            return dist(t["centre"], e), dist(t["centre"], w)
        rest = along(page.evaluate("tattooStudio.tattoos()[0]"))
        page.locator("#presets button", has_text="Flex").click()
        posed = along(page.evaluate("tattooStudio.tattoos()[0]"))
        self.assertAlmostEqual(rest[0], posed[0], delta=0.01)
        self.assertAlmostEqual(rest[1], posed[1], delta=0.01)

        # kept in this browser: open the page again and the tattoo and pose are back
        pose = page.evaluate("tattooStudio.pose()")
        page.wait_for_function("!tattooStudio.saving")
        page.reload()
        page.wait_for_function("window.bodyViewer && bodyViewer.numSplats() > 0", timeout=60000)
        page.locator(".shelf button", has_text="Mia").click()
        page.wait_for_function("bodyViewer.file().includes('Mia')")
        page.click("#studioBtn")
        page.wait_for_function("tattooStudio.ready && tattooStudio.tattoos().length === 1", timeout=60000)
        self.assertEqual(page.evaluate("tattooStudio.pose()"), pose)
        self.assertEqual(page.evaluate("tattooStudio.tattoos()[0].widthCm"), 6)
        centre = page.evaluate("tattooStudio.tattoos()[0].centre")

        # a tattoo saved by an earlier version (a place on its bone's surface map, no point on the
        # body) comes back in the same place
        page.evaluate("""async () => {
          const { SurfaceMap } = await import('/static/pose.js');
          const file = bodyViewer.file();
          const map = new SurfaceMap(await (await fetch('/api/rig?body=' + encodeURIComponent(file))).json());
          const db = await new Promise((ok) => { const r = indexedDB.open('body-studio-tattoo', 1); r.onsuccess = () => ok(r.result); });
          const store = () => db.transaction('bodies', 'readwrite').objectStore('bodies');
          const rec = await new Promise((ok) => { const r = store().get(file); r.onsuccess = () => ok(r.result); });
          for (const t of rec.tattoos) { Object.assign(t, map.locate(t.bone, t.at)); delete t.at; }
          await new Promise((ok) => { const r = store().put(rec, file); r.onsuccess = ok; });
        }""")
        page.reload()
        page.wait_for_function("window.bodyViewer && bodyViewer.numSplats() > 0", timeout=60000)
        page.locator(".shelf button", has_text="Mia").click()
        page.wait_for_function("bodyViewer.file().includes('Mia')")
        page.click("#studioBtn")
        page.wait_for_function("tattooStudio.ready && tattooStudio.tattoos().length === 1", timeout=60000)
        self.assertLess(dist(page.evaluate("tattooStudio.tattoos()[0].centre"), centre), 0.02)
        self.assertEqual(errors, [])
        page.close()


    def test_clothes_go_on_and_come_off(self):
        page = self.browser.new_page(viewport={"width": 1280, "height": 800})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: m.type == "error" and errors.append(m.text))
        page.goto(self.url)
        page.wait_for_function("window.bodyViewer && bodyViewer.numSplats() > 0", timeout=60000)
        page.locator(".shelf button", has_text="Mia").click()
        page.wait_for_function("bodyViewer.file().includes('Mia') && bodyViewer.numSplats() > 0", timeout=60000)
        page.click("#studioBtn")
        page.wait_for_function("window.wardrobe && wardrobe.ready", timeout=240000)
        page.get_by_role("button", name="Men's", exact=True).click()
        self.assertEqual(page.locator("#wearSlots [data-item=tee_shorts]").count(), 0)     # a women's outfit
        self.assertEqual(page.locator("#wearSlots [data-item=suit]").count(), 1)
        page.get_by_role("button", name="All", exact=True).click()
        page.click("#wearSlots [data-item=tee_jeans]")
        page.wait_for_function("wardrobe.worn().includes('tee_jeans')", timeout=60000)
        self.assertGreater(page.evaluate("wardrobe.splats('tee_jeans')"), 5000)
        under = page.evaluate("wardrobe.hidden()")
        self.assertGreater(under, 5000)                  # the skin under it is hidden
        self.assertEqual(page.get_attribute("#wearSlots [data-item=tee_jeans]", "aria-pressed"), "true")
        page.click("#wearSlots [data-item=white_sneakers]")
        page.wait_for_function("wardrobe.worn().length === 2", timeout=60000)
        self.assertGreater(page.evaluate("wardrobe.hidden()"), under)
        # hair colours the scalp under it rather than hiding it
        page.click("#wearSlots [data-item=ponytail]")
        page.wait_for_function("wardrobe.worn().includes('ponytail')", timeout=60000)
        self.assertGreater(page.evaluate("wardrobe.tinted()"), 500)
        page.click("#wearSlots [data-item=ponytail]")
        page.wait_for_function("!wardrobe.worn().includes('ponytail') && wardrobe.tinted() === 0")
        # a tattoo on the forearm: under a long sleeve, not under a short one
        page.set_input_files("#tatPick", str(self.design))
        page.wait_for_function("document.getElementById('tatHint').textContent.length > 0")
        elbow, wrist = page.evaluate("[tattooStudio.joint('elbow_l'), tattooStudio.joint('wrist_l')]")
        at = [0.45 * a + 0.55 * b for a, b in zip(elbow, wrist)]
        page.mouse.click(*page.evaluate(f"tattooStudio.screen({at})"))
        page.wait_for_function("tattooStudio.tattoos().length === 1")
        tat = page.evaluate("tattooStudio.tattoos()[0]")
        self.assertEqual(tat["clothed"], 0)
        page.click("#wearSlots [data-item=longsleeve_jeans]")
        page.wait_for_function("wardrobe.worn().includes('longsleeve_jeans')", timeout=60000)
        tat = page.evaluate("tattooStudio.tattoos()[0]")
        self.assertGreater(tat["clothed"], 0.8 * tat["points"])
        page.click("#wearSlots [data-item=suit]")        # one outfit at a time
        page.wait_for_function("wardrobe.worn().join() === 'suit,white_sneakers'", timeout=60000)
        page.click("#wearSlots [data-item=suit]")        # tapped again: taken off
        page.wait_for_function("wardrobe.worn().join() === 'white_sneakers'")
        self.assertEqual(page.evaluate("tattooStudio.tattoos()[0].clothed"), 0)
        page.evaluate("tattooStudio.preset('walk')")    # moves with the body, no errors
        page.reload()                                   # remembered for this body
        page.wait_for_function("window.bodyViewer && bodyViewer.numSplats() > 0", timeout=60000)
        page.locator(".shelf button", has_text="Mia").click()
        page.wait_for_function("bodyViewer.file().includes('Mia')")
        page.click("#studioBtn")
        page.wait_for_function("wardrobe.ready && wardrobe.worn().join() === 'white_sneakers'", timeout=120000)
        self.assertEqual(page.evaluate("tattooStudio.tattoos().length"), 1)
        self.assertEqual(errors, [])
        page.close()


def dist(a, b):
    return sum((x - y) ** 2 for x, y in zip(a, b)) ** 0.5


def arrow_png(w=160, h=80) -> bytes:
    """A black arrow on white, like a scanned tattoo design."""
    rows = b"".join(b"\0" + b"".join(b"\x14\x14\x14" if (abs(y - h / 2) < 8 and 10 < x < 110) or
                                       (x >= 110 and abs(y - h / 2) < 150 - x) else b"\xff\xff\xff"
                                       for x in range(w)) for y in range(h))

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b""))


if __name__ == "__main__":
    unittest.main()
