import { describe, it, expect, afterEach } from 'vitest';
import { measureRichBlock } from '../../measure/rich';
import { measureBlock } from '../../measure/plain';
import { cjkJoinBreaks } from '../../measure/cjk';
import { cjkWordBreaks } from '../../measure/cjkCompose';
import {
  breakClassOf,
  cjkClassOf,
  isInseparablePair,
  isLineEndProhibited,
  isLineStartProhibited,
  setCjkLineBreak,
  type CjkLineBreakLevel,
} from '../../measure/cjkClasses';
import { setCjkComposition, type CjkComposition } from '../../measure/cjkPunctuation';
import { resolveCjkConfig } from '../../defaults/cjk';
import type { InlineSpan } from '../../parse';
import type { MeasureBlockOptions } from '../../measure/types';
import type { VDTLine } from '../../vdt';

// Japanese kinsoku shori (#417): the JLReq line-break levels. Stub: CJK
// characters, kana and the marks Chinese sets full width (— … “ ” ‘ ’) are
// 16 px, a space 4 px, everything else (‐ ‥ Latin letters, digits) 8 px.
const FULL = new Set(['—', '…', '·', '“', '”', '‘', '’']);
function charWidth(ch: string): number {
  const cp = ch.codePointAt(0)!;
  if (ch === ' ') return 4;
  return cp >= 0x2e80 || FULL.has(ch) ? 16 : 8;
}
class StubCtx {
  font = '';
  letterSpacing = '0px';
  measureText(s: string): { width: number } {
    let w = 0;
    for (const ch of s) w += charWidth(ch);
    return { width: w };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const FONT = '16px Test';
const run = (text: string): InlineSpan => ({ text, bold: false, italic: false });
const texts = (lines: VDTLine[]): string[] => lines.map((l) => l.text);

afterEach(() => {
  setCjkLineBreak('gb');
  setCjkComposition(undefined);
});

/** The lines of `text` on both paths (plain, and formatted with one span),
 *  which must agree. */
function both(text: string, w: number, options: MeasureBlockOptions = {}): string[] {
  const plain = texts(measureBlock(text, FONT, w, 20, options).lines);
  const rich = texts(measureRichBlock([run(text)], FONT, FONT, FONT, FONT, w, 20, options).lines);
  expect(rich).toEqual(plain);
  return plain;
}

/** The lines at each level, keyed by level. */
function byLevel(text: string, w: number, levels: CjkLineBreakLevel[] = ['gb', 'ja-very-strict', 'ja-strict', 'ja-loose']): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const level of levels) out[level] = both(text, w, { cjkLineBreak: level });
  return out;
}

// 64 px hold four kana: the fifth character is the one that would open the
// second line.
describe('small kana, ー and the iteration marks (cl-09, cl-10, cl-11)', () => {
  it('keeps a small kana off the line start at ja-very-strict only', () => {
    for (const text of ['あいうえっと', 'あいうえゃく', 'アイウエョン', 'アイウエㇰア', 'ｱｲｳｴｯﾄ']) {
      const l = byLevel(text, 64);
      const [head, tail] = [text.slice(0, 4), text.slice(4)];
      const pushed = [text.slice(0, 3), text.slice(3)];
      // (The stub sets halfwidth katakana 16 px too.)
      expect(l['ja-very-strict']).toEqual(pushed);
      expect(l['ja-strict']).toEqual([head, tail]);
      expect(l['ja-loose']).toEqual([head, tail]);
      // Chinese levels: a small kana is an ideograph, as before.
      expect(l.gb).toEqual([head, tail]);
    }
  });

  it('keeps ー off the line start at ja-very-strict only', () => {
    const l = byLevel('あいうえーお', 64);
    expect(l['ja-very-strict']).toEqual(['あいう', 'えーお']);
    expect(l['ja-strict']).toEqual(['あいうえ', 'ーお']);
    expect(l['ja-loose']).toEqual(['あいうえ', 'ーお']);
    // An iteration mark to clreq: off the start at every Chinese level but none.
    expect(l.gb).toEqual(['あいう', 'えーお']);
  });

  it('lets 々 open a line at ja-strict, the other iteration marks only at ja-loose', () => {
    const kanji = byLevel('あいう人々は', 64);
    expect(kanji['ja-very-strict']).toEqual(['あいう', '人々は']);
    expect(kanji['ja-strict']).toEqual(['あいう人', '々は']);
    expect(kanji['ja-loose']).toEqual(['あいう人', '々は']);
    for (const text of ['あいうこゝろ', 'あいうすゞめ', 'あいうコヽロ', 'あいう時〻に']) {
      const l = byLevel(text, 64);
      expect(l['ja-very-strict']).toEqual([text.slice(0, 3), text.slice(3)]);
      expect(l['ja-strict']).toEqual([text.slice(0, 3), text.slice(3)]);
      expect(l['ja-loose']).toEqual([text.slice(0, 4), text.slice(4)]);
    }
  });
});

