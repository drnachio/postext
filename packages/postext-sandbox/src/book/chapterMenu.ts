// The chapter menu and list of a long book: chapters grouped under the
// parts they belong to, and filtered by number or title. Pure.

import type { ChapterPart } from './types';

/** A book this long gets a filter field at the top of its chapter menu. */
export const CHAPTER_FILTER_MIN_CHAPTERS = 30;

export interface ChapterMenuSource {
  id: string;
  title: string;
  /** The chapter's number in the book (`ChapterPlan.number`), or null. */
  number: number | null;
  part?: ChapterPart;
}

export type ChapterMenuEntry =
  /** A part header: the chapters after it, up to the next header, belong
   *  to it. `firstIndex` is its first chapter in the book (what a click on
   *  the header opens), whether or not the filter shows it. */
  | { kind: 'part'; key: string; part: ChapterPart; firstIndex: number }
  | { kind: 'chapter'; index: number };

/** Two parts read the same (a part fence restating the open part). */
function samePart(a: ChapterPart | undefined, b: ChapterPart | undefined): boolean {
  return a === b || (!!a && !!b && a.number === b.number && a.title === b.title);
}

/** Text folded for matching: compatibility forms (fullwidth digits) and
 *  case aside. */
function fold(text: string): string {
  return text.normalize('NFKC').toLowerCase();
}

/** Whether a chapter answers the filter `query`: digits match the start of
 *  its number (`27`, `2` → 2, 20–29, 200…), any text a part of its title or
 *  of its part's number and title (`埋香`, `卷三`). */
export function chapterMatches(query: string, chapter: ChapterMenuSource): boolean {
  const q = fold(query.trim());
  if (q === '') return true;
  if (/^\d+$/.test(q) && chapter.number !== null && String(chapter.number).startsWith(q)) return true;
  if (fold(chapter.title).includes(q)) return true;
  return !!chapter.part && fold(`${chapter.part.number} ${chapter.part.title}`).includes(q);
}

/** The menu's entries: every chapter (those matching `query`), each run of
 *  chapters in one part under a header naming it. A book without parts, or
 *  the chapters before its first part, get no header. */
export function chapterMenuEntries(chapters: readonly ChapterMenuSource[], query = ''): ChapterMenuEntry[] {
  const out: ChapterMenuEntry[] = [];
  let open: ChapterPart | undefined;
  let openIndex = -1;
  let headerShown = false;
  chapters.forEach((chapter, index) => {
    if (!samePart(chapter.part, open)) {
      open = chapter.part;
      openIndex = index;
      headerShown = false;
    }
    if (!chapterMatches(query, chapter)) return;
    if (open && !headerShown) {
      out.push({ kind: 'part', key: `part-${openIndex}`, part: open, firstIndex: openIndex });
      headerShown = true;
    }
    out.push({ kind: 'chapter', index });
  });
  return out;
}

/** A part's header text: its number and title (`I · Sistema solar`, `卷一 ·
 *  …`), either alone when the other is blank. */
export function partLabel(part: ChapterPart): string {
  const number = part.number.trim();
  const title = part.title.trim();
  return number && title ? `${number} · ${title}` : number || title;
}
