/**
 * Source edits behind the balloon drag of the previews (#571): a balloon
 * dropped somewhere is pinned there, `at="x% y%"` written on its script
 * line (the value replaced in place, the attribute added to the line's
 * braces, or braces added after the key); a double click on a pinned
 * balloon takes the `at` away again.
 *
 * Pure: the lines are found by re-reading the page's fence (the engine's
 * `parseComicFence`) in the Markdown the layout was built from, and every
 * change carries the text it replaces (`expect`), so a stale layout never
 * writes.
 */

import type { ComicScriptItem, VDTComicPage } from 'postext';
import { minimalChange, type TextChange } from '../../book/textChanges';
import { comicPageSourceAt } from './comicSource';

/** The quotes an attribute value may sit between, opening → closing. */
const QUOTES: Readonly<Record<string, string>> = { '"': '"', "'": "'", '“': '”', '「': '」' };

/** A percent with at most one decimal, without a trailing `.0`. */
export function formatPinPercent(value: number): string {
  const r = Math.round(value * 10) / 10;
  return String(Object.is(r, -0) ? 0 : r);
}

/** The `at` value of a pin given in fractions: `"37.5% 20%"`. */
export function pinValue(at: { x: number; y: number }): string {
  return `${formatPinPercent(at.x * 100)}% ${formatPinPercent(at.y * 100)}%`;
}

/** The script line a laid-out balloon was set from (its `sourceStart` is
 *  the line's), read again from the Markdown; null when the text no longer
 *  holds it there, or for stray text (no key to hang braces on). */
export function comicBalloonItem(markdown: string, comic: Pick<VDTComicPage, 'sourceStart' | 'sourceEnd'>, sourceStart: number): ComicScriptItem | null {
  const source = comicPageSourceAt(markdown, comic);
  if (!source) return null;
  for (const panel of source.panels) {
    for (const item of panel.items) {
      if (item.sourceStart === sourceStart) return item.stray ? null : item;
    }
  }
  return null;
}

/** Where an attribute of a script line is written: its whole token
 *  (`at="…"`), its value, and whether the value sits in quotes (`flag`: a
 *  bare key, no value). Null when the line has none. */
export function lineAttribute(markdown: string, item: ComicScriptItem, key: string): { tokenStart: number; tokenEnd: number; valueStart: number; valueEnd: number; quoted: boolean; flag: boolean } | null {
  const range = item.attrSources[key];
  if (item.attrs[key] === undefined || !range || item.attrsStart === undefined) return null;
  const open = markdown[range.start - 1] ?? '';
  const quoted = open in QUOTES && markdown[range.end] === QUOTES[open];
  // Walk back from the value over the quote, the `=` and the spaces round
  // it to the key.
  let p = range.start - (quoted ? 1 : 0);
  let flag = false;
  const space = (c: string | undefined) => c === ' ' || c === '\t' || c === '\u3000';
  let q = p;
  while (q > item.attrsStart && space(markdown[q - 1])) q--;
  if (markdown[q - 1] === '=' || markdown[q - 1] === '\uFF1D') {
    q--;
    while (q > item.attrsStart && space(markdown[q - 1])) q--;
    p = q;
  } else {
    // A bare key (no value): the range sits at the token's end.
    flag = true;
  }
  if (markdown.slice(p - key.length, p) !== key) return null;
  return { tokenStart: p - key.length, tokenEnd: range.end + (quoted ? 1 : 0), valueStart: range.start, valueEnd: range.end, quoted, flag };
}

/**
 * The changes that write `key=value` on a script line: the value replaced
 * in place (the least of it, quotes added when a bare value needs them),
 * the attribute added inside the line's braces after its other attributes,
 * or `{key=value}` written after the line's key. `quote` writes a new
 * value between quotes (always done when it holds a space).
 */
