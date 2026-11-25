import { describe, expect, it } from 'vitest';
import { composeBook, composeBookMemo, fromBookLine, fromBookOffset, segmentAtOffset, offsetMapperToBuilt, toBookLine, toBookOffset, toBookSelection } from './compose.js';
import { newChapter } from './chapterOps.js';

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

describe('composeBook chapter-only scope', () => {
  it('keeps the chapter at its place in the book', () => {
    const chapters = [
      { id: 'a', title: 'A', markdown: 'Alpha', createdAt: 0, updatedAt: 0 },
      { id: 'b', title: 'B', markdown: 'Beta', createdAt: 0, updatedAt: 0 },
      { id: 'c', title: 'C', markdown: 'Gamma', createdAt: 0, updatedAt: 0 },
    ];
    const only = composeBook(chapters, { only: 'c' });
    expect(only.segments).toHaveLength(1);
    expect(only.segments[0]!.index).toBe(2);
    expect(only.segments[0]!.start).toBe(0);
    expect(only.scope).toEqual({ only: 'c' });
  });
});

describe('a selection one edit ahead of the laid-out text (#1711)', () => {
  const built = 'First.\n\nNext one.';
  it('text typed in a new paragraph stays at the end of the paragraph before it', () => {
    // Two Enters at the end of "First.": the caret is on the new blank line.
    expect(offsetMapperToBuilt(built, 'First.\n\n\n\nNext one.')(8)).toBe(6);
    // The layout caught up with "a"; "b" is typed after it.
    expect(offsetMapperToBuilt('First.\n\na\n\nNext one.', 'First.\n\nab\n\nNext one.')(10)).toBe(9);
  });
  it('keeps what stands before the edit and shifts what stands after it', () => {
    const toBuilt = offsetMapperToBuilt(built, 'First.\n\nxNext one.');
    expect(toBuilt(3)).toBe(3);
    expect(toBuilt(9)).toBe(8);
    expect(toBuilt(13)).toBe(12);
  });
  it('a deletion keeps the caret at the cut', () => {
    expect(offsetMapperToBuilt(built, 'First.\n\nNext on')(15)).toBe(15);
    expect(offsetMapperToBuilt(built, 'Fist.\n\nNext one.')(1)).toBe(1);
  });
  it('maps the editor selection through the chapter text of the book', () => {
    const book = composeBook(chapters);
    const typed = `${b.markdown}\n\nab`;
    const end = book.segments[1]!.end;
    expect(toBookSelection(book, 'b', { from: typed.length, to: typed.length, head: typed.length }, typed)!.head).toBe(end);
    expect(toBookSelection(book, 'b', { from: 3, to: 3, head: 3 }, b.markdown)!.head).toBe(book.segments[1]!.start + 3);
  });
});

describe('the spaces before a caret (#1714)', () => {
  const book = composeBook(chapters);
  it('are counted in the editor\'s text, for a collapsed selection', () => {
    const typed = `${b.markdown}  `;
    const at = typed.length;
    const sel = toBookSelection(book, 'b', { from: at, to: at, head: at }, typed)!;
    expect(sel.spacesBefore).toBe(2);
    // The caret itself stays at the end of the laid-out text.
    expect(sel.head).toBe(book.segments[1]!.end);
  });
  it('are left out after a letter, and for a range', () => {
    const at = b.markdown.length;
    expect(toBookSelection(book, 'b', { from: at, to: at, head: at }, b.markdown)!.spacesBefore).toBeUndefined();
    const typed = `${b.markdown} `;
    expect(toBookSelection(book, 'b', { from: 2, to: typed.length, head: typed.length }, typed)!.spacesBefore).toBeUndefined();
  });
});
