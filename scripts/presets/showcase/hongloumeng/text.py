#!/usr/bin/env python3
"""Normalise the downloaded texts (see fetch.py) into `source/chapters.json`,
the intermediate that build.py lays out:

- `zh-Hant`: 《紅樓夢（程乙本）》 from zh.wikisource, 120 回, cleaned: `－－` → `——`,
  the known conversion slips of that transcription fixed (a curated list plus
  the 系/係/繫, 干/乾/幹 and 云/雲 cases that the 1791 程甲本 decides), the
  paragraph indent dropped (indent is a style), verse found and broken into
  lines, the 十二支曲 titles of chapter 5 marked, the closing formula split off;
- `zh-Hans`: the same text through OpenCC `tw2s` (the base follows the Taiwan
  standard: `tw2s` turns the aspect particle 著 into 着 and keeps 著作),
  with 「」→“” and 『』→‘’ for horizontal setting (GB/T 15834-2011);
- `en`: H. Bencraft Joly's translation (chapters 1–56, all he published),
  verse kept as lines, the Gutenberg errata and notes removed, straight
  quotes curled and the romanisation made consistent with a name dictionary
  built from the text itself (Pao-yue → Pao-yü only where Pao-yü occurs).

    <venv>/bin/python scripts/presets/showcase/hongloumeng/text.py [--qa]

Needs OpenCC (`pip install opencc`, 1.1+). `--qa` also writes
`source/qa/` reports: the orthography candidates from the 程甲本 alignment,
unbalanced quotes, verse decisions and the name dictionary.
"""
from __future__ import annotations

import collections
import difflib
import html
import json
import os
import re
import sys
import unicodedata

import opencc

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, "source")
WS = os.path.join(SOURCE, "wikisource")
QA_DIR = os.path.join(SOURCE, "qa")
OUT = os.path.join(SOURCE, "chapters.json")

T2S = opencc.OpenCC("t2s")
TW2S = opencc.OpenCC("tw2s")

HAN = re.compile(r"[㐀-䶿一-鿿豈-﫿\U00020000-\U0003134f]")
CLAUSE_PUNCT = "，。？！；、："
SENTENCE_END = "。？！；"
CLOSERS = "」』）》〉…—"
OPENERS = "「『（《〈"

QA: dict[str, list] = collections.defaultdict(list)


def is_han(ch: str) -> bool:
    return bool(HAN.match(ch))


def han_count(s: str) -> int:
    return sum(1 for ch in s if is_han(ch))


# --- Chinese numerals ---------------------------------------------------------------

