"""Tests of the special ink and die-line reading (#1571): `guess_ink_finish` agrees with the engine's
`guessInkFinish` on a sample of names, die-maker plates are told apart from inks, and the inventory
suggests `print.inks[].finish` and `print.dieLine.ink` from a source's separations and layers.

    python3 -m unittest discover -s plugins/postext/skills/postext-port/scripts/tests
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SCRIPTS))

import ink_finishes as inks  # noqa: E402
import inventory  # noqa: E402

# Names and what packages/postext/src/color/finishes.ts `guessInkFinish` returns for them
# (taken from the engine, 2026-11-13). Keep the two in step.
ENGINE = [
    ("Gold", {"kind": "metallic"}),
    ("PANTONE 871 C", {"kind": "metallic"}),
    ("PANTONE 8003 C", {"kind": "metallic"}),
    ("PANTONE 10102 C", {"kind": "metallic"}),
    ("Gold foil", {"kind": "foil"}),
    ("Hot foil", {"kind": "foil"}),
    ("Estampación oro", {"kind": "foil"}),
    ("Barniz oro", {"kind": "varnish"}),
    ("Barniz UVI mate", {"kind": "varnish", "sheen": "matte"}),
    ("Spot UV", {"kind": "varnish"}),
    ("Varnish soft touch", {"kind": "varnish", "sheen": "softTouch"}),
    ("Fluo pink", {"kind": "fluorescent"}),
    ("PANTONE 806 C", {"kind": "fluorescent"}),
    ("PANTONE 814 U", {"kind": "fluorescent"}),
    ("Opaque white", {"kind": "white"}),
    ("Blanco", {"kind": "white"}),
    ("Weiß", {"kind": "white"}),
    ("Deckweiß", {"kind": "white"}),
    ("白金", {"kind": "metallic"}),
    ("烫金", {"kind": "foil"}),
    ("光油", {"kind": "varnish"}),
    ("特色金", {"kind": "metallic"}),
    ("ニス", {"kind": "varnish"}),
    ("マットニス", {"kind": "varnish", "sheen": "matte"}),
    ("ورنيش لامع", {"kind": "varnish", "sheen": "gloss"}),
    ("Seidenmatt Lack", {"kind": "varnish", "sheen": "satin"}),
    ("Goldenrod", None),
    ("Color", None),
    ("Or métallisé", {"kind": "metallic"}),
    ("Dorure", {"kind": "foil"}),
    ("PANTONE 286 C", None),
    ("Leuchtgelb", {"kind": "fluorescent"}),
    ("Neón", {"kind": "fluorescent"}),
    ("Silver satin", {"kind": "metallic", "sheen": "satin"}),
    ("Metallic copper matte", {"kind": "metallic", "sheen": "matte"}),
    ("Silber glänzend", {"kind": "metallic", "sheen": "gloss"}),
    ("Vernis sélectif brillant", {"kind": "varnish", "sheen": "gloss"}),
    ("Vernice opaca", {"kind": "varnish"}),
    ("Verniz fosco", {"kind": "varnish", "sheen": "matte"}),
    ("Plata", {"kind": "metallic"}),
    ("Lámina plata", {"kind": "foil"}),
    ("Fluor", {"kind": "fluorescent"}),
    ("Gold soft touch", {"kind": "metallic"}),
    ("black", None),
    ("Bianco coprente", {"kind": "white"}),
    ("メタリックシルバー", {"kind": "metallic"}),
    ("蛍光ピンク", {"kind": "fluorescent"}),
]


class GuessInkFinish(unittest.TestCase):
    def test_agrees_with_the_engine(self) -> None:
        for name, expected in ENGINE:
            with self.subTest(name=name):
                self.assertEqual(inks.guess_ink_finish(name), expected)

    def test_soft_touch_is_a_varnish_sheen_only(self) -> None:
        self.assertEqual(inks.guess_ink_finish("Spot UV soft touch"), {"kind": "varnish", "sheen": "softTouch"})
        self.assertNotIn("sheen", inks.guess_ink_finish("Gold soft touch") or {})

    def test_whole_words_only(self) -> None:
        # `gold` inside a longer word, `uvi` inside another, `mat` in `Material`.
        for name in ("Goldenrod", "Ruvido", "Material blue"):
            with self.subTest(name=name):
                self.assertIsNone(inks.guess_ink_finish(name))


class DieLinePlate(unittest.TestCase):
    def test_die_maker_plates(self) -> None:
        for name in ("CutContour", "Cut Contour", "Die", "Dieline", "Die line", "Diecut", "Kiss cut", "Troquel",
                     "Línea de troquel", "Fustella", "Stanzform", "Stanzkontur", "Découpe", "模切", "刀模", "抜き型", "トムソン"):
            with self.subTest(name=name):
                self.assertTrue(inks.die_line_plate(name))

    def test_inks_are_not_die_lines(self) -> None:
        for name in ("Gold", "PANTONE 871 C", "Varnish", "Diesel blue", "Cuttlefish", "Black"):
            with self.subTest(name=name):
                self.assertFalse(inks.die_line_plate(name))


class SuggestedConfig(unittest.TestCase):
    def test_inks_and_die_line(self) -> None:
        got = inks.suggested_ink_config(["Gold", "PANTONE 286 C", "CutContour", "Spot UV", "Die"])
        self.assertEqual(got, {
            "inks": [
                {"name": "Gold", "finish": {"kind": "metallic"}},
                {"name": "Spot UV", "finish": {"kind": "varnish"}},
            ],
            # The first die-maker plate names the die line.
            "dieLine": {"ink": "CutContour"},
        })

    def test_nothing_special(self) -> None:
        self.assertEqual(inks.suggested_ink_config(["PANTONE 286 C", "Reflex Blue"]), {})

    def test_inventory_lists_plates_and_layers(self) -> None:
        got = inventory.special_inks(["Gold", "PANTONE 286 C", "Varnish"], ["Text", "Troquel"])
        self.assertEqual(got["spot_plates"], [
            {"name": "Gold", "finish": {"kind": "metallic"}},
            {"name": "PANTONE 286 C"},
            {"name": "Varnish", "finish": {"kind": "varnish"}},
        ])
        self.assertEqual(got["die_line_layers"], ["Troquel"])
        self.assertEqual(got["suggested_config"]["print"]["dieLine"], {"ink": "Troquel"})
        self.assertIn("dieCuts", got["note_special_inks"])

    def test_die_plate_is_flagged(self) -> None:
        got = inventory.special_inks(["CutContour"], [])
        self.assertEqual(got["spot_plates"], [{"name": "CutContour", "dieLine": True}])
        self.assertNotIn("inks", got["suggested_config"]["print"])

    def test_merged_into_the_print_set_up(self) -> None:
        out = {"suggested_config": {"print": {"standard": "pdfx4"}}}
        inventory.merge_suggested(out, inventory.special_inks(["Gold", "Die"], []))
        self.assertEqual(out["suggested_config"]["print"], {
            "standard": "pdfx4",
            "inks": [{"name": "Gold", "finish": {"kind": "metallic"}}],
            "dieLine": {"ink": "Die"},
        })

    def test_no_special_inks_adds_nothing(self) -> None:
        out: dict = {}
        inventory.merge_suggested(out, inventory.special_inks([], ["Text"]))
        self.assertEqual(out, {})


if __name__ == "__main__":
    unittest.main()
