/**
 * Maps VDT blocks to structure elements of the tagged PDF (see `tagging.ts`).
 *
 * Renderers call {@link StructureFlow.blockElem} for every block they paint,
 * in painting order (page by page, column by column — which is the reading
 * order). The flow keeps the grouping state that spans blocks:
 *   - lists: consecutive `listItem` blocks become `L` › `LI` › (`Lbl`, `LBody`),
 *     nested by `listDepth`; any other block closes the open lists;
 *   - contents: consecutive rows of a `:::toc` become one `TOC` with a
 *     `TOCI` per row: `Lbl` for a row's number, `Reference` for its title
 *     and page (the renderer adds the `Link` inside it);
 *   - callouts: a `callout` frame opens a `Div` that receives the blocks
 *     sharing its `containerId` (split fragments reuse the same `Div`); a
 *     nested box (`calloutPath`) is a `Div` inside its parent's;
 *   - headings: `H1`…`H6`, clamped so the level never skips (PDF/UA-1 §7.4)
 *     in reading order, floats included;
 *   - fragments: a paragraph or list item split across columns / pages
 *     keeps one element (continuations carry the head's id plus a
 *     `-cont-N` suffix), so a reader sees one paragraph, not two.
 * Resource blocks (figures, tables) go through {@link resourceElem}, keyed
 * by resource id so the slices of a split table share one `Table`.
 * The floats of a page (`page.floats`) are painted after its columns and go
 * through {@link readFloat}, which moves them to where they are read.
 */

import type { VDTBlock } from 'postext';
import type { StructAttrs, StructElem, StructTree, StructType } from './tagging';

interface OpenList {
  depth: number;
  kind: VDTBlock['listKind'];
  list: StructElem;
  /** Body of the last item, the parent of a nested list. */
  lastBody?: StructElem;
}

const HEADING: StructType[] = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'];

type Kid = StructElem['kids'][number];

/** The id shared by every fragment of a block split across columns /
 *  pages: the head keeps the block id, continuations add `-cont-N`. */
function fragmentKey(block: VDTBlock): string {
  return block.id.replace(/-cont-\d+$/, '');
}

/** A row of a `:::toc`: a listed heading or a part divider. */
function isTocRow(block: VDTBlock): boolean {
  return block.tocEntry !== undefined || block.tocPart !== undefined;
}

export class StructureFlow {
  private readonly byId = new Map<string, StructElem>();
  private readonly bulletById = new Map<string, StructElem>();
  private readonly calloutDivs = new Map<number, StructElem>();
  private readonly calloutTitles = new Map<number, StructElem>();
  private readonly resources = new Map<string, StructElem>();
  private readonly captions = new Map<StructElem, StructElem>();
  private lists: OpenList[] = [];
  private callout: StructElem | null = null;
  private toc: StructElem | null = null;
  private lastHeadingLevel = 0;
  /** Lowest level a heading may take. Above 1 only while a float is
   *  painted: see {@link readFloat}. */
  private headingFloor = 1;
  /** The level each heading element was tagged with. */
  private readonly headingLevels = new Map<StructElem, number>();
  /** The text blocks tagged so far, in reading order, with the content
   *  index each came from: where {@link readFloat} places a float. */
  private readonly flow: Array<{ index: number; elem: StructElem }> = [];
  /** The last float placed after each top-level element, so floats
   *  anchored to one paragraph keep their order. */
  private readonly lastPlacedAfter = new Map<StructElem, StructElem>();
  /** Set while a float is painted: its blocks are not part of the flow. */
  private floating = false;

  constructor(readonly tree: StructTree) {}

  /** The `Div` of a box — top-level `containerId`, then the nested boxes of
   *  `path` inside it — created on first use. */
  private calloutDiv(cid: number, path: readonly number[]): StructElem {
    let div = this.calloutDivs.get(cid);
    if (!div) {
      div = this.tree.root.child('Div');
      this.calloutDivs.set(cid, div);
    }
    for (const id of path) {
      let inner = this.calloutDivs.get(id);
      if (!inner) {
        inner = div.child('Div');
        this.calloutDivs.set(id, inner);
      }
      div = inner;
    }
    return div;
  }

