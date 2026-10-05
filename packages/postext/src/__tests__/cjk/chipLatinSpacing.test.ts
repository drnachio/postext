import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import type { CjkConfig, Dimension, PostextConfig } from '../../types';
import type { VDTDocument, VDTLine, VDTLineSegment } from '../../vdt';
import { installSizedStub } from '../vertical/stub';

installSizedStub();

// A chip whose words are Latin, in a Japanese or Chinese line, takes the
// space JLReq §3.2.2 (and clreq for Han–Latin) puts between CJK and
// Western text (`cjk.latinSpacing`, a quarter em by default) on each side,
// as its words set plain would (#462): not at a line start or end, not
// against a bracket or a mark, not on a side whose character is CJK. The
// stub measures kana and kanji one em (10 px), Latin half an em.

const pt = (value: number): Dimension => ({ value, unit: 'pt' });
const EM = 10;

function config(locale: string, vertical = false, cjk: CjkConfig = {}): PostextConfig {
  return {
    locale,
    page: { width: pt(300), height: pt(300), dpi: 72, margins: { top: pt(20), right: pt(20), bottom: pt(20), left: pt(20) } },
    bodyText: { fontFamily: 'Test Serif', fontSize: pt(EM), lineHeight: pt(16), textAlign: 'left', firstLineIndent: pt(0) },
    layout: { layoutType: 'single', ...(vertical ? { writingMode: 'vertical-rl' as const } : {}) },
    header: { elements: [] },
    footer: { elements: [] },
    chipStyles: [{ id: 'code', fontFamily: 'Test Mono', paddingX: pt(2), gap: pt(0) }],
    cjk,
  };
}

function bodyLines(doc: VDTDocument): VDTLine[] {
  return doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks.filter((b) => b.type === 'paragraph').flatMap((b) => b.lines ?? [])));
}

/** A line's segments as short tokens: `[x]` a chip, `␣` an inserted
 *  (auto) space, `_` a typed space, else the text (consecutive text
 *  segments joined, as the regions cut them differently). */
function tokens(line: VDTLine): string[] {
  const out: string[] = [];
  let text = false;
  for (const s of line.segments ?? []) {
    const chip = (s as VDTLineSegment).chip;
    if (chip) out.push(`[${chip.runs.map((r) => r.text).join('')}]`);
    else if (s.kind === 'space') out.push(s.autospace ? '␣' : '_');
    else if (text) out[out.length - 1] += s.text;
    else out.push(s.text);
    text = !chip && s.kind !== 'space';
  }
  return out;
}
const flat = (doc: VDTDocument): string[] => bodyLines(doc).flatMap(tokens);
const lay = (md: string, locale = 'ja', vertical = false, cjk: CjkConfig = {}): VDTDocument => buildDocument({ markdown: md }, config(locale, vertical, cjk));

/** The default Han–Latin space: a quarter of the 10 px em. */
const QUARTER = EM / 4;
const CHIP = ':chip[unicodedata]{style=code}';

