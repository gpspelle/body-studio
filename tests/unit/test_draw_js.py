"""Runs tests/js/draw.test.mjs (when the page draws a frame: only when something changed) with
Node. Skipped when Node isn't installed."""
import unittest

from tests.unit.node import needs_node, run_js


@needs_node
class DrawJs(unittest.TestCase):
    def test_draw(self):
        run_js(self, "draw", timeout=120)


if __name__ == "__main__":
    unittest.main()
