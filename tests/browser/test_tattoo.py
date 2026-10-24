"""Tattoos and posing (tattoo.js, pose.js). In a real browser: see tests/browser/base.py."""
import unittest

from tests.browser.base import Viewer, dist


class Tattoo(Viewer):
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


if __name__ == "__main__":
    unittest.main()
