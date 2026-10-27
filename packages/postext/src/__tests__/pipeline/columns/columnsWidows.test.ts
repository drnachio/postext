import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/index.js';
import type { PostextConfig, VDTBlock, VDTDocument } from '../../../index.js';

// A `:::columns` group set whole is cut where its columns stand level
// without leaving a lone line of a paragraph at the foot or the head of a
// column (#934).

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
const config = (bodyText: PostextConfig['bodyText'] = {}): PostextConfig => ({
  page: { width: pt(400), height: pt(600), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single', gutterWidth: pt(12) },
  bodyText: { fontSize: pt(10), lineHeight: pt(13), textAlign: 'left', hyphenation: { enabled: false }, ...bodyText },
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] },
  header: { elements: [] },
  footer: { elements: [] },
});

/** A paragraph of `n` lines in a sub-column that holds one such word: one word
 *  of 30 characters a line. */
const para = (tag: string, n: number) => Array.from({ length: n }, (_, i) => `${tag}${i}`.padEnd(60, 'x')).join(' ');

const groupBlocks = (doc: VDTDocument): VDTBlock[] =>
  doc.pages[0]!.columns.flatMap((c) => c.blocks.filter((b) => b.type === 'paragraph' && /^[ab]\d/.test(b.lines[0]?.text ?? '')));

/** Lines per sub-column, left to right, with the paragraph tag of each. */
const columnsOf = (doc: VDTDocument): string[][] => {
  const blocks = groupBlocks(doc);
  const xs = [...new Set(blocks.map((b) => Math.round(b.bbox.x)))].sort((a, b) => a - b);
  return xs.map((x) => blocks.filter((b) => Math.round(b.bbox.x) === x).flatMap((b) => b.lines.map((l) => l.text.slice(0, 2))));
};

describe(':::columns cut set whole (#934)', () => {
  const md = `:::columns{count=2}\n${para('a', 6)}\n\n${para('b', 5)}\n:::\n\nAfter.`;

  it('a lone line never heads the second column: 6 | 5, not 5 | 1+5', () => {
    const doc = buildDocument({ markdown: md }, config({ paragraphSpacing: true }));
    const cols = columnsOf(doc);
    expect(cols).toHaveLength(2);
    expect(cols[0]!.every((t) => t.startsWith('a'))).toBe(true);
    expect(cols[0]).toHaveLength(6);
    expect(cols[1]!.every((t) => t.startsWith('b'))).toBe(true);
    expect(cols[1]).toHaveLength(5);
  });

  it('without paragraph spacing the same text cuts 6 | 5 too', () => {
    const doc = buildDocument({ markdown: md }, config({ paragraphSpacing: false }));
    const cols = columnsOf(doc);
    expect(cols.map((c) => c.length)).toEqual([6, 5]);
  });

  it('a cut inside a paragraph leaves at least the widow and orphan lines on each side', () => {
    // One paragraph of 5 lines: 3 | 2 (two lines on each side), never 4 | 1.
    const doc = buildDocument({ markdown: `:::columns{count=2}\n${para('a', 5)}\n:::\n\nAfter.` }, config({ paragraphSpacing: true }));
    const cols = columnsOf(doc);
    expect(cols.map((c) => c.length)).toEqual([3, 2]);
    // An orphan: 1 line of the second paragraph at the foot of column 1.
    const doc2 = buildDocument({ markdown: `:::columns{count=2}\n${para('a', 4)}\n\n${para('b', 6)}\n:::\n\nAfter.` }, config({ paragraphSpacing: true, orphanMinLines: 2, widowMinLines: 2 }));
    for (const col of columnsOf(doc2)) {
      for (const tag of ['a', 'b']) {
        const n = col.filter((t) => t.startsWith(tag)).length;
        if (n > 0) expect(n === col.length || n >= 2 || col.every((t) => t.startsWith(tag))).toBe(true);
      }
      // The tail and head of each column hold two lines of their paragraph.
      expect(col.slice(0, 2).every((t) => t[0] === col[0]![0])).toBe(true);
      expect(col.slice(-2).every((t) => t[0] === col[col.length - 1]![0])).toBe(true);
    }
  });

  it('with the rules off a lone line may stand at a column head', () => {
    const doc = buildDocument({ markdown: `:::columns{count=2}\n${para('a', 5)}\n:::\n\nAfter.` }, config({ avoidWidows: false, avoidOrphans: false }));
    const cols = columnsOf(doc);
    expect(cols.map((c) => c.length)).toEqual([3, 2]);
  });
});
