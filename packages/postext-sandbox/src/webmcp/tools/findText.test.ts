import { describe, expect, it } from 'vitest';
import { chapter, harness } from './testHarness.js';

// sandbox_search_text and sandbox_replace_text run the find bar's search.

describe('finding and replacing text', () => {
  it('finds plain text, regular expressions and accent-folded words across the book', async () => {
    const { call } = harness();
    const plain = await call('sandbox_search_text', { query: 'PRINT', limit: 3 });
    expect(plain.matches).toHaveLength(3);
    expect(plain.matches[0]).toMatchObject({ chapter: 1, line: 3, match: 'Print' });
    expect(plain.more).toBe(true);
    const regex = await call('sandbox_search_text', { query: '^# (\\w+)', regex: true });
    expect(regex.matches.map((m: { chapter: number; match: string }) => [m.chapter, m.match])).toEqual([[1, '# Opening'], [2, '# Second']]);
    expect((await call('sandbox_search_text', { query: '(', regex: true })).error).toMatch(/does not compile/);
  });

  it('finds decomposed text and Arabic with accents ignored', async () => {
    const { call } = harness({
      chapters: [chapter('a', 'Uno', 'La célula.\n'), chapter('b', 'Dos', 'كَتَبَ الولد.\n')],
      markdown: 'La célula.\n',
    });
    expect((await call('sandbox_search_text', { query: 'célula' })).matches).toHaveLength(1);
    expect((await call('sandbox_search_text', { query: 'celula', ignoreAccents: true })).matches).toHaveLength(1);
    expect((await call('sandbox_search_text', { query: 'كتب', ignoreAccents: true })).matches[0]).toMatchObject({ chapter: 2, match: 'كَتَبَ' });
  });

  it('previews a replacement without changing the book', async () => {
    const { call, get } = harness();
    const before = get().chapters.map((c) => c.markdown);
    const preview = await call('sandbox_replace_text', { query: '^# (\\w+)', replace: '## $1', regex: true, scope: 'book', dryRun: true });
    expect(preview).toMatchObject({ dryRun: true, count: 2, chapters: [1, 2] });
    expect(preview.replacements[0]).toEqual({ chapter: 1, line: 1, before: '# Opening', after: '## Opening' });
    expect(get().chapters.map((c) => c.markdown)).toEqual(before);
  });

  it('replaces over the book as one change that sandbox_undo takes back', async () => {
    const { call, get, host } = harness();
    const before = get().chapters.map((c) => c.markdown);
    const done = await call('sandbox_replace_text', { query: 'typography', replace: 'type', scope: 'book', wait: false });
    expect(done).toMatchObject({ replaced: 44, changed: true, chapters: [1, 2] });
    expect(get().chapters.every((c) => !c.markdown.includes('typography'))).toBe(true);
    expect(host.store.history.peek()).toMatchObject({ kind: 'group', source: 'find' });
    await call('sandbox_undo', { wait: false });
    expect(get().chapters.map((c) => c.markdown)).toEqual(before);
  });

  it('writes the signs of a regular expression literally', async () => {
    const { call, get } = harness({ chapters: [chapter('a', 'Uno', 'Note 3 here.\n')], markdown: 'Note 3 here.\n' });
    await call('sandbox_replace_text', { query: '^Note (\\d+)', replace: '[^$1]', regex: true, scope: 'chapter', wait: false });
    expect(get().chapters[0]!.markdown).toBe('[^3] here.\n');
  });

  it('replaces in one chapter only, and says when there is nothing to replace', async () => {
    const { call, get } = harness();
    const done = await call('sandbox_replace_text', { query: 'Print', replace: 'Printed', matchCase: true, wholeWord: true, scope: 'chapter', chapter: 2, wait: false });
    expect(done).toMatchObject({ replaced: 4, chapters: [2], undo: expect.stringMatching(/sandbox_undo_text/) });
    expect(get().chapters[0]!.markdown).toContain('Print typography');
    expect(await call('sandbox_replace_text', { query: 'nowhere', replace: 'x', scope: 'book' })).toMatchObject({ replaced: 0, changed: false });
    expect((await call('sandbox_replace_text', { query: 'x', replace: 'y', scope: 'book', chapter: 1 })).error).toMatch(/goes with scope "chapter"/);
  });
});
