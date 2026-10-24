import re
import unittest
from pathlib import Path

STATIC = Path(__file__).resolve().parents[2] / "src" / "body_studio" / "static"


def table(lang: str) -> set:
    js = (STATIC / "i18n.js").read_text()
    block = re.search(rf"^    {lang}: {{(.*?)^    }},", js, re.S | re.M).group(1)
    return set(re.findall(r'^\s+"([\w.]+)":', block, re.M))


class I18n(unittest.TestCase):
    def test_english_only(self):
        js = (STATIC / "i18n.js").read_text()
        self.assertEqual(re.findall(r"^    (\w+): {", js, re.M), ["en"])
        self.assertNotIn('id="lang"', (STATIC / "index.html").read_text())

    def test_page_uses_only_known_keys(self):
        page = "".join((STATIC / f).read_text() for f in ("index.html", "viewer.js", "progress.js", "tattoo.js", "decorate.js"))
        used = set(re.findall(r'(?:data-i18n(?:-aria-label)?="|\bt\(")([\w.]+)', page))
        used |= set(re.findall(r'"(prog\.\w+)"', page))               # row labels passed to t() later
        used = {k for k in used if not k.endswith(".")}                  # "joint." + name: see below
        used = (used - {"job.stage"}) | {"job.stage1", "job.stage2", "job.stage3"}   # "job.stage" + n
        self.assertLessEqual(used, table("en"))

    def test_tattoo_panel_names_are_translated(self):
        """Joint names, motion labels, presets and rig errors are looked up by name ("joint." + name)."""
        en = table("en")
        pose = (STATIC / "pose.js").read_text()
        tattoo = (STATIC / "tattoo.js").read_text()
        joints = set(re.findall(r'^\s+(\w+):\s*{\s*n:', pose, re.M))
        joints |= {j.replace("_l", "_r") for j in joints if j.endswith("_l")}
        self.assertIn("shoulder_r", joints)
        self.assertLessEqual({"joint." + j for j in joints}, en)
        labels = {x for group in re.findall(r'labels:\s*\[([^\]]*)\]', pose) for x in re.findall(r'"(\w+)"', group)}
        self.assertIn("bend", labels)
        self.assertLessEqual({"dof." + x for x in labels}, en)
        presets = re.search(r"const PRESETS = {(.*?)^};", tattoo, re.S | re.M).group(1)
        names = set(re.findall(r"^  (\w+):", presets, re.M))
        self.assertIn("sit", names)
        self.assertLessEqual({"pose.p." + x for x in names}, en)
        rig = (STATIC.parent / "rig.py").read_text()
        codes = set(re.findall(r'RigError\(.*, "(\w+)"\)', rig)) | {"shape"}
        self.assertGreaterEqual(len(codes), 4)
        self.assertLessEqual({"rig.err." + c for c in codes}, en)

    def test_wardrobe_names_are_translated(self):
        from body_studio import wardrobe
        en = table("en")
        keys = {"wear.item." + i["id"] for i in wardrobe.CATALOG}
        keys |= set(re.findall(r'\bt\(\s*"(wear\.\w+)"', (STATIC / "wardrobe.js").read_text()))
        keys |= set(re.findall(r'"(wear\.(?:hint|wait))"', (STATIC / "wardrobe.js").read_text()))
        self.assertLessEqual(keys, en)
        fit = (STATIC.parent / "fit.py").read_text()      # fit errors reuse the rig's advice
        self.assertLessEqual({"rig.err." + c for c in re.findall(r'FitError\(.*, "(\w+)"\)', fit)}, en)

    def test_decor_names_and_errors_are_translated(self):
        from body_studio import decor
        en = table("en")
        page = (STATIC / "decorate.js").read_text()
        keys = set(re.findall(r'\bt\(\s*"(decor\.\w+)"', page))
        keys |= {"decor.item." + s["id"] for s in decor.STARTERS} | {"decor.group." + s["group"] for s in decor.STARTERS} | {"decor.group.mine"} | {"decor.colour." + c for c in decor.COLOURS}
        src = (STATIC.parent / "decor.py").read_text() + (STATIC.parent / "photo3d.py").read_text()
        codes = set(re.findall(r'DecorError\(.*, "(\w+)"\)', src)) | set(re.findall(r'code = "(\w+)"', src))
        codes |= set(re.findall(r'"code": "(\w+)"', (STATIC.parent / "server.py").read_text())) & {"no_room"}
        self.assertGreaterEqual(codes, {"photo_type", "photo_size", "height", "mesh", "photo3d", "photo3d_install"})
        keys |= {"decor.err." + c for c in codes}
        self.assertLessEqual(keys, en)

    def test_every_upload_error_is_translated(self):
        codes = set(re.findall(r'"code": "(\w+)"', (STATIC.parent / "server.py").read_text()))
        self.assertTrue(codes)
        codes |= set(re.findall(r'HistoryError\(.*, "(\w+)"\)', (STATIC.parent / "history.py").read_text()))
        codes |= set(re.findall(r'HistoryError\(.*, "(\w+)"\)', (STATIC.parent / "server.py").read_text()))
        self.assertLessEqual({"err." + c for c in codes}, table("en"))


if __name__ == "__main__":
    unittest.main()
