import { describe, expect, it } from 'vitest';
import { buildBundle, buildBundleParallel, createBundleLayoutCache, layOutChapter } from '../../bundle/index.js';
import type { ChapterLayoutJob, ChapterRecord } from '../../bundle/index.js';
import { createMeasurementCache } from '../../measure/index.js';
import type { PostextConfig } from '../../types.js';
import type { VDTDocument } from '../../vdt.js';

// #1611: `buildBundleParallel` hands the chapters of a book to an executor
// several at a time and gives the documents `buildBundle` gives.

// Deterministic text measurement stub (no DOM in the node test env).
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
const config: PostextConfig = {
  page: { width: pt(360), height: pt(480), margins: { top: pt(36), bottom: pt(36), left: pt(36), right: pt(36) } },
  headings: { levels: [{ level: 1, numberingTemplate: 'Chapter {1}', breakBefore: { enabled: true, parity: 'odd' } }, { level: 2, numberingTemplate: '{1}.{2}' }] },
  footnotes: { numbering: 'document' },
  footer: { elements: [{ kind: 'text', id: 'folio', content: '{pageNumber} / {bookTotalPages}', fontSize: pt(8), placement: { anchor: { to: 'container', edge: 'top' } } }] },
} as PostextConfig;
const paragraph = (word: string) => `A paragraph with the word ${word} and enough text around it to fill a few lines of the column. `.repeat(4);
const chapter = (title: string, paragraphs: number, extra = '') =>
  `# ${title}\n\n## A section of ${title} {#${title.toLowerCase()}}\n\n${Array.from({ length: paragraphs }, (_, i) => paragraph(`${title}${i}`) + (i === 1 ? `[^n${title}]` : '')).join('\n\n')}\n\n[^n${title}]: A note of ${title}.\n${extra}`;
const book = (chapters: string[], cfg: PostextConfig = config) => ({ chapters: chapters.map((markdown) => ({ markdown })), config: cfg });

// Chapters of uneven lengths, so the pages before each are not what a guess gives.
const plain = [chapter('One', 3), chapter('Two', 17), chapter('Three', 1), chapter('Four', 9), chapter('Five', 26), chapter('Six', 4)];
const withContents = ['# Contents\n\n:::toc\n:::\n', ...plain.slice(0, 4), chapter('Seven', 5, '\nSee :ref{id="two"} and :ref{id="five"}.\n'), ...plain.slice(4)];

/** An executor that lays the chapters out here and hands each record back
 *  as a worker would: a structured clone. */
function executor(cfg: PostextConfig = config) {
  const context = { config: cfg, resources: [], cache: createMeasurementCache() };
  const calls: number[][] = [];
  const layOutChapters = async (jobs: ChapterLayoutJob[]): Promise<ChapterRecord[]> => {
    calls.push(jobs.map((j) => j.index));
    await Promise.resolve();
    return jobs.map((job) => structuredClone(layOutChapter(structuredClone(job), context)));
  };
  return { layOutChapters, calls };
}

const same = (a: VDTDocument[], b: VDTDocument[]) => expect(JSON.stringify(a)).toBe(JSON.stringify(b));

describe('buildBundleParallel (#1611)', () => {
  it('gives the documents of buildBundle, the chapters asked for together', async () => {
    const serial = buildBundle(book(plain));
    const { layOutChapters, calls } = executor();
    const docs = await buildBundleParallel(book(plain), { layOutChapters });
    same(docs, serial);
    // The first step holds every chapter; the pages the guess got wrong
    // are laid out again, together.
    expect(calls[0]).toEqual([0, 1, 2, 3, 4, 5]);
    expect(calls.length).toBeLessThan(plain.length);
    expect(calls.slice(1).some((c) => c.length > 1)).toBe(true);
    // Uneven chapters: the book is not the one the guess laid out.
    expect(new Set(serial.map((d) => d.pages.length)).size).toBeGreaterThan(2);
  });

  it('settles the contents, the references and the page total as buildBundle does', async () => {
    const serial = buildBundle(book(withContents));
    const { layOutChapters } = executor();
    same(await buildBundleParallel(book(withContents), { layOutChapters }), serial);
    const contents = JSON.stringify(serial[0]!.blocks.map((b) => b.lines?.map((l) => l.text)));
    expect(contents).toContain('Five');
  });

  it('lays out only what an edit moved, with a layout cache', async () => {
    const layoutCache = createBundleLayoutCache();
    const { layOutChapters, calls } = executor();
    await buildBundleParallel(book(plain), { layOutChapters, layoutCache });
    calls.length = 0;
    same(await buildBundleParallel(book(plain), { layOutChapters, layoutCache }), buildBundle(book(plain)));
    expect(calls).toEqual([]);
    // A longer second chapter moves the chapters after it.
    const edited = [plain[0]!, chapter('Two', 21), ...plain.slice(2)];
    same(await buildBundleParallel(book(edited), { layOutChapters, layoutCache }), buildBundle(book(edited)));
    expect(calls.flat()).not.toContain(0);
    expect(layoutCache.stats.laidOut[0]).toBe(false);
  });

  it('starts a book where its bundle says it starts', async () => {
    const start = { pageIndexOffset: 7, pageNumbering: { startAt: 8, format: 'decimal' as const }, headings: { h1: 3, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 } };
    const serial = buildBundle({ ...book(plain), start });
    const { layOutChapters } = executor();
    same(await buildBundleParallel({ ...book(plain), start }, { layOutChapters }), serial);
  });

  it('lays a book out once when the page hints are those of its layout', async () => {
    const serial = buildBundle(book(plain));
    const pageHints = serial.map((doc) => {
      const first = doc.pages[0]!;
      const last = doc.pages[doc.pages.length - 1]!;
      return { pageCount: doc.pages.length, lastPage: { number: { delta: last.pageNumberValue - first.pageNumberValue }, format: last.pageNumberFormat } };
    });
    const { layOutChapters, calls } = executor();
    same(await buildBundleParallel(book(plain), { layOutChapters, pageHints }), serial);
    // One step for the layout, one for the round of the page total.
    expect(calls).toEqual([[0, 1, 2, 3, 4, 5], [0, 1, 2, 3, 4, 5]]);
    // Hints of another book cost layouts, never a page.
    const wrong = pageHints.map((h) => ({ ...h, pageCount: h.pageCount + 3 }));
    const again = executor();
    same(await buildBundleParallel(book(plain), { layOutChapters: again.layOutChapters, pageHints: wrong }), serial);
    expect(again.calls.length).toBeGreaterThan(2);
  });

  it('refuses an executor that returns another number of chapters', async () => {
    await expect(buildBundleParallel(book(plain), { layOutChapters: async () => [] })).rejects.toThrow(/chapters asked/);
  });
});
