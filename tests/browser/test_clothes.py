"""Clothes and the shop around the body (wardrobe.js, dress.js, racks.js). In a real browser: see tests/browser/base.py."""
import math
import unittest

from tests.browser.base import Viewer, off_rack, pick, ink_pixels, dist


class Clothes(Viewer):
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


if __name__ == "__main__":
    unittest.main()
