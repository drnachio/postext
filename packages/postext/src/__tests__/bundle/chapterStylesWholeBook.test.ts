import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/index.js';
import { chapterRuns, runSource } from '../../pipeline/build/bookChapters.js';
import { collectContentWarnings } from '../../pipeline/contentWarnings.js';
import type { BookChapterRange, PostextConfig } from '../../types.js';
import type { VDTDocument } from '../../vdt.js';

// A whole book laid out as one document (#1521), as the Sandbox's HTML
// viewer reads it: every chapter joined, `content.chapters` saying where
// each lies. Each chapter is set in its own chapter style.

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
const filler = (n: number) => Array.from({ length: n }, (_, i) => `Sentence ${i} of a paragraph that runs on for a while.`).join(' ');

const book: PostextConfig = {
  page: { width: pt(360), height: pt(300), margins: { top: pt(18), bottom: pt(18), left: pt(18), right: pt(18) } },
  layout: { layoutType: 'single' },
  chapterStyles: [{ id: 'appendix', name: 'Appendix', config: { layout: { layoutType: 'double' }, bodyText: { fontSize: pt(7) } } }],
};

/** The chapters joined as the Sandbox joins them, and where each lies. */
function join(chapters: readonly string[]): { markdown: string; chapters: BookChapterRange[] } {
  let markdown = '';
  const ranges: BookChapterRange[] = [];
  chapters.forEach((text, i) => {
    if (i > 0) markdown += '\n\n';
    ranges.push({ start: markdown.length, end: markdown.length + text.length });
    markdown += text;
  });
  return { markdown, chapters: ranges };
}

const FOUR = [
  `---\ntitle: The book\n---\n# One\n\n${filler(12)}`,
  `:::part{number="I" title="Appendices" style="appendix"}\n:::\n\n# Two\n\n${filler(12)}`,
  `# Three\n\n${filler(12)}`,
  `:::part{number="II" title="Back" page=false}\n:::\n\n# Four\n\n${filler(12)}`,
];

/** The chapter heading each page opens with, and its column count. */
const columnsByChapter = (doc: VDTDocument): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const page of doc.pages) {
    const heading = page.columns.flatMap((c) => c.blocks).find((b) => b.type === 'heading');
    const title = heading?.lines.map((l) => l.text).join(' ');
    if (title && !(title in out)) out[title] = page.columns.length;
  }
  return out;
};

describe('a whole book laid out as one document (#1521)', () => {
  const joined = join(FOUR);

  it('groups the chapters of one style that follow each other', () => {
    const runs = chapterRuns(joined.markdown, joined.chapters, book);
    expect(runs.map((r) => r.style ?? 'book')).toEqual(['book', 'appendix', 'book']);
    expect(runs[1]!.start).toBe(joined.chapters[1]!.start);
    expect(runs[1]!.end).toBe(joined.chapters[2]!.end);
    // A run's source keeps the book's offsets and front matter.
    const source = runSource(joined.markdown, runs[1]!);
    expect(source.length).toBe(joined.markdown.length);
    expect(source.startsWith('---\ntitle: The book\n---\n')).toBe(true);
    expect(source.slice(runs[1]!.start, runs[1]!.end)).toBe(joined.markdown.slice(runs[1]!.start, runs[1]!.end));
    expect(source.includes('# One')).toBe(false);
  });

  it('sets each chapter in its own style, as the paged outputs do', () => {
    const doc = buildDocument({ markdown: joined.markdown, chapters: joined.chapters }, book);
    expect(columnsByChapter(doc)).toEqual({ One: 1, Two: 2, Three: 2, Four: 1 });
    // The pages are numbered through the book, in order.
    expect(doc.pages.map((p) => p.index)).toEqual(doc.pages.map((_, i) => i));
    expect(doc.blocks.every((b) => b.pageIndex >= 0 && b.pageIndex < doc.pages.length)).toBe(true);
    // The book's metadata stays the document's.
    expect(doc.metadata.title).toBe('The book');
    // Part I has its divider page; part II (page=false) none.
    expect(doc.pages.filter((p) => p.partInfo).map((p) => p.partInfo!.title)).toEqual(['Appendices']);
  });

  it('warns of no part fence that opens its chapter', () => {
    const doc = buildDocument({ markdown: joined.markdown, chapters: joined.chapters }, book);
    expect((doc.contentWarnings ?? []).filter((w) => w.kind === 'partStyleMidChapter')).toEqual([]);
    // Read as one chapter, the second chapter's fence follows text.
    expect(collectContentWarnings(joined.markdown, book).filter((w) => w.kind === 'partStyleMidChapter')).toHaveLength(1);
    expect(collectContentWarnings(joined.markdown, book, [], undefined, undefined, joined.chapters).filter((w) => w.kind === 'partStyleMidChapter')).toEqual([]);
  });

  it('still warns of a fence after text of its own chapter, and of an unknown style a later chapter names', () => {
    const late = join([FOUR[0]!, `# Two\n\n${filler(2)}\n\n:::part{number="I" title="Late" style="appendix"}\n:::\n`, '---\nchapterStyle: nope\n---\n# Three']);
    const found = collectContentWarnings(late.markdown, book, [], undefined, undefined, late.chapters);
    const mid = found.filter((w) => w.kind === 'partStyleMidChapter');
    expect(mid).toHaveLength(1);
    expect(late.markdown.slice(mid[0]!.sourceStart, mid[0]!.sourceEnd)).toContain('Late');
    const unknown = found.find((w) => w.kind === 'chapterStyleUnknown');
    expect(unknown && late.markdown.slice(unknown.sourceStart, unknown.sourceEnd)).toBe('nope');
  });

  it('lists every chapter in the contents, with the page each starts on', () => {
    const withToc = join([`# Contents\n\n:::toc\n:::\n\n# One\n\n${filler(12)}`, ...FOUR.slice(1)]);
    const doc = buildDocument({ markdown: withToc.markdown, chapters: withToc.chapters }, book);
    const toc = doc.blocks.filter((b) => b.pageIndex === 0).flatMap((b) => b.lines.map((l) => l.text));
    const pageOf = (title: string) => {
      const heading = doc.blocks.find((b) => b.type === 'heading' && b.lines.map((l) => l.text).join(' ') === title)!;
      return doc.pages[heading.pageIndex]!.pageLabel;
    };
    for (const title of ['One', 'Two', 'Three', 'Four']) expect(toc).toContain(`${title} ${pageOf(title)}`);
  });

  it('lays out a book whose chapters share one style as before', () => {
    const plain = join([`# One\n\n${filler(5)}`, `# Two\n\n${filler(5)}`]);
    const a = buildDocument({ markdown: plain.markdown, chapters: plain.chapters }, book);
    const b = buildDocument({ markdown: plain.markdown }, book);
    expect(a.pages.length).toBe(b.pages.length);
    expect(a.blocks.map((x) => [x.pageIndex, x.bbox.y])).toEqual(b.blocks.map((x) => [x.pageIndex, x.bbox.y]));
  });
});
