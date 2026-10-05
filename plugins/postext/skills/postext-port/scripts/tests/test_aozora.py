"""Tests of aozora.py (the Aozora Bunko → Postext converter).

    python3 -m unittest discover -s plugins/postext/skills/postext-port/scripts/tests

The samples follow the examples of Aozora's 注記一覧 and the texts of こころ
and 坊っちゃん.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import aozora  # noqa: E402

HEAD = "題名\n作者名\n\n-------------------------------------------------------\n【テキスト中に現れる記号について】\n\n《》：ルビ\n-------------------------------------------------------\n\n"
FOOT = "\n\n\n底本：「こころ」集英社文庫、集英社\n　　　1991（平成3）年2月25日第1刷\n初出：「朝日新聞」\n　　　1914（大正3）年4月20日～8月11日\n※誤植の修正は「漱石全集」岩波書店を参照しました。\n入力：j.utiyama\n校正：伊藤時也\n1999年7月31日公開\n2010年10月31日修正\n青空文庫作成ファイル：\nこのファイルは、インターネットの図書館、青空文庫で作られました。\n"


def md(body: str, **kw) -> str:
    """The Markdown of a body (header and footer added), stripped."""
    return aozora.convert(HEAD + body + FOOT, **kw).markdown.strip()


def result(body: str, **kw) -> aozora.Result:
    return aozora.convert(HEAD + body + FOOT, **kw)


class Decoding(unittest.TestCase):
    def test_cp932_and_wave_dash(self):
        raw = ("題\n作者\n\n　一〜二と―― ～\n").replace("〜", "～").encode("cp932")
        text = aozora.read_source(raw)
        self.assertIn("――", text)  # U+2015, not U+2014
        out = aozora.convert(raw).markdown
        self.assertIn("一〜二と―― 〜", out)  # FF5E back to the JIS wave dash U+301C

    def test_header_footer_and_credits(self):
        r = result("　本文。")
        self.assertEqual(r.doc.title, "題名")
        self.assertEqual(r.doc.author, "作者名")
        self.assertEqual(r.markdown.strip(), "本文。")
        c = r.doc.credits
        self.assertEqual(c["fields"]["入力"], ["j.utiyama"])
        self.assertEqual(c["fields"]["底本"], ["「こころ」集英社文庫、集英社\n1991（平成3）年2月25日第1刷"])
        self.assertEqual(c["dates"], ["1999年7月31日公開", "2010年10月31日修正"])
        self.assertTrue(c["raw"].startswith("底本："))
        self.assertIn("青空文庫作成ファイル", c["raw"])
        self.assertEqual(c["notes"], ["誤植の修正は「漱石全集」岩波書店を参照しました。"])


class Ruby(unittest.TestCase):
    def test_implicit_base_is_the_run_of_one_script(self):
        self.assertEqual(md("　私《わたくし》はその人を常に先生と呼んでいた。"), "{私|わたくし}はその人を常に先生と呼んでいた。")
        self.assertEqual(md("　ひとびとの人々《ひとびと》"), "ひとびとの{人々|ひとびと}")
        self.assertEqual(md("　雑司ヶ谷《ぞうしがや》へ"), "{雑司ヶ谷|ぞうしがや}へ")
        self.assertEqual(md("　あのタバコ《たばこ》"), "あの{タバコ|たばこ}")

    def test_iteration_marks_belong_to_the_kanji_base(self):
        # 〻 (U+303B), like 々, repeats the kanji before it: the reading
        # covers both (日〻 is read ひび), not the mark alone.
        self.assertEqual(md("　日〻《ひび》の"), "{日〻|ひび}の")
        self.assertEqual(md("　時々《ときどき》"), "{時々|ときどき}")
        self.assertEqual(md("　〆切《しめきり》"), "{〆切|しめきり}")
        self.assertEqual(md("　八ヶ岳《やつがたけ》"), "{八ヶ岳|やつがたけ}")
        # A run of kanji and marks starts at the change of script.
        self.assertEqual(md("　その日〻《ひび》"), "その{日〻|ひび}")

    def test_explicit_base(self):
        self.assertEqual(md("　先生一人｜麦藁帽《むぎわらぼう》を"), "先生一人{麦藁帽|むぎわらぼう}を")
        self.assertEqual(md("　夕方｜折戸《おりど》の"), "夕方{折戸|おりど}の")

    def test_directive_form_where_compact_cannot_carry_it(self):
        # A base with no kanji or kana: the compact form would stay text.
        self.assertEqual(md("　Ｋ《ケイ》は"), ':ruby[Ｋ]{rt="ケイ" group}は')
        # A reading with spaces would split into one reading per character.
        self.assertEqual(md("　青空《aozora bunko》"), ':ruby[青空]{rt="aozora bunko" group}')
        self.assertEqual(md("　青空《ルビ》", opts=aozora.RenderOptions(ruby="directive")), ':ruby[青空]{rt="ルビ" group}')

    def test_left_ruby_and_notes_as_ruby(self):
        self.assertEqual(md("　青空文庫［＃「青空文庫」の左に「あおぞらぶんこ」のルビ］"), ':ruby[青空文庫]{rt="あおぞらぶんこ" group pos=under}')
        self.assertEqual(md("　大空文庫［＃「大空文庫」に「ママ」の注記］"), "{大空文庫|ママ}")
        self.assertEqual(md("　［＃左に注記付き］銘々［＃左に「めいめい」の注記付き終わり］"), ':ruby[銘々]{rt="めいめい" group pos=under}')

    def test_editorial_ruby(self):
        self.assertEqual(md("　悉《〔ことごと〕》く"), "{悉|ことごと}く")
        self.assertEqual(md("　悉《〔ことごと〕》く", editorial_ruby="drop"), "悉く")
        self.assertEqual(md("　一遍｜丈《〔だけ〕》を", editorial_ruby="drop"), "一遍丈を")

    def test_reading_with_no_base_stays_text(self):
        r = result("　「《ふりがな》」")
        self.assertIn("《ふりがな》", r.markdown)
        self.assertTrue(r.doc.report.unmatched)


class Marks(unittest.TestCase):
    def test_boten_forward_with_ruby_in_the_target(self):
        self.assertEqual(md("　腹がへっても［＃「腹がへっても」に傍点］、"), ":dots[腹がへっても]{style=sesame}、")
        self.assertEqual(md("　独《ひと》り寝《ね》［＃「独り寝」に傍点］"), ":dots[{独|ひと}り{寝|ね}]{style=sesame}")
        # The target starts inside a text run: only its end is marked.
        self.assertEqual(md("　ただうんとか［＃「うん」に傍点］"), "ただうんとか")  # not the text before: unmatched
        self.assertEqual(md("　ただうん［＃「うん」に傍点］とか"), "ただ:dots[うん]{style=sesame}とか")

    def test_boten_kinds_sides_and_block_form(self):
        self.assertEqual(md("　責［＃「責」に白ゴマ傍点］"), ":dots[責]{style=sesame fill=open}")
        self.assertEqual(md("　責［＃「責」に丸傍点］"), ":dots[責]{style=circle fill=filled}")
        self.assertEqual(md("　責［＃「責」の左に白丸傍点］"), ":dots[責]{style=circle fill=open pos=under}")
        self.assertEqual(md("　［＃傍点］青空文庫で読書しよう［＃傍点終わり］。"), ":dots[青空文庫で読書しよう]{style=sesame}。")
        self.assertEqual(md("　［＃左に丸傍点］青空［＃左に丸傍点終わり］"), ":dots[青空]{style=circle fill=filled pos=under}")
        r = result("　責［＃「責」に黒三角傍点］")
        self.assertEqual(r.markdown.strip(), ":dots[責]{style=triangle}")
        self.assertIn("dots style triangle", r.report["gaps"])

    def test_sidelines(self):
        self.assertEqual(md("　傍線［＃「傍線」に傍線］"), ":sideline[傍線]")
        self.assertEqual(md("　責［＃「責」に二重傍線］"), ":sideline[責]{style=double}")
        self.assertEqual(md("　責［＃「責」に鎖線］"), ":sideline[責]{style=dotted}")
        self.assertEqual(md("　責［＃「責」の左に波線］"), ":sideline[責]{style=wavy pos=under}")
        self.assertEqual(md("　［＃破線］青空［＃破線終わり］"), ":sideline[青空]{style=dashed}")

    def test_tcy_bold_scripts(self):
        self.assertEqual(md("　昭和19［＃「19」は縦中横］年"), "昭和:tcy[19]年")
        self.assertEqual(md("　［＃縦中横］!?［＃縦中横終わり］"), ":tcy[!?]")
        self.assertEqual(md("　附記［＃「附記」は太字］"), "**附記**")
        self.assertEqual(md("　m2［＃「2」は上付き小文字］"), "m^2^")
        self.assertEqual(md("　Decne［＃「Decne」は斜体］"), "*Decne*")

    def test_warichu(self):
        self.assertEqual(md("　説と［＃割り注］ヒロソヒイ［＃割り注終わり］政治家"), "説と:warichu[ヒロソヒイ]政治家")
        self.assertEqual(
            md("　被官《ひかん》（［＃割り注］中世の武士［＃割り注終わり］）、下部"),
            '{被官|ひかん}:warichu[中世の武士]{open="（" close="）"}、下部',
        )
        r = result("　大字飛鳥［＃割り注］東は字大林［＃改行］西は字神内［＃割り注終わり］")
        self.assertEqual(r.markdown.strip(), "大字飛鳥:warichu[東は字大林　西は字神内]")
        self.assertTrue(any("warichu" in g for g in r.report["gaps"]))

    def test_kunten(self):
        self.assertEqual(
            md("自［＃二］女王國［＃一］東度［＃レ］海千餘里。"),
            ':::paragraphs{style="aozora-f0"}\n\n:kunten[自]{kaeri="二"}女王:kunten[國]{kaeri="一"}東:kunten[度]{kaeri="レ"}海千餘里。\n\n:::',
        )
        self.assertIn(':kunten[噛]{kaeri="二" okuri="テ"}古人', md("噛［＃（テ）］［＃二］古人"))
        # A 竪点 before the note joins the character to the next one.
        self.assertIn('而:kunten[敬]{tate kaeri="二"}祭', md("而敬‐［＃二］祭天神地祇［＃一］。"))
        self.assertIn(':kunten[敬]{tate kaeri="二" okuri="テ"}祭', md("敬［＃（テ）］‐［＃二］祭天［＃一］"))
        # One between two kanji that no note follows, on a line of kanbun.
        self.assertIn(':kunten[讀]{tate}:kunten[書]{kaeri="レ"}', md("讀‐書［＃レ］之"))
        # Elsewhere a hyphen stays text.
        self.assertIn("ジャン‐ポール", md("ジャン‐ポール"))
        self.assertIn("大‐小", md("大‐小"))
        self.assertIn(
            ':kunten[:ruby[未]{rt="ザル" group pos=under}]{kaeri="レ" okuri="ダ"}若',
            md("未［＃「未」の左に「ザル」のルビ］［＃（ダ）］［＃レ］若"),
        )
        self.assertIn(':kunten[所]{kaeri="一レ"}敬', md("見［＃二］大人所［＃一レ］敬。"))


class Characters(unittest.TestCase):
    def test_gaiji(self):
        r = result("　若い柔らかい葉を※［＃「てへん＋劣」、第3水準1-84-77］《も》ぎ取って")
        self.assertEqual(r.markdown.strip(), "若い柔らかい葉を{挘|も}ぎ取って")
        self.assertEqual(r.doc.report.gaiji[0]["char"], "挘")
        self.assertEqual(md("　※［＃「口＋世」、U+546D、135-7］"), "呭")
        self.assertEqual(md("　※［＃二の字点、1-2-22］"), "〻")
        r = result("　※［＃「土へん＋竒」、135-7］")
        self.assertEqual(r.markdown.strip(), "〓")
        self.assertEqual(r.report["unresolvedGaiji"][0]["note"], "「土へん＋竒」、135-7")

    def test_reserved_characters_written_as_gaiji_stay_text(self):
        self.assertEqual(md("　※［＃始め二重山括弧、1-1-52］本※［＃終わり二重山括弧、1-1-53］"), "《本》")
        self.assertEqual(md("　※［＃縦線、1-1-35］"), "｜")

    def test_kunojiten_accents_halfwidth(self):
        self.assertEqual(md("　とう／＼その"), "とう〳〵その")
        self.assertEqual(md("　しみ／″＼と"), "しみ〴〵と")
        self.assertEqual(md("　〔E'tude〕の"), "Étudeの")
        self.assertEqual(md("　〔Franc,ais〕"), "Français")
        self.assertEqual(md("　〔ABC〕"), "〔ABC〕")  # no accent sign: the brackets are the text's
        self.assertEqual(md("　ｶﾞｷﾞ"), "ガギ")
        self.assertEqual(md("　Ｋは"), "Ｋは")  # full-width Latin stays full width

    def test_escaping(self):
        self.assertEqual(md("　a*b_c^d~e$f`g"), "a\\*b\\_c\\^d\\~e\\$f\\`g")
        self.assertEqual(md("　{x|y}"), "{⁠x|y}")
        self.assertEqual(md("　see:ruby[x]"), "see:⁠ruby[x]")
        self.assertEqual(md("１. 一"), ':::paragraphs{style="aozora-f0"}\n\n１. 一\n\n:::')
        self.assertEqual(md("　# 見出しではない"), "⁠# 見出しではない")


class Blocks(unittest.TestCase):
    def test_headings(self):
        out = md("［＃２字下げ］上　先生と私［＃「上　先生と私」は大見出し］\n\n\n［＃５字下げ］一［＃「一」は中見出し］\n\n　私は")
        self.assertEqual(out, '# 上　先生と私 {indent="2"}\n\n## 一 {indent="5"}\n\n私は')
        self.assertEqual(md("独《ひと》り寝《ね》の別《わか》れ［＃「独り寝の別れ」は大見出し］"), "# {独|ひと}り{寝|ね}の{別|わか}れ")
        self.assertEqual(md("［＃中見出し］亜細亜《アジア》の曙《あけぼの》［＃中見出し終わり］"), "## {亜細亜|アジア}の{曙|あけぼの}")
        self.assertEqual(md("［＃ここから大見出し］\n第一部\n春\n［＃ここで大見出し終わり］"), "# 第一部　春")
        out = md("［＃５字下げ］一［＃「一」は中見出し］", opts=aozora.RenderOptions(heading_levels={"大": 2, "中": 3, "小": 4}))
        self.assertEqual(out, '### 一 {indent="5"}')
        r = result("龍王岬［＃「龍王岬」は窓中見出し］　峨々たる岩岬")
        self.assertEqual(r.markdown.strip(), '## 龍王岬 {kind="window"}\n\n峨々たる岩岬')

    def test_paragraph_leads(self):
        self.assertEqual(md("　私は。\n「先生」\nと私は言った。"), '私は。\n\n「先生」\n\n:::paragraphs{style="aozora-f0"}\n\nと私は言った。\n\n:::')
        self.assertEqual(md("　　　（住所）"), ':::paragraphs{style="aozora-f3"}\n\n（住所）\n\n:::')
        r = result("　私は。\n「先生」\nと私は言った。\n　　「二字」")
        counts = r.doc.report.counts
        self.assertEqual((counts["lead:indent"], counts["lead:bracket"], counts["lead:flush"], counts["lead:indent+bracket"]), (1, 1, 1, 1))

    def test_indent_blocks(self):
        out = md("　前。\n［＃ここから２字下げ］\n大正三年九月\n　追記\n［＃ここで字下げ終わり］\n　後。")
        self.assertEqual(
            out,
            '前。\n\n:::paragraphs{style="aozora-i2-f0"}\n\n大正三年九月\n\n:::\n\n:::paragraphs{style="aozora-i2-f1"}\n\n追記\n\n:::\n\n後。',
        )
        out = md("［＃ここから改行天付き、折り返して１字下げ］\n一　余死せば\n一　此金を\n［＃ここで字下げ終わり］")
        self.assertEqual(out, ':::paragraphs{style="aozora-h1"}\n\n一　余死せば\n\n一　此金を\n\n:::')
        out = md("［＃ここから２字下げ、折り返して３字下げ］\n一、托児所は\n［＃ここで字下げ終わり］")
        self.assertEqual(out, ':::paragraphs{style="aozora-i2-h1"}\n\n一、托児所は\n\n:::')
        self.assertEqual(md("［＃３字下げ］灰いろの抽象の世"), ':::paragraphs{style="aozora-i3-f0"}\n\n灰いろの抽象の世\n\n:::')

    def test_end_alignment(self):
        self.assertEqual(md("［＃地付き］（この日記終り）"), ':::paragraphs{style="aozora-end"}\n\n（この日記終り）\n\n:::')
        r = result("［＃地から２字上げ］長谷川辰之助")
        self.assertEqual(r.markdown.strip(), ':::paragraphs{style="aozora-end2"}\n\n長谷川辰之助\n\n:::')
        self.assertEqual(r.styles, [{
            "id": "aozora-end2", "name": "Aozora 地から2字上げ", "textAlign": "end",
            "firstLineIndent": {"value": 0, "unit": "em"}, "endIndent": {"value": 2, "unit": "em"},
        }])
        self.assertEqual(r.style_gaps, [])
        out = md("　二人は風呂へはいった。［＃地付き］（『十番随筆』所収）")
        self.assertEqual(out, '二人は風呂へはいった。\n\n:::paragraphs{style="aozora-end"}\n\n（『十番随筆』所収）\n\n:::')
        out = md("［＃ここから地付き］\n（一）\n（二）\n［＃ここで地付き終わり］")
        self.assertEqual(out, ':::paragraphs{style="aozora-end"}\n\n（一）\n\n（二）\n\n:::')

    def test_raised_end_blocks_take_an_end_indent(self):
        # ここから地からN字上げ: the block's lines end N body ems short of
        # the line end, through the style's endIndent; nothing is a gap.
        r = result("［＃ここから地から３字上げ］\n明治四十年\n夏目金之助\n［＃ここで字上げ終わり］\n　本文。")
        self.assertEqual(r.markdown.strip(), ':::paragraphs{style="aozora-end3"}\n\n明治四十年\n\n夏目金之助\n\n:::\n\n本文。')
        self.assertEqual(r.styles, [{
            "id": "aozora-end3", "name": "Aozora 地から3字上げ", "textAlign": "end",
            "firstLineIndent": {"value": 0, "unit": "em"}, "endIndent": {"value": 3, "unit": "em"},
        }])
        self.assertEqual(r.style_gaps, [])
        self.assertEqual(r.report["gaps"], {})
        # The one-line form says the same with a full-width digit.
        r = result("［＃地から１字上げ］（明治四十年）")
        self.assertEqual(r.styles[0]["endIndent"], {"value": 1, "unit": "em"})
        self.assertEqual(r.report["gaps"], {})

    def test_breaks_blank_lines_and_editorial_notes(self):
        out = md("　一。\n［＃改ページ］\n　二。\n［＃改丁］\n　三。\n［＃改見開き］\n［＃改段］\n　四。\n\n　五。")
        self.assertEqual(out, '一。\n\n:::pagebreak\n\n二。\n\n:::pagebreak{parity="odd"}\n\n三。\n\n:::pagebreak{parity="even"}\n\n:::columnbreak\n\n四。\n\n:::space{lines=1}\n\n五。')
        self.assertEqual(md("　一。\n\n　二。", opts=aozora.RenderOptions(blank_lines="drop")), "一。\n\n二。")
        r = result("　私に［＃「私に」は底本では「私は」］話した。後始末は［＃「後始末は」はママ］")
        self.assertEqual(r.markdown.strip(), "私に話した。後始末は")
        self.assertEqual([e["kind"] for e in r.doc.editorial], ["teihon", "mama"])
        self.assertEqual(r.doc.editorial[0]["teihon"], "私は")

    def test_unknown_notes_are_reported(self):
        r = result("　本文［＃何かの注記］です。")
        self.assertEqual(r.markdown.strip(), "本文です。")
        self.assertEqual(r.report["unknownAnnotations"], [{"line": 10, "note": "何かの注記"}])

    def test_images_and_captions(self):
        out = result("［＃石鏃二つの図（fig42154_01.png、横321×縦123）入る］\n［＃ここからキャプション］石鏃［＃ここでキャプション終わり］")
        b = [x for x in out.doc.blocks if x.kind == "image"][0]
        self.assertEqual((b.file, b.width, b.height, b.alt), ("fig42154_01.png", 321, 123, "石鏃二つの図"))
        self.assertEqual(out.markdown.strip(), '::resource{id="fig42154_01"}')

    def test_style_configs(self):
        cfg, gaps = aozora.style_config("aozora-i2-h1")
        self.assertEqual(cfg["indent"], {"value": 2, "unit": "em"})
        self.assertEqual(cfg["hangingIndent"], {"value": 1, "unit": "em"})
        self.assertNotIn("firstLineIndent", cfg)
        self.assertEqual(gaps, [])
        cfg, _ = aozora.style_config("aozora-f0")
        self.assertEqual(cfg, {"id": "aozora-f0", "name": "Aozora 天付き", "firstLineIndent": {"value": 0, "unit": "em"}})


if __name__ == "__main__":
    unittest.main()
