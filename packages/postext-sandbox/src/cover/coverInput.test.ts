import { describe, expect, it } from 'vitest';
import type { PostextConfig } from 'postext';
import { buildCover } from 'postext/production';
import { coverBuildInput, pickVersion, planPageCount } from './coverInput.js';
import { createDefaultConfig } from '../context/defaultConfig.js';
import type { BookPages } from '../book/types.js';

const pages = (spans: [number, number][]): BookPages => Object.fromEntries(spans.map(([pageIndex, pageCount], i) => [`c${i}`, { pageIndex, pageCount } as BookPages[string]]));

describe('cover input', () => {
  it('counts the book\'s pages to the end of its last chapter', () => {
    expect(planPageCount({})).toBe(0);
    expect(planPageCount(pages([[0, 10], [10, 22], [32, 4]]))).toBe(36);
  });

  it('picks the chosen version, or the first', () => {
    const config = { production: { versions: [{ id: 'pb', name: 'P', binding: 'perfect' }, { id: 'hc', name: 'H', binding: 'case-flat' }] } } as PostextConfig;
    expect(pickVersion(config, 'hc')?.id).toBe('hc');
    expect(pickVersion(config, 'gone')?.id).toBe('pb');
    expect(pickVersion({} as PostextConfig, null)).toBeUndefined();
  });

  it('builds a cover with the metadata and the cover text', () => {
    const config: PostextConfig = { ...createDefaultConfig('en'), production: { versions: [{ id: 'pb', name: 'P', binding: 'perfect' }] } };
    const input = coverBuildInput({
      config,
      chapters: [{ id: 'a', title: 'A', markdown: '---\ntitle: The Book\nauthor: Someone\n---\n\n# One', createdAt: 0, updatedAt: 0 }],
      resources: [],
      coverMarkdown: ':::frame{slot="back"}\nBlurb\n:::',
      bookPages: pages([[0, 120]]),
    }, 'pb');
    expect(input.pages).toBe(120);
    const built = buildCover(input);
    expect('config' in built).toBe(true);
    if (!('config' in built)) return;
    expect(built.content.markdown).toContain('Blurb');
    expect(built.content.markdown).toContain('The Book');
    expect(built.sheets.spine.pages).toBe(128);
  });
});
