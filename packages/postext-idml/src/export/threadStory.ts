// The story of the book's thread (`thread.ts`, #1559), and the columns a
// page of it says it has.

import type { VDTPage } from 'postext';
import type { VDTDocument } from 'postext/writer';
import { paragraphsXml, storyPartXml } from './story.js';
import { segmentItems, threadLabel, type Thread } from './thread.js';
import type { Writer } from './writer.js';

/** Write the thread's story, a document after another: each document's
 *  running text in the settings of its own document, the last paragraph
 *  of each but the last ending in a page break (a chapter starts on a
 *  page of its own). Returns the label of the thread's first frame. */
export function threadStory(w: Writer, docs: readonly VDTDocument[], thread: Thread): string {
  const codes: string[] = [];
  w.joins = codes;
  const parts: string[] = [];
  const written = thread.segments.map((frames, d) => ({ d, items: segmentItems(frames, thread.anchors, thread.sideAnchors) })).filter((s) => s.items.length);
  written.forEach(({ d, items }, i) => {
    const doc = docs[d]!;
    w.doc = doc;
    w.k = 72 / doc.config.page.dpi;
    w.blockStyles.clear();
    // (Running text stands in no box of the flow, and on no vertical page.)
    delete w.callouts;
    delete w.page;
    if (i > 0) codes.push('p');
    parts.push(paragraphsXml(w, items, undefined, i < written.length - 1 ? 'NextPage' : undefined));
  });
  delete w.joins;
  w.stories.push({ id: thread.story, xml: storyPartXml(thread.story, parts.join('')) });
  return threadLabel(w, codes);
}

/** The text columns of a page's first band (pt): their count and the
 *  gutter between them, for the page's margin preferences. A page of a
 *  column-and-a-half book has a main column and a side column of their own
 *  widths: both are given, by their edges from the left of the type area
 *  (`positions`), so InDesign draws its guides where Postext set them and
 *  the importer finds the threaded frames following a column. */
export function pageColumns(page: VDTPage, k: number): { count: number; gutter: number; positions?: number[] } | undefined {
  const text = page.columns.filter((c) => (c.kind ?? 'text') === 'text');
  const band = text[0]?.band;
  const first = text.filter((c) => c.band === band).sort((a, b) => a.bbox.x - b.bbox.x);
  if (!first.length) return undefined;
  const side = page.columns.filter((c) => c.kind === 'side' && c.band === band);
  if (first.length === 1 && side.length === 1) {
    const both = [first[0]!, side[0]!].sort((a, b) => a.bbox.x - b.bbox.x);
    const left = both[0]!.bbox.x;
    const positions = both.flatMap((c) => [(c.bbox.x - left) * k, (c.bbox.x + c.bbox.width - left) * k]);
    return { count: 2, gutter: Math.max(0, positions[2]! - positions[1]!), positions };
  }
  const gutter = first.length > 1 ? Math.max(0, (first[1]!.bbox.x - first[0]!.bbox.x - first[0]!.bbox.width) * k) : 12;
  return { count: first.length, gutter };
}
