import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import type { VDTBlock, VDTDocument } from '../../vdt';
import type { DesignElement, LayoutType, PostextConfig } from '../../types';

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

const pt = (value: number) => ({ value, unit: 'pt' as const });

// EF-91: a heading whose reservation is taller than the room left used to
// keep only the height of its text — the design then lost its band (its
// `minHeight` included): elements anchored to the band's middle or foot, or
// filling it, were laid out against a band one title tall.

/** 400 × 400pt page at 72 dpi, 20pt margins: a 360pt column. */
function config(
  layoutType: LayoutType,
  opener: { minHeight?: number; elements: DesignElement[]; span?: 'page' | 'column' },
): PostextConfig {
  return {
    page: { dpi: 72, width: pt(400), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
    layout: { layoutType },
    bodyText: { fontSize: pt(10), lineHeight: pt(14) },
    header: { elements: [] },
    footer: { elements: [] },
    headings: {
      balancing: { enabled: false },
      levels: [{
        level: 1,
        span: opener.span ?? 'page',
        breakBefore: { enabled: true, parity: 'any' },
        advancedDesign: {
          enabled: true,
          ...(opener.minHeight !== undefined ? { minHeight: pt(opener.minHeight) } : {}),
          slot: { elements: opener.elements },
        },
      }],
    },
  };
}

const build = (markdown: string, cfg: PostextConfig): VDTDocument => buildDocument({ markdown }, cfg, createMeasurementCache());

const title: DesignElement = {
  kind: 'text', id: 'title', content: '{titleText}', fontSize: pt(20), overflow: 'wrap',
  placement: { anchor: { to: 'container', edge: 'top-left' } },
};
/** A rule at the foot of the band the opener reserves. */
const footRule: DesignElement = {
  kind: 'box', id: 'foot', style: { backgroundColor: { hex: '#b07d2b', model: 'hex' } },
  placement: { anchor: { to: 'container', edge: 'bottom-left' }, size: { width: 'fill', height: pt(4) } },
};
/** A box filling the band. */
const fill: DesignElement = {
  kind: 'box', id: 'fill', style: { backgroundColor: { hex: '#e8e0d0', model: 'hex' } },
  placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: 'fill', height: 'fill' } },
};
/** A dateline anchored to the page, low on it: below the column's foot
 *  (380pt) but above the trim (400pt) — the recipe's Repro A. */
const lowDateline: DesignElement = {
  kind: 'text', id: 'dateline', content: 'St. Petersburgh, Dec. 11th, 17—', fontSize: pt(9), overflow: 'wrap',
  placement: { anchor: { to: 'page', edge: 'top-left' }, offset: { x: pt(20), y: pt(376) } },
};

const FILLER = 'The keeper climbs the stair at dusk to light the lantern for the night. '.repeat(12).trim();
const OPENER_THEN_TEXT = `# Letter I\n\nFirst words of the letter. ${FILLER}\n\n${FILLER}`;

const heading = (doc: VDTDocument): VDTBlock => doc.blocks.find((b) => b.type === 'heading')!;
const designBlock = (doc: VDTDocument, i: number) => {
  const h = heading(doc);
  const slot = h.designOverlay ?? doc.pages[h.pageIndex]!.openerBand!;
  return slot.blocks[i]!;
};
const textBlock = (doc: VDTDocument, text: string): VDTBlock =>
  doc.blocks.find((b) => b.type === 'paragraph' && b.lines.some((l) => l.text.includes(text)))!;

describe('a heading taller than the room left keeps its reservation (EF-91)', () => {
  for (const layoutType of ['single', 'double'] as const) {
    it(`a design reaching past the column's foot reserves down to it; the text continues on the next page (${layoutType})`, () => {
      const doc = build(OPENER_THEN_TEXT, config(layoutType, { elements: [title, lowDateline], minHeight: 120 }));
      const h = heading(doc);
      const col = doc.pages[0]!.columns[h.columnIndex]!;
      // Not the height of the title (24pt): the band down to the foot.
      expect(h.bbox.height).toBeCloseTo(col.bbox.height, 5);
      expect(h.bbox.height).toBeGreaterThanOrEqual(120);
      expect(textBlock(doc, 'First words').pageIndex).toBe(1);
    });
  }

  it('an element anchored to the foot of the band sits at the column foot, as it sits at the band foot when the band fits', () => {
    const fits = build(OPENER_THEN_TEXT, config('single', { elements: [title, footRule], minHeight: 200 }));
    const fitRule = designBlock(fits, 1).bbox;
    // The band: from the content top (20) down the 200pt reserved, with the
    // heading's margin, onto the grid — the heading block.
    const fitHeading = heading(fits);
    expect(fitRule.y + fitRule.height).toBeCloseTo(fitHeading.bbox.y + fitHeading.bbox.height, 5);
    expect(fitRule.y + fitRule.height).toBeGreaterThanOrEqual(220);
    // A minHeight taller than the column (1000pt): the band is the column.
    const tall = build(OPENER_THEN_TEXT, config('single', { elements: [title, footRule], minHeight: 1000 }));
    const tallRule = designBlock(tall, 1).bbox;
    expect(tallRule.y + tallRule.height).toBeCloseTo(380, 5);
    expect(textBlock(tall, 'First words').pageIndex).toBe(1);
  });

  it('a box filling the band fills the column it claims', () => {
    const doc = build(OPENER_THEN_TEXT, config('double', { elements: [fill, title], minHeight: 1000 }));
    const box = designBlock(doc, 0).bbox;
    expect(box.y).toBeCloseTo(20, 5);
    expect(box.height).toBeCloseTo(360, 5);
  });

  it('an in-column design taller than its column: the block, and its overlay, run to that column\'s foot', () => {
    const doc = build(OPENER_THEN_TEXT, config('double', { elements: [title, footRule], minHeight: 1000, span: 'column' }));
    const h = heading(doc);
    expect(h.columnIndex).toBe(0);
    expect(h.bbox.y + h.bbox.height).toBeCloseTo(380, 5);
    const rule = designBlock(doc, 1).bbox;
    expect(rule.y + rule.height).toBeCloseTo(380, 5);
    // The text opens the next column.
    expect(textBlock(doc, 'First words').columnIndex).toBe(1);
  });

  for (const layoutType of ['single', 'double'] as const) {
    it(`a design ending within a line of the column's foot takes the rest of the column, never more (${layoutType})`, () => {
      // 355pt fit the 360pt column, but its margin and the 14pt grid would
      // carry the block past the foot, and the column's room below zero.
      const doc = build(OPENER_THEN_TEXT, config(layoutType, { elements: [title, footRule], minHeight: 355 }));
      const h = heading(doc);
      const page = doc.pages[0]!;
      const col = page.columns[h.columnIndex]!;
      expect(h.bbox.y + h.bbox.height).toBeCloseTo(col.bbox.y + col.bbox.height, 5);
      for (const c of page.columns) expect(c.availableHeight).toBeGreaterThanOrEqual(0);
      expect(col.availableHeight).toBeCloseTo(0, 5);
      expect(textBlock(doc, 'First words').pageIndex).toBe(1);
    });
  }

  it('an opener that fits is left exactly as it was', () => {
    const doc = build(OPENER_THEN_TEXT, config('single', { elements: [title, footRule], minHeight: 120 }));
    const h = heading(doc);
    // The reservation (120pt) snapped to the 14pt grid with the margin.
    expect(h.bbox.height).toBeLessThan(200);
    expect(textBlock(doc, 'First words').pageIndex).toBe(0);
  });
});