CN_DIGITS = {"〇": 0, "○": 0, "零": 0, "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}


def cn_number(s: str) -> int:
    """第一百十一回 → 111; also the positional form 第一○一回 → 101."""
    s = s.strip("第回 　")
    if "十" not in s and "百" not in s:
        return int("".join(str(CN_DIGITS[ch]) for ch in s))
    total, num = 0, 0
    for ch in s:
        if ch in CN_DIGITS:
            num = CN_DIGITS[ch]
        elif ch == "十":
            total += (num or 1) * 10
            num = 0
        elif ch == "百":
            total += (num or 1) * 100
            num = 0
        else:
            raise ValueError(s)
    return total + num


# --- wikitext -------------------------------------------------------------------------


def unwrap_templates(s: str) -> str:
    """Resolve the few templates the Wikisource texts use, innermost first."""
    for _ in range(6):
        before = s
        s = re.sub(r"\{\{僻字\|([^|{}]*)\|[^{}]*\}\}", r"\1", s)
        s = re.sub(r"\{\{(?:~~|center|larger|smaller|big|small)\|([^{}]*)\}\}", r"\1", s)
        s = re.sub(r"\{\{[^{}]*\}\}", "", s)
        if s == before:
            break
    return s


def clean_inline(s: str) -> str:
    s = re.sub(r"<ref[^>/]*/>", "", s)
    s = re.sub(r"<ref[^>]*>.*?</ref>", "", s, flags=re.S)
    s = re.sub(r"<section[^>]*/>", "", s)
    s = re.sub(r"-\{([^{}]*)\}-", r"\1", s)
    s = unwrap_templates(s)
    s = re.sub(r"'''?", "", s)
    s = re.sub(r"\[\[[^\]|]*\|([^\]]*)\]\]", r"\1", s)
    s = re.sub(r"\[\[[^\]]*\]\]", "", s)
    s = re.sub(r"<[^>]+>", "", s)
    return html.unescape(s)


# --- 程乙本 -------------------------------------------------------------------------------

HEADING = re.compile(r"^==\s*(第[^回=]+?回)[ 　]*(.*?)\s*==\s*$", re.M)


def read_chengyi() -> dict[int, dict]:
    chapters: dict[int, dict] = {}
    for name in sorted(os.listdir(os.path.join(WS, "chengyi"))):
        text = open(os.path.join(WS, "chengyi", name), encoding="utf-8").read()
        heads = list(HEADING.finditer(text))
        for i, m in enumerate(heads):
            n = cn_number(m.group(1))
            body = text[m.end() : heads[i + 1].start() if i + 1 < len(heads) else len(text)]
            paras = []
            for line in body.split("\n"):
                line = line.strip(" \t　")
                if not line or line.startswith("{{") or line.startswith("[[") or line.startswith("__"):
                    continue
                line = clean_inline(line).strip(" \t　")
                if line:
                    paras.append(line)
            title = re.sub(r"[ 　]+", "　", m.group(2).strip())
            if n in chapters:
                # A volume page repeats the last 回 of the one before
                # (第一○○回 opens 第一百零一回 至第一百一十回): keep the fuller copy.
                QA["duplicates"].append({"n": n, "kept": "longer", "sizes": [len("".join(chapters[n]["paras"])), len("".join(paras))]})
                if len("".join(paras)) <= len("".join(chapters[n]["paras"])):
                    continue
            chapters[n] = {"title": title, "paras": paras}
    missing = [n for n in range(1, 121) if n not in chapters]
    if missing:
        raise SystemExit(f"程乙本: chapters missing: {missing}")
    return chapters


# --- 程甲本 (spelling oracle, verse blocks) ---------------------------------------------------


def read_chengjia(n: int) -> tuple[str, list[list[str]]] | None:
    path = os.path.join(WS, "chengjia", f"{n:03d}.html")
    if not os.path.exists(path):
        return None
    t = open(path, encoding="utf-8").read()
    t = re.sub(r"<style[^>]*>.*?</style>", "", t, flags=re.S)
    t = re.sub(r'<span class="variant-tooltip">.*?</span>', "", t, flags=re.S)
    t = re.sub(r'<span class="pagenum[^"]*"[^>]*>.*?</span></span>', "", t, flags=re.S)
    # 「應校正為「X」」 corrections: take the corrected reading.
    t = re.sub(r'<span [^>]*title="應校正為「([^」"]*)」"[^>]*>[^<]*</span>', r"\1", t)
    start = t.find('class="prp-pages-output"')
    if start >= 0:
        t = t[start:]
    poems = []
    for m in re.finditer(r'<div class="poem">(.*?)</div>', t, flags=re.S):
        lines = [l.strip(" \t　​") for l in re.sub(r"<br\s*/?>|</p>", "\n", m.group(1)).split("\n")]
        lines = [html.unescape(re.sub(r"<[^>]+>", "", l)).strip(" \t　​") for l in lines]
        lines = [l for l in lines if l]
        if lines:
            poems.append(lines)
    plain = html.unescape(re.sub(r"<[^>]+>", "", t)).replace("​", "")
    return plain, poems


def read_main_poems(n: int) -> list[list[str]]:
    path = os.path.join(WS, "main", f"{n:03d}.wikitext")
    if not os.path.exists(path):
        return []
    t = open(path, encoding="utf-8").read()
    poems = []
    for m in re.finditer(r"<poem>(.*?)</poem>", t, flags=re.S):
        lines = [clean_inline(l).strip(" \t　") for l in m.group(1).split("\n")]
        lines = [l for l in lines if l]
        if lines:
            poems.append(lines)
    return poems


# --- normalisation -------------------------------------------------------------------------

# (pattern, replacement, expected count). The Wikisource 程乙本 was converted
# from a Simplified text; these are the conversion slips the script cannot
# decide from the 程甲本 alignment alone (research-sources.md §1.2–1.3) plus the
# broken characters. A count that no longer matches is reported, not fatal:
# the Wikisource page is still being corrected.
FIXES: list[tuple[str, str, int | None]] = [
    ("－－", "——", None),
    ("——─", "——", 1),
    ("唏<溜", "唏溜", 1),
    ("寬巨集量", "寬宏量", 1),
    ("空雲似桂", "空云似桂", 1),
    ("休雲", "休云", 2),
    ("古人曾雲", "古人曾云", 1),
    ("水涸泥幹", "水涸泥乾", 1),
    ("眼淚不幹", "眼淚不乾", 1),
    ("雅制春燈謎", "雅製春燈謎", 1),
    ("疤𨋢", "疤瘌", 1),
    # The 1791 程甲本 reads 𠞆 (U+20786, ⿰烏刂: to prune) where this
    # transcription typed the IDS; the fonts get the glyph (fonts.py).
    ("⿰烏刂樹", "\U00020786樹", 1),
    # A stray low double prime closing a quotation that opened with 「.
    ("『倒脫靴勢』。〞", "『倒脫靴勢』。」", 1),
    # 干係 (a responsibility) and a verb 繫 the Simplified source wrote 系/係.
    ("兩府幹系", "兩府干係", 1),
    ("給我係著", "給我繫著", 1),
    ("幹淨", "乾淨", 1),
    ("雲空未必空", "云空未必空", 1),
    ("說酒底道：榛子非關", "說酒底道：「榛子非關", 1),
    ("因叫：〔拿一個盤兒來", "因叫：「拿一個盤兒來", 1),
    ("叫：〔寶玉、環兒、蘭兒", "叫：「寶玉、環兒、蘭兒", 1),
    ("自幹罪戾", "自干罪戾", 1),
    ("個幹兄弟", "個乾兄弟", 1),
    ("飲幹，將杯", "飲乾，將杯", 1),
    ("你乾的好事啊", "你幹的好事啊", 1),
    # Names and a clock the conversion spelt as common words.
    ("秦鐘", "秦鍾", None),
    ("湘云", "湘雲", None),
    ("素云", "素雲", None),
    ("時辰鍾", "時辰鐘", None),
    ("下鍾了", "下鐘了", None),
    ("鍾打過", "鐘打過", None),
]

# 系 in this transcription stands for 係 (copula) or 繫 (to tie): the
# Simplified source merged them. 繫 is chosen by the object tied or the verb
# before it; the 程甲本 alignment (below) decides first where it can.
TIE_AFTER = ("一條", "一根", "著", "在", "褲", "小衣", "的", "上", "子", "住", "腰", "帶", "飄")
TIE_BEFORE = ("腰下", "綰", "軟", "將", "沒有", "常", "自己", "解", "替他", "給他")
TRUE_XI = ("世系", "派系", "系統")

ASCII_PARENS = {"(": "（", ")": "）"}
ASCII_PUNCT = {",": "，", ";": "；", ".": "。"}


def normalise_hant(n: int, paras: list[str], counts: collections.Counter) -> list[str]:
    out = []
    for p in paras:
        for pat, rep, _ in FIXES:
            if pat in p:
                counts[pat] += p.count(pat)
                p = p.replace(pat, rep)
        p = re.sub(r"[()]", lambda m: ASCII_PARENS[m.group(0)], p)
        # Stray ASCII spaces and punctuation typed into the Chinese text.
        p = re.sub(r"(?<=[^\x00-\x7f]) +| +(?=[^\x00-\x7f])", "", p)
        p = re.sub(r"(?<=[^\x00-\x7f])[,;.]", lambda m: ASCII_PUNCT[m.group(0)], p)
        out.append(p)
    return out


SPEECH_COLON = re.compile(r"[道說問云曰叫嘆罵喊答]：")


def repair_quotes(n: int, p: str) -> str:
    """Mend the corner quotes of one paragraph where the transcription slipped:
    a closing mark with nothing open after a speech colon becomes an opening
    one (「道：」你…」 → 「道：「你…」」), a closing mark of the wrong kind
    takes the kind that is open (『紅綠」 → 『紅綠』), and a closing mark with
    nothing open elsewhere gets its opening mark after the nearest speech
    colon (「道：沒見他們進來。」」 → 「道：「沒見他們進來。」」)."""
    chars = list(p)
    stack: list[str] = []
    i = 0
    while i < len(chars):
        ch = chars[i]
        if ch in "「『":
            stack.append(ch)
        elif ch in "」』":
            want = "「" if ch == "」" else "『"
            if stack and stack[-1] == want:
                stack.pop()
            elif ch == "」" and stack and stack[-1] == "『" and "「" in stack and chars[i + 1 :].count("」") <= chars[i + 1 :].count("「"):
                # The inner quotation was never closed and nothing later closes the
                # outer one: close both here.
                QA["quote_repairs"].append({"chapter": n, "was": "".join(chars[max(0, i - 12) : i + 3]), "mark": "insert 』"})
                chars.insert(i, "』")
                i += 1
                stack.pop()
                stack.pop()
            elif stack:
                fixed = "」" if stack[-1] == "「" else "』"
                QA["quote_repairs"].append({"chapter": n, "was": "".join(chars[max(0, i - 12) : i + 3]), "mark": fixed})
                chars[i] = fixed
                stack.pop()
            elif i > 0 and chars[i - 1] == "：" and i + 1 < len(chars) and is_han(chars[i + 1]):
                QA["quote_repairs"].append({"chapter": n, "was": "".join(chars[max(0, i - 12) : i + 3]), "mark": want})
                chars[i] = want
                stack.append(want)
            else:
                head = "".join(chars[max(0, i - 60) : i])
                m = None
                for m in SPEECH_COLON.finditer(head):
                    pass
                if m and not re.search(r"[「」『』]", head[m.end() :]):
                    at = i - len(head) + m.end()
                    QA["quote_repairs"].append({"chapter": n, "was": "".join(chars[at - 3 : i + 1]), "mark": "insert " + want})
                    chars.insert(at, want)
                    i += 1
                else:
                    QA["quote_unmatched"].append({"chapter": n, "text": "".join(chars[max(0, i - 20) : i + 3])})
        i += 1
    return "".join(chars)


def fix_xi(p: str) -> str:
    """系 → 繫 where something is tied, else 係 (see TIE_AFTER / TIE_BEFORE)."""
    out = []
    for i, ch in enumerate(p):
        if ch != "系":
            out.append(ch)
        elif any(p[max(0, i - 1) : i + 1] == w or p[i : i + 2] == w for w in TRUE_XI):
            out.append("系")
        elif p.startswith(TIE_AFTER, i + 1) or any(p[max(0, i - len(w)) : i] == w for w in TIE_BEFORE):
            out.append("繫")
        else:
            out.append("係")
    return "".join(out)


# --- orthography check against the 程甲本 -------------------------------------------------------

# One Simplified character, several Traditional ones with different meanings.
# Members inside one string are spelling variants of each other (裡/裏).
AMBIGUOUS = [
    ["系", "係", "繫"],
    ["干", "乾", "幹"],
    ["云", "雲"],
    ["制", "製"],
    ["發", "髮"],
    ["面", "麵"],
    ["余", "餘"],
    ["后", "後"],
    ["鐘", "鍾"],
    ["了", "瞭"],
    ["只", "隻"],
    ["台", "臺", "檯"],
    ["松", "鬆"],
    ["鬥", "斗"],
    ["谷", "穀"],
    ["里", "裡裏"],
    ["表", "錶"],
    ["准", "準"],
    ["吊", "弔"],
    ["于", "於"],
    ["范", "範"],
    ["舍", "捨"],
    ["游", "遊"],
    ["蒙", "濛矇懞"],
    ["胡", "鬍"],
    ["須", "鬚"],
    ["沖", "衝"],
    ["盡", "儘"],
    ["並", "併"],
    ["仆", "僕"],
    ["回", "迴"],
    ["托", "託"],
    ["折", "摺"],
    ["布", "佈"],
    ["郁", "鬱"],
    ["采", "採"],
    ["征", "徵"],
    ["症", "癥"],
    ["志", "誌"],
    ["注", "註"],
    ["咸", "鹹"],
    ["曲", "麴"],
    ["朴", "樸"],
    ["家", "傢"],
    ["夥", "伙"],
    ["借", "藉"],
    ["穫", "獲"],
    ["嘗", "嚐"],
    ["洒", "灑"],
    ["凶", "兇"],
    ["秋", "鞦"],
    ["千", "韆"],
    ["向", "嚮"],
    ["簽", "籤"],
    ["臟", "髒"],
]
MEMBER: dict[str, tuple[int, int]] = {}
for gi, group in enumerate(AMBIGUOUS):
    for mi, member in enumerate(group):
        for ch in member:
            MEMBER[ch] = (gi, mi)

# (程乙本, 程甲本) pairs the alignment corrects: the Simplified source merged
# them and the 1791 print, where it has the same neighbours, is a reliable
# witness. Pairs where the 1791 print itself uses an old or loose form
# (乾淨 as 干淨, 臺 as 台, 於 as 于, 托/託, 准/準…) are only reported.
AUTO_PAIRS = {
    ("系", "係"), ("系", "繫"), ("繫", "係"),
    ("幹", "乾"), ("幹", "干"), ("乾", "幹"), ("干", "乾"),
    ("云", "雲"), ("雲", "云"),
    ("制", "製"), ("后", "後"), ("發", "髮"), ("髮", "發"), ("面", "麵"), ("麵", "面"),
    ("隻", "只"), ("松", "鬆"), ("谷", "穀"), ("須", "鬚"), ("餘", "余"), ("鐘", "鍾"),
    ("游", "遊"), ("舍", "捨"), ("采", "採"), ("志", "誌"), ("鬥", "斗"), ("範", "范"),
    ("鹹", "咸"), ("折", "摺"),
}
# A correction is dropped when the corrected text shows one of these (the
# 1791 reading is itself the slip there).
WITNESS_REJECT = ("乾罪", "書雲")

_t2s_cache: dict[str, str] = {}


def fold(ch: str) -> str:
    """A character folded for alignment (Simplified form, 程甲本 variants)."""
    r = _t2s_cache.get(ch)
    if r is None:
        c = T2S.convert(ch)
        r = c if len(c) == 1 else ch
        _t2s_cache[ch] = r
    return r


def han_index(s: str) -> tuple[str, list[int]]:
    chars, idx = [], []
    for i, ch in enumerate(s):
        if is_han(ch):
            chars.append(fold(ch))
            idx.append(i)
    return "".join(chars), idx


def orthography_candidates(n: int, paras: list[str], witness: str) -> dict[tuple[int, int], str]:
    """Positions (paragraph, offset) where 程乙本 has one member of an
    ambiguous group and the aligned 程甲本 character another member, with the
    same folded neighbours on both sides. Returns the proposed character."""
    w_raw = [ch for ch in witness if is_han(ch)]
    w_fold = "".join(fold(ch) for ch in w_raw)
    a_chars: list[str] = []
    a_pos: list[tuple[int, int]] = []
    for pi, p in enumerate(paras):
        for i, ch in enumerate(p):
            if is_han(ch):
                a_chars.append(ch)
                a_pos.append((pi, i))
    a_fold = "".join(fold(ch) for ch in a_chars)
    sm = difflib.SequenceMatcher(None, a_fold, w_fold, autojunk=False)
    out: dict[tuple[int, int], str] = {}
    for blk in sm.get_matching_blocks():
        for k in range(blk.size):
            ai, wi = blk.a + k, blk.b + k
            a, w = a_chars[ai], w_raw[wi]
            if a == w or a not in MEMBER or w not in MEMBER:
                continue
            (ga, ma), (gw, mw) = MEMBER[a], MEMBER[w]
            if ga != gw or ma == mw:
                continue
            # Same neighbours (the matching block already guarantees that the
            # folded characters agree; require one on each side).
            if k == 0 or k == blk.size - 1:
                continue
            pi, i = a_pos[ai]
            p = paras[pi]
            target = AMBIGUOUS[gw][mw][0]  # 程乙本's spelling of the witness's member
            window = p[max(0, i - 1) : i] + target + p[i + 1 : i + 2]
            applied = (a, w) in AUTO_PAIRS and not any(r in window for r in WITNESS_REJECT)
            QA["orthography"].append({"chapter": n, "chengyi": a, "chengjia": w, "context": p[max(0, i - 6) : i + 7], "applied": applied})
            if applied:
                out[(pi, i)] = target
    return out


def apply_positions(paras: list[str], fixes: dict[tuple[int, int], str]) -> list[str]:
    out = []
    for pi, p in enumerate(paras):
        chars = list(p)
        for (qi, i), ch in fixes.items():
            if qi == pi:
                chars[i] = ch
        out.append("".join(chars))
    return out


# --- verse ---------------------------------------------------------------------------------------


CLAUSE = re.compile(r"[^，。？！；、：]+[，。？！；、：]*[」』）]*")


def split_verse_lines(text: str) -> list[str]:
    """A poem's lines. Regular verse (every clause five or seven characters)
    gets one couplet per line; a 詞, 曲 or 賦 breaks after each sentence-final
    mark. A riddle's answer hint (「——打一物」) stays a line of its own."""
    hint = ""
    m = re.search(r"——[^——]{1,12}$", text)
    if m and han_count(text[: m.start()]) >= 10:
        text, hint = text[: m.start()], m.group(0)
    clauses = [c.strip() for c in CLAUSE.findall(text) if c.strip()]
    lengths = {han_count(c) for c in clauses}
    lines: list[str] = []
    if len(clauses) >= 2 and len(clauses) % 2 == 0 and all(3 <= n <= 7 for n in lengths):
        for i in range(0, len(clauses), 2):
            lines.append("".join(clauses[i : i + 2]))
    else:
        cur = ""
        i = 0
        while i < len(text):
            cur += text[i]
            if text[i] in SENTENCE_END:
                while i + 1 < len(text) and text[i + 1] in "」』）":
                    i += 1
                    cur += text[i]
                lines.append(cur.strip())
                cur = ""
            i += 1
        if cur.strip():
            lines.append(cur.strip())
    if hint:
        lines.append(hint)
    return [l for l in lines if l]


def quote_depth(s: str) -> int:
    d = 0
    for ch in s:
        if ch in "「『":
            d += 1
        elif ch in "」』":
            d = max(0, d - 1)
    return d


def regular_verse(p: str) -> bool:
    """Standalone regular verse: every clause 5 or 7 characters, at least two
    clauses, only Han characters and clause punctuation."""
    if any(not (is_han(ch) or ch in CLAUSE_PUNCT) for ch in p):
        return False
    clauses = [c for c in re.split(f"[{CLAUSE_PUNCT}]", p) if c]
    if len(clauses) < 2 or len(clauses) % 2:
        return False
    lengths = {len(c) for c in clauses}
    return lengths in ({5}, {7})


def find_verse(n: int, paras: list[str], poems: list[list[str]]) -> list[dict]:
    """Paragraph kinds for one chapter. Poem blocks of the 程甲本 and the main
    edition are located in the 程乙本 paragraphs by fuzzy matching; a match
    that fills a paragraph makes it verse, one that fills the head or tail of
    a paragraph at a sentence boundary splits it, one inside quotes stays
    inline (a couplet quoted in the narration)."""
    spans: dict[int, list[tuple[int, int]]] = collections.defaultdict(list)
    folded = [han_index(p) for p in paras]
    grams = [set(f[i : i + 2] for i in range(len(f) - 1)) for f, _ in folded]
    for poem in poems:
        q, _ = han_index("".join(poem))
        if len(q) < 8:
            continue
        qg = [q[i : i + 2] for i in range(len(q) - 1)]
        best = None
        for pi, (f, idx) in enumerate(folded):
            if not f:
                continue
            hit = sum(1 for g in qg if g in grams[pi]) / len(qg)
            if hit < 0.5:
                continue
            sm = difflib.SequenceMatcher(None, f, q, autojunk=False)
            blocks = [b for b in sm.get_matching_blocks() if b.size >= 3]
            if not blocks:
                continue
            cover = sum(b.size for b in blocks) / len(q)
            if cover < 0.6:
                continue
            start = max(0, blocks[0].a - blocks[0].b)
            end = min(len(f), blocks[-1].a + blocks[-1].size + (len(q) - blocks[-1].b - blocks[-1].size))
            if best is None or cover > best[0]:
                best = (cover, pi, idx[start], idx[end - 1] + 1)
        if best:
            _, pi, s, e = best
            spans[pi].append((s, e))
    out: list[dict] = []
    for pi, p in enumerate(paras):
        pieces: list[dict] = []
        cursor = 0
        for s, e in sorted(spans.get(pi, [])):
            if s < cursor:
                continue
            # Snap the end over trailing marks and closing quotes.
            while e < len(p) and (p[e] in CLAUSE_PUNCT or p[e] in CLOSERS):
                e += 1
            head, tail = p[cursor:s], p[e:]
            if quote_depth(p[:s]) > 0:
                QA["verse_inline"].append({"chapter": n, "text": p[s:e][:40]})
                continue
            if han_count(head) and head.strip()[-1:] not in "。！？：；」』":
                QA["verse_skipped"].append({"chapter": n, "why": "head", "text": p[s:e][:40]})
                continue
            if han_count(tail) and p[e - 1] not in SENTENCE_END + "」』":
                # The poem runs on past the matched lines (the next clauses
                # keep its length), or ends with a riddle's answer hint
                # (「——打一物。」): extend the verse over them.
                lengths = {han_count(c) for c in CLAUSE.findall(p[s:e]) if han_count(c)}
                if len(lengths) == 1:
                    for m in CLAUSE.finditer(p, e):
                        if m.start() != e or han_count(m.group(0)) not in lengths:
                            break
                        e = m.end()
                hint = re.match(r"——[^。！？「]{1,10}[。！？]", p[e - 2 :]) if p[e - 2 : e] == "——" else re.match(r"——[^。！？「]{1,10}[。！？]", p[e:])
                if hint:
                    e = (e - 2 if p[e - 2 : e] == "——" else e) + hint.end()
                tail = p[e:]
                if han_count(tail) and p[e - 1] not in SENTENCE_END + "」』":
                    QA["verse_skipped"].append({"chapter": n, "why": "tail", "text": p[s:e][:40]})
                    continue
            if han_count(p[s:e]) < 10 and (han_count(head) or han_count(tail)):
                continue
            if han_count(head):
                pieces.append({"kind": "prose", "text": head.strip()})
            else:
                s = cursor  # an opening bracket or quote before the poem
            pieces.append({"kind": "verse", "text": "\n".join(split_verse_lines(p[s:e].strip()))})
            cursor = e
        rest = p[cursor:].strip()
        if pieces and han_count(rest):
            pieces.append({"kind": "prose", "text": rest})
        elif pieces and rest:
            pieces[-1]["text"] += rest
        elif not pieces:
            pieces.append({"kind": "prose", "text": p})
        before = re.sub(r"\s", "", p)
        after = re.sub(r"\s", "", "".join(x["text"] for x in pieces))
        if before != after:
            raise SystemExit(f"verse split lost text in chapter {n}: {p[:40]}")
        out.extend(pieces)
    # Regular verse the poem lists missed.
    for item in out:
        if item["kind"] == "prose" and regular_verse(item["text"]):
            item["kind"] = "verse"
            item["text"] = "\n".join(split_verse_lines(item["text"]))
            QA["verse_heuristic"].append({"chapter": n, "text": item["text"][:40]})
    return out


# Chapter 5: 「紅樓夢曲」 — the prelude and the twelve songs, each title a
# paragraph of its own followed by the song.
SONG_TITLES = {
    5: ["紅樓夢引子", "終身誤", "枉凝眉", "恨無常", "分骨肉", "樂中悲", "世難容", "喜冤家", "虛花悟", "聰明累", "留餘慶", "晚韶華", "好事終", "飛鳥各投林"],
}


def mark_songs(n: int, items: list[dict]) -> None:
    titles = SONG_TITLES.get(n, [])
    found = 0
    for i, item in enumerate(items):
        if item["text"] in titles:
            item["kind"] = "song-title"
            found += 1
            nxt = items[i + 1] if i + 1 < len(items) else None
            if nxt and nxt["kind"] == "prose":
                nxt["kind"] = "verse"
                nxt["text"] = "\n".join(split_verse_lines(nxt["text"]))
    if found != len(titles):
        QA["songs"].append({"chapter": n, "found": found, "expected": len(titles)})


CLOSING = re.compile(r"(?:下回分解|下回便知|下回再表|下文分解)")


def split_closing(n: int, items: list[dict]) -> str | None:
    """The formula that closes a 回 (「不知有何禍事，且聽下回分解。」): the last
    sentence of the last paragraph when it names the next 回."""
    if not items:
        return None
    last = items[-1]
    if last["kind"] != "prose" or not CLOSING.search(last["text"][-30:]):
        QA["no_closing"].append({"chapter": n, "tail": last["text"][-40:]})
        return None
    text = last["text"]
    # Sentence starts: after 。！？ (and a closing quote) before the formula.
    cut = 0
    for m in re.finditer(r"[。！？][」』]?", text[:-1]):
        cut = m.end()
    formula = text[cut:].strip()
    rest = text[:cut].strip()
    if rest:
        last["text"] = rest
    else:
        items.pop()
    return formula


# OpenCC simplifies a few rare characters by analogy (類推簡化) into forms
# outside the 通用规范汉字表 and outside Noto Serif SC; mainland editions keep
# the traditional character there, and so does this one.
HANS_KEEP = {
    "\U0002A8AE": "圞",
    "\U000241C4": "熌",
    "\U0002B6F6": "鶒",
    "\U00025062": "䀉",
    "\U00026D9F": "爇",
    "\U000206C6": "\U00020786",
    "\U0002B6DB": "鳷",
    "\U000251A7": "瞤",
}


def zh_hans(text: str) -> str:
    s = TW2S.convert(text)
    s = "".join(HANS_KEEP.get(ch, ch) for ch in s)
    return s.translate(str.maketrans({"「": "“", "」": "”", "『": "‘", "』": "’"}))


# --- English (Joly) ---------------------------------------------------------------------------------

ROMAN = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100}


