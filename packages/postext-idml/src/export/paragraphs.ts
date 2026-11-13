// The text of a paragraph: its runs as the paragraph reads (hyphens a
// break added dropped, chips as words and thin spaces), each run's
// character properties, and a shrunk frame's items as painted.

import type { DisplayLine, DisplayRect, DisplayRun } from 'postext';
import type { VDTFrame } from 'postext/writer';
import { withPxSize } from 'postext/writer';
import { CHIP_PLACEHOLDER } from 'postext/writer';
import { swatch } from './colours.js';
import { faceOf, parseCssFont } from './fonts.js';
import { inlineObjectXml } from './inline.js';
import { chipRect } from './geometry.js';
import { textPropsAttrs, type TextProps } from './parts.js';
import { verticalPieces, type VerticalPiece } from './vertical.js';
import { isField, type TextItem, type Writer } from './writer.js';

/** A frame's text scale (`fit.shrinkText`, #858), 1 when it has none. */
export const textScale = (frame: VDTFrame | undefined): number => {
  const s = frame?.scale;
  return s !== undefined && Number.isFinite(s) && s > 0 && Math.abs(s - 1) > 1e-9 ? s : 1;
};

/** A text item of a frame whose fit shrank its text (#858) as it is
 *  painted. The display list puts the centre of such an item's box where
 *  the frame's scale puts it, but keeps the item at the size it was laid
 *  out in, `1 / scale` as large, for a painter that scales it about that
 *  centre (`placeText`). The writer reads where lines stand (indents, the
 *  frame's insets, the space between paragraphs) and sets sizes in pt, so
 *  it takes the item as painted: positions scaled about the centre,
 *  lengths, text sizes, tracking and shifts by the scale. */
export function asPainted(item: TextItem, s: number): TextItem {
  if (s === 1) return item;
  const cx = item.bbox.x + item.bbox.width / 2;
  const cy = item.bbox.y + item.bbox.height / 2;
  const x = (v: number) => cx + (v - cx) * s;
  const y = (v: number) => cy + (v - cy) * s;
  const rect = (r: DisplayRect): DisplayRect => ({ x: x(r.x), y: y(r.y), width: r.width * s, height: r.height * s });
  const font = (f: string) => withPxSize(f, (n) => Number(n) * s);
  const run = (r: DisplayRun): DisplayRun => {
    const out: DisplayRun = { ...r, x: x(r.x), width: r.width * s, fontString: font(r.fontString) };
    if (r.tracking) out.tracking = r.tracking * s;
    if (r.baselineShift) out.baselineShift = r.baselineShift * s;
    if (r.padStart) out.padStart = r.padStart * s;
    if (r.padEnd) out.padEnd = r.padEnd * s;
    const inl = r.inline;
    if (inl) {
      const { box, field } = inl;
      out.inline = {
        ...inl,
        widthPx: inl.widthPx * s,
        heightPx: inl.heightPx * s,
        ...(inl.ascentPx !== undefined ? { ascentPx: inl.ascentPx * s } : {}),
        ...(box
          ? {
              box: {
                ...box,
                dx: box.dx * s,
                width: box.width * s,
                ascent: box.ascent * s,
                descent: box.descent * s,
                ...(box.strokeWidthPx !== undefined ? { strokeWidthPx: box.strokeWidthPx * s } : {}),
                ...(box.radius !== undefined ? { radius: box.radius * s } : {}),
              },
            }
          : {}),
        ...(field?.sizePx !== undefined ? { field: { ...field, sizePx: field.sizePx * s } } : {}),
      };
    }
    return out;
  };
  const lines = item.lines.map((l): DisplayLine => ({
    ...l,
    x: x(l.x),
    width: l.width * s,
    baseline: y(l.baseline),
    lineHeight: l.lineHeight * s,
    runs: l.runs.map(run),
    ...(l.spaceWidth !== undefined ? { spaceWidth: l.spaceWidth * s } : {}),
  }));
  return { ...item, bbox: rect(item.bbox), lines, ...(item.clip ? { clip: rect(item.clip) } : {}) };
}

