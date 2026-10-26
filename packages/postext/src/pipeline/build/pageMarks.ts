// Page marks and carried stories: the labels `{page:…}` and jump marks
// print, and the source chapter of blocks laid from other chapters
// (#1276: split out of build.ts).
import type { PostextContent } from '../../types.js';
import { parseMarkdownMemo } from '../../parse/index.js';
import type { VDTDocument, VDTComposedPage, VDTPage, VDTFrame, VDTDesignTextBlock, VDTAnchor } from '../../vdt.js';
import { extractFrontmatter } from '../../parse/frontmatter.js';
import { measureRichBlock } from '../../measure/index.js';
import { locateAnchors } from '../references/anchors.js';
import { locateCarriedOutline } from '../references/carriedOutline.js';
import type { ImportedJumps } from '../../composed/carry.js';
import { locateIndexMarks } from '../contents/indexDirective.js';
import { codeParseOptions } from '../code/codeBlocks.js';

/**
 * Mark the blocks laid from stories that came in from other chapters
 * (#943): `VDTBlock.sourceChapter` says whose file their source offsets
 * are offsets in.
 */
export function stampCarriedSource(doc: VDTDocument, carried: ImportedJumps, fenceEnd: ReadonlyMap<VDTComposedPage, number>): void {
  const stories = [...carried.stories.values()];
  const noteChapter = new Map(carried.footnotes.map((n) => [n.id, n.chapter]));
  for (const block of doc.blocks) {
    const note = block.footnoteNote !== undefined ? noteChapter.get(block.footnoteNote) : undefined;
    if (note !== undefined) block.sourceChapter = note;
    const at = block.contentIndex;
    if (at === undefined) continue;
    const story = stories.find((st) => at >= st.startIdx && at <= st.endIdx);
    if (story) block.sourceChapter = story.chapter;
  }
  // The frames that set a carried story's text: the box (a block of the
  // frame) says whose it is.
  for (const page of doc.pages) {
    for (const frame of page.composed?.frames ?? []) {
      const box = frame.blockIds.length > 0 ? page.floats?.find((b) => b.id === frame.blockIds[0]) : undefined;
      if (box?.sourceChapter === undefined) continue;
      frame.sourceChapter = box.sourceChapter;
      const end = fenceEnd.get(page.composed!);
      if (end !== undefined) frame.readIndex = end + 0.5;
    }
  }
}

/**
 * Write the page numbers into the continuation marks of composed pages'
 * frames (#917, `VDTDesignTextBlock.pageMark`): `{page}` becomes the label
 * of the page the frame's rest goes on on (`continuesTo`) or comes from
 * (`continuedFrom`). The mark was laid out with a guess of the number; its
 * lines are measured again with the true one and keep their alignment.
 */
export function fillPageMarks(pages: readonly VDTPage[]): void {
  const frames = new Map<string, VDTPage>();
  for (const p of pages) for (const f of p.composed?.frames ?? []) if (!f.facingBlocks) frames.set(f.id, p);
  forEachPageMark(pages, (f, d) => {
    // A page of another chapter is `resolveJumpMarks`'s (its frame ids are
    // another chapter's).
    if ((d.pageMark!.page === 'to' ? f.continuesToChapter : f.continuedFromChapter) !== undefined) return undefined;
    const other = d.pageMark!.page === 'to' ? f.continuesTo : f.continuedFrom;
    const at = other !== undefined ? frames.get(other) : undefined;
    return at ? pageLabelOf(at) : undefined;
  });
}

/** The label a page prints. */
const pageLabelOf = (page: VDTPage): string => page.pageLabel ?? String(page.pageNumberValue ?? page.index + 1);

/** Each continuation mark with a page number of `pages`' composed frames,
 *  with `label` answering for the page it names: the mark's text is laid
 *  out again with the number when it answers. */
function forEachPageMark(
  pages: readonly VDTPage[],
  label: (frame: VDTFrame, mark: VDTDesignTextBlock) => string | undefined,
): void {
  for (const p of pages) {
    for (const f of p.composed?.frames ?? []) {
      for (const id of f.blockIds) {
        const box = p.floats?.find((b) => b.id === id);
        for (const d of box?.designOverlay?.blocks ?? []) {
          if (d.kind !== 'text' || !d.pageMark) continue;
          const shown = label(f, d);
          if (shown === undefined) continue;
          const text = d.pageMark.text.split('{page}').join(shown);
          const lh = d.lines.length > 0 ? d.bbox.height / d.lines.length : d.bbox.height;
          const first = d.lines[0];
          const slack0 = first ? d.bbox.width - first.width : 0;
          const align = !first || first.xOffset < 0.5 ? 'left' : Math.abs(first.xOffset - slack0) < 0.5 ? 'right' : 'center';
          const base = first ? first.baselineY - d.bbox.y : lh * 0.8;
          const { lines } = measureRichBlock([{ text, bold: false, italic: false }], d.fontString, d.fontString, d.fontString, d.fontString, d.bbox.width, lh, { textAlign: 'left' });
          if (lines.length === 0) continue;
          d.lines = lines.map((ln, i) => {
            const slack = Math.max(0, d.bbox.width - ln.bbox.width);
            return { text: ln.text, xOffset: align === 'right' ? slack : align === 'center' ? slack / 2 : 0, baselineY: d.bbox.y + base + i * lh, width: ln.bbox.width };
          });
        }
      }
    }
  }
}

