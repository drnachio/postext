/**
 * Source edits behind the comic page tools of the previews (#568): a
 * dragged splitter, a panel split in two, two panels merged. Every edit is
 * a short list of text changes on the Markdown the layout was built from
 * (the composed book), each with the text it replaces, so the reducer can
 * refuse it when the chapter moved on since (`EDIT_CHAPTER_MARKDOWN`).
 *
 * Pure: no DOM, no state. The split grammar edits themselves are the
 * engine's (`moveComicSplitLine`, `splitComicCell`, `mergeComicCells`);
 * this module finds the page's `split` value in the text, writes it back
 * (inserting the attribute on a page that has none), and keeps the
 * `::panel` lines in step with the cells.
 */

import {
  comicSplitLeaves,
  comicSplitListAt,
  mergeComicCells,
  moveComicSplitLine,
  parseComicFence,
  serializeComicSplit,
  splitComicCell,
  type ComicPageSource,
  type ComicPanelSource,
  type ComicSplitAxis,
  type VDTComicPage,
  type VDTComicSplitter,
} from 'postext';
import { minimalChange, type TextChange } from '../../book/textChanges';

export type { TextChange } from '../../book/textChanges';

/** The `:::page` a laid-out comic page came from, read again from the
 *  Markdown the layout was built from; null when that text no longer
 *  holds it there. */
export function comicPageSourceAt(markdown: string, comic: Pick<VDTComicPage, 'sourceStart' | 'sourceEnd'>): ComicPageSource | null {
  const parsed = parseComicFence(markdown, comic.sourceStart);
  if (!parsed || parsed.source.sourceStart !== comic.sourceStart) return null;
  return parsed.source;
}

/** Where a page's `split` value lies in the text, and the value (the
 *  default stack of tiers when the page writes none). */
export interface ComicSplitValue {
  value: string;
  from: number;
  to: number;
  /** The page writes a `split` attribute (else `from === to` is where one
   *  goes: the end of the fence's attributes). */
  written: boolean;
  /** The written value sits inside quotes. */
  quoted: boolean;
}

export function comicSplitValue(markdown: string, source: ComicPageSource): ComicSplitValue {
  const range = source.attrSources.split;
  if (source.split !== undefined && range) {
    const q = markdown[range.start - 1];
    return { value: markdown.slice(range.start, range.end), from: range.start, to: range.end, written: true, quoted: (q === '"' || q === "'") && markdown[range.end] === q };
  }
  return { value: serializeComicSplit(source.splitParse.tree), from: source.attrsEnd, to: source.attrsEnd, written: false, quoted: false };
}

/** The changes that write `next` as the page's `split`: the least of the
 *  written value replaced (quotes added when it needs them), or a new
 *  attribute (with its braces when the fence has none). */
