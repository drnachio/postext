import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import type { DesignElement, HeadingLevelConfig, PostextConfig } from '../../types';
import type { VDTDesignTextBlock, VDTDocument } from '../../vdt';

// EF-59: `{chapterNumber}` in a heading design was measured with the
// heading's own number prefix (empty without a numbering template) but
// painted with the chapter number the running heads use (the chapter
// ordinal when there is no prefix). The reserved band and the painted
// design then disagreed. Measure and paint now read the same value.

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

const DPI = 72; // 1pt = 1px
const pt = (value: number) => ({ value, unit: 'pt' as const });

/** One number per line: a 10 pt wide box holds one digit (7 px) but not
 *  two words, so the band is as tall as the number is non-empty. */
const numbers: DesignElement = {
  kind: 'text', id: 'num', content: '{chapterNumber} {chapterNumber} {chapterNumber} {chapterNumber}',
  fontSize: pt(10), lineHeight: 1.5, overflow: 'wrap',
  placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(10), height: 'auto' } },
};

const config = (level: Partial<HeadingLevelConfig> = {}, extra: Partial<PostextConfig> = {}): PostextConfig => ({
  page: { dpi: DPI, width: pt(300), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  headings: { levels: [{
    level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' },
    advancedDesign: { enabled: true, slot: { elements: [numbers] } },
    ...level,
  }] },
  ...extra,
});

function openerAndBody(doc: VDTDocument, pageIndex = 0) {
  const page = doc.pages[pageIndex]!;
  const band = page.openerBand!.blocks.find((b) => b.kind === 'text') as VDTDesignTextBlock;
  const body = page.columns.flatMap((c) => c.blocks).find((b) => b.type === 'paragraph')!;
  return { band, body, printed: band.lines.map((l) => l.text).join('|') };
}

describe('EF-59: {chapterNumber} measured as painted', () => {
  it('without a numbering template: the band reserved holds the chapter ordinal painted', () => {
    const doc = buildDocument({ markdown: '# One\n\nBody text.' }, config());
    const { band, body, printed } = openerAndBody(doc);
    expect(printed).toBe('1|1|1|1');
    expect(body.bbox.y).toBeGreaterThanOrEqual(band.bbox.y + band.bbox.height - 0.01);
  });

  it('continues the chapter ordinal of the preceding content', () => {
    const doc = buildDocument({ markdown: '# Five\n\nBody text.', continuation: { headings: { h1: 4, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 } } }, config());
    const { band, body, printed } = openerAndBody(doc);
    expect(printed).toBe('5|5|5|5');
    expect(body.bbox.y).toBeGreaterThanOrEqual(band.bbox.y + band.bbox.height - 0.01);
  });

  it('with a numbering template: the prefix, both ways', () => {
    const doc = buildDocument({ markdown: '# One\n\nBody text.' }, config({ numberingTemplate: '{1}' }));
    const { band, body, printed } = openerAndBody(doc);
    expect(printed).toBe('1|1|1|1');
    expect(body.bbox.y).toBeGreaterThanOrEqual(band.bbox.y + band.bbox.height - 0.01);
  });

  it('a heading style that prints no number: nothing, both ways (the band stays one line)', () => {
    const doc = buildDocument(
      { markdown: '# Preface {style="plain"}\n\nBody text.' },
      config({}, { headingStyles: [{ id: 'plain', numberingTemplate: '' }] }),
    );
    const { band, body, printed } = openerAndBody(doc);
    expect(printed.replace(/\|/g, '').trim()).toBe('');
    expect(body.bbox.y).toBeGreaterThanOrEqual(band.bbox.y + band.bbox.height - 0.01);
    // One 15 px line from the content top, then the body.
    expect(body.bbox.y).toBeLessThan(20 + 15 * 4);
  });

  it('the second chapter of a document measures its own ordinal', () => {
    const doc = buildDocument({ markdown: '# One\n\nBody text.\n\n# Two\n\nMore body text.' }, config());
    const second = doc.pages.findIndex((p, i) => i > 0 && p.openerBand);
    const { band, body, printed } = openerAndBody(doc, second);
    expect(printed).toBe('2|2|2|2');
    expect(body.bbox.y).toBeGreaterThanOrEqual(band.bbox.y + band.bbox.height - 0.01);
  });

  // A design taller than the column is force-placed ("place anyway"). That
  // branch did not stamp the heading's number prefix, so the band was
  // measured with "C1" and painted with the ordinal, and the running head
  // printed "1 · C1 One" instead of "C1 · One".
  it('an opener taller than its column keeps its prefix, in the band and the running heads', () => {
    const tall: DesignElement = {
      kind: 'text', id: 'num', content: Array(40).fill('{chapterNumber}').join(' '),
      fontSize: pt(10), lineHeight: 1.5, overflow: 'wrap',
      placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(30), height: 'auto' } },
    };
    const doc = buildDocument(
      { markdown: '# One\n\nBody text.\n\n' + 'More text. '.repeat(300) },
      config(
        { numberingTemplate: 'C{1}', advancedDesign: { enabled: true, slot: { elements: [tall] } } },
        {
          page: { dpi: DPI, width: pt(300), height: pt(400), margins: { top: pt(40), bottom: pt(20), left: pt(20), right: pt(20) } },
          header: { elements: [{
            kind: 'text', id: 'h', content: '{chapterNumber} · {chapterTitle}', fontSize: pt(8), overflow: 'wrap',
            placement: { anchor: { to: 'container', edge: 'bottom' }, size: { width: 'auto', height: 'auto' } },
          }] },
        },
      ),
    );
    const heading = doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks)).find((b) => b.type === 'heading')!;
    expect(heading.numberPrefix).toBe('C1');
    const band = doc.pages[0]!.openerBand!.blocks.find((b) => b.kind === 'text') as VDTDesignTextBlock;
    // "C1 C1" is 35 px, wider than the 30 px box: one prefix per line, as measured.
    expect(band.lines).toHaveLength(40);
    expect(new Set(band.lines.map((l) => l.text))).toEqual(new Set(['C1']));
    const heads = doc.pages
      .map((p) => (p.header?.blocks ?? []).flatMap((b) => ('lines' in b ? b.lines.map((l) => l.text) : [])).join(' '))
      .filter((t) => t.length > 0);
    expect(heads.length).toBeGreaterThan(0);
    for (const h of heads) expect(h).toBe('C1 · One');
  });
});

