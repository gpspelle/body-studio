"""Runs tests/js/bake.test.mjs (baked light's numbers: the corners' texture, its bands, the light kept
as bytes, the keys a mesh's light is kept under, the sky) with Node. Skipped when Node isn't installed."""
import unittest

from tests.unit.node import needs_node, run_js


@needs_node
class BakeJs(unittest.TestCase):
    def test_bake_maths(self):
        run_js(self, "bake", timeout=120)


if __name__ == "__main__":
    unittest.main()
