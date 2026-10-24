import re
import unittest
from pathlib import Path

STATIC = Path(__file__).resolve().parents[2] / "src" / "body_studio" / "static"
CSS = (STATIC / "body.css").read_text()
TOKENS = ("--paper", "--card", "--ink", "--soft", "--hair", "--serif", "--accent", "--bad")


def blocks(css: str):
    """(selector, body) for every rule, at any depth of @media."""
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    return re.findall(r"([^{}]+)\{([^{}]*)\}", css)


class DesignSystem(unittest.TestCase):
    def test_every_colour_used_is_defined(self):
        """A var() nothing defines falls back silently (clothes group names once used --quiet)."""
        defined = set(re.findall(r"(--[\w-]+)\s*:", CSS))
        scripts = "".join(p.read_text() for p in STATIC.glob("*.js"))
        set_by_js = set(re.findall(r"""["'](--[\w-]+)["']""", scripts))
        used = set(re.findall(r"var\((--[\w-]+)", CSS))
        self.assertEqual(used - defined - set_by_js, set())

    def test_one_look_set_only_in_root(self):
        """Paper, ink and the serif are the page's, set once (and again for dark): no panel has its own."""
        for selector, body in blocks(CSS):
            for token in TOKENS:
                if re.search(rf"{token}\s*:", body):
                    self.assertEqual(selector.strip(), ":root", f"{token} set in {selector.strip()}")

    def test_buttons_that_take_something_away_are_marked(self):
        page = (STATIC / "index.html").read_text()
        for id_ in ("tatRemove", "decorRemove", "decorForget", "decorDelete"):
            self.assertRegex(page, rf'id="{id_}" class="[^"]*\bdanger\b')
        self.assertIn('"link danger", "✕"', (STATIC / "progress.js").read_text())

    def test_every_panel_closes_with_the_round_x(self):
        page = (STATIC / "index.html").read_text()
        closers = re.findall(r'<button id="close\w+" class="([^"]*)"', page)
        self.assertGreaterEqual(len(closers), 4)
        for cls in closers:
            self.assertIn("close", cls.split())

    def test_one_primary_button_per_form(self):
        page = (STATIC / "index.html").read_text()
        for form in re.findall(r"<form\b.*?</form>", page, re.S):
            self.assertEqual(len(re.findall(r'class="btn primary"', form)), 1, form[:60])


if __name__ == "__main__":
    unittest.main()
