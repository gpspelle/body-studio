"""Decor in a room (decorate.js, decor.js). In a real browser: see tests/browser/base.py."""
import json
import math
import unittest
import urllib.parse
import urllib.request
from pathlib import Path

from tests.browser.base import PlaywrightTimeout, Viewer, dist


class Decor(Viewer):
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
        self.assertEqual(page.locator("#decorGroups button").count(), 9)          # (decor.js GROUPS)
        tables = page.evaluate("[...document.querySelectorAll('#decorItems button')].map((b) => b.dataset.item)")
        self.assertIn("round_table", tables)
        self.assertIn("bench", tables)
        self.assertNotIn("candle", tables)
        # (their pictures first: on CI's software GPU, making them slows everything else down)
        page.wait_for_function("decor.pictures().wanted === 0 && !decor.pictures().busy", timeout=300000)
        # a chair, a step ahead of her, facing her: the walk goes round it
        page.locator("#decorItems button[data-item=chair]").click()
        self.assertEqual(page.evaluate("decor.drawn()"), 1)
        chair = page.evaluate("decor.placed()[0]")
        self.assertFalse(page.evaluate(f"house.map().free({chair['x']}, {chair['z']})"))
        self.assertLess(dist([chair["x"], chair["z"]], page.evaluate("house.where()")), 6)
        page.locator("#decorColours button[data-colour=wood]").click()
        self.assertEqual(page.evaluate("decor.placed()[0].colour"), "wood")
        # a colour of your own: typed as HEX, then as RGB; the mixer and the swatch follow
        page.click("#decorOwn")
        self.assertTrue(page.locator("#decorMix").is_visible())
        page.fill("#decorHex", "#2E5E4E")
        page.press("#decorHex", "Enter")
        self.assertEqual(page.evaluate("decor.placed()[0].colour"), "#2e5e4e")
        self.assertEqual([page.input_value(f"#decor{c}") for c in "RGB"], ["46", "94", "78"])
        self.assertEqual(page.input_value("#decorWheel"), "#2e5e4e")
        self.assertIn("on", page.get_attribute("#decorOwn", "class"))
        page.fill("#decorR", "200")
        page.press("#decorR", "Tab")
        self.assertEqual(page.evaluate("decor.placed()[0].colour"), "#c85e4e")
        self.assertEqual(page.input_value("#decorHex"), "#c85e4e")
        page.fill("#decorHex", "#nothex")
        page.press("#decorHex", "Enter")
        self.assertEqual(page.evaluate("decor.placed()[0].colour"), "#c85e4e", "not a colour: kept as it was")
        page.locator("#decorColours button[data-colour=wood]").click()
        self.assertTrue(page.locator("#decorMix").is_hidden())
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
        y0 = page.evaluate(f"decor.placed()[{k}].y")
        for _ in range(6):                    # (the knob is where it was drawn: the view may still move)
            h = page.evaluate("decor.handles()")
            page.mouse.move(h["lift"][0] + 12, h["lift"][1] + 8)                     # near is enough
            try:                                                                     # the pointer says so
                page.wait_for_function("bodyApp.viewer.canvas.style.cursor === 'ns-resize'", timeout=5000)
                break
            except PlaywrightTimeout:
                page.mouse.move(h["lift"][0] + 200, h["lift"][1] + 200)
        self.assertEqual(page.evaluate("bodyApp.viewer.canvas.style.cursor"), "ns-resize")
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
        # all of them, by the worker or, should its graphics stall (as software ones can), by the page
        page.wait_for_function("[...document.querySelectorAll('#decorItems .pic')].every((p) => p.querySelector('img'))",
                               timeout=300000)
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
        # the old page may still be drawing the catalogue's pictures, so its "load" can be slow on
        # CI's software GPU: wait for the new page's state instead (the old one is marked)
        page.evaluate("window.oldPage = true")
        page.reload(wait_until="commit", timeout=120000)
        page.wait_for_function("!window.oldPage && window.decor && decor.layouts && decor.layouts() && decor.placed().length === 24", timeout=300000)
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
        page.locator("#decorGroups button", has_text="Yours").click()
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


    def test_moves_the_rooms_fittings(self):
        page = self.new_page(viewport={"width": 1100, "height": 700})
        self.addCleanup(page.close)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(self.url)
        page.wait_for_function("window.bodyViewer && bodyViewer.numSplats() > 0", timeout=60000)
        page.locator(".shelf button", has_text="Mia").click()
        page.wait_for_function("bodyViewer.file().includes('Mia') && bodyViewer.numSplats() > 0", timeout=60000)
        page.evaluate("modes.show('rooms')")
        page.click("#roomBtn")
        page.locator("#roomList button[data-file^='workspace/_sample_room/']").click()
        page.wait_for_function("house.shown() && decor.group()", timeout=300000)
        room = page.evaluate("house.file()")
        self.addCleanup(lambda: urllib.request.urlopen(urllib.request.Request(
            self.url + "api/decor/layout?room=" + urllib.parse.quote(room), method="POST",
            data=json.dumps({"current": 0, "layouts": [{"name": "Layout 1", "items": []}]}).encode())).read())
        page.click("#roomBtn")
        page.click("#decorBtn")
        page.click("#decorRoomTab")
        # the room's own furniture moved by hand, from above, in a layout of its own: what changed
        # comes back as a file to send
        fixed = page.evaluate("decor.group().children.filter((c) => c.isMesh && c.userData.fixed).length")
        self.assertTrue(page.locator("#decorFittings").is_visible())
        page.click("#decorFittings")
        self.assertTrue(page.evaluate("house.fromAbove()"))
        lay = page.evaluate("decor.layouts()")
        self.assertTrue(lay["layouts"][lay["current"]]["fittings"])
        n = len(lay["layouts"][lay["current"]]["items"])
        self.assertGreater(n, 0)
        self.assertEqual(page.evaluate("decor.drawn()"), n)                        # each drawn once: as a placed thing
        self.assertEqual(page.evaluate("decor.group().children.filter((c) => c.isMesh && c.userData.fixed).length"), fixed - n)
        self.assertTrue(page.locator("#decorFittings").is_hidden())
        self.assertEqual(page.evaluate("decor.changes()"), [])
        page.evaluate("(() => { const p = decor.placed()[0]; decor.move(0, p.x + 0.5, p.z); })()")
        self.assertEqual([c["change"] for c in page.evaluate("decor.changes()")], ["moved"])
        with page.expect_download() as d:
            page.click("#decorFittingsExport")
        sent = json.loads(Path(d.value.path()).read_text())
        self.assertEqual(sent["room"], room)
        self.assertEqual(len(sent["changes"]), 1)
        page.wait_for_function("!decor.saving")
        saved = json.loads(urllib.request.urlopen(self.url + "api/decor/layout?room=" + urllib.parse.quote(room)).read())
        self.assertTrue(saved["layouts"][saved["current"]]["fittings"])
        self.assertIn("was", saved["layouts"][saved["current"]]["items"][0])
        self.assertEqual(errors, [])

    def test_bakes_the_light_into_a_drawn_room(self):
        page, errors = self.open_page()
        page.evaluate("bakelight.passes(1)")
        page.locator(".shelf button", has_text="Mia").click()
        page.wait_for_function("bodyViewer.file().includes('Mia') && bodyViewer.numSplats() > 0", timeout=60000)
        page.evaluate("modes.show('rooms')")
        page.click("#roomBtn")
        page.locator("#roomList button[data-file^='workspace/_sample_room/']").click()
        page.wait_for_function("house.shown() && decor.group() && house.shell()", timeout=300000)
        page.click("#roomBtn")
        # the sun's shadows and the sky's light worked out once and kept on the walls and the furniture
        page.wait_for_function("bakelight.state().baked > 0 && !bakelight.state().working", timeout=600000)
        lit = page.evaluate("""(() => { const s = house.shell(), g = s.geometry.getAttribute('bake');
            const shades = new Set(g ? Array.from(g.array).filter((_, i) => i % 4 !== 3).map((v) => v >> 4) : []);
            const decorLit = decor.group().children.filter((c) => c.geometry?.getAttribute('bake')).length;
            return { shell: !!g, back: !!s.geometry.getAttribute('bake2'), shades: shades.size, decor: decorLit,
                     shows: [].concat(s.material).some((m) => m.userData.baked) }; })()""")
        self.assertTrue(lit["shell"] and lit["back"], lit)
        self.assertGreater(lit["shades"], 3, "light and shade, not one flat value")
        self.assertGreater(lit["decor"], 0)
        self.assertTrue(lit["shows"], "the shell's materials show the baked light")
        # moved, it is worked out again; off, the lamps' light is back
        at = page.evaluate("bakelight.state().at")
        page.evaluate("dispatchEvent(new Event('decorchange'))")
        page.wait_for_function(f"bakelight.state().at > {at} && !bakelight.state().working", timeout=600000)
        page.evaluate("bakelight.enable(false)")
        self.assertFalse(page.evaluate("!!house.shell().geometry.getAttribute('bake')"))
        self.assertEqual(errors, [])

    def test_takes_a_photo_of_a_drawn_room(self):
        page, errors = self.open_page()
        page.locator(".shelf button", has_text="Mia").click()
        page.wait_for_function("bodyViewer.file().includes('Mia') && bodyViewer.numSplats() > 0", timeout=60000)
        page.evaluate("modes.show('rooms')")
        page.click("#roomBtn")
        page.locator("#roomList button[data-file^='workspace/_sample_room/']").click()
        page.wait_for_function("house.shown() && decor.group() && house.shell()", timeout=300000)
        page.click("#roomBtn")
        # the room's meshes path traced (a small photo, a few passes): its shell and furniture, not her
        page.wait_for_function("!document.getElementById('photoBtn').hidden")
        self.assertTrue(page.locator("#photoBtn").is_visible())
        page.evaluate("darkroom.open({ long: 160, passes: 2 })")
        page.wait_for_function("darkroom.done()", timeout=600000)
        made = page.evaluate("darkroom.scene()")
        self.assertGreater(made["meshes"], 0)
        self.assertTrue(page.locator("#photoSave").is_enabled())
        shades = page.evaluate("""(() => { const c = document.getElementById('photoCanvas'), g = document.createElement('canvas');
            g.width = c.width; g.height = c.height; const x = g.getContext('2d'); x.drawImage(c, 0, 0);
            const d = x.getImageData(0, 0, g.width, g.height).data, seen = new Set();
            for (let i = 0; i < d.length; i += 4 * 37) seen.add(d[i] >> 4 << 8 | d[i + 1] >> 4 << 4 | d[i + 2] >> 4);
            return seen.size; })()""")
        self.assertGreater(shades, 8, "the photo shows something, not one flat colour")
        # made into a photograph on the Mac (the stand-in model gives the photo back), shown beside it
        page.click("#photoMakeReal")
        page.wait_for_function("darkroom.real()", timeout=120000)
        self.assertTrue(page.locator("#photoRealFig").is_visible())
        self.assertIn("-ai.png", page.locator("#photoRealSave").get_attribute("download"))
        page.click("#photoClose")
        self.assertTrue(page.locator("#photo").is_hidden())
        self.assertTrue(page.locator("#photoRealFig").is_hidden())
        self.assertEqual(errors, [])

    def test_compares_the_room_with_a_video(self):
        page, errors = self.open_page()
        page.locator(".shelf button", has_text="Mia").click()
        page.wait_for_function("bodyViewer.file().includes('Mia') && bodyViewer.numSplats() > 0", timeout=60000)
        page.evaluate("modes.show('rooms')")
        page.click("#roomBtn")
        page.locator("#roomList button[data-file^='workspace/Living_room/']").click()
        page.wait_for_function("house.shown() && decor.group()", timeout=300000)
        room = page.evaluate("house.file()")
        page.click("#roomBtn")
        page.click("#decorBtn")
        # from the Decor panel: it steps aside, the camera flies, no video yet
        page.click("#compareBtn")
        self.assertTrue(page.locator("#decor").is_hidden())
        self.assertTrue(page.locator("#compareNoVideo").is_visible())
        self.assertEqual(page.evaluate("house.mode()"), "fly")
        self.assertEqual(page.evaluate("bodyApp.viewer.camera.fov"), 70)
        # a short video made in the page (as one filmed would be picked and copied into the app)
        page.evaluate("""(async () => {
            const c = Object.assign(document.createElement('canvas'), { width: 120, height: 200 }), g = c.getContext('2d');
            document.body.append(c);                  // (drawn on the page, or the stream has no frames)
            const rec = new MediaRecorder(c.captureStream(10), { mimeType: 'video/webm' }), parts = [];
            rec.ondataavailable = (e) => parts.push(e.data);
            const done = new Promise((r) => (rec.onstop = r));
            rec.start();
            for (let k = 0; k < 12; k++) { g.fillStyle = `hsl(${k * 30}, 60%, 50%)`; g.fillRect(0, 0, 120, 200); await new Promise((r) => setTimeout(r, 100)); }
            rec.stop(); await done; c.remove();
            await compare.use(new Blob(parts, { type: 'video/webm' }), 'walk.webm');
        })()""")
        page.wait_for_function("document.getElementById('compareVideo').readyState >= 2", timeout=60000)
        self.assertTrue(page.locator("#compareTools").is_visible())
        self.assertEqual(page.evaluate("compare.state().video"), "video.webm")
        # the frame and the room side by side, left of the panel, the same size; the camera's
        # whole view drawn in the room's place
        box = page.locator("#compareVideo").bounding_box()
        room_box = page.locator("#compareRoom").bounding_box()
        bar = page.locator("#compareBar").bounding_box()
        self.assertAlmostEqual(box["width"] / box["height"], 120 / 200, delta=0.01)
        self.assertAlmostEqual(room_box["width"], box["width"], delta=1)
        self.assertAlmostEqual(room_box["y"], box["y"], delta=1)
        self.assertGreater(room_box["x"], box["x"] + box["width"])
        self.assertLess(room_box["x"] + room_box["width"], bar["x"])
        view = page.evaluate("(() => { const c = bodyApp.viewer.camera; return { aspect: c.aspect, ...c.view }; })()")
        self.assertAlmostEqual(view["aspect"], 120 / 200, delta=0.01)
        self.assertAlmostEqual(view["fullHeight"], room_box["height"], delta=1)
        self.assertAlmostEqual(-view["offsetX"], room_box["x"], delta=1)
        # the crosshair at the same spot on both
        page.mouse.move(box["x"] + box["width"] * 0.25, box["y"] + box["height"] * 0.5)
        cross = page.locator("#compareCrossRoom").bounding_box()
        self.assertAlmostEqual(cross["x"] + cross["width"] / 2, room_box["x"] + room_box["width"] * 0.25, delta=1)
        self.assertAlmostEqual(cross["y"] + cross["height"] / 2, room_box["y"] + room_box["height"] * 0.5, delta=1)
        # ← and → step the video (not the camera), Space plays and pauses it
        at = page.evaluate("house.flyView().at")
        page.keyboard.press("ArrowRight")
        page.wait_for_function("Math.abs(compare.time() - 0.5) < 0.01", timeout=10000)
        page.keyboard.press("ArrowLeft")
        page.wait_for_function("compare.time() < 0.01", timeout=10000)
        self.assertEqual(page.evaluate("house.flyView().at"), at)
        page.keyboard.press("Space")
        page.wait_for_function("!document.getElementById('compareVideo').paused", timeout=10000)
        page.keyboard.press("Space")
        page.wait_for_function("document.getElementById('compareVideo').paused", timeout=10000)
        page.evaluate("compare.seek(0)")
        # a wider lens and a lower eye, then the view kept with a picture of both
        page.fill("#compareLens", "90")
        page.dispatch_event("#compareLens", "input")
        page.fill("#compareEye", "120")
        page.dispatch_event("#compareEye", "input")
        self.assertEqual(page.evaluate("bodyApp.viewer.camera.fov"), 90)
        self.assertEqual(page.evaluate("house.flyView().eye"), 1.2)
        page.keyboard.press("k")                                        # (K keeps it, as the button does)
        page.wait_for_function("document.getElementById('compareStatus').textContent.startsWith('Kept the view')", timeout=60000)
        v = page.evaluate("compare.current()")
        self.assertEqual((v["view"]["fov"], v["view"]["eye"]), (90, 1.2))
        # a tag: Tag, a click on the frame, its kind and words
        self.assertTrue(page.locator("#compareNote").is_hidden())
        page.click("#compareTag")
        page.mouse.click(room_box["x"] + room_box["width"] * 0.3, room_box["y"] + room_box["height"] * 0.6)   # (on the room)
        self.assertTrue(page.locator("#compareNote").is_visible())
        page.locator("#compareKinds button[data-kind=missing]").click()
        page.fill("#compareNote textarea", "An exit sign over the door")
        page.click("#compareNote .btn.primary")
        page.wait_for_function("compare.current().tags.length === 1", timeout=30000)
        tag = page.evaluate("compare.current().tags[0]")
        self.assertEqual((tag["kind"], tag["note"]), ("missing", "An exit sign over the door"))
        self.assertAlmostEqual(tag["x"], 0.3, delta=0.01)
        self.assertAlmostEqual(tag["y"], 0.6, delta=0.01)
        self.assertEqual(tag["on"], "room")
        self.assertEqual(page.locator("#comparePins .pin").count(), 2)              # (on both)
        # Esc leaves tagging; T with the pointer on the video opens the note right there
        page.keyboard.press("Escape")
        self.assertEqual(page.get_attribute("#compareTag", "aria-pressed"), "false")
        video_box = page.locator("#compareVideo").bounding_box()
        page.mouse.move(video_box["x"] + video_box["width"] * 0.5, video_box["y"] + video_box["height"] * 0.5)
        page.keyboard.press("t")
        self.assertEqual(page.get_attribute("#compareTag", "aria-pressed"), "true")
        self.assertTrue(page.locator("#compareNote").is_visible())
        page.keyboard.press("Escape")                                   # (the note first, then tagging)
        self.assertTrue(page.locator("#compareNote").is_hidden())
        self.assertEqual(page.get_attribute("#compareTag", "aria-pressed"), "true")
        page.keyboard.press("t")
        self.assertEqual(page.get_attribute("#compareTag", "aria-pressed"), "false")
        self.assertIn("An exit sign over the door", page.text_content("#compareTags"))
        # its pictures taken again (after a fix)
        page.click("#compareRetake")
        page.wait_for_function("document.getElementById('compareStatus').textContent.startsWith('Retook')", timeout=60000)
        # all of it in the export: the list, the views, the two pictures
        q = urllib.parse.quote(room)
        with urllib.request.urlopen(self.url + "api/compare/export?room=" + q) as r:
            import io
            import zipfile
            names = sorted(zipfile.ZipFile(io.BytesIO(r.read())).namelist())
        self.assertEqual(names, ["notes.md", f"snaps/{v['id']}-render.jpg", f"snaps/{v['id']}-video.jpg", "views.json"])
        # flown away and back to the kept view
        page.evaluate("house.flyView({ ...house.flyView(), at: [house.flyView().at[0] + 1, house.flyView().at[1]] })")
        page.select_option("#compareViews", v["id"])
        page.wait_for_function(f"Math.abs(house.flyView().at[0] - {v['view']['at'][0]}) < 1e-6", timeout=10000)
        # forgotten; closed, back in Decor with the camera's own lens
        page.click("#compareForget")
        page.wait_for_function("compare.state().views.length === 0", timeout=10000)
        page.click("#closeCompare")
        self.assertTrue(page.locator("#decor").is_visible())
        self.assertEqual(page.evaluate("bodyApp.viewer.camera.fov"), 35)
        self.assertAlmostEqual(page.evaluate("bodyApp.viewer.camera.aspect"), 1280 / 800, delta=0.01)
        self.assertEqual(errors, [])


if __name__ == "__main__":
    unittest.main()