describe('hyphens, dividing punctuation and middle dots (cl-03, cl-04, cl-05)', () => {
  it('keeps 〜 ～ ゠ – off the line start, but at ja-loose', () => {
    for (const mark of ['〜', '～', '゠', '–']) {
      const text = `あいう五${mark}十`;
      const l = byLevel(text, 64);
      expect(l['ja-very-strict']).toEqual(['あいう', `五${mark}十`]);
      expect(l['ja-strict']).toEqual(['あいう', `五${mark}十`]);
      expect(l['ja-loose']).toEqual(['あいう五', `${mark}十`]);
      // A connector to clreq.
      expect(l.gb).toEqual(['あいう', `五${mark}十`]);
    }
  });

  it('keeps the quarter-em hyphen ‐ (U+2010) off the line start under the Japanese levels only', () => {
    // あいうえ fills the line; ‐ is a Western character (8 px).
    const l = byLevel('あいうえ‐お', 64);
    expect(l['ja-very-strict']).toEqual(['あいう', 'え‐お']);
    expect(l['ja-strict']).toEqual(['あいう', 'え‐お']);
    expect(l['ja-loose']).toEqual(['あいうえ', '‐お']);
    expect(l.gb).toEqual(['あいうえ', '‐お']);
  });

  it('keeps ？！ and the middle dots off the line start, but at ja-loose', () => {
    for (const mark of ['？', '！', '・', '：', '；', '‼']) {
      const text = `あいうえ${mark}お`;
      const l = byLevel(text, 64, ['ja-very-strict', 'ja-strict', 'ja-loose']);
      expect(l['ja-very-strict']).toEqual(['あいう', `え${mark}お`]);
      expect(l['ja-strict']).toEqual(['あいう', `え${mark}お`]);
      expect(l['ja-loose']).toEqual(['あいうえ', `${mark}お`]);
    }
  });

  it('never opens a line with 、。 or a closing bracket, at any Japanese level', () => {
    for (const mark of ['、', '。', '，', '．', '」', '）', '』', '〕']) {
      const l = byLevel(`あいうえ${mark}お`, 64, ['ja-very-strict', 'ja-strict', 'ja-loose']);
      for (const lines of Object.values(l)) expect(lines).toEqual(['あいう', `え${mark}お`]);
    }
  });

  it('never ends a line with an opening bracket, at any Japanese level', () => {
    for (const level of ['ja-very-strict', 'ja-strict', 'ja-loose'] as const) {
      // 「 would fit at the end of the first line.
      expect(both('あいう「えお」', 64, { cjkLineBreak: level })).toEqual(['あいう', '「えお」']);
    }
  });

  it('has no solidus rule (GB/T 15834 only)', () => {
    expect(both('あいうえ／お', 64, { cjkLineBreak: 'ja-very-strict' })).toEqual(['あいうえ', '／お']);
    expect(both('あいう／えお', 64, { cjkLineBreak: 'ja-very-strict' })).toEqual(['あいう／', 'えお']);
    expect(both('あいうえ／お', 64, { cjkLineBreak: 'gb' })).toEqual(['あいう', 'え／お']);
  });
});

