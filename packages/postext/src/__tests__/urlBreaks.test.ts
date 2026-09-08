import { describe, it, expect } from 'vitest';
import { measureRichBlock, urlBreakIndices } from '../measure/rich';
import type { InlineSpan } from '../parse';

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const FONT = '16px Test';
const URL = 'https://onlinelibrary.wiley.com/doi/10.1111/j.1365-2648.2012.06064.x';
const TEXT = `Disponible en: ${URL}`;
const spans: InlineSpan[] = [{ text: TEXT, bold: false, italic: false }];

/** Every glyph laid out, spaces dropped (line ends trim them): equal to the
 *  source text iff no hyphen was added at any break. */
function joined(lines: ReturnType<typeof measureRichBlock>['lines']): string {
  return lines.map((l) => l.segments!.map((s) => s.text).join('')).join('').replace(/\s+/g, '');
}

describe('bare break opportunities inside URLs', () => {
  it('breaks after slashes and before dots, never inside the scheme', () => {
    const idx = urlBreakIndices(URL);
    const pieces = idx.map((i) => URL[i - 1]! + '|' + URL[i]!);
    expect(pieces).toContain('/|d'); // after "…com/"
    expect(pieces).toContain('y|.'); // before ".wiley"
    expect(pieces).not.toContain('/|o'); // not after "https://"
    expect(urlBreakIndices('short')).toEqual([]);
  });

  it('lets Knuth-Plass break a long URL across lines without adding hyphens or loose lines', () => {
    // 84 chars × 7px = 588px of text on a 300px measure.
    const block = measureRichBlock(spans, FONT, FONT, FONT, FONT, 300, 20, {
      textAlign: 'justify',
      optimal: true,
      maxStretchRatio: 2,
      minShrinkRatio: 0.6,
    });
    expect(block.lines.length).toBeGreaterThan(1);
    expect(joined(block.lines)).toBe(TEXT.replace(/\s+/g, ''));
    for (const line of block.lines) {
      expect(line.segments!.reduce((s, seg) => s + seg.width, 0)).toBeLessThanOrEqual(300);
      if (line.justifiedSpaceRatio !== undefined) expect(line.justifiedSpaceRatio).toBeLessThanOrEqual(2);
    }
  });

  it('does the same on the greedy path', () => {
    const block = measureRichBlock(spans, FONT, FONT, FONT, FONT, 300, 20, { textAlign: 'left' });
    expect(block.lines.length).toBeGreaterThan(1);
    expect(joined(block.lines)).toBe(TEXT.replace(/\s+/g, ''));
    for (const line of block.lines) {
      expect(line.segments!.reduce((s, seg) => s + seg.width, 0)).toBeLessThanOrEqual(300);
    }
  });
});
