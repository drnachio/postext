/**
 * A whole book laid out as one document (#1521): the HTML viewer's
 * whole-book reading hands the engine every chapter joined, with where each
 * lies (`PostextContent.chapters`). Each chapter is set in its own chapter
 * style, as the paged outputs set it: the chapters of one style that follow
 * each other are laid out together, from the book's whole source with the
 * rest of it blanked (offsets and line numbers stay the book's), each run
 * after the one before it, and the runs' documents are joined into the
 * book's.
 */

import type { BookChapterRange, LayoutContinuation, PostextConfig, PostextContent } from '../../types.js';
import type { VDTBlock, VDTDocument } from '../../vdt.js';
import { chapterStyleIdOf } from '../../defaults/chapterStyles.js';
import { extractFrontmatter } from '../../parse/frontmatter.js';
import { continuationAfter } from '../continuation.js';

/** Chapters that follow each other in one style: where they lie, and the
 *  style (none for the book's own settings). */
export interface ChapterRun {
  start: number;
  end: number;
  style?: string;
}

/** The runs of a whole book's chapters set in one style. `before` is what
 *  the book inherits (the part it starts in). */
export function chapterRuns(markdown: string, chapters: readonly BookChapterRange[], config: PostextConfig, before?: LayoutContinuation): ChapterRun[] {
  const known = new Set((config.chapterStyles ?? []).map((s) => s.id));
  const out: ChapterRun[] = [];
  let prior = before;
  for (const range of chapters) {
    const text = markdown.slice(range.start, range.end);
    const id = chapterStyleIdOf(text, prior?.part?.style);
    // A style the book does not define sets the chapter in the book's.
    const style = id !== undefined && known.has(id) ? id : undefined;
    const last = out[out.length - 1];
    if (last && last.style === style) last.end = range.end;
    else out.push({ start: range.start, end: range.end, ...(style ? { style } : {}) });
    // Only the part a chapter leaves open matters here.
    prior = { ...(prior ?? {}), ...partAfter(text, config, prior) } as LayoutContinuation;
  }
  return out;
}

/** The part in effect after a chapter's text. */
function partAfter(text: string, config: PostextConfig, before: LayoutContinuation | undefined): Pick<LayoutContinuation, 'part'> {
  const part = continuationAfter({ markdown: text }, config, before).part;
  return part ? { part } : {};
}

/** A run's source: the book's, every character outside the run but the
 *  line breaks a space. The book's front matter stays, for its metadata
 *  and for the body to start where it starts in the book. */
export function runSource(markdown: string, run: ChapterRun): string {
  const keep = markdown.length - extractFrontmatter(markdown).content.length;
  const blank = (s: string) => s.replace(/[^\n\r]/g, ' ');
  const from = Math.max(run.start, keep);
  return markdown.slice(0, keep) + blank(markdown.slice(keep, from)) + markdown.slice(from, run.end) + blank(markdown.slice(run.end));
}

/** The continuation of the run after `doc`, which `counters` advanced:
 *  its pages after `doc`'s, its numbering after `doc`'s last page. */
export function nextRunContinuation(doc: VDTDocument, counters: LayoutContinuation, content: PostextContent): LayoutContinuation {
  const last = doc.pages[doc.pages.length - 1];
  const { pageIndexOffset: _offset, pageNumbering: _numbering, jumps: _jumps, ...rest } = counters;
  void _offset;
  void _numbering;
  void _jumps;
  return {
    ...rest,
    pageIndexOffset: (doc.pageIndexOffset ?? 0) + doc.pages.length,
    ...(last ? { pageNumbering: { startAt: last.pageNumberValue + 1, format: last.pageNumberFormat } } : {}),
    ...(content.continuation?.bookPageCount !== undefined ? { bookPageCount: content.continuation.bookPageCount } : {}),
    ...(doc.lastLineNumber !== undefined ? { lineNumber: doc.lastLineNumber } : {}),
  };
}

/** Move a later run's document on, in place: its pages after `pages`, the
 *  content indices of its blocks after `content` (each run counts its own
 *  from 0; the book's document counts them through the book). */
