import { describe, it, expect } from 'vitest';
import { justifySnippetLine, layoutResourceBlock } from '../../../pipeline/resources/resourceLayout.js';
import { resolveAllConfig } from '../../../pipeline/config.js';
import { defaultResourceTypes } from '../../../defaults/resources/resourceTypes.js';
import { buildDocument } from '../../../pipeline/index.js';
import { dimensionToPx } from '../../../units.js';
import { createBoundingBox } from '../../../vdt.js';
import type { VDTLine, VDTLineSegment } from '../../../vdt.js';
import type { CaptionStyleConfig, PostextConfig, Resource, ResourceType, TextAlign } from '../../../types.js';

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

  // #1099: the measurer broke a justified caption for the full width but
  // left its spaces natural, so every renderer painted it ragged.
  it('spreads a justified caption line\'s slack over its word spaces, the last line left natural', () => {
    const long = { ...figure, caption: 'A caption long enough to wrap onto a second line of the measure here and then some more words to fill a third.' };
    const { block } = layout({ align: 'justify' }, long);
    const lines = block.captionLines;
    expect(lines.length).toBeGreaterThan(2);
    const sum = (line: (typeof lines)[number]) => line.segments!.reduce((s, seg) => s + seg.width, 0);
    for (const line of lines.slice(0, -1)) {
      expect(sum(line)).toBeCloseTo(W, 6);
      expect(line.bbox.width).toBeCloseTo(W, 6);
      const spaces = line.segments!.filter((s) => s.kind === 'space').map((s) => s.width);
      expect(spaces.length).toBeGreaterThan(0);
      for (const w of spaces) expect(w).toBeCloseTo(spaces[0]!, 6);
      expect(spaces[0]!).toBeGreaterThanOrEqual(7);
    }
    const last = lines[lines.length - 1]!;
    expect(sum(last)).toBeLessThan(W);
    for (const s of last.segments!.filter((seg) => seg.kind === 'space')) expect(s.width).toBe(7);
  });

  it('justifies a justified note too, and leaves a left-aligned caption natural', () => {
    const long = { ...figure, caption: 'A caption long enough to wrap onto a second line of the measure here and then some more words.', note: 'A note long enough to wrap onto a second line of the measure here and then some more words.' };
    const { block } = layout({ align: 'left', note: { align: 'justify' } }, long);
    const sum = (segs: { width: number }[]) => segs.reduce((s, seg) => s + seg.width, 0);
    expect(sum(block.noteLines[0]!.segments!)).toBeCloseTo(W, 6);
    expect(sum(block.captionLines[0]!.segments!)).toBeLessThan(W);
    for (const s of block.captionLines[0]!.segments!.filter((seg) => seg.kind === 'space')) expect(s.width).toBe(7);
  });

  it('places a highlight band over the widened spaces of a justified caption', () => {
    const long: Resource = { ...figure, placement: { position: 'here' }, caption: 'A caption :mark[long enough to wrap] onto a second line of the measure here and then some more words.' };
    const doc = buildDocument(
      { markdown: 'Some text.\n\n::resource{id="fig"}\n\nMore text.', resources: [long] },
      { page: { dpi: 100 }, layout: { layoutType: 'single' }, captionStyle: { align: 'justify' } },
    );
    const rb = doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks)).find((b) => b.resourceBlock)!.resourceBlock!;
    const line = rb.captionLines[0]!;
    const band = line.highlights![0]!;
    // The band runs from the first marked word to the end of the last one,
    // where the widened segments put them.
    const segs = line.segments!;
    let x = 0;
    let start = -1;
    let end = -1;
    segs.forEach((seg) => {
      if (seg.mark && start < 0) start = x;
      if (seg.mark) end = x + seg.width;
      x += seg.width;
    });
    expect(band.x).toBeLessThanOrEqual(start + 1e-6);
    expect(band.x + band.width).toBeGreaterThanOrEqual(end - 1e-6);
    expect(band.x + band.width - end).toBeLessThan(10);
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

describe('#1099: justifySnippetLine', () => {
  const line = (segments: VDTLineSegment[], extra: Partial<VDTLine> = {}): VDTLine => ({
    text: segments.map((s) => s.text).join(''),
    bbox: createBoundingBox(0, 0, segments.reduce((s, seg) => s + seg.width, 0), 10),
    baseline: 8,
    hyphenated: false,
    segments,
    ...extra,
  });
  const word = (text: string, width: number): VDTLineSegment => ({ kind: 'text', text, width });
  const space = (width = 5, more: Partial<VDTLineSegment> = {}): VDTLineSegment => ({ kind: 'space', text: ' ', width, ...more });

  it('keeps a Han–Latin space and a hung mark out of the spread', () => {
    const l = line([word('中文', 40), space(3, { autospace: true }), word('Latin', 30), space(), word('word', 20), { ...word('。', 10), hangs: true }]);
    const out = justifySnippetLine(l, 120);
    const segs = out.segments!;
    expect(segs[1]!.width).toBe(3);
    expect(segs[3]!.width).toBeCloseTo(120 - 40 - 3 - 30 - 20, 6);
    expect(segs[5]!.width).toBe(10);
    // The measured line is left as it was.
    expect(l.segments![3]!.width).toBe(5);
  });

  it('returns a line already at its measure as it was', () => {
    const l = line([word('a', 45), space(10), word('b', 45)]);
    expect(justifySnippetLine(l, 100)).toBe(l);
  });

  it('leaves the last line, a ragged line and a tabbed line natural, unless overfull', () => {
    const segs = [word('a', 40), space(), word('b', 40)];
    for (const extra of [{ isLastLine: true }, { ragged: true }, { tabbed: true as const }]) {
      const l = line(segs, extra);
      expect(justifySnippetLine(l, 120)).toBe(l);
    }
    const over = justifySnippetLine(line([word('a', 50), space(10), word('b', 45)], { isLastLine: true }), 100);
    expect(over.segments![1]!.width).toBeCloseTo(5, 6);
  });

  it('justifies a right-to-left line in its span, its order kept', () => {
    const l = line([word('ب', 30), space(), word('ا', 30)], { order: [2, 1, 0], measure: { x: 0, width: 90 } });
    const out = justifySnippetLine(l, 200);
    expect(out.segments![1]!.width).toBeCloseTo(30, 6);
    expect(out.order).toEqual([2, 1, 0]);
  });
});
