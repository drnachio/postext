import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { formatWarning } from '../../../index.js';
import type { ContentWarning, VDTDocument } from '../../../vdt.js';
import type { DesignElement, LayoutType, PostextConfig } from '../../../types.js';

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

// #997: a heading design whose reserved height covers its whole column sends
// the first block after it to the next column. When the heading is an
// in-column one, that is rarely meant (a cover claims its page with
// `span: 'page'`), so the build says which element claims the column.

/** 400 × 400pt page at 72 dpi, 20pt margins: a 360pt column. */
function config(layoutType: LayoutType, opener: { minHeight?: number; elements: DesignElement[]; span?: 'page' | 'column'; breakBefore?: boolean }): PostextConfig {
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
        span: opener.span ?? 'column',
        breakBefore: { enabled: opener.breakBefore ?? false, parity: 'any' },
        advancedDesign: {
          enabled: true,
          ...(opener.minHeight !== undefined ? { minHeight: pt(opener.minHeight) } : {}),
          slot: { elements: opener.elements },
        },
      }],
    },
  };
}

const title: DesignElement = {
  kind: 'text', id: 'title', content: '{titleText}', fontSize: pt(20), overflow: 'wrap',
  placement: { anchor: { to: 'container', edge: 'top-left' } },
};
/** A dateline anchored to the page, low on it: below the column's foot. */
const dateline = (reserve?: boolean): DesignElement => ({
  kind: 'text', id: 'dateline', content: 'St. Petersburgh, Dec. 11th, 17—', fontSize: pt(9), overflow: 'wrap',
  ...(reserve === false ? { reserve: false } : {}),
  placement: { anchor: { to: 'page', edge: 'top-left' }, offset: { x: pt(20), y: pt(376) } },
});
/** A box filling the band: it follows the band, never sets it. */
const fill: DesignElement = {
  kind: 'box', id: 'fill', style: { backgroundColor: { hex: '#e8e0d0', model: 'hex' } },
  placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: 'fill', height: 'fill' } },
};

const FILLER = 'The keeper climbs the stair at dusk to light the lantern for the night. '.repeat(12).trim();
const TEXT = `# Letter I\n\nFirst words of the letter. ${FILLER}\n\n${FILLER}`;

const build = (markdown: string, cfg: PostextConfig): VDTDocument => buildDocument({ markdown }, cfg, createMeasurementCache());
const claims = (doc: VDTDocument): ContentWarning[] => (doc.contentWarnings ?? []).filter((w) => w.kind === 'headingClaimsColumn');

describe('headingClaimsColumn (#997)', () => {
  it('names the element whose reach claims the column of an in-column heading', () => {
    const doc = build(TEXT, config('double', { elements: [title, dateline()], minHeight: 120 }));
    const found = claims(doc);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ kind: 'headingClaimsColumn', level: 1, element: 'dateline', pageIndex: 0 });
    // It points at the heading in the source.
    expect(TEXT.slice(found[0]!.sourceStart, found[0]!.sourceEnd)).toContain('Letter I');
    expect(formatWarning(found[0]!)).toContain('"dateline"');
    expect(formatWarning(found[0]!)).toContain('reserve: false');
  });

  it('is silent on a page of one column: the column is the page, as for a cover', () => {
    const doc = build(TEXT, config('single', { elements: [title, dateline()], minHeight: 120 }));
    expect(claims(doc)).toEqual([]);
    expect(doc.blocks.find((b) => b.type === 'paragraph')!.pageIndex).toBe(1);
  });

  it('names minHeight when the heading\'s own minimum is the whole column', () => {
    const doc = build(TEXT, config('double', { elements: [title], minHeight: 1000 }));
    const found = claims(doc);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ level: 1 });
    expect((found[0] as { element?: string }).element).toBeUndefined();
    expect(formatWarning(found[0]!)).toContain('minHeight');
  });

  it('is silent once the element is marked reserve: false', () => {
    const doc = build(TEXT, config('double', { elements: [title, dateline(false)], minHeight: 120 }));
    expect(claims(doc)).toEqual([]);
    expect(doc.blocks.find((b) => b.type === 'paragraph')!.pageIndex).toBe(0);
  });

  it('is silent for a cover: a page-span opener claims its page on purpose', () => {
    const doc = build(TEXT, config('single', { elements: [title, dateline()], minHeight: 120, span: 'page', breakBefore: true }));
    expect(claims(doc)).toEqual([]);
  });

  it('does not fire for a band that follows the column: a box filling it never sets its height', () => {
    const doc = build(TEXT, config('double', { elements: [fill, title], minHeight: 120 }));
    expect(claims(doc)).toEqual([]);
  });

  it('is silent when the text after the heading was sent on by an explicit break', () => {
    const doc = build(`# Letter I\n\n:::pagebreak\n:::\n\nFirst words.\n`, config('double', { elements: [title, dateline()], minHeight: 120 }));
    expect(claims(doc)).toEqual([]);
  });

  it('is silent when nothing follows the heading', () => {
    const doc = build('# Letter I\n', config('double', { elements: [title, dateline()], minHeight: 120 }));
    expect(claims(doc)).toEqual([]);
  });
});