  /** Enter the block's grouping context; returns the parent its element
   *  belongs to (the enclosing callout `Div`, else the document). */
  private enter(block: VDTBlock): StructElem {
    const cid = block.containerId;
    const div = cid !== undefined ? this.calloutDiv(cid, block.calloutPath ?? []) : null;
    // Entering or leaving a box (or moving between nested ones) closes the
    // open lists and contents; so does a box frame.
    if (div !== this.callout || block.type === 'callout') {
      this.lists = [];
      this.toc = null;
    }
    this.callout = div;
    const tocRow = isTocRow(block);
    // A numbered contents row is laid out as a list item, but is no list.
    if (block.type !== 'listItem' || tocRow) this.lists = [];
    if (!tocRow) this.toc = null;
    return div ?? this.tree.root;
  }

  /** A heading element under `parent`, its level clamped so it is at most
   *  one below the heading read before it. */
  private heading(parent: StructElem, level: number): StructElem {
    const clamped = Math.max(this.headingFloor, Math.min(6, level, this.lastHeadingLevel + 1));
    this.lastHeadingLevel = clamped;
    const elem = parent.child(HEADING[clamped - 1]!);
    this.headingLevels.set(elem, clamped);
    return elem;
  }

  /** Record a text block of the flow (not of a float) where floats can be
   *  read after it. */
  private record(block: VDTBlock, elem: StructElem): void {
    if (this.floating || block.contentIndex === undefined) return;
    this.flow.push({ index: block.contentIndex, elem });
  }

  /** The element that receives the block's own text (lines, overlay title).
   *  Not for `resource` blocks — see {@link resourceElem}. */
  blockElem(block: VDTBlock): StructElem {
    const key = fragmentKey(block);
    const known = this.byId.get(key);
    if (known) {
      // A later fragment of the same block: keep the grouping state in step
      // (a list item continuing on the next page must not reopen its list).
      this.enter(block);
      return known;
    }
    const parent = this.enter(block);
    let elem: StructElem;
    if (isTocRow(block)) {
      elem = this.tocItem(block, parent);
    } else {
      switch (block.type) {
        case 'heading':
          elem = this.heading(parent, block.headingLevel ?? 1);
          break;
        case 'listItem':
          elem = this.listItem(block, parent);
          break;
        case 'blockquote':
          elem = parent.child('BlockQuote').child('P');
          break;
        case 'mathDisplay':
          elem = parent.child('Formula', { alt: block.mathRender?.tex ?? block.tex ?? '' });
          break;
        case 'callout':
          elem = this.calloutTitle(block, parent);
          break;
        default:
          // A bibliography entry (#269): a paragraph holding a `BibEntry`.
          elem = block.footnoteNote !== undefined
            ? parent.child('Note', { id: `note-${block.footnoteNote}` })
            : block.bibEntry !== undefined
              ? parent.child('P').child('BibEntry')
              : parent.child('P');
      }
    }
    this.byId.set(key, elem);
    this.record(block, elem);
    return elem;
  }

  /** The `Lbl` of a list item's bullet / number (or of a contents row's
   *  number), once {@link blockElem} ran. */
  bulletElem(block: VDTBlock): StructElem | undefined {
    return this.bulletById.get(fragmentKey(block));
  }

  private listItem(block: VDTBlock, parent: StructElem): StructElem {
    const depth = block.listDepth ?? 1;
    while (this.lists.length > 0 && this.lists[this.lists.length - 1]!.depth > depth) this.lists.pop();
    let top = this.lists[this.lists.length - 1];
    // A list of another kind at the same depth (bullets, then numbers) is a
    // new list beside the previous one.
    if (top && top.depth === depth && top.kind !== block.listKind) {
      this.lists.pop();
      top = this.lists[this.lists.length - 1];
    }
    if (!top || top.depth < depth) {
      const listParent = top?.lastBody ?? parent;
      const numbering = block.listKind === 'ordered' ? 'Decimal' : block.listKind === 'task' ? 'None' : 'Disc';
      const list = listParent.child('L', { attributes: [{ owner: 'List', entries: { ListNumbering: numbering } }] });
      top = { depth, kind: block.listKind, list };
      this.lists.push(top);
    }
    const item = top.list.child('LI');
    if (block.bulletText) this.bulletById.set(fragmentKey(block), item.child('Lbl'));
    const body = item.child('LBody');
    top.lastBody = body;
    return body;
  }

