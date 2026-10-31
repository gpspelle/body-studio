"""Runs tests/js/dress.test.mjs (the wardrobe maths the page uses) with Node. Skipped when Node
isn't installed."""
import unittest

from tests.unit.node import needs_node, run_js


@needs_node
class DressJs(unittest.TestCase):
    def test_dress_maths(self):
        run_js(self, "dress")


if __name__ == "__main__":
    unittest.main()
