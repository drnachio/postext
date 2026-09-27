import { describe, it, expect } from 'vitest';
import type { DesignFrames } from '../../design/layout';
import { measureHeadingAdvancedDesignHeight } from '../../pipeline/headerFooter';
import { resolveHeadingsConfig } from '../../defaults/headings';
import { buildDocument } from '../../pipeline';
import type { DesignElement, ElementAnchor, PostextConfig } from '../../types';
import type { VDTDocument } from '../../vdt';

// Deterministic text measurement stub (no DOM in the node test env).
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

const DPI = 72; // 1pt = 1px keeps the arithmetic readable.
const pt = (value: number) => ({ value, unit: 'pt' as const });
const red = { hex: '#cc0000', model: 'hex' as const };

const frames: DesignFrames = {
  page: { x: 0, y: 0, width: 400, height: 600 },
  bleed: { x: 0, y: 0, width: 400, height: 600 },
};
// The heading's top sits 40px below the page top.
const origin = { x: 40, y: 40 };
const heading = { titleText: 'Certificate', formattedNumber: '', chapterNumber: '' };

const box = (id: string, anchor: ElementAnchor, size: { width?: 'fill' | { value: number; unit: 'pt' }; height?: 'fill' | { value: number; unit: 'pt' } }, extra: Partial<DesignElement> = {}): DesignElement => ({
  kind: 'box',
  id,
  placement: { anchor, size },
  style: { backgroundColor: red },
  ...extra,
} as DesignElement);
const title: DesignElement = {
  kind: 'text',
  id: 'title',
  content: '{titleText}',
  fontSize: pt(20),
  overflow: 'wrap',
  placement: { anchor: { to: 'container', edge: 'top-left' } },
};
const levelOf = (elements: DesignElement[], minHeight?: number) =>
  resolveHeadingsConfig({
    levels: [{ level: 1, advancedDesign: { enabled: true, slot: { elements }, ...(minHeight ? { minHeight: pt(minHeight) } : {}) } }],
  }).levels.find((l) => l.level === 1)!;
const measure = (elements: DesignElement[], minHeight?: number) =>
  measureHeadingAdvancedDesignHeight(levelOf(elements, minHeight), heading, 320, DPI, {}, 0, frames, origin);

describe('opener height reservation (EF-18)', () => {
  const seal = (extra: Partial<DesignElement> = {}) =>
    box('seal', { to: 'page', edge: 'bottom-right' }, { width: pt(50), height: pt(50) }, { placement: { anchor: { to: 'page', edge: 'bottom-right' }, offset: { x: pt(-40), y: pt(-40) }, size: { width: pt(50), height: pt(50) } }, ...extra });

  it('a page-anchored element below the heading grows the reservation by default', () => {
    // Seal bottom at page y 560; heading top at 40.
    expect(measure([title, seal()])).toBe(520);
  });

  it('reserve: false leaves an element out of the reservation', () => {
    expect(measure([title, seal({ reserve: false })])).toBeCloseTo(24, 5);
    // minHeight still applies.
    expect(measure([title, seal({ reserve: false })], 90)).toBe(90);
  });

  it('an element anchored to a non-reserving one still counts unless flagged too', () => {
    const label: DesignElement = {
      kind: 'text', id: 'label', content: 'SEAL', fontSize: pt(10), overflow: 'wrap',
      placement: { anchor: { to: '#seal', edge: 'align-top' } },
    };
    // The label sits at the seal's top (page y 510 → 470 below the heading) and is 12px tall.
    expect(measure([title, seal({ reserve: false }), label])).toBeCloseTo(482, 5);
    expect(measure([title, seal({ reserve: false }), { ...label, reserve: false }])).toBeCloseTo(24, 5);
  });

  it('elements that follow the band (bottom anchors, fill heights) do not set it', () => {
    const underline: DesignElement = {
      kind: 'rule', id: 'under', direction: 'horizontal', color: red, thickness: pt(1),
      placement: { anchor: { to: 'container', edge: 'bottom-left' } },
    };
    const bar = box('bar', { to: 'container', edge: 'top-left' }, { width: pt(4), height: 'fill' });
    const tint = box('tint', { to: 'container', edge: 'top-left' }, { width: 'fill' });
    // Without the fix each of these measured about a million px, and the
    // heading collapsed to its text height (or jumped to the next column).
    expect(measure([title, underline])).toBeCloseTo(24, 5);
    expect(measure([title, bar])).toBeCloseTo(24, 5);
    expect(measure([tint, title])).toBeCloseTo(24, 5);
    expect(measure([title, underline], 60)).toBe(60);
    // A text beside the bar starts at the band's top: it still counts.
    const beside: DesignElement = { ...title, id: 'beside', placement: { anchor: { to: '#bar', edge: 'right-of' } } };
    expect(measure([bar, beside])).toBeCloseTo(24, 5);
    // A text under a bottom-anchored element follows it.
    const after: DesignElement = { ...title, id: 'after', placement: { anchor: { to: '#under', edge: 'below' } } };
    expect(measure([title, underline, after])).toBeCloseTo(24, 5);
  });
});

