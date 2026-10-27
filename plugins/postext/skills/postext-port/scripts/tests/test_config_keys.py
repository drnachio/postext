"""The lint's list of config keys follows the engine (#1125).

`config_keys.json` is generated from `PostextConfig` in the engine's
types/config.ts (`config_keys.py --write`). This test fails while the engine has a
key the list lacks, so a release that adds a setting cannot leave the lint
calling it unknown.

    python3 -m pytest plugins/postext/skills/postext-port/scripts/tests -q
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SCRIPTS))
import config_keys as ck  # noqa: E402
import lint_project as lp  # noqa: E402


@unittest.skipUnless(ck.DEFAULT_TYPES.is_file(), "needs the Postext checkout (packages/postext/src/types/config.ts)")
class FollowsTheEngine(unittest.TestCase):
    def test_every_engine_key_is_known_to_the_lint(self):
        missing = [k for k in ck.engine_keys() if k not in lp.CONFIG_TOP_KEYS]
        self.assertEqual(missing, [], "run `python3 scripts/config_keys.py --write` in the checkout")

    def test_composed_page_keys_lint_clean(self):
        for key in ("frameLooks", "composedViewerLeaf", "pageTemplates"):
            self.assertIn(key, lp.CONFIG_TOP_KEYS)


class Parser(unittest.TestCase):
    def test_reads_the_interface_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            f = Path(tmp) / "types.ts"
            f.write_text("export interface Other {\n  nope: string;\n}\n"
                         "export interface PostextConfig {\n  /** doc */\n  page?: PageConfig;\n"
                         "  frameLooks?: FrameLookEntry[];\n    nested: number;\n}\n"
                         "export interface After {\n  later: string;\n}\n", encoding="utf-8")
            self.assertEqual(ck.engine_keys(f), ["page", "frameLooks"])

    def test_lint_reports_a_misspelt_key_and_not_frame_looks(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "chapters").mkdir()
            (root / "chapters" / "01.md").write_text("# One\n\nText.\n", encoding="utf-8")
            (root / "preset.json").write_text(json.dumps({
                "version": 2, "configVersion": 16, "id": "t", "name": "T", "locale": "en",
                "config": {"frameLooks": [], "composedViewerLeaf": {}, "bodyTex": {}},
                "chapters": {"en": [{"title": "One", "file": "chapters/01.md"}]}}), encoding="utf-8")
            out = subprocess.run([sys.executable, str(SCRIPTS / "lint_project.py"), str(root)],
                                 capture_output=True, text=True).stdout
            self.assertIn("config.bodyTex is not a Postext setting", out)
            self.assertNotIn("frameLooks is not", out)
            self.assertNotIn("composedViewerLeaf is not", out)


if __name__ == "__main__":
    unittest.main()
