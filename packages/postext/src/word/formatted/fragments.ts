// Export map fragments of the formatted Word export (#1392): every
// importable piece of text (a chunk of a text item, a table cell) is
// wrapped in a hidden `_ptx_` bookmark and described by a MapFragment in
// reading order (page by page, boxes in paint order). Generated text
// (running heads, folios, numbers, contents rows) gets neither.

import type { DisplayItem, DisplaySource } from '../../paint/displayList/types.js';
import type { FragmentTarget, MapFormat, MapFragment } from '../anchors/types.js';
import { bookmarkEndXml, bookmarkName, bookmarkStartXml, newFragmentId } from '../anchors/bookmarks.js';
import { mapRoleOf } from './styles.js';
import type { TextOut } from './paragraphs.js';
import type { WriterContext } from './types.js';

type TextItem = Extract<DisplayItem, { kind: 'text' }>;

/** Whether an item's text goes back to a source on import. */
export function isImportable(item: TextItem): item is TextItem & { source: DisplaySource } {
  return item.source !== undefined && !item.source.generated && item.source.map.some((m) => m >= 0);
}

/** The chapter index a source's offsets point into. */
export function chapterIndexOf(ctx: WriterContext, source: DisplaySource): number {
  if (source.chapter === undefined) return ctx.docIndex;
  const byId = ctx.chapters.findIndex((c) => c.id === source.chapter);
  if (byId >= 0) return byId;
  const n = Number(source.chapter);
  return Number.isInteger(n) && n >= 0 && n < ctx.chapters.length ? n : ctx.docIndex;
}

function targetOf(ctx: WriterContext, source: DisplaySource): FragmentTarget {
  const r = source.resource;
  if (r) {
    ctx.referenced.add(r.resourceId);
    return { kind: 'resource', resourceId: r.resourceId, field: r.field, ...(r.row !== undefined ? { row: r.row } : {}), ...(r.col !== undefined ? { col: r.col } : {}) };
  }
  return { kind: 'markdown', chapter: chapterIndexOf(ctx, source) };
}

function blockOf(target: FragmentTarget, source: DisplaySource): string {
  if (target.kind === 'resource') return `${source.blockKey}:${target.field}${target.row !== undefined ? `:${target.row}:${target.col ?? 0}` : ''}`;
  if (target.kind === 'markdown') return `c${target.chapter}:${source.blockKey}`;
  return source.blockKey;
}

/** A reserved fragment: its id and the bookmark tags to write around it. */
export interface FragmentSlot {
  id: string;
  start: string;
  end: string;
}

export function reserveFragment(ctx: WriterContext): FragmentSlot {
  const id = newFragmentId(ctx.nextFragment++);
  const bm = ctx.pkg.nextBookmarkId();
  return { id, start: bookmarkStartXml(bm, bookmarkName(id)), end: bookmarkEndXml(bm) };
}

/** Record the fragment a slot's text became. */
export function recordFragment(ctx: WriterContext, slot: FragmentSlot, item: TextItem & { source: DisplaySource }, out: TextOut): void {
  const source = item.source;
  const target = targetOf(ctx, source);
  const block = blockOf(target, source);
  const part = ctx.parts.get(block) ?? 0;
  ctx.parts.set(block, part + 1);
  // Atoms of the lines written, shifted to this fragment's text.
  const atoms: NonNullable<MapFragment['atoms']> = [];
  for (const a of source.atoms ?? []) {
    const ls = out.lineStarts.find((l) => a.at >= l.item && a.at < l.item + l.length);
    if (ls) atoms.push({ ...a, at: ls.out + (a.at - ls.item) });
  }
  atoms.push(...out.atoms);
  atoms.sort((x, y) => x.at - y.at);
  let lo = Infinity;
  let hi = -Infinity;
  for (const m of out.map) {
    if (m < 0) continue;
    if (m < lo) lo = m;
    if (m + 1 > hi) hi = m + 1;
  }
  for (const a of atoms) {
    lo = Math.min(lo, a.start);
    hi = Math.max(hi, a.end);
  }
  const fragment: MapFragment = {
    id: slot.id,
    block,
    part,
    target,
    text: out.text,
    map: out.map,
    range: lo <= hi ? [lo, hi] : [0, 0],
    role: mapRoleOf(item),
  };
  if (atoms.length) fragment.atoms = atoms;
  const formats: MapFormat[] = out.formats;
  if (formats.length) fragment.formats = formats;
  ctx.fragments.push(fragment);
}
