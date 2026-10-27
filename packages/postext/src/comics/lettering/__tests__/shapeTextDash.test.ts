import { describe, it, expect, afterEach } from 'vitest';
import { clearTextWidthCache } from '../../../measure/canvas.js';
import { cjkCompositionOf, getCjkComposition, PLAIN_CJK_COMPOSITION, setCjkComposition } from '../../../measure/cjk/cjkPunctuation.js';
import { resolveCjkConfig } from '../../../defaults/text/cjk.js';
import { prepareText, readLetteringText } from '../text.js';
import { shapeText } from '../shape-text.js';
import { presetLetteringStyles } from '../presets.js';
import type { InlineSpan } from '../../../parse/types.js';

// #723: the lines of a balloon are chosen with the widths they are set
// at. A line the design-text layout sets with the CJK composer (#637) is
// measured by composing it, so a 破折号 counts its two cells of one em in
// the shaping as on the set line (#652), and a mark the composer sets in
// a cell wider than its glyph counts the cell. What the document's
// composition takes off a line (a mark set in half an em) or adds between
// Han and Latin is not measured: those lines are measured as before. The
// stub is the one of `design/cjkDesignDash.test.ts` (Noto Serif SC's
// dash, 0.89 em wide; Han and full-width marks one em; everything under
// U+2E80 half an em, the curly quotation marks among them).

