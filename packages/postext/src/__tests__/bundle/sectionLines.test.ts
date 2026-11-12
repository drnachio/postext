import { describe, it, expect } from 'vitest';
import { parseMarkdown } from '../../parse/index.js';
import { collectContentWarnings } from '../../pipeline/contentWarnings.js';
import { buildDocument } from '../../pipeline/index.js';
import { formatWarning } from '../../pipeline/contentWarnings/formatWarning.js';
import { sectionBreakLines } from '../../parse/blockParser/sectionBreaks.js';
import type { PostextConfig } from '../../types.js';

// #1532: postext 1.78 switched a chapter's style mid-chapter with a line
// `::section{style="…"}` (#1521's first form). 1.79 sets chapter styles by
// parts; the line is no longer read, its text stays in the chapter, and a
// warning says what to write instead.

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
const book: PostextConfig = {
  page: { width: pt(360), height: pt(300), margins: { top: pt(18), bottom: pt(18), left: pt(18), right: pt(18) } },
  layout: { layoutType: 'single' },
  chapterStyles: [{ id: 'appendix', name: 'Appendix', config: { layout: { layoutType: 'double' } } }],
};

const MD = '---\ntitle: One\n---\n# One\n\nBefore the section.\n\n::section{style="appendix"}\n\nAfter the section.\n::section\nBack home.\n\n```\n::section{style="appendix"}\n```\n';

describe('::section lines of postext 1.78 (#1532)', () => {
  it('are found alone on their line, outside code fences', () => {
    const body = MD.slice(MD.indexOf('# One'));
    const lines = sectionBreakLines(body);
    expect(lines.map((l) => [body.slice(l.start, l.end), l.style])).toEqual([['::section{style="appendix"}', 'appendix'], ['::section', undefined]]);
    expect(sectionBreakLines("Text ::section{style='x'} inside a line.")).toEqual([]);
    expect(sectionBreakLines("::section{ style='x' }")[0]?.style).toBe('x');
  });

  it('read as blank lines: the text keeps flowing and the line is not printed', () => {
    const blocks = parseMarkdown(MD.slice(MD.indexOf('# One')));
    const texts = blocks.filter((b) => b.type === 'paragraph').map((b) => b.text);
    expect(texts).toEqual(['Before the section.', 'After the section.', 'Back home.']);
    // The code fence keeps the line as written.
    expect(JSON.stringify(blocks.find((b) => b.type === 'code'))).toContain('::section');
  });

  it('are reported, and the chapter is set in its own settings', () => {
    const doc = buildDocument({ markdown: MD }, book);
    expect(doc.config.layout.layoutType).toBe('single');
    const found = (doc.contentWarnings ?? []).filter((w) => w.kind === 'partStyleMidChapter');
    expect(found.map((w) => (w.kind === 'partStyleMidChapter' ? [w.style, w.source] : []))).toEqual([['appendix', 'section'], ['', 'section']]);
    expect(MD.slice(found[0]!.sourceStart, found[0]!.sourceEnd)).toBe('::section{style="appendix"}');
    expect((doc.contentWarnings ?? []).map((w) => w.kind)).not.toContain('malformedEmbed');
    expect(formatWarning(found[0]!)).toContain(':::part{style="appendix"}');
    expect(formatWarning(found[0]!)).toContain('chapterStyle: appendix');
    // Without chapter styles in the book too.
    expect(collectContentWarnings(MD, {}).filter((w) => w.kind === 'partStyleMidChapter')).toHaveLength(2);
  });
});
