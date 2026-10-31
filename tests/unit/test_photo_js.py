"""Runs tests/js/photo.test.mjs (Take a photo's maths: its size, what goes in, the finishes' looks,
the sun, the file's name) with Node, and checks the path tracer bundled in static/pathtracer/
imports three from the page's own. Skipped when Node isn't installed."""
import re
import unittest
from pathlib import Path
from tests.unit.node import needs_node, run_js

ROOT = Path(__file__).resolve().parents[2]
STATIC = ROOT / "src" / "body_studio" / "static"


class PathTracerBundle(unittest.TestCase):
    def test_one_three(self):
        """The bundle imports "three" and its addons (the page's import map: splat-studio's copy), never its own."""
        js = (STATIC / "pathtracer" / "pathtracer.js").read_text()
        sources = set(re.findall(r'from\s*"([^"]+)"', js))
        self.assertEqual(sources, {"three", "three/addons/postprocessing/Pass.js"})
        self.assertIn("WebGLPathTracer", js)
        self.assertIn("MIT License", (STATIC / "pathtracer" / "LICENSE").read_text())


@needs_node
class PhotoJs(unittest.TestCase):
    def test_photo_maths(self):
        run_js(self, "photo", timeout=120)


if __name__ == "__main__":
    unittest.main()
