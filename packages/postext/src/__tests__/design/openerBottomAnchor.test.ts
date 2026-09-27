import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import type { DesignElement, HeadingStyleConfig, PostextConfig } from '../../types';
import type { VDTBlock, VDTDesignSlot, VDTDesignTextBlock, VDTDocument } from '../../vdt';

// Deterministic text measurement stub (no DOM in the node test env): each
// character is half the font size wide.
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const m = /(\d+(?:\.\d+)?)px/.exec(this.font);
    const size = m ? Number(m[1]) : 16;
    return { width: s.length * size * 0.5 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const mm = (value: number) => ({ value, unit: 'mm' as const });
const DPI = 72;
const px = (millimetres: number) => (millimetres / 25.4) * DPI;

const title = (edge: 'bottom-left' | 'left' | 'top-left', offsetY = 0): DesignElement => ({
  kind: 'text', id: 'title', content: '{titleText}', fontSize: pt(20), overflow: 'wrap',
  placement: { anchor: { to: 'container', edge }, offset: { y: mm(offsetY) } },
});

/** The Cookbook's setting (bilingual-facing-verse): a single-column page
 *  156 × 234 mm with 22 mm margins and a `note` heading style whose design
 *  prints the title. */
function configFor(elements: DesignElement[], style: Partial<HeadingStyleConfig> = {}): PostextConfig {
  return {
    page: { width: mm(156), height: mm(234), dpi: DPI, margins: { top: mm(22), bottom: mm(22), left: mm(22), right: mm(22) } },
    layout: { layoutType: 'single' },
    headingStyles: [{
      id: 'note',
      fontSize: pt(13),
      breakBefore: { enabled: false },
      advancedDesign: { enabled: true, slot: { elements } },
      ...style,
    }],
  };
}

const LONG = 'Nota sobre la traducción de los versos que siguen y de otros muchos poemas que vienen después en este libro';
const markdownFor = (heading: string) => `Before the note.\n\n# ${heading} {style="note"}\n\nThe first line of text after it.\n\nMore text.`;

const headingOf = (doc: VDTDocument): VDTBlock => doc.blocks.find((b) => b.type === 'heading')!;
const paragraphs = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.type === 'paragraph');
const textOf = (slot: VDTDesignSlot | undefined): VDTDesignTextBlock =>
  slot!.blocks.find((b): b is VDTDesignTextBlock => b.kind === 'text')!;
const bandOf = (doc: VDTDocument): VDTDesignSlot | undefined => {
  const h = headingOf(doc);
  return doc.pages[h.pageIndex]!.openerBand ?? h.designOverlay;
};

describe('a heading design element anchored to the foot of the band (EF-176)', () => {
  it('keeps the whole minHeight reservation, with the title on its last line', () => {
    const doc = buildDocument({ markdown: markdownFor('Nota') }, configFor([title('bottom-left')], { advancedDesign: { enabled: true, minHeight: mm(36), slot: { elements: [title('bottom-left')] } } }));
    const h = headingOf(doc);
    // In postext 1.4.2 the block was one 13 pt line deep and the title
    // painted at the head of the text block (the measure put the title a
    // million pixels down, and the reservation was dropped).
    expect(h.bbox.height).toBeGreaterThanOrEqual(px(36) - 0.01);
    const t = textOf(bandOf(doc));
    expect(t.bbox.y + t.bbox.height).toBeCloseTo(h.bbox.y + h.bbox.height, 1);
    expect(paragraphs(doc)[1]!.bbox.y).toBeGreaterThanOrEqual(h.bbox.y + h.bbox.height - 0.01);
  });

  it('reserves the same room as a top-anchored title', () => {
    const bottom = buildDocument({ markdown: markdownFor('Nota') }, configFor([], { advancedDesign: { enabled: true, minHeight: mm(36), slot: { elements: [title('bottom-left')] } } }));
    const top = buildDocument({ markdown: markdownFor('Nota') }, configFor([], { advancedDesign: { enabled: true, minHeight: mm(36), slot: { elements: [title('top-left')] } } }));
    expect(headingOf(bottom).bbox.height).toBeCloseTo(headingOf(top).bbox.height, 5);
  });

  it('never rises above the heading when the title is taller than the heading’s own lines', () => {
    for (const edge of ['bottom-left', 'left'] as const) {
      const doc = buildDocument({ markdown: markdownFor(LONG) }, configFor([title(edge)]));
      const h = headingOf(doc);
      const t = textOf(bandOf(doc));
      // The 20 pt title takes more lines than the 13 pt heading.
      expect(t.lines.length).toBeGreaterThan(h.lines.length);
      // Up to postext 1.4 it started above the heading, over 'Before the note.'.
      expect(t.bbox.y).toBeGreaterThanOrEqual(h.bbox.y - 0.01);
      expect(t.bbox.y).toBeGreaterThanOrEqual(paragraphs(doc)[0]!.bbox.y + paragraphs(doc)[0]!.bbox.height - 0.01);
      // The text after the heading starts under the title.
      expect(paragraphs(doc)[1]!.bbox.y).toBeGreaterThanOrEqual(t.bbox.y + t.bbox.height - 0.01);
    }
  });

  it('holds an opener’s title in its band the same way', () => {
    const doc = buildDocument({ markdown: markdownFor(LONG) }, configFor([title('bottom-left')], { span: 'page' }));
    const h = headingOf(doc);
    const t = textOf(doc.pages[h.pageIndex]!.openerBand);
    expect(t.bbox.y).toBeGreaterThanOrEqual(h.bbox.y - 0.01);
    expect(paragraphs(doc)[1]!.bbox.y).toBeGreaterThanOrEqual(t.bbox.y + t.bbox.height - 0.01);
  });

  it('adds nothing when the heading already holds the title', () => {
    // One short line: the heading's own line, its margin and the grid snap
    // already make the box as tall as the title.
    const withTitle = buildDocument({ markdown: markdownFor('Nota') }, configFor([title('bottom-left')]));
    const bare = buildDocument({ markdown: markdownFor('Nota') }, configFor([{ ...title('top-left'), reserve: false }]));
    expect(headingOf(withTitle).bbox.height).toBeCloseTo(headingOf(bare).bbox.height, 5);
  });

  it('lets a panel riding on the band reach above the heading', () => {
    const panel: DesignElement = {
      kind: 'box', id: 'panel', style: { backgroundColor: { hex: '#eeeeee', model: 'hex' } },
      placement: { anchor: { to: 'container', edge: 'bottom-left' }, size: { width: 'fill', height: mm(60) } },
    };
    const withPanel = buildDocument({ markdown: markdownFor('Nota') }, configFor([panel, title('top-left')]));
    const without = buildDocument({ markdown: markdownFor('Nota') }, configFor([title('top-left')]));
    expect(headingOf(withPanel).bbox.height).toBeCloseTo(headingOf(without).bbox.height, 5);
  });
});
