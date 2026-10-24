"""The tattoo studio (parlour.js, flash.js). In a real browser: see tests/browser/base.py."""
import unittest

from tests.browser.base import Viewer, dist


class Studio(Viewer):
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


if __name__ == "__main__":
    unittest.main()
