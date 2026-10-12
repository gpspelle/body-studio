import re
import unittest
from pathlib import Path

STATIC = Path(__file__).resolve().parents[2] / "src" / "body_studio" / "static"


def table(lang: str) -> set:
    js = (STATIC / "i18n.js").read_text()
    block = re.search(rf"^    {lang}: {{(.*?)^    }},", js, re.S | re.M).group(1)
    return set(re.findall(r'^\s+"([\w.]+)":', block, re.M))


class I18n(unittest.TestCase):
    def test_every_key_in_every_language(self):
        self.assertEqual(table("en"), table("pt"))

    def test_page_uses_only_known_keys(self):
        page = (STATIC / "index.html").read_text() + (STATIC / "progress.js").read_text()
        used = set(re.findall(r'(?:data-i18n(?:-aria-label)?="|\bt\(")([\w.]+)', page))
        used |= set(re.findall(r'"(prog\.\w+)"', page))               # row labels passed to t() later
        used = (used - {"job.stage"}) | {"job.stage1", "job.stage2", "job.stage3"}   # "job.stage" + n
        self.assertLessEqual(used, table("en"))

    def test_every_upload_error_is_translated(self):
        codes = set(re.findall(r'"code": "(\w+)"', (STATIC.parent / "server.py").read_text()))
        self.assertTrue(codes)
        codes |= set(re.findall(r'HistoryError\(.*, "(\w+)"\)', (STATIC.parent / "history.py").read_text()))
        codes |= set(re.findall(r'HistoryError\(.*, "(\w+)"\)', (STATIC.parent / "server.py").read_text()))
        self.assertLessEqual({"err." + c for c in codes}, table("en"))


if __name__ == "__main__":
    unittest.main()