describe('inseparable characters (cl-08)', () => {
  it('lets a line open with …… or ―― under the Japanese levels, never between the two', () => {
    for (const pair of ['……', '――', '——']) {
      for (const level of ['ja-very-strict', 'ja-strict', 'ja-loose'] as const) {
        // あいうえお fills the line.
        expect(both(`あいうえお${pair}か`, 80, { cjkLineBreak: level })).toEqual(['あいうえお', `${pair}か`]);
      }
      // clreq's strict level keeps the pair off the start.
      expect(both(`あいうえお${pair}か`, 80, { cjkLineBreak: 'strict' })[1]!.startsWith(pair)).toBe(false);
    }
  });

  it('lets a single dash open a Japanese line (a connector to clreq)', () => {
    expect(both('あいうえ―お', 64, { cjkLineBreak: 'ja-very-strict' })).toEqual(['あいうえ', '―お']);
    expect(both('あいうえ―お', 64, { cjkLineBreak: 'gb' })).toEqual(['あいう', 'え―お']);
  });

  it('keeps ‥‥, a third … and 〳〵 whole', () => {
    // ‥ is 8 px: the first fits after あいうえ in 72 px, the second does not.
    expect(both('あいうえ‥‥お', 72, { cjkLineBreak: 'ja-very-strict' })).toEqual(['あいうえ', '‥‥お']);
    expect(both('あいうえ‥‥お', 72, { cjkLineBreak: 'gb' })).toEqual(['あいうえ‥', '‥お']);
    // ……… : the pair fits in 96 px, the third does not and keeps with it.
    expect(both('あいうえ………お', 96, { cjkLineBreak: 'ja-strict' })).toEqual(['あいうえ', '………お']);
    expect(both('あいうえ………お', 96, { cjkLineBreak: 'gb' })).toEqual(['あいうえ……', '…お']);
    // 〳〵: may open a line, never parts.
    expect(both('あいうえ〳〵お', 80, { cjkLineBreak: 'ja-very-strict' })).toEqual(['あいうえ', '〳〵お']);
    expect(both('あいうえ〳〵お', 80, { cjkLineBreak: 'ja-loose' })).toEqual(['あいうえ', '〳〵お']);
    // Two different ones may part.
    expect(both('あいうえ…‥お', 80, { cjkLineBreak: 'ja-very-strict' })).toEqual(['あいうえ…', '‥お']);
  });
});

