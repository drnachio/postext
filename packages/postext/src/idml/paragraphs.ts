// The text of a paragraph: its runs as the paragraph reads (hyphens a
// break added dropped, chips as words and thin spaces), each run's
// character properties, and a shrunk frame's items as painted.

import type { DisplayLine, DisplayRect, DisplayRun } from '../paint/displayList/types.js';
import type { VDTFrame } from '../vdt/pages/composed.js';
import { withPxSize } from '../measure/fontString.js';
import { CHIP_PLACEHOLDER } from '../parse/inlineFormatting/inlineDirectives.js';
import { swatch } from './colours.js';
import { defaultFontStyleName, parseCssFont } from './fonts.js';
import { chipRect } from './geometry.js';
import { textPropsAttrs, type TextProps } from './parts.js';
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

export function runProps(w: Writer, run: DisplayRun): TextProps {
  const f = parseCssFont(run.fontString);
  const fontStyle = (w.opts.fontStyleName ?? defaultFontStyleName)(f.family, run.bold && f.weight < 600 ? 700 : f.weight, run.italic || f.italic);
  let styles = w.fonts.get(f.family);
  if (!styles) w.fonts.set(f.family, (styles = new Set()));
  styles.add(fontStyle);
  const sizePt = f.sizePx * w.k;
  const p: TextProps = {
    font: f.family,
    fontStyle,
    size: sizePt,
    color: swatch(w, run.color)?.ref ?? 'Color/Black',
    tracking: run.tracking && f.sizePx ? Math.round((run.tracking / f.sizePx) * 1000) : 0,
  };
  if (run.smallCaps) p.capitalization = 'SmallCaps';
  if (run.script === 'sup') p.position = 'Superscript';
  if (run.script === 'sub') p.position = 'Subscript';
  if (run.baselineShift) p.baselineShift = run.baselineShift * w.k;
  return p;
}

export const sameProps = (a: TextProps, b: TextProps) =>
  a.font === b.font && a.fontStyle === b.fontStyle && Math.abs(a.size - b.size) < 0.01 && a.color === b.color && a.tracking === b.tracking && a.capitalization === b.capitalization && a.position === b.position && a.baselineShift === b.baselineShift;

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

/** The runs of a text item as the paragraph reads: added and repeated
 *  hyphens dropped, the space a break swallowed put back. A chip's words
 *  join the text (its box is a rectangle of its own, `chipRects`), its
 *  gap, border and padding as thin spaces; an empty chip (a blank to fill
 *  in) is its box's width in thin spaces. With `tabLeaders` the leaders
 *  before tab stops are left to the stops (`TabList`), not set as text. */
export function paragraphRuns(w: Writer, item: TextItem, tabLeaders = false): { text: string; props: TextProps }[] {
  const out: { text: string; props: TextProps }[] = [];
  const push = (text: string, props: TextProps) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && sameProps(last.props, props)) last.text += text;
    else out.push({ text, props });
  };
  item.lines.forEach((line, li) => {
    // A form field's chip is room for the field (`chipFields`): its box's
    // width in thin spaces, its words left out.
    let fieldEnd = -Infinity;
    const runs = line.runs.filter((r) => {
      if (isField(w, r)) {
        const rect = chipRect(r, line);
        fieldEnd = rect ? rect.x + rect.width : r.x + r.width;
        return true;
      }
      if (!r.inline && r.x < fieldEnd - 0.01) return false;
      if (tabLeaders && r.leader) return false;
      return !r.inline || r.inline.kind === 'chip';
    });
    if (line.runs.some((r) => r.inline && r.inline.kind !== 'chip')) w.warn('text.inline', `Inline content (maths, music, swatches) is left out: "${line.text.slice(0, 40)}"`);
    runs.forEach((run, ri) => {
      let text = run.text;
      if (run.inline?.kind === 'chip' || run.padStart || run.padEnd) {
        const sizePx = parseCssFont(run.fontString).sizePx || 12;
        const words = text.replaceAll(CHIP_PLACEHOLDER, '');
        text = run.inline?.kind === 'chip' && (!words.trim() || isField(w, run)) ? thinSpaces(run.inline.box?.width, sizePx) : `${thinSpaces(run.padStart, sizePx)}${words}${thinSpaces(run.padEnd, sizePx)}`;
      }
      if (li > 0 && ri === 0 && line.repeatedHyphen) text = text.replace(/^[-‐]/, '');
      if (ri === runs.length - 1 && line.addedHyphen) text = text.replace(/[-‐­]$/, '');
      push(text, runProps(w, run));
    });
    const next = item.lines[li + 1];
    if (!next || !runs.length) return;
    const lastProps = out[out.length - 1]?.props ?? runProps(w, runs[0]!);
    // A forced break stays one: InDesign's forced line break (U+2028).
    if (line.hardBreak) push(' ', lastProps);
    else if (!line.addedHyphen) {
      const end = [...line.map].reverse().find((m) => m >= 0);
      const start = next.map.find((m) => m >= 0);
      const tail = line.text.slice(-1);
      const gap = end !== undefined && start !== undefined ? start - end > 1 : !/[\s\-‐–—\/]$/.test(tail);
      if (gap && !/\s$/.test(line.text) && !/^\s/.test(next.text)) push(' ', lastProps);
    }
  });
  return out;
}