const lineText = (doc: VDTDocument, s: string) =>
  doc.pages.findIndex((p) => p.columns.some((c) => c.blocks.some((b) => b.lines.some((l) => (l.segments?.map((x) => x.text).join('') ?? l.text).includes(s)))));

describe('opener reservation in the flow (EF-18)', () => {
  const base = (): PostextConfig => ({
    page: { width: pt(400), height: pt(600), dpi: 72, margins: { top: pt(40), bottom: pt(40), left: pt(40), right: pt(40) } },
    layout: { layoutType: 'single' },
    header: { elements: [] },
    footer: { elements: [] },
  });

  it('a certificate seal with reserve: false keeps the citation on the opener page', () => {
    const run = (reserve?: boolean) => {
      const config = base();
      const sealEl = box('seal', { to: 'page', edge: 'bottom-right' }, { width: pt(50), height: pt(50) }, {
        placement: { anchor: { to: 'page', edge: 'bottom-right' }, offset: { x: pt(-60), y: pt(-60) }, size: { width: pt(50), height: pt(50) } },
        ...(reserve === undefined ? {} : { reserve }),
      });
      config.headings = {
        levels: [{ level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' }, advancedDesign: { enabled: true, minHeight: pt(80), slot: { elements: [title, sealEl] } } }],
      };
      return buildDocument({ markdown: '# Certificate\n\nThis certifies that the bearer completed the course.' }, config);
    };
    expect(lineText(run(), 'certifies')).toBe(1);
    const doc = run(false);
    expect(doc.pages).toHaveLength(1);
    expect(lineText(doc, 'certifies')).toBe(0);
    // The seal still paints on the opener page.
    expect(doc.pages[0]!.openerBand!.blocks.some((b) => b.kind === 'box')).toBe(true);
  });

  it('a :::pagebreak after a full-page cover starts the text on the next page, with no blank page', () => {
    for (const layoutType of ['single', 'double'] as const) {
      const config = base();
      config.layout = { layoutType };
      config.headingStyles = [{
        id: 'cover', numbered: false, span: 'page', breakBefore: { enabled: true, parity: 'any' },
        advancedDesign: { enabled: true, minHeight: pt(600), slot: { elements: [title] } },
      }];
      const doc = buildDocument({ markdown: '# Cover {style="cover"}\n\n:::pagebreak\n\nThe first chapter begins.' }, config);
      expect(doc.pages).toHaveLength(2);
      expect(lineText(doc, 'first chapter')).toBe(1);
    }
  });

  it('an in-column heading with a full-height bar stays in its column', () => {
    const config = base();
    const bar = box('bar', { to: 'container', edge: 'top-left' }, { width: pt(3), height: 'fill' });
    config.headings = {
      levels: [
        { level: 1, breakBefore: { enabled: false } },
        { level: 2, advancedDesign: { enabled: true, slot: { elements: [bar, { ...title, id: 't2', fontSize: pt(14), placement: { anchor: { to: '#bar', edge: 'right-of' }, offset: { x: pt(6) } } }] } } },
      ],
    };
    const doc = buildDocument({ markdown: 'Intro paragraph.\n\n## Section\n\nBody after the section heading.' }, config);
    expect(doc.pages).toHaveLength(1);
    const blocks = doc.pages[0]!.columns[0]!.blocks;
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'heading', 'paragraph']);
    const head = blocks[1]!;
    // The bar spans the reserved band, which the text after it clears.
    const overlayBar = head.designOverlay!.blocks.find((b) => b.kind === 'box')!;
    expect(overlayBar.bbox.height).toBeCloseTo(head.bbox.height, 5);
    expect(blocks[2]!.bbox.y).toBeGreaterThanOrEqual(head.bbox.y + head.bbox.height - 0.01);
  });
});
