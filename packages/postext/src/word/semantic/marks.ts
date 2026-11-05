// Index marks as XE fields, anchors as named bookmarks, and the source
// range of a fence attribute (#1390).

import type { ContentBlock } from '../../parse/types.js';
import { abs, type WriterContext } from './context.js';
import { indexLocale, labelsFor } from '../../pipeline/contents/indexDirective/tree.js';
import { fieldRuns, wordBookmarkName } from './wml.js';

/** A zero-width bookmark under a Word-safe, unused name (nothing when the
 *  name cannot be made safe or is taken). */
export function namedBookmark(ctx: WriterContext, id: string): string {
  const name = wordBookmarkName(id);
  if (!name || ctx.bookmarkNames.has(name)) return '';
  ctx.bookmarkNames.add(name);
  const n = ctx.pkg.nextBookmarkId();
  return `<w:bookmarkStart w:id="${n}" w:name="${name}"/><w:bookmarkEnd w:id="${n}"/>`;
}

/** Text for a quoted field argument: backslashes and quotes escaped. */
const fieldText = (s: string): string => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

/** The "see" / "see also" words of the book's index (its own labels, else
 *  the built-in ones of its locale). */
export function seeLabels(ctx: WriterContext): { see: string; seeAlso: string } {
  const cfg = ctx.resolved.index;
  const localized = labelsFor(indexLocale(ctx.resolved));
  return { see: cfg.see.label ?? localized.see, seeAlso: cfg.see.alsoLabel ?? localized.seeAlso };
}

/** The XE field of an index mark. Subentries are joined with `:`, so a
 *  colon inside a term is escaped (`\:`). */
export function xeField(mark: NonNullable<ContentBlock['indexMarks']>[number], labels: { see: string; seeAlso: string }): string {
  if (!mark.path.length) return '';
  let instr = `XE "${mark.path.map((p) => fieldText(p).replace(/:/g, '\\:')).join(':')}"`;
  if (mark.main) instr += ' \\b';
  if (mark.see) instr += ` \\t "${fieldText(`${labels.see} ${mark.see}`)}"`;
  else if (mark.seeAlso) instr += ` \\t "${fieldText(`${labels.seeAlso} ${mark.seeAlso}`)}"`;
  if (mark.index) instr += ` \\f "${fieldText(mark.index)}"`;
  return fieldRuns(instr);
}

/** Plain index before which a mark at source offset `at` (absolute)
 *  stands: after every character mapped before it. */
function plainIndexOf(sourceMap: readonly number[], at: number): number {
  let i = 0;
  while (i < sourceMap.length && (sourceMap[i]! < 0 || sourceMap[i]! < at)) i++;
  return i;
}

/** XE fields and anchor bookmarks of a block, keyed by the plain index
 *  they go before. `sourceMap` is the block's map, already absolute. */
export function markInserts(ctx: WriterContext, block: ContentBlock, sourceMap: readonly number[]): Map<number, string> {
  const out = new Map<number, string>();
  const put = (i: number, xml: string): void => {
    if (xml) out.set(i, (out.get(i) ?? '') + xml);
  };
  const marks: { at: number; xml: string }[] = [];
  const labels = block.indexMarks?.length ? seeLabels(ctx) : undefined;
  for (const m of block.indexMarks ?? []) marks.push({ at: abs(ctx, m.sourceStart), xml: xeField(m, labels!) });
  for (const a of block.anchorMarks ?? []) marks.push({ at: abs(ctx, a.sourceStart), xml: namedBookmark(ctx, a.anchorId) });
  marks.sort((x, y) => x.at - y.at);
  for (const m of marks) put(plainIndexOf(sourceMap, m.at), m.xml);
  return out;
}

/**
 * The source range of attribute `key`'s value on the fence line starting
 * at `fenceStart` (absolute), read from the Markdown itself: `key="v"`,
 * `key='v'` or `key=v`. Undefined when the fence does not set it.
 */
export function attrRange(md: string, fenceStart: number, key: string): { start: number; end: number } | undefined {
  const lineEnd = md.indexOf('\n', fenceStart);
  const line = md.slice(fenceStart, lineEnd < 0 ? md.length : lineEnd);
  const re = new RegExp(`(?:^|[\\s{])${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=\\s*(?:"((?:[^"\\\\]|\\\\.)*)"|'([^']*)'|([^\\s}"']+))`);
  const m = re.exec(line);
  if (!m) return undefined;
  const value = m[1] ?? m[2] ?? m[3] ?? '';
  const quoted = m[1] !== undefined || m[2] !== undefined;
  const valueEnd = m.index + m[0].length - (quoted ? 1 : 0);
  return { start: fenceStart + valueEnd - value.length, end: fenceStart + valueEnd };
}
