import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("check_docs", Path(__file__).resolve().parents[2] / "scripts" / "check_docs.py")
check_docs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check_docs)


class CheckDocs(unittest.TestCase):
    def test_page_change_needs_docs(self):
        self.assertEqual(check_docs.problems(["src/body_studio/static/index.html"]), ["src/body_studio/static/index.html"])

    def test_docs_or_opt_out_pass(self):
        self.assertEqual(check_docs.problems(["src/body_studio/server.py", "README.md"]), [])
        self.assertEqual(check_docs.problems(["src/body_studio/server.py"], "No docs needed: refactor"), [])
        self.assertEqual(check_docs.problems(["tests/unit/test_library.py"]), [])


if __name__ == "__main__":
    unittest.main()
