import { describe, expect, it } from 'vitest';
import type { PostextConfig } from 'postext';
import { chapter, harness } from './testHarness.js';

// Chapter styles for agents (#1521): the styles and the chapters set in
// each, a chapter given its style, a style's settings written through the
// config tools as the Design panel writes them.

const CONFIG: PostextConfig = {
  page: { width: { value: 120, unit: 'mm' }, height: { value: 180, unit: 'mm' } },
  chapterStyles: [{ id: 'appendix', name: 'Appendix', config: { layout: { layoutType: 'double' } } }],
};

const book = () => {
  const chapters = [
    chapter('a', 'One', '# One\n\nWords.\n'),
    chapter('b', 'Part', ':::part{number="I" title="Back" style="appendix"}\n:::\n\n# Two\n\nWords.\n'),
    chapter('c', 'Three', '# Three\n\nWords.\n'),
  ];
  return { chapters, markdown: chapters[0]!.markdown, config: CONFIG };
};

describe('chapter styles through the tools', () => {
  it('list the styles and where each chapter takes its own from', async () => {
    const answer = await harness(book()).call('sandbox_chapter_styles', {});
    expect(answer.styles).toEqual([{ id: 'appendix', name: 'Appendix', changes: ['layout'], chapters: [2, 3] }]);
    expect(answer.chapters.map((c: { style: string | null; from?: string }) => [c.style, c.from ?? null])).toEqual([[null, null], ['appendix', 'part'], ['appendix', 'partBefore']]);
  });

  it('give a chapter its style in its front matter, and take it out', async () => {
    const { call, get } = harness(book());
    const done = await call('sandbox_set_chapter_style', { chapter: 1, style: 'appendix', wait: false });
    expect(done).toMatchObject({ changed: [1], chapters: [{ chapter: 1, style: 'appendix', from: 'chapter' }] });
    expect(get().markdown).toMatch(/^---\nchapterStyle: appendix\n---\n# One/);
    await call('sandbox_set_chapter_style', { chapter: 1, style: null, wait: false });
    expect(get().markdown).toBe('# One\n\nWords.\n');
    expect((await call('sandbox_set_chapter_style', { chapter: 1, style: 'nope' })).error).toMatch(/No chapter style "nope"/);
  });

  it('make, rename and remove a style', async () => {
    const { call, get } = harness(book());
    expect((await call('sandbox_chapter_styles', { action: 'create', name: 'Glossary' })).created).toBe('glossary');
    await call('sandbox_chapter_styles', { action: 'rename', style: 'glossary', name: 'Terms' });
    expect(get().config.chapterStyles!.map((s) => [s.id, s.name])).toEqual([['appendix', 'Appendix'], ['glossary', 'Terms']]);
    const removed = await call('sandbox_chapter_styles', { action: 'remove', style: 'appendix' });
    expect(removed).toMatchObject({ removed: 'appendix', chaptersThatNamedIt: [2, 3] });
  });

  it('read and write a style\'s settings with the config tools, what the book shares written to the book', async () => {
    const { call, get } = harness(book());
    expect(await call('sandbox_get_config', { chapterStyle: 'appendix', path: 'layout.layoutType' })).toMatchObject({ chapterStyle: 'appendix', set: 'double', effective: 'double' });
    const written = await call('sandbox_set_config', { chapterStyle: 'appendix', changes: [{ path: 'bodyText.fontSize', value: '9pt' }, { path: 'page.width', value: '130mm' }], wait: false });
    expect(written.chapterStyle).toBe('appendix');
    expect(written.notes.join(' ')).toMatch(/page\.width: the whole book shares this/);
    const config = get().config;
    expect(config.chapterStyles![0]!.config.bodyText).toEqual({ fontSize: { value: 9, unit: 'pt' } });
    expect(config.chapterStyles![0]!.config.page).toBeUndefined();
    expect(config.page?.width).toEqual({ value: 130, unit: 'mm' });
    expect(config.bodyText).toBeUndefined();
    expect((await call('sandbox_get_config', { chapterStyle: 'none' })).error).toMatch(/No chapter style "none"/);
  });
});
