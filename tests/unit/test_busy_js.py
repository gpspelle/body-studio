"""Runs tests/js/busy.test.mjs (when the spinner over the body shows, what it says, when it goes)
with Node. Skipped when Node isn't installed."""
import unittest

from tests.unit.node import needs_node, run_js


@needs_node
class BusyJs(unittest.TestCase):
    def test_busy(self):
        run_js(self, "busy", timeout=120)


if __name__ == "__main__":
    unittest.main()
