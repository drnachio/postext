import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
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

const pt = (value: number) => ({ value, unit: 'pt' as const });
const para = (i: number) => `Paragraph ${i} carries enough words to take a few lines of the narrow column so the flow advances steadily.`;
const filler = (n: number, from = 0) => Array.from({ length: n }, (_, i) => para(from + i)).join('\n\n');
/** One paragraph of `n` short sentences. */
const long = (n: number, tag = 'S') => Array.from({ length: n }, (_, i) => `${tag}${i} runs on.`).join(' ');

const config = (h1Break: boolean): PostextConfig => ({
  page: { width: pt(400), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  headings: {
    keepWithNext: true,
    levels: [{ level: 1, breakBefore: h1Break ? { enabled: true, parity: 'any' } : { enabled: false } }],
  },
});

const build = (md: string, cfg: PostextConfig): VDTDocument => buildDocument({ markdown: md }, cfg, createMeasurementCache());

/** Headings that close a text column while their text continues in a
 *  later column of the same band. */
const strandedHeadings = (doc: VDTDocument) => {
  const out: { page: number; column: number; text: string | undefined }[] = [];
  for (const p of doc.pages) {
    const cols = p.columns.filter((c) => c.kind !== 'span' && c.kind !== 'side');
    cols.forEach((c, i) => {
      const last = c.blocks[c.blocks.length - 1];
      if (last?.type === 'heading' && cols.slice(i + 1).some((n) => n.blocks.length > 0)) {
        out.push({ page: p.index, column: i, text: last.lines?.[0]?.text });
      }
    });
  }
  return out;
};

describe('the level cut of a closing band keeps a heading with its text (EF-61)', () => {
  it('a section heading and its short paragraph opening the closing page stay together', () => {
    // Page 1 is full; the closing page holds only the heading and a two-line
    // paragraph. The level cut (three lines per column) fits the heading
    // alone in column 1 and sent the paragraph to column 2.
    const doc = build(`${filler(27)}\n\n${long(1, 'A')}\n\n## Heading\n\n${long(10, 'T')}`, config(false));
    expect(doc.pages.length).toBe(2);
    expect(strandedHeadings(doc)).toEqual([]);
    const last = doc.pages[1]!;
    const col = last.columns.find((c) => c.blocks.some((b) => b.type === 'heading'))!;
    expect(col.blocks.map((b) => b.type)).toEqual(['heading', 'paragraph']);
  });

  it('holds for a chapter heading before the end of the document', () => {
    const doc = build(`# One\n\n${filler(16)}\n\n## Heading\n\n${long(10, 'T')}\n\n# Next\n\n${para(99)}`, config(true));
    expect(strandedHeadings(doc)).toEqual([]);
  });

  it('holds across paragraph and tail lengths', () => {
    for (const a of [0, 1, 2, 4]) {
      for (const t of [2, 4, 6]) {
        const doc = build(`${filler(27)}\n\n${long(a, 'A')}\n\n## Heading\n\n${long(t * 5, 'T')}`, config(false));
        expect(strandedHeadings(doc), `a=${a} t=${t}`).toEqual([]);
      }
    }
  });
});
