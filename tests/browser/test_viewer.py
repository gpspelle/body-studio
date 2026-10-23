"""The app in a real browser, with synthetic bodies: it loads, stands the body upright and
keeps it in frame. Needs `pip install playwright` and a Chromium (CI installs both);
skipped otherwise. Set BODY_STUDIO_CHROMIUM to use a Chromium that's already installed."""
import json
import math
import os
import struct
import tempfile
import threading
import urllib.parse
import urllib.request
import unittest
import zlib
from http.server import ThreadingHTTPServer
from pathlib import Path

from splat_studio.server.jobs import Runner
from splat_studio.server.library import DataDir

from body_studio import server
from tests.fakes.bodyply import write_body
from tests.fakes.makehuman import write_body as write_person
from tests.fakes.room import write_room

from body_studio import library, sample_room

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
        write_room(data.workspace / "Living_room/run_20261021_120000", n=40000)    # a room filmed from inside
        library.mark_room(data.root, "Living_room")
        sample_room.ensure(data.root)       # made before the page opens, so it isn't made while tests run
        sample_room.ensure(data.root, library.STUDIO)
        cls.design = Path(cls.tmp.name) / "design.png"
        cls.design.write_bytes(arrow_png())
        # decor from a photo: tests/fakes/photo3d.py stands in for TripoSR
        cls._env = {k: os.environ.get(k) for k in ("BODY_STUDIO_PHOTO3D",)}
        os.environ["BODY_STUDIO_PHOTO3D"] = str(Path(__file__).resolve().parents[1] / "fakes" / "photo3d.py")
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.make_handler(data, Runner(data, start=False)))
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()
        cls.url = f"http://127.0.0.1:{cls.httpd.server_address[1]}/"
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(
            executable_path=os.environ.get("BODY_STUDIO_CHROMIUM") or None,
            args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])

    def new_page(self, **kw):
        """A page in no mode at first: just the body, every tool reachable from code, no room or
        panel of its own (each test opens what it needs; test_the_menu_shows_each_mode_its_tools
        checks the modes, and test_clothes_go_on_and_come_off the clothes one a computer opens in)."""
        page = self.browser.new_page(**kw)
        page.add_init_script("localStorage.getItem('mode') === null && localStorage.setItem('mode', 'none')")
        return page

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.tmp.cleanup()
        for k, v in cls._env.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

    def test_body_loads_upright_without_errors(self):
        for w, h in ((1280, 800), (390, 844)):
            page = self.new_page(viewport={"width": w, "height": h})
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
        page = self.new_page(viewport={"width": 1280, "height": 800})
        self.addCleanup(page.close)              # (a failed test leaves no page rendering behind)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: m.type == "error" and errors.append(m.text))
        page.on("dialog", lambda d: d.accept())
        page.goto(self.url)
        page.wait_for_function("window.bodyViewer && bodyViewer.numSplats() > 0", timeout=60000)
        page.evaluate("modes.go('progress')")
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
        page = self.new_page(viewport={"width": 1280, "height": 800})
        self.addCleanup(page.close)              # (a failed test leaves no page rendering behind)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: m.type == "error" and errors.append(m.text))
        # every line the loading screen says (busy.js), as it shows
        page.add_init_script("""addEventListener("DOMContentLoaded", () => {
          window.busySaid = [];
          const el = document.getElementById("busy");
          new MutationObserver(() => { if (!el.hidden) busySaid.push(document.getElementById("busyText").textContent); })
            .observe(el, { attributes: true, childList: true, subtree: true, characterData: true });
        })""")
        page.goto(self.url)
        page.wait_for_function("window.bodyViewer && bodyViewer.numSplats() > 0", timeout=60000)
        page.locator(".shelf button", has_text="Mia").click()
        page.wait_for_function("bodyViewer.file().includes('Mia') && bodyViewer.numSplats() > 0", timeout=60000)
        page.evaluate("document.getElementById('studio').hidden && document.getElementById('studioBtn').click()")
        page.wait_for_function("tattooStudio.ready", timeout=180000)
        # the loading screen said it was getting the body ready to move, and is gone once the
        # clothes are fitted and the shop stands round her too
        page.wait_for_function("document.getElementById('busy').hidden && !document.body.classList.contains('is-busy')", timeout=180000)
        self.assertTrue(page.evaluate("wardrobe.ready"))
        self.assertIn("Getting the body ready to move…", page.evaluate("busySaid"))
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
        # the elbow only bends; the wrist bends both ways and the forearm turns the hand
        for dot, name, sliders in (("wrist_l", "Left elbow", 1), ("hand_end_l", "Left wrist", 3)):
            page.mouse.click(*page.evaluate(f"tattooStudio.screen(tattooStudio.joint('{dot}'))"))
            self.assertEqual(page.locator("#jointName").inner_text(), name)
            self.assertEqual(page.locator("#jointSliders input").count(), sliders)
        # dragging the elbow toward the middle of the chest stops the arm at the body
        (ex, ey), (sx, sy) = page.evaluate("['elbow_l', 'spine'].map((j) => tattooStudio.screen(tattooStudio.joint(j)))")
        page.mouse.move(ex, ey)
        page.mouse.down()
        for k in range(1, 11):
            page.mouse.move(ex + (sx - ex) * k / 10, ey + (sy - ey) * k / 10)
        page.mouse.up()
        self.assertIn("shoulder_l", page.evaluate("tattooStudio.pose()"))
        self.assertLess(page.evaluate("tattooStudio.armDepth()"), 0.005)
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
        page.fill("#tatName", "Sun")                    # a name for its button
        self.assertEqual(page.locator("#tatList button").inner_text(), "Sun")

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
        page.evaluate("document.getElementById('studio').hidden && document.getElementById('studioBtn').click()")
        page.wait_for_function("tattooStudio.ready && tattooStudio.tattoos().length === 1", timeout=60000)
        self.assertEqual(page.evaluate("tattooStudio.pose()"), pose)
        self.assertEqual(page.evaluate("tattooStudio.tattoos()[0].widthCm"), 6)
        self.assertEqual(page.evaluate("tattooStudio.tattoos()[0].name"), "Sun")
        self.assertEqual(page.locator("#tatList button").inner_text(), "Sun")
        centre = page.evaluate("tattooStudio.tattoos()[0].centre")
        page.wait_for_function("!tattooStudio.saving")

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
        page.evaluate("document.getElementById('studio').hidden && document.getElementById('studioBtn').click()")
        page.wait_for_function("tattooStudio.ready && tattooStudio.tattoos().length === 1", timeout=60000)
        self.assertLess(dist(page.evaluate("tattooStudio.tattoos()[0].centre"), centre), 0.02)
        self.assertEqual(errors, [])
        page.close()


    def test_walks_and_jumps_with_the_keyboard(self):
        page = self.new_page(viewport={"width": 1280, "height": 800})
        self.addCleanup(page.close)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: m.type == "error" and errors.append(m.text))
        page.goto(self.url)
        page.wait_for_function("window.bodyViewer && bodyViewer.numSplats() > 0", timeout=60000)
        page.locator(".shelf button", has_text="Mia").click()
        page.wait_for_function("bodyViewer.file().includes('Mia') && bodyViewer.numSplats() > 0", timeout=60000)
        self.assertIn("W A S D", page.locator("#walkHint").inner_text())
        # W with the panel closed: the skeleton is found first, then the body walks away from the camera
        page.keyboard.down("w")
        page.wait_for_function("window.tattooStudio && tattooStudio.ready", timeout=180000)
        page.wait_for_function("tattooStudio.walk().active", timeout=30000)
        target = page.evaluate("bodyApp.viewer.controls.target.toArray()")
        page.wait_for_function("Math.hypot(...tattooStudio.walk().pos) > 0.4", timeout=60000)
        self.assertTrue(page.locator("#walkHint").is_hidden())
        page.keyboard.up("w")
        page.wait_for_function("!tattooStudio.walk().active", timeout=30000)
        # standing as the panel had it, but the arms held out as in the scan stay down
        pose = page.evaluate("tattooStudio.pose()")
        self.assertEqual(sorted(pose), ["elbow_l", "elbow_r", "shoulder_l", "shoulder_r"])
        self.assertLess(pose["shoulder_l"]["side"], 15)
        walked = page.evaluate("tattooStudio.walk()")
        # away from the camera: the camera looks along -z in the scene, the body walked that way
        away = page.evaluate("""(() => { const v = bodyApp.viewer, p = tattooStudio.walk().pos;
            const w = new v.holder.quaternion.constructor().copy(v.holder.quaternion);
            const d = v.camera.getWorldDirection(v.controls.target.clone());
            const m = v.controls.target.clone().set(...p).applyQuaternion(w);
            return (m.x * d.x + m.z * d.z) / Math.hypot(m.x, m.z) / Math.hypot(d.x, d.z); })()""")
        self.assertGreater(away, 0.9)
        moved = page.evaluate("bodyApp.viewer.controls.target.toArray()")
        self.assertGreater(dist(target, moved), 0.3 * page.evaluate("bodyViewer.size()[1]"),
                           "the camera follows the body")
        # Space: up in the air and down again, in the same place
        page.keyboard.press("Space")
        page.wait_for_function("tattooStudio.walk().airborne", timeout=30000)
        page.wait_for_function("!tattooStudio.walk().active", timeout=30000)
        self.assertLess(dist(walked["pos"], page.evaluate("tattooStudio.walk().pos")), 0.01)
        # A turns the body to the camera's left
        page.keyboard.down("a")
        page.wait_for_function("tattooStudio.walk().active")
        page.wait_for_function("""(() => { const f = tattooStudio.walk().facing, v = bodyApp.viewer;
            const s = new v.holder.quaternion.constructor().copy(v.holder.quaternion);
            const w = v.controls.target.clone().set(...f).applyQuaternion(s);
            const r = v.camera.getWorldDirection(v.controls.target.clone()).cross(v.camera.up);
            return (w.x * r.x + w.z * r.z) / Math.hypot(w.x, w.z) / Math.hypot(r.x, r.z) < -0.95; })()""", timeout=30000)
        page.keyboard.up("a")
        # R: back where it was scanned
        page.keyboard.press("r")
        self.assertLess(dist(page.evaluate("tattooStudio.walk().pos"), [0, 0, 0]), 1e-9)
        # Q raises the left arm and it stays up with no key held; Q again lowers it
        page.keyboard.press("q")
        page.wait_for_function("tattooStudio.walk().raised.join() === 'arm_l' && !tattooStudio.walk().busy")
        elbow, shoulder = page.evaluate("[tattooStudio.joint('elbow_l'), tattooStudio.joint('shoulder_l')]")
        self.assertLess(elbow[1], shoulder[1], "the elbow is above the shoulder (the PLY is y-down)")
        page.keyboard.press("q")
        page.wait_for_function("!tattooStudio.walk().active")
        # C raises the right knee
        page.keyboard.press("c")
        page.wait_for_function("tattooStudio.walk().raised.join() === 'knee_r' && !tattooStudio.walk().busy")
        knee, hip = page.evaluate("[tattooStudio.joint('knee_r'), tattooStudio.joint('hip_r')]")
        self.assertLess(abs(knee[1] - hip[1]), 0.1 * page.evaluate("bodyViewer.size()[1]"), "thigh level")
        page.keyboard.press("c")
        page.wait_for_function("!tattooStudio.walk().active")
        # the Guide lists the keys; Escape closes it, and keys don't walk behind it
        page.click("#menuBtn")
        page.click("#guideBtn")
        self.assertFalse(page.evaluate("document.getElementById('modes').open"))
        self.assertTrue(page.evaluate("document.getElementById('guide').open"))
        self.assertIn("Raise the left or right arm", page.locator("#guide").inner_text())
        page.keyboard.press("w")
        self.assertFalse(page.evaluate("tattooStudio.walk().active"))
        page.keyboard.press("Escape")
        self.assertFalse(page.evaluate("document.getElementById('guide').open"))
        # typing in a field doesn't walk
        page.evaluate("document.getElementById('studio').hidden && document.getElementById('studioBtn').click()")
        page.focus("#tatHeight")
        page.keyboard.press("w")
        self.assertFalse(page.evaluate("tattooStudio.walk().active"))
        self.assertEqual(errors, [])

    def test_stands_walks_and_sits_in_a_room(self):
        page = self.new_page(viewport={"width": 960, "height": 600})
        self.addCleanup(page.close)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: m.type == "error" and errors.append(m.text))
        page.goto(self.url)
        page.wait_for_function("window.bodyViewer && bodyViewer.numSplats() > 0", timeout=60000)
        page.locator(".shelf button", has_text="Mia").click()
        page.wait_for_function("bodyViewer.file().includes('Mia') && bodyViewer.numSplats() > 0", timeout=60000)
        self.assertEqual([b.inner_text() for b in page.locator(".shelf button").all()], ["Anna", "Mia"])   # not a body
        page.evaluate("modes.show('rooms')")
        page.click("#roomBtn")
        page.locator('#roomList button[data-file^="workspace/Living_room/"]').click()
        page.wait_for_function("house.shown()", timeout=300000)
        self.assertTrue(page.evaluate("bodyApp.viewer.holder.children.includes(house.mesh())"))
        # standing on free floor in the middle of the room, the camera inside it and seeing her
        where = page.evaluate("house.where()")
        self.assertTrue(page.evaluate("house.map().clear(...house.where())"))
        self.assertLess(dist(where, page.evaluate("house.map().start")), 0.05)
        self.assertEqual(page.evaluate("house.sight()"), 1)
        page.click("#roomBtn")                                        # (the menu closes)
        # walking at a wall for six seconds: she stops at it, never in it
        stopped = page.evaluate("""(() => {
            const r = house.map(), P = house.placement(), w = tattooStudio.walker(), at = house.where();
            let best = null, bd = Infinity;                     // the nearest wall, along the map's axes
            for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              let t = 0; while (t < 6 && r.free(at[0] + d[0] * t, at[1] + d[1] * t)) t += 0.02;
              if (t < bd) { bd = t; best = d; }
            }
            const move = P.wayToBody(best);
            let inside = true;
            for (let i = 0; i < 360; i++) { w.update(1 / 60, { move }); inside = inside && r.clear(...house.where(), 0.199); }
            tattooStudio.redraw();
            return { inside, walked: Math.hypot(house.where()[0] - at[0], house.where()[1] - at[1]), wall: bd };
        })()""")
        self.assertTrue(stopped["inside"])
        self.assertGreater(stopped["walked"], stopped["wall"] - 0.35)
        self.assertLess(stopped["walked"], stopped["wall"] - 0.15)
        page.evaluate("tattooStudio.stepFor(3)")                        # (stopped)
        # in front of the sofa: F sits her down on it, F again gets her up
        page.evaluate("""(() => { const s = house.map().seatNear(...house.map().start, 3) || house.map().seats[0];
            const w = tattooStudio.walker(), P = house.placement(), o = tattooStudio.rig().frame.origin;
            const b = P.toBody([s.x + s.dir[0] * 0.6, 0, s.z + s.dir[1] * 0.6]);
            w.pos = [b[0] - o[0], b[1] - o[1], b[2] - o[2]]; tattooStudio.redraw(); })()""")
        self.assertEqual(page.evaluate("house.nearby()"), "sit")
        page.wait_for_function("house.hint() === 'F to sit down'", timeout=120000)
        page.keyboard.press("f")
        self.assertEqual(page.evaluate("tattooStudio.walker().resting"), "sit")
        page.evaluate("tattooStudio.stepFor(3)")
        self.assertFalse(page.evaluate("tattooStudio.walker().busy"))
        seat, hips = page.evaluate("""(() => { const P = house.placement(), s = house.map().seatNear(...house.where(), 2);
            return [s, P.toMap(tattooStudio.joint('pelvis'))]; })()""")
        self.assertLess(dist([hips[0], hips[2]], [seat["x"], seat["z"]]), 0.05, "hips on the seat")
        self.assertAlmostEqual(hips[1], seat["y"] + 0.09, delta=0.06)
        page.keyboard.press("f")
        self.assertIsNone(page.evaluate("tattooStudio.walker().resting"))
        page.evaluate("tattooStudio.stepFor(3)")
        self.assertIsNone(page.evaluate("tattooStudio.walker().rest"))
        # no room: she stands on the plain floor again, walls gone
        page.click("#roomBtn")
        page.locator("#roomList button").first.click()
        page.wait_for_function("!house.shown()")
        self.assertIsNone(page.evaluate("tattooStudio.walker().bound"))
        self.assertEqual(errors, [])


    def test_a_tattoo_in_the_tattoo_studio(self):
        page = self.new_page(viewport={"width": 960, "height": 600})
        self.addCleanup(page.close)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: m.type == "error" and errors.append(m.text))
        page.goto(self.url)
        page.wait_for_function("window.bodyViewer && bodyViewer.numSplats() > 0", timeout=60000)
        page.locator(".shelf button", has_text="Mia").click()
        page.wait_for_function("bodyViewer.file().includes('Mia') && bodyViewer.numSplats() > 0", timeout=60000)
        page.evaluate("modes.go('tattoos')")                          # the tattoos are done in the studio
        page.wait_for_function("house.shown() && parlour.shown()", timeout=300000)
        page.wait_for_function("document.getElementById('busy').hidden", timeout=300000)
        self.assertEqual(page.evaluate("house.file()"), page.evaluate("house.studio().file"))
        self.assertFalse(page.evaluate("document.getElementById('studio').hidden"))
        self.assertTrue(page.locator("#wear").is_hidden())                # no clothes to pick here
        self.assertTrue(page.locator("#roomBtn").is_hidden())             # nor another room
        self.assertFalse(page.evaluate("document.getElementById('studioViews').hidden"))
        # the twelve starters on the flash wall; a tap on one picks it to lay on the body
        page.wait_for_function("parlour.sheets().length === 12 && parlour.sheets().every((s) => s.ready)", timeout=60000)
        page.evaluate("""(() => { const P = house.placement(), V = bodyApp.viewer, c = house.fixtures().flash.centre, n = house.fixtures().flash.normal;
            const V3 = V.camera.position.constructor, eye = P.toBody([c[0] + n[0] * 2.6, 1.45, c[2] + n[2] * 2.6]);
            const at = P.toBody([c[0] + n[0] * 0.3, c[1], c[2] + n[2] * 0.3]);
            V.holder.updateMatrixWorld();
            V.controls.target.copy(V.holder.localToWorld(new V3(...at)));
            V.camera.position.copy(V.holder.localToWorld(new V3(...eye))); V.controls.update(); })()""")
        at = page.wait_for_function("parlour.sheetOnScreen(1)", timeout=60000).json_value()
        page.mouse.click(at["x"], at["y"])
        page.wait_for_function("tattooStudio.pending()", timeout=60000)
        self.assertEqual(page.evaluate("parlour.picked()"), "swallow")
        self.assertFalse(page.evaluate("document.getElementById('studio').hidden"), "the panel opens to lay it")
        page.evaluate("house.view()")
        elbow, wrist = page.evaluate("[tattooStudio.joint('elbow_l'), tattooStudio.joint('wrist_l')]")
        page.mouse.click(*page.evaluate(f"tattooStudio.screen({[0.5 * a + 0.5 * b for a, b in zip(elbow, wrist)]})"))
        page.wait_for_function("tattooStudio.tattoos().length === 1 && tattooStudio.tattoos()[0].inked", timeout=120000)
        self.assertEqual(page.evaluate("tattooStudio.tattoos()[0].name"), "Swallow")
        # in a long-sleeved top, by the chair: F sits her down with that arm on its rest, the sleeve off
        page.wait_for_function("window.wardrobe && wardrobe.ready", timeout=240000)
        page.evaluate("wardrobe.wear('longsleeve_jeans')")
        page.wait_for_function("wardrobe.worn().includes('longsleeve_jeans')", timeout=120000)
        self.assertEqual(page.evaluate("wardrobe.covering(tattooStudio.skinUnder(0))"), ["longsleeve_jeans"])
        page.evaluate("document.getElementById('closeStudio').click()")
        page.evaluate("""(() => { const c = house.fixtures().chair, w = tattooStudio.walker(), P = house.placement(), o = tattooStudio.rig().frame.origin;
            const b = P.toBody([c.at[0] + c.facing[0] * 0.7, 0, c.at[2] + c.facing[2] * 0.7]);
            w.pos = [b[0] - o[0], b[1] - o[1], b[2] - o[2]]; tattooStudio.redraw(); })()""")
        self.assertEqual(page.evaluate("parlour.station()"), {"kind": "chair", "arm": "l"})
        page.wait_for_function("house.hint() === 'F to sit in the chair, the arm on its rest'", timeout=120000)
        page.keyboard.press("f")
        self.assertEqual(page.evaluate("tattooStudio.walker().resting"), "sit")
        self.assertEqual(page.evaluate("parlour.lent()"), ["longsleeve_jeans"])
        self.assertEqual(page.evaluate("wardrobe.worn()"), [])
        page.evaluate("tattooStudio.stepFor(3)")
        mid, rest = page.evaluate("""(() => { const P = house.placement(), j = (n) => P.toMap(tattooStudio.joint(n));
            const e = j('elbow_l'), w = j('wrist_l'); return [[(e[0] + w[0]) / 2, (e[1] + w[1]) / 2, (e[2] + w[2]) / 2],
              house.fixtures().rests.find((r) => r.side === 'l').at]; })()""")
        self.assertLess(dist([mid[0], mid[2]], [rest[0], rest[2]]), 0.12, "the forearm on its rest")
        # the views: the artist's (close over the tattoo), the mirror's (drawn mirrored), the room's
        page.click('#studioViews button[data-view="artist"]')
        near = page.evaluate("""(() => { const V = bodyApp.viewer, c = tattooStudio.tattoos()[0].centre;
            V.holder.updateMatrixWorld(); const p = V.holder.localToWorld(new V.camera.position.constructor(...c));
            return V.camera.position.distanceTo(p) / tattooStudio.rig().height * 1.75; })()""")
        self.assertLess(near, 0.7)
        page.click('#studioViews button[data-view="mirror"]')
        self.assertEqual(page.evaluate("bodyApp.viewer.canvas.style.transform"), "scaleX(-1)")
        page.click('#studioViews button[data-view="room"]')
        self.assertEqual(page.evaluate("bodyApp.viewer.canvas.style.transform"), "")
        # F again: up, and the top back on
        page.keyboard.press("f")
        page.evaluate("tattooStudio.stepFor(3)")
        page.wait_for_function("wardrobe.worn().includes('longsleeve_jeans')", timeout=120000)
        self.assertEqual(page.evaluate("parlour.lent()"), [])
        # the clothes: out of the studio, no flash wall, no views
        page.evaluate("modes.go('clothes')")
        page.wait_for_function("!house.shown() && !parlour.shown()")
        self.assertTrue(page.evaluate("document.getElementById('studioViews').hidden"))
        self.assertEqual(errors, [])

    def test_decorates_a_room(self):
        page = self.new_page(viewport={"width": 1100, "height": 700})
        self.addCleanup(page.close)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: m.type == "error" and errors.append(m.text))
        page.goto(self.url)
        page.wait_for_function("window.bodyViewer && bodyViewer.numSplats() > 0", timeout=60000)
        self.assertTrue(page.locator("#decorBtn").is_hidden())          # only in a room
        page.locator(".shelf button", has_text="Mia").click()
        page.wait_for_function("bodyViewer.file().includes('Mia') && bodyViewer.numSplats() > 0", timeout=60000)
        page.evaluate("modes.show('rooms')")
        page.click("#roomBtn")
        page.locator("#roomList button[data-file^='workspace/Living_room/']").click()
        page.wait_for_function("house.shown() && decor.group()", timeout=300000)
        # the room as it was afterwards, for the other tests, even when this one fails
        room = page.evaluate("house.file()")
        self.addCleanup(lambda: urllib.request.urlopen(urllib.request.Request(
            self.url + "api/decor/layout?room=" + urllib.parse.quote(room), method="POST",
            data=json.dumps({"current": 0, "layouts": [{"name": "Layout 1", "items": []}]}).encode())).read())
        page.click("#roomBtn")
        page.evaluate("document.getElementById('studio').hidden || document.getElementById('closeStudio').click()")
        page.evaluate("document.getElementById('studioBtn').click()")              # the body's panel open...
        page.click("#decorBtn")
        self.assertTrue(page.locator("#decor").is_visible())
        self.assertTrue(page.locator("#studio").is_hidden())                       # ...steps aside for decor
        # the starters, by kind: tables and chairs first
        page.evaluate("decor.shelf('tables')")
        self.assertEqual(page.locator("#decorGroups button").count(), 6)
        tables = page.evaluate("[...document.querySelectorAll('#decorItems button')].map((b) => b.dataset.item)")
        self.assertIn("round_table", tables)
        self.assertIn("bench", tables)
        self.assertNotIn("candle", tables)
        # a chair, a step ahead of her, facing her: the walk goes round it
        page.locator("#decorItems button[data-item=chair]").click()
        self.assertEqual(page.evaluate("decor.drawn()"), 1)
        chair = page.evaluate("decor.placed()[0]")
        self.assertFalse(page.evaluate(f"house.map().free({chair['x']}, {chair['z']})"))
        self.assertLess(dist([chair["x"], chair["z"]], page.evaluate("house.where()")), 6)
        page.locator("#decorColours button[data-colour=wood]").click()
        self.assertEqual(page.evaluate("decor.placed()[0].colour"), "wood")
        page.select_option("#decorRowN", "5")
        page.click("#decorRow")
        self.assertEqual(page.evaluate("decor.placed().length"), 5)
        # a round table with eight chairs round it, a candle on it
        page.locator("#decorItems button[data-item=round_table]").click()
        page.select_option("#decorRowN", "8")
        page.click("#decorAround")
        self.assertEqual(page.evaluate("decor.placed().length"), 14)
        page.locator("#decorGroups button", has_text="On the table").click()
        page.locator("#decorItems button[data-item=candle]").click()
        y = page.evaluate("""(() => { const p = decor.placed(), t = p.find((q) => q.item === 'round_table');
            decor.move(p.length - 1, t.x + 0.3, t.z); return decor.placed()[p.length - 1].y; })()""")
        self.assertAlmostEqual(y, 0.76, places=3)
        self.assertEqual(page.evaluate("decor.drawn()"), 15)
        # the table set: a place in front of each of its eight chairs, on it
        page.evaluate("decor.pick(decor.placed().findIndex((q) => q.item === 'round_table'))")
        page.click("#decorSet")
        settings = page.evaluate("decor.placed().filter((q) => q.item === 'place_setting')")
        self.assertEqual(len(settings), 8)
        self.assertTrue(all(abs(q["y"] - 0.76) < 1e-6 for q in settings))
        page.click("#decorSet")                                                     # set already
        self.assertEqual(page.evaluate("decor.placed().filter((q) => q.item === 'place_setting').length"), 8)
        # lights glow: string lights over the table
        glowing = page.evaluate("decor.glowing()")
        page.locator("#decorGroups button", has_text="Lights").click()
        page.locator("#decorItems button[data-item=string_lights]").click()
        self.assertEqual(page.evaluate("decor.glowing()"), glowing + 1)
        # handles on the picked thing, like the body's joints: the knob over the candle raises it,
        # the ring's knob turns it
        k = page.evaluate("decor.placed().findIndex((q) => q.item === 'candle')")
        page.evaluate(f"decor.pick({k})")
        page.wait_for_function("decor.handles() !== null")
        h = page.evaluate("decor.handles()")
        y0 = page.evaluate(f"decor.placed()[{k}].y")
        page.mouse.move(*h["lift"])
        page.mouse.down()
        page.mouse.move(h["lift"][0], h["lift"][1] - 40, steps=4)
        page.mouse.up()
        candle = page.evaluate(f"decor.placed()[{k}]")
        self.assertGreater(candle["lift"], 0.03)
        self.assertAlmostEqual(candle["y"], y0 + candle["lift"], places=6)
        self.assertEqual(page.input_value("#decorLift"), str(round(candle["lift"] * 100)))
        page.locator("#decorLift").fill("0")                                        # back down by the slider
        self.assertNotIn("lift", page.evaluate(f"decor.placed()[{k}]"))
        h = page.evaluate("decor.handles()")
        turn0 = candle["turn"]
        page.mouse.move(*h["turn"])
        page.mouse.down()
        # round to the other side of the ring: about half a turn
        page.mouse.move(2 * h["ring"][0] - h["turn"][0], 2 * h["ring"][1] - h["turn"][1], steps=8)
        page.mouse.up()
        turn1 = page.evaluate(f"decor.placed()[{k}].turn")
        self.assertGreater(abs(math.remainder(turn1 - turn0, 2 * math.pi)), 2)
        self.assertAlmostEqual(turn1 / (math.pi / 12), round(turn1 / (math.pi / 12)), places=6)   # in steps
        # the toolbar by the picked thing: a copy beside it, picked, then taken away again
        page.wait_for_function("!document.getElementById('decorBar').hidden")
        n = page.evaluate("decor.placed().length")
        page.click("#barCopy")
        self.assertEqual(page.evaluate("decor.placed().length"), n + 1)
        self.assertEqual(page.evaluate("decor.selected()"), n)
        self.assertEqual(page.evaluate("decor.placed()[decor.selected()].item"), "candle")
        page.click("#barRemove")
        self.assertEqual(page.evaluate("decor.placed().length"), n)
        page.wait_for_function("document.getElementById('decorBar').hidden")
        # the catalogue shows a picture of each thing, made by the page
        page.wait_for_function("document.querySelector('#decorItems .pic img')", timeout=300000)
        # dragged along the floor with the mouse: a thing in view, not under the panel
        page.evaluate("decor.pick(-1); tattooStudio.stepFor(1)")
        at = page.evaluate("""(() => {
            const free = document.querySelector('#decor').getBoundingClientRect().left;
            for (const m of decor.group().children.filter((c) => c.isMesh)) {
              const v = m.localToWorld(m.position.clone().set(0, 0.5, 0)).project(bodyApp.viewer.camera);
              const x = (v.x + 1) / 2 * innerWidth, y = (1 - v.y) / 2 * innerHeight;
              if (v.z < 1 && x > 20 && x < free - 60 && y > 80 && y < innerHeight - 20
                  && document.elementFromPoint(x, y) === bodyApp.viewer.canvas) return [x, y];
            }
            return null; })()""")
        self.assertIsNotNone(at, "something in view to drag")
        before = page.evaluate("decor.placed()")
        page.mouse.move(*at)
        page.mouse.down()
        page.mouse.move(at[0] + 40, at[1] + 10, steps=5)
        page.mouse.up()
        k = page.evaluate("decor.selected()")
        self.assertGreaterEqual(k, 0, "the thing under the pointer is picked")
        after = page.evaluate("decor.placed()")[k]
        self.assertGreater(dist([after["x"], after["z"]], [before[k]["x"], before[k]["z"]]), 0.05)
        # kept for the room: there again after a reload
        page.wait_for_function("!decor.saving")
        page.reload()
        page.wait_for_function("window.decor && decor.placed().length === 24", timeout=300000)
        self.assertEqual(page.evaluate("decor.layouts().layouts.length"), 1)
        page.click("#decorBtn")
        page.click("#decorRoomTab")                                                # the layouts are with what is in the room
        page.click("#decorNew")
        self.assertEqual(page.evaluate("decor.placed().length"), 0)
        self.assertEqual(page.locator("#decorLayout option").count(), 2)
        page.select_option("#decorLayout", "0")
        self.assertEqual(page.evaluate("decor.placed().length"), 24)
        # a thing made from a photo (the stand-in for TripoSR makes a cone), at its real height
        page.click("#decorAddTab")
        page.set_input_files("#decorPick", str(self.design))
        page.locator("#decorForm [name=label]").fill("Arch from Instagram")
        page.locator("#decorForm [name=height]").fill("120")
        page.locator("#decorForm button.btn").click()
        page.wait_for_function("decor.items().some((i) => i.name === 'Arch from Instagram' && i.status === 'ready')", timeout=60000)
        page.locator("#decorGroups button", has_text="From photos").click()
        page.locator("#decorItems button", has_text="Arch from Instagram").click()
        page.wait_for_function("decor.drawn() === 25")
        scale = page.evaluate("decor.group().children.filter((c) => c.isMesh).find((c) => c.userData.index === 24).scale.y")
        self.assertAlmostEqual(scale, 1.2, places=6)
        self.assertTrue(page.locator("#decorHeightRow").is_visible())
        # a chair is somewhere to sit
        page.evaluate("""(() => { const c = decor.placed()[1], w = tattooStudio.walker(), P = house.placement(), o = tattooStudio.rig().frame.origin;
            const b = P.toBody([c.x + Math.sin(c.turn) * 0.55, 0, c.z + Math.cos(c.turn) * 0.55]);
            w.pos = [b[0] - o[0], b[1] - o[1], b[2] - o[2]]; tattooStudio.redraw(); })()""")
        self.assertEqual(page.evaluate("house.nearby()"), "sit")
        # what is in the room, listed by kind: a line picks it, its x takes it away
        page.evaluate("decor.open()")
        page.click("#decorRoomTab")
        self.assertIn("(25)", page.text_content("#decorRoomTab"))
        rows = page.locator("#decorList li:not(.group)")
        self.assertEqual(rows.count(), 25)
        self.assertEqual(page.locator("#decorList li.group").first.text_content(), "Tables")
        page.locator("#decorList li .name", has_text="Arch from Instagram").click()
        self.assertEqual(page.evaluate("decor.placed()[decor.selected()].item"), page.evaluate("decor.placed()[24].item"))
        page.locator("#decorList li", has_text="Round table").locator(".x").click()
        self.assertEqual(page.evaluate("decor.placed().filter((q) => q.item === 'round_table').length"), 0)
        self.assertEqual(rows.count(), 24)
        self.assertIn("(24)", page.text_content("#decorRoomTab"))
        self.assertEqual(errors, [])

    def test_the_menu_shows_each_mode_its_tools(self):
        page = self.new_page(viewport={"width": 1100, "height": 700})
        self.addCleanup(page.close)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: m.type == "error" and errors.append(m.text))
        page.goto(self.url)
        page.wait_for_function("window.bodyViewer && bodyViewer.numSplats() > 0", timeout=60000)
        page.locator(".shelf button", has_text="Mia").click()
        page.wait_for_function("bodyViewer.file().includes('Mia') && bodyViewer.numSplats() > 0", timeout=60000)
        # the top bar: the name (the menu), and nothing else of the modes'
        for b in ("#studioBtn", "#progressBtn", "#guideBtn", "#lang", "#roomBtn", "#decorBtn"):
            self.assertTrue(page.locator(b).is_hidden(), b)
        page.click("#menuBtn")
        self.assertTrue(page.evaluate("document.getElementById('modes').open"))
        self.assertEqual(page.get_attribute("#menuBtn", "aria-expanded"), "true")
        self.assertEqual([b.inner_text().split("\n")[0] for b in page.locator("#modes nav > *").all()],
                         ["Style your clothes", "Style your tattoos", "Rooms", "Body progress", "New body", "Guide", "Language"])
        page.keyboard.press("Escape")
        self.assertFalse(page.evaluate("document.getElementById('modes').open"))
        # clothes: the panel with what is worn, the shop round her, no room
        page.click("#menuBtn")
        page.click('#modes button[data-mode="clothes"]')
        self.assertFalse(page.evaluate("document.getElementById('modes').open"))
        self.assertEqual(page.inner_text("#modeName"), "Clothes")
        page.wait_for_function("!document.getElementById('studio').hidden && window.wardrobe && wardrobe.ready", timeout=240000)
        page.wait_for_function("wardrobe.shop() && wardrobe.shop().shown", timeout=60000)
        self.assertTrue(page.locator("#wear").is_visible())
        self.assertEqual(off_rack(page), ["beads", "chain", "choker"])   # in the list, only what has no rack
        self.assertTrue(page.locator("#roomBtn").is_hidden())
        # rooms: the living room, no shop, no panel; the room menu and decor in the bar
        page.click("#menuBtn")
        page.click('#modes button[data-mode="rooms"]')
        page.wait_for_function("house.shown() && !house.file().includes('_sample_studio')", timeout=300000)
        self.assertTrue(page.locator("#studio").is_hidden())
        self.assertFalse(page.evaluate("wardrobe.shop().shown"))
        self.assertTrue(page.locator("#roomBtn").is_visible())
        self.assertTrue(page.locator("#decorBtn").is_visible())
        room = page.evaluate("house.file()")
        # progress: the panel, no room; the rooms mode comes back to the same room
        page.click("#menuBtn")
        page.click('#modes button[data-mode="progress"]')
        page.wait_for_function("!house.shown() && !document.getElementById('progress').hidden")
        self.assertTrue(page.locator("#roomBtn").is_hidden())
        page.evaluate("modes.go('rooms')")
        page.wait_for_function(f"house.file() === {json.dumps(room)}", timeout=300000)
        # the language, from the menu too
        page.click("#menuBtn")
        page.click("#lang")
        page.wait_for_function("document.getElementById('modeName').textContent === 'Cômodos'")
        page.click("#menuBtn")
        page.click("#lang")
        page.evaluate("modes.go('none')")
        page.wait_for_function("!house.shown()")
        self.assertEqual(errors, [])

    def test_clothes_go_on_and_come_off(self):
        page = self.browser.new_page(viewport={"width": 1280, "height": 800})   # (a first visit: no mode kept)
        self.addCleanup(page.close)              # (a failed test leaves no page rendering behind)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: m.type == "error" and errors.append(m.text))
        # (the panel opens for Anna first, who isn't shaped like a person: her skeleton is refused)
        refused = []
        page.on("response", lambda r: r.status == 422 and refused.append(r.url))
        page.goto(self.url)
        page.wait_for_function("window.bodyViewer && bodyViewer.numSplats() > 0", timeout=60000)
        # the first time on a computer the page is for the clothes: the panel opens by itself when a
        # body is shown, with only what is worn in it (the rest is picked from the racks)
        self.assertEqual(page.evaluate("modes.mode()"), "clothes")
        page.locator(".shelf button", has_text="Mia").click()
        page.wait_for_function("bodyViewer.file().includes('Mia') && bodyViewer.numSplats() > 0", timeout=60000)
        page.wait_for_function("!document.getElementById('studio').hidden", timeout=60000)
        page.wait_for_function("window.wardrobe && wardrobe.ready", timeout=240000)
        page.wait_for_function("wardrobe.shop() && wardrobe.shop().shown", timeout=60000)
        self.assertEqual(off_rack(page), ["beads", "chain", "choker"])   # in the list, only what has no rack
        self.assertFalse(page.evaluate("[...document.querySelectorAll('#studioBody > section:not(#wear)')].some((e) => e.offsetParent)"))   # no tattoos or pose
        page.evaluate("modes.show('none')")              # (every tool, to try the list as well)
        # the panel lists everything by kind, filtered by style
        self.assertEqual(page.locator("#wearPick button").count(), len(page.evaluate("wardrobe.items()")))
        page.locator("#wearStyles button", has_text="Punk").click()
        punk = page.evaluate("[...document.querySelectorAll('#wearPick button')].map((b) => b.dataset.item)")
        self.assertIn("tartan_skirt", punk)
        self.assertIn("choker", punk)
        self.assertNotIn("tee_jeans", punk)
        page.locator('#wearPick button[data-item="choker"]').click()
        page.wait_for_function("wardrobe.worn().includes('choker')", timeout=120000)
        self.assertGreater(page.evaluate("wardrobe.splats('choker')"), 100)
        page.locator('#wearPick button[data-item="choker"]').click()          # again: off
        page.wait_for_function("!wardrobe.worn().includes('choker')", timeout=60000)
        page.locator("#wearStyles button", has_text="All").click()
        # every item but the necklaces is on a rack, a shelf or a stand around the body
        shop = page.evaluate("wardrobe.shop()")
        self.assertTrue(shop["shown"])
        self.assertFalse(page.evaluate("document.getElementById('wearModel').hidden"))   # Anny is always offered
        self.assertEqual(len(shop["racked"]), len([i for i in page.evaluate("wardrobe.items()") if i["display"] != "none"]))
        self.assertEqual(page.locator("#wearWorn button").count(), 0)
        # pointing at one names it; clicking it puts it on and takes it off the rack
        at = page.evaluate("wardrobe.onScreen('tee_jeans')")
        page.mouse.move(at["x"], at["y"])
        page.wait_for_function("!document.getElementById('shopTip').hidden")
        self.assertEqual(page.inner_text("#shopTip"), "Loose T-shirt and jeans")
        pick(page, "tee_jeans")
        page.wait_for_function("wardrobe.worn().includes('tee_jeans')", timeout=60000)
        self.assertGreater(page.evaluate("wardrobe.splats('tee_jeans')"), 5000)
        under = page.evaluate("wardrobe.hidden()")
        self.assertGreater(under, 5000)                  # the skin under it is hidden
        # with the arms raised the shirt stays on the skin it hangs from (its sides once took the
        # upper arm's motion and flew out 11 cm); across the armpit it bridges the hollow
        page.evaluate("tattooStudio.preset('armsUp')")
        self.assertLess(page.evaluate("wardrobe.gap('tee_jeans', 0.99)"), 0.035)
        self.assertLess(page.evaluate("wardrobe.gap('tee_jeans', 1)"), 0.08)
        # and the splats where the cloth stretches grow to keep it closed, then shrink back
        page.wait_for_function("wardrobe.grown('tee_jeans') > 100", timeout=30000)
        page.evaluate("tattooStudio.preset('rest')")
        page.wait_for_function("wardrobe.grown('tee_jeans') === 0", timeout=30000)
        self.assertEqual(page.locator("#wearWorn [data-item=tee_jeans]").count(), 1)
        self.assertNotIn("tee_jeans", page.evaluate("wardrobe.shop().racked"))
        pick(page, "white_sneakers")
        page.wait_for_function("wardrobe.worn().length === 2", timeout=60000)
        self.assertGreater(page.evaluate("wardrobe.hidden()"), under)
        # hair colours the scalp under it rather than hiding it
        pick(page, "ponytail")
        page.wait_for_function("wardrobe.worn().includes('ponytail')", timeout=60000)
        self.assertGreater(page.evaluate("wardrobe.tinted()"), 500)
        # a hat goes over the hair, and fits the head again when the hair comes off
        pick(page, "fedora")
        page.wait_for_function("wardrobe.worn().includes('fedora')", timeout=60000)
        self.assertGreater(page.evaluate("wardrobe.hatScale()"), 1.02)
        page.click("#wearWorn [data-item=ponytail]")       # taken off from the panel
        page.wait_for_function("!wardrobe.worn().includes('ponytail') && wardrobe.hatScale() === 1", timeout=60000)
        # what is worn stays on its stand as a pale outline: clicking it takes it off
        self.assertIn("fedora", page.evaluate("wardrobe.shop().ghosts"))
        at = page.evaluate("wardrobe.onScreen('fedora')")
        page.mouse.move(at["x"], at["y"])
        page.wait_for_function("document.getElementById('shopTip').textContent === 'Take off Fedora'")
        pick(page, "fedora")
        page.wait_for_function("!wardrobe.worn().includes('fedora') && wardrobe.tinted() === 0", timeout=60000)
        # a tattoo on the forearm: under a long sleeve, not under a short one
        page.set_input_files("#tatPick", str(self.design))
        page.wait_for_function("document.getElementById('tatHint').textContent.length > 0")
        elbow, wrist = page.evaluate("[tattooStudio.joint('elbow_l'), tattooStudio.joint('wrist_l')]")
        at = [0.45 * a + 0.55 * b for a, b in zip(elbow, wrist)]
        page.mouse.click(*page.evaluate(f"tattooStudio.screen({at})"))
        page.wait_for_function("tattooStudio.tattoos().length === 1")
        page.wait_for_function("tattooStudio.tattoos()[0].inked")
        page.evaluate("bodyApp.viewer.controls.autoRotate = false")
        self.assertGreater(ink_pixels(page, at), 8)        # the ink shows on the bare arm (the shop round her makes it small)
        pick(page, "longsleeve_jeans")
        page.wait_for_function("wardrobe.worn().includes('longsleeve_jeans')", timeout=60000)
        # the skin under the sleeve is hidden, and the ink in it with it
        page.wait_for_function("tattooStudio.tattoos()[0].shown < 0.02 * tattooStudio.tattoos()[0].splats")
        self.assertLess(ink_pixels(page, at), 5)            # nothing of it on screen
        pick(page, "suit")                                # one outfit at a time
        page.wait_for_function("wardrobe.worn().join() === 'suit,white_sneakers'", timeout=60000)
        self.assertIn("longsleeve_jeans", page.evaluate("wardrobe.shop().racked"))   # back on its shelf
        page.click("#wearWorn [data-item=suit]")          # taken off
        page.wait_for_function("wardrobe.worn().join() === 'white_sneakers'")
        self.assertGreater(ink_pixels(page, at), 8)
        page.evaluate("tattooStudio.preset('walk')")    # moves with the body, no errors
        # walking: the shoes stay on the feet, the tattoo goes along on the arm
        ink, shoes = page.evaluate("[tattooStudio.tattoos()[0].centre, wardrobe.gap('white_sneakers')]")
        page.keyboard.down("w")
        page.wait_for_function("Math.hypot(...tattooStudio.walk().pos) > 0.3", timeout=60000)
        self.assertLess(abs(page.evaluate("wardrobe.gap('white_sneakers')") - shoes), 0.01)
        self.assertGreater(dist(ink, page.evaluate("tattooStudio.tattoos()[0].centre")),
                           0.25 * page.evaluate("bodyViewer.size()[1]"))
        page.keyboard.up("w")
        page.wait_for_function("!tattooStudio.walk().active", timeout=60000)   # (slow with clothes and the shop on CI)
        # a skirt and long hair swing as she walks off and turns, within their limits, and settle
        page.evaluate("wardrobe.wear('shirt_skirt').then(() => wardrobe.wear('long'))")
        page.wait_for_function("wardrobe.worn().includes('shirt_skirt') && wardrobe.worn().includes('long')", timeout=120000)
        page.evaluate("tattooStudio.walkFor(0.6, 'f', false, true)")
        sw = page.evaluate("tattooStudio.swing()")
        self.assertTrue(sw["moving"])
        self.assertGreater(math.hypot(*sw["hips"]), 0.003)
        self.assertLess(math.hypot(*sw["hips"]), 0.03)
        most = page.evaluate("tattooStudio.walkFor(0.5, 'b', false, true)")
        self.assertGreater(most["turn"]["hips"], 0.02)                       # the hem turns behind as she turns
        page.evaluate("tattooStudio.walkFor(5, '', false, true)")             # standing: it settles
        self.assertFalse(page.evaluate("tattooStudio.swing().moving"))
        page.evaluate("tattooStudio.wake()")
        page.evaluate("wardrobe.wear('shirt_skirt').then(() => wardrobe.wear('long'))")   # taken off again
        page.wait_for_function("wardrobe.worn().join() === 'white_sneakers'", timeout=60000)
        page.keyboard.press("r")
        page.reload()                                   # remembered for this body
        page.wait_for_function("window.bodyViewer && bodyViewer.numSplats() > 0", timeout=60000)
        page.locator(".shelf button", has_text="Mia").click()
        page.wait_for_function("bodyViewer.file().includes('Mia')")
        page.evaluate("document.getElementById('studio').hidden && document.getElementById('studioBtn').click()")
        page.wait_for_function("wardrobe.ready && wardrobe.worn().join() === 'white_sneakers'", timeout=120000)
        self.assertEqual(page.evaluate("tattooStudio.tattoos().length"), 1)
        # undressed without putting anything else on
        pick(page, "fedora")
        page.wait_for_function("wardrobe.worn().length === 2", timeout=60000)
        page.click("#wearNone")
        page.wait_for_function("wardrobe.worn().length === 0 && wardrobe.hidden() === 0")
        self.assertTrue(page.is_hidden("#wearNone"))
        self.assertEqual(page.evaluate("wardrobe.shop().ghosts"), [])
        self.assertTrue(all("Anna" in u for u in refused), refused)
        errors = [e for e in errors if not (refused and "status of 422" in e)]
        self.assertEqual(errors, [])
        page.close()

    def test_switches_the_body_model(self):
        """The panel offers both body models; switching fits the clothes worn again on the other.
        (CI has no PyTorch: a standard fit stands in for Anny's, so nothing is installed.)"""
        from unittest import mock
        from body_studio import anny_fit, fit

        def fake(ply):
            r = fit.build(ply)
            r["model"] = "anny"
            anny_fit.fit_file(ply).write_text(json.dumps(r, separators=(",", ":")))
            return r
        p = mock.patch.object(anny_fit, "build_and_save", fake)
        p.start()
        self.addCleanup(p.stop)
        page = self.new_page(viewport={"width": 1280, "height": 800})
        self.addCleanup(page.close)
        errors, asked = [], []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: m.type == "error" and errors.append(m.text))
        page.on("request", lambda r: "model=anny" in r.url and asked.append(r.url))
        page.goto(self.url)
        page.wait_for_function("window.bodyViewer && bodyViewer.numSplats() > 0", timeout=60000)
        page.locator(".shelf button", has_text="Mia").click()
        page.wait_for_function("bodyViewer.file().includes('Mia') && bodyViewer.numSplats() > 0", timeout=60000)
        page.evaluate("document.getElementById('studio').hidden && document.getElementById('studioBtn').click()")
        page.wait_for_function("window.wardrobe && wardrobe.ready", timeout=240000)
        self.assertTrue(page.is_visible("#wearModel"))
        self.assertEqual(page.evaluate("wardrobe.model()"), "standard")
        self.assertEqual(page.locator("#wearModel button.on").inner_text(), "Standard")
        page.evaluate("wardrobe.wear('tee_jeans')")
        page.wait_for_function("wardrobe.worn().includes('tee_jeans')", timeout=60000)
        page.click("#wearModel [data-model=anny]")
        page.wait_for_function("wardrobe.ready && wardrobe.model() === 'anny' && wardrobe.worn().includes('tee_jeans')"
                               " && wardrobe.hidden() > 5000", timeout=240000)
        self.assertEqual(page.locator("#wearModel button.on").inner_text(), "Anny (trial)")
        self.assertTrue(any("/api/fit?" in u for u in asked) and any("/api/wardrobe/tee_jeans?" in u for u in asked))
        page.reload()                                       # the choice is remembered
        page.wait_for_function("window.bodyViewer && bodyViewer.numSplats() > 0", timeout=60000)
        page.locator(".shelf button", has_text="Mia").click()
        page.wait_for_function("bodyViewer.file().includes('Mia')")
        page.evaluate("document.getElementById('studio').hidden && document.getElementById('studioBtn').click()")
        page.wait_for_function("wardrobe.ready && wardrobe.model() === 'anny' && wardrobe.worn().join() === 'tee_jeans'",
                               timeout=120000)
        page.click("#wearModel [data-model=standard]")
        page.wait_for_function("wardrobe.ready && wardrobe.model() === 'standard' && wardrobe.worn().join() === 'tee_jeans'",
                               timeout=120000)
        self.assertEqual(errors, [])


