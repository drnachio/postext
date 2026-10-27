import { describe, it, expect, afterEach } from 'vitest';
import { measureRichBlock } from '../../measure/rich.js';
import { measureBlock } from '../../measure/plain.js';
import { cjkCompositionKey, cjkCompositionOf, setCjkComposition } from '../../measure/cjk/cjkPunctuation.js';
import { resolveCjkConfig } from '../../defaults/text/cjk.js';
import { stripConfigDefaults } from '../../defaults/index.js';
import { setCjkLineBreak } from '../../measure/cjk/cjkClasses.js';
import { buildDocument } from '../../pipeline/index.js';
import type { MeasureBlockOptions } from '../../measure/types.js';
import type { VDTLine } from '../../vdt.js';
import type { PostextConfig } from '../../types.js';

// A paragraph does not end on a line holding one character, alone or with
// the marks that may not open a line (孤字, clreq §7.2): the line above
// gives its last character up (push-out) when it can still be justified
// within the tracking cap. Tied to `bodyText.avoidRunts`, which reaches
// the composer as a runt penalty, in both writing modes.

const EM = 16;
class StubCtx {
  font = '';
  letterSpacing = '0px';
  measureText(s: string): { width: number; actualBoundingBoxAscent: number; actualBoundingBoxDescent: number } {
    let w = 0;
    for (const ch of s) w += ch === ' ' ? 4 : ch.codePointAt(0)! >= 0x2e80 ? EM : 8;
    return { width: w, actualBoundingBoxAscent: 0.88 * EM, actualBoundingBoxDescent: 0.12 * EM };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

afterEach(() => {
  setCjkLineBreak('gb');
  setCjkComposition(undefined);
});

const FONT = '16px Test';
const RUNTS: MeasureBlockOptions = { textAlign: 'justify', runtPenalty: 1000, runtMinCharacters: 20 };

/** The lines of `text` on both paths (plain, and formatted with one span),
 *  which must agree. */
function both(text: string, measure: number, options: MeasureBlockOptions): VDTLine[] {
  const plain = measureBlock(text, FONT, measure, 24, options).lines;
  const rich = measureRichBlock([{ text, bold: false, italic: false }], FONT, FONT, FONT, FONT, measure, 24, options).lines;
  expect(rich.map((l) => l.text)).toEqual(plain.map((l) => l.text));
  return plain;
}
const texts = (lines: VDTLine[]): string[] => lines.map((l) => l.text);

// 紅樓夢, chapter 1: twenty-one characters and a full stop.
const HLM = '此開卷第一回也作者自云因曾歷過一番夢幻之後。';

describe('孤字: a paragraph does not end on one character', () => {
  it('first-fit leaves 後。 alone on the last line; the line above gives up 之', () => {
    expect(texts(both(HLM, 10 * EM, { textAlign: 'justify' }))).toEqual(['此開卷第一回也作者自', '云因曾歷過一番夢幻之', '後。']);
    const lines = both(HLM, 10 * EM, RUNTS);
    expect(texts(lines)).toEqual(['此開卷第一回也作者自', '云因曾歷過一番夢幻', '之後。']);
    // The shortened line is still justified to the measure, within the cap.
    expect(lines[1]!.cjkLoose).toBeUndefined();
    expect(lines[1]!.segments!.reduce((s, seg) => s + seg.width, 0)).toBeCloseTo(10 * EM, 6);
  });

  it('pulls the character down with the marks that close it: 說。” stays together', () => {
    const text = '此開卷第一回也作者自云因曾歷過一番夢幻說。”';
    expect(texts(both(text, 10 * EM, { textAlign: 'justify' })).at(-1)).toBe('說。”');
    expect(texts(both(text, 10 * EM, RUNTS)).at(-1)).toBe('幻說。”');
  });

  it('keeps the runt when the line above would spread past the tracking cap', () => {
    // Three characters a line: the second line would keep two, one em
    // apart, past the half-em cap.
    const text = '甲乙丙丁戊己庚';
    const lines = both(text, 3 * EM, RUNTS);
    expect(texts(lines)).toEqual(['甲乙丙', '丁戊己', '庚']);
    expect(lines.some((l) => l.cjkLoose)).toBe(false);
  });

  it('sets a ragged paragraph the same way, its line above one character short', () => {
    expect(texts(both(HLM, 10 * EM, { ...RUNTS, textAlign: 'left' }))).toEqual(['此開卷第一回也作者自', '云因曾歷過一番夢幻', '之後。']);
  });

  it('does the same in vertical text', () => {
    const lines = both(HLM, 10 * EM, { ...RUNTS, writingMode: 'vertical-rl' });
    expect(texts(lines)).toEqual(['此開卷第一回也作者自', '云因曾歷過一番夢幻', '之後。']);
    expect(lines[1]!.cjkLoose).toBeUndefined();
  });

  it('leaves the paragraph as first-fit set it without the runt penalty', () => {
    expect(texts(both(HLM, 10 * EM, { textAlign: 'justify', runtPenalty: 0 })).at(-1)).toBe('後。');
  });
});

describe('孤字 in a document: bodyText.avoidRunts', () => {
  const pt = (value: number) => ({ value, unit: 'pt' as const });
  const config = (extra: PostextConfig['bodyText'] = {}, writingMode: 'horizontal-tb' | 'vertical-rl' = 'horizontal-tb'): PostextConfig => ({
    locale: 'zh-Hant',
    page: { width: pt(200), height: pt(400), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
    layout: { layoutType: 'single', writingMode },
    bodyText: { fontSize: pt(16), lineHeight: pt(24), textAlign: 'justify', firstLineIndent: pt(0), ...extra },
    header: { elements: [] },
    footer: { elements: [] },
  });
  const lastLines = (doc: ReturnType<typeof buildDocument>) => doc.pages[0]!.columns[0]!.blocks.map((b) => b.lines.at(-1)!.text);

  it('is on by default, in both writing modes, and off with avoidRunts: false', () => {
    // The column holds exactly ten characters a line (160 pt).
    for (const mode of ['horizontal-tb', 'vertical-rl'] as const) {
      const cfg = config({}, mode);
      if (mode === 'vertical-rl') cfg.page = { width: pt(400), height: pt(200), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } };
      expect(lastLines(buildDocument({ markdown: HLM }, cfg)), mode).toEqual(['之後。']);
      const off = config({ avoidRunts: false }, mode);
      off.page = cfg.page;
      expect(lastLines(buildDocument({ markdown: HLM }, off)), mode).toEqual(['後。']);
    }
  });
});

// A paragraph does not end on one character (clreq §7.1.2, 孤字不成行;
// JLReq §3.5.4 takes the same care), on a character grid as off it: a
// line that is not justified gives its last character up and stands one
// cell short, as up to 1.27. Manuscript paper (`cjk.grid.fullLines`, #718)
// keeps every cell of such a line instead, and the paragraph keeps its
// lines as first broken.
describe('孤字 on a character grid (#718)', () => {
  const pt = (value: number) => ({ value, unit: 'pt' as const });
  const K = '一二三四五六七八九十';
  // 41 characters: two full lines of 20 and one character.
  const P41 = K.repeat(4) + '終';
  const config = (
    locale: string,
    body: PostextConfig['bodyText'] = {},
    writingMode: 'horizontal-tb' | 'vertical-rl' = 'horizontal-tb',
    grid: false | 'grid' | 'fullLines' = 'fullLines',
  ): PostextConfig => {
    const along = pt(20 * 16 + 40);
    const across = pt(20 * 24 + 40);
    return {
      locale,
      page: {
        width: writingMode === 'vertical-rl' ? across : along,
        height: writingMode === 'vertical-rl' ? along : across,
        dpi: 72,
        margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) },
      },
      layout: { layoutType: 'single', writingMode },
      bodyText: { fontSize: pt(16), lineHeight: pt(24), textAlign: 'left', firstLineIndent: pt(0), ...body },
      header: { elements: [] },
      footer: { elements: [] },
      ...(grid ? { cjk: { grid: { enabled: true, charsPerLine: 20, linesPerPage: 20, ...(grid === 'fullLines' ? { fullLines: true } : {}) } } } : {}),
    };
  };
  const lines = (cfg: PostextConfig): VDTLine[] => buildDocument({ markdown: P41 }, cfg).pages[0]!.columns[0]!.blocks.flatMap((b) => b.lines);
  const counts = (ls: VDTLine[]): number[] => ls.map((l) => [...l.text].length);
  const advance = (l: VDTLine): number => l.segments!.reduce((s, seg) => s + seg.width, 0);

  for (const locale of ['ja', 'zh-Hans', 'zh-Hant']) {
    for (const mode of ['horizontal-tb', 'vertical-rl'] as const) {
      it(`${locale}, ${mode}: on a grid a ragged paragraph gives the character up, as up to 1.27`, () => {
        expect(counts(lines(config(locale, {}, mode, 'grid')))).toEqual([20, 19, 2]);
        expect(counts(lines(config(locale, { textAlign: 'center' }, mode, 'grid')))).toEqual([20, 19, 2]);
        // The same lines as off the grid.
        expect(counts(lines(config(locale, {}, mode, false)))).toEqual([20, 19, 2]);
      });

      it(`${locale}, ${mode}: with fullLines a paragraph that is not justified keeps every full line full`, () => {
        expect(counts(lines(config(locale, {}, mode)))).toEqual([20, 20, 1]);
        expect(counts(lines(config(locale, { textAlign: 'center' }, mode)))).toEqual([20, 20, 1]);
      });

      it(`${locale}, ${mode}: a justified paragraph gives up the character either way, its line spread`, () => {
        for (const grid of ['grid', 'fullLines'] as const) {
          const set = lines(config(locale, { textAlign: 'justify' }, mode, grid));
          expect(counts(set), grid).toEqual([20, 19, 2]);
          expect(set[1]!.cjkLoose).toBeUndefined();
          expect(advance(set[1]!)).toBeCloseTo(20 * 16, 6);
        }
      });
    }
  }

  it('avoidRunts: false leaves the lone character on a grid, justified or not', () => {
    for (const grid of ['grid', 'fullLines'] as const) {
      expect(counts(lines(config('ja', { avoidRunts: false }, 'horizontal-tb', grid)))).toEqual([20, 20, 1]);
      expect(counts(lines(config('ja', { avoidRunts: false, textAlign: 'justify' }, 'horizontal-tb', grid)))).toEqual([20, 20, 1]);
    }
  });

  it('fullLines is read as a boolean, off without the grid, and stripped at its default', () => {
    expect(resolveCjkConfig({}, 'ja').grid.fullLines).toBe(false);
    expect(resolveCjkConfig({ grid: { enabled: true } }, 'ja').grid.fullLines).toBe(false);
    expect(resolveCjkConfig({ grid: { enabled: true, fullLines: true } }, 'ja').grid.fullLines).toBe(true);
    expect(resolveCjkConfig({ grid: { fullLines: true } }, 'ja').grid.fullLines).toBe(false);
    expect(resolveCjkConfig({ grid: { enabled: true, fullLines: 'yes' as unknown as boolean } }, 'ja').grid.fullLines).toBe(false);
    expect(stripConfigDefaults({ cjk: { grid: { enabled: true, fullLines: false } } }).cjk).toEqual({ grid: { enabled: true } });
    expect(stripConfigDefaults({ cjk: { grid: { enabled: true, fullLines: true } } }).cjk).toEqual({ grid: { enabled: true, fullLines: true } });
  });

  it('the composer reads the rule from the composition alone', () => {
    const of = (grid: NonNullable<PostextConfig['cjk']>['grid']) => cjkCompositionOf(resolveCjkConfig({ grid }, 'zh-Hant'), 72, 'zh-Hant');
    const full: MeasureBlockOptions = { ...RUNTS, textAlign: 'left', cjkComposition: of({ enabled: true, charsPerLine: 10, linesPerPage: 10, fullLines: true }) };
    expect(texts(both(HLM, 10 * EM, full))).toEqual(['此開卷第一回也作者自', '云因曾歷過一番夢幻之', '後。']);
    expect(texts(both(HLM, 10 * EM, { ...full, textAlign: 'justify' }))).toEqual(['此開卷第一回也作者自', '云因曾歷過一番夢幻', '之後。']);
    // A grid alone sets a ragged paragraph as 1.27 did.
    const plain: MeasureBlockOptions = { ...RUNTS, textAlign: 'left', cjkComposition: of({ enabled: true, charsPerLine: 10, linesPerPage: 10 }) };
    expect(texts(both(HLM, 10 * EM, plain))).toEqual(['此開卷第一回也作者自', '云因曾歷過一番夢幻', '之後。']);
  });

  it('is part of the composition key only where set', () => {
    const key = (cjk: PostextConfig['cjk']): string => cjkCompositionKey(cjkCompositionOf(resolveCjkConfig(cjk, 'zh-Hans'), 96, 'zh-Hans'));
    const plain = key({});
    expect(cjkCompositionOf(resolveCjkConfig({}, 'zh-Hans'), 96, 'zh-Hans').gridFullLines).toBeUndefined();
    expect(key({ grid: { enabled: false } })).toBe(plain);
    // A grid alone keeps the key of 1.27.
    expect(key({ grid: { enabled: true, charsPerLine: 20, linesPerPage: 20 } })).toBe(plain);
    expect(key({ grid: { fullLines: true } })).toBe(plain);
    expect(key({ grid: { enabled: true, charsPerLine: 20, linesPerPage: 20, fullLines: true } })).toBe(`${plain}:g`);
  });
});
