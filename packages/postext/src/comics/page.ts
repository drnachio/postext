/**
 * The body of a comic page (`:::page{…}` … `:::`, #555): a raw-body block
 * the block parser hands over whole, read here into panels and their
 * script. `:::strip` (a comic in the text flow) has the same body and will
 * reuse {@link parseComicFence}.
 *
 * ```md
 * :::page{split="30 [30 | 20 | *] / *" gutter=4mm}
 * ::panel{art=p1-wide}
 * caption: Lyon, 1943.
 * ana: Did you hear that?
 * ::panel{art=p1-door}
 * sfx{at="62% 40%" rotate=-8}: KRAK
 * :::
 * ```
 */

import { parseDirectiveAttrs } from '../parse/attrs';
import { attrValueSources, parseComicScript, type ComicScriptLine } from './script';
import { parseComicSplit } from './split';
import type { ComicPageSource, ComicPanelSource, ComicSourceRange } from './types';

/** `:::page` / `:::strip` with an optional attribute block. */
const COMIC_FENCE_RE = /^:::\s*(page|strip)\s*(?:\{([^}]*)\})?\s*$/;
/** `::panel` with an optional attribute block, alone on its line. */
const PANEL_RE = /^::panel\s*(?:\{([^}]*)\})?\s*$/;
/** The bare `:::` that closes the page. */
const CLOSE_RE = /^:::\s*$/;

/** The fence names whose body is a comic. */
export const COMIC_FENCES: ReadonlySet<string> = new Set(['page', 'strip']);

/** Whether a trimmed line opens a comic block (`:::page{…}`). */
export function isComicFence(trimmed: string, kind: 'page' | 'strip' = 'page'): boolean {
  const m = COMIC_FENCE_RE.exec(trimmed);
  return m !== null && m[1] === kind;
}

/** Blank out `<!-- … -->` comments (spaces of the same length, line feeds
 *  kept), so offsets stay put. */
function blankComments(text: string): string {
  return text.replace(/<!--[\s\S]*?(?:-->|$)/g, (c) => c.replace(/[^\n]/g, ' '));
}

/**
 * Read a comic block whose fence line starts at `fenceStart` in `markdown`.
 * The body runs to the first bare `:::` line (or to the end of the text,
 * `closed: false`). Returns undefined when the line at `fenceStart` is not a
 * comic fence. `end` is the offset just past the closing fence line (or the
 * text's end), where the next block starts.
 */
export function parseComicFence(markdown: string, fenceStart: number): { source: ComicPageSource; end: number } | undefined {
  const lineEnd = (at: number): number => {
    const nl = markdown.indexOf('\n', at);
    return nl < 0 ? markdown.length : nl;
  };
  const fenceEnd = lineEnd(fenceStart);
  const fenceLine = markdown.slice(fenceStart, fenceEnd);
  const m = COMIC_FENCE_RE.exec(fenceLine.trim());
  if (!m) return undefined;
  const kind = m[1] as 'page' | 'strip';
  const blob = m[2];
  let attrsStart: number;
  let attrsEnd: number;
  let attrSources: Record<string, ComicSourceRange> = {};
  if (blob !== undefined) {
    attrsStart = fenceStart + fenceLine.indexOf('{') + 1;
    attrsEnd = attrsStart + blob.length;
    attrSources = attrValueSources(blob, attrsStart);
  } else {
    attrsStart = fenceStart + fenceLine.indexOf(kind) + kind.length;
    attrsEnd = attrsStart;
  }
  const attrs = parseDirectiveAttrs(blob ?? '');

  // The body's lines, comments blanked, up to the closing fence.
  const lines: ComicScriptLine[] = [];
  let at = fenceEnd + 1;
  let closed = false;
  let end = markdown.length;
  // Comments may span lines: blank the body as a whole first.
  let bodyEnd = markdown.length;
  {
    let k = at;
    while (k <= markdown.length) {
      const e = lineEnd(k);
      if (CLOSE_RE.test(markdown.slice(k, e).trim())) {
        bodyEnd = k;
        closed = true;
        end = e;
        break;
      }
      if (e >= markdown.length) break;
      k = e + 1;
    }
  }
  if (at > markdown.length) at = markdown.length;
  const body = blankComments(markdown.slice(at, Math.max(at, bodyEnd)));
  let off = 0;
  for (const text of body.split('\n')) {
    lines.push({ text, start: at + off });
    off += text.length + 1;
  }
  // A body ending with a line feed leaves an empty last line: harmless.

  // Split the lines into panels.
  const panels: ComicPanelSource[] = [];
  const stray: ComicSourceRange[] = [];
  const before: ComicScriptLine[] = [];
  let current: { panel: ComicPanelSource; lines: ComicScriptLine[] } | undefined;
  const finish = (): void => {
    if (!current) return;
    current.panel.items = parseComicScript(markdown, current.lines);
    const last = [...current.lines].reverse().find((l) => l.text.trim() !== '');
    current.panel.sourceEnd = last ? last.start + last.text.trimEnd().length : current.panel.lineEnd;
    panels.push(current.panel);
    current = undefined;
  };
  for (const line of lines) {
    const trimmed = line.text.trim();
    const pm = PANEL_RE.exec(trimmed);
    if (pm) {
      finish();
      const lead = line.text.length - line.text.trimStart().length;
      const lineStart = line.start + lead;
      const lineEndAt = line.start + line.text.trimEnd().length;
      const pblob = pm[1];
      const pAttrsStart = pblob !== undefined ? line.start + line.text.indexOf('{') + 1 : lineEndAt;
      current = {
        panel: {
          index: panels.length,
          attrs: parseDirectiveAttrs(pblob ?? ''),
          attrSources: pblob !== undefined ? attrValueSources(pblob, pAttrsStart) : {},
          sourceStart: lineStart,
          sourceEnd: lineEndAt,
          lineStart,
          lineEnd: lineEndAt,
          items: [],
        },
        lines: [],
      };
      continue;
    }
    if (current) current.lines.push(line);
    else {
      before.push(line);
      if (trimmed !== '') {
        const lead = line.text.length - line.text.trimStart().length;
        stray.push({ start: line.start + lead, end: line.start + line.text.trimEnd().length });
      }
    }
  }
  finish();
  // Text before the first panel goes to the first panel (or to a panel of
  // its own when the page has none), each item marked stray.
  if (stray.length > 0) {
    const items = parseComicScript(markdown, before).map((it) => ({ ...it, stray: true as const }));
    if (panels.length > 0) panels[0]!.items = [...items, ...panels[0]!.items];
    else {
      const first = stray[0]!;
      const last = stray[stray.length - 1]!;
      panels.push({ index: 0, attrs: {}, attrSources: {}, sourceStart: first.start, sourceEnd: last.end, lineStart: first.start, lineEnd: first.start, implicit: true, items });
    }
  }

  const splitRange = attrSources.split;
  const split = attrs.split;
  // Without a `split` the panels stack in equal tiers.
  const splitParse = parseComicSplit(split ?? Array.from({ length: Math.max(1, panels.length) }, () => '*').join(' / '));
  if (split === undefined) {
    // No offsets into a value that is not written.
    splitParse.issues = [];
    pinSplit(splitParse.tree, attrsEnd);
  } else if (splitRange) {
    shiftSplit(splitParse, splitRange.start);
  }
  return {
    source: {
      kind,
      attrs,
      attrSources,
      attrsStart,
      attrsEnd,
      ...(split !== undefined ? { split } : {}),
      splitParse,
      panels,
      stray,
      closed,
      sourceStart: fenceStart,
      sourceEnd: closed ? end : markdown.length,
    },
    end: closed ? end : markdown.length,
  };
}

