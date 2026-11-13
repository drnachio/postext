"""Tests of the `:::diecut` check of `lint_project.py` (#1571): the die is config (`dieCuts.shapes`)
and the Markdown only names it, so a die the config does not define is an error and an attribute
that would carry the shape into the text is flagged.

    python3 -m unittest discover -s plugins/postext/skills/postext-port/scripts/tests
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SCRIPTS))
import lint_project as lp  # noqa: E402

CONFIG = {"dieCuts": {"shapes": [{"id": "window", "shape": "circle", "x": "40mm", "y": "60mm", "width": "30mm"}]}}


def diecut_messages(markdown: str, cfg: dict = CONFIG) -> list[tuple[str, str]]:
    rep = lp.Report()
    ids = lp.style_ids(cfg)
    lp.check_markdown("01.md", markdown, 0, ids, set(), rep, set(), set())
    return [(level, msg) for level, _, msg in rep.items if "die" in msg]


class DiecutLint(unittest.TestCase):
    def test_known_die(self):
        self.assertEqual(diecut_messages(":::diecut{die=window}\nThe page with the hole.\n:::\n"), [])

    def test_unknown_die(self):
        got = diecut_messages(":::diecut{die=porthole}\nText.\n:::\n")
        self.assertEqual(len(got), 1, got)
        self.assertIn("'porthole'", got[0][1])
        self.assertIn("dieCuts.shapes", got[0][1])

    def test_no_die_cuts_in_the_config(self):
        self.assertEqual(len(diecut_messages(":::diecut{die=window}\nText.\n:::\n", cfg={})), 1)

    def test_shape_in_the_markdown(self):
        got = diecut_messages(':::diecut{die=window shape="circle"}\nText.\n:::\n')
        self.assertEqual(len(got), 1, got)
        self.assertIn("'shape'", got[0][1])

    def test_style_ids_read_the_dies(self):
        self.assertEqual(lp.style_ids(CONFIG)["die"], {"window"})
        self.assertEqual(lp.style_ids({})["die"], set())


if __name__ == "__main__":
    unittest.main()
