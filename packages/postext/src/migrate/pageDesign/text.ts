// Text helpers for a planned page: units, looks, rectangles, bold runs,
// escaping and chip styles (#1278: split out of pageDesign.ts).
import type { Dimension, DesignTextElement, PlacedDesignElement, DesignElement, ColorValue, ChipStyleConfig } from '../../types.js';
import type { PageSide } from '../../composed/types.js';
import { stripPlaceholders } from '../../pipeline/pages/placeholders.js';
import type { TextLook } from './types.js';

const MM_PER: Record<string, number> = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, px: 25.4 / 96 };

/** A length in mm; `em` against `emMm`. */
export function toMm(d: Dimension | undefined, emMm = 0): number | undefined {
  if (!d || typeof d !== 'object' || typeof d.value !== 'number') return undefined;
  if (d.unit === 'em' || d.unit === 'rem') return d.value * emMm;
  const f = MM_PER[d.unit];
  return f === undefined ? undefined : d.value * f;
}

function lineHeightOf(el: DesignTextElement): number {
  const lh = el.lineHeight;
  if (typeof lh === 'number') return lh > 0 ? lh : 1.2;
  if (lh && typeof lh === 'object') {
    if (lh.unit === 'em' || lh.unit === 'rem') return lh.value > 0 ? lh.value : 1.2;
    const size = toMm(el.fontSize) ?? 0;
    const abs = toMm(lh);
    if (abs && size > 0) return abs / size;
  }
  return 1.2;
}

/** A design text's look. */
export function lookOf(el: DesignTextElement): TextLook {
  return {
    ...(el.fontFamily ? { fontFamily: el.fontFamily } : {}),
    fontSize: el.fontSize,
    fontWeight: el.fontWeight ?? 400,
    italic: el.italic === true,
    ...(el.color ? { color: el.color } : {}),
    align: (el.align ?? 'center') as TextLook['align'],
    lineHeight: Math.round(lineHeightOf(el) * 100) / 100,
    uppercase: el.textTransform === 'uppercase',
    hyphenate: el.hyphenate === true,
    ...(el.direction === 'rtl' || el.direction === 'ltr' ? { direction: el.direction } : {}),
    ...(el.writingMode === 'vertical-rl' ? { writingMode: 'vertical-rl' as const } : {}),
    ...trackingOf(el),
  };
}

/** A design text's tracking as ems of its size, the unit a paragraph
 *  style reads it in (#907): `{ letterSpacing }`, or nothing when it sets
 *  none. */
function trackingOf(el: DesignTextElement): { letterSpacing?: Dimension } {
  const ls = el.letterSpacing;
  if (!ls || typeof ls !== 'object' || typeof ls.value !== 'number' || ls.value === 0) return {};
  if (ls.unit === 'em') return { letterSpacing: { value: ls.value, unit: 'em' } };
  const sizeMm = toMm(el.fontSize);
  const mm = toMm(ls, sizeMm ?? 0);
  if (!sizeMm || mm === undefined || mm === 0) return {};
  return { letterSpacing: { value: Math.round((mm / sizeMm) * 10000) / 10000, unit: 'em' } };
}

/** Whether a design text holds a placeholder (`{pageNumber}`, `{attr.x}`). */
export function hasPlaceholder(content: string): boolean {
  const plain = content.replace(/\{\{/g, '{').replace(/\}\}/g, '}').replace(/\\n/g, '\n');
  return stripPlaceholders(content) !== plain;
}

export const sideOf = (el: { parity?: string }): PageSide | undefined =>
  el.parity === 'odd' ? 'recto' : el.parity === 'even' ? 'verso' : undefined;

const isTopLeftPage = (el: { placement?: PlacedDesignElement['placement'] }): boolean =>
  el.placement?.anchor?.to === 'page' && (el.placement.anchor.edge ?? 'top-left') === 'top-left';

export function rectOf(el: DesignElement): { x: number; y: number; w?: number; h?: number } | undefined {
  if (el.kind === 'connector' || !isTopLeftPage(el)) return undefined;
  const p = el.placement;
  const w = typeof p.size?.width === 'object' && 'value' in p.size.width ? toMm(p.size.width) : undefined;
  const h = typeof p.size?.height === 'object' && 'value' in p.size.height ? toMm(p.size.height) : undefined;
  return { x: toMm(p.offset?.x) ?? 0, y: toMm(p.offset?.y) ?? 0, ...(w !== undefined ? { w } : {}), ...(h !== undefined ? { h } : {}) };
}

/** The lines of a design text: a newline, or the two characters `\n`,
 *  starts one; runs of them count once. */
export function contentLines(content: string): string[] {
  return content.replace(/\{\{/g, '{').replace(/\}\}/g, '}').replace(/\\n/g, '\n').split(/\n+/).map((l) => l.trim());
}