/** Point every offset of a split that is not written (the default stack of
 *  tiers) at `at`, where a `split` attribute would be inserted. */
function pinSplit(list: ReturnType<typeof parseComicSplit>['tree'], at: number): void {
  list.sourceStart = at;
  list.sourceEnd = at;
  for (const item of list.items) {
    item.sourceStart = at;
    item.sourceEnd = at;
    item.size.sourceStart = at;
    item.size.sourceEnd = at;
    if (item.children) pinSplit(item.children, at);
  }
}

/** Make the offsets of a parsed split value absolute. */
function shiftSplit(parse: ReturnType<typeof parseComicSplit>, by: number): void {
  const seen = new Set<object>();
  const walk = (list: ReturnType<typeof parseComicSplit>['tree']): void => {
    list.sourceStart += by;
    list.sourceEnd += by;
    for (const item of list.items) {
      item.sourceStart += by;
      item.sourceEnd += by;
      if (!seen.has(item.size)) {
        seen.add(item.size);
        item.size.sourceStart += by;
        item.size.sourceEnd += by;
      }
      if (item.children) walk(item.children);
    }
  };
  walk(parse.tree);
  for (const issue of parse.issues) {
    issue.sourceStart += by;
    issue.sourceEnd += by;
  }
}

/** Every offset of a comic source mapped through `toOriginal` (the block
 *  parser reads a text with its index marks taken out, then maps every
 *  offset back to the original). Mutates `source`. */
export function remapComicSource(source: ComicPageSource, toOriginal: (offset: number) => number): void {
  const range = (r: ComicSourceRange): void => {
    r.start = toOriginal(r.start);
    r.end = toOriginal(r.end);
  };
  source.sourceStart = toOriginal(source.sourceStart);
  source.sourceEnd = toOriginal(source.sourceEnd);
  source.attrsStart = toOriginal(source.attrsStart);
  source.attrsEnd = toOriginal(source.attrsEnd);
  Object.values(source.attrSources).forEach(range);
  source.stray.forEach(range);
  const seen = new Set<object>();
  const walk = (list: ComicPageSource['splitParse']['tree']): void => {
    list.sourceStart = toOriginal(list.sourceStart);
    list.sourceEnd = toOriginal(list.sourceEnd);
    for (const item of list.items) {
      item.sourceStart = toOriginal(item.sourceStart);
      item.sourceEnd = toOriginal(item.sourceEnd);
      if (!seen.has(item.size)) {
        seen.add(item.size);
        item.size.sourceStart = toOriginal(item.size.sourceStart);
        item.size.sourceEnd = toOriginal(item.size.sourceEnd);
      }
      if (item.children) walk(item.children);
    }
  };
  walk(source.splitParse.tree);
  for (const issue of source.splitParse.issues) {
    issue.sourceStart = toOriginal(issue.sourceStart);
    issue.sourceEnd = toOriginal(issue.sourceEnd);
  }
  for (const panel of source.panels) {
    panel.sourceStart = toOriginal(panel.sourceStart);
    panel.sourceEnd = toOriginal(panel.sourceEnd);
    panel.lineStart = toOriginal(panel.lineStart);
    panel.lineEnd = toOriginal(panel.lineEnd);
    Object.values(panel.attrSources).forEach(range);
    for (const item of panel.items) {
      for (const k of ['sourceStart', 'sourceEnd', 'keyStart', 'keyEnd', 'textStart', 'textEnd', 'attrsStart', 'attrsEnd'] as const) {
        const v = item[k];
        if (v !== undefined) item[k] = toOriginal(v);
      }
      Object.values(item.attrSources).forEach(range);
      for (let i = 0; i < item.sourceMap.length; i++) item.sourceMap[i] = toOriginal(item.sourceMap[i]!);
    }
  }
}
