import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/index.js';
import { formatWarning } from '../../../pipeline/contentWarnings.js';
import type { ContentWarning, PostextConfig, Resource, VDTDocument } from '../../../index.js';

// #1151: `emptyCaption` when a typed resource prints its label and number
// alone, and `resourceMoved` when a resource set in the text moves on and
// leaves the foot of its column empty.

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
const CONFIG: PostextConfig = {
  page: { width: pt(400), height: pt(500), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] },
};

const figure = (id: string, caption: string | undefined, placement: Resource['placement'] = { position: 'here' }, height = 600): Resource => ({
  id,
  typeId: 'figure',
  kind: 'bitmap',
  ...(caption !== undefined ? { caption } : {}),
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: `${id}.png`, format: 'png', width: 1000, height },
  placement,
});

const para = (i: number) => `Paragraph ${i} carries enough words to take a few lines of the column so the flow advances steadily.`;
const filler = (n: number, from = 0) => Array.from({ length: n }, (_, i) => para(from + i)).join('\n\n');
const build = (markdown: string, resources: Resource[]): VDTDocument => buildDocument({ markdown, resources }, CONFIG);
const of = <K extends ContentWarning['kind']>(doc: VDTDocument, kind: K) =>
  (doc.contentWarnings ?? []).filter((w): w is Extract<ContentWarning, { kind: K }> => w.kind === kind);

describe('emptyCaption (#1151)', () => {
  it('reports a figure whose caption line is its label alone, once, at its embed', () => {
    const md = `${filler(1)}\n\n::resource{id="a"}\n\n${filler(1, 1)} See :ref{id="a"} again.`;
    const doc = build(md, [figure('a', '')]);
    const ws = of(doc, 'emptyCaption');
    expect(ws).toHaveLength(1);
    expect(ws[0]!.resourceId).toBe('a');
    expect(ws[0]!.label).toMatch(/1/);
    expect(ws[0]!.pageIndex).toBe(0);
    expect(md.slice(ws[0]!.sourceStart, ws[0]!.sourceEnd)).toContain('::resource{id="a"}');
    expect(formatWarning(ws[0]!)).toContain('"a"');
  });

  it('says nothing of a figure with a caption, nor of a type with no prefix', () => {
    const md = `${filler(1)}\n\n::resource{id="a"}\n\n::resource{id="b"}\n\n${filler(1, 1)}`;
    const doc = buildDocument(
      { markdown: md, resources: [figure('a', 'A caption.', { position: 'here' }, 200), { ...figure('b', '', { position: 'here' }, 200), typeId: 'plain' }] },
      { ...CONFIG, resourceTypes: [{ id: 'plain', name: 'Plain', captionPrefix: '' } as never] },
    );
    expect(of(doc, 'emptyCaption')).toHaveLength(0);
  });

  it('covers a float, pointed at the paragraph citing it', () => {
    const md = `${filler(1)} See :ref{id="f"}.\n\n${filler(3, 1)}`;
    const doc = build(md, [figure('f', undefined, { position: 'top' }, 300)]);
    const ws = of(doc, 'emptyCaption');
    expect(ws.map((w) => w.resourceId)).toEqual(['f']);
    expect(md.slice(ws[0]!.sourceStart, ws[0]!.sourceEnd)).toContain(':ref{id="f"}');
  });
});

describe('resourceMoved (#1151)', () => {
  it('reports a figure set in the text that moves on and leaves its column empty, with the room in mm', () => {
    const md = `${filler(22)}\n\n::resource{id="tall"}\n\n${filler(2, 10)}`;
    const doc = build(md, [figure('tall', 'A tall picture.', { position: 'here' }, 900)]);
    const ws = of(doc, 'resourceMoved');
    expect(ws).toHaveLength(1);
    const w = ws[0]!;
    expect(w.resourceId).toBe('tall');
    expect(w.pageIndex).toBe(0);
    // The figure itself stands on the next page.
    const placedOn = doc.pages.findIndex((p) => p.columns.some((c) => c.blocks.some((b) => b.resourceBlock?.resource.id === 'tall')));
    expect(placedOn).toBe(1);
    expect(w.emptyPx).toBeGreaterThan(0);
    expect(w.emptyMm).toBeCloseTo(Math.round((w.emptyPx * 254) / doc.config.page.dpi) / 10, 0);
    expect(md.slice(w.sourceStart, w.sourceEnd)).toContain('::resource{id="tall"}');
    expect(formatWarning(w)).toContain(`${w.emptyMm} mm`);
  });

  it('says nothing when the figure fits where it stands', () => {
    const md = `${filler(1)}\n\n::resource{id="small"}\n\n${filler(2, 10)}`;
    const doc = build(md, [figure('small', 'A small picture.', { position: 'here' }, 200)]);
    expect(of(doc, 'resourceMoved')).toHaveLength(0);
  });
});
