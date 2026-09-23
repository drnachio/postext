// Pure operations on a book's chapter list. Ids are supplied by callers so
// these stay deterministic and testable.

import { frontmatterRange } from './frontmatter';
import { CHAPTER_SEPARATOR } from './compose';
import { blankFrontmatter } from './frontmatter';
import type { BookContent, Chapter } from './types';

export function newChapter(id: string, title: string, markdown = '', now = Date.now()): Chapter {
  return { id, title, markdown, createdAt: now, updatedAt: now };
}

export function singleChapterBook(markdown: string, id: string, title: string): BookContent {
  return { chapters: [newChapter(id, title, markdown)], activeChapterId: id };
}

/** Strip inline markdown marks from a heading line. */
function plainHeading(s: string): string {
  return s
    .replace(/\{[^}]*\}\s*$/, '')
    .replace(/\s*\\\\\s*/g, ' ')
    .replace(/[*_`~]+/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\\([\\`*_{}[\]()#+\-.!])/g, '$1')
    .trim();
}

interface LineScan {
  /** 0-based offsets of the first char of every level-1 heading line. */
  h1Offsets: number[];
}

/** Find `# ` lines outside the front-matter block and code fences. */
function scanHeadings(markdown: string): LineScan {
  const h1Offsets: number[] = [];
  const fm = frontmatterRange(markdown);
  let pos = fm ? fm.end : 0;
  let inFence: string | null = null;
  while (pos <= markdown.length) {
    const nl = markdown.indexOf('\n', pos);
    const lineEnd = nl === -1 ? markdown.length : nl;
    const line = markdown.slice(pos, lineEnd);
    const fence = /^(\s{0,3})(`{3,}|~{3,})/.exec(line);
    if (fence) {
      const marker = fence[2]![0]!;
      if (inFence === null) inFence = marker;
      else if (inFence === marker) inFence = null;
    } else if (inFence === null && /^#\s+\S/.test(line)) {
      h1Offsets.push(pos);
    }
    if (nl === -1) break;
    pos = nl + 1;
  }
  return { h1Offsets };
}

/** Title for a chapter: its first level-1 heading, else the front-matter
 *  `title`, else `fallback`. */
export function deriveChapterTitle(markdown: string, fallback: string): string {
  const { h1Offsets } = scanHeadings(markdown);
  if (h1Offsets.length > 0) {
    const start = h1Offsets[0]!;
    const nl = markdown.indexOf('\n', start);
    const line = markdown.slice(start, nl === -1 ? undefined : nl);
    const text = plainHeading(line.replace(/^#\s+/, ''));
    if (text) return text;
  }
  const fm = frontmatterRange(markdown);
  if (fm) {
    const m = /^title:\s*["']?(.+?)["']?\s*$/m.exec(markdown.slice(0, fm.end));
    if (m?.[1]) return m[1].trim();
  }
  return fallback;
}

export function h1Count(markdown: string): number {
  return scanHeadings(markdown).h1Offsets.length;
}

export function wordCount(markdown: string): number {
  const fm = frontmatterRange(markdown);
  const body = fm ? markdown.slice(fm.end) : markdown;
  const words = body.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return words ? words.length : 0;
}

function withChapters(book: BookContent, chapters: Chapter[], activeChapterId = book.activeChapterId): BookContent {
  const active = chapters.some((c) => c.id === activeChapterId) ? activeChapterId : chapters[0]!.id;
  return { ...book, chapters, activeChapterId: active };
}

export function replaceChapterMarkdown(book: BookContent, id: string, markdown: string, now = Date.now()): BookContent {
  const idx = book.chapters.findIndex((c) => c.id === id);
  if (idx === -1 || book.chapters[idx]!.markdown === markdown) return book;
  const chapters = book.chapters.slice();
  chapters[idx] = { ...chapters[idx]!, markdown, updatedAt: now };
  return { ...book, chapters };
}

/** Insert `chapter` at `index` (default: after the active chapter). */
export function addChapter(book: BookContent, chapter: Chapter, index?: number, activate = true): BookContent {
  const activeIdx = book.chapters.findIndex((c) => c.id === book.activeChapterId);
  const at = index ?? (activeIdx === -1 ? book.chapters.length : activeIdx + 1);
  const chapters = book.chapters.slice();
  chapters.splice(Math.max(0, Math.min(at, chapters.length)), 0, chapter);
  return withChapters(book, chapters, activate ? chapter.id : book.activeChapterId);
}

/** No-op on the last chapter. Removing the active chapter activates the
 *  next one, else the previous. */
export function removeChapter(book: BookContent, id: string): BookContent {
  if (book.chapters.length <= 1) return book;
  const idx = book.chapters.findIndex((c) => c.id === id);
  if (idx === -1) return book;
  const chapters = book.chapters.filter((c) => c.id !== id);
  let active = book.activeChapterId;
  if (active === id) active = (chapters[idx] ?? chapters[idx - 1])!.id;
  return withChapters(book, chapters, active);
}

export function renameChapter(book: BookContent, id: string, title: string, now = Date.now()): BookContent {
  const trimmed = title.trim();
  const idx = book.chapters.findIndex((c) => c.id === id);
  if (idx === -1 || !trimmed || book.chapters[idx]!.title === trimmed) return book;
  const chapters = book.chapters.slice();
  chapters[idx] = { ...chapters[idx]!, title: trimmed, updatedAt: now };
  return { ...book, chapters };
}

export function moveChapter(book: BookContent, id: string, toIndex: number): BookContent {
  const from = book.chapters.findIndex((c) => c.id === id);
  const to = Math.max(0, Math.min(toIndex, book.chapters.length - 1));
  if (from === -1 || from === to) return book;
  const chapters = book.chapters.slice();
  const [moved] = chapters.splice(from, 1);
  chapters.splice(to, 0, moved!);
  return { ...book, chapters };
}

/** Text after `offset` becomes a new chapter placed right after `id`; the
 *  new chapter becomes active. */
export function splitChapterAt(book: BookContent, id: string, offset: number, newId: string, newTitle?: string, now = Date.now()): BookContent {
  const idx = book.chapters.findIndex((c) => c.id === id);
  if (idx === -1) return book;
  const src = book.chapters[idx]!;
  const at = Math.max(0, Math.min(offset, src.markdown.length));
  const head = src.markdown.slice(0, at).replace(/\s+$/, '');
  const tail = src.markdown.slice(at).replace(/^\s+/, '');
  if (!tail) return book;
  const created = newChapter(newId, newTitle ?? deriveChapterTitle(tail, `${src.title} (2)`), tail, now);
  const chapters = book.chapters.slice();
  chapters[idx] = { ...src, markdown: head, updatedAt: now };
  chapters.splice(idx + 1, 0, created);
  return withChapters(book, chapters, newId);
}

/** Split a chapter into one chapter per level-1 heading. Text before the
 *  first heading stays in the original chapter (which keeps its title).
 *  Needs at least two headings; `ids()` supplies ids for the new pieces. */
export function splitChapterAtHeadings(book: BookContent, id: string, ids: () => string, now = Date.now()): { book: BookContent; created: number } {
  const idx = book.chapters.findIndex((c) => c.id === id);
  if (idx === -1) return { book, created: 0 };
  const src = book.chapters[idx]!;
  const { h1Offsets } = scanHeadings(src.markdown);
  if (h1Offsets.length < 2) return { book, created: 0 };
  const cuts = h1Offsets[0] === 0 || src.markdown.slice(0, h1Offsets[0]).trim() === '' || frontmatterRange(src.markdown)?.end === h1Offsets[0]
    ? h1Offsets.slice(1)
    : h1Offsets;
  const pieces: string[] = [];
  let prev = 0;
  for (const cut of cuts) {
    pieces.push(src.markdown.slice(prev, cut));
    prev = cut;
  }
  pieces.push(src.markdown.slice(prev));
  const chapters = book.chapters.slice();
  chapters[idx] = { ...src, markdown: pieces[0]!.replace(/\s+$/, ''), updatedAt: now };
  const created: Chapter[] = pieces.slice(1).map((text) => {
    const body = text.replace(/\s+$/, '');
    return newChapter(ids(), deriveChapterTitle(body, src.title), body, now);
  });
  chapters.splice(idx + 1, 0, ...created);
  return { book: withChapters(book, chapters, book.activeChapterId), created: created.length };
}

/** Append `id`'s text to the previous chapter (front matter of the merged
 *  chapter blanked, as the book would have). Active stays on the survivor. */
export function mergeWithPrevious(book: BookContent, id: string, now = Date.now()): BookContent {
  const idx = book.chapters.findIndex((c) => c.id === id);
  if (idx <= 0) return book;
  const prev = book.chapters[idx - 1]!;
  const cur = book.chapters[idx]!;
  const merged: Chapter = {
    ...prev,
    markdown: `${prev.markdown.replace(/\s+$/, '')}${CHAPTER_SEPARATOR}${blankFrontmatter(cur.markdown).replace(/^\s+/, '')}`,
    updatedAt: now,
  };
  const chapters = book.chapters.slice();
  chapters.splice(idx - 1, 2, merged);
  const active = book.activeChapterId === id ? prev.id : book.activeChapterId;
  return withChapters(book, chapters, active);
}

/** Fresh ids for every chapter (duplicating a project must not share editor
 *  histories with the original). */
export function cloneChapters(chapters: readonly Chapter[], ids: () => string, now = Date.now()): { chapters: Chapter[]; idMap: Map<string, string> } {
  const idMap = new Map<string, string>();
  const out = chapters.map((c) => {
    const id = ids();
    idMap.set(c.id, id);
    return { ...c, id, createdAt: now, updatedAt: now };
  });
  return { chapters: out, idMap };
}

export function cloneBook(book: BookContent, ids: () => string, now = Date.now()): BookContent {
  const { chapters, idMap } = cloneChapters(book.chapters, ids, now);
  return { chapters, activeChapterId: idMap.get(book.activeChapterId) ?? chapters[0]!.id };
}

/** Where a chapter that opens at the level-1 heading at `h1` really starts:
 *  the `:::part` block and single-line directives (`:::numbering`,
 *  `:::pagebreak`) right above the heading belong to it, so a part divider
 *  opens its first chapter instead of closing the previous one. */
function chapterStart(markdown: string, h1: number, floor: number): number {
  let start = h1;
  let cursor = h1;
  for (;;) {
    // The line above `cursor`, skipping blank lines.
    let end = cursor;
    while (end > floor && /\s/.test(markdown[end - 1]!)) end--;
    if (end <= floor) return start;
    const lineStart = markdown.lastIndexOf('\n', end - 1) + 1;
    const line = markdown.slice(lineStart, end).trim();
    if (/^:::(numbering|pagebreak)\b/.test(line)) { start = cursor = Math.max(lineStart, floor); continue; }
    if (line !== ':::') return start;
    // A closing fence: its opener must be a `:::part`.
    const opener = markdown.lastIndexOf('\n:::', lineStart - 2);
    const openerStart = opener === -1 ? -1 : opener + 1;
    if (openerStart < floor || !markdown.startsWith(':::part', openerStart)) return start;
    start = cursor = openerStart;
  }
}

/** A sample document as a book: one chapter per level-1 heading (the front
 *  matter stays with the first; a `:::part` right above a heading goes with
 *  it), each titled after its heading. The built-in guide ships as one
 *  markdown string so hosts can pass their own copy through
 *  `initialMarkdown`. */
export function sampleBook(markdown: string, ids: () => string, fallbackTitle: string, now = Date.now()): BookContent {
  const { h1Offsets } = scanHeadings(markdown);
  const fmEnd = frontmatterRange(markdown)?.end ?? 0;
  const cuts: number[] = [];
  let floor = fmEnd;
  for (const h1 of h1Offsets) {
    const cut = chapterStart(markdown, h1, floor);
    // Nothing but the front matter above: the heading opens the first chapter.
    if (markdown.slice(fmEnd, cut).trim() !== '') cuts.push(cut);
    floor = h1 + 1;
  }
  const pieces: string[] = [];
  let prev = 0;
  for (const cut of cuts) {
    pieces.push(markdown.slice(prev, cut));
    prev = cut;
  }
  pieces.push(markdown.slice(prev));
  const chapters = pieces.map((text, i) => {
    const body = i === 0 ? text.replace(/\s+$/, '') : text.replace(/^\s+/, '').replace(/\s+$/, '');
    return newChapter(ids(), deriveChapterTitle(body, fallbackTitle), body, now);
  });
  return { chapters, activeChapterId: chapters[0]!.id };
}

/** The chapter texts `sampleBook` cuts `markdown` into. */
export function sampleChapterTexts(markdown: string): string[] {
  let n = 0;
  return sampleBook(markdown, () => `c${n++}`, '', 0).chapters.map((c) => c.markdown);
}

/** A book that is still exactly one of the untouched sample documents —
 *  either as the chapters `sampleBook` cuts it into or, as saved before the
 *  samples became books, as a single chapter. */
export function isPristineBook(book: BookContent, samples: readonly string[]): boolean {
  if (book.chapters.length === 1 && samples.includes(book.chapters[0]!.markdown)) return true;
  return samples.some((sample) => {
    const texts = sampleChapterTexts(sample);
    return texts.length === book.chapters.length && texts.every((t, i) => t === book.chapters[i]!.markdown);
  });
}

export function activeChapter(book: BookContent): Chapter {
  return book.chapters.find((c) => c.id === book.activeChapterId) ?? book.chapters[0]!;
}