  /** A contents row (EF-145): a `TOCI` in the open `TOC` (opened by the
   *  first row), its number a `Lbl`, its title and page a `Reference`. */
  private tocItem(block: VDTBlock, parent: StructElem): StructElem {
    this.toc ??= parent.child('TOC');
    const item = this.toc.child('TOCI');
    if (block.bulletText) this.bulletById.set(fragmentKey(block), item.child('Lbl'));
    return item.child('Reference');
  }

  /** Title paragraph of a callout frame (its design overlay text), keyed
   *  by the box's own id (the last of a nested frame's path). */
  private calloutTitle(block: VDTBlock, div: StructElem): StructElem {
    const cid = block.calloutPath?.[block.calloutPath.length - 1] ?? block.containerId ?? -1;
    let title = this.calloutTitles.get(cid);
    if (!title) {
      title = div.child('P');
      this.calloutTitles.set(cid, title);
    }
    return title;
  }

  /** The `Div` of a comic page (`page.comic`): its panels' figures and
   *  lettering go inside it, in reading order. Closes the open lists, box
   *  and contents. */
  comicPage(): StructElem {
    this.lists = [];
    this.callout = null;
    this.toc = null;
    return this.tree.root.child('Div');
  }

  /** Heading element for a part-divider page (`page.partInfo`). */
  partHeading(): StructElem {
    this.lists = [];
    this.callout = null;
    this.toc = null;
    return this.heading(this.tree.root, 1);
  }

  /** The `Figure` / `Table` element of a resource block, shared by the
   *  slices of a split table (keyed by resource id). */
  resourceElem(block: VDTBlock, type: 'Figure' | 'Table', attrs: StructAttrs): StructElem {
    const parent = this.enter(block);
    const key = block.resourceBlock?.resource.id ?? block.id;
    const known = this.resources.get(key);
    if (known) return known;
    const elem = parent.child(type, attrs);
    this.resources.set(key, elem);
    this.record(block, elem);
    return elem;
  }

  /** The `Figure` of a picture a design draws with alternative text
   *  (#213): beside `after` (the slot's text element: a chapter's heading
   *  for the plate its opener draws), so it is read right after it; at the
   *  document's end of the flow when the slot has no text. */
  designFigure(alt: string, attributes: StructAttrs['attributes'], after?: StructElem): StructElem {
    const parent = after?.parent ?? this.tree.root;
    return parent.child('Figure', { alt, ...(attributes ? { attributes } : {}) });
  }

  /** The `Caption` child of a figure / table (created once). */
  captionElem(owner: StructElem): StructElem {
    let cap = this.captions.get(owner);
    if (!cap) {
      cap = owner.child('Caption');
      this.captions.set(owner, cap);
    }
    return cap;
  }

  /** A block-level paragraph beside a resource (its note), in the
   *  resource's grouping context. */
  noteElem(block: VDTBlock): StructElem {
    return this.enter(block).child('P');
  }

  /** Run `paint` without touching the grouping state of the flow: the
   *  open lists, box and contents are as they were afterwards. For blocks
   *  painted out of reading order (floats, a contents part row drawn
   *  after its column), so a list or the contents going on after them
   *  stay one element. */
  aside(paint: () => void): void {
    const lists = this.lists;
    const callout = this.callout;
    const toc = this.toc;
    try {
      paint();
    } finally {
      this.lists = lists;
      this.callout = callout;
      this.toc = toc;
    }
  }

