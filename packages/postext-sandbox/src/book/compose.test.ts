import { describe, expect, it } from 'vitest';
import { composeBook, composeBookMemo, fromBookLine, fromBookOffset, segmentAtOffset, toBookLine, toBookOffset, toBookSelection } from './compose';
import { newChapter } from './chapterOps';

const a = newChapter('a', 'A', '---\ntitle: Book\n---\n# One\n\nFirst.', 1);
const b = newChapter('b', 'B', '---\ntitle: Nope\n---\n# Two\nSecond', 1);
const c = newChapter('c', 'C', '', 1);
const chapters = [a, b, c];

describe('composeBook', () => {
  it('joins chapters with a blank line and keeps segment lengths exact', () => {
    const book = composeBook(chapters);
    expect(book.scope).toBe('book');
    expect(book.segments).toHaveLength(3);
    for (const s of book.segments) {
      const ch = chapters.find((x) => x.id === s.chapterId)!;
      expect(s.end - s.start).toBe(ch.markdown.length);
    }
    expect(book.markdown.startsWith(a.markdown)).toBe(true);
    expect(book.markdown.slice(book.segments[1]!.start - 2, book.segments[1]!.start)).toBe('\n\n');
  });
  it('keeps the first chapter front matter and blanks later ones', () => {
    const book = composeBook(chapters);
    expect(book.metadata.title).toBe('Book');
    const second = book.markdown.slice(book.segments[1]!.start, book.segments[1]!.end);
    expect(second).not.toContain('Nope');
    expect(second).toHaveLength(b.markdown.length);
    expect(second).toContain('# Two');
  });
  it('composes a single chapter in chapter scope with book metadata', () => {
    const book = composeBook(chapters, { only: 'b' });
    expect(book.scope).toEqual({ only: 'b' });
    expect(book.segments).toHaveLength(1);
    expect(book.segments[0]!.start).toBe(0);
    expect(book.metadata.title).toBe('Book');
    expect(book.markdown).not.toContain('Nope');
  });
  it('memoises on the chapters array identity', () => {
    expect(composeBookMemo(chapters)).toBe(composeBookMemo(chapters));
    expect(composeBookMemo(chapters, 'a')).not.toBe(composeBookMemo(chapters));
    expect(composeBookMemo([...chapters])).not.toBe(composeBookMemo(chapters));
  });
});

describe('offset mapping', () => {
  const book = composeBook(chapters);
  it('round-trips offsets', () => {
    for (const ch of chapters) {
      for (const off of [0, 3, ch.markdown.length]) {
        const bookOff = toBookOffset(book, ch.id, off)!;
        expect(fromBookOffset(book, bookOff)).toEqual({ chapterId: ch.id, offset: Math.min(off, ch.markdown.length) });
      }
    }
  });
  it('clamps separator offsets to the previous chapter end', () => {
    const sep = book.segments[1]!.start - 1;
    expect(segmentAtOffset(book, sep).chapterId).toBe('a');
    expect(fromBookOffset(book, sep)).toEqual({ chapterId: 'a', offset: a.markdown.length });
  });
  it('returns null for a chapter outside the scope', () => {
    expect(toBookOffset(composeBook(chapters, { only: 'a' }), 'b', 0)).toBeNull();
  });
  it('shifts selections', () => {
    const sel = toBookSelection(book, 'b', { from: 1, to: 4, head: 4 })!;
    const s = book.segments[1]!.start;
    expect(sel).toEqual({ from: s + 1, to: s + 4, head: s + 4 });
  });
});

describe('line mapping', () => {
  const book = composeBook(chapters);
  it('round-trips 1-based lines including empty chapters', () => {
    expect(toBookLine(book, 'a', 1)).toBe(1);
    expect(toBookLine(book, 'a', 4)).toBe(4);
    const bLine1 = toBookLine(book, 'b', 1)!;
    expect(bLine1).toBe(6 + 2); // a has 6 lines, separator adds 2
    expect(fromBookLine(book, bLine1)).toEqual({ chapterId: 'b', line: 1 });
    expect(fromBookLine(book, bLine1 + 3)).toEqual({ chapterId: 'b', line: 4 });
    const cLine = toBookLine(book, 'c', 1)!;
    expect(fromBookLine(book, cLine)).toEqual({ chapterId: 'c', line: 1 });
  });
});