def off_rack(page):
    """The items the panel's list shows (sorted)."""
    return sorted(page.evaluate("[...document.querySelectorAll('#wearPick button')].filter((b) => b.offsetParent).map((b) => b.dataset.item)"))


def pick(page, item):
    """Click an item on the racks around the body, where it shows on the screen."""
    # (after a reload the camera may still be moving to frame the shop: wait until the item stays
    # put over a few frames)
    page.wait_for_function(f"""(() => {{
        const a = wardrobe.onScreen('{item}'), v = bodyApp.viewer.spark.current.version, b = window._pickAt;
        if (!a) return false;
        if (!b || Math.hypot(a.x - b.x, a.y - b.y) > 2) {{ window._pickAt = {{ ...a, v, n: 0 }}; return false; }}
        if (v !== b.v) {{ b.v = v; b.n++; }} else b.still = (b.still || 0) + 1;
        return b.n >= 3 || b.still >= 20;
    }})()""", polling="raf", timeout=120000)
    at = page.evaluate(f"wardrobe.onScreen('{item}')")
    page.mouse.click(at["x"], at["y"])


def settled(page):
    """Wait until the loading screen is gone and the splats on screen are the latest ones."""
    page.wait_for_function("document.getElementById('busy').hidden", timeout=300000)
    page.wait_for_function("tattooStudio.tattoos().every((t) => t.inked)", timeout=60000)
    # Spark makes them again only when something changed, and `current` can be swapped for
    # another of its buffers with its own count: so either three new versions, or twenty frames
    # drawn with the shown buffer the latest and no new version
    page.evaluate("window._settle = { v: bodyApp.viewer.spark.current.version, n: 0, still: 0 }")
    page.wait_for_function("""(() => { const s = window._settle, S = bodyApp.viewer.spark, v = S.current.version;
        if (v !== s.v) { s.v = v; s.n++; s.still = 0; } else if (S.display === S.current) s.still++;
        return s.n >= 3 || s.still >= 20; })()""", polling="raf", timeout=300000)