def roman_value(s: str) -> int:
    total = 0
    for i, ch in enumerate(s):
        v = ROMAN[ch]
        total += -v if i + 1 < len(s) and ROMAN[s[i + 1]] > v else v
    return total


def gutenberg_body(path: str) -> list[str]:
    t = open(path, encoding="utf-8").read().replace("\r\n", "\n")
    start = t.index("\n", t.index("*** START OF")) + 1
    end = t.index("*** END OF")
    body = t[start:end]
    for stop in ("\nEND OF BOOK", "\nERRATA", "\n[transcriber's note"):
        k = body.find(stop)
        if k >= 0:
            body = body[:k]
    return body.split("\n")


def curl_quotes(s: str) -> str:
    s = s.replace("--", "—")
    s = re.sub(r'(^|[\s(\[—])"', r"\1“", s)
    s = s.replace('"', "”")
    s = re.sub(r"(^|[\s(\[—“])'", r"\1‘", s)
    s = s.replace("'", "’")
    return s


def english_blocks(lines: list[str]) -> list[list[str]]:
    blocks, cur = [], []
    for line in lines:
        if line.strip():
            cur.append(line.rstrip())
        elif cur:
            blocks.append(cur)
            cur = []
    if cur:
        blocks.append(cur)
    return blocks