describe('numbers, Latin words and notes under the Japanese levels', () => {
  const levels = ['ja-very-strict', 'ja-strict', 'ja-loose'] as const;

  it('keeps a number whole with its currency sign and its unit', () => {
    for (const level of levels) {
      for (let w = 64; w <= 200; w += 8) {
        const price = both('この本の値段は¥1,500です。', w, { cjkLineBreak: level });
        expect(price.join('')).toBe('この本の値段は¥1,500です。');
        expect(price.some((l) => l.includes('¥1,500'))).toBe(true);
        const pct = both('増加率は50%を超えた。', w, { cjkLineBreak: level });
        expect(pct.some((l) => l.includes('50%'))).toBe(true);
        const full = both('増加率は５０％で円周率は３．１４です', w, { cjkLineBreak: level });
        expect(full.some((l) => l.includes('５０％'))).toBe(true);
        expect(full.some((l) => l.includes('３．１４'))).toBe(true);
      }
    }
  });

  it('keeps a Latin word whole unless it is wider than the line', () => {
    for (const level of levels) {
      // Japanese is 64 px: it goes down whole.
      expect(both('あいうJapanese', 96, { cjkLineBreak: level })).toEqual(['あいう', 'Japanese']);
      const long = both('あいうSupercalifragilistic', 64, { cjkLineBreak: level });
      expect(long.join('').replace(/-/g, '')).toBe('あいうSupercalifragilistic');
      expect(long.length).toBeGreaterThan(2);
    }
  });

  it('never breaks before a footnote marker', () => {
    const spans: InlineSpan[] = [run('あいうえおかきく'), { text: '1', bold: false, italic: false, footnote: { id: 'n' }, script: 'sup' }, run('けこ')];
    for (const level of levels) {
      const lines = texts(measureRichBlock(spans, FONT, FONT, FONT, FONT, 128, 20, { textAlign: 'left', cjkLineBreak: level }).lines);
      expect(lines[0]).toBe('あいうえおかき');
      expect(lines[1]!.startsWith('く1')).toBe(true);
    }
  });

  it('reads the document level when the measurement names none', () => {
    setCjkLineBreak('ja-very-strict');
    expect(both('あいうえっと', 64)).toEqual(['あいう', 'えっと']);
    setCjkLineBreak('ja-strict');
    expect(both('あいうえっと', 64)).toEqual(['あいうえ', 'っと']);
  });

  it('gives the same lines on both paths for a real paragraph, with no line opening on a prohibited character', () => {
    // 夏目漱石『こころ』上 一.
    const text = '私はその人を常に先生と呼んでいた。だからここでもただ先生と書くだけで本名は打ち明けない。これは世間を憚かる遠慮というよりも、その方が私にとって自然だからである。私はその人の記憶を呼び起すごとに、すぐ「先生」といいたくなる。筆を執っても心持は同じ事である。よそよそしい頭文字などはとても使う気にならない。ちょっとしたことでもすぐにノートへ書きとめておく。';
    const veryStrict = /^[、。，．」』）〕！？・：；ーゝゞヽヾ々〻ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ〜～゠]/;
    const strict = /^[、。，．」』）〕！？・：；ゝゞヽヾ〻〜～゠]/;
    const loose = /^[、。，．」』）〕]/;
    for (const [level, re] of [['ja-very-strict', veryStrict], ['ja-strict', strict], ['ja-loose', loose]] as const) {
      for (let w = 100; w <= 400; w += 13) {
        const lines = both(text, w, { textAlign: 'justify', cjkLineBreak: level });
        expect(lines.join('')).toBe(text);
        for (const l of lines.slice(1)) expect(re.test(l), `${level} ${w}: ${l}`).toBe(false);
        for (const l of lines.slice(0, -1)) expect(/[「『（〔]$/.test(l)).toBe(false);
      }
    }
  });
});

describe('random Japanese text', () => {
  // Kana and kanji, and after one of them now and then a single character a
  // level may keep off the line start, Latin words and numbers: at every
  // Japanese level and composition the composer keeps every character in
  // order, both paths agree, and no line opens with a character its level
  // prohibits there (no two such characters ever meet, so none is forced).
  const BASE = [...'私先生呼人書本名明遠慮自然記憶筆心持同事頭文字使気あいうえおかきくけこさしすせそたちつてとなにぬねのアイウエオカキクケコ', 'iPhone', '¥1,500', '50%', '３．１４'];
  const MARKS: Record<CjkLineBreakLevel, string> = {
    'ja-very-strict': 'っゃゅょァッャュョーゝ々〜～？！・：、。」』）',
    'ja-strict': 'ゝヽ〜～？！・：、。」』）',
    'ja-loose': '、。」』）',
  } as Record<CjkLineBreakLevel, string>;
  const FREE = 'っゃゅょァッャュョーゝ々〜～？！・：「『（……――';
  let seed = 4171;
  const rnd = (n: number): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % n;
  };
  const composition = (): CjkComposition => ({
    region: 'japan',
    punctuationWidth: rnd(2) ? 'fullwidth' : 'lineEndHalf',
    compressAdjacent: rnd(2) === 0,
    trimLineStart: rnd(2) === 0,
    hangingPunctuation: (['none', 'allow', 'force'] as const)[rnd(3)]!,
    latinSpacing: rnd(2) ? { em: 0.25 } : { em: 0 },
    language: 'ja',
  });

  it('keeps every character and every prohibition', () => {
    for (let iter = 0; iter < 600; iter++) {
      const level = (['ja-very-strict', 'ja-strict', 'ja-loose'] as const)[rnd(3)]!;
      const marks = [...MARKS[level]];
      const free = [...FREE];
      let text = '';
      const len = 4 + rnd(60);
      for (let i = 0; i < len; i++) {
        text += BASE[rnd(BASE.length)];
        const r = rnd(6);
        if (r === 0) text += marks[rnd(marks.length)];
        else if (r === 1) text += free[rnd(free.length)];
      }
      const width = 112 + rnd(300);
      const options = { textAlign: rnd(2) ? ('justify' as const) : ('left' as const), cjkLineBreak: level, cjkComposition: composition() };
      const lines = both(text, width, options);
      expect(lines.join('')).toBe(text);
      const prohibited = new Set(marks);
      for (const l of lines.slice(1)) expect(prohibited.has([...l][0]!), `${level} ${width}: ${JSON.stringify(lines)}`).toBe(false);
      for (const l of lines.slice(0, -1)) expect(/[「『（]$/.test(l), `${level} ${width}: ${JSON.stringify(lines)}`).toBe(false);
    }
  });
});

