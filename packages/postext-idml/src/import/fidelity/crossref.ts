// Cross-references as references of the book.
//
// An InDesign cross-reference is text InDesign generated from a format
// (building blocks: the target paragraph's text, the number of its page,
// words typed between them) and keeps up to date. Where its target is a
// paragraph or a text anchor the book sets, the reference is written as
// Postext references, which follow the book as InDesign's follow the
// document: the page number as `:ref{id="…" style=pageNumber}`, the
// text of a heading as `:ref{id="…" style=title}`. The words of the
// format stay as words; the text of a target that is no heading stays
// as generated (Postext names headings, not paragraphs) and links to it.
//
// A format with blocks the book has no reference for (a paragraph
// number, a chapter number, a file name), or generated text that does
// not match its format, keeps the generated text and a link.

import type { IdmlPageItem, IdmlParagraph, IdmlRun } from '../../model/document.js';
import type { OrderedStory } from '../../resolve/order.js';
import type { Context } from '../context.js';

/** A piece of a reference: words (linked to the target or not), or a
 *  directive written as it stands. */
export type ReferencePiece = { text: string; link: boolean } | { raw: string };

/** Where every text and paragraph destination of the text the book sets
 *  stands: the paragraph that holds it. Text the book leaves out (a
 *  condition switched off, a tracked deletion) holds none. Called once
 *  the looks have their roles. */
export function indexDestinations(ctx: Context, stories: readonly OrderedStory[]): void {
  const seen = new Set<object>();
  const walk = (paragraphs: readonly IdmlParagraph[], depth: number): void => {
    if (depth > 8) return;
    for (const p of paragraphs) {
      for (const r of p.runs) {
        if (!ctx.runPrinted(r)) continue;
        for (const i of r.content) {
          if (i.kind === 'destination') {
            if (!ctx.destinationParagraph.has(i.self)) ctx.destinationParagraph.set(i.self, p);
          } else if (i.kind === 'footnote' || i.kind === 'endnote') walk(i.paragraphs, depth + 1);
          else if (i.kind === 'table') for (const c of i.table.cells) walk(c.paragraphs, depth + 1);
          else if (i.kind === 'item') item(i.item, depth + 1);
        }
      }
    }
  };
  const item = (it: IdmlPageItem, depth: number): void => {
    const story = it.textFrame?.story ? ctx.doc.stories.get(it.textFrame.story) : undefined;
    if (story && !seen.has(story)) {
      seen.add(story);
      walk(story.paragraphs, depth);
    }
    for (const c of it.children) item(c, depth);
  };
  for (const e of stories) {
    if (seen.has(e.story)) continue;
    seen.add(e.story);
    walk(e.story.paragraphs, 0);
  }
  // A heading carries one id: the anchors that stand in one heading are
  // one anchor of the book, named after the text anchor among them (a
  // name its author gave) before a paragraph destination InDesign named.
  const inHeading = new Map<IdmlParagraph, string[]>();
  for (const [self, p] of ctx.destinationParagraph) {
    if (!ctx.anchorOf.has(self) || ctx.looks.of(p).role !== 'heading') continue;
    inHeading.set(p, [...(inHeading.get(p) ?? []), self]);
  }
  for (const group of inHeading.values()) {
    if (group.length < 2) continue;
    const named = group.find((self) => ctx.doc.destinations.get(self)?.kind === 'text') ?? group[0]!;
    const id = ctx.anchorOf.get(named)!;
    for (const self of group) ctx.anchorOf.set(self, id);
  }
}

const TEXT_BLOCKS = new Set(['FullParagraphBuildingBlock', 'ParagraphTextBuildingBlock']);

/** The runs of one cross-reference as pieces, or undefined when it stays
 *  the text InDesign generated. */
