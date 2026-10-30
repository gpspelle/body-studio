"""A room around the body (house.js, room.js). In a real browser: see tests/browser/base.py."""
import unittest

from tests.browser.base import Viewer, dist


class Room(Viewer):
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
        # first person: V puts the camera at her eyes; a drag looks round; W walks the way it looks;
        # V again, and the camera is behind her again
        page.keyboard.press("v")
        self.assertIsNotNone(page.evaluate("house.firstPerson()"))
        self.assertEqual(page.locator("#eyeBtn").get_attribute("aria-pressed"), "true")
        eyes = """(() => { const V = bodyApp.viewer, c = V.camera.position;
            return c.distanceTo(V.holder.localToWorld(c.clone().set(...tattooStudio.joint('head')))); })()"""
        page.wait_for_function(eyes + " < 0.3")
        yaw = page.evaluate("house.firstPerson().yaw")
        page.mouse.move(480, 300)
        page.mouse.down()
        page.mouse.move(380, 300, steps=4)
        page.mouse.up()
        self.assertLess(page.evaluate("house.firstPerson().yaw"), yaw - 0.1, "dragged left, the look turns right")
        page.wait_for_function(f"Math.abs(house.firstPerson().yaw - {yaw}) > 0.1 && " + eyes + " < 0.3")
        # (she turns to the way it looks as she walks: where she then goes depends on the furniture)
        way = page.evaluate("""(() => { const V = bodyApp.viewer, w = tattooStudio.walker();
            const d = V.camera.getWorldDirection(V.camera.position.clone()).applyQuaternion(V.holder.quaternion.clone().invert());
            tattooStudio.walkFor(0.8, 'f');
            const f = w.facing(), u = w.up, k = d.x * u[0] + d.y * u[1] + d.z * u[2];
            const a = [d.x - k * u[0], d.y - k * u[1], d.z - k * u[2]];
            return (a[0] * f[0] + a[1] * f[1] + a[2] * f[2]) / (Math.hypot(...a) * Math.hypot(...f)); })()""")
        self.assertGreater(way, 0.9, "she walks the way the camera looks")
        page.click("#eyeBtn")
        self.assertIsNone(page.evaluate("house.firstPerson()"))
        page.wait_for_function(eyes + " > 0.6")
        # from above: the camera high over her, the room's top taken off; the eye button comes down again
        page.click("#skyBtn")
        self.assertTrue(page.evaluate("house.fromAbove()"))
        self.assertEqual(page.locator("#skyBtn").get_attribute("aria-pressed"), "true")
        high = """(() => { const V = bodyApp.viewer, P = house.placement(), c = V.holder.worldToLocal(V.camera.position.clone());
            return P.toMap([c.x, c.y, c.z])[1]; })()"""
        self.assertGreater(page.evaluate(high), 5, "metres over the floor")
        self.assertLess(page.evaluate("house.mesh().roomCut.value.w"), 1e8, "the ceiling taken off")
        page.wait_for_function("house.bodyHidden()")                    # (the body isn't drawn from above)
        page.evaluate("tattooStudio.stepFor(2)")                        # (done slowing down from the walk)
        where = page.evaluate("house.where()")
        page.evaluate("tattooStudio.walkFor(0.5, 'f')")
        self.assertTrue(page.evaluate("house.fromAbove()"), "W from above")
        self.assertEqual(page.evaluate("house.where()"), where, "the body stays where it was")
        # flying through: the camera goes where it looks, the body put down where it stops
        page.click("#flyBtn")
        self.assertFalse(page.evaluate("house.fromAbove()"))
        self.assertEqual(page.locator("#flyBtn").get_attribute("aria-pressed"), "true")
        start = page.evaluate("house.fly()")
        page.keyboard.down("w")
        page.wait_for_function(f"Math.hypot(house.fly()[0] - {start[0]}, house.fly()[1] - {start[1]}) > 0.5")
        page.keyboard.up("w")
        flown = page.evaluate("house.fly()")
        page.click("#bodyBtn")
        self.assertIsNone(page.evaluate("house.fly()"))
        page.wait_for_function("!house.bodyHidden()")
        self.assertLess(dist(page.evaluate("house.where()"), flown), 1.0, "she stands where the flight ended")
        page.click("#skyBtn")
        page.click("#eyeBtn")
        self.assertFalse(page.evaluate("house.fromAbove()"))
        self.assertIsNotNone(page.evaluate("house.firstPerson()"))
        self.assertEqual(page.evaluate("house.mesh().roomCut.value.w"), 1e9, "the room whole again")
        page.click("#eyeBtn")
        page.wait_for_function(eyes + " > 0.6")
        page.evaluate("tattooStudio.stepFor(2)")
        # a filmed room is splats: no photo of it (decor test: a drawn room's)
        self.assertTrue(page.locator("#photoBtn").is_hidden())
        self.assertTrue(page.locator("#bakeBtn").is_hidden())
        # no room: she stands on the plain floor again, walls gone
        page.click("#roomBtn")
        page.locator("#roomList button").first.click()
        page.wait_for_function("!house.shown()")
        self.assertIsNone(page.evaluate("tattooStudio.walker().bound"))
        self.assertEqual(errors, [])


if __name__ == "__main__":
    unittest.main()