def english_paragraph(block: list[str]) -> list[dict]:
    """A Gutenberg block: prose lines are joined, 2-space-indented lines are
    verse (one line each; deeper indents continue the line above)."""
    out: list[dict] = []
    prose: list[str] = []
    verse: list[str] = []

    def flush_prose():
        if prose:
            out.append({"kind": "prose", "text": " ".join(l.strip() for l in prose)})
            prose.clear()

    def flush_verse():
        if verse:
            out.append({"kind": "verse", "text": "\n".join(verse)})
            verse.clear()

    for line in block:
        indent = len(line) - len(line.lstrip(" "))
        if indent >= 4 and verse:
            verse[-1] += " " + line.strip()
        elif indent >= 1:
            flush_prose()
            verse.append(line.strip())
        else:
            flush_verse()
            prose.append(line)
    flush_prose()
    flush_verse()
    return out


def read_joly() -> tuple[list[dict], list[str]]:
    chapters: list[dict] = []
    preface: list[str] = []
    for name in ("pg9603.txt", "pg9604.txt"):
        lines = gutenberg_body(os.path.join(SOURCE, "gutenberg", name))
        heads = [i for i, l in enumerate(lines) if re.fullmatch(r"CHAPTER [IVXLC]+\.?", l.strip())]
        if name == "pg9603.txt":
            p0 = next(i for i, l in enumerate(lines) if l.strip() == "PREFACE.")
            pre = english_blocks(lines[p0 + 1 : heads[0]])
            preface = [" ".join(l.strip() for l in b) for b in pre if not b[0].isupper() or not b[0].strip().startswith("THE DREAM")]
        for k, h in enumerate(heads):
            n = roman_value(lines[h].strip()[8:].rstrip("."))
            blocks = english_blocks(lines[h + 1 : heads[k + 1] if k + 1 < len(heads) else len(lines)])
            title_block, body = blocks[0], blocks[1:]
            # The two halves of the 回目, one sentence each; Joly sometimes
            # renders a half as two sentences (then there are four), and the
            # line breaks of the Gutenberg text are only wrapping.
            joined = re.sub(r"\s+", " ", " ".join(l.strip() for l in title_block))
            sentences = re.split(r"(?<!Mrs\.)(?<!Mr\.)(?<!Dr\.)(?<=[.!?])\s+(?=[A-Z])", joined)
            if n in EN_TITLE_GROUPS:
                halves = [" ".join(sentences[i] for i in grp) for grp in EN_TITLE_GROUPS[n]]
            elif len(sentences) == 4:
                halves = [" ".join(sentences[:2]), " ".join(sentences[2:])]
            else:
                halves = sentences
            if len(halves) != 2:
                QA["en_titles"].append({"chapter": n, "halves": halves})
            paras: list[dict] = []
            for b in body:
                paras.extend(english_paragraph(b))
            chapters.append({"n": n, "title_couplet": halves, "paragraphs": paras})
    return chapters, preface


