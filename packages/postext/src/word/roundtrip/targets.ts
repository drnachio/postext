// The texts edits land in: a chapter's Markdown, or one field of a
// resource (caption, note, alt text, table cell). Each has an export-time
// version (the map's snapshot) and a current one.

import type { ExportMap, FragmentTarget } from '../anchors/types.js';
import { hashText } from '../anchors/hash.js';
import type { Resource } from '../../types/resources/resources.js';
import type { DocxEditSource } from './types.js';

export type TextTarget = Exclude<FragmentTarget, { kind: 'generated' }>;

export function targetKey(t: TextTarget): string {
  return t.kind === 'markdown' ? `md:${t.chapter}` : `res:${t.resourceId}:${fieldName(t)}`;
}

export function fieldName(t: Extract<FragmentTarget, { kind: 'resource' }>): string {
  return t.field === 'cell' ? `cell:${t.row ?? 0}:${t.col ?? 0}` : t.field;
}

interface ResourceLike {
  caption?: unknown;
  note?: unknown;
  altText?: unknown;
  table?: { model?: { rows?: { content?: unknown }[][] } };
}

/** A resource field's text; undefined when the resource or field is not
 *  there (or is a `label`, which this importer does not write). */
export function getField(res: unknown, t: Extract<FragmentTarget, { kind: 'resource' }>): string | undefined {
  if (!res || typeof res !== 'object') return undefined;
  const r = res as ResourceLike;
  let v: unknown;
  if (t.field === 'caption') v = r.caption ?? '';
  else if (t.field === 'note') v = r.note ?? '';
  else if (t.field === 'alt') v = r.altText ?? '';
  else if (t.field === 'cell') v = r.table?.model?.rows?.[t.row ?? 0]?.[t.col ?? 0]?.content;
  return typeof v === 'string' ? v : undefined;
}

export function setField(res: Resource, t: Extract<FragmentTarget, { kind: 'resource' }>, text: string): void {
  if (t.field === 'caption') res.caption = text;
  else if (t.field === 'note') res.note = text;
  else if (t.field === 'alt') res.altText = text;
  else if (t.field === 'cell') {
    const cell = res.table?.model.rows[t.row ?? 0]?.[t.col ?? 0];
    if (cell) cell.content = text;
  }
}

/** Export-time and current texts of a target. The export-time text of a
 *  chapter without a snapshot is the current one when its hash still
 *  matches the map's; a resource without one is read as unchanged. */
export function textsOf(t: TextTarget, map: ExportMap, current: DocxEditSource): { base?: string; ours?: string } {
  if (t.kind === 'markdown') {
    const ch = map.chapters[t.chapter];
    const ours = ch ? current.chapters.find((c) => c.id === ch.id)?.markdown : undefined;
    const snap = ch ? map.snapshot?.chapters.find((c) => c.id === ch.id)?.markdown : undefined;
    const base = snap ?? (ours !== undefined && ch && hashText(ours) === ch.hash ? ours : undefined);
    return { base, ours };
  }
  const res = current.resources?.find((r) => r.id === t.resourceId);
  const ours = getField(res, t);
  const snapRes = map.snapshot?.resources?.[t.resourceId];
  const base = snapRes !== undefined ? getField(snapRes, t) : ours;
  return { base, ours };
}