/** Roles whose lines are told against the measure they were set in
 *  (body text, lists, quotations, notes, code): their start and end say
 *  their indents. Every other role's lines are as wide as their words. */
const MEASURED_ROLES = new Set<TextItem['role']>(['body', 'list', 'quote', 'footnote', 'code', 'marker', 'dropCap', 'cell']);

/** A text item whose lines are as wide as their words (a heading, a
 *  running head, a design's text), each line told as standing in the
 *  item's box with the alignment where it stands: centred when it leaves
 *  the same room on both sides, set right when it leaves none at the
 *  right, set left when it leaves none at the left. Read from where the
 *  words stand, a centred line was a ragged left line with a left and a
 *  right indent of its own, and a ragged line a right indent as wide as
 *  the room it left: local formatting a reader takes for a look of its own
 *  (#1555). Lines that do not agree, or a role whose lines carry their
 *  measure, are left as they are. */
export function alignedItem(item: TextItem): TextItem {
  if (MEASURED_ROLES.has(item.role) || item.rotate || !item.lines.length) return item;
  const box = item.bbox;
  let align: 'left' | 'center' | 'right' | undefined;
  for (const l of item.lines) {
    if (l.align !== 'left' || l.rtl || l.vertical) return item;
    const tol = Math.max(2, l.lineHeight * 0.25);
    const before = l.x - box.x;
    const after = box.x + box.width - (l.x + l.width);
    if (before < -tol || after < -tol * 2) return item;
    const own = before > tol && Math.abs(before - after) <= tol ? 'center' : before > tol && after <= tol ? 'right' : before <= tol ? 'left' : undefined;
    if (!own || (align && own !== align)) return item;
    align = own;
  }
  if (!align) return item;
  return { ...item, lines: item.lines.map((l) => ({ ...l, x: box.x, width: box.width, align: align! })) };
}

export function runProps(w: Writer, run: DisplayRun): TextProps {
  const f = parseCssFont(run.fontString);
  const face = faceOf(w, f.family, run.bold && f.weight < 600 ? 700 : f.weight, run.italic || f.italic);
  const sizePt = f.sizePx * w.k;
  const p: TextProps = {
    font: face.family,
    fontStyle: face.style,
    size: sizePt,
    color: swatch(w, run.color)?.ref ?? 'Color/Black',
    tracking: run.tracking && f.sizePx ? Math.round((run.tracking / f.sizePx) * 10000) / 10 : 0,
  };
  if (run.smallCaps) p.capitalization = 'SmallCaps';
  if (run.script === 'sup') p.position = 'Superscript';
  if (run.script === 'sub') p.position = 'Subscript';
  if (run.baselineShift) p.baselineShift = run.baselineShift * w.k;
  if (w.halo) {
    const ink = swatch(w, w.halo.color)?.ref;
    if (ink) {
      p.color = ink;
      p.stroke = { color: ink, weight: w.halo.weight };
    }
  }
  if (run.underline) p.underline = true;
  if (run.strike) p.strike = true;
  return p;
}

export const sameProps = (a: TextProps, b: TextProps) =>
  a.font === b.font && a.fontStyle === b.fontStyle && Math.abs(a.size - b.size) < 0.01 && a.color === b.color && a.tracking === b.tracking && a.capitalization === b.capitalization && a.position === b.position && a.baselineShift === b.baselineShift && !a.underline === !b.underline && !a.strike === !b.strike && a.stroke?.color === b.stroke?.color && a.stroke?.weight === b.stroke?.weight;

