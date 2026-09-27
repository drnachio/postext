import { describe, it, expect } from 'vitest';
import { measureHeadingAdvancedDesignHeight } from '../../pipeline/headerFooter';
import { resolveHeadingsConfig } from '../../defaults/headings';
import { resolveDesignSlot } from '../../defaults/headerFooter';
import { layoutDesignSlot } from '../../design/layout';
import { buildDocument } from '../../pipeline';
import type { DesignElement, Dimension, PostextConfig } from '../../types';
import type { VDTDesignTextBlock, VDTPage } from '../../vdt';

// EF-56: a design text's `lineHeight` written as a Dimension (as every
// other leading in the config is) made the opener measurement NaN, and the
// whole opener reservation was dropped without a word. A Dimension is now
// accepted: `em` / `rem` are the multiplier, an absolute length sets the
// distance between baselines. Nothing yields NaN.

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

const DPI = 72; // 1pt = 1px
const pt = (value: number) => ({ value, unit: 'pt' as const });
const heading = { titleText: 'Line one\nLine two\nLine three', formattedNumber: '', chapterNumber: '' };

const titleWith = (lineHeight: unknown): DesignElement => ({
  kind: 'text', id: 'title', content: '{titleText}', fontSize: pt(20), overflow: 'wrap',
  placement: { anchor: { to: 'container', edge: 'top-left' } },
  lineHeight,
} as DesignElement);

const measure = (lineHeight: unknown, minHeight?: Dimension) => {
  const level = resolveHeadingsConfig({
    levels: [{ level: 1, advancedDesign: { enabled: true, slot: { elements: [titleWith(lineHeight)] }, ...(minHeight ? { minHeight } : {}) } }],
  }).levels.find((l) => l.level === 1)!;
  return measureHeadingAdvancedDesignHeight(level, heading, 320, DPI, {}, 0);
};

describe('EF-56: design text lineHeight as a Dimension', () => {
  it('a number is the multiplier of the font size (unchanged)', () => {
    expect(measure(1.5)).toBeCloseTo(3 * 30, 5);
    expect(measure(undefined)).toBeCloseTo(3 * 24, 5);
  });

  it('an absolute length is the distance between baselines', () => {
    expect(measure({ value: 15.5, unit: 'pt' })).toBeCloseTo(3 * 15.5, 5);
    expect(measure({ value: 10, unit: 'mm' })).toBeCloseTo(3 * (10 / 25.4) * 72, 5);
  });

  it('em / rem are the multiplier', () => {
    expect(measure({ value: 1.5, unit: 'em' })).toBeCloseTo(3 * 30, 5);
    expect(measure({ value: 1.25, unit: 'rem' })).toBeCloseTo(3 * 25, 5);
  });

  it('an unusable value falls back to the default leading, never NaN', () => {
    // A numeric string (a hand-written JSON config) is the number it spells.
    expect(measure('1.4')).toBeCloseTo(3 * 28, 5);
    for (const bad of ['tall', null, -2, 0, Number.NaN, { value: 'x', unit: 'pt' }, { unit: 'pt' }, { value: 2, unit: 'furlong' }]) {
      const h = measure(bad);
      expect(Number.isFinite(h)).toBe(true);
      expect(h).toBeCloseTo(3 * 24, 5);
    }
  });

  it('keeps the opener minHeight whatever the leading', () => {
    expect(measure({ value: 15.5, unit: 'pt' }, pt(200))).toBe(200);
  });

  it('an element another malformed value leaves without a finite box reserves nothing, and minHeight holds', () => {
    const broken = { ...titleWith(1.2), fontSize: { value: 'big', unit: 'pt' } } as unknown as DesignElement;
    const level = resolveHeadingsConfig({
      levels: [{ level: 1, advancedDesign: { enabled: true, minHeight: pt(50), slot: { elements: [broken] } } }],
    }).levels.find((l) => l.level === 1)!;
    expect(measureHeadingAdvancedDesignHeight(level, heading, 320, DPI, {}, 0)).toBe(50);
  });

  it('the resolved element keeps a multiplier in lineHeight and an absolute length in lineHeightLength', () => {
    const slot = resolveDesignSlot({ elements: [titleWith({ value: 1.5, unit: 'em' }), { ...titleWith({ value: 15.5, unit: 'pt' }), id: 'abs' } as DesignElement] });
    const [em, abs] = slot.elements as Extract<(typeof slot.elements)[number], { kind: 'text' }>[];
    expect(em!.lineHeight).toBe(1.5);
    expect(em!.lineHeightLength).toBeUndefined();
    // The equivalent multiplier, for editors; the length wins at layout.
    expect(abs!.lineHeight).toBeCloseTo(15.5 / 20, 5);
    expect(abs!.lineHeightLength).toEqual({ value: 15.5, unit: 'pt' });
  });

  it('lays the lines out at the absolute leading', () => {
    const slot = resolveDesignSlot({ elements: [titleWith({ value: 15.5, unit: 'pt' })] }, 'header');
    const page = { index: 0, pageLabel: '1' } as unknown as VDTPage;
    const out = layoutDesignSlot(slot, {
      container: { x: 0, y: 0, width: 320, height: 400 }, dpi: DPI,
      placeholders: { kind: 'heading', page, allPages: [page], metadata: {}, chapterTitleByPageIndex: [], heading },
    }, 0);
    const text = out.primitives.find((p) => p.kind === 'text') as { lines: { baselineY: number }[] };
    const baselines = text.lines.map((l) => l.baselineY);
    expect(baselines[1]! - baselines[0]!).toBeCloseTo(15.5, 5);
    expect(baselines[2]! - baselines[1]!).toBeCloseTo(15.5, 5);
  });

  it('an H1 opener with a Dimension leading keeps its reservation in a built document', () => {
    const cfg: PostextConfig = {
      page: { dpi: DPI, width: pt(360), height: pt(480), margins: { top: pt(18), bottom: pt(18), left: pt(18), right: pt(18) } },
      headings: { levels: [{
        level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' },
        advancedDesign: { enabled: true, minHeight: pt(120), slot: { elements: [titleWith({ value: 15.5, unit: 'pt' })] } },
      }] },
    };
    const doc = buildDocument({ markdown: '# Opening\n\nBody text after the opener.' }, cfg);
    const page = doc.pages[0]!;
    expect(page.openerBand).toBeDefined();
    const title = page.openerBand!.blocks.find((b) => b.kind === 'text') as VDTDesignTextBlock | undefined;
    expect(title).toBeDefined();
    const body = page.columns.flatMap((c) => c.blocks).find((b) => b.type === 'paragraph')!;
    // The body starts below the reserved band (minHeight 120 from the content top at 18).
    expect(body.bbox.y).toBeGreaterThanOrEqual(18 + 120 - 0.01);
  });
});
