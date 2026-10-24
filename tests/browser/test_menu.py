"""The Body Studio menu and its modes (modes.js). In a real browser: see tests/browser/base.py."""
import json
import unittest

from tests.browser.base import Viewer, off_rack


class Menu(Viewer):
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
        for b in ("#studioBtn", "#progressBtn", "#guideBtn", "#roomBtn", "#decorBtn"):
            self.assertTrue(page.locator(b).is_hidden(), b)
        page.click("#menuBtn")
        self.assertTrue(page.evaluate("document.getElementById('modes').open"))
        self.assertEqual(page.get_attribute("#menuBtn", "aria-expanded"), "true")
        self.assertEqual([b.inner_text().split("\n")[0] for b in page.locator("#modes nav > *").all()],
                         ["Style your clothes", "Style your tattoos", "Rooms", "Body progress", "New body", "Guide"])
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
        page.evaluate("modes.go('none')")
        page.wait_for_function("!house.shown()")
        self.assertEqual(errors, [])


if __name__ == "__main__":
    unittest.main()
