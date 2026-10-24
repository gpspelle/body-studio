"""The Progress panel (progress.js). In a real browser: see tests/browser/base.py."""
import unittest

from tests.browser.base import Viewer


class Progress(Viewer):
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


if __name__ == "__main__":
    unittest.main()