# Chapters whose title has three sentences: which ones make each half.
EN_TITLE_GROUPS = {7: [[0, 1], [2]]}

ITALIC = re.compile(r"_([^_\n]+?)_")


def english_names(chapters: list[dict]) -> dict[str, str]:
    """Romanisation dictionary: a capitalised word (or hyphenated name) spelt
    with `ue` maps to its `ü` spelling when that spelling occurs in the
    translation too (Pao-yue → Pao-yü, Hsueeh → Hsüeh). Words whose `ü`
    form never occurs (Blue, Queen, Due) are left alone."""
    text = "\n".join(p["text"] for c in chapters for p in c["paragraphs"]) + "\n" + "\n".join(h for c in chapters for h in c["title_couplet"])
    words = collections.Counter(re.findall(r"[A-Z][A-Za-zü'’]*(?:-[a-zü'’]+)*", text))
    parts = collections.Counter(re.findall(r"[A-Za-zü'’]+", text))
    mapping: dict[str, str] = {}
    for w in words:
        if "ue" not in w:
            continue
        cand = w.replace("ue", "ü")
        if cand != w and (words.get(cand) or all(parts.get(x) for x in re.split(r"-", cand) if "ü" in x)):
            mapping[w] = cand
    # Hyphen parts inside names (Pao-yue): map the lower-case syllable too,
    # but only inside a hyphenated name.
    return mapping