describe('a Latin chip in Japanese text (#462)', () => {
  it('takes a quarter em on each side between kana', () => {
    const doc = lay(`標準ライブラリの${CHIP}モジュールです。`);
    expect(flat(doc)).toEqual(['標準ライブラリの', '␣', '[unicodedata]', '␣', 'モジュールです。']);
    const spaces = bodyLines(doc)[0]!.segments!.filter((s) => s.kind === 'space');
    for (const s of spaces) expect(s.width).toBeCloseTo(QUARTER, 6);
  });

  it('is spaced as its words set plain are', () => {
    const plain = flat(lay('標準ライブラリのunicodedataモジュールです。'));
    expect(plain).toEqual(['標準ライブラリの', '␣', 'unicodedata', '␣', 'モジュールです。']);
    expect(flat(lay(`標準ライブラリの${CHIP}モジュールです。`)).map((t) => (t === '[unicodedata]' ? 'unicodedata' : t))).toEqual(plain);
  });

  it('turns a space typed next to it into the quarter em', () => {
    const doc = lay(`標準ライブラリの ${CHIP} モジュールです。`);
    expect(flat(doc)).toEqual(['標準ライブラリの', '␣', '[unicodedata]', '␣', 'モジュールです。']);
    for (const s of bodyLines(doc)[0]!.segments!.filter((x) => x.kind === 'space')) expect(s.width).toBeCloseTo(QUARTER, 6);
  });

  it('takes none against a bracket or a mark', () => {
    expect(flat(lay('「:chip[abc]{style=code}」と書く。'))).toEqual(['「', '[abc]', '」と書く。']);
    expect(flat(lay('関数（:chip[abc]{style=code}）と『:chip[def]{style=code}』です。'))).toEqual(['関数（', '[abc]', '）と『', '[def]', '』です。']);
    expect(flat(lay('これです。:chip[abc]{style=code}、それ。'))).toEqual(['これです。', '[abc]', '、それ。']);
  });

  it('reads each side from the character the chip opens or closes with', () => {
    // CJK on both sides: a box of Han text, no space next to kana…
    expect(flat(lay('これは:chip[漢字]{style=code}です。'))).toEqual(['これは', '[漢字]', 'です。']);
    // …but a Latin word touching it takes one.
    expect(flat(lay('これはabc:chip[漢字]{style=code}です。'))).toEqual(['これは', '␣', 'abc', '␣', '[漢字]', 'です。']);
    // Han first, Latin last.
    expect(flat(lay('これは:chip[図A]{style=code}です。'))).toEqual(['これは', '[図A]', '␣', 'です。']);
    // Full-width letters are CJK characters.
    expect(flat(lay('これは:chip[ＡＢＣ]{style=code}です。'))).toEqual(['これは', '[ＡＢＣ]', 'です。']);
    // A sign is neither: no space on that side.
    expect(flat(lay('これは:chip[#tag]{style=code}です。'))).toEqual(['これは', '[#tag]', '␣', 'です。']);
    // Two chips: a Han one and a Latin one.
    expect(flat(lay('これは:chip[漢字]{style=code}:chip[abc]{style=code}です。'))).toEqual(['これは', '[漢字]', '␣', '[abc]', '␣', 'です。']);
  });

  it('takes none at the start or the end of a paragraph', () => {
    expect(flat(lay(':chip[abc]{style=code}を使う。'))).toEqual(['[abc]', '␣', 'を使う。']);
    expect(flat(lay('これを使う:chip[abc]{style=code}'))).toEqual(['これを使う', '␣', '[abc]']);
  });

  it('takes none at a line start or a line end', () => {
    // The measure is 260 px: 26 characters.
    const opens = bodyLines(lay(`${'あ'.repeat(26)}:chip[abc]{style=code}いう。`));
    expect(opens.map(tokens)).toEqual([['あ'.repeat(26)], ['[abc]', '␣', 'いう。']]);
    // 23 characters, the space and the chip (20 px) fill 252.5 px; the
    // space after it and the next character do not fit.
    const ends = bodyLines(lay(`${'あ'.repeat(23)}:chip[abc]{style=code}いうえお。`));
    expect(ends.map(tokens)).toEqual([['あ'.repeat(23), '␣', '[abc]'], ['いうえお。']]);
  });

  it('is the same down a vertical line, where the chip is set sideways', () => {
    expect(flat(lay(`標準ライブラリの${CHIP}モジュールです。`, 'ja', true))).toEqual(['標準ライブラリの', '␣', '[unicodedata]', '␣', 'モジュールです。']);
    expect(flat(lay('「:chip[abc]{style=code}」と書く。', 'ja', true))).toEqual(['「', '[abc]', '」と書く。']);
    const opens = bodyLines(lay(`${'あ'.repeat(26)}:chip[abc]{style=code}いう。`, 'ja', true));
    expect(opens.map(tokens)).toEqual([['あ'.repeat(26)], ['[abc]', '␣', 'いう。']]);
  });

  it('takes none when the Han–Latin space is off', () => {
    const off = { latinSpacing: { value: 0, unit: 'em' as const } };
    expect(flat(lay(`標準ライブラリの${CHIP}モジュールです。`, 'ja', false, off))).toEqual(['標準ライブラリの', '[unicodedata]', 'モジュールです。']);
    // A typed space stays a word space.
    expect(flat(lay(`標準ライブラリの ${CHIP} モジュールです。`, 'ja', false, off))).toEqual(['標準ライブラリの', '_', '[unicodedata]', '_', 'モジュールです。']);
  });

  it('follows the em of `cjk.latinSpacing`', () => {
    const doc = lay(`標準ライブラリの${CHIP}モジュールです。`, 'ja', false, { latinSpacing: { value: 0.5, unit: 'em' } });
    for (const s of bodyLines(doc)[0]!.segments!.filter((x) => x.kind === 'space')) expect(s.width).toBeCloseTo(EM / 2, 6);
  });
});

describe('a Latin chip in Chinese text (#462)', () => {
  for (const locale of ['zh-Hans', 'zh-Hant-TW', 'zh-HK']) {
    it(`takes the Han–Latin space on each side (${locale})`, () => {
      expect(flat(lay('使用:chip[pip]{style=code}安装软件包。', locale))).toEqual(['使用', '␣', '[pip]', '␣', '安装软件包。']);
      expect(flat(lay('使用 :chip[pip]{style=code} 安装软件包。', locale))).toEqual(['使用', '␣', '[pip]', '␣', '安装软件包。']);
    });
  }

  it('takes none against a bracket, and none for a Han chip', () => {
    expect(flat(lay('运行“:chip[pip]{style=code}”命令。', 'zh-Hans'))).toEqual(['运行“', '[pip]', '”命令。']);
    expect(flat(lay('这是:chip[汉字]{style=code}的例子。', 'zh-Hans'))).toEqual(['这是', '[汉字]', '的例子。']);
  });

  it('is the same down a vertical line', () => {
    expect(flat(lay('使用:chip[pip]{style=code}安装软件包。', 'zh-Hant-TW', true))).toEqual(['使用', '␣', '[pip]', '␣', '安装软件包。']);
  });
});