// Paint read the page's chapter number (the last level-1 heading on the
// page) instead of the heading's own. Two chapters meeting on one page then
// both printed the second one's number, and an H2 before a later H1 on its
// page printed the later chapter's number, while the measurement used the
// heading's own.
describe('EF-59: a heading design paints its own chapter number', () => {
  const text = (content: string): DesignElement => ({
    kind: 'text', id: 't', content, fontSize: pt(10), lineHeight: 1.5, overflow: 'wrap',
    placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(250), height: 'auto' } },
  });
  const twoLevels = (h2Span: 'column' | 'page' = 'column'): PostextConfig => ({
    page: { dpi: DPI, width: pt(300), height: pt(800), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
    headings: {
      levels: [
        {
          level: 1, span: 'column', breakBefore: { enabled: false },
          advancedDesign: { enabled: true, slot: { elements: [text('Chapter {chapterNumber}: {titleText}')] } },
        },
        {
          level: 2, span: h2Span, breakBefore: { enabled: false },
          advancedDesign: { enabled: true, slot: { elements: [text('Part of chapter {chapterNumber}')] } },
        },
      ],
    },
  });
  const printedOf = (slot: VDTDocument['pages'][number]['openerBand']) =>
    (slot?.blocks ?? [])
      .filter((b): b is VDTDesignTextBlock => b.kind === 'text')
      .map((b) => b.lines.map((l) => l.text).join(' '))
      .join('|');
  const headings = (doc: VDTDocument) =>
    doc.pages[0]!.columns.flatMap((c) => c.blocks).filter((b) => b.type === 'heading');

  it('two in-column chapters on one page: each prints its own number', () => {
    const doc = buildDocument({ markdown: '# One\n\nBody.\n\n# Two\n\nMore body.' }, twoLevels());
    expect(doc.pages).toHaveLength(1);
    expect(headings(doc).map((b) => printedOf(b.designOverlay))).toEqual(['Chapter 1: One', 'Chapter 2: Two']);
  });

  it('an H2 before a later chapter on its page prints the chapter it belongs to', () => {
    const doc = buildDocument({ markdown: '# One\n\nBody.\n\n## Sub\n\nText.\n\n# Two\n\nMore body.' }, twoLevels());
    expect(doc.pages).toHaveLength(1);
    const h2 = headings(doc).find((b) => b.headingLevel === 2)!;
    expect(printedOf(h2.designOverlay)).toBe('Part of chapter 1');
  });

  it('a page opener with a later chapter on its page prints the chapter it belongs to', () => {
    const doc = buildDocument({ markdown: '# One\n\nBody.\n\n## Sub\n\nText.\n\n# Two\n\nMore body.' }, twoLevels('page'));
    const page = doc.pages.find((p) => p.openerBand)!;
    // The later chapter shares the opener's page.
    expect(page.columns.flatMap((c) => c.blocks).some((b) => b.headingLevel === 1)).toBe(true);
    expect(printedOf(page.openerBand)).toBe('Part of chapter 1');
  });

  it('the running heads still print the page\'s chapter (the last one on it)', () => {
    const cfg = twoLevels();
    cfg.header = { elements: [{ ...text('Header {chapterNumber}'), id: 'h' }] };
    const doc = buildDocument({ markdown: '# One\n\nBody.\n\n# Two\n\nMore body.' }, cfg);
    expect(printedOf(doc.pages[0]!.header)).toBe('Header 2');
  });
});
