import io
import json
import math
import tempfile
import unittest
from contextlib import redirect_stdout, redirect_stderr
from pathlib import Path

from body_studio import history, measure
from body_studio.__main__ import main as cli
from tests.fakes.bodyply import write_body

RUN = "Anna_front/run_20261001_090000"


class History(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        history.upsert_person(self.root, "Anna Lima", "f", 168)
        self.pid = "anna-lima"

    def tearDown(self):
        self.tmp.cleanup()

    def test_person_is_one_file_next_to_splat_studios_folders(self):
        p = self.root / "people" / "anna-lima.json"
        self.assertTrue(p.is_file())
        self.assertEqual(json.loads(p.read_text())["height_cm"], 168)
        self.assertEqual(history.people(self.root),
                         [{"id": "anna-lima", "name": "Anna Lima", "sex": "f", "height_cm": 168}])

    def test_bad_input_is_refused_with_a_code(self):
        cases = [
            (lambda: history.upsert_person(self.root, "  ", "f", 160), "no_name"),
            (lambda: history.upsert_person(self.root, "Bo", "x", 160), "bad_sex"),
            (lambda: history.upsert_person(self.root, "Bo", "m", None), "no_height"),
            (lambda: history.add_tape(self.root, self.pid, waist_cm=5), "out_of_range"),
            (lambda: history.add_tape(self.root, self.pid, waist_cm="abc"), "bad_number"),
            (lambda: history.add_tape(self.root, self.pid, date="12/10/2026", waist_cm=70), "bad_date"),
            (lambda: history.add_tape(self.root, self.pid), "no_values"),
            (lambda: history.load(self.root, "../etc"), "no_person"),
            (lambda: history.delete_entry(self.root, self.pid, "t99"), "no_entry"),
        ]
        for fn, code in cases:
            with self.assertRaises(history.HistoryError) as e:
                fn()
            self.assertEqual(e.exception.code, code)

    def test_tape_series_change_and_noise(self):
        history.add_tape(self.root, self.pid, "2026-10-08", waist_cm=74.6, weight_kg=61.0)
        history.add_tape(self.root, self.pid, "2026-09-01", waist_cm=78.0, neck_cm=32, hip_cm=100, weight_kg=63.5)
        history.add_tape(self.root, self.pid, "2026-10-12", waist_cm=74.0, neck_cm=32, hip_cm=98, weight_kg=60.5)
        p = history.progress(history.load(self.root, self.pid))
        waist = p["tape"]["waist_cm"]
        self.assertEqual([d for d, _ in waist["points"]], ["2026-09-01", "2026-10-08", "2026-10-12"])
        self.assertEqual(waist["since_first"], -4.0)
        self.assertEqual(waist["since_last"], -0.6)
        self.assertTrue(waist["beyond_noise"])
        neck = p["tape"]["neck_cm"]
        self.assertEqual(neck["since_first"], 0.0)
        self.assertFalse(neck["beyond_noise"], "no change reads as about the same")
        self.assertEqual(p["entries"][0]["date"], "2026-10-12", "newest entry first")

    def test_body_fat_keeps_one_equation_for_the_whole_series(self):
        # Army (weight + waist) covers all three entries; Navy (needs neck and hips) only two.
        history.add_tape(self.root, self.pid, "2026-09-01", waist_cm=78, neck_cm=32, hip_cm=100, weight_kg=63.5)
        history.add_tape(self.root, self.pid, "2026-09-20", waist_cm=76, weight_kg=62)
        history.add_tape(self.root, self.pid, "2026-10-12", waist_cm=74, neck_cm=32, hip_cm=98, weight_kg=60.5)
        bf = history.progress(history.load(self.root, self.pid))["body_fat"]
        self.assertEqual(bf["equation"], "army")
        self.assertEqual(len(bf["points"]), 3)
        self.assertAlmostEqual(bf["last"], measure.army_one_site("f", 60.5, 74), places=1)
        self.assertEqual(bf["error_band"], measure.ERROR_BAND)

    def test_navy_is_preferred_when_it_covers_the_same_entries(self):
        history.add_tape(self.root, self.pid, "2026-09-01", waist_cm=78, neck_cm=32, hip_cm=100, weight_kg=63.5)
        bf = history.progress(history.load(self.root, self.pid))["body_fat"]
        self.assertEqual(bf["equation"], "navy")
        self.assertAlmostEqual(bf["last"], measure.navy("f", 168, 32, 78, 100), places=1)

    def test_no_body_fat_without_a_waist(self):
        history.add_tape(self.root, self.pid, weight_kg=60)
        p = history.progress(history.load(self.root, self.pid))
        self.assertIsNone(p["body_fat"]["equation"])
        self.assertEqual(p["tape"]["weight_kg"]["last"], 60)

    def test_delete_entry(self):
        e = history.add_tape(self.root, self.pid, waist_cm=74)
        history.delete_entry(self.root, self.pid, e["id"])
        self.assertEqual(history.load(self.root, self.pid)["tape"], [])

    def test_scan_is_dated_by_its_run_measured_and_compared(self):
        for run, seed in ((RUN, 1), ("Anna_front/run_20261012_090000", 2)):
            write_body(self.root / "workspace" / run / "splat" / "standard_30000_object.ply", seed=seed)
            e = history.add_scan(self.root, self.pid, run)
            self.assertEqual(e["status"], "measuring")
            r = history.measure_scan(self.root, self.pid, e["id"], history.ply_for(self.root, run))
            self.assertEqual(r["status"], "done", r)
        with self.assertRaises(history.HistoryError):
            history.add_scan(self.root, self.pid, RUN)
        p = history.progress(history.load(self.root, self.pid))
        self.assertEqual([s["date"] for s in p["scans"]], ["2026-10-01", "2026-10-12"])
        s = p["scans"][0]
        self.assertAlmostEqual(s["measurements"]["waist_cm"], 2 * math.pi * 16 * 168 / 184.5, delta=3)
        self.assertGreater(len(s["profile"]), 50, "circumference at every height, for the profile chart")
        self.assertEqual(len(p["scan_rows"]["waist_cm"]["points"]), 2)

    def test_height_change_marks_scans_for_measuring_again(self):
        write_body(self.root / "workspace" / RUN / "splat" / "standard_30000_object.ply")
        e = history.add_scan(self.root, self.pid, RUN)
        history.measure_scan(self.root, self.pid, e["id"], history.ply_for(self.root, RUN))
        self.assertEqual(history.pending_scans(self.root, self.pid), [])
        history.upsert_person(self.root, "Anna Lima", "f", 170)
        self.assertEqual([s["status"] for s in history.pending_scans(self.root, self.pid)], ["stale"])

    def test_missing_body_fails_the_scan_not_the_app(self):
        e = history.add_scan(self.root, self.pid, RUN)
        r = history.measure_scan(self.root, self.pid, e["id"], history.ply_for(self.root, RUN))
        self.assertEqual(r["status"], "failed")
        self.assertIsNone(history.ply_for(self.root, "../../etc"))

    def test_command_line(self):
        write_body(self.root / "workspace" / RUN / "splat" / "standard_30000_object.ply")
        d = ["--data-dir", str(self.root)]
        out = io.StringIO()
        with redirect_stdout(out), redirect_stderr(io.StringIO()):
            cli(["person", "Bruno", "--sex", "m", "--height", "180", *d])
            cli(["tape", "Bruno", "--date", "2026-09-01", "--waist", "90", "--neck", "39", "--weight", "84", *d])
            cli(["tape", "Bruno", "--waist", "88", "--neck", "39", *d])
            cli(["scan", "Bruno", "workspace/" + RUN, *d])
            out.seek(0)
            out.truncate()
            cli(["progress", "Bruno", *d])
        text = out.getvalue()
        self.assertIn("Waist", text)
        self.assertIn("-2.0 since 2026-09-01", text)
        self.assertIn("US Navy", text)
        self.assertIn("2026-10-01  " + RUN + ": waist", text)
        with self.assertRaises(SystemExit), redirect_stderr(io.StringIO()):
            cli(["progress", "Nobody", *d])


if __name__ == "__main__":
    unittest.main()
