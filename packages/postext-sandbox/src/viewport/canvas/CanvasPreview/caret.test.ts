import { describe, expect, it } from 'vitest';
import type { VDTDocument } from 'postext';
import { findCaretBlockIdx } from './caret.js';

type Block = VDTDocument['blocks'][number];
const block = (sourceStart: number, sourceEnd: number, lines = 1, pageIndex = 0): Block =>
  ({ sourceStart, sourceEnd, pageIndex, lines: Array.from({ length: lines }, () => ({})) }) as unknown as Block;
const docOf = (...blocks: Block[]): VDTDocument => ({ blocks }) as unknown as VDTDocument;

describe('the block that shows the caret (#1711)', () => {
  // "First.\n\n\n\nNext one."
  const doc = docOf(block(0, 6), block(10, 19));
  it('is the block that holds it', () => {
    expect(findCaretBlockIdx(doc, 6)).toBe(0);
    expect(findCaretBlockIdx(doc, 10)).toBe(1);
  });
  it('between two blocks, is the nearer one, the one before on a tie', () => {
    expect(findCaretBlockIdx(doc, 7)).toBe(0);
    expect(findCaretBlockIdx(doc, 8)).toBe(0);
    expect(findCaretBlockIdx(doc, 9)).toBe(1);
  });
  it('before the first block or after the last, is that block', () => {
    expect(findCaretBlockIdx(docOf(block(4, 8), block(10, 12)), 1)).toBe(0);
    expect(findCaretBlockIdx(doc, 40)).toBe(1);
  });
  it('is the paragraph rather than the box that ends with it', () => {
    expect(findCaretBlockIdx(docOf(block(0, 6, 0), block(2, 6), block(12, 20)), 8)).toBe(1);
  });
  it('is looked up among the pages given', () => {
    expect(findCaretBlockIdx(docOf(block(0, 6, 1, 0), block(10, 19, 1, 1)), 7, { from: 1, to: 2 })).toBe(1);
  });
});
