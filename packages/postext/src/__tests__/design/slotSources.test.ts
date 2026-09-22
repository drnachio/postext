import { describe, it, expect } from 'vitest';
import { layoutSlotToVdt } from '../../pipeline/headerFooter';
import { resolveDesignSlot } from '../../defaults/headerFooter';
import type { DesignPlaceholderContext } from '../../design/placeholders';
import type { DesignElement } from '../../types';
import type { VDTDesignTextBlock, VDTPage } from '../../vdt';

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
const stubPage = { index: 0, pageLabel: '1' } as unknown as VDTPage;
const container = { x: 0, y: 0, width: 400, height: 300 };

const text = (id: string, content: string): DesignElement => ({
  kind: 'text',
  id,
  placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { x: pt(0), y: pt(0) }, size: { width: 'fill', height: 'auto' } },
  content,
  fontSize: pt(12),
  overflow: 'wrap',
});

const placeholders: DesignPlaceholderContext = {
  kind: 'heading',
  page: stubPage,
  allPages: [stubPage],
  metadata: { title: 'Don Quijote', author: 'Cervantes' },
  chapterTitleByPageIndex: ['Capítulo uno'],
  chapterNumberByPageIndex: ['1'],
  heading: { titleText: 'Capítulo uno', formattedNumber: '1', numericValue: 1, chapterNumber: '1', attrs: { lead: 'En un lugar' } },
};

/** Text blocks keyed by element id (blocks come out in element order). */
function textBlocks(elements: DesignElement[], extras: Parameters<typeof layoutSlotToVdt>[5]): Record<string, VDTDesignTextBlock> {
  const slot = layoutSlotToVdt(resolveDesignSlot({ elements }), container, 0, placeholders, 72, extras);
  const texts = (slot?.blocks ?? []).filter((b): b is VDTDesignTextBlock => b.kind === 'text');
  const out: Record<string, VDTDesignTextBlock> = {};
  elements.forEach((el, i) => { if (texts[i]) out[el.id] = texts[i]!; });
  return out;
}

describe('design text → source ranges', () => {
  it('maps frontmatter placeholders to the field values and heading placeholders to the heading line', () => {
    const blocks = textBlocks(
      [text('title', '{title}'), text('author', '{author}'), text('num', 'Capítulo {number}'), text('lead', '{attr.lead}'), text('plain', 'Colección')],
      {
        metadataSources: { title: { start: 11, end: 22 }, author: { start: 32, end: 41 } },
        metadata: { title: 'Don Quijote', author: 'Cervantes' },
        headingSource: { start: 100, end: 130 },
        attrSources: { lead: { start: 118, end: 129 } },
        attrs: { lead: 'En un lugar' },
      },
    );
    expect(blocks.title!.sourceStart).toBe(11);
    expect(blocks.title!.sourceEnd).toBe(22);
    expect(blocks.title!.sourceMap).toHaveLength('Don Quijote'.length);
    expect(blocks.author!.sourceText).toBe('Cervantes');
    expect(blocks.num!.sourceStart).toBe(100);
    expect(blocks.num!.sourceEnd).toBe(130);
    expect(blocks.num!.sourceMap).toBeUndefined();
    expect(blocks.lead!.sourceStart).toBe(118);
    expect(blocks.lead!.sourceMap?.[0]).toBe(118);
    expect(blocks.plain!.sourceStart).toBeUndefined();
  });

  it('leaves the range alone when the rendered value differs from the source span', () => {
    const blocks = textBlocks([text('title', '{title}')], {
      metadataSources: { title: { start: 11, end: 40 } },
      metadata: { title: 'Don Quijote' },
    });
    expect(blocks.title!.sourceStart).toBe(11);
    expect(blocks.title!.sourceMap).toBeUndefined();
  });

  it('prefers the title map over the heading line for {titleText}', () => {
    const blocks = textBlocks([text('t', '{number}. {titleText}')], {
      titleSource: { start: 200, end: 212, text: 'Capítulo uno', sourceMap: Array.from({ length: 12 }, (_, i) => 200 + i) },
      headingSource: { start: 190, end: 212 },
    });
    expect(blocks.t!.sourceStart).toBe(200);
    expect(blocks.t!.sourceMap).toHaveLength(12);
  });
});
