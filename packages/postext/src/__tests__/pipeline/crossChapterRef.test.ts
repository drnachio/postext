import { describe, it, expect } from 'vitest';
import { buildBundle } from '../../bundle';
import { buildDocument } from '../../pipeline/build';
import { continuationAfter } from '../../pipeline/continuation';
import { anchoredResourceIds, renderToHtml } from '../../html-backend';
import { createMeasurementCache } from '../../measure';
import type { PostextConfig, Resource, VDTDocument } from '../../index';

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
const para = (i: number) => `Paragraph ${i} carries enough words to take a few lines of the narrow column so the flow advances steadily.`;
const filler = (n: number) => Array.from({ length: n }, (_, i) => para(i)).join('\n\n');

const figure = (id: string, placement?: Resource['placement']): Resource => ({
  id,
  typeId: 'figure',
  kind: 'bitmap',
  caption: `Figure ${id}.`,
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: `${id}.png`, format: 'png', width: 400, height: 300 },
  ...(placement ? { placement } : {}),
});

const config: PostextConfig = {
  page: { width: pt(400), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }] },
};

const floatIds = (doc: VDTDocument): string[] =>
  doc.pages.flatMap((p) => (p.floats ?? []).map((f) => f.resourceBlock?.resource.id ?? f.id));
const inlineResourceIds = (doc: VDTDocument): string[] =>
  doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks.filter((b) => b.type === 'resource').map((b) => b.resourceBlock!.resource.id)));

describe('a figure first cited in an earlier chapter is not placed again (EF-57)', () => {
  const resources = [figure('f1'), figure('f2')];
  const chapters = [
    { markdown: `# One\n\nSee :ref{id="f1"} here.\n\n${filler(4)}` },
    { markdown: `# Two\n\nAs :ref{id="f1"} showed, and :ref{id="f2"} shows.\n\n${filler(4)}` },
  ];

  it('buildBundle floats the figure in the chapter that first cites it only', () => {
    const docs = buildBundle({ chapters, config, resources });
    expect(floatIds(docs[0]!)).toEqual(['f1']);
    expect(floatIds(docs[1]!)).toEqual(['f2']);
  });

  it('the later chapter still prints the figure number of its first mention', () => {
    const docs = buildBundle({ chapters, config, resources });
    const refs = docs[1]!.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks.flatMap((b) =>
      b.lines.flatMap((l) => (l.segments ?? []).filter((s) => s.refResourceId).map((s) => [s.refResourceId, s.text])))));
    expect(refs.find(([id]) => id === 'f1')?.[1]).toMatch(/1\.1/);
    expect(refs.find(([id]) => id === 'f2')?.[1]).toMatch(/2\.1/);
  });

  it('a chapter laid out with the continuation of the one before behaves the same', () => {
    const before = continuationAfter({ ...chapters[0]!, resources }, config);
    const doc = buildDocument({ markdown: chapters[1]!.markdown, resources, continuation: before }, config, createMeasurementCache());
    expect(floatIds(doc)).toEqual(['f2']);
  });

  it('a `::resource` for a floating figure placed earlier is just another reference', () => {
    const md = [
      { markdown: `# One\n\nSee :ref{id="f1"} here.\n\n${filler(2)}` },
      { markdown: `# Two\n\n::resource{id="f1"}\n\n${filler(2)}` },
    ];
    const docs = buildBundle({ chapters: md, config, resources });
    expect(floatIds(docs[1]!)).toEqual([]);
    expect(inlineResourceIds(docs[1]!)).toEqual([]);
  });

  it('an inline (`here`) embed is still set where the later chapter embeds it', () => {
    const here = [figure('f1', { position: 'here' })];
    const md = [
      { markdown: `# One\n\n::resource{id="f1"}\n\n${filler(2)}` },
      { markdown: `# Two\n\n::resource{id="f1"}\n\n${filler(2)}` },
    ];
    const docs = buildBundle({ chapters: md, config, resources: here });
    expect(inlineResourceIds(docs[0]!)).toEqual(['f1']);
    expect(inlineResourceIds(docs[1]!)).toEqual(['f1']);
  });

  it('a single document keeps placing each figure once, at its first reference', () => {
    const doc = buildDocument(
      { markdown: `# One\n\nSee :ref{id="f1"}.\n\n${filler(4)}\n\n# Two\n\nAgain :ref{id="f1"} and :ref{id="f2"}.\n\n${filler(4)}`, resources },
      config,
      createMeasurementCache(),
    );
    expect(floatIds(doc).sort()).toEqual(['f1', 'f2']);
  });
});

describe('HTML links of a reference to a figure an earlier chapter placed (EF-57)', () => {
  const resources = [figure('f1'), figure('f2')];
  const chapters = [
    { markdown: `# One\n\nSee :ref{id="f1"} here.\n\n${filler(4)}` },
    { markdown: `# Two\n\nAs :ref{id="f1"} showed, and :ref{id="f2"} shows.\n\n${filler(4)}` },
  ];

  it('a chapter rendered on its own sets it as text, not as a link to nowhere', () => {
    const docs = buildBundle({ chapters, config, resources });
    const first = renderToHtml(docs[0]!);
    const second = renderToHtml(docs[1]!);
    expect(first).toContain('href="#pt-res-f1"');
    expect(first).toContain('id="pt-res-f1"');
    // f1 lives in chapter one: no anchor to it here, but the number stays.
    expect(second).not.toContain('pt-res-f1');
    expect(second).toContain('1.1');
    // f2 is placed in this chapter and still links.
    expect(second).toContain('href="#pt-res-f2"');
    expect(second).toContain('id="pt-res-f2"');
  });

  it('a host joining the chapters on one page links them all with refTargets', () => {
    const docs = buildBundle({ chapters, config, resources });
    const refTargets = new Set(docs.flatMap((d) => [...anchoredResourceIds(d)]));
    expect([...refTargets].sort()).toEqual(['f1', 'f2']);
    const html = docs.map((d) => renderToHtml(d, { refTargets })).join('');
    // Chapter two's reference to f1 links to chapter one's anchor.
    expect(html.split('href="#pt-res-f1"').length - 1).toBe(2);
    expect(html.split('id="pt-res-f1"').length - 1).toBe(1);
    // The option adds to the document's own anchors, and any iterable does.
    const second = renderToHtml(docs[1]!, { refTargets: ['f1'] });
    expect(second).toContain('href="#pt-res-f1"');
    expect(second).toContain('href="#pt-res-f2"');
    // An id nothing anchors still gets no link.
    expect(renderToHtml(docs[1]!, { refTargets: ['f9'] })).not.toContain('href="#pt-res-f1"');
  });

  it('a reference whose figure is in the document keeps its link', () => {
    const doc = buildDocument(
      { markdown: `# One\n\nSee :ref{id="f1"}.\n\n${filler(4)}\n\n# Two\n\nAgain :ref{id="f1"}.\n\n${filler(4)}`, resources },
      config,
      createMeasurementCache(),
    );
    const html = renderToHtml(doc);
    expect(html.split('href="#pt-res-f1"').length - 1).toBe(2);
  });
});
