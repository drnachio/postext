/**
 * Maps VDT blocks to structure elements of the tagged PDF (see `tagging.ts`).
 *
 * Renderers call {@link StructureFlow.blockElem} for every block they paint,
 * in painting order (page by page, column by column — which is the reading
 * order). The flow keeps the grouping state that spans blocks:
 *   - lists: consecutive `listItem` blocks become `L` › `LI` › (`Lbl`, `LBody`),
 *     nested by `listDepth`; any other block closes the open lists;
 *   - callouts: a `callout` frame opens a `Div` that receives the blocks
 *     sharing its `containerId` (split fragments reuse the same `Div`); a
 *     nested box (`calloutPath`) is a `Div` inside its parent's;
 *   - headings: `H1`…`H6`, clamped so the level never skips (PDF/UA-1 §7.4);
 *   - fragments: a paragraph or list item split across columns / pages
 *     keeps one element (continuations carry the head's id plus a
 *     `-cont-N` suffix), so a reader sees one paragraph, not two.
 * Resource blocks (figures, tables) go through {@link resourceElem}, keyed
 * by resource id so the slices of a split table share one `Table`.
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

/** The id shared by every fragment of a block split across columns /
 *  pages: the head keeps the block id, continuations add `-cont-N`. */
function fragmentKey(block: VDTBlock): string {
  return block.id.replace(/-cont-\d+$/, '');
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
  private lastHeadingLevel = 0;

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
    // open lists; so does a box frame.
    if (div !== this.callout || block.type === 'callout') this.lists = [];
    this.callout = div;
    if (block.type !== 'listItem') this.lists = [];
    return div ?? this.tree.root;
  }

  private headingType(level: number): StructType {
    const clamped = Math.max(1, Math.min(6, level, this.lastHeadingLevel + 1));
    this.lastHeadingLevel = clamped;
    return HEADING[clamped - 1]!;
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
    switch (block.type) {
      case 'heading':
        elem = parent.child(this.headingType(block.headingLevel ?? 1));
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
        elem = parent.child('P');
    }
    this.byId.set(key, elem);
    return elem;
  }

  /** The `Lbl` of a list item's bullet / number, once {@link blockElem} ran. */
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

  /** Heading element for a part-divider page (`page.partInfo`). */
  partHeading(): StructElem {
    this.lists = [];
    this.callout = null;
    return this.tree.root.child(this.headingType(1));
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
    return elem;
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
}
