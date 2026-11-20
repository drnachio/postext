import { describe, expect, it } from 'vitest';
import { buildDocument, createLayoutTapes, createMeasurementCache } from 'postext';
import type { PostextConfig, PostextContent, VDTDocument } from 'postext';
import { newChapter } from './chapterOps.js';
import { buildBookChapters, type HeldChapterDoc } from './buildBook.js';
import { createBookPlanner } from './pagination.js';
import type { Chapter } from './types.js';

// #1650: in the book view the chapter whose text changed is laid out from
// its layout before (the engine's tapes); a chapter laid out again only
// because the pages before it moved is not, so that it does not take the
// worker's one set of tapes from the chapter being edited.

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
const config: PostextConfig = { page: { width: pt(360), height: pt(480), margins: { top: pt(36), bottom: pt(36), left: pt(36), right: pt(36) } } };
const para = (n: number) => `Paragraph ${n} with enough words in it to run over several lines of a narrow column. `.repeat(3).trim();
const text = (title: string, count: number) => [`# ${title}`, ...Array.from({ length: count }, (_, i) => para(i))].join('\n\n');

describe('buildBookChapters with the incremental layout (#1650)', () => {
  it('asks for tapes for the edited chapter only', async () => {
    const chapters: Chapter[] = [newChapter('a', 'One', text('One', 100), 1), newChapter('b', 'Two', text('Two', 30), 1)];
    const plan = createBookPlanner().plan(chapters, config, [], {});
    const cache = createMeasurementCache();
    const tapes = new Map<string, ReturnType<typeof createLayoutTapes>>();
    const asked: { chapter: string; tapesKey?: string }[] = [];
    const build = async (content: PostextContent, cfg: PostextConfig, opts?: { cacheKey?: string; tapesKey?: string }): Promise<VDTDocument> => {
      asked.push({ chapter: content.markdown.slice(2, 5), ...(opts?.tapesKey !== undefined ? { tapesKey: opts.tapesKey } : {}) });
      const key = opts?.tapesKey;
      if (key && !tapes.has(key)) tapes.set(key, createLayoutTapes());
      return buildDocument(content, cfg, cache, key ? { tapes: tapes.get(key)! } : undefined);
    };
    const run = (list: Chapter[], held: ReadonlyMap<string, HeldChapterDoc>) =>
      buildBookChapters({ chapters: list, plan, config, rawConfig: config, resources: [], held, build, cancelled: () => false, incremental: true });

    const first = await run(chapters, new Map());
    expect(asked.every((a) => a.tapesKey === undefined)).toBe(true);

    // Paragraphs more in the first chapter: it is laid out with tapes; the
    // second, whose pages now start later, without them.
    asked.length = 0;
    const edited = [{ ...chapters[0]!, markdown: `${chapters[0]!.markdown}\n\n${[90, 91, 92, 93, 94, 95].map(para).join("\n\n")}` }, chapters[1]!];
    const second = await run(edited, first!.held);
    expect(asked).toEqual([{ chapter: 'One', tapesKey: 'book:a' }, { chapter: 'Two' }]);

    // A letter typed in it: laid out from the layout before, the same pages
    // as without the tapes.
    asked.length = 0;
    const typed = [{ ...edited[0]!, markdown: `${edited[0]!.markdown}x` }, edited[1]!];
    const third = await run(typed, second!.held);
    expect(asked[0]).toEqual({ chapter: 'One', tapesKey: 'book:a' });
    expect(third).not.toBeNull();
    expect(Math.max(...tapes.get('book:a')!.stats.startedAt)).toBeGreaterThan(0);
  });
});