/** What a range sets beyond its paragraph style. */
export function overrides(p: TextProps, style: TextProps): string {
  const d: Partial<TextProps> = {};
  if (p.fontStyle !== style.fontStyle || p.font !== style.font) d.fontStyle = p.fontStyle;
  if (Math.abs(p.size - style.size) >= 0.01) d.size = p.size;
  if (p.color !== style.color) d.color = p.color;
  if (p.tracking !== style.tracking) d.tracking = p.tracking;
  if (p.capitalization !== style.capitalization) d.capitalization = p.capitalization;
  if (p.position !== style.position) d.position = p.position;
  if (p.baselineShift !== style.baselineShift) d.baselineShift = p.baselineShift;
  if (!p.underline !== !style.underline) d.underline = !!p.underline;
  if (!p.strike !== !style.strike) d.strike = !!p.strike;
  if (p.stroke && (p.stroke.color !== style.stroke?.color || p.stroke.weight !== style.stroke?.weight)) d.stroke = p.stroke;
  return textPropsAttrs(d);
}

const JUSTIFICATION: Record<string, string> = { left: 'LeftAlign', right: 'RightAlign', center: 'CenterAlign', justify: 'LeftJustified' };

/** The paragraph's alignment; undefined when its lines cannot tell (a
 *  justified paragraph of one line reads ragged left). */
export function paragraphJustification(lines: DisplayLine[]): string | undefined {
  if (lines.some((l) => l.align === 'justify')) return JUSTIFICATION.justify!;
  if (lines.every((l) => l.last) && lines[0]?.align === 'left') return undefined;
  return JUSTIFICATION[lines[0]?.align ?? 'left'] ?? 'LeftAlign';
}

/** Thin spaces (U+2009, about a fifth of an em) filling `px` at `sizePx`. */
const thinSpaces = (px: number | undefined, sizePx: number): string => ' '.repeat(Math.max(0, Math.round((px ?? 0) / (sizePx * 0.2))));

/** The runs of one line that set text, each with its words as the
 *  export writes them: a chip's words join the text (its box is a
 *  rectangle of its own, `chipRects`), its gap, border and padding as thin
 *  spaces; an empty chip (a blank to fill in) and a form field's chip are
 *  their box's width in thin spaces. With `tabLeaders` the leaders before
 *  tab stops are left to the stops (`TabList`), not set as text. */
function paintedRuns(w: Writer, line: DisplayLine, tabLeaders: boolean): { run: DisplayRun; text: string; object?: string }[] {
  // What is drawn in the line, not set: an inline object each.
  const objects = new Map<DisplayRun, string>();
  if (w.opts.inlineObjects !== false) {
    for (const r of line.runs) {
      const xml = inlineObjectXml(w, r);
      if (xml) objects.set(r, xml);
    }
  }
  // A form field's chip is room for the field (`chipFields`): its words
  // are left out.
  let fieldEnd = -Infinity;
  const runs = line.runs.filter((r) => {
    if (isField(w, r)) {
      const rect = chipRect(r, line);
      fieldEnd = rect ? rect.x + rect.width : r.x + r.width;
      return true;
    }
    if (!r.inline && r.x < fieldEnd - 0.01) return false;
    if (tabLeaders && r.leader) return false;
    return !r.inline || r.inline.kind === 'chip' || objects.has(r);
  });
  if (line.runs.some((r) => r.inline && r.inline.kind !== 'chip' && !objects.has(r))) w.warn('text.inline', `Inline content (maths, music, swatches) is left out: "${line.text.slice(0, 40)}"`);
  // The text in reading order (the runs of a right-to-left line stand in
  // the order they are painted).
  if (line.rtl || runs.some((r) => r.rtl)) runs.sort((a, b) => a.textStart - b.textStart);
  return runs.map((run) => {
    const object = objects.get(run);
    if (object) return { run, text: '', object };
    let text = run.text;
    if (run.inline?.kind === 'chip' || run.padStart || run.padEnd) {
      const sizePx = parseCssFont(run.fontString).sizePx || 12;
      const words = text.replaceAll(CHIP_PLACEHOLDER, '');
      text = run.inline?.kind === 'chip' && (!words.trim() || isField(w, run)) ? thinSpaces(run.inline.box?.width, sizePx) : `${thinSpaces(run.padStart, sizePx)}${words}${thinSpaces(run.padEnd, sizePx)}`;
    }
    return { run, text };
  });
}