function pieces(ctx: Context, runs: readonly IdmlRun[]): ReferencePiece[] | undefined {
  const first = runs[0]!;
  const link = first.linkSource ? ctx.linkBySource.get(first.linkSource) : undefined;
  const dest = ctx.destination(link?.destination);
  if (!dest || (dest.kind !== 'text' && dest.kind !== 'paragraph')) return undefined;
  const id = ctx.anchorOf.get(dest.self);
  const target = ctx.destinationParagraph.get(dest.self);
  const format = first.crossReference?.format ? ctx.doc.crossReferenceFormats.get(first.crossReference.format) : undefined;
  if (!id || !target || !format?.blocks.length) return undefined;

  // The generated text, and where the page number (a text variable) stands in it.
  let generated = '';
  let pageAt = -1;
  for (const r of runs) {
    if (!ctx.runPrinted(r)) return undefined;
    for (const i of r.content) {
      if (i.kind === 'text') generated += i.text;
      else if (i.kind === 'variable') {
        if (pageAt >= 0) return undefined;
        pageAt = generated.length;
      } else if (i.kind !== 'special' || i.char !== 'endNestedStyle') return undefined;
    }
  }
  let fixed = 0;
  let open = 0;
  let pagesAsked = 0;
  for (const b of format.blocks) {
    if (b.type === 'CustomStringBuildingBlock') fixed += (b.text ?? '').length;
    else if (b.type === 'PageNumberBuildingBlock') pagesAsked++;
    else if (TEXT_BLOCKS.has(b.type) || b.type === 'BookmarkNameBuildingBlock') open++;
    else return undefined;
  }
  // One stretch of unknown length at most: the target's text, or a page
  // number written as text.
  if (open > 1 || pagesAsked > 1 || (pagesAsked === 1 && pageAt < 0 && open > 0) || fixed > generated.length) return undefined;
  const free = generated.length - fixed;
  if (open === 0 && pagesAsked === 0) return undefined;
  if (open === 0 && pageAt >= 0 && free !== 0) return undefined;

  const heading = ctx.looks.of(target).role === 'heading';
  const out: ReferencePiece[] = [];
  let at = 0;
  for (const b of format.blocks) {
    if (b.type === 'CustomStringBuildingBlock') {
      const n = (b.text ?? '').length;
      // The words as InDesign set them (its typographer's quotes).
      if (n) out.push({ text: generated.slice(at, at + n), link: false });
      at += n;
    } else if (b.type === 'PageNumberBuildingBlock') {
      if (pageAt >= 0 && pageAt !== at) return undefined;
      if (pageAt < 0) at += free;
      out.push({ raw: `:ref{id="${id}" style=pageNumber}` });
    } else {
      const words = generated.slice(at, at + free);
      at += free;
      if (heading && TEXT_BLOCKS.has(b.type)) out.push({ raw: `:ref{id="${id}" style=title}` });
      else if (words) out.push({ text: words, link: true });
    }
  }
  return at === generated.length ? out : undefined;
}

const reported = new WeakMap<Context, Set<string>>();

/** The cross-references of a paragraph: for the first run of each, its
 *  pieces; for its other runs, nothing (they are part of the first's).
 *  Runs of a reference that stays generated text are not in the map. */
export function crossReferences(ctx: Context, para: IdmlParagraph, sample: () => string): Map<IdmlRun, ReferencePiece[] | null> {
  const out = new Map<IdmlRun, ReferencePiece[] | null>();
  let seen = reported.get(ctx);
  if (!seen) reported.set(ctx, (seen = new Set()));
  for (let n = 0; n < para.runs.length; n++) {
    const run = para.runs[n]!;
    if (!run.crossReference || !run.linkSource) continue;
    let end = n;
    while (end + 1 < para.runs.length && para.runs[end + 1]!.crossReference && para.runs[end + 1]!.linkSource === run.linkSource) end++;
    const group = para.runs.slice(n, end + 1);
    const live = pieces(ctx, group);
    const fresh = !seen.has(run.linkSource);
    seen.add(run.linkSource);
    if (live) {
      out.set(run, live);
      for (const r of group.slice(1)) out.set(r, null);
      if (fresh) ctx.rep.add('crossReferenceLive', 'info', 'A cross-reference to a heading or an anchor of the book is written as Postext references: the page number, and a heading\'s title, follow the book; the words of its format are kept as typed', sample());
    } else if (fresh) {
      const format = run.crossReference.format ? ctx.doc.crossReferenceFormats.get(run.crossReference.format)?.name : undefined;
      ctx.rep.add('crossReferenceStatic', 'warning', 'A cross-reference whose format or target the book has no reference for (a paragraph number, a chapter number, another document) keeps the text InDesign generated, linked to its target where it is in the book: it does not update', `${format ? `${format}: ` : ''}${sample()}`);
    }
    n = end;
  }
  return out;
}