/** Bold runs (`**…**`) of the lines, with the lines they cover. */
interface BoldRun { line: number; start: number; end: number }
export function boldRuns(lines: readonly string[]): { runs: BoldRun[][]; } {
  // Per bold run, its piece on each line it crosses.
  const runs: BoldRun[][] = [];
  let open: BoldRun[] | null = null;
  lines.forEach((text, line) => {
    let from = 0;
    if (open) open.push({ line, start: 0, end: text.length });
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '\\') { i++; continue; }
      if (text[i] === '*' && text[i + 1] === '*') {
        if (!open) {
          open = [];
          from = i + 2;
          open.push({ line, start: from, end: text.length });
        } else {
          const last = open[open.length - 1]!;
          if (last.line === line) last.end = i;
          runs.push(open);
          open = null;
        }
        i++;
      }
    }
  });
  return { runs };
}

/** Characters with a meaning in Postext Markdown escaped, so the text
 *  prints as the design printed it. With `marks`, the inline marks of the
 *  design (`**`, `*`, `_`, `^`, `~`) stay marks. */
export function escapeText(text: string, marks: boolean): string {
  // One pass over the characters. A backslash before a character that gets
  // escaped is doubled (`\\*` prints a backslash and an escaped asterisk);
  // any other prints as it is. With inline marks a backslash before a
  // marker is the design's own escape (`\*`) and stays, and the markers
  // are left alone.
  const escaped = marks ? '$`' : '*_^~$`';
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '\\') {
      const next = text[i + 1];
      const doubles = next !== undefined && (escaped.includes(next) || (!marks && next === '\\'));
      out += doubles ? '\\\\' : ch;
      continue;
    }
    out += escaped.includes(ch) ? `\\${ch}` : ch;
  }
  return out;
}

/** A line that the block parser would read as a list item, a heading, a
 *  quotation or a fence. */
const BLOCK_START = /^([-*+][ \t]|\d+[.)][ \t]|#{1,6}[ \t]|>|:::|\||`{3}|~{3}|\[\^)/;

/** The Markdown of a frame's paragraph: the lines joined by forced breaks
 *  (a backslash at the end of the line; ` \\ ` on the same line when the
 *  next one would start a block). */
export function joinLines(lines: readonly string[]): string {
  let out = '';
  lines.forEach((l, i) => {
    if (i === 0) {
      out = BLOCK_START.test(l) ? `\u200B${l}` : l;
      return;
    }
    out += BLOCK_START.test(l) ? ` \\\\ ${l}` : `\\\n${l}`;
  });
  return out;
}

const hexOf = (c: ColorValue | undefined): string | undefined => {
  const h = (c as { hex?: unknown } | undefined)?.hex;
  return typeof h === 'string' ? h.toLowerCase() : undefined;
};

/** A box that only fills a colour: a highlight under words. */
export function highlightColour(el: DesignElement): ColorValue | undefined {
  if (el.kind !== 'box') return undefined;
  const st = el.style ?? {};
  if (!st.backgroundColor) return undefined;
  if (st.borderColor && (toMm(st.borderWidth) ?? 0) > 0) return undefined;
  return st.backgroundColor;
}

/** The chip style a highlight of colour `c` becomes: the book's own, else a
 *  new one (bold, no padding, as the boxes were drawn). */
export function chipStyleFor(c: ColorValue, existing: readonly ChipStyleConfig[], fresh: Map<string, ChipStyleConfig>): string {
  const hex = hexOf(c);
  const own = existing.find((s) => s.backgroundEnabled !== false && hexOf(s.background) === hex);
  if (own) return own.id;
  const id = `highlight-${(hex ?? 'colour').replace('#', '')}`;
  if (!fresh.has(id)) {
    fresh.set(id, {
      id,
      name: `Highlight ${hex ?? ''}`.trim(),
      backgroundEnabled: true,
      background: c,
      borderWidth: { value: 0, unit: 'pt' },
      borderRadius: { value: 0, unit: 'em' },
      paddingX: { value: 0, unit: 'em' },
      paddingY: { value: 0.04, unit: 'em' },
      bold: true,
    } as ChipStyleConfig);
  }
  return id;
}

/** The pieces' estimated height: their lines, wrapped at the width at about
 *  half an em a character. */
export function estimateLines(lines: readonly string[], widthMm: number | undefined, sizeMm: number): number {
  if (!widthMm || widthMm <= 0) return Math.max(1, lines.length);
  const perLine = Math.max(1, Math.floor(widthMm / (sizeMm * 0.5)));
  return lines.reduce((n, l) => n + Math.max(1, Math.ceil(l.replace(/\*\*|[*_^~]/g, '').length / perLine)), 0);
}
