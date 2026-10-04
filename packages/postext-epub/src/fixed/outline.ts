// The book outline of a fixed layout: the headings of every page (and the
// part divider pages) as a nested table of contents, as the PDF backend
// derives its bookmarks (postext-pdf/src/pdf-backend/outlines.ts).

import { blockLinesText, plainTitleText } from 'postext';
import type { VDTBlock, VDTDocument, VDTPage } from 'postext';
import type { EpubNavPoint } from '../types';

/** Runs of white space as one space; the ideographic space (U+3000) of a
 *  Chinese title stays. */
const SPACES = /[^\S　]+/g;

/** A heading's name: its number and its title as written in the source
 *  (a letter-case transform is how the page prints it, not its name), else
 *  as its printed lines read back. */
export function headingTitle(block: VDTBlock): string {
  const number = block.numberPrefix?.replace(SPACES, ' ').trim() ?? '';
  const written = block.sourceTitle?.replace(SPACES, ' ').trim();
  if (written) return number ? `${number}${block.numberSeparator ?? ' '}${written}` : written;
  const raw = blockLinesText(block, { plainTitleBreaks: true }).replace(SPACES, ' ').trim();
  if (!raw) return '';
  return number && !raw.startsWith(number) ? `${number}${block.numberSeparator ?? ' '}${raw}` : raw;
}

/** One entry of the outline before nesting. `level` 0 is a part. */
export interface OutlineEntry {
  title: string;
  level: number;
  /** Where the entry points: a page file and, for a heading, the id of the
   *  anchor set at it. */
  file: string;
  anchorId?: string;
}

/** The headings of a page that go in the outline, in reading order. A
 *  level-1 heading whose style keeps it out of the running chapter and out
 *  of the contents (a plate set as a heading) is left out, as the PDF
 *  bookmarks leave it out. A heading continued from the previous column
 *  (`-cont-` id) is listed once, where it starts. */
export function pageHeadings(doc: VDTDocument, page: VDTPage): VDTBlock[] {
  const unlisted = new Set((doc.config.headingStyles ?? []).filter((s) => !s.runningChapter && !s.toc).map((s) => s.id));
  const out: VDTBlock[] = [];
  for (const col of page.columns) {
    for (const block of col.blocks) {
      if (block.type !== 'heading' || block.hidden || /-cont-\d+$/.test(block.id)) continue;
      if (block.notRunningChapter && block.headingStyleId && unlisted.has(block.headingStyleId)) continue;
      out.push(block);
    }
  }
  return out;
}

/** The part a divider page opens, as an outline entry title. */
export function partTitle(page: VDTPage): string | undefined {
  if (!page.partInfo) return undefined;
  const title = `${page.partInfo.number} ${plainTitleText(page.partInfo.title)}`.trim();
  return title || undefined;
}

/** Nest flat entries by level, as navigation points with hrefs relative to
 *  the package document (`dir` is the pages' directory, `pages/`). Levels
 *  never skip in the result: a level-3 heading right under a level-1 one
 *  nests one step down. */
export function nestOutline(entries: readonly OutlineEntry[], dir: string): EpubNavPoint[] {
  const roots: EpubNavPoint[] = [];
  const stack: { level: number; point: EpubNavPoint }[] = [];
  for (const e of entries) {
    const point: EpubNavPoint = { label: e.title, href: `${dir}${e.file}${e.anchorId ? `#${e.anchorId}` : ''}` };
    while (stack.length > 0 && stack[stack.length - 1]!.level >= e.level) stack.pop();
    const parent = stack[stack.length - 1]?.point;
    if (parent) (parent.children ??= []).push(point);
    else roots.push(point);
    stack.push({ level: e.level, point });
  }
  return roots;
}

/** A row of the printed contents and the book page it lists. */
export interface ContentsRow {
  block: VDTBlock;
  /** Book page index the row points at (`pt-p-<index>`). */
  pageIndex: number;
  /** What the row reads: a part's number and title, an entry's lines. */
  label: string;
}

/** Leader dots and runs of them between a title and its page number. */
const LEADERS = /(?:\s*[.·…․‥⋯]){3,}\s*/gu;

/** The rows of a page's printed contents that know their target page, as
 *  the PDF backend links them (blockRender.ts). */
export function contentsRows(page: VDTPage): ContentsRow[] {
  const out: ContentsRow[] = [];
  for (const col of page.columns) {
    for (const block of col.blocks) {
      if (block.hidden) continue;
      const pageIndex = block.tocEntry?.pageIndex ?? block.tocPart?.pageIndex;
      if (pageIndex === undefined) continue;
      const label = block.tocPart
        ? `${block.tocPart.number} ${plainTitleText(block.tocPart.title)}`
        : `${block.numberPrefix ?? ''} ${block.lines.map((l) => l.text).join(' ')}`;
      out.push({ block, pageIndex, label: label.replace(LEADERS, ' ').replace(SPACES, ' ').trim() });
    }
  }
  return out;
}
