"""Runs tests/js/venue_view.test.mjs (the venue as text and as a tiny picture, scripts/venue_view.mjs)
with Node, given the sample venue's fixtures (FIXTURES: sample_venue.fixtures()'s trees) for the
checks on the real venue (no tree through the garden cover's steel). Skipped when Node isn't installed."""
import json
import tempfile
import unittest
from pathlib import Path

from body_studio import sample_venue
from tests.unit.node import needs_node, run_js


@needs_node
class VenueViewJs(unittest.TestCase):
    def test_venue_view(self):
        with tempfile.TemporaryDirectory() as tmp:
            f = Path(tmp) / "fixtures.json"
            f.write_text(json.dumps(sample_venue.fixtures()["trees"]))
            run_js(self, "venue_view", env={"FIXTURES": str(f)})


if __name__ == "__main__":
    unittest.main()