# Misplaced apostrophes in single occurrences of a name.
EN_FIXES = {"Yü-’ts’un": "Yü-ts’un", "Yü-t’sun": "Yü-ts’un"}


def apply_names(s: str, mapping: dict[str, str]) -> str:
    if mapping:
        pat = re.compile(r"(?<![A-Za-zü])(" + "|".join(sorted(map(re.escape, mapping), key=len, reverse=True)) + r")(?![A-Za-zü])")
        s = pat.sub(lambda m: mapping[m.group(1)], s)
    for bad, good in EN_FIXES.items():
        s = s.replace(bad, good)
    return s


def english_closing(n: int, paras: list[dict]) -> str | None:
    if not paras or paras[-1]["kind"] != "prose":
        return None
    text = paras[-1]["text"]
    sentences = re.split(r"(?<=[.!?”])\s+(?=[A-Z“])", text)
    tail = sentences[-1]
    if not re.search(r"chapter", tail, re.I):
        QA["en_no_closing"].append({"chapter": n, "tail": tail[-80:]})
        return None
    rest = " ".join(sentences[:-1]).strip()
    if rest:
        paras[-1]["text"] = rest
    else:
        paras.pop()
    return tail


# --- stats -------------------------------------------------------------------------------------------


def stats(chapters: list[dict]) -> dict:
    per = []
    chars: collections.Counter = collections.Counter()
    verse = 0
    for c in chapters:
        body = "".join(p["text"] for p in c["paragraphs"]) + (c.get("closing_formula") or "") + "".join(c["title_couplet"])
        chars.update(body)
        verse += sum(1 for p in c["paragraphs"] if p["kind"] == "verse")
        per.append(len(body.replace("\n", "")))
    han = sorted(ch for ch in chars if is_han(ch))
    return {
        "chapters": len(chapters),
        "characters": sum(per),
        "perChapter": per,
        "versePara": verse,
        "distinctHan": len(han),
        "distinctAll": len([ch for ch in chars if ch != "\n"]),
    }


