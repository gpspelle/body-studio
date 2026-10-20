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

from body_studio import history, server  # noqa: E402

SHOTS = [  # name, width, height, colour scheme, language, panel open
    ("desktop-light", 1280, 800, "light", "en", None),
    ("phone-dark", 390, 844, "dark", "pt", None),
    ("progress-desktop", 1280, 800, "light", "en", "progress"),
    ("progress-phone", 390, 844, "dark", "pt", "progress"),
    ("tattoo-desktop", 1280, 800, "light", "en", "tattoo"),
    ("tattoo-phone", 390, 844, "dark", "pt", "tattoo"),
    ("wardrobe-desktop", 1280, 800, "light", "en", "wardrobe"),
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
    page.click("#studioBtn")
    page.wait_for_function("tattooStudio.ready", timeout=300000)
    page.evaluate("bodyApp.viewer.controls.autoRotate = false")
    page.locator("#presets button").nth(2).click()                 # flex
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
    """Mia walking in a T-shirt, jeans, sneakers and a bob, the Clothes section in view."""
    page.locator(".shelf button", has_text="Mia").click()
    page.wait_for_function("bodyViewer.file().includes('Mia') && bodyViewer.numSplats() > 0", timeout=60000)
    page.click("#studioBtn")
    page.wait_for_function("window.wardrobe && wardrobe.ready", timeout=300000)
    page.evaluate("bodyApp.viewer.controls.autoRotate = false")
    for item in ("tee_jeans_f", "white_sneakers", "bob_dark"):
        page.click(f"#wearSlots [data-item={item}]")
        page.wait_for_function(f"wardrobe.worn().includes('{item}')", timeout=120000)
    page.locator("#presets button").nth(3).click()                 # walking
    page.evaluate("""(() => {                                       // a little from the side
      const V = bodyApp.viewer, t = V.controls.target, p = V.camera.position, d = p.distanceTo(t);
      p.set(t.x + d * Math.sin(0.5), p.y, t.z + d * Math.cos(0.5)); V.controls.update();
    })()""")
    # in software rendering a sort of this many splats takes a while: wait until the clothes are
    # on screen, then for one more sort from the new angle
    page.wait_for_function("""(() => { const s = bodyApp.viewer.spark;
      return s.display === s.current && s.display.numSplats > bodyViewer.numSplats() + 1000; })()""", timeout=300000)
    page.evaluate("document.getElementById('studio').scrollTop = 0")
    page.wait_for_timeout(30000)


if __name__ == "__main__":
    main()
