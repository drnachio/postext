import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline';
import { computeChapterNumbersAtTop, computeChapterTitles, computeChapterTitlesAtTop } from '../pipeline/placeholders';
import { resolveHeadingStylesConfig, stripHeadingStylesDefaults } from '../defaults/headingStyles';
import { isAllowedPlaceholder } from '../design/placeholders';
import { resolveAllConfig } from '../pipeline/config';
import type { HeadingStyleConfig, PostextConfig } from '../types';
import type { VDTBlock, VDTDesignTextBlock, VDTDocument, VDTPage } from '../vdt';

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
const mm = (value: number) => ({ value, unit: 'mm' as const });

function block(pageIndex: number, text: string, extra: Partial<VDTBlock> = {}): VDTBlock {
  return {
    id: `${pageIndex}-${text}`,
    type: extra.headingLevel ? 'heading' : 'paragraph',
    bbox: { x: 0, y: 0, width: 0, height: 0 },
    lines: [{ text, bbox: { x: 0, y: 0, width: 0, height: 0 }, baseline: 0, hyphenated: false }],
    pageIndex,
    columnIndex: 0,
    dirty: false,
    snappedToGrid: false,
    fontString: '',
    color: '',
    textAlign: 'left',
    ...extra,
  };
}
const h1 = (pageIndex: number, text: string, extra: Partial<VDTBlock> = {}) => block(pageIndex, text, { headingLevel: 1, ...extra });
const text = (pageIndex: number) => block(pageIndex, 'text');

describe('the chapter in force at the top of a page (EF-187)', () => {
  it('names the chapter a page runs on from, not one that starts lower down', () => {
    const blocks = [h1(0, 'A'), text(0), text(1), h1(1, 'B'), text(1), text(2)];
    expect(computeChapterTitles(blocks, 3)).toEqual(['A', 'B', 'B']);
    expect(computeChapterTitlesAtTop(blocks, 3)).toEqual(['A', 'A', 'B']);
  });

  it('names the chapter whose heading opens the page', () => {
    const blocks = [h1(0, 'A'), text(0), h1(1, 'B'), text(1), h1(1, 'C'), text(2)];
    expect(computeChapterTitlesAtTop(blocks, 3)).toEqual(['A', 'B', 'C']);
  });

  it('gives a blank parity page to the chapter after it, as {chapterTitle} does', () => {
    const blocks = [h1(0, 'A'), text(0), h1(2, 'B'), text(2)];
    const pages = [{}, { blankForParity: true }, {}];
    expect(computeChapterTitlesAtTop(blocks, 3, pages)).toEqual(['A', 'B', 'B']);
    // A float-only or trailing page keeps the chapter in force.
    expect(computeChapterTitlesAtTop([h1(0, 'A'), text(0)], 3)).toEqual(['A', 'A', 'A']);
  });

  it('gives a blank parity page to the chapter at the top of the page after it', () => {
    // The review's probe: a plate opens page 2 after a parity blank, and
    // 'Second' starts lower down that page. Page 2 names 'First' at its
    // top, and so does the blank before it (it named 'Second').
    const blocks = [h1(0, 'First'), text(0), h1(2, 'Plate', { notRunningChapter: true }), h1(2, 'Second'), text(2), text(3)];
    const pages = [{}, { blankForParity: true }, {}, {}];
    expect(computeChapterTitlesAtTop(blocks, 4, pages)).toEqual(['First', 'First', 'First', 'Second']);
    expect(computeChapterTitles(blocks, 4, pages)).toEqual(['First', 'Second', 'Second', 'Second']);
  });

  it('numbers the chapter in force at the top too', () => {
    const blocks = [h1(0, 'A'), text(0), text(1), h1(1, 'B'), text(1)];
    expect(computeChapterNumbersAtTop(blocks, 2)).toEqual(['1', '1']);
    expect(computeChapterNumbersAtTop([...blocks, text(2)], 3)).toEqual(['1', '1', '2']);
  });

  it('is a running-head placeholder only', () => {
    expect(isAllowedPlaceholder('chapterTitleAtTop', 'header')).toBe(true);
    expect(isAllowedPlaceholder('chapterNumberAtTop', 'footer')).toBe(true);
    expect(isAllowedPlaceholder('chapterTitleAtTop', 'heading')).toBe(false);
  });
});

describe('a plate that is no running chapter (EF-188)', () => {
  it('leaves the chapter in force on its page and the pages after it', () => {
    const blocks = [h1(0, 'A'), text(0), h1(1, 'Plate', { notRunningChapter: true }), text(2), h1(3, 'B')];
    expect(computeChapterTitles(blocks, 4)).toEqual(['A', 'A', 'A', 'B']);
    expect(computeChapterTitlesAtTop(blocks, 4)).toEqual(['A', 'A', 'A', 'B']);
  });

  it('claims no blank parity page before it', () => {
    const blocks = [h1(0, 'A'), text(0), h1(2, 'Plate', { notRunningChapter: true }), text(3)];
    expect(computeChapterTitles(blocks, 4, [{}, { blankForParity: true }, {}, {}])).toEqual(['A', 'A', 'A', 'A']);
  });

  it('resolves and strips runningChapter like the other switches', () => {
    const base = resolveAllConfig();
    const resolved = resolveHeadingStylesConfig(
      [{ id: 'a' }, { id: 'plate', runningChapter: false }],
      base.page, base.bodyText, base.unorderedLists, base.orderedLists,
    );
    expect(resolved.map((s) => s.runningChapter)).toEqual([true, false]);
    expect(stripHeadingStylesDefaults([{ id: 'a', runningChapter: true }, { id: 'plate', runningChapter: false }])).toEqual([
      { id: 'a' },
      { id: 'plate', runningChapter: false },
    ]);
  });
});