/** A tab stop a line needs: where the text after the tab starts (sheet
 *  px), and the leader that fills the way there. */
export interface LineStop {
  x: number;
  leader?: string;
}

/** Where a run links to: a web address, or a page of the book (its index
 *  in the documents written). */
export interface RunLink {
  url?: string;
  page?: number;
}

export interface TextRun {
  text: string;
  props: TextProps;
  link?: RunLink;
  /** An inline object in place of text (its XML). */
  object?: string;
  /** Attributes the range sets beside its look (vertical text: a
   *  tate-chu-yoko cell, a ruby reading). Such a run joins no other. */
  extra?: string;
  /** The named Postext style that set the run (a chip's, a `:span`'s):
   *  its character style's name (#1555). */
  named?: string;
}

/** A run's words as the pieces its line's setting cuts them in: one,
 *  but in a vertical line (`vertical.ts`). */
function piecesOf(w: Writer, line: DisplayLine, run: DisplayRun, text: string, spacing: boolean): VerticalPiece[] {
  return line.vertical ? verticalPieces(w, line, run, text, spacing) : text ? [{ text }] : [];
}

/** `props` with `px` more advance after each character. */
function tracked(w: Writer, props: TextProps, px: number): TextProps {
  return props.size > 0 ? { ...props, tracking: Math.round((props.tracking + ((px * w.k) / props.size) * 1000) * 10) / 10 } : props;
}

/** `px` more (or less) room after the last character set: its tracking.
 *  False when there is no character to carry it. */
function roomAfter(w: Writer, out: TextRun[], px: number): boolean {
  const last = out[out.length - 1];
  if (!last || last.object || last.extra || !last.text) return false;
  const chars = [...last.text];
  const tail = chars.pop()!;
  const props = tracked(w, last.props, px);
  if (!chars.length) last.props = props;
  else {
    last.text = chars.join('');
    out.push({ text: tail, props, ...(last.link ? { link: last.link } : {}), ...(last.named ? { named: last.named } : {}) });
  }
  return true;
}

/** Add a run's pieces to a line's (or a paragraph's) runs. */
function pushPieces(w: Writer, out: TextRun[], pieces: VerticalPiece[], base: TextProps, link: RunLink | undefined, named?: string): void {
  for (const piece of pieces) {
    // At the head of a line no character stands before the bracket to
    // carry the pull: the bracket takes the font's proportional metrics,
    // which leave out the blank half of its cell (seen in InDesign 2026;
    // tracking on a zero-width space before it does nothing there).
    const headPull = !!piece.pull && !roomAfter(w, out, piece.pull);
    if (headPull) {
      out.push({ text: piece.text, props: base, ...(link ? { link } : {}), ...(named ? { named } : {}), extra: `${piece.extra ?? ''} OTFProportionalMetrics="true"` });
      continue;
    }
    const props = piece.track ? tracked(w, base, piece.track) : base;
    const last = out[out.length - 1];
    if (last && !last.object && !last.extra && !piece.extra && sameProps(last.props, props) && sameLink(last.link, link) && last.named === named) last.text += piece.text;
    else out.push({ text: piece.text, props, ...(link ? { link } : {}), ...(named ? { named } : {}), ...(piece.extra ? { extra: piece.extra } : {}) });
  }
}

export const runLink = (run: DisplayRun): RunLink | undefined => (run.href ? { url: run.href } : run.pageLink !== undefined ? { page: run.pageLink } : undefined);
export const sameLink = (a: RunLink | undefined, b: RunLink | undefined): boolean => a?.url === b?.url && a?.page === b?.page;

/** The runs of a text item line by line, as painted: a hyphen a break
 *  added or repeated stays, nothing is put back between lines. For lines
 *  kept as Postext broke them. */
