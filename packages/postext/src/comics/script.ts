/**
 * The script of a comic panel (#558): one balloon per line,
 * `key{attrs}: text`.
 *
 * - The colon may be fullwidth (`：`), as a Chinese or Japanese input
 *   method types it.
 * - A line indented by two spaces or a tab continues the balloon above (a
 *   space joins the lines, none between Chinese or Japanese characters); a
 *   line ending with a backslash breaks the balloon's line there.
 * - Blank lines and `<!-- comments -->` are ignored.
 * - `key` is a speaker id (letters, digits, `_ . -`), the same in every
 *   translation; `caption`, `sfx` and `note` are reserved.
 * - The text is inline Markdown, read by the same passes as a resource
 *   caption: emphasis, `:ruby`, `:tcy`, `:ltr` / `:rtl`, forced breaks.
 */

import type { DirectiveAttrs } from '../parse/types';
import type { ComicBalloonPosition } from '../types';
import { scanDirectiveAttrs } from '../parse/attrs';
import { mapInlineSnippet } from '../parse/inlineSnippet';
import { BREAK_PLACEHOLDER } from '../parse/inlineFormatting';
import { COMIC_RESERVED_KEYS, type ComicScriptItem, type ComicScriptRole, type ComicSourceRange, type ComicTailSide } from './types';

/** `key`, an optional `{attrs}`, then the colon. */
const SCRIPT_LINE_RE = /^([\p{L}\p{N}_.-]+)[ \t]*(?:\{([^}\n]*)\})?[ \t]*[:：]/u;

/** One source line of a script, as the page parser hands it over: its text
 *  (comments blanked out) and where it starts. */
export interface ComicScriptLine {
  text: string;
  start: number;
}

/** Attribute keys a script line reads; any other bare flag names a style. */
const SCRIPT_KEYS = new Set(['at', 'to', 'tail', 'join', 'break', 'rotate', 'size', 'color', 'font', 'style', 'id']);

const POSITION_KEYWORDS: ReadonlySet<string> = new Set(['top-start', 'top-end', 'bottom-start', 'bottom-end', 'top', 'bottom']);
const TAIL_VALUES: ReadonlySet<string> = new Set(['none', 'auto', 'top', 'bottom', 'start', 'end']);

/** Whether a line continues the balloon above: two spaces or a tab of
 *  indentation. */
function isContinuation(text: string): boolean {
  return /^(?: {2,}|\t)/.test(text) && text.trim() !== '';
}

/** `"62% 40%"` (or `62 40`, `0.62 0.4` read as fractions when both are at
 *  most 1 and written without `%`) as fractions; undefined when it is not
 *  two numbers. */
