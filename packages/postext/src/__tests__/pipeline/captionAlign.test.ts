import { describe, it, expect } from 'vitest';
import { layoutResourceBlock } from '../../pipeline/resourceLayout';
import { resolveAllConfig } from '../../pipeline/config';
import { defaultResourceTypes } from '../../defaults/resourceTypes';
import { buildDocument } from '../../pipeline';
import { dimensionToPx } from '../../units';
import type { CaptionStyleConfig, PostextConfig, Resource, ResourceType, TextAlign } from '../../types';

// EF-166: `captionStyle.align` and `captionStyle.note.align` set to
// 'center' or 'right' were ignored: the measurer only acts on 'justify',
// and every caption and note line stayed flush left.

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

const W = 400;

const figure: Resource = {
  id: 'fig',
  typeId: 'figure',
  kind: 'bitmap',
  caption: 'Short caption',
  note: 'Short note',
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: 'fig.png', format: 'png', width: 400, height: 200 },
};

function layout(captionStyle: CaptionStyleConfig, resource: Resource = figure, types?: ResourceType[]) {
  const config: PostextConfig = { captionStyle };
  const resourceTypes = types ?? defaultResourceTypes();
  const resolved = resolveAllConfig(config);
  const { block } = layoutResourceBlock({
    resource,
    resourceType: resourceTypes.find((t) => t.id === resource.typeId),
    number: '1',
    resolved,
    columnWidth: W,
    resourceNumbering: { [resource.id]: { number: '1', typeId: resource.typeId, heading: { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 } } },
    resourceTypes,
    resources: [resource],
  });
  return { block, resolved };
}

const slack = (x: number, width: number, align: TextAlign, room = W, inset = 0): number =>
  x - inset - (align === 'center' ? (room - width) / 2 : align === 'right' ? room - width : 0);

describe('EF-166: caption and note alignment', () => {
  for (const align of ['left', 'center', 'right'] as const) {
    it(`sets a one-line caption and note ${align}`, () => {
      const { block } = layout({ align, note: { align } });
      const cap = block.captionLines[0]!;
      const note = block.noteLines[0]!;
      expect(slack(cap.bbox.x, cap.bbox.width, align)).toBeCloseTo(0, 6);
      expect(slack(note.bbox.x, note.bbox.width, align)).toBeCloseTo(0, 6);
    });
  }

  it('aligns every line of a caption that wraps, the last included', () => {
    const long = { ...figure, caption: 'A caption long enough to wrap onto a second line of the measure here and then some more words.' };
    const { block } = layout({ align: 'right' }, long);
    expect(block.captionLines.length).toBeGreaterThan(1);
    for (const line of block.captionLines) expect(line.bbox.x + line.bbox.width).toBeCloseTo(W, 6);
  });

  it('centres within the caption bar\'s padding', () => {
    const { block, resolved } = layout({ align: 'center', backgroundEnabled: true, padding: { value: 10, unit: 'px' } });
    const pad = dimensionToPx(resolved.captionStyle.padding, resolved.page.dpi);
    const cap = block.captionLines[0]!;
    expect(slack(cap.bbox.x, cap.bbox.width, 'center', W - pad * 2, pad)).toBeCloseTo(0, 6);
  });

  it('a resource type\'s caption style aligns its captions too', () => {
    const types = defaultResourceTypes().map((t) => (t.id === 'figure' ? { ...t, captionStyle: { align: 'center' as const } } : t));
    const { block } = layout({}, figure, types);
    const cap = block.captionLines[0]!;
    expect(slack(cap.bbox.x, cap.bbox.width, 'center')).toBeCloseTo(0, 6);
  });

  it('keeps a justified caption flush on both sides except its last line', () => {
    const long = { ...figure, caption: 'A caption long enough to wrap onto a second line of the measure here and then some more words.' };
    const { block } = layout({ align: 'justify' }, long);
    expect(block.captionLines[0]!.bbox.x).toBe(0);
    expect(block.captionLines[block.captionLines.length - 1]!.bbox.x).toBe(0);
  });

  it('places the lines where the page is built, inline and floated', () => {
    const table: Resource = {
      id: 't', typeId: 'table', kind: 'table', caption: 'Short caption', note: 'Short note', createdAt: 0, updatedAt: 0,
      placement: { position: 'here' }, table: { model: { rows: [[{ content: 'a' }, { content: 'b' }]] } },
    };
    const doc = buildDocument(
      { markdown: 'Some text.\n\n::resource{id="t"}\n\nMore text.', resources: [table] },
      { page: { dpi: 100 }, layout: { layoutType: 'single' }, captionStyle: { align: 'center', note: { align: 'center' } } },
    );
    const block = doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks)).find((b) => b.resourceBlock)!;
    const col = doc.pages[0]!.columns[0]!;
    const rb = block.resourceBlock!;
    for (const line of [rb.captionLines[0]!, rb.noteLines[0]!]) {
      const mid = line.bbox.x + line.bbox.width / 2;
      expect(mid).toBeCloseTo(col.bbox.x + col.bbox.width / 2, 3);
    }
  });
});
