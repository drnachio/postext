import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { pageSegments } from '../../pipeline/columnBalancing';
import type { PostextConfig, VDTDocument } from '../../index';

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

const SENTENCE = 'La composición tipográfica editorial exige columnas alineadas, rejilla base estable y márgenes consistentes en cada página del documento. ';
const paragraph = (n: number) => SENTENCE.repeat(n).trim();

/** A chapter with headings, lists and paragraphs of varying length, seeded
 *  by `k` so every chapter balances differently. */
function chapter(k: number): string {
  const parts: string[] = [`# Capítulo ${k}`, '', paragraph(3 + (k % 4)), ''];
  for (let i = 1; i <= 4 + (k % 3); i++) {
    parts.push(`## Sección ${k}.${i}`, '', paragraph(2 + ((k + i) % 5)), '', paragraph(1 + ((k * i) % 4)), '');
    if ((k + i) % 2 === 0) parts.push('- uno', '- dos', `- tres ${paragraph(1)}`, '');
    parts.push(`### Detalle ${k}.${i}`, '', paragraph(3 + ((k + 2 * i) % 4)), '');
  }
  return parts.join('\n');
}

const pt = (value: number) => ({ value, unit: 'pt' as const });
const CONFIG: PostextConfig = {
  page: { width: pt(500), height: pt(600), margins: { top: pt(30), bottom: pt(30), left: pt(30), right: pt(30) } },
  headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'odd' } }] },
};

/** Column signature of a page: block content order and bottoms per column. */
const signature = (doc: VDTDocument, page: number, contentOffset: number): string =>
  doc.pages[page]!.columns.map((c) =>
    `${c.kind ?? 'text'}:${c.blocks.map((b) => `${(b.contentIndex ?? -1) - contentOffset}@${(b.bbox.y + b.bbox.height).toFixed(1)}`).join(',')}`,
  ).join(' | ');

describe('segment-wise column balancing', () => {
  it('pageSegments splits the pages at the explicit breaks', () => {
    expect(pageSegments(10, new Set([2, 6]))).toEqual([{ from: 0, to: 2 }, { from: 3, to: 6 }, { from: 7, to: 9 }]);
    expect(pageSegments(5, new Set())).toEqual([{ from: 0, to: 4 }]);
    // A break on the last page closes nothing after it.
    expect(pageSegments(4, new Set([3]))).toEqual([{ from: 0, to: 3 }]);
    expect(pageSegments(0, new Set())).toEqual([{ from: 0, to: 0 }]);
  });

  it('a book of chapters balances every chapter exactly as when built on its own', () => {
    const N = 5;
    const chapters = Array.from({ length: N }, (_, i) => chapter(i + 1));
    const book = buildDocument({ markdown: chapters.join('\n\n') }, CONFIG);
    expect(book.converged).toBe(true);
    // Where each chapter opens in the book (its H1 is the first block of a
    // fresh page) and the content index it starts at.
    const openers = book.blocks
      .filter((b) => b.type === 'heading' && b.headingLevel === 1)
      .map((b) => ({ page: b.pageIndex!, contentIndex: b.contentIndex! }));
    expect(openers).toHaveLength(N);
    for (let k = 0; k < N; k++) {
      const { page, contentIndex } = openers[k]!;
      const end = k + 1 < N ? openers[k + 1]!.page : book.pages.length;
      const alone = buildDocument(
        { markdown: chapters[k]!, continuation: { pageIndexOffset: page } },
        CONFIG,
      );
      expect(alone.converged).toBe(true);
      // Same page count for the chapter, and the same columns page by page.
      const alonePages = alone.pages.filter((p) => !p.blankForParity);
      expect(alonePages.length).toBe(end - page);
      for (let p = 0; p < alonePages.length; p++) {
        expect(signature(book, page + p, contentIndex)).toBe(signature(alone, alonePages[p]!.index, 0));
      }
    }
  }, 120000);
});
