#!/usr/bin/env python3
"""Regenerate the README screenshots in docs/images/ from synthetic bodies.

    pip install playwright && python -m playwright install chromium
    python3 scripts/screenshots.py                    # all of them
    python3 scripts/screenshots.py tattoo-desktop     # only the ones named

Look at every image before committing it. BODY_STUDIO_CHROMIUM picks a Chromium that's
already installed. Waits for the page's own state, never a fixed delay, except one short
pause so the turntable has settled into a frame.
"""
import os
import sys
import tempfile
import threading
from http.server import ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from tests.fakes.bodyply import write_body  # noqa: E402
from tests.fakes.makehuman import write_body as write_person  # noqa: E402

from playwright.sync_api import sync_playwright  # noqa: E402
from splat_studio.server.jobs import Runner  # noqa: E402
from splat_studio.server.library import DataDir  # noqa: E402

from body_studio import history, sample_room, server  # noqa: E402

SHOTS = [  # name, width, height, colour scheme, language, panel open
    ("desktop-light", 1280, 800, "light", "en", None),
    ("phone-dark", 390, 844, "dark", "pt", None),
    ("progress-desktop", 1280, 800, "light", "en", "progress"),
    ("progress-phone", 390, 844, "dark", "pt", "progress"),
    ("tattoo-desktop", 1280, 800, "light", "en", "tattoo"),
    ("tattoo-phone", 390, 844, "dark", "pt", "tattoo"),
    ("wardrobe-desktop", 1280, 800, "light", "en", "wardrobe"),
    ("walk-desktop", 1280, 800, "light", "en", "walk"),
    ("guide-desktop", 1280, 800, "light", "en", "guide"),
    ("room-desktop", 1280, 800, "light", "en", "room"),
    ("decor-desktop", 1280, 800, "light", "en", "decor"),
]
# a line-art design drawn on white, like a scanned tattoo sketch: a sun with a wave inside
DESIGN = """(() => {
  const c = document.createElement("canvas"); c.width = c.height = 600;
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, 600, 600);
  g.strokeStyle = "#111"; g.fillStyle = "#111"; g.lineCap = "round"; g.lineWidth = 14;
  g.beginPath(); g.arc(300, 300, 150, 0, 2 * Math.PI); g.stroke();
  for (let k = 0; k < 16; k++) {
    const a = k * Math.PI / 8, r0 = 185, r1 = k % 2 ? 235 : 280;
    g.beginPath(); g.moveTo(300 + r0 * Math.cos(a), 300 + r0 * Math.sin(a));
    g.lineTo(300 + r1 * Math.cos(a), 300 + r1 * Math.sin(a)); g.stroke();
  }
  g.save(); g.beginPath(); g.arc(300, 300, 136, 0, 2 * Math.PI); g.clip();
  g.lineWidth = 12;
  for (let row = 0; row < 3; row++) {
    g.beginPath();
    for (let x = 150; x <= 450; x += 4) g.lineTo(x, 320 + row * 42 + 16 * Math.sin((x - 150) / 30 + row));
    g.stroke();
  }
  g.beginPath(); g.arc(300, 250, 46, Math.PI, 2 * Math.PI); g.fill();
  g.restore();
  return c.toDataURL("image/png");
})()"""
# Anna's tape over ten weeks: date, weight, waist, neck, hips
TAPE = [("2026-08-03", 68.4, 82.0, 33.0, 104.0), ("2026-08-17", 67.9, 81.2, 33.0, 103.5),
        ("2026-08-31", 67.1, 80.1, 32.8, 102.6), ("2026-09-14", 66.6, 79.4, 33.0, 102.0),
        ("2026-09-28", 65.8, 78.0, 32.9, 101.1), ("2026-10-12", 65.2, 77.1, 32.8, 100.4)]


def seed_person(data) -> None:
    root = data.root
    history.upsert_person(root, "Anna", "f", 184.5)
    for d, kg, waist, neck, hip in TAPE:
        history.add_tape(root, "anna", d, weight_kg=kg, waist_cm=waist, neck_cm=neck, hip_cm=hip)
    for run in ("Anna_August/run_20260803_100000", "Anna/run_20261012_120000"):
        e = history.add_scan(root, "anna", run)
        history.measure_scan(root, "anna", e["id"], history.ply_for(root, run))


