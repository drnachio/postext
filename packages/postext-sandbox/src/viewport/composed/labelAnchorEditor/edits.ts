// The edits a label drag writes: an anchor or a label moved, a percent
// place, a dropped label and the picture opened for a label (#1276: split
// out of labelAnchorEditor.ts).
import type { MutableRefObject, Dispatch } from 'react';
import type { Resource } from 'postext';
import type { SandboxAction } from '../../../context/SandboxContext.js';
import type { ComposedBook } from '../../../book/types.js';
import { segmentAtOffset } from '../../../book/compose.js';
import { applyViewerEdit } from '../../../editor/viewerEdits.js';
import { templateEditorHost } from '../../../templates/editorStore.js';
import { type PageLabel, sheetToPicture } from '../labelAnchorGeometry.js';
import type { LabelAnchorEditorRefs } from './types.js';

/** `resource` with anchor `id` moved to `(x, y)` (fractions, kept inside
 *  the picture, four decimals as the anchor editor stores them). */
export function withAnchorMoved(resource: Resource, id: string, x: number, y: number, now = Date.now()): Resource | null {
  const anchors = resource.anchors ?? [];
  const i = anchors.findIndex((a) => a.id === id);
  if (i < 0) return null;
  const round = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 10000) / 10000;
  const nx = round(x);
  const ny = round(y);
  if (anchors[i]!.x === nx && anchors[i]!.y === ny) return null;
  return { ...resource, anchors: anchors.map((a, k) => (k === i ? { ...a, x: nx, y: ny } : a)), updatedAt: now };
}

/** `resource` with the label of anchor `id` set at `(x, y)` away from its
 *  point (`labelAt`, #1064; fractions of the whole picture, four decimals,
 *  not kept inside it: a label may stand off the picture). */
export function withLabelAtMoved(resource: Resource, id: string, x: number, y: number, now = Date.now()): Resource | null {
  const anchors = resource.anchors ?? [];
  const i = anchors.findIndex((a) => a.id === id);
  if (i < 0 || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const round = (v: number) => Math.round(v * 10000) / 10000;
  const at = { x: round(x), y: round(y) };
  const before = anchors[i]!.labelAt;
  if (before && before.x === at.x && before.y === at.y) return null;
  return { ...resource, anchors: anchors.map((a, k) => (k === i ? { ...a, labelAt: at } : a)), updatedAt: now };
}

/** `x% y%` as `at="…"` writes a place: fractions of the whole picture,
 *  kept inside it, to a tenth of a percent. */
export function percentPlace(x: number, y: number): string {
  const pct = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 1000) / 10;
  return `${pct(x)}% ${pct(y)}%`;
}

/** The edit that moves a label placed by percentages to the picture point
 *  `(x, y)`: its `at` value rewritten in the chapter the book's offsets
 *  fall in; null when the label has no `at` to rewrite, the book is not
 *  known, or the value is already that place. */
export function percentMoveEdit(pl: Pick<PageLabel, 'label'>, x: number, y: number, book: ComposedBook | null): { chapterId: string; changes: { from: number; to: number; insert: string }[]; baseLength: number } | null {
  const at = pl.label.atSource;
  if (!at || 'anchor' in pl.label.at || !book || book.segments.length === 0) return null;
  const seg = segmentAtOffset(book, at.start);
  if (at.start < seg.start || at.end > seg.end) return null;
  const insert = percentPlace(x, y);
  if (book.markdown.slice(at.start, at.end) === insert) return null;
  return { chapterId: seg.chapterId, changes: [{ from: at.start - seg.start, to: at.end - seg.start, insert }], baseLength: seg.end - seg.start };
}

/** Write the label dragged by `(dx, dy)` sheet px where it was dropped: its
 *  anchor on the resource (one step of the history), or the percentages in
 *  the text of the edition on screen. The drop of every surface (#970). */
export function dropLabel(pl: PageLabel, dx: number, dy: number, refs: Pick<LabelAnchorEditorRefs, 'dispatchRef' | 'sourceOfPage'>, pageIndex: number, away = false): void {
  const p = sheetToPicture(pl, pl.point.x + dx, pl.point.y + dy);
  if (!p) return;
  const id = pl.anchorId;
  if (id) {
    const host = templateEditorHost();
    if (!host) return;
    const resource = host.getState().resources.find((r) => r.id === pl.resourceId);
    // A label away from its point moves where it stands (#1064).
    const next = !resource ? null : away || pl.anchorPoint ? withLabelAtMoved(resource, id, p.x, p.y) : withAnchorMoved(resource, id, p.x, p.y);
    // One step of the history (#899) per drop.
    if (next) refs.dispatchRef.current({ type: 'UPSERT_RESOURCE', payload: next, history: { merge: false } });
    return;
  }
  const edit = percentMoveEdit(pl, p.x, p.y, refs.sourceOfPage?.(pageIndex) ?? null);
  if (edit) applyViewerEdit(refs.dispatchRef.current, edit.chapterId, edit.changes, edit.baseLength);
}

/** A click on a label: its picture in the Resources panel. */
export function openLabelPicture(pl: PageLabel, dispatchRef: MutableRefObject<Dispatch<SandboxAction>>): void {
  const host = templateEditorHost();
  const s = host?.getState();
  if (s?.activePanel === 'resources' && s.activeResourceId === pl.resourceId) return;
  dispatchRef.current({ type: 'SET_PANEL', payload: 'resources' });
  dispatchRef.current({ type: 'SET_ACTIVE_RESOURCE', payload: pl.resourceId });
}
