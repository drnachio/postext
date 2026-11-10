import { describe, it, expect } from 'vitest';
import { buildBundle } from '../../bundle/index.js';
import { blankChapterFrontmatter, chapterConfig, chapterConfigOf, chapterStyleOf, sectionBreaks } from '../../defaults/chapterStyles.js';
import { buildDocument } from '../../pipeline/index.js';
import type { PostextConfig } from '../../types.js';

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
  bodyText: { color: { hex: '#000000', model: 'hex' } },
  chapterStyles: [{
    id: 'appendix',
    name: 'Appendix',
    config: {
      // Two columns, wider margins, another colour; a trim it may not change.
      page: { width: pt(500), margins: { left: pt(40), right: pt(40) } },
      layout: { layoutType: 'double' },
      bodyText: { color: { hex: '#1f3f99', model: 'hex' } },
    },
  }],
};

describe('chapter styles', () => {
  it('take the documented example', () => {
    const config: PostextConfig = { ...book, chapterStyles: [{ id: 'appendix', config: { layout: { layoutType: 'double' }, page: { margins: { left: { value: 15, unit: 'mm' }, right: { value: 15, unit: 'mm' } } }, bodyText: { fontSize: { value: 9, unit: 'pt' } }, header: { elements: [] } } }] };
    const doc = buildDocument({ markdown: '---\nchapterStyle: appendix\n---\n# Appendix A\n\nText.' }, config);
    expect(doc.config.bodyText.fontSize).toEqual({ value: 9, unit: 'pt' });
    expect(doc.config.page.margins.left).toEqual({ value: 15, unit: 'mm' });
  });

  it('are named in the chapter\'s front matter', () => {
    expect(chapterStyleOf('---\nchapterStyle: appendix\n---\n# A')).toBe('appendix');
    expect(chapterStyleOf('# A')).toBeUndefined();
    expect(chapterStyleOf('---\ntitle: x\n---\n# A')).toBeUndefined();
  });

  it('merge over the book\'s settings, keep the trim, and give one object per style', () => {
    const appendix = chapterConfig(book, 'appendix');
    expect(appendix.layout?.layoutType).toBe('double');
    expect(appendix.page?.margins).toEqual({ top: pt(18), bottom: pt(18), left: pt(40), right: pt(40) });
    expect(appendix.page?.width).toEqual(pt(360));
    expect(appendix.bodyText?.color?.hex).toBe('#1f3f99');
    expect(chapterConfig(book, 'appendix')).toBe(appendix);
    expect(chapterConfig(book, 'missing')).toBe(book);
    expect(chapterConfigOf(book, '# No style')).toBe(book);
  });

  it('keep their line when a later chapter\'s front matter is blanked, offsets unchanged', () => {
    const block = '---\ntitle: Two\nchapterStyle: appendix\nauthor: X\n---\n';
    const blanked = blankChapterFrontmatter(block);
    expect(blanked.length).toBe(block.length);
    expect(blanked.split('\n')).toEqual(['---', '          ', 'chapterStyle: appendix', '         ', '---', '']);
    expect(blankChapterFrontmatter('---\ntitle: Two\n---\n')).toBe('   \n          \n   \n');
  });

  it('apply to a chapter built on its own, as a host building one chapter at a time does', () => {
    const doc = buildDocument({ markdown: `---\nchapterStyle: appendix\n---\n# Two\n\n${filler(3)}` }, book);
    expect(doc.config.layout.layoutType).toBe('double');
  });

  it('leave a book without them as it was: the same configuration and the same pages', () => {
    const { chapterStyles: _styles, ...plain } = book;
    void _styles;
    expect(chapterConfig(plain, undefined)).toBe(plain);
    expect(chapterConfig(plain, 'appendix')).toBe(plain);
    expect(chapterConfig(book, 'unknown')).toBe(book);
    const chapters = [{ markdown: `# One\n\n${filler(20)}` }, { markdown: `# Two\n\n${filler(20)}` }];
    const pagesOf = (docs: ReturnType<typeof buildBundle>) =>
      docs.map((d) => d.pages.map((p) => p.columns.map((c) => c.blocks.map((b) => [b.type, b.bbox.y, b.bbox.height]))));
    // The same chapters with a front matter naming no style lay out alike.
    const named = [{ markdown: `---\ntitle: One\n---\n# One\n\n${filler(20)}` }, chapters[1]!];
    expect(pagesOf(buildBundle({ config: plain, resources: [], chapters: named })).slice(1))
      .toEqual(pagesOf(buildBundle({ config: plain, resources: [], chapters })).slice(1));
  });
  it('lay a book\'s chapter out in its own style, the numbering running on', () => {
    const docs = buildBundle({
      config: book,
      resources: [],
      chapters: [
        { markdown: `# One\n\n${filler(20)}` },
        { markdown: `---\nchapterStyle: appendix\n---\n# Two\n\n${filler(20)}` },
        { markdown: `# Three\n\n${filler(5)}` },
      ],
    });
    expect(docs.map((d) => d.config.layout.layoutType)).toEqual(['single', 'double', 'single']);
    expect(docs[1]!.config.bodyText.color.hex).toBe('#1f3f99');
    // One trim for the whole book.
    expect(new Set(docs.map((d) => d.pages[0]!.width)).size).toBe(1);
    // The page numbers run on across the styled chapter.
    const last = (i: number) => docs[i]!.pages[docs[i]!.pages.length - 1]!.pageNumberValue;
    expect(docs[1]!.pages[0]!.pageNumberValue).toBe(last(0) + 1);
    expect(docs[2]!.pages[0]!.pageNumberValue).toBe(last(1) + 1);
  });
});

describe('sections in a chapter style', () => {
  const markdown = `# One\n\n${filler(8)}\n\n::section{style="appendix"}\n\n## Appendix\n\n${filler(8)}\n\n::section\n\n## Back\n\n${filler(3)}`;

  it('are found outside code fences and the front matter', () => {
    expect(sectionBreaks(markdown).map((b) => b.style ?? null)).toEqual(['appendix', null]);
    expect(sectionBreaks('```\n::section{style="x"}\n```\n')).toEqual([]);
  });

  it('start a new page each, in their style, the chapter\'s pages and numbers running on', () => {
    const doc = buildDocument({ markdown }, book);
    const whole = buildDocument({ markdown: markdown.replace(/::section[^\n]*/g, '') }, book);
    // The appendix section's blocks sit on pages of their own, two columns.
    const appendix = doc.blocks.find((b) => b.lines.some((l) => l.text === 'Appendix'))!;
    const back = doc.blocks.find((b) => b.lines.some((l) => l.text === 'Back'))!;
    expect(appendix.pageIndex).toBeGreaterThan(0);
    expect(doc.pages[appendix.pageIndex]!.columns.length).toBe(2);
    expect(doc.pages[back.pageIndex]!.columns.length).toBe(1);
    expect(back.pageIndex).toBeGreaterThan(appendix.pageIndex);
    // Pages indexed and numbered in order.
    expect(doc.pages.map((p) => p.index)).toEqual(doc.pages.map((_, i) => i));
    expect(doc.pages.map((p) => p.pageNumberValue)).toEqual(doc.pages.map((_, i) => doc.pages[0]!.pageNumberValue + i));
    expect(doc.pages.length).toBeGreaterThanOrEqual(whole.pages.length);
    // The break lines print nothing and warn of nothing.
    expect(doc.blocks.flatMap((b) => b.lines.map((l) => l.text)).some((t) => t.includes('::section'))).toBe(false);
    expect((doc.contentWarnings ?? []).map((w) => w.kind)).not.toContain('malformedEmbed');
  });
});