// A book of run-on chapters: level-1 headings open no page, a running head
// prints every chapter placeholder, and a `plate` style sets a full-page
// picture title inside a chapter (short-chapters-run-on).
const PARA = 'Words run on here and fill the page line after line. '.repeat(6);
function book(plate: Partial<HeadingStyleConfig> = {}): PostextConfig {
  return {
    page: { width: mm(120), height: mm(160), margins: { top: mm(20), bottom: mm(15), left: mm(15), right: mm(15) } },
    layout: { layoutType: 'single' },
    headings: { levels: [{ level: 1, breakBefore: { enabled: false }, numberingTemplate: '' }] },
    headingStyles: [{ id: 'plate', numbered: false, span: 'page', breakBefore: { enabled: true, parity: 'any' }, ...plate }],
    header: {
      elements: [{
        kind: 'text', id: 'rh', overflow: 'clip', fontSize: pt(6),
        content: '{chapterTitle}|{chapterTitleAtTop}|{chapterNumber}|{chapterNumberAtTop}|{attr.short}|{firstMark.h1}',
        placement: { anchor: { to: 'container', edge: 'bottom-left' }, size: { width: 'fill' } },
      }],
    },
  };
}
const headOf = (page: VDTPage): string[] =>
  (page.header?.blocks.find((b): b is VDTDesignTextBlock => b.kind === 'text')?.lines ?? []).map((l) => l.text).join('').split('|');
const pageOfHeading = (doc: VDTDocument, title: string): number =>
  doc.blocks.find((b) => b.type === 'heading' && b.lines.some((l) => l.text.includes(title)))!.pageIndex;

describe('running heads of a book of run-on chapters', () => {
  const chapters = (n: number) => Array.from({ length: n }, () => PARA).join('\n\n');
  // Page 0 holds the first chapter's start, page 1 its end and the start of
  // the second, page 2 the second's end; the plate opens page 3 and the
  // second chapter's text runs on under it; the third chapter starts on
  // page 4 under the end of that text.
  const markdown = [
    `# First {short="I"}`, chapters(10),
    `# Second {short="II"}`, chapters(9),
    `# Plate of the harbour {style="plate"}`, chapters(9),
    `# Third {short="III"}`, chapters(2),
  ].join('\n\n');
  const firstBlockOn = (doc: VDTDocument, page: number): VDTBlock => doc.blocks.find((b) => b.pageIndex === page)!;

  it('prints the chapter at the top where a chapter starts lower down the page', () => {
    const doc = buildDocument({ markdown }, book());
    expect(pageOfHeading(doc, 'Second')).toBe(1);
    // Page 1 opens with the end of the first chapter.
    expect(firstBlockOn(doc, 1).type).toBe('paragraph');
    expect(headOf(doc.pages[1]!).slice(0, 4)).toEqual(['Second', 'First', '2', '1']);
    expect(headOf(doc.pages[2]!).slice(0, 4)).toEqual(['Second', 'Second', '2', '2']);
    // A chapter whose heading opens the page is the chapter at its top.
    expect(headOf(doc.pages[0]!).slice(0, 4)).toEqual(['First', 'First', '1', '1']);
  });

  it('names the plate as the chapter by default, as up to postext 1.4', () => {
    const doc = buildDocument({ markdown }, book());
    expect(pageOfHeading(doc, 'Plate')).toBe(3);
    expect(headOf(doc.pages[3]!)).toEqual(['Plate of the harbour', 'Plate of the harbour', '', '', '', 'Plate of the harbour']);
    expect(headOf(doc.pages[4]!)).toEqual(['Third', 'Plate of the harbour', '3', '', 'III', 'Third']);
  });

  it('keeps the interrupted chapter in the running heads with runningChapter: false', () => {
    const doc = buildDocument({ markdown }, book({ runningChapter: false }));
    expect(pageOfHeading(doc, 'Plate')).toBe(3);
    expect(headOf(doc.pages[3]!)).toEqual(['Second', 'Second', '2', '2', 'II', 'Second']);
    // The plate is unnumbered, so the chapter after it is number 3.
    expect(headOf(doc.pages[4]!)).toEqual(['Third', 'Second', '3', '2', 'III', 'Third']);
    const plate = doc.blocks.find((b) => b.type === 'heading' && b.headingStyleId === 'plate')!;
    expect(plate.notRunningChapter).toBe(true);
  });

  it('still counts a numbered plate', () => {
    const doc = buildDocument({ markdown }, book({ runningChapter: false, numbered: true }));
    expect(headOf(doc.pages[3]!).slice(2, 4)).toEqual(['2', '2']);
    expect(headOf(doc.pages[4]!).slice(2, 4)).toEqual(['4', '2']);
  });
});
