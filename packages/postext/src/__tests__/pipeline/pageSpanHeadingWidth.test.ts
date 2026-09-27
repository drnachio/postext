import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import type { VDTBlock, VDTDesignTextBlock, VDTDocument } from '../../vdt';
import type { Dimension, LayoutType, PostextConfig } from '../../types';

// Deterministic text measurement stub (no DOM in the node test env): every
// character is 7px wide whatever the font.
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

// EF-100: a `span: 'page'` heading without a design of its own is painted by
// the default opener across the content area, but its band was reserved from
// the title wrapped at the column width: a title that fits the page width on
// one line took a band two lines tall, with the line centred in it.

/** 400pt wide page at 72 dpi, 20pt margins: a 360pt content area, two 170pt
 *  columns with a 20pt gutter. Body 10/12pt (a 12pt grid). */
function config(layoutType: LayoutType = 'double', lineHeight: Dimension = pt(30)): PostextConfig {
  return {
    page: { dpi: 72, width: pt(400), height: pt(500), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
    layout: { layoutType, gutterWidth: pt(20) },
    bodyText: { fontSize: pt(10), lineHeight: pt(12) },
    header: { elements: [] },
    footer: { elements: [] },
    headings: {
      balancing: { enabled: false },
      levels: [{ level: 1, span: 'page', fontSize: pt(20), lineHeight, marginBottom: pt(10), breakBefore: { enabled: true, parity: 'any' } }],
    },
  };
}

const build = (markdown: string, cfg: PostextConfig): VDTDocument => buildDocument({ markdown }, cfg, createMeasurementCache());
const BODY = 'Body text that runs on for a while. '.repeat(40);
// 25 characters: 175px, wider than a column (170px), narrower than the page (360px).
const TITLE = 'The Secret Canon of Forms';

const heading = (doc: VDTDocument): VDTBlock => doc.pages[0]!.columns[0]!.blocks.find((b) => b.type === 'heading')!;
const bandText = (doc: VDTDocument): VDTDesignTextBlock =>
  doc.pages[0]!.openerBand!.blocks.find((b): b is VDTDesignTextBlock => b.kind === 'text')!;

describe('page-span heading without a design (EF-100)', () => {
  it('reserves the band for the title as the opener paints it, across the content area', () => {
    const doc = build(`# ${TITLE}\n\n${BODY}`, config());
    const band = doc.pages[0]!.openerBand!;
    expect(bandText(doc).lines.map((l) => l.text)).toEqual([TITLE]);
    // One 30pt line + 10pt margin, snapped to the 12pt grid: 48pt, not the
    // 72pt of two column-width lines.
    expect(band.bbox.height).toBeCloseTo(48, 5);
    expect(heading(doc).lines).toHaveLength(1);
    // The text of both columns starts under the band.
    const [c0, c1] = doc.pages[0]!.columns;
    const firstBody = c0!.blocks.find((b) => b.type === 'paragraph')!;
    expect(firstBody.bbox.y).toBeCloseTo(band.bbox.y + band.bbox.height, 5);
    expect(c1!.bbox.y).toBeCloseTo(band.bbox.y + band.bbox.height, 5);
  });

  it('sets a title that wraps at the page width in the level\'s own leading', () => {
    // 60 characters: 420px, two lines at 360px.
    const long = 'A title long enough to wrap across the whole content area now';
    const doc = build(`# ${long}\n\n${BODY}`, config('double', pt(30)));
    const lines = bandText(doc).lines;
    expect(lines).toHaveLength(2);
    expect(lines[1]!.baselineY - lines[0]!.baselineY).toBeCloseTo(30, 5);
    // Two 30pt lines + 10pt margin → 70 → 72pt on the grid.
    expect(doc.pages[0]!.openerBand!.bbox.height).toBeCloseTo(72, 5);
  });

  it('leaves a single-column page as it was', () => {
    const doc = build(`# ${TITLE}\n\n${BODY}`, config('single'));
    expect(bandText(doc).lines.map((l) => l.text)).toEqual([TITLE]);
    expect(doc.pages[0]!.openerBand!.bbox.height).toBeCloseTo(48, 5);
  });
});