export function linesRuns(w: Writer, item: TextItem, tabLeaders = false, stops?: LineStop[][]): TextRun[][] {
  return item.lines.map((line, li) => {
    const out: TextRun[] = [];
    const painted = paintedRuns(w, line, tabLeaders);
    painted.forEach(({ run, text: words, object }, ri) => {
      if (object) {
        out.push({ text: '', props: runProps(w, run), object });
        return;
      }
      let text = words;
      // A leader, or a tab, with no stops from the paragraph's style (a
      // contents row): a tab to where it ends, filled with the leader's
      // mark. The space Postext leaves on either side of a leader is room,
      // not a word space: a tab of its own, to where the next run starts.
      if (stops && !tabLeaders) {
        const beside = !words.trim() && words !== '\t' && (painted[ri - 1]?.run.leader || painted[ri + 1]?.run.leader);
        if (run.leader || text === '\t' || beside) {
          const mark = run.leader ? text.trim().charAt(0) : '';
          (stops[li] ??= []).push({ x: run.x + run.width, ...(mark ? { leader: mark } : {}) });
          text = '\t';
        }
      }
      if (!text) {
        // Room with no character (the quarter space beside a Latin word
        // in a vertical line): on the character before it.
        if (line.vertical && !run.inline && run.width > 0) roomAfter(w, out, run.width);
        return;
      }
      pushPieces(w, out, piecesOf(w, line, run, text, true), runProps(w, run), text === '\t' ? undefined : runLink(run), run.namedStyle?.id);
    });
    // A space at a line's end would take part in its justification.
    const tail = out[out.length - 1];
    if (tail && !tail.object) {
      tail.text = tail.text.replace(/ +$/, '');
      if (!tail.text) out.pop();
    }
    return out;
  });
}

/** The runs of a text item as the paragraph reads: added and repeated
 *  hyphens dropped, the space a break swallowed put back. For paragraphs
 *  left to InDesign's composer. */
export function paragraphRuns(w: Writer, item: TextItem, tabLeaders = false): TextRun[] {
  const out: TextRun[] = [];
  const push = (text: string, props: TextProps, link?: RunLink, named?: string) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && !last.object && !last.extra && sameProps(last.props, props) && sameLink(last.link, link) && last.named === named) last.text += text;
    else out.push({ text, props, ...(link ? { link } : {}), ...(named ? { named } : {}) });
  };
  item.lines.forEach((line, li) => {
    const runs = paintedRuns(w, line, tabLeaders);
    runs.forEach(({ run, text: painted, object }, ri) => {
      if (object) {
        out.push({ text: '', props: runProps(w, run), object });
        return;
      }
      let text = painted;
      if (li > 0 && ri === 0 && line.repeatedHyphen) text = text.replace(/^[-‐]/, '');
      if (ri === runs.length - 1 && line.addedHyphen) text = text.replace(/[-‐\u00ad]$/, '');
      if (line.vertical) pushPieces(w, out, piecesOf(w, line, run, text, false), runProps(w, run), runLink(run), run.namedStyle?.id);
      else push(text, runProps(w, run), runLink(run), run.namedStyle?.id);
    });
    const next = item.lines[li + 1];
    if (!next || !runs.length) return;
    const lastProps = out[out.length - 1]?.props ?? runProps(w, runs[0]!.run);
    const lastNamed = out[out.length - 1]?.named;
    // A forced break stays one: InDesign's forced line break (U+2028).
    if (line.hardBreak) push('\u2028', lastProps, undefined, lastNamed);
    else if (!line.addedHyphen) {
      const end = [...line.map].reverse().find((m) => m >= 0);
      const start = next.map.find((m) => m >= 0);
      const tail = line.text.slice(-1);
      const gap = end !== undefined && start !== undefined ? start - end > 1 : !/[\s\-‐–—\/]$/.test(tail);
      if (gap && !/\s$/.test(line.text) && !/^\s/.test(next.text)) push(' ', lastProps, undefined, lastNamed);
    }
  });
  return out;
}
