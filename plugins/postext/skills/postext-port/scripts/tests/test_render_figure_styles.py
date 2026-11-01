"""render.mjs sets figure styles (#1356, feature families of #1237).

A style with `figureStyle` sets its text in a feature family
(`EB Garamond@onum`): the base family's files with the OpenType features.
render.mjs must measure and paint it with the bundled face, not report it
as an unbundled family and set it in a stand-in face.

Needs POSTEXT_REPO, a Postext checkout with built dists (postext,
postext-pdf) and @napi-rs/canvas installed:

    POSTEXT_REPO=$PWD python3 -m unittest \\
        plugins/postext/skills/postext-port/scripts/tests/test_render_figure_styles.py
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
REPO_ROOT = HERE.parents[4]
FONTS = REPO_ROOT / "apps/web/public/presets/pintura-espanola/fonts"

TEXT = "Año de 1656. Las Meninas, 318 × 276 cm; inventario de 1734, número 1092.\n"


def bundle(root: Path, figure_style: str) -> Path:
    d = root / figure_style
    (d / "chapters").mkdir(parents=True)
    (d / "fonts").mkdir()
    for name in ("EBGaramond-Regular.ttf", "EBGaramond-Italic.ttf"):
        shutil.copy(FONTS / name, d / "fonts" / name)
    (d / "chapters/01.md").write_text(TEXT * 6, encoding="utf-8")
    manifest = {
        "version": 2,
        "id": f"figures-{figure_style}",
        "name": "Figures",
        "locale": "es",
        "configVersion": 21,
        "chapters": [{"title": "", "file": "chapters/01.md"}],
        "fonts": [{"name": "EB Garamond", "variants": [
            {"weight": 400, "style": "normal", "file": "fonts/EBGaramond-Regular.ttf"},
            {"weight": 400, "style": "italic", "file": "fonts/EBGaramond-Italic.ttf"},
        ]}],
        "config": {"bodyText": {"fontFamily": "EB Garamond", "figureStyle": figure_style}},
    }
    (d / "preset.json").write_text(json.dumps(manifest), encoding="utf-8")
    return d


class RenderFigureStyles(unittest.TestCase):
    def test_feature_family_is_the_bundled_face(self):
        repo = os.environ.get("POSTEXT_REPO")
        if not repo:
            self.skipTest("POSTEXT_REPO not set")
        if not (FONTS / "EBGaramond-Regular.ttf").exists():
            self.skipTest("pintura-espanola fonts not in this checkout")
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            pages = {}
            for style in ("oldstyle", "lining"):
                out = root / f"{style}-jpeg"
                run = subprocess.run(
                    ["node", str(HERE / "render.mjs"), str(bundle(root, style)), "--repo", repo,
                     "--jpeg", str(out), "--pages", "#1", "--dpi", "60"],
                    capture_output=True, text=True, timeout=120)
                log = run.stdout + run.stderr
                # (the default heading family, Open Sans, is not bundled here)
                unbundled = [line for line in log.splitlines() if "not bundled" in line]
                self.assertFalse([line for line in unbundled if "Garamond" in line], log[-2000:])
                self.assertNotIn("@onum", log, log[-2000:])
                pages[style] = (out / "page-001.jpg").read_bytes()
            # Old-style and lining figures are other glyphs: the pages differ.
            self.assertNotEqual(pages["oldstyle"], pages["lining"])


if __name__ == "__main__":
    unittest.main()