function shiftDocument(doc: VDTDocument, pages: number, content: number): void {
  const seen = new Set<VDTBlock>();
  const shift = (b: VDTBlock) => {
    if (seen.has(b)) return;
    seen.add(b);
    b.pageIndex += pages;
    if (b.contentIndex !== undefined) b.contentIndex += content;
  };
  for (const page of doc.pages) {
    page.index += pages;
    for (const column of page.columns) column.blocks.forEach(shift);
    page.floats?.forEach(shift);
  }
  doc.blocks.forEach(shift);
  for (const m of doc.partMarks ?? []) m.afterContentIndex += content;
}

/** The content indices a document's blocks run to (one past the last). */
function contentEnd(doc: VDTDocument): number {
  let end = 0;
  for (const b of doc.blocks) if (b.contentIndex !== undefined) end = Math.max(end, b.contentIndex + 1);
  for (const m of doc.partMarks ?? []) end = Math.max(end, m.afterContentIndex + 1);
  return end;
}

/** The runs' documents joined into the book's: the first's settings and
 *  metadata, every page and everything located on one, in order. The
 *  documents of the later runs are moved on in place. */
export function mergeRunDocuments(docs: readonly VDTDocument[]): VDTDocument {
  const first = docs[0]!;
  if (docs.length === 1) return first;
  let content = 0;
  let pages = 0;
  for (const doc of docs) {
    const end = contentEnd(doc);
    if (pages > 0) shiftDocument(doc, pages, content);
    content += end;
    pages += doc.pages.length;
  }
  const out: VDTDocument = { ...first, pages: [], blocks: [] };
  const warnings: NonNullable<VDTDocument['warnings']> = [];
  const contentWarnings: NonNullable<VDTDocument['contentWarnings']> = [];
  const indexMarks: NonNullable<VDTDocument['indexMarks']> = [];
  const anchors: NonNullable<VDTDocument['anchors']> = [];
  const restarts: number[] = [];
  const jumps: NonNullable<VDTDocument['pendingJumps']> = [];
  const carried: NonNullable<VDTDocument['carriedOutline']> = [];
  const partMarks: NonNullable<VDTDocument['partMarks']> = [];
  const exercises: NonNullable<VDTDocument['exercises']> = [];
  let converged = true;
  let iterationCount = 0;
  for (const doc of docs) {
    const by = out.pages.length;
    out.pages.push(...doc.pages);
    out.blocks.push(...doc.blocks);
    for (const w of doc.warnings ?? []) warnings.push(by === 0 ? w : { ...w, pageIndex: w.pageIndex + by });
    for (const w of doc.contentWarnings ?? []) contentWarnings.push(by === 0 || w.pageIndex === undefined ? w : { ...w, pageIndex: w.pageIndex + by });
    for (const m of doc.indexMarks ?? []) indexMarks.push({ ...m, pageIndex: m.pageIndex + by });
    for (const a of doc.anchors ?? []) anchors.push({ ...a, pageIndex: a.pageIndex + by });
    for (const r of doc.pageNumberRestarts ?? []) restarts.push(r + by);
    for (const c of doc.carriedOutline ?? []) carried.push({ ...c, pageIndex: c.pageIndex + by });
    jumps.push(...(doc.pendingJumps ?? []));
    partMarks.push(...(doc.partMarks ?? []));
    exercises.push(...(doc.exercises ?? []));
    converged &&= doc.converged;
    iterationCount += doc.iterationCount;
  }
  const last = docs[docs.length - 1]!;
  const set = <K extends keyof VDTDocument>(key: K, value: VDTDocument[K] | undefined, keep: boolean) => {
    if (keep && value !== undefined) out[key] = value;
    else delete out[key];
  };
  set('warnings', warnings, warnings.length > 0);
  set('contentWarnings', contentWarnings, contentWarnings.length > 0);
  set('indexMarks', indexMarks, indexMarks.length > 0);
  set('anchors', anchors, anchors.length > 0);
  set('pageNumberRestarts', restarts, restarts.length > 0);
  set('pendingJumps', jumps, jumps.length > 0);
  set('carriedOutline', carried, carried.length > 0);
  set('partMarks', partMarks, partMarks.length > 0);
  set('exercises', exercises, exercises.length > 0);
  set('lastLineNumber', last.lastLineNumber, true);
  set('afterPartPage', last.afterPartPage, true);
  out.converged = converged;
  out.iterationCount = iterationCount;
  return out;
}
