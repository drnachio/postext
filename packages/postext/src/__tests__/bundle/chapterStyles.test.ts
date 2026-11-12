import { describe, it, expect } from 'vitest';
import { buildBundle } from '../../bundle/index.js';
import { blankChapterFrontmatter, bookSettingsOf, chapterConfig, chapterConfigOf, chapterStyleIdOf, chapterStyleOf, openingPart } from '../../defaults/chapterStyles.js';
import { collectConfigWarnings } from '../../checks/configWarnings.js';
import { collectContentWarnings } from '../../pipeline/contentWarnings.js';
import { continuationAfter } from '../../pipeline/continuation.js';
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

describe('parts in a chapter style', () => {
  const part = (attrs: string) => `:::part{number="I" title="Appendices"${attrs}}\n:::\n`;

  it('read the fence a chapter opens with, after its front matter', () => {
    expect(openingPart(`${part(' style="appendix"')}\n# A`)).toEqual({ style: 'appendix' });
    expect(openingPart(`---\ntitle: x\n---\n\n${part('')}`)).toEqual({});
    expect(openingPart(`# A\n\n${part(' style="appendix"')}`)).toBeUndefined();
    expect(openingPart('')).toBeUndefined();
  });

  it('give a chapter its own style first, then the part it opens, then the part it is in', () => {
    expect(chapterStyleIdOf('# A', 'appendix')).toBe('appendix');
    expect(chapterStyleIdOf('---\nchapterStyle: own\n---\n# A', 'appendix')).toBe('own');
    expect(chapterStyleIdOf(`${part(' style="other"')}# A`, 'appendix')).toBe('other');
    // A part with no style ends the one before it.
    expect(chapterStyleIdOf(`${part('')}# A`, 'appendix')).toBeUndefined();
  });

  it('set the chapters after the fence in the style, until the next part', () => {
    const docs = buildBundle({
      config: book,
      resources: [],
      chapters: [
        { markdown: `# One\n\n${filler(20)}` },
        { markdown: `${part(' style="appendix"')}\n# Two\n\n${filler(20)}` },
        { markdown: `# Three\n\n${filler(5)}` },
        { markdown: `---\nchapterStyle: none-such\n---\n# Four\n\n${filler(5)}` },
        { markdown: `:::part{number="II" title="Back"}\n:::\n\n# Five\n\n${filler(5)}` },
      ],
    });
    expect(docs.map((d) => d.config.layout.layoutType)).toEqual(['single', 'double', 'double', 'single', 'single']);
    // The part page itself is the styled chapter's first page.
    expect(docs[1]!.pages.some((p) => p.partInfo)).toBe(true);
    // One trim for the whole book.
    expect(new Set(docs.map((d) => d.pages[0]!.width)).size).toBe(1);
  });

  it('carry the style in the continuation', () => {
    const after = continuationAfter({ markdown: part(' style="appendix"') }, book);
    expect(after.part?.style).toBe('appendix');
    expect(continuationAfter({ markdown: '# Next' }, book, after).part?.style).toBe('appendix');
    expect(continuationAfter({ markdown: part('') }, book, after).part?.style).toBeUndefined();
  });

  it('start with the next chapter when the fence stands after text, with a warning', () => {
    const markdown = `# One\n\n${filler(3)}\n\n${part(' style="appendix"')}`;
    const doc = buildDocument({ markdown }, book);
    expect(doc.config.layout.layoutType).toBe('single');
    const w = (doc.contentWarnings ?? []).find((x) => x.kind === 'partStyleMidChapter');
    expect(w).toMatchObject({ kind: 'partStyleMidChapter', style: 'appendix' });
    expect(markdown.slice(w!.sourceStart, w!.sourceEnd)).toContain(':::part');
    expect(continuationAfter({ markdown }, book).part?.style).toBe('appendix');
  });

  it('warn of a style the book does not define, in the front matter or on a fence', () => {
    const md = `---\nchapterStyle: nope\n---\n${part(' style="missing"')}`;
    const found = collectContentWarnings(md, book).filter((w) => w.kind === 'chapterStyleUnknown');
    expect(found.map((w) => (w.kind === 'chapterStyleUnknown' ? [w.style, w.source] : []))).toEqual([['nope', 'frontmatter'], ['missing', 'part']]);
    expect(md.slice(found[0]!.sourceStart, found[0]!.sourceEnd)).toBe('nope');
    expect(collectContentWarnings(`${part(' style="appendix"')}# A`, book).map((w) => w.kind)).not.toContain('chapterStyleUnknown');
    // A chapter built in a style still knows the book's styles.
    const doc = buildDocument({ markdown: `---\nchapterStyle: appendix\n---\n# A\n\n${part(' style="missing"')}` }, book);
    expect((doc.contentWarnings ?? []).filter((w) => w.kind === 'chapterStyleUnknown')).toHaveLength(1);
  });

  it('set a part without its divider page when its fence says page=false', () => {
    const docs = buildBundle({
      config: book,
      resources: [],
      chapters: [
        { markdown: `:::part{number="I" title="One" page=false}\n:::\n\n# One\n\n${filler(3)}` },
        { markdown: `:::part{number="II" title="Two"}\n:::\n\n# Two\n\n${filler(3)}` },
      ],
    });
    expect(docs[0]!.pages.some((p) => p.partInfo)).toBe(false);
    expect(docs[0]!.partMarks?.[0]?.title).toBe('One');
    expect(docs[1]!.pages.some((p) => p.partInfo)).toBe(true);
  });
});

describe('book settings in a chapter style', () => {
  const styled: PostextConfig = {
    ...book,
    chapterStyles: [{ id: 'appendix', config: { locale: 'fr', page: { width: pt(500), dpi: 300, margins: { left: pt(40) } }, layout: { layoutType: 'double' } } }],
  };

  it('are listed, ignored and reported', () => {
    expect(bookSettingsOf(styled.chapterStyles![0]!)).toEqual(['locale', 'page.width', 'page.dpi']);
    const cfg = chapterConfig(styled, 'appendix');
    expect(cfg.locale).toBeUndefined();
    expect(cfg.page?.width).toEqual(pt(360));
    expect(cfg.page?.margins?.left).toEqual(pt(40));
    expect(cfg.chapterStyles).toBe(styled.chapterStyles);
    // A chapter's configuration is not styled again.
    expect(chapterConfig(cfg, 'appendix')).toBe(cfg);
    const warnings = collectConfigWarnings(styled).filter((w) => w.kind === 'chapterStyleBookSetting');
    expect(warnings.map((w) => w.path)).toEqual(['chapterStyles[0].config.locale', 'chapterStyles[0].config.page.width', 'chapterStyles[0].config.page.dpi']);
    const doc = buildDocument({ markdown: '---\nchapterStyle: appendix\n---\n# A' }, styled);
    expect((doc.configWarnings ?? []).filter((w) => w.kind === 'chapterStyleBookSetting')).toHaveLength(3);
  });
});
