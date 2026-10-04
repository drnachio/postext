import { describe, expect, it } from 'vitest';
import type { PostextConfig, PostextContent, VDTDocument } from 'postext';
import { layOutBookPrint } from './printChain';
import type { BookPlan, Chapter, ChapterPlan } from './types';

const chapter = (id: string, markdown: string): Chapter => ({ id, title: id, markdown, createdAt: 0, updatedAt: 0 });

const planOf = (chapterId: string, index: number): ChapterPlan =>
  ({ chapterId, index, continuationKey: `k${index}`, outlineKey: '', paginated: false }) as unknown as ChapterPlan;

describe('layOutBookPrint', () => {
  it('lays out every chapter of the plan on its own, in order, with a cache key', async () => {
    const chapters = [chapter('a', '# One\n\nText.'), chapter('b', '# Two\n\nMore.')];
    const plan = { chapters: [planOf('a', 0), planOf('b', 1), planOf('gone', 2)] } as unknown as BookPlan;
    const built: { content: PostextContent; cacheKey: string }[] = [];
    const told: number[][] = [];
    const docs = await layOutBookPrint({
      plan,
      chapters,
      resources: [],
      config: {} as PostextConfig,
      build: async (content, _config, { cacheKey }) => {
        built.push({ content, cacheKey });
        return { pages: [{ pageNumberValue: 1, pageNumberFormat: 'decimal' }, { pageNumberValue: 2, pageNumberFormat: 'decimal' }] } as unknown as VDTDocument;
      },
      onChapter: (index, count, pagesBefore) => told.push([index, count, pagesBefore]),
    });
    // A chapter the plan names but the book no longer has is left out.
    expect(docs).toHaveLength(2);
    expect(built.map((b) => b.content.markdown)).toEqual(['# One\n\nText.', '# Two\n\nMore.']);
    expect(built[1]!.content.continuation?.pageIndexOffset).toBe(2);
    expect(new Set(built.map((b) => b.cacheKey)).size).toBe(2);
    expect(told).toEqual([[0, 3, 0], [1, 3, 2]]);
  });
});
