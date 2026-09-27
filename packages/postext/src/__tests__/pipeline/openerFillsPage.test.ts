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

const mm = (value: number) => ({ value, unit: 'mm' as const });
const pt = (value: number) => ({ value, unit: 'pt' as const });

/** A 17 × 24 cm page: its content area is well under 260 mm tall. */
function config(
  layoutType: LayoutType,
  opener: { minHeight?: number; elements?: DesignElement[]; span?: 'page' | 'column' },
): PostextConfig {
  return {
    page: { dpi: 96, sizePreset: '17x24' },
    layout: { layoutType },
    bodyText: { fontSize: pt(10), lineHeight: pt(14) },
    header: { elements: [] },
    footer: { elements: [] },
    headings: { levels: [{ level: 1, breakBefore: { enabled: false } }] },
    headingStyles: [{
      id: 'cover',
      numbered: false,
      span: opener.span ?? 'page',
      ...(opener.span === 'column' ? {} : { breakBefore: { enabled: true, parity: 'any' as const } }),
      advancedDesign: {
        enabled: true,
        ...(opener.minHeight !== undefined ? { minHeight: mm(opener.minHeight) } : {}),
        slot: { elements: opener.elements ?? [] },
      },
    }],
  };
}

function build(markdown: string, cfg: PostextConfig): VDTDocument {
  return buildDocument({ markdown }, cfg, createMeasurementCache());
}

const textOf = (b: VDTBlock): string => b.lines.map((l) => (l.segments ?? []).map((s) => s.text).join('')).join(' ');
const blockWith = (doc: VDTDocument, text: string): VDTBlock | undefined =>
  doc.blocks.find((b) => b.type === 'paragraph' && textOf(b).includes(text));

const FILLER = 'The keeper climbs the stair at dusk to light the lantern for the night. '.repeat(12).trim();
/** A cover, then enough text to run past its page: no closing-band cap
 *  levels the body on the cover page. */
const COVER_THEN_BODY = `# Cover {style="cover"}\n\nBody text. ${FILLER}\n\n${FILLER}\n\n${FILLER}\n\n${FILLER}`;

describe('an opener taller than the column ends the page (EF-03)', () => {
  for (const layoutType of ['single', 'double', 'oneAndHalf'] as const) {
    it(`a full-page cover sends the next block to the next page (${layoutType})`, () => {
      const doc = build(COVER_THEN_BODY, config(layoutType, { minHeight: 260 }));
      const body = blockWith(doc, 'Body text')!;
      expect(body.pageIndex).toBe(1);
      expect(body.columnIndex).toBe(0);
      // The cover page holds the heading and nothing else.
      const cover = doc.pages[0]!;
      expect(cover.columns.flatMap((c) => c.blocks).map((b) => b.type)).toEqual(['heading']);
      // Every column of the cover page is spent: nothing — text or float —
      // can land beside or under the cover art.
      for (const col of cover.columns) expect(col.availableHeight).toBeLessThan(1);
    });
  }

  for (const layoutType of ['single', 'double', 'oneAndHalf'] as const) {
    it(`a cover followed by a short text: the closing band does not bring it back (${layoutType})`, () => {
      // Two short paragraphs end the document: the closing band that levels
      // them used to set them on the cover page — under the art in one
      // column, at the head of column 2 in two.
      const doc = build('# Cover {style="cover"}\n\nBody text.\n\nMore body.', config(layoutType, { minHeight: 260 }));
      expect(blockWith(doc, 'Body text')!.pageIndex).toBe(1);
      expect(blockWith(doc, 'Body text')!.columnIndex).toBe(0);
      // The closing band of page 2 is levelled as usual (the second
      // paragraph may open its second column).
      expect(blockWith(doc, 'More body')!.pageIndex).toBe(1);
      expect(doc.pages[0]!.columns.flatMap((c) => c.blocks).map((b) => b.type)).toEqual(['heading']);
    });
  }

  it('a design element reaching past the page foot reserves the page too', () => {
    const band: DesignElement = {
      kind: 'box',
      id: 'band',
      style: { backgroundColor: { hex: '#b07d2b', model: 'hex' } },
      placement: { anchor: { to: 'bleed', edge: 'top-left' }, size: { width: 'fill', height: 'fill' } },
    };
    const doc = build(COVER_THEN_BODY, config('double', { elements: [band] }));
    expect(blockWith(doc, 'Body text')!.pageIndex).toBe(1);
  });

  it('matches the `:::pagebreak` idiom: no blank page is added', () => {
    const fixed = build(COVER_THEN_BODY, config('double', { minHeight: 260 }));
    const idiom = build(COVER_THEN_BODY.replace('\n\nBody', '\n\n:::pagebreak\n\nBody'), config('double', { minHeight: 260 }));
    expect(fixed.pages.length).toBe(idiom.pages.length);
    expect(idiom.pages[1]!.blankForParity ?? false).toBe(false);
    expect(blockWith(idiom, 'Body text')!.pageIndex).toBe(1);
  });

  it('a cover alone is one page, and a chapter after it still opens where its break says', () => {
    for (const layoutType of ['single', 'double'] as const) {
      expect(build('# Cover {style="cover"}', config(layoutType, { minHeight: 260 })).pages.length).toBe(1);
    }
    const cfg = config('double', { minHeight: 260 });
    cfg.headings = { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'odd' } }] };
    const doc = build(`# Cover {style="cover"}\n\n# One\n\n${FILLER}`, cfg);
    const one = doc.blocks.find((b) => b.type === 'heading' && textOf(b).includes('One'))!;
    // Page 1 is the cover, page 2 the verso left blank for parity.
    expect(one.pageIndex).toBe(2);
    expect(doc.pages[1]!.blankForParity).toBe(true);
  });

  it('the heading block runs down to the foot of the column it claims (EF-91)', () => {
    // It used to keep the height of its text, so the design was laid out
    // against a band a line tall; it now takes the band it reserves.
    const doc = build(COVER_THEN_BODY, config('double', { minHeight: 260 }));
    const heading = doc.blocks.find((b) => b.type === 'heading')!;
    const col = doc.pages[0]!.columns[heading.columnIndex]!;
    expect(heading.bbox.y + heading.bbox.height).toBeCloseTo(col.bbox.y + col.bbox.height, 5);
  });

  it('an in-column design taller than the column ends that column', () => {
    const doc = build(COVER_THEN_BODY, config('double', { minHeight: 260, span: 'column' }));
    const heading = doc.blocks.find((b) => b.type === 'heading')!;
    const body = blockWith(doc, 'Body text')!;
    expect(heading.pageIndex).toBe(0);
    expect(heading.columnIndex).toBe(0);
    expect(body.pageIndex).toBe(0);
    expect(body.columnIndex).toBe(1);
  });

  it('leaves an opener that fits its page alone: the text starts under it on the same page', () => {
    const doc = build(COVER_THEN_BODY, config('double', { minHeight: 40 }));
    const body = blockWith(doc, 'Body text')!;
    expect(body.pageIndex).toBe(0);
    const heading = doc.blocks.find((b) => b.type === 'heading')!;
    expect(body.bbox.y).toBeGreaterThan(heading.bbox.y + heading.bbox.height - 0.5);
  });
});