def charset(chapters: list[dict]) -> str:
    chars = set()
    for c in chapters:
        for p in c["paragraphs"]:
            chars.update(p["text"])
        chars.update("".join(c["title_couplet"]))
        chars.update(c.get("closing_formula") or "")
    chars.discard("\n")
    return "".join(sorted(chars))


# --- main --------------------------------------------------------------------------------------------


def build_zh(qa: bool) -> tuple[list[dict], list[dict]]:
    raw = read_chengyi()
    counts: collections.Counter = collections.Counter()
    hant: list[dict] = []
    for n in range(1, 121):
        ch = raw[n]
        title = ch["title"]
        for pat, rep, _ in FIXES:
            if pat in title:
                counts[pat] += title.count(pat)
                title = title.replace(pat, rep)
        paras = normalise_hant(n, ch["paras"], counts)
        witness = read_chengjia(n)
        if witness:
            fixes = orthography_candidates(n, paras, witness[0])
            paras = apply_positions(paras, fixes)
        paras = [repair_quotes(n, fix_xi(p)) for p in paras]
        title = fix_xi(title)
        poems = read_main_poems(n) + (witness[1] if witness else [])
        items = find_verse(n, paras, poems)
        mark_songs(n, items)
        closing = split_closing(n, items)
        halves = title.split("　")
        if len(halves) != 2:
            QA["zh_titles"].append({"chapter": n, "title": title})
        hant.append({"n": n, "title_couplet": halves, "paragraphs": items, "closing_formula": closing})
    for pat, rep, expected in FIXES:
        if expected is not None and counts[pat] != expected:
            print(f"warning: fix {pat} → {rep}: expected {expected}, applied {counts[pat]}", file=sys.stderr)
    QA["fix_counts"].append(dict(counts))
    hans = []
    for c in hant:
        hans.append(
            {
                "n": c["n"],
                "title_couplet": [zh_hans(h) for h in c["title_couplet"]],
                "paragraphs": [{"kind": p["kind"], "text": zh_hans(p["text"])} for p in c["paragraphs"]],
                "closing_formula": zh_hans(c["closing_formula"]) if c["closing_formula"] else None,
            }
        )
    return hant, hans