describe('the Knuth–Plass path (a Latin paragraph quoting Japanese)', () => {
  it('joins two runs under the Japanese classes (cjkJoinBreaks)', () => {
    expect(cjkJoinBreaks('ちょ', 'っと', 'ja-very-strict')).toBe(false);
    expect(cjkJoinBreaks('ちょ', 'っと', 'ja-strict')).toBe(true);
    expect(cjkJoinBreaks('ちょ', 'っと', 'gb')).toBe(true);
    expect(cjkJoinBreaks('コ', 'ーヒー', 'ja-very-strict')).toBe(false);
    expect(cjkJoinBreaks('コ', 'ーヒー', 'ja-loose')).toBe(true);
    expect(cjkJoinBreaks('五', '〜十', 'ja-strict')).toBe(false);
    expect(cjkJoinBreaks('五', '〜十', 'ja-loose')).toBe(true);
    expect(cjkJoinBreaks('あ〳', '〵い', 'ja-loose')).toBe(false);
    expect(cjkJoinBreaks('あ〳', '〵い', 'none')).toBe(true);
    expect(cjkJoinBreaks('あ', '……', 'ja-very-strict')).toBe(true);
    expect(cjkJoinBreaks('あ', '……', 'strict')).toBe(false);
  });

  it('breaks a word that holds kana only where the level allows (cjkWordBreaks)', () => {
    const at = (level: CjkLineBreakLevel): number[] => cjkWordBreaks('ちょっとコーヒー', FONT, false, 0, level).breaks;
    // Offsets 1–7: ち|ょ|っ|と|コ|ー|ヒ|ー.
    expect(at('ja-very-strict')).toEqual([3, 4, 6]);
    expect(at('ja-strict')).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(at('gb')).toEqual([1, 2, 3, 4, 6]);
  });

  it('sets a Latin paragraph quoting Japanese with no line opening on っ', () => {
    // The word-by-word breaker reads the document's level.
    const text = 'The word ちょっと means a little, and the word ちょっと待って means wait a moment, please; both are common in speech.';
    const opened = (level: CjkLineBreakLevel): boolean => {
      setCjkLineBreak(level);
      let any = false;
      for (let w = 60; w <= 200; w += 7) {
        const lines = texts(measureRichBlock([run(text)], FONT, FONT, FONT, FONT, w, 20, { textAlign: 'justify', optimal: true }).lines);
        expect(lines.join('').replace(/ /g, '')).toBe(text.replace(/ /g, ''));
        if (lines.slice(1).some((l) => /^[っょ]/.test(l))) any = true;
      }
      return any;
    };
    expect(opened('ja-very-strict')).toBe(false);
    expect(opened('ja-strict')).toBe(true);
  });
});

