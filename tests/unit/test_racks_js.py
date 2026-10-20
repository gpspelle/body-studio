"""Runs tests/js/racks.test.mjs (the shop around the body: its layout and how each item is shown) with
Node against every item of the wardrobe as it is made. Skipped when Node isn't installed."""
import json
import os
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from body_studio import wardrobe

ROOT = Path(__file__).resolve().parents[2]
NODE = shutil.which("node")


@unittest.skipIf(NODE is None, "node is not installed")
class RacksJs(unittest.TestCase):
    def test_shop(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp)
            (d / "catalog.json").write_text(json.dumps(wardrobe.catalog()))
            (d / "mannequin.json").write_text(wardrobe.mannequin())
            for c in wardrobe.CATALOG:
                (d / (c["id"] + ".json")).write_text(wardrobe.shape(c["id"]))
            r = subprocess.run([NODE, "--test", str(ROOT / "tests" / "js" / "racks.test.mjs")],
                               env={**os.environ, "SHAPES": tmp}, capture_output=True, text=True, timeout=300)
            self.assertEqual(r.returncode, 0, r.stdout[-4000:] + r.stderr[-2000:])
            self.assertRegex(r.stdout, r"\bfail 0\b")
            self.assertIsNone(re.search(r"\bpass 0\b", r.stdout))


if __name__ == "__main__":
    unittest.main()
