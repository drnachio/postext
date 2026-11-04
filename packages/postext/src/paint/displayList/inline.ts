// Inline boxes of a line as display runs (#1406): a chip's box and its
// words in their own faces, a swatch's colours and shape, so writers draw
// what the canvas and PDF paint (`canvas-backend/chip.ts`, `swatch.ts`).
import type { VDTChip, VDTSwatch } from '../../vdt/segments.js';
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
 * words (gap, border, padding), the last the room after them, so the
 * runs fill the segment. `run.text` is the chip runs' text joined.
 */
export function chipRuns(run: DisplayRun, chip: VDTChip, inkOffset = 0): DisplayRun[] {
  const inline = { kind: 'chip' as const, widthPx: run.width, heightPx: chip.ascent + chip.descent, ascentPx: chip.ascent, box: chipBox(chip, inkOffset) };
  const parts = chip.runs.filter((r) => r.text.length > 0);
  const joined = parts.map((r) => r.text).join('');
  if (parts.length === 0 || joined !== run.text) return [{ ...run, ...(chip.color ? { color: chip.color } : {}), inline }];
  const lead = inkOffset + chip.marginLeft + chip.borderWidth + chip.paddingX;
  const out: DisplayRun[] = [];
  let x = run.x;
  let textStart = run.textStart;
  parts.forEach((r, i) => {
    const last = i === parts.length - 1;
    const width = last ? run.x + run.width - x : r.width + (i === 0 ? lead : 0);
    const part: DisplayRun = { ...run, text: r.text, x, width, fontString: r.fontString, color: chip.color ?? run.color, textStart };
    delete part.bold;
    delete part.italic;
    delete part.smallCaps;
    if (r.bold || /\b(bold|[6-9]00)\b/.test(r.fontString)) part.bold = true;
    if (r.italic || /\bitalic\b/.test(r.fontString)) part.italic = true;
    if (/\bsmall-caps\b/.test(r.fontString)) part.smallCaps = true;
    if (r.baselineShift) part.baselineShift = -r.baselineShift;
    else delete part.baselineShift;
    if (r.rtl) part.rtl = true;
    if (i === 0) part.inline = inline;
    else delete part.inline;
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
