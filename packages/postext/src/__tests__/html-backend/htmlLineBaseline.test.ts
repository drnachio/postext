import { describe, it, expect, beforeEach } from 'vitest';
import { buildDocument } from '../../pipeline/index.js';
import { renderToHtml } from '../../html-backend/html-backend.js';
import { clearTextWidthCache } from '../../measure/canvas.js';
import type { PostextConfig } from '../../types.js';

// A line box stands its text on the line's baseline, which the engine puts
// at 0.8 of the leading (`lineBaselineOffset`) and the canvas and the PDF
// paint on. A box left at `line-height: normal` stands it on the face's own
// ascent instead, while the band of a `:mark[…]`, an emphasis mark, a
// formula and a leader are all placed from the baseline: with a leading
// away from the face's natural line they drift apart. The box takes the
// `line-height` that brings the two together — a box of height L sets its
// text `(L + ascent − descent) / 2` from its top.

/** A measurer whose faces have a line box, as a browser's has: 7 px a
 *  character, and the ascent and descent of `box`. */
let box: { ascent: number; descent: number } | null = { ascent: 0.75, descent: 0.25 };
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const size = Number(/([\d.]+)px/.exec(this.font)?.[1] ?? 10);
    return {
      width: s.length * 7,
      ...(box ? { fontBoundingBoxAscent: box.ascent * size, fontBoundingBoxDescent: box.descent * size } : {}),
    };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config = (lineHeight: number): PostextConfig => ({
  page: { dpi: 72, width: pt(300), height: pt(500), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: 'Test', fontSize: pt(10), lineHeight: pt(lineHeight), textAlign: 'left', hyphenation: { enabled: false } },
});

/** The first body line's box: its height, its font size and the
 *  `line-height` it was given (undefined where it has none). */
function lineBox(html: string): { height: number; size: number; lineHeight?: number } {
  const style = /<div class="pt-line" data-block="[^"]*" style="([^"]*)"/.exec(html)?.[1];
  if (style === undefined) throw new Error('no line box in the markup');
  const decl = new Map<string, string>();
  for (const part of style.split(';')) {
    const colon = part.indexOf(':');
    if (colon > 0) decl.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim());
  }
  const px = (value: string | undefined) => (value?.endsWith('px') ? Number(value.slice(0, -2)) : undefined);
  const size = (decl.get('font') ?? '').split(' ').map(px).find((v) => v !== undefined);
  const height = px(decl.get('height'));
  if (height === undefined || size === undefined) throw new Error('no line box in the markup');
  const lineHeight = px(decl.get('line-height'));
  return { height, size, ...(lineHeight !== undefined ? { lineHeight } : {}) };
}

const TEXT = 'The quick brown fox jumps over the lazy dog.';

describe('a line box stands its text on the line baseline', () => {
  beforeEach(() => {
    box = { ascent: 0.75, descent: 0.25 };
    clearTextWidthCache();
  });

  it('gives the box the line height that puts the baseline at 0.8 of the leading', () => {
    for (const leading of [11, 15, 20]) {
      const doc = buildDocument({ markdown: TEXT }, config(leading));
      const { height, size, lineHeight } = lineBox(renderToHtml(doc));
      expect(lineHeight).toBeDefined();
      // Where a box of that height sets its text, as a browser does.
      const baseline = (lineHeight! + (0.75 - 0.25) * size) / 2;
      expect(baseline).toBeCloseTo(0.8 * height, 3);
    }
  });

  it('is written after `font:`, which would reset it to `normal`', () => {
    const doc = buildDocument({ markdown: TEXT }, config(15));
    const html = renderToHtml(doc);
    const style = /<div class="pt-line" data-block="[^"]*" style="([^"]*)"/.exec(html)![1]!;
    expect(style.indexOf('line-height:')).toBeGreaterThan(style.indexOf('font:'));
  });

  it('leaves the box at `normal` where the measurer gives no face metrics', () => {
    box = null;
    clearTextWidthCache();
    const doc = buildDocument({ markdown: TEXT }, config(15));
    expect(lineBox(renderToHtml(doc)).lineHeight).toBeUndefined();
  });
});
