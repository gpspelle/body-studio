"""Writes a small drawn room's shell (sample_room.py: a cement floor, a plaster wall on its edge and
a lawn cut on a slant)
and runs tests/js/shell.test.mjs on it with Node. Skipped when Node isn't installed."""
import os
import random
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from body_studio import sample_room as base

ROOT = Path(__file__).resolve().parents[2]
NODE = shutil.which("node")


def splats():
    rnd, out = random.Random(1), []
    base._surface(rnd, (0.0, 2.0, 0.0, 0.0, 0.0, 1.0), base.finish("cement", (0.6, 0.6, 0.6)), out, 0.5, jitter=0.0)
    base._surface(rnd, (0.0, 0.0, 0.0, 2.5, 0.0, 1.0), base.finish("plaster", (0.9, 0.8, 0.7)), out, 0.5)
    base.sheet(rnd, (3.0, 0.0, 0.0), (2.0, 0.0, 0.0), (0.0, 0.0, 2.0), 8, 8, (0.2, 0.5, 0.2), out,
               [0.2, 0.02, 0.2], keep=lambda x, z: x - 3.0 < 2.0 - z)
    out.append(((9.0, 1.0, 9.0), (0.5, 0.5, 0.9), [0.1, 0.1, 0.1]))       # (not a surface: a splat)
    return out


class ShellTest(unittest.TestCase):
    def test_written_beside_the_splat(self):
        with tempfile.TemporaryDirectory() as tmp:
            ply = base.write_drawn(Path(tmp) / "run" / "splat" / "room_clean.ply", splats)
            look, shell = base.look_files(ply)
            self.assertTrue(ply.is_file() and look.is_file() and shell.is_file())
            self.assertEqual(look.parent.name, "look", "not in splat/, where the room's splat is looked for")
            n = lambda p: int(re.search(rb"element vertex (\d+)", p.read_bytes()[:400]).group(1))
            self.assertEqual(n(look), 1, "the look keeps only the splats the shell doesn't draw")
            self.assertGreater(n(ply), 30, "the splat keeps them all, for the map")

    @unittest.skipIf(NODE is None, "node is not installed")
    def test_shell_js(self):
        with tempfile.TemporaryDirectory() as tmp:
            ply = base.write_drawn(Path(tmp) / "run" / "splat" / "room_clean.ply", splats)
            r = subprocess.run([NODE, "--test", str(ROOT / "tests" / "js" / "shell.test.mjs")],
                               capture_output=True, text=True, timeout=120,
                               env={**os.environ, "SHELL_FILE": str(base.look_files(ply)[1])})
        self.assertEqual(r.returncode, 0, r.stdout[-4000:] + r.stderr[-2000:])
        self.assertRegex(r.stdout, r"\bfail 0\b")
        self.assertIsNone(re.search(r"\bpass 0\b", r.stdout))


if __name__ == "__main__":
    unittest.main()
