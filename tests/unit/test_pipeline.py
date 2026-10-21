import unittest
from pathlib import Path

from body_studio.pipeline import body_from_log, job_options, splat_run_args


class RunArgs(unittest.TestCase):
    def test_background_removal_is_always_on(self):
        for q in ("preview", "standard", "high"):
            self.assertIn("--remove-background", splat_run_args(Path("v.mov"), q))

    def test_trim_is_passed_through(self):
        args = splat_run_args(Path("v.mov"), start="0:03", end="1:40")
        self.assertEqual(args[args.index("--start") + 1], "0:03")
        self.assertEqual(args[args.index("--end") + 1], "1:40")

    def test_unknown_quality_is_refused(self):
        with self.assertRaises(ValueError):
            splat_run_args(Path("v.mov"), "ultra")

    def test_splat_studio_accepts_our_arguments(self):
        """Contract with the pinned splat-studio: fails here, not mid-run, if a flag goes away."""
        from splat_studio.pipeline import build_parser
        a = build_parser().parse_args(splat_run_args(Path("v.mov"), "high", 320, "0:01", "0:59"))
        self.assertTrue(a.remove_background)
        self.assertEqual((a.quality, a.frames, a.start, a.end), ("high", 320, "0:01", "0:59"))
        self.assertTrue(build_parser().parse_args(splat_run_args(Path("v.mov"), person=True)).person)

    def test_person_masks_when_they_can_be_made(self):
        self.assertIn("--person", splat_run_args(Path("v.mov"), person=True))
        self.assertNotIn("--person", splat_run_args(Path("v.mov"), person=False))
        self.assertTrue(job_options(person=True)["person"])
        self.assertNotIn("person", job_options(person=False))
        self.assertTrue(job_options(person=False)["remove_background"])

    def test_splat_studio_runner_accepts_our_job_options(self):
        """Contract with the pinned splat-studio's job runner: the web runs ask for the same."""
        from splat_studio.server.jobs import Job, build_cmd, validate_options
        opts = validate_options(job_options(person=True))
        self.assertEqual(opts.get("person"), True)
        self.assertTrue(opts.get("remove_background"))
        cmd = build_cmd(Job(Path("/tmp/none"), id="j", type="video", video="v.mov", options=opts))
        self.assertIn("--person", cmd)
        self.assertIn("--remove-background", cmd)



class BodyFromLog(unittest.TestCase):
    def test_prefers_background_free_copy(self):
        log = ("Done. Splat: /d/s/standard_30000.ply\n"
               "Clean copy: /d/s/standard_30000_clean.ply\n"
               "Object copy: /d/s/standard_30000_object.ply\n")
        self.assertEqual(body_from_log(log), Path("/d/s/standard_30000_object.ply"))

    def test_falls_back_to_clean_then_raw(self):
        self.assertEqual(body_from_log("Done. Splat: /a.ply\nClean copy: /a_clean.ply\n"), Path("/a_clean.ply"))
        self.assertEqual(body_from_log("Done. Splat: /a.ply\n"), Path("/a.ply"))
        self.assertIsNone(body_from_log("COLMAP did not produce a usable model\n"))


if __name__ == "__main__":
    unittest.main()
