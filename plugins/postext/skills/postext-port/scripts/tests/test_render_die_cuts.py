"""render.mjs --jpeg shows a die-cut page as held in the hand (#1589).

A hole shows the page beneath it, painted at the same scale, and paper cut
away (rounded corners) is white in the JPEG, not black. The book's pages
are blue, so a hole that showed nothing would be white and one that showed
the page beneath is blue.

Needs POSTEXT_REPO, a Postext checkout with built dists (postext,
postext-pdf) and @napi-rs/canvas installed:

    POSTEXT_REPO=$PWD python3 -m unittest \\
        plugins/postext/skills/postext-port/scripts/tests/test_render_die_cuts.py
"""
from __future__ import annotations

import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent

DPI = 60
PX_PER_MM = DPI / 25.4


def mm(value: float) -> dict:
    return {"value": value, "unit": "mm"}


def bundle(root: Path) -> Path:
    d = root / "die-cuts"
    (d / "chapters").mkdir(parents=True)
    (d / "chapters/01.md").write_text("A page with a hole, and the pages beneath it.\n\n" * 300, encoding="utf-8")
    manifest = {
        "version": 2,
        "id": "die-cuts",
        "name": "Die-cuts",
        "locale": "en",
        "configVersion": 21,
        "chapters": [{"title": "", "file": "chapters/01.md"}],
        "config": {
            "page": {"backgroundColor": {"hex": "#3366cc", "model": "hex"}},
            "dieCuts": {
                "shapes": [{"id": "hole", "shape": "circle", "x": mm(30), "y": mm(30),
                            "width": mm(40), "height": mm(40), "wrap": False}],
                "pages": [{"pages": "1", "die": "hole"}],
                "corners": {"radius": mm(10), "edges": "all"},
            },
        },
    }
    (d / "preset.json").write_text(json.dumps(manifest), encoding="utf-8")
    return d


class RenderDieCuts(unittest.TestCase):
    def test_hole_shows_the_page_beneath_and_cut_paper_is_white(self):
        repo = os.environ.get("POSTEXT_REPO")
        if not repo:
            self.skipTest("POSTEXT_REPO not set")
        try:
            from PIL import Image
        except ImportError:
            self.skipTest("Pillow not installed")
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            out = root / "jpeg"
            run = subprocess.run(
                ["node", str(HERE / "render.mjs"), str(bundle(root)), "--repo", repo,
                 "--jpeg", str(out), "--pages", "#1", "--dpi", str(DPI)],
                capture_output=True, text=True, timeout=120)
            log = run.stdout + run.stderr
            # (the default families are not bundled here: a PROBLEM line)
            self.assertTrue((out / "page-001.jpg").exists(), log[-2000:])
            image = Image.open(out / "page-001.jpg").convert("RGB")
            # The hole's centre, 50 mm from the trim's top-left: the blue
            # page beneath, not the white sheet.
            centre = round(50 * PX_PER_MM)
            r, g, b = image.getpixel((centre, centre))
            self.assertGreater(b, r + 60, (r, g, b))
            # The corner cut away: white, not black.
            r, g, b = image.getpixel((1, 1))
            self.assertGreater(min(r, g, b), 230, (r, g, b))


if __name__ == "__main__":
    unittest.main()
