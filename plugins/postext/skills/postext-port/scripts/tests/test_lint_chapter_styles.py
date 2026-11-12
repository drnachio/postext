"""Tests of the chapter style checks of `lint_project.py` (#1521): a style
named by a chapter's front matter or a part fence must exist, and a style
cannot set what the whole book shares.

    python3 -m unittest discover -s plugins/postext/skills/postext-port/scripts/tests
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SCRIPTS))
import lint_project as lp  # noqa: E402

CONFIG = {"chapterStyles": [{"id": "appendix", "config": {"layout": {"layoutType": "double"}}}]}


def messages(markdown: str, idx: int = 1) -> list[str]:
    rep = lp.Report()
    ids = lp.style_ids(CONFIG)
    lp.check_markdown("02.md", markdown, idx, ids, set(), rep, set(), set())
    return [msg for _, _, msg in rep.items]


class ChapterStyleLint(unittest.TestCase):
    def test_known_styles(self):
        self.assertEqual([m for m in messages("---\nchapterStyle: appendix\n---\n# A\n") if "chapterStyle" in m], [])
        part = ':::part{number="IV" title="Appendices" style="appendix"}\n:::\n\n# A\n'
        self.assertEqual([m for m in messages(part) if "chapterStyle" in m], [])

    def test_unknown_styles(self):
        self.assertTrue(any("chapterStyleUnknown" in m for m in messages("---\nchapterStyle: glossary\n---\n# A\n")))
        part = ':::part{number="IV" title="Appendices" style="glossary"}\n:::\n\n# A\n'
        self.assertTrue(any("chapterStyleUnknown" in m for m in messages(part)))

    def test_a_later_chapter_keeps_its_style_line(self):
        self.assertFalse(any("only counts in the first chapter" in m for m in messages("---\nchapterStyle: appendix\n---\n# A\n")))
        self.assertTrue(any("only counts in the first chapter" in m for m in messages("---\ntitle: B\n---\n# A\n")))

    def test_book_settings_in_a_style(self):
        rep = lp.Report()
        lp.check_chapter_styles({"chapterStyles": [{"id": "a", "config": {"locale": "fr", "page": {"width": {"value": 1, "unit": "mm"}, "margins": {}}}}]}, "config", rep)
        msgs = [msg for _, _, msg in rep.items]
        self.assertEqual(len(msgs), 1)
        self.assertIn("chapterStyleBookSetting", msgs[0])
        self.assertIn("page.width", msgs[0])
        self.assertNotIn("margins", msgs[0])


if __name__ == "__main__":
    unittest.main()


class Shapes178(unittest.TestCase):
    """What postext 1.78.0 shipped and 1.79 reads another way (#1532)."""

    def test_section_line(self):
        self.assertTrue(any("::section" in m for m in messages('# A\n\nText.\n\n::section{style="appendix"}\n\nMore.\n')))
        self.assertFalse(any("::section" in m for m in messages('# A\n\n```\n::section{style="appendix"}\n```\n')))

    def test_binding_keys(self):
        rep = lp.Report()
        lp.check_legacy_178({"bodyText": {"bindCitations": True},
                             "chapterStyles": [{"id": "a", "config": {"bodyText": {"bindOperators": True}}}]}, "config", rep)
        found = [w for _, w, _ in rep.items]
        self.assertEqual(found, ["config.bodyText.bindCitations", "config.chapterStyles[0].config.bodyText.bindOperators"])