export function parseComicPoint(value: string | undefined): { x: number; y: number } | undefined {
  if (value === undefined) return undefined;
  const m = /^\s*(-?[0-9.]+)\s*(%?)\s*[ ,]\s*(-?[0-9.]+)\s*(%?)\s*$/.exec(value);
  if (!m) return undefined;
  const a = Number(m[1]);
  const b = Number(m[3]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return undefined;
  const fractions = !m[2] && !m[4] && Math.abs(a) <= 1 && Math.abs(b) <= 1;
  return fractions ? { x: a, y: b } : { x: a / 100, y: b / 100 };
}

function flagValue(attrs: DirectiveAttrs, key: string): boolean | undefined {
  const v = attrs[key];
  if (v === undefined) return undefined;
  const t = v.trim().toLowerCase();
  return !(t === 'false' || t === 'no' || t === '0');
}

function numberValue(v: string | undefined): number | undefined {
  if (v === undefined || v.trim() === '') return undefined;
  const n = Number(v.trim().replace(/deg$|°$|x$|×$/i, ''));
  return Number.isFinite(n) ? n : undefined;
}

function roleOf(key: string): ComicScriptRole {
  if (key === 'caption') return 'caption';
  if (key === 'sfx') return 'sfx';
  if (key === 'note') return 'note';
  return 'speech';
}

/** The text of a balloon read as inline Markdown, spaces collapsed, with
 *  its absolute source map. `content` starts at `contentStart`. */
export function readBalloonText(content: string, contentStart: number): Pick<ComicScriptItem, 'text' | 'spans' | 'sourceMap'> {
  const mapped = mapInlineSnippet(content);
  const text = mapped.text;
  // Which characters stay, and the spaces that stand for a run of
  // whitespace (a line end and the next line's indentation).
  const keep: boolean[] = new Array<boolean>(text.length).fill(true);
  const asSpace: boolean[] = new Array<boolean>(text.length).fill(false);
  const isWs = (c: string | undefined) => c === ' ' || c === '\t' || c === '\n' || c === '\r';
  for (let i = 0; i < text.length;) {
    if (!isWs(text[i])) { i++; continue; }
    let j = i;
    while (j < text.length && isWs(text[j])) j++;
    const atEdge = i === 0 || j === text.length || text[i - 1] === BREAK_PLACEHOLDER || text[j] === BREAK_PLACEHOLDER;
    for (let k = i; k < j; k++) keep[k] = false;
    if (!atEdge) {
      keep[i] = true;
      asSpace[i] = true;
    }
    i = j;
  }
  const spans: ComicScriptItem['spans'] = [];
  let at = 0;
  for (const span of mapped.spans) {
    const end = at + span.text.length;
    let out = '';
    const newIndex: number[] = [];
    for (let k = at; k < end; k++) {
      newIndex.push(out.length);
      if (!keep[k]) continue;
      out += asSpace[k] ? ' ' : text[k];
    }
    newIndex.push(out.length);
    if (out.length > 0) {
      const next = { ...span, text: out };
      if (span.links) next.links = span.links.map((l) => ({ ...l, start: newIndex[l.start]!, end: newIndex[l.end]! })).filter((l) => l.end > l.start);
      spans.push(next);
    }
    at = end;
  }
  const sourceMap: number[] = [];
  let plain = '';
  for (let k = 0; k < text.length; k++) {
    if (!keep[k]) continue;
    plain += asSpace[k] ? ' ' : text[k];
    sourceMap.push(contentStart + (mapped.sourceMap[k] ?? 0));
  }
  return { text: plain, spans, sourceMap };
}

/** Value ranges of an attribute blob starting at `blobStart`. */
export function attrValueSources(blob: string, blobStart: number): Record<string, ComicSourceRange> {
  const out: Record<string, ComicSourceRange> = {};
  for (const t of scanDirectiveAttrs(blob)) {
    if (t.valueStart === undefined || t.valueEnd === undefined) {
      out[t.key] = { start: blobStart + t.end, end: blobStart + t.end };
      continue;
    }
    out[t.key] = { start: blobStart + t.valueStart, end: blobStart + t.valueEnd };
  }
  return out;
}

/** The item of a script line's head: key, attributes, where its text
 *  starts. Text and range are filled once its continuation lines are
 *  known. */
function scriptHead(line: ComicScriptLine): Omit<ComicScriptItem, 'text' | 'spans' | 'sourceMap' | 'sourceEnd' | 'textEnd'> | undefined {
  const lead = line.text.length - line.text.trimStart().length;
  const body = line.text.slice(lead);
  const m = SCRIPT_LINE_RE.exec(body);
  if (!m) return undefined;
  const key = m[1]!;
  const blob = m[2];
  const keyStart = line.start + lead;
  const attrs: DirectiveAttrs = {};
  const styleFlags: string[] = [];
  let attrSources: Record<string, ComicSourceRange> = {};
  let attrsStart: number | undefined;
  let attrsEnd: number | undefined;
  if (blob !== undefined) {
    const braceAt = body.indexOf('{', key.length);
    attrsStart = keyStart + braceAt + 1;
    attrsEnd = attrsStart + blob.length;
    for (const t of scanDirectiveAttrs(blob)) {
      if (t.flag && !SCRIPT_KEYS.has(t.key)) {
        styleFlags.push(t.key);
        continue;
      }
      attrs[t.key] = t.value;
    }
    attrSources = attrValueSources(blob, attrsStart);
  }
  // The text starts after the colon and the spaces after it.
  let textStart = keyStart + m[0].length;
  while (textStart < line.start + line.text.length && (line.text[textStart - line.start] === ' ' || line.text[textStart - line.start] === '\t' || line.text[textStart - line.start] === '　')) textStart++;
  const role = roleOf(key);
  const style = attrs.style?.trim() || styleFlags[0];
  const item: Omit<ComicScriptItem, 'text' | 'spans' | 'sourceMap' | 'sourceEnd' | 'textEnd'> = {
    key,
    role,
    ...(role === 'speech' ? { speaker: key } : {}),
    ...(style ? { style } : {}),
    styleFlags,
    attrs,
    attrSources,
    sourceStart: keyStart,
    keyStart,
    keyEnd: keyStart + key.length,
    ...(attrsStart !== undefined ? { attrsStart, attrsEnd } : {}),
    textStart,
  };
  const atRaw = attrs.at?.trim();
  if (atRaw) {
    if (POSITION_KEYWORDS.has(atRaw)) item.atKeyword = atRaw as Exclude<ComicBalloonPosition, 'auto'>;
    else {
      const p = parseComicPoint(atRaw);
      if (p) item.at = p;
    }
  }
  const to = parseComicPoint(attrs.to);
  if (to) item.to = to;
  const tail = attrs.tail?.trim();
  if (tail && TAIL_VALUES.has(tail)) item.tail = tail as 'none' | 'auto' | ComicTailSide;
  const join = flagValue(attrs, 'join');
  if (join !== undefined) item.join = join;
  const brk = flagValue(attrs, 'break');
  if (brk !== undefined) item.break = brk;
  const rotate = numberValue(attrs.rotate);
  if (rotate !== undefined) item.rotate = rotate;
  const size = numberValue(attrs.size);
  if (size !== undefined && size > 0) item.size = size;
  if (attrs.color?.trim()) item.color = attrs.color.trim();
  if (attrs.font?.trim()) item.font = attrs.font.trim();
  return item;
}

/**
 * The balloons of a panel's script lines, in order. `markdown` is the text
 * the offsets point into (the lines' text may have comments blanked out,
 * at the same length). A line that is not a script line and continues
 * nothing is lettered as a caption and marked `stray`.
 */
export function parseComicScript(markdown: string, lines: readonly ComicScriptLine[]): ComicScriptItem[] {
  const out: ComicScriptItem[] = [];
  type Open = { head: Omit<ComicScriptItem, 'text' | 'spans' | 'sourceMap' | 'sourceEnd' | 'textEnd'>; end: number };
  let open: Open | undefined;
  const close = (): void => {
    if (!open) return;
    const { head, end } = open;
    const textEnd = Math.max(head.textStart, end);
    // Comments are blanked in the lines, not in `markdown`: read the text
    // from the lines' own copy.
    const content = blankedSlice(markdown, lines, head.textStart, textEnd);
    out.push({ ...head, ...readBalloonText(content, head.textStart), textEnd, sourceEnd: textEnd > head.textStart ? textEnd : head.keyEnd });
    open = undefined;
  };
  for (const line of lines) {
    if (line.text.trim() === '') continue;
    const lineEnd = line.start + line.text.trimEnd().length;
    if (open && isContinuation(line.text)) {
      open.end = lineEnd;
      continue;
    }
    const head = scriptHead(line);
    close();
    if (head) {
      open = { head, end: lineEnd };
      continue;
    }
    // Not a script line: a caption, flagged.
    const lead = line.text.length - line.text.trimStart().length;
    const start = line.start + lead;
    open = {
      head: { key: 'caption', role: 'caption', styleFlags: [], attrs: {}, attrSources: {}, sourceStart: start, keyStart: start, keyEnd: start, textStart: start, stray: true },
      end: lineEnd,
    };
  }
  close();
  return out;
}

/** `markdown.slice(start, end)` with the lines' own text (comments
 *  blanked) where they cover it. */
function blankedSlice(markdown: string, lines: readonly ComicScriptLine[], start: number, end: number): string {
  let out = '';
  let at = start;
  for (const line of lines) {
    const ls = line.start;
    const le = line.start + line.text.length;
    if (le <= at || ls >= end) continue;
    if (ls > at) out += markdown.slice(at, ls);
    const from = Math.max(at, ls);
    const to = Math.min(end, le);
    out += line.text.slice(from - ls, to - ls);
    at = to;
  }
  if (at < end) out += markdown.slice(at, end);
  return out;
}