/**
 * Link the stories that jump from one chapter to a page of another (#943)
 * and write the page numbers into their continuation marks. `docs` is the
 * book laid out, one document per chapter, in the order of the book (a
 * story's `chapter` is its position in it): the sending frame gets the
 * frame that took the rest (`continuesTo`, its `continued` event the page
 * and frame there), and every mark naming a page of another chapter
 * prints that page's label as its chapter numbered it. Marks within a
 * chapter were filled by its own build. Safe to run again on the same
 * documents.
 */
export function resolveJumpMarks(docs: readonly VDTDocument[]): void {
  const byId = docs.map((doc) => {
    const out = new Map<string, VDTPage>();
    for (const p of doc.pages) for (const f of p.composed?.frames ?? []) if (!f.facingBlocks) out.set(f.id, p);
    return out;
  });
  const frameOf = (chapter: number, id: string): { page: VDTPage; frame: VDTFrame } | undefined => {
    const page = byId[chapter]?.get(id);
    const frame = page?.composed?.frames.find((f) => f.id === id);
    return page && frame ? { page, frame } : undefined;
  };
  // The receiving frames name where their story came from; give the
  // sending frame the way on.
  docs.forEach((doc) => {
    for (const p of doc.pages) {
      for (const f of p.composed?.frames ?? []) {
        if (f.continuedFromChapter === undefined || f.continuedFrom === undefined) continue;
        const from = frameOf(f.continuedFromChapter, f.continuedFrom);
        if (!from) continue;
        from.frame.continuesTo = f.id;
        const event = from.page.composed!.log.find((e) => e.kind === 'continued' && e.frame === from.frame.name && e.toChapter !== undefined);
        if (event) {
          event.toPage = p.index;
          event.toFrame = f.id;
        }
      }
    }
  });
  docs.forEach((doc) => {
    forEachPageMark(doc.pages, (f, d) => {
      const [chapter, id] = d.pageMark!.page === 'to' ? [f.continuesToChapter, f.continuesTo] : [f.continuedFromChapter, f.continuedFrom];
      if (chapter === undefined || id === undefined) return undefined;
      const at = byId[chapter]?.get(id);
      return at ? pageLabelOf(at) : undefined;
    });
  });
}

/** The stories carried into a document (#943) and its body offset, for
 *  `withIndexMarks`: the marks, anchors and headings written in them are
 *  located once the pages are final (#988). */
export const carriedByDoc = new WeakMap<VDTDocument, { carried: ImportedJumps; bodyOffset: number }>();

/** `doc` with the page of each of its index marks (`doc.indexMarks`). */
export function withIndexMarks(doc: VDTDocument, content: PostextContent): VDTDocument {
  const came = carriedByDoc.get(doc);
  if (came) {
    const located = locateCarriedOutline(doc, came.carried, came.bodyOffset);
    if (located.length > 0) doc.carriedOutline = located;
  }
  const { content: body, contentOffset } = extractFrontmatter(content.markdown);
  const blocks = parseMarkdownMemo(body, codeParseOptions(doc.config));
  if (content.markdown.includes(':index')) {
    const marks = locateIndexMarks(doc, blocks, contentOffset);
    if (marks) doc.indexMarks = marks;
  }
  // Where every anchor landed (#261), for links and page references.
  const anchors = locateAnchors(doc, blocks, contentOffset);
  if (anchors) doc.anchors = anchors;
  // The anchors written in a story that came in are destinations here, on
  // the page of the words (#988).
  const known = new Set((doc.anchors ?? []).map((a) => `${a.kind}:${a.id}`));
  const carriedAnchors = (doc.carriedOutline ?? []).flatMap((c): VDTAnchor[] => (c.anchor && !known.has(`${c.kind === 'heading' ? 'heading' : 'anchor'}:${c.anchor.id}`) ? [{ id: c.anchor.id, kind: c.kind === 'heading' ? 'heading' : 'anchor', pageIndex: c.pageIndex, x: c.anchor.x, y: c.anchor.y, sourceStart: c.sourceStart, chapter: c.chapter }] : []));
  if (carriedAnchors.length > 0) doc.anchors = [...(doc.anchors ?? []), ...carriedAnchors];
  return doc;
}
