import { describe, it, expect } from 'vitest';
import { verticalOrientation, verticalRuns, uaxVerticalOrientation, isVerticalCell } from '../../writingMode';
import { composeCjkParagraph } from '../../measure/cjkCompose';
import { cachedMeasureRichBlock, createMeasurementCache } from '../../measure';
import { fontFamilyOf, measureCentralBaseline, withMeasureWritingMode } from '../../measure/vertical';
import { graphemesOf } from '../../measure/graphemes';

// Proportional marks, as Noto CJK draws them without `fwid`: — 0.89 em,
// · 0.33 em; Han and fullwidth forms 1 em, Latin ½ em.
const SIZE_RE = /(\d*\.?\d+)px/;
class Ctx {
  font = '10px Test';
  measureText(s: string): TextMetrics {
    const em = Number(SIZE_RE.exec(this.font)?.[1] ?? 10);
    let w = 0;
    for (const ch of s) {
      const cp = ch.codePointAt(0)!;
      if (ch === '—') w += 0.89 * em;
      else if (ch === '·') w += 0.33 * em;
      else if (ch === ' ') w += 0.25 * em;
      else w += cp >= 0x2e80 || ch === '…' ? em : 0.5 * em;
    }
    // The ink of 國 in a face whose em box runs from −0.1 to 0.9 em.
    return { width: w, actualBoundingBoxAscent: em * 0.86, actualBoundingBoxDescent: em * 0.06 } as TextMetrics;
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext() {
    return new Ctx();
  }
};

const o = (ch: string, region: 'mainland' | 'taiwan' | 'hongkong' = 'mainland') => verticalOrientation(ch, region);

describe('verticalOrientation (UAX #50 with the Chinese rules)', () => {
  it('stands Han, kana, bopomofo, hangul and fullwidth forms upright', () => {
    for (const ch of ['紅', '樓', '夢', '々', '〇', 'あ', 'ア', 'ㄅ', '한', 'Ａ', '１', '％', '①', '𠀀']) {
      expect(o(ch).orient).toBe('upright');
      expect(o(ch, 'taiwan').orient).toBe('upright');
    }
  });

  it('never turns the pause and stop marks: mainland to the upper right, Taiwan and Hong Kong centred as they are', () => {
    for (const ch of ['、', '。', '，', '．', '！', '？', '：', '；']) {
      expect(o(ch, 'taiwan')).toEqual({ orient: 'upright' });
      expect(o(ch, 'hongkong')).toEqual({ orient: 'upright' });
    }
    // 、。，． in the top-right corner (CORNER_OFFSET_EM); ！？ and ：； in the
    // right half, as Noto Serif SC's `vert` glyphs sit: they must not climb
    // into the cell above.
    for (const ch of ['、', '。', '，', '．']) expect(o(ch)).toEqual({ orient: 'alternate', fallback: 'corner' });
    for (const ch of ['！', '？']) expect(o(ch)).toEqual({ orient: 'alternate', fallback: 'corner', offset: { x: 0.5, y: -0.08 } });
    for (const ch of ['：', '；']) expect(o(ch)).toEqual({ orient: 'alternate', fallback: 'corner', offset: { x: 0.52, y: -0.22 } });
    // UAX #50 alone would turn ：； (Tr, the Japanese convention).
    expect(uaxVerticalOrientation('：'.codePointAt(0)!)).toBe('Tr');
    expect(uaxVerticalOrientation('。'.codePointAt(0)!)).toBe('Tu');
  });

  it('gives brackets and quotes their vertical form, turned about the em box without one', () => {
    for (const ch of ['「', '」', '『', '』', '（', '）', '《', '》', '〈', '〉', '【', '】', '〔', '〕', '〖', '〗', '［', '］', '｛', '｝']) {
      expect(o(ch)).toEqual({ orient: 'alternate', fallback: 'rotate' });
      expect(o(ch, 'taiwan')).toEqual({ orient: 'alternate', fallback: 'rotate' });
    }
  });

  it('reads “ ” ‘ ’ as corner brackets in mainland text, turns them in Taiwan', () => {
    expect(o('“')).toEqual({ orient: 'alternate', fallback: 'rotate', substitute: '『' });
    expect(o('”')).toEqual({ orient: 'alternate', fallback: 'rotate', substitute: '』' });
    expect(o('‘')).toEqual({ orient: 'alternate', fallback: 'rotate', substitute: '「' });
    expect(o('’')).toEqual({ orient: 'alternate', fallback: 'rotate', substitute: '」' });
    expect(o('“', 'taiwan')).toEqual({ orient: 'alternate', fallback: 'rotate' });
  });

  it('turns dashes, ellipses, the wave dash and the interpunct about the em box, stretching the dashes', () => {
    expect(o('—')).toEqual({ orient: 'rotate', stretch: true });
    expect(o('⸺')).toEqual({ orient: 'rotate', stretch: true });
    expect(o('–')).toEqual({ orient: 'rotate', stretch: true });
    for (const ch of ['…', '⋯', '～', '〜', '·', '‧']) expect(o(ch)).toEqual({ orient: 'rotate' });
    expect(uaxVerticalOrientation('—'.codePointAt(0)!)).toBe('R');
  });

  it('keeps the Latin hyphens ‐ ‑ ‒ sideways with the word they join', () => {
    for (const ch of ['‐', '‑', '‒']) expect(o(ch).orient).toBe('sideways');
    expect(verticalRuns(graphemesOf('e‑mail'), 'mainland').map((r) => r.text)).toEqual(['e‑mail']);
  });

  it('runs an apostrophe or an interpunct inside a Latin word sideways with it, as the composer measures it', () => {
    expect(verticalRuns(graphemesOf('他的iPhone’s'), 'mainland').map((r) => r.text)).toEqual(['他', '的', 'iPhone’s']);
    expect(verticalRuns(graphemesOf('col·lecció'), 'taiwan').map((r) => r.text)).toEqual(['col·lecció']);
    // Between Chinese characters, or at an edge, they are Chinese marks.
    expect(verticalRuns(graphemesOf('賈·寶'), 'taiwan').map((r) => r.text)).toEqual(['賈', '·', '寶']);
    expect(verticalRuns(graphemesOf('好’'), 'taiwan').map((r) => r.text)).toEqual(['好', '’']);
  });

  it('sizes the cells of a run: half an em for the mainland interpunct', () => {
    expect(verticalRuns(graphemesOf('賈·寶'), 'mainland').map((r) => r.cell)).toEqual([1, 0.5, 1]);
    expect(verticalRuns(graphemesOf('賈·寶'), 'taiwan').map((r) => r.cell)).toEqual([1, 1, 1]);
    expect(verticalRuns(graphemesOf('3×4'), 'taiwan').map((r) => [r.text, r.cell])).toEqual([['3', undefined], ['×', 1], ['4', undefined]]);
  });

  it('sets Latin, ASCII digits and most symbols sideways', () => {
    for (const ch of ['i', 'P', '1', '9', '%', '-', '(', '@', 'é', 'Ω']) expect(o(ch).orient).toBe('sideways');
    expect(isVerticalCell('i')).toBe(false);
    expect(isVerticalCell('紅')).toBe(true);
  });

  it('cuts a line into sideways runs and cells', () => {
    const runs = verticalRuns(graphemesOf('用iPhone 15拍「紅樓夢」——'), 'taiwan');
    expect(runs.map((r) => [r.text, r.glyph.orient])).toEqual([
      ['用', 'upright'],
      ['iPhone 15', 'sideways'],
      ['拍', 'upright'],
      ['「', 'alternate'],
      ['紅', 'upright'], ['樓', 'upright'], ['夢', 'upright'],
      ['」', 'alternate'],
      ['—', 'rotate'], ['—', 'rotate'],
    ]);
  });
});

describe('vertical measurement', () => {
  const FONT = '10px Test';
  const span = (text: string) => ({ text, bold: false, italic: false });
  const lineWidths = (text: string, mode?: 'vertical-rl' | 'horizontal-tb') =>
    composeCjkParagraph([span(text)], FONT, FONT, FONT, FONT, 1000, 16, mode ? { writingMode: mode } : undefined)
      .lines.map((l) => l.segments!.reduce((s, seg) => s + seg.width, 0));

  it('gives every character that stands in a cell its cell, dashes included, the interpunct half an em in mainland text', () => {
    // 他說——賈·寶玉: 7 one-em cells and the interpunct's.
    expect(withMeasureWritingMode('horizontal-tb', () => lineWidths('他說——賈·寶玉', 'vertical-rl')[0], 'taiwan')).toBeCloseTo(80);
    expect(withMeasureWritingMode('horizontal-tb', () => lineWidths('他說——賈·寶玉', 'vertical-rl')[0], 'mainland')).toBeCloseTo(75);
    // Horizontal: the dash and the interpunct are set in Chinese boxes
    // whatever their glyphs' widths (#185), the mainland interpunct in half
    // an em as down the line, even with no composition.
    expect(lineWidths('他說——賈·寶玉')[0]).toBeCloseTo(75);
  });

  it('keeps the horizontal advance of a Latin word set sideways', () => {
    expect(lineWidths('用iPhone拍', 'vertical-rl')[0]).toBeCloseTo(10 + 6 * 5 + 10);
  });

  it('keys cached measurements by writing mode', () => {
    const cache = createMeasurementCache();
    const measure = (writingMode?: 'vertical-rl') =>
      // × stands in a cell down the line, and is half an em across.
      cachedMeasureRichBlock([span('他說3×4我不去')], FONT, FONT, FONT, FONT, 1000, 16, writingMode ? { writingMode } : undefined, cache)
        .lines[0]!.segments!.reduce((s, seg) => s + seg.width, 0);
    const h = measure();
    const v = measure('vertical-rl');
    expect(v).not.toBeCloseTo(h);
    expect(measure()).toBeCloseTo(h);
  });

  it('measures the central baseline of a family from the ink of 國', () => {
    // (0.86 − 0.06) / 2 = 0.4 em above the baseline.
    expect(measureCentralBaseline('Test Serif')).toBeCloseTo(0.4);
    expect(fontFamilyOf('bold italic 12.5px "Noto Serif TC", serif')).toBe('Noto Serif TC');
    expect(fontFamilyOf('400 10px LXGW WenKai TC')).toBe('LXGW WenKai TC');
  });
});
