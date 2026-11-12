/**
 * A chapter set in sections of their own style (`::section{style="…"}`):
 * each section is laid out as a document of its own, from a new page, and
 * the documents are joined back into the chapter's — pages one after the
 * other, every page index of the later ones moved on by the pages before
 * them. Source offsets need no moving: every section was laid out from the
 * whole chapter's source, the rest of it blanked.
 */

import type { LayoutContinuation, PostextContent } from '../../types.js';
import type { VDTDocument, VDTPage } from '../../vdt.js';
import type { SectionBreak } from '../../defaults/chapterStyles.js';

/** One section's source: the chapter's, every character outside
 *  `[from, to)` but the line breaks a space, so offsets and line numbers
 *  stay the chapter's. The first section's range holds the front matter. */
export function sectionSource(markdown: string, from: number, to: number): string {
  const blank = (s: string) => s.replace(/[^\n\r]/g, ' ');
  return blank(markdown.slice(0, from)) + markdown.slice(from, to) + blank(markdown.slice(to));
}

/** The ranges of a chapter's sections: before the first break, then from
 *  each break's line to the next. Ranges with nothing but blank lines and
 *  the front matter are left out. */
export function sectionRanges(markdown: string, breaks: readonly SectionBreak[], bodyStart: number): { from: number; to: number; style?: string; inherit: boolean }[] {
  const out: { from: number; to: number; style?: string; inherit: boolean }[] = [];
  const push = (from: number, to: number, style: string | undefined, inherit: boolean) => {
    if (markdown.slice(Math.max(from, bodyStart), to).trim() === '') return;
    out.push({ from, to, ...(style ? { style } : {}), inherit });
  };
  push(0, breaks[0]?.start ?? markdown.length, undefined, true);
  breaks.forEach((b, i) => push(b.end, breaks[i + 1]?.start ?? markdown.length, b.style, false));
  return out;
}

/** The continuation of the section after `doc`, laid out as `before` went
 *  on through `counters`: its pages after `doc`'s, its numbering after
 *  `doc`'s last page. */
export function nextSectionContinuation(doc: VDTDocument, counters: LayoutContinuation, content: PostextContent): LayoutContinuation {
  const last = doc.pages[doc.pages.length - 1];
  const { pageIndexOffset: _offset, pageNumbering: _numbering, ...rest } = counters;
  void _offset;
  void _numbering;
  return {
    ...rest,
    pageIndexOffset: (doc.pageIndexOffset ?? 0) + doc.pages.length,
    ...(last ? { pageNumbering: { startAt: last.pageNumberValue + 1, format: last.pageNumberFormat } } : {}),
    ...(content.continuation?.bookPageCount !== undefined ? { bookPageCount: content.continuation.bookPageCount } : {}),
    ...(doc.lastLineNumber !== undefined ? { lineNumber: doc.lastLineNumber } : {}),
  };
}

function shiftPage(page: VDTPage, by: number): VDTPage {
  const floats = page.floats?.map((b) => ({ ...b, pageIndex: b.pageIndex + by }));
  return { ...page, index: page.index + by, ...(floats ? { floats } : {}) };
}

/** The sections' documents joined into the chapter's: the first's settings
 *  and metadata, every page and everything located on one in order. */
export function mergeSectionDocuments(docs: readonly VDTDocument[]): VDTDocument {
  const first = docs[0]!;
  if (docs.length === 1) return first;
  const out: VDTDocument = { ...first, pages: [], blocks: [] };
  const warnings: NonNullable<VDTDocument['warnings']> = [];
  const contentWarnings: NonNullable<VDTDocument['contentWarnings']> = [];
  const indexMarks: NonNullable<VDTDocument['indexMarks']> = [];
  const anchors: NonNullable<VDTDocument['anchors']> = [];
  const restarts: number[] = [];
  const jumps: NonNullable<VDTDocument['pendingJumps']> = [];
  const carried: NonNullable<VDTDocument['carriedOutline']> = [];
  const partMarks: NonNullable<VDTDocument['partMarks']> = [];
  let converged = true;
  let iterationCount = 0;
  for (const doc of docs) {
    const by = out.pages.length;
    for (const page of doc.pages) out.pages.push(by === 0 ? page : shiftPage(page, by));
    for (const block of doc.blocks) out.blocks.push(by === 0 ? block : { ...block, pageIndex: block.pageIndex + by });
    for (const w of doc.warnings ?? []) warnings.push(by === 0 ? w : { ...w, pageIndex: w.pageIndex + by });
    for (const w of doc.contentWarnings ?? []) contentWarnings.push(by === 0 || w.pageIndex === undefined ? w : { ...w, pageIndex: w.pageIndex + by });
    for (const m of doc.indexMarks ?? []) indexMarks.push({ ...m, pageIndex: m.pageIndex + by });
    for (const a of doc.anchors ?? []) anchors.push({ ...a, pageIndex: a.pageIndex + by });
    for (const r of doc.pageNumberRestarts ?? []) restarts.push(r + by);
    for (const c of doc.carriedOutline ?? []) carried.push({ ...c, pageIndex: c.pageIndex + by });
    jumps.push(...(doc.pendingJumps ?? []));
    partMarks.push(...(doc.partMarks ?? []));
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
  set('lastLineNumber', last.lastLineNumber, true);
  set('afterPartPage', last.afterPartPage, true);
  out.converged = converged;
  out.iterationCount = iterationCount;
  return out;
}
