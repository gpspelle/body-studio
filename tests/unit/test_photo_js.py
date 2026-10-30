"""Runs tests/js/photo.test.mjs (Take a photo's maths: its size, what goes in, the finishes' looks,
the sun, the file's name) with Node, and checks the path tracer bundled in static/pathtracer/
imports three from the page's own. Skipped when Node isn't installed."""
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STATIC = ROOT / "src" / "body_studio" / "static"
NODE = shutil.which("node")


class PathTracerBundle(unittest.TestCase):
    def test_one_three(self):
        """The bundle imports "three" and its addons (the page's import map: splat-studio's copy), never its own."""
        js = (STATIC / "pathtracer" / "pathtracer.js").read_text()
        sources = set(re.findall(r'from\s*"([^"]+)"', js))
        self.assertEqual(sources, {"three", "three/addons/postprocessing/Pass.js"})
        self.assertIn("WebGLPathTracer", js)
        self.assertIn("MIT License", (STATIC / "pathtracer" / "LICENSE").read_text())


@unittest.skipIf(NODE is None, "node is not installed")
class PhotoJs(unittest.TestCase):
    def test_photo_maths(self):
        r = subprocess.run([NODE, "--test", str(ROOT / "tests" / "js" / "photo.test.mjs")],
                           capture_output=True, text=True, timeout=120)
        self.assertEqual(r.returncode, 0, r.stdout[-4000:] + r.stderr[-2000:])
        self.assertRegex(r.stdout, r"\bfail 0\b")
        self.assertIsNone(re.search(r"\bpass 0\b", r.stdout))


if __name__ == "__main__":
    unittest.main()
