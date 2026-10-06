import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import type { VDTBlock, VDTDocument } from '../../vdt';
import type { PostextConfig, Resource } from '../../types';

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

const SENTENCE =
  'La linterna del faro debe permanecer encendida toda la noche para guiar a los barcos que cruzan la bahía. ';
const filler = (n: number): string => SENTENCE.repeat(n).trim();
const mm = (value: number) => ({ value, unit: 'mm' as const });

const TWO_COL: PostextConfig = {
  page: { width: mm(160), height: mm(240), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'double' },
};

const figure = (placement: Resource['placement']): Resource => ({
  id: 'fig', typeId: 'figure', kind: 'bitmap', caption: 'Una figura.', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: 'fig.png', format: 'png', width: 400, height: 100 },
  ...(placement ? { placement } : {}),
});

const MD = [filler(6), '', '::resource{id="fig"}', '', filler(8)].join('\n');

function build(placement: Resource['placement'], config: PostextConfig = TWO_COL): VDTDocument {
  return buildDocument({ markdown: MD, resources: [figure(placement)] }, config, createMeasurementCache());
}

const resourceBlock = (doc: VDTDocument): VDTBlock => doc.blocks.find((b) => b.type === 'resource')!;

describe('an inline ::resource with span: page (#535)', () => {
  it('spans the page where it stands, the text above in level columns and the rest below', () => {
    const doc = build({ position: 'here', span: 'page' });
    const fig = resourceBlock(doc);
    const page = doc.pages[fig.pageIndex]!;
    expect(fig.pageIndex).toBe(0);
    // Across the content width, in a span column of its own.
    expect(fig.bbox.width).toBeCloseTo(page.contentArea.width, 0);
    expect(page.columns[fig.columnIndex]!.kind).toBe('span');
    // Mid-page: text above it and text below it, in both columns.
    const textAbove = page.columns.filter((c) => c.kind !== 'span' && c.blocks.some((b) => b.type === 'paragraph') && c.bbox.y + c.bbox.height <= fig.bbox.y + 0.5);
    const textBelow = page.columns.filter((c) => c.kind !== 'span' && c.blocks.some((b) => b.type === 'paragraph') && c.bbox.y >= fig.bbox.y + fig.bbox.height - 0.5);
    expect(textAbove.length).toBe(2);
    expect(textBelow.length).toBeGreaterThan(0);
    // Carried by the frameless box, not by a style of the document.
    const frame = doc.blocks.find((b) => b.type === 'callout');
    expect(frame?.callout?.styleId).toBe('__postext-span-embed');
  });

  it('keeps a column-span embed in its column', () => {
    const doc = build({ position: 'here' });
    const fig = resourceBlock(doc);
    const col = doc.pages[fig.pageIndex]!.columns[fig.columnIndex]!;
    expect(col.kind).not.toBe('span');
    expect(fig.bbox.width).toBeCloseTo(col.bbox.width, 0);
  });

  it('is set at the full measure of a one-column page, as before', () => {
    const single = build({ position: 'here', span: 'page' }, { ...TWO_COL, layout: { layoutType: 'single' } });
    const plain = build({ position: 'here' }, { ...TWO_COL, layout: { layoutType: 'single' } });
    expect(resourceBlock(single).bbox).toEqual(resourceBlock(plain).bbox);
    // The text after it starts where it did.
    const after = (doc: VDTDocument) => doc.blocks.filter((b) => b.type === 'paragraph').map((b) => [b.pageIndex, b.bbox.y]);
    expect(after(single)).toEqual(after(plain));
  });
});