describe('the class table', () => {
  it('refines the clreq classes under the Japanese levels only', () => {
    const cls = (g: string, level: CjkLineBreakLevel) => breakClassOf(g, cjkClassOf(g), level);
    expect(cls('っ', 'ja-strict')).toBe('smallKana');
    expect(cls('っ', 'gb')).toBe('ideograph');
    expect(cls('ㇷ゚', 'ja-strict')).toBe('smallKana');
    expect(cls('ー', 'ja-strict')).toBe('prolonged');
    expect(cls('々', 'ja-strict')).toBe('kanjiIteration');
    expect(cls('ゝ', 'ja-strict')).toBe('iteration');
    expect(cls('〳', 'ja-strict')).toBe('inseparable');
    for (const g of ['‐', '–', '゠', '〜', '～']) expect(cls(g, 'ja-strict')).toBe('hyphen');
    expect(cls('〜', 'gb')).toBe('connector');
    expect(cls('‐', 'gb')).toBe('western');
    expect(cls('？', 'ja-strict')).toBe('dividing');
    expect(cls('。', 'ja-strict')).toBe('stop');
    expect(cls('：', 'ja-strict')).toBe('middleDot');
    expect(cls('、', 'ja-strict')).toBe('pause');
    expect(cls('・', 'ja-strict')).toBe('middleDot');
    // A class the composer set stands: a single em dash read as a connector
    // is a dash to JLReq; an ideograph that is no small kana stays one.
    expect(breakClassOf('—', 'connector', 'ja-strict')).toBe('dash');
    expect(breakClassOf('っ', 'western', 'ja-strict')).toBe('western');
  });

  it('prohibits at each level what JLReq Appendix C.3 says', () => {
    const start = (g: string, level: CjkLineBreakLevel) => isLineStartProhibited(cjkClassOf(g), level, g);
    const table: [string, boolean, boolean, boolean][] = [
      // grapheme, very strict, strict, loose
      ['っ', true, false, false],
      ['ー', true, false, false],
      ['々', true, false, false],
      ['ゝ', true, true, false],
      ['〜', true, true, false],
      ['？', true, true, false],
      ['・', true, true, false],
      ['。', true, true, true],
      ['、', true, true, true],
      ['」', true, true, true],
      ['…', false, false, false],
      ['―', false, false, false],
      ['〳', false, false, false],
      ['／', false, false, false],
      ['あ', false, false, false],
    ];
    for (const [g, vs, s, l] of table) {
      expect([start(g, 'ja-very-strict'), start(g, 'ja-strict'), start(g, 'ja-loose')], g).toEqual([vs, s, l]);
    }
    expect(isLineEndProhibited(cjkClassOf('「'), 'ja-loose', '「')).toBe(true);
    expect(isLineEndProhibited(cjkClassOf('¥'), 'ja-very-strict', '¥')).toBe(true);
    expect(isLineEndProhibited(cjkClassOf('¥'), 'ja-loose', '¥')).toBe(false);
    expect(isLineEndProhibited(cjkClassOf('／'), 'ja-very-strict', '／')).toBe(false);
    expect(isInseparablePair('‥', '‥')).toBe(true);
    expect(isInseparablePair('〴', '〵')).toBe(true);
    expect(isInseparablePair('…', '‥')).toBe(false);
  });
});

describe('cjk.lineBreak', () => {
  it('resolves auto to ja-very-strict for Japan and keeps the Chinese defaults', () => {
    expect(resolveCjkConfig(undefined, 'ja').lineBreak).toBe('ja-very-strict');
    expect(resolveCjkConfig(undefined, 'zh-Hans').lineBreak).toBe('gb');
    expect(resolveCjkConfig(undefined, 'zh-Hant').lineBreak).toBe('basic');
    for (const level of ['ja-very-strict', 'ja-strict', 'ja-loose'] as const) {
      expect(resolveCjkConfig({ lineBreak: level }, 'ja').lineBreak).toBe(level);
      // Opt-in elsewhere too.
      expect(resolveCjkConfig({ lineBreak: level }, 'zh-Hans').lineBreak).toBe(level);
    }
  });
});