def build_en() -> tuple[list[dict], list[str], dict[str, str]]:
    chapters, preface = read_joly()
    for c in chapters:
        for p in c["paragraphs"]:
            p["text"] = curl_quotes(ITALIC.sub(r"*\1*", p["text"]))
        c["title_couplet"] = [curl_quotes(h) for h in c["title_couplet"]]
    names = english_names(chapters)
    for c in chapters:
        for p in c["paragraphs"]:
            p["text"] = apply_names(p["text"], names)
        c["title_couplet"] = [apply_names(h, names) for h in c["title_couplet"]]
        c["closing_formula"] = english_closing(c["n"], c["paragraphs"])
        for p in c["paragraphs"]:
            if p["text"].count("“") != p["text"].count("”"):
                QA["en_quotes"].append({"chapter": c["n"], "text": p["text"][:60]})
    preface = [apply_names(curl_quotes(p), names) for p in preface]
    return chapters, preface, names


# --- front matter: the prefaces of the 程 editions ----------------------------------------------

FRONT = os.path.join(SOURCE, "front.json")
# The three texts on the 程乙本 index page, in the order the 1792 print has them.
FRONT_SECTIONS = (("cheng", "序", "程偉元"), ("gao", "敘", "高鶚"), ("yinyan", "引言", "程偉元　高鶚"))
# Typing slips of the transcription, each checked against the 1791 程甲本
# transcription on zh.wikisource (its index page renders the same two
# prefaces from the scan) or, for 雲/云, against the pattern text.py fixes
# in the chapters.
FRONT_FIXES = [
    ("凡我同人。或亦", "凡我同人，或亦"),
    ("將付剞，", "將付剞劂，"),
    ("子且閒憊矣，盍分認之", "子閒且憊矣，盍分任之"),
    ("井識端末", "並識端末"),
    ("非雲弁首", "非云弁首"),
]


def front_matter() -> dict:
    """程偉元's 序, 高鶚's 敘 and the 引言 of 1792 from the 程乙本 index page:
    `{zh-Hant: [{key, title, author, paragraphs, signature}], zh-Hans: …}`.
    The signature is the short closing lines (name, date)."""
    text = open(os.path.join(WS, "chengyi-index.wikitext"), encoding="utf-8").read()
    for old, new in FRONT_FIXES:
        if old not in text:
            print(f"warning: front-matter fix not applied: {old}", file=sys.stderr)
        text = text.replace(old, new)
    out: dict[str, list] = {"zh-Hant": [], "zh-Hans": []}
    for key, title, author in FRONT_SECTIONS:
        m = re.search(rf"^=={re.escape(title)}==\s*$(.*?)(?=^==)", text, re.M | re.S)
        if not m:
            raise SystemExit(f"front matter: section {title} not found")
        lines = [clean_inline(l).strip(" \t　") for l in m.group(1).split("\n")]
        lines = [l for l in lines if l and not l.startswith("{{")]
        # 引言: an item (「一、」) the transcription ran into the one before.
        split: list[str] = []
        for l in lines:
            split.extend(p for p in re.split(r"(?<=[。」])(?=一、)", l) if p)
        paragraphs = [l for l in split if "。" in l or "？" in l or len(l) > 16]
        signature = [l for l in split if l not in paragraphs]
        if split[: len(paragraphs)] != paragraphs:
            raise SystemExit(f"front matter: signature lines inside {title}")
        entry = {"key": key, "title": title, "author": author, "paragraphs": paragraphs, "signature": signature}
        out["zh-Hant"].append(entry)
        # OpenCC keeps the variant 敍 (高鶚's signature); Simplified writes 叙.
        hans = lambda s: zh_hans(s).replace("敍", "叙")  # noqa: E731
        out["zh-Hans"].append({**entry, "title": hans(title), "author": hans(author), "paragraphs": [hans(p) for p in paragraphs], "signature": [hans(s) for s in signature]})
    with open(FRONT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write("\n")
    return out


def main() -> None:
    if "--front" in sys.argv:
        front = front_matter()
        print("wrote", FRONT, [(e["title"], len(e["paragraphs"]), e["signature"]) for e in front["zh-Hant"]])
        return
    qa = "--qa" in sys.argv
    hant, hans = build_zh(qa)
    en, preface, names = build_en()
    for c in hant:
        for p in c["paragraphs"]:
            if quote_depth(p["text"]) or p["text"].count("「") != p["text"].count("」"):
                QA["zh_quotes"].append({"chapter": c["n"], "text": p["text"][:50]})
    data = {
        "version": 1,
        "sources": {
            "zh-Hant": "zh.wikisource 《紅樓夢（程乙本）》 (CC BY-SA 4.0 transcription of the 1792 text)",
            "zh-Hans": "derived from zh-Hant with OpenCC tw2s; 「」→“” 『』→‘’",
            "en": "H. Bencraft Joly, Hung Lou Meng (1892–93), Project Gutenberg #9603 and #9604",
        },
        "editions": {
            "zh-Hant": {"chapters": hant},
            "zh-Hans": {"chapters": hans},
            "en": {"chapters": en, "preface": preface},
        },
        "stats": {"zh-Hant": stats(hant), "zh-Hans": stats(hans), "en": stats(en)},
        "charsets": {"zh-Hant": charset(hant), "zh-Hans": charset(hans), "en": charset(en)},
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=0)
        f.write("\n")
    os.makedirs(QA_DIR, exist_ok=True)
    with open(os.path.join(QA_DIR, "report.json"), "w", encoding="utf-8") as f:
        json.dump({**QA, "names": names}, f, ensure_ascii=False, indent=1)
    for lang, s in data["stats"].items():
        print(f"{lang}: {s['chapters']} chapters, {s['characters']:,} characters, {s['versePara']} verse paragraphs, {s['distinctHan']} distinct Han ({s['distinctAll']} distinct code points)")
    for key in ("orthography", "verse_inline", "verse_skipped", "verse_heuristic", "songs", "no_closing", "zh_titles", "zh_quotes", "quote_repairs", "quote_unmatched", "en_titles", "en_no_closing", "en_quotes", "duplicates"):
        print(f"  qa {key}: {len(QA.get(key, []))}")
    print(f"  qa names: {len(names)} romanisation fixes")
    print("wrote", OUT, f"({os.path.getsize(OUT) / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
