// Vertical text (`layout.writingMode: 'vertical-rl'`, a composed frame's
// own `writingMode`) as InDesign vertical stories.
//
// The display list gives a vertical text item as horizontal lines in an
// unturned frame of its own, with a quarter turn clockwise about the
// centre of its box (`rotate: 90`): a line's `x` runs down the sheet, its
// `baseline` across it, from the right. An InDesign vertical story reads
// the same way (lines top to bottom, stacked right to left; the "left"
// indent is the one at a line's head), so the writer keeps working on
// horizontal lines: `asLines` moves every vertical item into one frame
// shared by the whole page (`u` = the sheet's y, `v` = minus its x), in
// which indents, leadings and the frames' insets are read as for any text,
// and `sheetRect` puts a box of that frame back on the sheet. What is left
// of an item's turn after the quarter turn (0 for a plain vertical page)
// turns its text frame.
//
// A range of a vertical line says what the Japanese composer cannot tell
// from the characters: tate-chu-yoko cells, a ruby reading, a warichu
// note, and the room Postext took from or gave to a cell (punctuation set
// on half a cell, the quarter space beside Latin words) as tracking.

import { flowToPage, graphemesOf, pageIsVertical, verticalOrientation, verticalRuns } from 'postext';
import type { CjkRegion, DisplayLine, DisplayRect, DisplayRun, VDTPage } from 'postext';
import type { VDTFrame } from 'postext/writer';
import { escapeAttr } from '../xml/write.js';
import { parseCssFont } from './fonts.js';
import { attr } from './parts.js';
import type { TextItem, Writer } from './writer.js';

export const isVertical = (item: { lines: readonly { vertical?: boolean }[] }): boolean => item.lines.some((l) => l.vertical);

/** An item's lines as horizontal ones (the lines of a horizontal frame
 *  of a vertical page, which the display list marks as the page's). */
export function asHorizontal(item: TextItem): TextItem {
  return { ...item, lines: item.lines.map(({ vertical: _, ...l }) => l) };
}

/** A clockwise angle in (-180, 180]. */
function angle(deg: number): number {
  let r = deg % 360;
  if (r > 180) r -= 360;
  if (r <= -180) r += 360;
  return Math.abs(r) < 1e-9 ? 0 : r;
}

/** A vertical text item in the frame of lines: the sheet turned back a
 *  quarter turn (`u` = y, `v` = −x), where its lines are horizontal. Its
 *  `rotate` is what its own turn adds to the quarter turn. */
export function asLines(item: TextItem): TextItem {
  const cx = item.bbox.x + item.bbox.width / 2;
  const cy = item.bbox.y + item.bbox.height / 2;
  // The item's unturned frame, turned a quarter turn about its centre,
  // is the sheet: a translation takes it to the frame of lines.
  const dx = cy - cx;
  const dy = -(cx + cy);
  const rect = (r: DisplayRect): DisplayRect => ({ x: r.x + dx, y: r.y + dy, width: r.width, height: r.height });
  const lines = item.lines.map((l): DisplayLine => ({ ...l, x: l.x + dx, baseline: l.baseline + dy, runs: l.runs.map((r) => ({ ...r, x: r.x + dx })) }));
  const out: TextItem = { ...item, bbox: rect(item.bbox), lines, ...(item.clip ? { clip: rect(item.clip) } : {}) };
  const rest = angle((item.rotate ?? 0) - 90);
  if (rest) out.rotate = rest;
  else delete out.rotate;
  return out;
}

/** A box of the frame of lines on the sheet. */
export const sheetRect = (r: DisplayRect): DisplayRect => ({ x: -(r.y + r.height), y: r.x, width: r.height, height: r.width });

/** Whether a composed frame sets its text vertically: its own writing
 *  mode, else its page's. */
export function frameIsVertical(w: Writer, frame: VDTFrame): boolean {
  const mode = (frame as { writingMode?: string }).writingMode;
  return mode === 'vertical-rl' || (mode !== 'horizontal-tb' && !!w.page && pageIsVertical(w.page));
}

/** Where a composed frame stands when its text is vertical or its page
 *  is: its box in the frame its items are told in (the frame of lines for
 *  vertical text, the sheet for a horizontal frame of a vertical page) and
 *  the turn its text frame takes. A frame's `rect` is told before any
 *  turn, in the page's flow on a vertical page, and its `rotate` holds the
 *  quarter turn of a writing mode of its own. Undefined for a horizontal
 *  frame of a horizontal page (`rect` and `rotate` say it). */