const EM = 20;
const SIZE_RE = /(\d*\.?\d+)px/;
interface Glyph { advance: number; left: number; right: number; top: number; bottom: number }
const GLYPHS: Record<string, Glyph> = {
  '—': { advance: 0.89, left: 0.043, right: 0.846, top: 0.293, bottom: 0.242 },
  '…': { advance: 1, left: 0.111, right: 0.889, top: 0.436, bottom: 0.324 },
};
const HAN: Glyph = { advance: 1, left: 0.098, right: 0.946, top: 0.822, bottom: -0.079 };
const LATIN: Glyph = { advance: 0.5, left: 0.05, right: 0.45, top: 0.7, bottom: 0 };
const glyph = (ch: string): Glyph => GLYPHS[ch] ?? (ch === ' ' ? { ...LATIN, advance: 0.25, right: 0, left: 0 } : ch.codePointAt(0)! >= 0x2e80 ? HAN : LATIN);
/** The advance of a text at the face's own widths, in px. */
const advances = (s: string): number => [...s].reduce((w, ch) => w + glyph(ch).advance, 0) * EM;
class StubCtx {
  font = `${EM}px Test`;
  letterSpacing = '0px';
  measureText(s: string): TextMetrics {
    const em = Number(SIZE_RE.exec(this.font)?.[1] ?? EM);
    let x = 0;
    let left = Infinity;
    let right = -Infinity;
    let top = -Infinity;
    let bottom = Infinity;
    for (const ch of s) {
      const g = glyph(ch);
      if (g.right > g.left) {
        left = Math.min(left, x + g.left);
        right = Math.max(right, x + g.right);
        top = Math.max(top, g.top);
        bottom = Math.min(bottom, g.bottom);
      }
      x += g.advance;
    }
    if (left === Infinity) return { width: x * em, actualBoundingBoxLeft: 0, actualBoundingBoxRight: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 } as TextMetrics;
    return {
      width: x * em,
      actualBoundingBoxLeft: -left * em,
      actualBoundingBoxRight: right * em,
      actualBoundingBoxAscent: top * em,
      actualBoundingBoxDescent: -bottom * em,
    } as TextMetrics;
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};
clearTextWidthCache();

afterEach(() => setCjkComposition(undefined));

function shape(text: string | InlineSpan[], locale: string, vertical = false) {
  const style = presetLetteringStyles({ fontSizePx: EM, locale, fontFamily: 'Test' })['speech']!;
  const p = prepareText(readLetteringText(text, undefined), style, { locale, vertical });
  return shapeText(p, style, { locale, vertical, dpi: 96 });
}

/** The printed lines of a shaped text. */
const printed = (s: ReturnType<typeof shape>) => s.block.lines.filter((l) => l.text.length > 0);

describe('a balloon line is measured at the width it is set at (#723)', () => {
  for (const [name, text, pairs] of [
    ['one pair', '萝拉——！', 1],
    ['a pair at the start of a line', '他说话了——不要走', 1],
    ['pairs inside a line, at its start and at its end', '他说话了——不要走，他喊——萝拉……你在哪儿？快回来——', 3],
    ['two pairs', '啊——啊——', 2],
  ] as const) {
    it(`horizontal Chinese, ${name}`, () => {
      const s = shape(text, 'zh-Hans');
      const lines = printed(s);
      expect(lines).toHaveLength(s.lines.length);
      s.lines.forEach((l, i) => expect(Math.abs(l.width - lines[i]!.width)).toBeLessThan(0.01));
      // Every pair is two ems on its line, where the face's dashes are 1.78.
      const short = lines.reduce((sum, l) => sum + (l.width - advances(l.text)), 0);
      expect(short).toBeCloseTo(pairs * (2 - 1.78) * EM, 4);
    });
  }

  it('a line that ends its pair and a line that opens with one are both measured', () => {
    const s = shape('他说话了——不要走', 'zh-Hans');
    expect(printed(s).map((l) => l.text)).toEqual(['他说话了', '——不要走']);
    expect(s.lines.map((l) => l.width / EM)).toEqual([4, 5]);
    // The aspect that is scored is the aspect of the block that is set.
    expect(s.aspect).toBeCloseTo(5 / 2.5, 6);
  });

  it('a one-line text is short or long by the width it is set at', () => {
    // Two pairs: 5.56 em at the face's advances, under the 5.5 em a single
    // Chinese line may run to only by the dashes' missing width; 6 em set.
    const s = shape('啊——啊——', 'zh-Hans');
    expect(Math.max(...s.lines.map((l) => l.width))).toBeGreaterThanOrEqual(3 * EM - 0.01);
    for (const l of s.lines) expect(l.width % EM).toBeCloseTo(0, 6);
  });

  it('a mark the composer sets at a width that is not its glyph\'s', () => {
    // The stub's quotation marks are half an em; the composer sets each in
    // a cell of one em.
    const s = shape('他说：“走！”（真的）', 'zh-Hans');
    const lines = printed(s);
    s.lines.forEach((l, i) => expect(Math.abs(l.width - lines[i]!.width)).toBeLessThan(0.01));
    expect(s.lines.reduce((sum, l) => sum + l.width, 0)).toBeCloseTo(11 * EM, 4);
  });

  it('text with inline marks', () => {
    const s = shape([{ text: '萝拉', bold: true, italic: false }, { text: '——！爷爷——', bold: false, italic: false }], 'zh-Hans');
    const lines = printed(s);
    s.lines.forEach((l, i) => expect(Math.abs(l.width - lines[i]!.width)).toBeLessThan(0.01));
    expect(s.lines.reduce((sum, l) => sum + l.width, 0)).toBeCloseTo(9 * EM, 4);
  });

  it('vertical Chinese is measured as before: a dash is a cell in a column', () => {
    const s = shape('萝拉——！', 'zh-Hans', true);
    expect(s.lines.map((l) => l.width)).toEqual([5 * EM]);
    expect(printed(s).map((l) => l.width)).toEqual([5 * EM]);
  });

  it('Japanese keeps the advances of its ――, as the set line does', () => {
    const s = shape('行け――！', 'ja');
    expect(s.lines.map((l) => l.width)).toEqual([advances('行け――！')]);
    expect(printed(s).map((l) => l.width)).toEqual([advances('行け――！')]);
  });

  it('Latin and Arabic lines are measured at the face\'s advances', () => {
    for (const [locale, text] of [['en', 'Wait — do not go, he said'], ['ar', 'هل سمعت ذلك؟ شيء ما يتحرك في القبو']] as const) {
      const s = shape(text, locale);
      const lines = printed(s);
      s.lines.forEach((l, i) => {
        expect(l.width).toBeCloseTo(advances(lines[i]!.text), 6);
        expect(Math.abs(l.width - lines[i]!.width)).toBeLessThan(0.01);
      });
    }
  });

  it('with cjk.composeDesignText off, nothing is composed and the advances are measured', () => {
    setCjkComposition({ ...PLAIN_CJK_COMPOSITION, plainDesignText: true });
    const s = shape('萝拉——！', 'zh-Hans');
    expect(s.lines.map((l) => l.width)).toEqual([advances('萝拉——！')]);
    expect(printed(s).map((l) => l.width)).toEqual([advances('萝拉——！')]);
  });

  describe('under the composition of a Simplified Chinese book (half-width marks, compression, a Han–Latin space)', () => {
    const book = () => setCjkComposition(cjkCompositionOf(resolveCjkConfig(undefined, 'zh-Hans'), 96, 'zh-Hans'));

    it('a pair counts two ems, and the document keeps its composition', () => {
      book();
      const own = getCjkComposition();
      const s = shape('他说话了——不要走', 'zh-Hans');
      expect(s.lines.map((l) => l.width / EM)).toEqual([4, 5]);
      expect(printed(s).map((l) => l.width / EM)).toEqual([4, 5]);
      expect(getCjkComposition()).toBe(own);
    });

    it('a mark the composition sets in half an em is measured whole, as before', () => {
      book();
      const s = shape('快点，老家伙。说句话呀', 'zh-Hans');
      // The lines the shaping chose before #723, measured at the advances.
      expect(printed(s).map((l) => l.text)).toEqual(['快点，', '老家伙。', '说句话呀']);
      expect(s.lines.map((l) => l.width / EM)).toEqual([3, 4, 4]);
      // The set lines give up half an em at each mark.
      expect(printed(s).map((l) => l.width / EM)).toEqual([2.5, 3.5, 4]);
    });

    it('Latin inside Han text is measured without the space the composition opens', () => {
      book();
      const s = shape('第8集：小辣椒的生日', 'zh-Hans');
      for (const [i, l] of printed(s).entries()) expect(s.lines[i]!.width).toBeCloseTo(advances(l.text), 6);
    });
  });
});
