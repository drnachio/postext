// Inline boxes of a line as display runs (#1406): a chip's box and its
// words in their own faces, a swatch's colours and shape, so writers draw
// what the canvas and PDF paint (`canvas-backend/chip.ts`, `swatch.ts`).
import type { VDTChip, VDTChipRun, VDTSwatch } from '../../vdt/segments.js';
import type { DisplayChipBox, DisplayRun, DisplaySwatch } from './types.js';

/** A chip's box from the run that starts at its segment's left edge
 *  (`inkOffset`: where a design run paints it). */
export function chipBox(chip: VDTChip, inkOffset = 0): DisplayChipBox {
  const box: DisplayChipBox = { dx: inkOffset + chip.marginLeft, width: chip.boxWidth, ascent: chip.ascent, descent: chip.descent };
  if (chip.background) box.fill = chip.background;
  if (chip.borderColor && chip.borderWidth > 0) {
    box.stroke = chip.borderColor;
    box.strokeWidthPx = chip.borderWidth;
  }
  if (chip.borderRadius > 0) box.radius = chip.borderRadius;
  if (chip.underline) box.underline = chip.underline;
  return box;
}

/**
 * A chip segment's runs: `run` (the segment's, at its x and width) cut
 * into one run per chip run, each in its own face and the chip's colour
 * when it sets one. The first carries the box and the room before the
 * words (gap, border, padding, `padStart`), the last the room after
 * them (`padEnd`), so the runs fill the segment. `run.text` is the chip
 * runs' text joined. `inkFor`: a chip run's colour when the chip sets
 * none (body lines pick it by the run's own emphasis, as the painters'
 * `inkFor` does); the segment's colour otherwise.
 */
export function chipRuns(run: DisplayRun, chip: VDTChip, inkOffset = 0, inkFor?: (r: VDTChipRun) => string): DisplayRun[] {
  // A form field (#1445) goes with the box, for writers that make one.
  const inline = { kind: 'chip' as const, widthPx: run.width, heightPx: chip.ascent + chip.descent, ascentPx: chip.ascent, box: chipBox(chip, inkOffset), ...(chip.field ? { field: chip.field } : {}) };
  const parts = chip.runs.filter((r) => r.text.length > 0);
  const joined = parts.map((r) => r.text).join('');
  // A blank's answer is laid out, never painted (#1227): every run says so.
  const blank = chip.blank ? { blank: true as const } : {};
  // Every run of the chip's words names its chip style (#1555).
  const named = { namedStyle: { kind: 'chip' as const, id: chip.styleId } };
  if (parts.length === 0 || joined !== run.text) return [{ ...run, ...(chip.color ? { color: chip.color } : {}), inline, ...blank, ...named }];
  const lead = inkOffset + chip.marginLeft + chip.borderWidth + chip.paddingX;
  const out: DisplayRun[] = [];
  let x = run.x;
  let textStart = run.textStart;
  parts.forEach((r, i) => {
    const last = i === parts.length - 1;
    const width = last ? run.x + run.width - x : r.width + (i === 0 ? lead : 0);
    const part: DisplayRun = { ...run, text: r.text, x, width, fontString: r.fontString, color: chip.color ?? inkFor?.(r) ?? run.color, textStart, ...blank, ...named };
    // Emphasis stays the segment's: a bold or italic face the chip style
    // or its own words set is the run's face (`fontString`), which writers
    // set as a face, not as markup to read back.
    if (r.baselineShift) part.baselineShift = -r.baselineShift;
    else delete part.baselineShift;
    if (r.rtl) part.rtl = true;
    if (i === 0) part.inline = inline;
    else delete part.inline;
    delete part.padStart;
    delete part.padEnd;
    const before = i === 0 ? lead : 0;
    if (before > 0) part.padStart = before;
    if (last && width - r.width - before > 0) part.padEnd = width - r.width - before;
    out.push(part);
    x += width;
    textStart += r.text.length;
  });
  return out;
}

/** A swatch segment's paint; `ink` is the text's colour. */
export function swatchPaint(swatch: VDTSwatch | undefined, ink: string): DisplaySwatch {
  const out: DisplaySwatch = { ink: swatch?.borderColor ?? ink };
  if (!swatch) return out;
  if (swatch.color) out.color = swatch.color;
  if (swatch.side !== undefined) out.side = swatch.side;
  if (swatch.borderWidth !== undefined) out.borderWidth = swatch.borderWidth;
  if (swatch.radius !== undefined) out.radius = swatch.radius;
  if (swatch.icon) out.icon = true;
  return out;
}
