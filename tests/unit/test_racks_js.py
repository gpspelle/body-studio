"""Runs tests/js/racks.test.mjs (the shop around the body: its layout and how each item is shown) with
Node against every item of the wardrobe as it is made. Skipped when Node isn't installed."""
import json
import tempfile
import unittest
from pathlib import Path

from body_studio import wardrobe
from tests.unit.node import needs_node, run_js


@needs_node
class RacksJs(unittest.TestCase):
    def test_shop(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp)
            (d / "catalog.json").write_text(json.dumps(wardrobe.catalog()))
            (d / "mannequin.json").write_text(wardrobe.mannequin())
            for c in wardrobe.CATALOG:
                (d / (c["id"] + ".json")).write_text(wardrobe.shape(c["id"]))
            run_js(self, "racks", env={"SHAPES": tmp})


if __name__ == "__main__":
    unittest.main()
