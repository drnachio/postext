import { describe, expect, it } from 'vitest';
import type { LayoutContinuation, VDTDocument } from 'postext';
import { layOutBookChain } from './chain';
import type { ChapterPlan } from './types';

/** A plan inheriting `continuation` (only the fields the chain reads). */
const planOf = (index: number, continuation?: LayoutContinuation): ChapterPlan =>
  ({ chapterId: `c${index}`, index, continuation }) as unknown as ChapterPlan;

/** A stand-in for the engine: `pages` pages, numbered on from the
 *  continuation, with the book count it was handed. */
function fakeBuild(pagesByChapter: Record<string, number>) {
  const calls: (LayoutContinuation | undefined)[] = [];
  const build = async (plan: ChapterPlan, continuation: LayoutContinuation | undefined): Promise<VDTDocument | null> => {
    calls.push(continuation);
    const count = pagesByChapter[plan.chapterId];
    if (count === undefined) return null;
    const start = continuation?.pageNumbering?.startAt ?? 1;
    return {
      pageIndexOffset: continuation?.pageIndexOffset,
      ...(continuation?.bookPageCount ? { bookPageCount: continuation.bookPageCount } : {}),
      pages: Array.from({ length: count }, (_, i) => ({ index: i, pageNumberValue: start + i, pageNumberFormat: 'decimal' })),
    } as unknown as VDTDocument;
  };
  return { build, calls };
}

describe('layOutBookChain', () => {
  it('chains offsets and numbering on the documents built', async () => {
    const { build, calls } = fakeBuild({ c0: 3, c1: 2, c2: 4 });
    // The plan's pages lag behind (a record from before an edit).
    const plans = [planOf(0), planOf(1, { pageIndexOffset: 7 }), planOf(2, { pageIndexOffset: 9 })];
    const docs = await layOutBookChain(plans, build, false);
    expect(docs.map((d) => d.pageIndexOffset)).toEqual([undefined, 3, 5]);
    expect(calls.map((c) => c?.pageNumbering?.startAt)).toEqual([undefined, 4, 6]);
    expect(calls).toHaveLength(3);
  });

  it('lays the book out once more when a chapter printed another book count than it came to', async () => {
    const { build, calls } = fakeBuild({ c0: 3, c1: 2, c2: 4 });
    // Not every chapter was paginated when the PDF was asked for: the plan
    // carries no count, or a stale one.
    for (const plans of [
      [planOf(0), planOf(1), planOf(2)],
      [planOf(0, { bookPageCount: 8 }), planOf(1, { bookPageCount: 8 }), planOf(2, { bookPageCount: 8 })],
    ]) {
      calls.length = 0;
      const docs = await layOutBookChain(plans, build, true);
      expect(docs.map((d) => d.bookPageCount)).toEqual([9, 9, 9]);
      expect(calls).toHaveLength(6);
    }
    // A count the chain agrees with is laid out once.
    calls.length = 0;
    const settled = [planOf(0, { bookPageCount: 9 }), planOf(1, { bookPageCount: 9 }), planOf(2, { bookPageCount: 9 })];
    expect((await layOutBookChain(settled, build, true)).map((d) => d.bookPageCount)).toEqual([9, 9, 9]);
    expect(calls).toHaveLength(3);
  });

  it('drops the provisional page fields of a plan not yet paginated', async () => {
    // The book's first chapter is left out: nothing numbers the next one
    // but its plan, whose numbering the planner made up while the pages
    // before it were unknown (a plate opening on a verso).
    const { build, calls } = fakeBuild({ c1: 2, c2: 4 });
    const provisional = { pageIndexOffset: 1, pageNumbering: { format: 'decimal' as const, startAt: 2 } };
    await layOutBookChain([planOf(0), planOf(1, provisional), planOf(2)], build, false);
    expect(calls[1]).toEqual({ pageIndexOffset: 0 });
    // A paginated plan's numbering stands.
    calls.length = 0;
    const paginated = { ...planOf(1, { pageIndexOffset: 4, pageNumbering: { format: 'decimal', startAt: 5 } }), paginated: true };
    await layOutBookChain([planOf(0), paginated, planOf(2)], build, false);
    expect(calls[1]).toEqual({ pageIndexOffset: 0, pageNumbering: { format: 'decimal', startAt: 5 } });
  });

  it('leaves out a chapter the build skips', async () => {
    const { build } = fakeBuild({ c0: 3, c2: 4 });
    const docs = await layOutBookChain([planOf(0), planOf(1), planOf(2)], build, true);
    expect(docs.map((d) => [d.pageIndexOffset, d.bookPageCount])).toEqual([[undefined, 7], [3, 7]]);
  });
});