def main() -> None:
    out = ROOT / "docs" / "images"
    out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        data = DataDir(Path(tmp))
        for name, run, seed, trunk, mtime in (("Anna", "run_20261012_120000", 1, 1.0, 2_000_000_000),
                                              ("Bruno", "run_20261012_120000", 2, 1.0, 1_999_000_000),
                                              ("Anna_August", "run_20260803_100000", 3, 1.08, 1_998_000_000)):
            # dense enough that every 1 cm slice of the trunk is a closed ring, like a real capture
            p = write_body(data.workspace / name / run / "splat" / "standard_30000_object.ply",
                           n=200_000, seed=seed, trunk=trunk)
            os.utime(p, (mtime, mtime))
        # the tattoo shots need a body shaped like a person: the MakeHuman base mesh
        p = data.workspace / "Mia" / "run_20261001_120000" / "splat" / "standard_30000_object.ply"
        write_person(p, n=300_000)
        os.utime(p, (1_990_000_000, 1_990_000_000))
        seed_person(data)
        sample_room.ensure(data.root)                   # the sample living room, for the room shot
        httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.make_handler(data, Runner(data, start=False)))
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        url = f"http://127.0.0.1:{httpd.server_address[1]}/"
        with sync_playwright() as pw:
            browser = pw.chromium.launch(executable_path=os.environ.get("BODY_STUDIO_CHROMIUM") or None,
                                         args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
            for name, w, h, scheme, lang, panel in SHOTS:
                if sys.argv[1:] and name not in sys.argv[1:]:
                    continue
                page = browser.new_page(viewport={"width": w, "height": h}, color_scheme=scheme)
                page.add_init_script(f"localStorage.setItem('lang', '{lang}')")
                # the Try on panel opens when it is asked for (on a computer it opens by itself the first time)
                page.add_init_script("localStorage.setItem('studio:open', '0')")
                if panel == "progress":
                    page.add_init_script("localStorage.setItem('progress:open', '1')")
                page.goto(url)
                page.wait_for_function("window.bodyViewer && bodyViewer.numSplats() > 0", timeout=60000)
                if panel == "progress":
                    page.wait_for_selector("#profileChart polyline.before", state="attached")
                if panel == "tattoo":
                    tattoo_scene(page, Path(tmp))
                if panel == "wardrobe":
                    wardrobe_scene(page)
                if panel == "walk":
                    walk_scene(page)
                if panel == "room":
                    room_scene(page)
                if panel == "decor":
                    decor_scene(page)
                if panel == "guide":
                    page.click("#guideBtn")
                page.wait_for_function("document.getElementById('version').textContent.length > 0")
                page.wait_for_timeout(1500)
                page.screenshot(path=str(out / f"{name}.png"), timeout=180000)
                print(out / f"{name}.png")
                page.close()
            browser.close()
        httpd.shutdown()


def tattoo_scene(page, tmp: Path) -> None:
    """Mia flexing, with a sun on her left forearm and the left elbow picked; closer on a laptop."""
    import base64
    design = tmp / "sun.png"
    design.write_bytes(base64.b64decode(page.evaluate(DESIGN).split(",", 1)[1]))
    page.locator(".shelf button", has_text="Mia").click()
    page.wait_for_function("bodyViewer.file().includes('Mia') && bodyViewer.numSplats() > 0", timeout=60000)
    page.evaluate("document.getElementById('studio').hidden && document.getElementById('studioBtn').click()")
    page.wait_for_function("tattooStudio.ready", timeout=300000)
    page.evaluate("bodyApp.viewer.controls.autoRotate = false")
    page.wait_for_function("window.wardrobe && wardrobe.ready", timeout=300000)   # (frames are slow while it loads)
    page.locator("#presets button").nth(2).click(timeout=120000)   # flex
    page.set_input_files("#tatPick", str(design))
    page.wait_for_function("document.getElementById('tatHint').textContent.length > 0")
    elbow, wrist = page.evaluate("[tattooStudio.joint('elbow_l'), tattooStudio.joint('wrist_l')]")
    at = [0.5 * a + 0.5 * b for a, b in zip(elbow, wrist)]
    page.mouse.click(*page.evaluate(f"tattooStudio.screen({at})"))
    page.wait_for_function("tattooStudio.tattoos().length === 1")
    page.fill("#tatSize", "8")
    page.dispatch_event("#tatSize", "input")
    page.fill("#tatName", "Sun" if page.evaluate("window.i18n.lang") == "en" else "Sol")
    page.mouse.click(*page.evaluate("tattooStudio.screen(tattooStudio.joint('wrist_l'))"))   # picks the elbow
    page.wait_for_function("!document.getElementById('jointEdit').hidden")
    if page.viewport_size["width"] > 600:              # closer: from the hips up
        page.evaluate("""(() => {
          const V = bodyApp.viewer, THREE_V = V.camera.position.constructor;
          const c = tattooStudio.joint('chest');
          const chest = V.holder.localToWorld(new THREE_V(c[0], c[1], c[2]));
          const shift = chest.clone().sub(V.controls.target).multiplyScalar(0.8);
          V.controls.target.add(shift); V.camera.position.add(shift);
          V.camera.position.lerp(V.controls.target, 0.45);
          V.controls.update();
        })()""")
    # the ink is splats: wait until they are made and sorted with the body's from this angle
    page.wait_for_function("tattooStudio.tattoos().every((t) => t.inked)", timeout=120000)
    page.evaluate("new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)))")
    page.wait_for_function("""(() => { const s = bodyApp.viewer.spark;
      return s.display === s.current && s.display.numSplats > bodyViewer.numSplats() + 1000; })()""", timeout=300000)


def wardrobe_scene(page) -> None:
    """Mia walking in a T-shirt, jeans, sneakers and a bob, in the shop of clothes around her."""
    page.locator(".shelf button", has_text="Mia").click()
    page.wait_for_function("bodyViewer.file().includes('Mia') && bodyViewer.numSplats() > 0", timeout=60000)
    page.evaluate("document.getElementById('studio').hidden && document.getElementById('studioBtn').click()")
    page.wait_for_function("window.wardrobe && wardrobe.ready", timeout=300000)
    page.evaluate("bodyApp.viewer.controls.autoRotate = false")
    for item in ("tee_jeans_f", "white_sneakers", "bob_dark"):
        at = page.wait_for_function(f"wardrobe.onScreen('{item}')", timeout=120000).json_value()   # on the racks around her
        page.mouse.click(at["x"], at["y"])
        page.wait_for_function(f"wardrobe.worn().includes('{item}')", timeout=120000)
    page.locator("#presets button").nth(3).click()                 # walking
    page.evaluate("""(() => {                                       // a little from the side
      const V = bodyApp.viewer, t = V.controls.target, p = V.camera.position, d = p.distanceTo(t);
      p.set(t.x + d * Math.sin(0.3), p.y, t.z + d * Math.cos(0.3)); V.controls.update();
    })()""")
    # in software rendering a sort of this many splats takes a while: wait until the clothes are
    # on screen, then for one more sort from the new angle
    page.wait_for_function("""(() => { const s = bodyApp.viewer.spark;
      return s.display === s.current && s.display.numSplats > bodyViewer.numSplats() + 1000; })()""", timeout=300000)
    page.evaluate("document.getElementById('studio').scrollTop = 0")
    page.wait_for_timeout(30000)


def dress(page, items=("tee_jeans_f", "white_sneakers", "bob_dark")) -> None:
    """Mia, dressed from the racks around her."""
    page.locator(".shelf button", has_text="Mia").click()
    page.wait_for_function("bodyViewer.file().includes('Mia') && bodyViewer.numSplats() > 0", timeout=60000)
    page.evaluate("document.getElementById('studio').hidden && document.getElementById('studioBtn').click()")
    page.wait_for_function("window.wardrobe && wardrobe.ready", timeout=300000)
    for item in items:
        at = page.wait_for_function(f"wardrobe.onScreen('{item}')", timeout=120000).json_value()   # on the racks around her
        page.mouse.click(at["x"], at["y"])
        page.wait_for_function(f"wardrobe.worn().includes('{item}')", timeout=120000)
    page.evaluate("document.getElementById('closeStudio').click()")   # (no waiting for a still frame)


def settle(page) -> None:
    # in software rendering Spark may still be building a mesh's program when the pose changes,
    # and shows that mesh as it was: the splats are made again for a few seconds of frames
    page.evaluate("""new Promise((done) => { const t0 = performance.now(); (function f() {
      for (const m of bodyApp.viewer.holder.children) m.updateVersion?.();
      if (performance.now() - t0 < 8000) requestAnimationFrame(f); else done(); })(); })""")
    page.wait_for_function("""(() => { const s = bodyApp.viewer.spark;
      return s.display === s.current && s.display.numSplats > bodyViewer.numSplats() + 1000; })()""", timeout=300000)
    page.wait_for_timeout(30000)


def room_scene(page) -> None:
    """Mia dressed, sitting on the sofa of the sample living room, seen from across the room."""
    dress(page)
    page.evaluate("house.choose(house.rooms()[0].file)")
    page.wait_for_function("house.shown()", timeout=300000)
    page.evaluate("""(() => { const r = house.map(), s = r.seats.reduce((a, b) => (Math.abs(b.x) < Math.abs(a.x) ? b : a));
        const w = tattooStudio.walker(), P = house.placement(), o = tattooStudio.rig().frame.origin;
        const b = P.toBody([s.x + s.dir[0] * 0.6, 0, s.z + s.dir[1] * 0.6]);
        w.pos = [b[0] - o[0], b[1] - o[1], b[2] - o[2]]; tattooStudio.redraw(); house.rest(); tattooStudio.stepFor(3);
        // the camera across the room, a little to the side, at eye height
        const P2 = house.placement(), V = bodyApp.viewer, T = window.bodyApp.viewer.controls.target;
        const eye = P2.toBody([s.x + s.dir[0] * 2.6 + s.dir[1] * 1.4, 1.65, s.z + s.dir[1] * 2.6 - s.dir[0] * 1.4]);
        const at = P2.toBody([s.x + s.dir[0] * 0.3, 0.6, s.z + s.dir[1] * 0.3]);
        V.holder.updateMatrixWorld();
        T.copy(V.holder.localToWorld(T.clone().set(...at)));
        V.camera.position.copy(V.holder.localToWorld(T.clone().set(...eye)));
        V.controls.autoRotate = false; V.controls.update(); })()""")
    page.wait_for_function("house.sight() === 1")
    settle(page)


def decor_scene(page) -> None:
    """Mia dressed in the sample living room set for a dinner: a round table with chairs round it,
    flowers and candles on it, a flower arch and lanterns, the Decor panel open, the table picked."""
    dress(page)
    page.evaluate("house.choose(house.rooms()[0].file)")
    page.wait_for_function("house.shown() && decor.group()", timeout=300000)
    page.click("#decorBtn")
    page.evaluate("""(async () => {
        const at = house.where(), P = house.placement(), f = P.wayToMap(tattooStudio.walker().facing());
        const n = Math.hypot(...f), a = [f[0] / n, f[1] / n], s = [a[1], -a[0]];
        const map = (along, side) => [at[0] + a[0] * along + s[0] * side, at[1] + a[1] * along + s[1] * side];
        const put = async (id, along, side, turn = 0) => { await decor.add(id); const k = decor.placed().length - 1;
          decor.move(k, ...map(along, side)); return k; };
        const t = await put("round_table", -0.2, 1.15);
        document.getElementById("decorRowN").value = "6"; document.getElementById("decorAround").click();
        const T = decor.placed()[t];
        for (const [id, dx, dz] of [["flowers", 0, 0], ["candle", 0.3, 0.1], ["candle", -0.25, -0.2], ["candle", 0.05, 0.35]]) {
          await decor.add(id); decor.move(decor.placed().length - 1, T.x + dx, T.z + dz); }
        await put("arch", -0.7, 0);
        await put("lantern", -0.6, -1.1); await put("lantern", -0.6, 1.0);
        decor.pick(t);
        // the camera in front of her, a little to the table's side, at eye height
        const V = bodyApp.viewer, C = V.controls.target;
        const xyz = (xz, y) => [xz[0], y, xz[1]];
        const eye = P.toBody(xyz(map(2.6, 0.4), 1.75)), look = P.toBody(xyz(map(-0.3, 0.55), 1.0));
        V.holder.updateMatrixWorld();
        C.copy(V.holder.localToWorld(C.clone().set(...look)));
        V.camera.position.copy(V.holder.localToWorld(C.clone().set(...eye)));
        V.controls.autoRotate = false; V.controls.update(); })()""")
    page.wait_for_function("decor.drawn() >= 14 && !decor.saving")
    settle(page)


def walk_scene(page) -> None:
    """Mia dressed, walking to the right across the screen, mid-stride, seen from her side."""
    dress(page)
    page.evaluate("bodyApp.viewer.controls.autoRotate = false")
    page.evaluate("tattooStudio.walkFor(1.45, 'r')")
    settle(page)


if __name__ == "__main__":
    main()