export function frameBox(w: Writer, frame: VDTFrame, vertical: boolean): { box: DisplayRect; rotate: number } | undefined {
  const turned = !!w.page && pageIsVertical(w.page);
  if (!vertical && !turned) return undefined;
  const r = frame.rect;
  const mid = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  const c = turned ? flowToPage(w.page!, mid.x, mid.y) : mid;
  const total = (frame.rotate || 0) + (turned ? 90 : 0);
  if (vertical) return { box: { x: c.y - r.width / 2, y: -c.x - r.height / 2, width: r.width, height: r.height }, rotate: angle(total - 90) };
  return { box: { x: c.x - r.width / 2, y: c.y - r.height / 2, width: r.width, height: r.height }, rotate: angle(total) };
}

/** What a paragraph of a vertical story says with its lines kept: the
 *  Japanese single-line composer, leading from baseline to baseline (as
 *  the leadings are told), no numbers set upright but those the ranges
 *  flag, and no line-breaking or spacing rules (the breaks are forced, the
 *  spacing is in the ranges' tracking). */
export const VERTICAL_KEPT = ' Composer="$ID/HL Single J" LeadingModel="LeadingModelRoman" AutoTcy="0" RotateSingleByteCharacters="false"';
export const VERTICAL_KEPT_PROPS = '<KinsokuSet type="enumeration">Nothing</KinsokuSet><Mojikumi type="enumeration">Nothing</Mojikumi>';
/** On every range of vertical text: no pair kerning. InDesign kerns kana
 *  by the font's metrics (the styles' `KerningMethod`), which sets a line
 *  of forty characters about a tenth shorter than Postext's whole cells
 *  (seen in InDesign 2026); it is a character's attribute, and on the
 *  paragraph it is not read. */
export const VERTICAL_RANGE = ' KerningMethod="$ID/None"';
export const unkerned = <T extends { extra?: string }>(run: T): T => ({ ...run, extra: (run.extra ?? '') + VERTICAL_RANGE });
/** A paragraph of a vertical story left to InDesign's composer. */
export const VERTICAL_REFLOW = ' Composer="$ID/HL Composer J" LeadingModel="LeadingModelRoman"';

/** Opening brackets and quotes: the room a half cell leaves out is before
 *  them. */
const OPENING = /^[（「『【〔〈《［｛〖〘〚“‘〝]/;

/** A piece of a vertical run: its text, the attributes its range sets,
 *  and the advance (px) Postext took from or gave to each character
 *  (`track`) or took before the piece (`pull`). */
export interface VerticalPiece {
  text: string;
  extra?: string;
  track?: number;
  pull?: number;
}

interface Cell {
  start: number;
  end: number;
  kind: 'tcy' | 'side' | 'cell';
  ems: number;
}

const lineCells = new WeakMap<DisplayLine, Cell[]>();

function settings(w: Writer): { region: CjkRegion; digits: number } {
  const cjk = (w.doc.config as { cjk?: { region?: CjkRegion; uprightDigits?: number } }).cjk;
  return { region: cjk?.region ?? 'mainland', digits: cjk?.uprightDigits ?? 2 };
}

/** The cells and sideways runs of a text, as the measurer and the
 *  painters cut it (`verticalRuns`). */
function cellsOf(w: Writer, text: string): Cell[] {
  const { region, digits } = settings(w);
  const out: Cell[] = [];
  let at = 0;
  for (const r of verticalRuns(graphemesOf(text), region, digits)) {
    const end = at + r.text.length;
    out.push({ start: at, end, kind: r.glyph.orient === 'tcy' ? 'tcy' : r.glyph.orient === 'sideways' ? 'side' : 'cell', ems: r.cell ?? 0 });
    at = end;
  }
  return out;
}

/** A ruby reading on its base: one reading over the whole base, or a
 *  character's own. */
function rubyAttrs(w: Writer, run: DisplayRun, text: string): string {
  const r = run.ruby!;
  const group = r.group || graphemesOf(text).length > 1;
  const size = parseCssFont(r.fontString).sizePx * w.k;
  return ` RubyFlag="1" RubyString="${escapeAttr(r.text)}" RubyType="${group ? 'GroupRuby' : 'PerCharacterRuby'}" RubyPosition="${r.position === 'under' ? 'BelowLeft' : 'AboveRight'}"${size > 0 ? attr('RubyFontSize', size) : ''}`;
}

/** The pieces of a run of a vertical line, `text` being the run's words
 *  as the export writes them. With `spacing` (lines kept) the pieces say
 *  where Postext set a cell narrower or wider than its em. */
