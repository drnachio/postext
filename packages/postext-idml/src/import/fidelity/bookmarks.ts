// Bookmarks as chapters.
//
// A flowing book is cut into chapters at its level-1 headings. A
// document with no heading style at all (every paragraph set by hand in
// one style) may still say where its parts start: its bookmarks. Each
// top-level bookmark that points into the main story (a text anchor, or
// a page the story stands on) then starts a chapter named after it.
//
// The bookmark's name becomes the chapter's title only: nothing is
// typed into the text, which keeps the words it had.

import type { OrderedStory } from '../../resolve/order.js';
import type { Chunk } from '../blocks.js';
import type { Context } from '../context.js';

/** Put a chapter start before the paragraph of the main story each
 *  top-level bookmark points at. `paragraphOfPage`: the paragraph the
 *  main story is taken to open a page with. Does nothing for a document
 *  that has level-1 headings. */
export function bookmarkChapters(ctx: Context, main: OrderedStory | undefined, insert: Map<number, (string | Chunk)[]>, paragraphOfPage: (page: number) => number | undefined): void {
  const doc = ctx.doc;
  if (!main || !doc.bookmarks.length) return;
  for (const l of ctx.looks.all.values()) if (l.paragraphs > 0 && l.role === 'heading' && (l.level ?? 1) === 1) return;
  const starts = new Map<number, { title: string; estimated: boolean }>();
  for (const b of doc.bookmarks.slice(0, 2000)) {
    const d = doc.destinations.get(b.destination);
    const title = b.name.replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!d || !title) continue;
    let at: number | undefined;
    let estimated = false;
    if (d.kind === 'text' || d.kind === 'paragraph') {
      const p = ctx.destinationParagraph.get(d.self);
      const n = p ? main.story.paragraphs.indexOf(p) : -1;
      if (n >= 0) at = n;
    } else if (d.kind === 'page') {
      const page = ctx.pageByRef(d.page);
      at = page ? paragraphOfPage(page.index) : undefined;
      estimated = true;
    }
    if (at !== undefined && !starts.has(at)) starts.set(at, { title, estimated });
  }
  if (!starts.size) return;
  for (const [at, s] of [...starts].sort((a, b) => a[0] - b[0])) {
    insert.set(at - 1, [...(insert.get(at - 1) ?? []), { kind: 'break', text: '', chapter: s.title }]);
    ctx.rep.add('bookmarkChapters', 'info', 'The document has no heading style: its bookmarks cut the book into chapters and name them (a bookmark on a page starts its chapter at the paragraph the page geometry suggests); no title is typed into the text', `${s.title}${s.estimated ? ' (by page)' : ''}`);
  }
}
