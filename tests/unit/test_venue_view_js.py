"""Runs tests/js/venue_view.test.mjs (the venue as text and as a tiny picture, scripts/venue_view.mjs)
with Node. Skipped when Node isn't installed."""
import unittest

from tests.unit.node import needs_node, run_js


@needs_node
class VenueViewJs(unittest.TestCase):
    def test_venue_view(self):
        run_js(self, "venue_view")


if __name__ == "__main__":
    unittest.main()