  /**
   * Tag a float of the page (a figure, a table, a floated box), painted by
   * `paint` after the page's columns, and read it where it belongs (EF-146):
   * right after the text block with the highest content index up to its
   * own (`block.contentIndex`: the paragraph that first cites a figure, the
   * text before a box's opening fence), on whatever page that block is. A
   * float that comes before all the text of its document is read first. The
   * elements the float adds to the document are moved as a group (a figure
   * and its note); the slices of a split table after the first add none.
   * The grouping state of the flow is kept (see {@link aside}).
   *
   * Headings inside the float (a floated box's title) are clamped where the
   * float is read, not where it is painted: at most one level deeper than
   * the heading before that place, and at most one level shallower than
   * the heading after it, so no level is skipped on either side.
   */
  readFloat(block: VDTBlock, paint: () => void): void {
    const root = this.tree.root;
    const at = block.contentIndex === undefined ? undefined : this.readingPlace(block.contentIndex);
    const place = at ?? root.kids.length;
    const before = this.lastHeadingIn(root.kids, place) ?? 0;
    const next = this.firstHeadingIn(root.kids, place);
    const flowLevel = this.lastHeadingLevel;
    const start = root.kids.length;
    this.floating = true;
    this.lastHeadingLevel = before;
    if (next !== undefined) this.headingFloor = Math.max(1, Math.min(next - 1, before + 1));
    try {
      this.aside(paint);
    } finally {
      this.floating = false;
      this.headingFloor = 1;
      // With a heading read after the float, the last heading read is
      // still the flow's own; without one, it is the float's (if any).
      if (next !== undefined) this.lastHeadingLevel = flowLevel;
    }
    if (at === undefined || root.kids.length === start) return;
    const added = root.kids.splice(start);
    root.kids.splice(at, 0, ...added);
    const anchor = this.anchorOf(block.contentIndex!);
    const lastAdded = added[added.length - 1]!;
    if (anchor && lastAdded.kind === 'elem') this.lastPlacedAfter.set(anchor, lastAdded.elem);
  }

  /** The top-level element of `elem` (its ancestor that is a kid of the
   *  document). */
  private topOf(elem: StructElem): StructElem {
    let top = elem;
    while (top.parent && top.parent !== this.tree.root) top = top.parent;
    return top;
  }

  private kidIndex(elem: StructElem): number {
    return this.tree.root.kids.findIndex((k) => k.kind === 'elem' && k.elem === elem);
  }

  /** The top-level element of the last text block tagged whose content
   *  index is at most `contentIndex`. */
  private anchorOf(contentIndex: number): StructElem | undefined {
    for (let i = this.flow.length - 1; i >= 0; i--) {
      if (this.flow[i]!.index <= contentIndex) return this.topOf(this.flow[i]!.elem);
    }
    return undefined;
  }

  /** Where, among the document's kids, a float with this content index is
   *  read: after its anchor and the floats already read after it, or ahead
   *  of the first block when it comes before all the text. */
  private readingPlace(contentIndex: number): number {
    const root = this.tree.root;
    const anchor = this.anchorOf(contentIndex);
    if (anchor) {
      const after = this.kidIndex(this.lastPlacedAfter.get(anchor) ?? anchor);
      return after >= 0 ? after + 1 : root.kids.length;
    }
    const first = this.flow[0] ? this.kidIndex(this.topOf(this.flow[0].elem)) : -1;
    return first >= 0 ? first : root.kids.length;
  }

  /** Level of the last heading in `kids[0, end)`, depth first. */
  private lastHeadingIn(kids: readonly Kid[], end = kids.length): number | undefined {
    for (let i = end - 1; i >= 0; i--) {
      const kid = kids[i]!;
      if (kid.kind !== 'elem') continue;
      const level = this.lastHeadingIn(kid.elem.kids) ?? this.headingLevels.get(kid.elem);
      if (level !== undefined) return level;
    }
    return undefined;
  }

  /** Level of the first heading in `kids[start, …)`, depth first. */
  private firstHeadingIn(kids: readonly Kid[], start = 0): number | undefined {
    for (let i = start; i < kids.length; i++) {
      const kid = kids[i]!;
      if (kid.kind !== 'elem') continue;
      const level = this.headingLevels.get(kid.elem) ?? this.firstHeadingIn(kid.elem.kids);
      if (level !== undefined) return level;
    }
    return undefined;
  }
}