export function verticalPieces(w: Writer, line: DisplayLine, run: DisplayRun, text: string, spacing: boolean): VerticalPiece[] {
  if (!text) return [];
  if (run.kunten) w.warn('text.vertical.kunten', `Kanbun marks (kaeriten, okurigana) are left out: "${line.text.slice(0, 40)}"`);
  // What is not the run's own characters (a chip's thin spaces, a tab).
  if (text !== run.text) return [{ text }];
  const { region } = settings(w);
  const ruby = run.ruby ? rubyAttrs(w, run, text) : '';
  if (run.warichu) return [{ text, extra: `${ruby} Warichu="true" WarichuLines="2"` }];
  if (run.tcy) return [{ text, extra: `${ruby} Tatechuyoko="true"` }];
  const sideways = (g: string) => verticalOrientation(g, region).orient === 'sideways';
  if (run.orientation === 'sideways') {
    // Latin runs sideways by itself; a character that stands in a cell is turned in it.
    if (graphemesOf(text).every(sideways)) return [{ text, ...(ruby ? { extra: ruby } : {}) }];
    w.warn('text.vertical.sideways', `Characters turned sideways in vertical text (:sideways) are written with a character rotation; check them: "${text.slice(0, 40)}"`);
    return [{ text, extra: `${ruby} CharacterRotation="-90"` }];
  }
  if (run.orientation === 'upright') {
    // Each character upright in a cell: a Latin one is a tate-chu-yoko
    // cell of one character.
    if (ruby) return [{ text, extra: ruby }];
    const out: VerticalPiece[] = [];
    for (const g of graphemesOf(text)) {
      const last = out[out.length - 1];
      if (sideways(g)) out.push({ text: g, extra: ' Tatechuyoko="true"' });
      else if (last && !last.extra) last.text += g;
      else out.push({ text: g });
    }
    return out;
  }
  // The run's part of its line's cells (a short number is told upright
  // from the characters about it), or its own when the line reads otherwise.
  let cells: Cell[];
  if (line.text.startsWith(text, run.textStart)) {
    let all = lineCells.get(line);
    if (!all) lineCells.set(line, (all = cellsOf(w, line.text)));
    const a = run.textStart;
    const b = a + text.length;
    cells = all.filter((c) => c.end > a && c.start < b).map((c) => (c.start >= a && c.end <= b ? { ...c, start: c.start - a, end: c.end - a } : { ...c, start: Math.max(c.start, a) - a, end: Math.min(c.end, b) - a, kind: 'side' as const }));
  } else cells = cellsOf(w, text);
  if (ruby) return [{ text, extra: cells.length === 1 && cells[0]!.kind === 'tcy' ? `${ruby} Tatechuyoko="true"` : ruby }];
  const out: VerticalPiece[] = [];
  for (const c of cells) {
    const piece = text.slice(c.start, c.end);
    const last = out[out.length - 1];
    if (c.kind === 'tcy') out.push({ text: piece, extra: ' Tatechuyoko="true"' });
    else if (last && !last.extra) last.text += piece;
    else out.push({ text: piece });
  }
  // Cells set on less or more than their em (a bracket or a stop on half
  // a cell): the difference, on the side the cell lost it.
  if (spacing && out.length === 1 && cells.every((c) => c.kind === 'cell')) {
    const sizePx = parseCssFont(run.fontString).sizePx;
    const n = cells.length;
    const natural = cells.reduce((s, c) => s + c.ems, 0) * sizePx + (run.tracking ?? 0) * n;
    const delta = run.width - natural;
    if (sizePx > 0 && Math.abs(delta) > 0.02 * sizePx) {
      if (delta < 0 && n === 1 && OPENING.test(text)) out[0]!.pull = delta;
      else out[0]!.track = delta / n;
    }
  }
  return out;
}

const DOTS = new Set(['dot', 'circle', 'sesame']);

/** Whether a laid-out page holds emphasis dots (`:dots[…]`, 着重号, 傍点):
 *  marks of its lines the display list does not carry. */
export function hasEmphasisDots(page: VDTPage): boolean {
  const seen = new Set<object>();
  const stack: unknown[] = [page];
  while (stack.length) {
    const v = stack.pop();
    if (!v || typeof v !== 'object' || ArrayBuffer.isView(v) || seen.has(v)) continue;
    seen.add(v);
    if (Array.isArray(v)) {
      for (const x of v) if (x && typeof x === 'object') stack.push(x);
      continue;
    }
    const marks = (v as { marks?: unknown }).marks;
    if (Array.isArray(marks) && marks.some((m) => m && typeof m === 'object' && DOTS.has((m as { kind?: string }).kind ?? ''))) return true;
    for (const x of Object.values(v)) if (x && typeof x === 'object') stack.push(x);
  }
  return false;
}
