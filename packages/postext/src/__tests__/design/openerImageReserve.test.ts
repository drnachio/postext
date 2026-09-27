import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { measureHeadingAdvancedDesignHeight } from '../../pipeline/headerFooter';
import { resolveHeadingsConfig } from '../../defaults/headings';
import type { DesignElement, PostextConfig, Resource } from '../../types';
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

const pt = (value: number) => ({ value, unit: 'pt' as const });

/** A 400 × 200 band picture: set 360 wide (the column), it is 180 tall. */
const band: Resource = {
  id: 'band',
  typeId: 'figure',
  kind: 'bitmap',
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: 'band.png', format: 'png', width: 400, height: 200 },
};

const title: DesignElement = {
  kind: 'text',
  id: 'title',
  content: '{titleText}',
  fontSize: pt(20),
  overflow: 'wrap',
  placement: { anchor: { to: 'container', edge: 'top-left' } },
};
const picture = (extra: Partial<DesignElement> = {}): DesignElement => ({
  kind: 'image',
  id: 'band',
  resourceId: 'band',
  placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: 'fill' } },
  ...extra,
} as DesignElement);

const config = (elements: DesignElement[], span: 'column' | 'page' = 'column'): PostextConfig => ({
  page: { dpi: 72, width: pt(400), height: pt(500), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: span === 'page' ? 'double' : 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  headings: {
    balancing: { enabled: false },
    levels: [{ level: 1, span, breakBefore: { enabled: false }, advancedDesign: { enabled: true, slot: { elements } } }],
  },
});

const firstLineY = (doc: VDTDocument): number =>
  doc.blocks.find((b) => b.type === 'paragraph')!.lines[0]!.bbox.y;

describe('image elements count toward the height a heading reserves (EF-90)', () => {
  it('measures an image element when the resources are known', () => {
    const level = resolveHeadingsConfig({ levels: [{ level: 1, advancedDesign: { enabled: true, slot: { elements: [title, picture()] } } }] }).levels[0]!;
    const heading = { titleText: 'Letter I', formattedNumber: '', chapterNumber: '' };
    // Without the resources the picture cannot be sized: only the title counts.
    expect(measureHeadingAdvancedDesignHeight(level, heading, 360, 72, {}, 0)).toBeCloseTo(24, 5);
    const resourceById = new Map([[band.id, band]]);
    expect(measureHeadingAdvancedDesignHeight(level, heading, 360, 72, {}, 0, undefined, undefined, resourceById)).toBeCloseTo(180, 5);
  });

  it('the text after an in-column opener starts under its picture', () => {
    const doc = buildDocument({ markdown: '# Letter I\n\nThe text of the letter.', resources: [band] }, config([title, picture()]));
    // Content top 20 + picture 180 = 200, then the margin and the grid.
    expect(firstLineY(doc)).toBeGreaterThanOrEqual(200);
    const heading = doc.blocks.find((b) => b.type === 'heading')!;
    expect(heading.bbox.height).toBeGreaterThanOrEqual(180);
  });

  it('the same under a page-spanning opener', () => {
    const doc = buildDocument({ markdown: '# Letter I\n\nThe text of the letter.', resources: [band] }, config([title, picture()], 'page'));
    // 360 wide across the page: 180 tall.
    expect(firstLineY(doc)).toBeGreaterThanOrEqual(200);
  });

  it('a picture marked reserve: false still leaves the text under the title', () => {
    const doc = buildDocument({ markdown: '# Letter I\n\nThe text of the letter.', resources: [band] }, config([title, picture({ reserve: false })]));
    expect(firstLineY(doc)).toBeLessThan(100);
  });

  it('a picture of an unknown resource reserves nothing (it paints nothing either)', () => {
    const doc = buildDocument({ markdown: '# Letter I\n\nThe text of the letter.', resources: [] }, config([title, picture()]));
    expect(firstLineY(doc)).toBeLessThan(100);
  });
});