export function splitValueChanges(markdown: string, source: ComicPageSource, sv: ComicSplitValue, next: string): TextChange[] {
  if (next === sv.value && sv.written) return [];
  if (sv.written) {
    if (!sv.quoted && (next === '' || /[\s"'{}]/.test(next))) {
      return [{ from: sv.from, to: sv.to, insert: `"${next}"`, expect: sv.value }];
    }
    const change = minimalChange(sv.value, next, sv.from);
    return change ? [change] : [];
  }
  const attr = `split="${next}"`;
  if (markdown[sv.from] === '}') {
    const blob = markdown.slice(source.attrsStart, sv.from);
    const sep = blob.trim() === '' || /\s$/.test(blob) ? '' : ' ';
    return [{ from: sv.from, to: sv.from, insert: sep + attr, expect: '' }];
  }
  return [{ from: sv.from, to: sv.from, insert: `{${attr}}`, expect: '' }];
}

/** The changes that move a splitter: its line to `start` (and its far end
 *  to `end`, else keeping its slant), written into the page's `split`. */
export function moveSplitterChanges(
  markdown: string,
  comic: VDTComicPage,
  splitter: Pick<VDTComicSplitter, 'path' | 'boundary'>,
  start: number,
  end?: number,
): TextChange[] | null {
  const source = comicPageSourceAt(markdown, comic);
  if (!source) return null;
  const sv = comicSplitValue(markdown, source);
  const next = moveComicSplitLine(sv.value, splitter.path, splitter.boundary, start, end);
  if (next === sv.value) return [];
  return splitValueChanges(markdown, source, sv, next);
}

/** What a laid-out panel is in its page's source: the `::panel` it was
 *  set from (none for a cell no panel filled), and the cell it fills in
 *  reading order (none for an inset panel, which sits over another). */
export interface ComicPanelSlot {
  panel?: ComicPanelSource;
  cell?: number;
}

/** The slot of every panel of a laid-out page (`comic.panels` order). */
export function comicPanelSlots(comic: VDTComicPage, source: ComicPageSource): ComicPanelSlot[] {
  const bySource = new Map(source.panels.map((p) => [p.sourceStart, p]));
  let cell = 0;
  return comic.panels.map((vp) => {
    const p = bySource.get(vp.sourceStart);
    if (p?.attrs.inset) return { panel: p };
    return { ...(p ? { panel: p } : {}), cell: cell++ };
  });
}

/** The first line after a panel's block that the next flowing panel (or
 *  the closing fence) starts on: where a new `::panel` goes so that it
 *  fills the cell after this one, the insets of this panel staying with
 *  it. */
function nextPanelLineStart(markdown: string, source: ComicPageSource, panel: ComicPanelSource): number {
  const next = source.panels.find((p) => p.index > panel.index && !p.attrs.inset);
  if (next) return next.lineStart;
  if (source.closed) return markdown.lastIndexOf('\n', source.sourceEnd - 1) + 1;
  return source.sourceEnd;
}

/** The start of the line after `at` (past its newline), or `at` at the end
 *  of the text. */
function afterLine(markdown: string, at: number): number {
  const nl = markdown.indexOf('\n', at);
  return nl < 0 ? markdown.length : nl + 1;
}

interface PanelContext {
  source: ComicPageSource;
  slots: ComicPanelSlot[];
  slot: ComicPanelSlot;
  leaf: number[];
  sv: ComicSplitValue;
}

function panelContext(markdown: string, comic: VDTComicPage, panelIndex: number): PanelContext | null {
  const source = comicPageSourceAt(markdown, comic);
  if (!source) return null;
  const slots = comicPanelSlots(comic, source);
  const slot = slots[panelIndex];
  if (!slot || slot.cell === undefined) return null;
  const leaf = comicSplitLeaves(source.splitParse.tree)[slot.cell];
  if (!leaf) return null;
  return { source, slots, slot, leaf, sv: comicSplitValue(markdown, source) };
}

/** Whether a panel can be split (a panel that fills a cell; not an inset). */
export function canSplitPanel(markdown: string, comic: VDTComicPage, panelIndex: number): boolean {
  return panelContext(markdown, comic, panelIndex) !== null;
}

/**
 * The changes that split a panel's cell in two along `axis` (`'rows'`: a
 * horizontal line, one panel above the other) and add an empty `::panel`
 * for the new cell, which comes right after this one in reading order.
 * Null when the panel fills no cell (an inset) or the page is gone.
 */
export function splitPanelChanges(markdown: string, comic: VDTComicPage, panelIndex: number, axis: ComicSplitAxis): TextChange[] | null {
  const ctx = panelContext(markdown, comic, panelIndex);
  if (!ctx) return null;
  const { source, slot, leaf, sv } = ctx;
  const next = splitComicCell(sv.value, leaf, axis);
  if (next === sv.value) return null;
  const changes = splitValueChanges(markdown, source, sv, next);
  // A cell no panel filled: the new one is empty too, no line to add.
  if (slot.panel) {
    const at = nextPanelLineStart(markdown, source, slot.panel);
    const lead = at > 0 && markdown[at - 1] !== '\n' ? '\n' : '';
    changes.push({ from: at, to: at, insert: `${lead}::panel\n`, expect: '' });
  }
  return changes;
}

/** The split line a panel shares with the next cell of its list, when
 *  that cell is a single panel (not split further). */
function mergeTarget(ctx: PanelContext): { path: number[]; boundary: number; next?: ComicPanelSource } | null {
  const path = ctx.leaf.slice(0, -1);
  const k = ctx.leaf[ctx.leaf.length - 1]!;
  const list = comicSplitListAt(ctx.source.splitParse.tree, path);
  const sibling = list?.items[k + 1];
  if (!list || !sibling || (sibling.children && sibling.children.items.length > 0)) return null;
  const nextSlot = ctx.slots.find((s) => s.cell === ctx.slot.cell! + 1);
  return { path, boundary: k, ...(nextSlot?.panel ? { next: nextSlot.panel } : {}) };
}

/** Whether a panel has a next sibling to merge with. */
export function canMergeNext(markdown: string, comic: VDTComicPage, panelIndex: number): boolean {
  const ctx = panelContext(markdown, comic, panelIndex);
  return ctx !== null && mergeTarget(ctx) !== null;
}

/**
 * The changes that merge a panel with the next cell of its list: the split
 * line between them goes, and the merged panel keeps the first panel's
 * attributes (its art) and takes the script lines of both, the second
 * panel's `::panel` line removed. Null when there is no such cell.
 */
export function mergePanelChanges(markdown: string, comic: VDTComicPage, panelIndex: number): TextChange[] | null {
  const ctx = panelContext(markdown, comic, panelIndex);
  if (!ctx) return null;
  const target = mergeTarget(ctx);
  if (!target) return null;
  const { source, sv } = ctx;
  const next = mergeComicCells(sv.value, target.path, target.boundary);
  if (next === sv.value) return null;
  const changes = splitValueChanges(markdown, source, sv, next);
  const first = ctx.slot.panel;
  const second = target.next;
  if (first && second && !second.implicit) {
    const lineEnd = afterLine(markdown, second.lineEnd);
    const between = source.panels.some((p) => p.index > first.index && p.index < second.index);
    if (!between) {
      // The second panel's script follows the first's: dropping its
      // `::panel` line hands its lines to the first.
      changes.push({ from: second.lineStart, to: lineEnd, insert: '', expect: markdown.slice(second.lineStart, lineEnd) });
    } else {
      // Insets of the first panel sit between: the script moves up under
      // the first panel's own lines.
      const blockEnd = Math.max(lineEnd, afterLine(markdown, second.sourceEnd));
      let script = markdown.slice(lineEnd, blockEnd);
      if (script !== '' && !script.endsWith('\n')) script += '\n';
      changes.push({ from: second.lineStart, to: blockEnd, insert: '', expect: markdown.slice(second.lineStart, blockEnd) });
      if (script.trim() !== '') {
        const at = afterLine(markdown, first.sourceEnd);
        changes.push({ from: at, to: at, insert: script, expect: '' });
      }
    }
  }
  return changes;
}