export function setLineAttrChanges(markdown: string, item: ComicScriptItem, key: string, value: string, quote = /\s/.test(value)): TextChange[] {
  const written = quote || /[\s"'{}]/.test(value) || value === '' ? `"${value}"` : value;
  const attr = lineAttribute(markdown, item, key);
  if (attr) {
    if (attr.flag) return [{ from: attr.valueStart, to: attr.valueStart, insert: `=${written}`, expect: '' }];
    const old = markdown.slice(attr.valueStart, attr.valueEnd);
    if (old === value) return [];
    if (!attr.quoted) return [{ from: attr.valueStart, to: attr.valueEnd, insert: written, expect: old }];
    const change = minimalChange(old, value, attr.valueStart);
    return change ? [change] : [];
  }
  if (item.attrsStart !== undefined && item.attrsEnd !== undefined) {
    const blob = markdown.slice(item.attrsStart, item.attrsEnd);
    const sep = blob.trim() === '' || /\s$/.test(blob) ? '' : ' ';
    return [{ from: item.attrsEnd, to: item.attrsEnd, insert: `${sep}${key}=${written}`, expect: '' }];
  }
  return [{ from: item.keyEnd, to: item.keyEnd, insert: `{${key}=${written}}`, expect: '' }];
}

/** The changes that take an attribute off a script line, with the space
 *  before it (or after it, when it comes first), and the braces too when
 *  nothing else is left in them. Null when the line does not write it. */
export function removeLineAttrChanges(markdown: string, item: ComicScriptItem, key: string): TextChange[] | null {
  const attr = lineAttribute(markdown, item, key);
  if (!attr || item.attrsStart === undefined || item.attrsEnd === undefined) return null;
  const before = markdown.slice(item.attrsStart, attr.tokenStart);
  const after = markdown.slice(attr.tokenEnd, item.attrsEnd);
  if ((before + after).trim() === '') {
    const from = item.attrsStart - 1;
    const to = item.attrsEnd + 1;
    return [{ from, to, insert: '', expect: markdown.slice(from, to) }];
  }
  let from = attr.tokenStart;
  let to = attr.tokenEnd;
  const lead = /[ \t\u3000]+$/.exec(before);
  if (lead) from -= lead[0].length;
  else {
    const trail = /^[ \t\u3000]+/.exec(after);
    if (trail) to += trail[0].length;
  }
  return [{ from, to, insert: '', expect: markdown.slice(from, to) }];
}

/** The changes that pin a script line at `at` (fractions of the panel's
 *  picture, or of its cell): `at="x% y%"`, replacing a pin or a corner
 *  keyword in place. */
export function pinLineChanges(markdown: string, item: ComicScriptItem, at: { x: number; y: number }): TextChange[] {
  return setLineAttrChanges(markdown, item, 'at', pinValue(at), true);
}

/** The changes that unpin a script line (its `at` taken off); null when it
 *  has none. */
export function unpinLineChanges(markdown: string, item: ComicScriptItem): TextChange[] | null {
  return removeLineAttrChanges(markdown, item, 'at');
}

/** A rotation in degrees as written: a whole number, or one decimal. */
export function formatRotate(deg: number): string {
  let d = ((deg % 360) + 540) % 360 - 180;
  if (Math.abs(d + 180) < 1e-9) d = 180;
  return formatPinPercent(d);
}

/** The changes that turn a sound effect's line to `deg` degrees, clockwise
 *  (`rotate=…`; written at 0 too, which overrides a style's slant). */
export function rotateLineChanges(markdown: string, item: ComicScriptItem, deg: number): TextChange[] {
  return setLineAttrChanges(markdown, item, 'rotate', formatRotate(deg), false);
}

/** The changes that pin the line a balloon was set from (see
 *  {@link pinLineChanges}); null when the line is gone. */
export function pinBalloonChanges(markdown: string, comic: Pick<VDTComicPage, 'sourceStart' | 'sourceEnd'>, sourceStart: number, at: { x: number; y: number }): TextChange[] | null {
  const item = comicBalloonItem(markdown, comic, sourceStart);
  return item ? pinLineChanges(markdown, item, at) : null;
}

/** The changes that unpin the line a balloon was set from; null when it
 *  is not pinned (or the line is gone). */
export function unpinBalloonChanges(markdown: string, comic: Pick<VDTComicPage, 'sourceStart' | 'sourceEnd'>, sourceStart: number): TextChange[] | null {
  const item = comicBalloonItem(markdown, comic, sourceStart);
  return item ? unpinLineChanges(markdown, item) : null;
}
