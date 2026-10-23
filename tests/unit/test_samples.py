"""tests/fakes/samples.py: the sample rooms for browser tests and screenshots, drawn once and copied."""
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from body_studio import library, sample_room
from tests.fakes import samples


class SampleCache(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        env = mock.patch.dict(os.environ, {"BODY_STUDIO_TEST_CACHE": str(Path(self.tmp.name) / "cache")})
        env.start()
        self.addCleanup(env.stop)
        names = mock.patch.object(samples, "names", lambda: [sample_room.NAME])   # the quickest to draw
        names.start()
        self.addCleanup(names.stop)

    def test_drawn_once_then_copied(self):
        first, second = Path(self.tmp.name) / "a", Path(self.tmp.name) / "b"
        samples.ensure(first)
        self.assertTrue(sample_room.ready(first))
        with mock.patch.object(sample_room, "ensure", side_effect=AssertionError("drawn again")):
            samples.ensure(second)
        self.assertTrue(sample_room.ready(second))
        self.assertIn(sample_room.NAME, library.room_names(second))   # listed as a room, never a body
        a = sample_room.run_dir(first)
        b = sample_room.run_dir(second)
        self.assertEqual(sorted(p.relative_to(a) for p in a.rglob("*")), sorted(p.relative_to(b) for p in b.rglob("*")))

    def test_a_change_to_the_app_draws_them_again(self):
        before = samples.key()
        with mock.patch.object(Path, "read_bytes", lambda p: b"changed"):
            self.assertNotEqual(samples.key(), before)
        self.assertEqual(samples.key(), before)


if __name__ == "__main__":
    unittest.main()
