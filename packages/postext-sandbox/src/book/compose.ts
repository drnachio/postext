// Turns a chapter list into the single markdown string the engine lays out,
// and maps offsets / lines / selections between a chapter and the book.
//
// Rules:
// - Chapters are joined with a blank line. No page break is forced: a chapter
//   whose first block is an H1 opens on a fresh page through the H1's own
//   `breakBefore`, like a book document that starts mid-page otherwise.
// - The first chapter's front matter is the book's front matter (kept
//   verbatim, so the engine parses it at offset 0). Front matter at the top
//   of later chapters is blanked length-preservingly and never parsed.

import { extractFrontmatter, type DocumentMetadata } from 'postext';
import type { EditorSelection } from '../context/SandboxContext';
import { blankFrontmatter } from './frontmatter';
import type { BookSegment, Chapter, ComposedBook } from './types';

export const CHAPTER_SEPARATOR = '\n\n';

function countLines(s: string): number {
  let n = 1;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++;
  return n;
}

export function bookMetadata(chapters: readonly Chapter[]): DocumentMetadata {
  const first = chapters[0];
  if (!first) return {};
  return extractFrontmatter(first.markdown).metadata;
}

export interface ComposeOptions {
  /** Compose only this chapter (chapter-only layout scope). */
  only?: string;
}

export function composeBook(chapters: readonly Chapter[], opts: ComposeOptions = {}): ComposedBook {
  const metadata = bookMetadata(chapters);
  const included = opts.only ? chapters.filter((c) => c.id === opts.only) : [...chapters];
  const segments: BookSegment[] = [];
  let markdown = '';
  let line = 0;
  included.forEach((chapter, index) => {
    const isFirstOfBook = chapters[0]?.id === chapter.id;
    const text = isFirstOfBook ? chapter.markdown : blankFrontmatter(chapter.markdown);
    if (index > 0) {
      markdown += CHAPTER_SEPARATOR;
      line += countLines(CHAPTER_SEPARATOR) - 1;
    }
    const start = markdown.length;
    markdown += text;
    const lineCount = countLines(text);
    // `index` is the chapter's position in the book, not in the composition:
    // a chapter-only layout still belongs to its place in the book.
    const bookIndex = chapters.findIndex((c) => c.id === chapter.id);
    segments.push({ chapterId: chapter.id, index: bookIndex < 0 ? index : bookIndex, start, end: start + text.length, lineStart: line, lineCount });
    line += lineCount - 1;
  });
  return {
    markdown,
    metadata,
    segments,
    scope: opts.only ? { only: opts.only } : 'book',
  };
}

const memo = new WeakMap<readonly Chapter[], Map<string, ComposedBook>>();

/** `composeBook` memoised on the chapters array identity (state arrays are
 *  replaced on every edit) so the viewports, warnings and activity bar share
 *  one composition per state. */
export function composeBookMemo(chapters: readonly Chapter[], only?: string): ComposedBook {
  let byScope = memo.get(chapters);
  if (!byScope) {
    byScope = new Map();
    memo.set(chapters, byScope);
  }
  const key = only ?? '';
  let out = byScope.get(key);
  if (!out) {
    out = composeBook(chapters, { only });
    byScope.set(key, out);
  }
  return out;
}

export function segmentForChapter(book: ComposedBook, chapterId: string): BookSegment | null {
  return book.segments.find((s) => s.chapterId === chapterId) ?? null;
}

/** Segment containing `bookOffset`. Offsets inside a separator (or past
 *  the end) resolve to the preceding chapter. */
export function segmentAtOffset(book: ComposedBook, bookOffset: number): BookSegment {
  const segs = book.segments;
  let lo = 0;
  let hi = segs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (segs[mid]!.start <= bookOffset) lo = mid;
    else hi = mid - 1;
  }
  return segs[lo]!;
}

export function toBookOffset(book: ComposedBook, chapterId: string, offset: number): number | null {
  const seg = segmentForChapter(book, chapterId);
  if (!seg) return null;
  const local = Math.max(0, Math.min(offset, seg.end - seg.start));
  return seg.start + local;
}

export function fromBookOffset(book: ComposedBook, bookOffset: number): { chapterId: string; offset: number } {
  const seg = segmentAtOffset(book, Math.max(0, bookOffset));
  const offset = Math.max(0, Math.min(bookOffset, seg.end) - seg.start);
  return { chapterId: seg.chapterId, offset };
}

/** 1-based lines on both sides. */
export function toBookLine(book: ComposedBook, chapterId: string, line: number): number | null {
  const seg = segmentForChapter(book, chapterId);
  if (!seg) return null;
  const local = Math.max(1, Math.min(line, seg.lineCount));
  return seg.lineStart + local;
}

export function fromBookLine(book: ComposedBook, bookLine: number): { chapterId: string; line: number } {
  const zero = Math.max(0, bookLine - 1);
  const segs = book.segments;
  let seg = segs[0]!;
  for (const s of segs) {
    if (s.lineStart <= zero) seg = s;
    else break;
  }
  const line = Math.max(1, Math.min(zero - seg.lineStart + 1, seg.lineCount));
  return { chapterId: seg.chapterId, line };
}

/** Shift an editor selection (chapter-local) into book offsets; null when
 *  the chapter is not part of the composed book. */
export function toBookSelection(book: ComposedBook, chapterId: string, sel: EditorSelection): EditorSelection | null {
  const seg = segmentForChapter(book, chapterId);
  if (!seg) return null;
  const clamp = (n: number) => seg.start + Math.max(0, Math.min(n, seg.end - seg.start));
  return { from: clamp(sel.from), to: clamp(sel.to), head: clamp(sel.head) };
}