def ink_pixels(page, at, r=40):
    """How many pixels around point `at` (body coordinates) the first tattoo's ink changes: the
    page with the ink as it is, against the page with the faintest ink."""
    x, y = page.evaluate(f"tattooStudio.screen({at})")
    clip = {"x": max(0, x - r), "y": max(0, y - r), "width": 2 * r, "height": 2 * r}
    before = page.evaluate("tattooStudio.ink(0)")
    shots = []
    for ink in (before, 0.2):
        page.evaluate(f"tattooStudio.ink(0, {ink})")
        settled(page)
        shots.append(png_pixels(page.screenshot(clip=clip, timeout=180000)))   # (software rendering is slow)
    page.evaluate(f"tattooStudio.ink(0, {before})")
    settled(page)
    (w, h, a), (_, _, b) = shots
    return sum(1 for i in range(0, w * h * 4, 4) if sum(abs(a[i + k] - b[i + k]) for k in range(3)) > 60)


def png_pixels(data: bytes):
    """(width, height, RGBA bytes) of an 8-bit RGB or RGBA PNG (what screenshots are)."""
    pos, idat, w, h, ch = 8, b"", 0, 0, 4
    while pos < len(data):
        n, kind = struct.unpack(">I4s", data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + n]
        if kind == b"IHDR":
            w, h, depth, colour = struct.unpack(">IIBB", body[:10])
            assert depth == 8 and colour in (2, 6)
            ch = 4 if colour == 6 else 3
        elif kind == b"IDAT":
            idat += body
        pos += 12 + n
    raw, out, prev, stride = zlib.decompress(idat), bytearray(), bytearray(w * ch), w * ch
    for row in range(h):
        f, line = raw[row * (stride + 1)], bytearray(raw[row * (stride + 1) + 1:(row + 1) * (stride + 1)])
        for i in range(stride):
            a = line[i - ch] if i >= ch else 0
            b, c = prev[i], prev[i - ch] if i >= ch else 0
            if f == 1: line[i] = (line[i] + a) & 255
            elif f == 2: line[i] = (line[i] + b) & 255
            elif f == 3: line[i] = (line[i] + (a + b) // 2) & 255
            elif f == 4:
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                line[i] = (line[i] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        prev = line
        for i in range(w):
            out += line[i * ch:i * ch + 3] + (line[i * ch + 3:i * ch + 4] if ch == 4 else b"\xff")
    return w, h, out


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
