"""The body on its own: it loads upright, another body model, walking and jumping with the keyboard. In a real browser: see tests/browser/base.py."""
import json
import unittest

from tests.browser.base import Viewer, dist


class Body(Viewer):
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


if __name__ == "__main__":
    unittest.main()
