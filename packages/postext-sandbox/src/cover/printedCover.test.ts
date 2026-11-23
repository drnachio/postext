import { describe, expect, it, vi } from 'vitest';
import type { PostextConfig, VDTDocument } from 'postext';
import { createDefaultConfig } from '../context/defaultConfig.js';
import { layOutPrintedCover, printedFrontCover } from './printedCover.js';

// #1669: the EPUB's cover and Folio's spine come from the cover of the
// book's first print version, laid out with the caller's layout.

const chapters = [{ id: 'a', title: 'A', markdown: '---\ntitle: The Book\nauthor: Someone\n---\n\n# One', createdAt: 0, updatedAt: 0 }];
const withVersion: PostextConfig = { ...createDefaultConfig('en'), production: { versions: [{ id: 'pb', name: 'P', binding: 'perfect' }] } };
const page = { width: 900, height: 600 } as VDTDocument['pages'][number];

describe('printed cover', () => {
  it('lays nothing out for a book without a print version', async () => {
    const build = vi.fn();
    const laid = await layOutPrintedCover({ config: createDefaultConfig('en'), chapters, resources: [], bookPages: {}, pages: 100 }, { build });
    expect(laid).toBeNull();
    expect(build).not.toHaveBeenCalled();
    expect(await printedFrontCover({ config: createDefaultConfig('en'), chapters, resources: [], bookPages: {} }, 'T', { build })).toBeNull();
  });

  it('lays out the first version’s cover with the book’s pages and metadata, fonts asked before and after', async () => {
    const doc = { pages: [page], trimOffset: 0 } as unknown as VDTDocument;
    const build = vi.fn(async () => doc);
    const fonts = vi.fn(async () => {});
    const laid = await layOutPrintedCover(
      { config: withVersion, chapters, resources: [], coverMarkdown: ':::frame{slot="back"}\nBlurb\n:::', bookPages: {}, pages: 240 },
      { build, fonts },
    );
    expect(laid?.doc).toBe(doc);
    expect(laid?.built.sheets.spine.pages).toBe(240);
    const [content] = build.mock.calls[0] as unknown as [{ markdown: string }];
    expect(content.markdown).toContain('Blurb');
    expect(content.markdown).toContain('The Book');
    expect(fonts).toHaveBeenCalledTimes(2);
    expect(fonts.mock.calls[1]).toHaveLength(3);
  });
});
