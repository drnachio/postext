import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { formatWarning } from '../../pipeline/contentWarnings';
import type { DesignElement, DesignTextElement, PostextConfig } from '../../types';
import type { ContentWarning, VDTDesignSlot, VDTDesignTextBlock, VDTDocument } from '../../vdt';

// #628: heading and part titles that set no `overflow` wrap, and every
// design text cut to fit its width is reported as a `designTextTruncated`
// content warning — one per element and page, a running head once per
// element and text.

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

/** A text element `chars` characters wide (7 px each at 72 dpi). */
const text = (id: string, content: string, chars: number, extra: Partial<DesignTextElement> = {}): DesignElement => ({
  kind: 'text', id, content, fontSize: pt(10),
  placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(chars * 7) } },
  ...extra,
} as DesignElement);

const base = (extra: PostextConfig = {}): PostextConfig => ({
  page: { width: pt(300), height: pt(400), dpi: 72, margins: { top: pt(40), bottom: pt(40), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  ...extra,
});

const filler = (n: number) => Array.from({ length: n }, (_, i) => `Paragraph ${i} with enough words to fill the page and run on.`).join('\n\n');
const cut = (doc: VDTDocument): Extract<ContentWarning, { kind: 'designTextTruncated' }>[] =>
  (doc.contentWarnings ?? []).filter((w): w is Extract<ContentWarning, { kind: 'designTextTruncated' }> => w.kind === 'designTextTruncated');
const textBlocks = (slot: VDTDesignSlot | undefined): VDTDesignTextBlock[] =>
  (slot?.blocks ?? []).filter((b): b is VDTDesignTextBlock => b.kind === 'text');

const LONG = 'A chapter title much too long for its box';

describe('#628: heading designs wrap by default', () => {
  const opener = (el: DesignElement): PostextConfig => base({
    headings: { levels: [{ level: 1, span: 'page', breakBefore: { enabled: false }, advancedDesign: { enabled: true, slot: { elements: [el] } } }] },
  });

  it('wraps an opener title that sets no overflow, and reports nothing', () => {
    const doc = buildDocument({ markdown: `# ${LONG}\n\n${filler(2)}` }, opener(text('title', '{titleText}', 20)));
    const lines = textBlocks(doc.pages[0]!.openerBand)[0]!.lines.map((l) => l.text);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ')).toBe(LONG);
    expect(cut(doc)).toEqual([]);
  });

  it('reports an opener title cut with an ellipsis, on its page, mapped to the heading', () => {
    const md = `# ${LONG}\n\n${filler(2)}`;
    const doc = buildDocument({ markdown: md }, opener(text('title', '{titleText}', 20, { overflow: 'ellipsis-end' })));
    const [w, ...rest] = cut(doc);
    expect(rest).toEqual([]);
    expect(w).toMatchObject({ kind: 'designTextTruncated', slot: 'heading', elementId: 'title', text: LONG, mode: 'ellipsis-end', pageIndex: 0 });
    expect(md.slice(w!.sourceStart, w!.sourceEnd)).toBe(LONG);
    expect(formatWarning(w!)).toContain(LONG);
  });

  it('reports one in-column heading design per page it is cut on', () => {
    const doc = buildDocument(
      { markdown: `## ${LONG}\n\nText.\n\n## ${LONG} again\n\n${filler(1)}` },
      base({ headings: { levels: [{ level: 2, advancedDesign: { enabled: true, slot: { elements: [text('t', '{titleText}', 20, { overflow: 'clip' })] } } }] } }),
    );
    const ws = cut(doc);
    expect(ws.map((w) => [w.slot, w.mode, w.text])).toEqual([
      ['heading', 'clip', LONG],
      ['heading', 'clip', `${LONG} again`],
    ]);
  });
});

describe('#628: running heads', () => {
  it('reports a running head cut on every page of its chapter once', () => {
    const doc = buildDocument(
      { markdown: `# ${LONG}\n\n${filler(30)}` },
      base({ header: { elements: [text('rh', '{chapterTitle}', 20)] } }),
    );
    expect(doc.pages.length).toBeGreaterThan(2);
    // Cut on every page…
    for (const page of doc.pages) expect(textBlocks(page.header)[0]?.lines[0]?.text.endsWith('…')).toBe(true);
    // …and reported once.
    expect(cut(doc)).toEqual([expect.objectContaining({ slot: 'header', elementId: 'rh', text: LONG, mode: 'ellipsis-end', pageIndex: 0 })]);
  });

  it('reports nothing when the running head fits or wraps', () => {
    const fits = buildDocument({ markdown: `# Short\n\n${filler(3)}` }, base({ header: { elements: [text('rh', '{chapterTitle}', 20)] } }));
    expect(cut(fits)).toEqual([]);
    const wraps = buildDocument({ markdown: `# ${LONG}\n\n${filler(3)}` }, base({ header: { elements: [text('rh', '{chapterTitle}', 20, { overflow: 'wrap' })] } }));
    expect(cut(wraps)).toEqual([]);
  });

  it('reports a folio clipped on every page once a chapter', () => {
    const doc = buildDocument(
      { markdown: `# One\n\n${filler(20)}\n\n# Two\n\n${filler(20)}` },
      base({ footer: { elements: [text('f', 'Folio {pageNumber} of a long book', 6, { overflow: 'clip' })] } }),
    );
    expect(doc.pages.length).toBeGreaterThan(3);
    // The second from the first page that runs under chapter Two (the blank
    // verso before its opener included).
    const two = doc.blocks.find((b) => b.type === 'heading' && b.lines[0]?.text.startsWith('Two'))!.pageIndex;
    const ws = cut(doc);
    expect(ws.map((w) => [w.slot, w.mode])).toEqual([['footer', 'clip'], ['footer', 'clip']]);
    expect(ws[0]!.pageIndex).toBe(0);
    expect(ws[1]!.pageIndex).toBeGreaterThan(0);
    expect(ws[1]!.pageIndex).toBeLessThanOrEqual(two);
  });
});

describe('#628: part pages and contents rows', () => {
  const MD = `# Contents {toc="false"}\n\n:::toc\n\n:::part{number="I" title="${LONG}"}\n:::\n\n# The lantern\n\nText.`;
  const cfg = (row: DesignElement, part: DesignElement): PostextConfig => base({
    headings: { levels: [{ level: 1, breakBefore: { enabled: false } }] },
    parts: { design: { elements: [part] } },
    toc: { parts: { enabled: true, design: { elements: [row] } } },
  });

  it('wraps a part title that sets no overflow, and cuts and reports a contents row title', () => {
    const doc = buildDocument({ markdown: MD }, cfg(text('rowTitle', '{titleText}', 20), text('partTitle', '{titleText}', 20)));
    const partPage = doc.pages.find((p) => p.partInfo)!;
    expect(textBlocks(partPage.openerBand)[0]!.lines.map((l) => l.text).join(' ')).toBe(LONG);
    const ws = cut(doc);
    expect(ws).toEqual([expect.objectContaining({ slot: 'tocRow', elementId: 'rowTitle', text: LONG, mode: 'ellipsis-end' })]);
    expect(ws[0]!.pageIndex).toBe(doc.blocks.find((b) => b.tocPart)!.pageIndex);
  });

  it('reports a part title cut with an ellipsis', () => {
    const doc = buildDocument({ markdown: MD }, cfg(text('rowTitle', '{titleText}', 60), text('partTitle', '{titleText}', 20, { overflow: 'ellipsis-middle' })));
    const partPage = doc.pages.find((p) => p.partInfo)!;
    expect(cut(doc)).toEqual([expect.objectContaining({ slot: 'part', elementId: 'partTitle', mode: 'ellipsis-middle', pageIndex: partPage.index })]);
  });
});
