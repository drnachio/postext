// The words a `:::figure` sets on its picture (#860), back on the picture
// of a reflowable book (#955): one inline SVG laid over the image, in the
// picture's own coordinates, so the labels keep their place and their
// proportion whatever the width the reader gives the picture.
//
// Only what an SVG `<text>` says as well as the print does is drawn: a
// horizontal label of plain words, in bold or italic, with the halo and the
// plate of its style. Every word stands at the x the print measured, so a
// line the bidi algorithm reordered is drawn in its sheet order, and a word
// of a right-to-left script is its own right-to-left text anchored at its
// right edge (#969). A label with a formula, a chip, a mark, a script or a
// vertical column stays in the list of labels that follows the picture, out
// of sight, as before.

import type { ResolvedResourceBlock, VDTDesignPathBlock, VDTFigureLabelLayout, VDTLine, VDTLineSegment } from 'postext';
import { figureLabelLeaderPath, figureLabelMatrix, labelLayoutOnSheet, markerSvgElement, parseFontString, fontStringFamilies, pathSvgData, uncroppedPictureBox } from 'postext';
import { familyStack } from './css.js';
import { fontPx, xmlAttr, xmlText } from './inline.js';

const n = (v: number): string => String(+v.toFixed(3));

/** Segment fields an SVG `<text>` cannot set as the print does. */
function plain(seg: VDTLineSegment): boolean {
  return (seg.kind === 'text' || seg.kind === 'space')
    && !seg.script && !seg.baselineShift && !seg.stacked && !seg.cjkMarks && !seg.ruby && !seg.kunten
    && !seg.warichu && !seg.sideMarker && !seg.mark && !seg.chip && !seg.mathRender && !seg.swatch && !seg.footnoteId
    && !seg.tab && !seg.leader && !seg.labelTab && !seg.tcy && seg.orientation === undefined;
}

function drawable(layout: VDTFigureLabelLayout): boolean {
  if (layout.vertical || layout.mirrored) return false;
  return layout.lines.every((line) => !line.highlights?.length && (line.segments ?? []).every(plain));
}

/** The font of one segment: the label's face for its weight and slant,
 *  unless the segment carries its own. */
function faceOf(layout: VDTFigureLabelLayout, seg: VDTLineSegment): string {
  if (seg.fontString) return seg.fontString;
  if (seg.bold && seg.italic) return layout.boldItalicFontString;
  if (seg.bold) return layout.boldFontString;
  if (seg.italic) return layout.italicFontString;
  return layout.fontString;
}

function fontAttrs(font: string): string {
  const face = parseFontString(font);
  const parts = [`font-size="${n(fontPx(font))}"`];
  if (face) {
    parts.push(`font-family="${xmlAttr(familyStack(face.family, fontStringFamilies(font)[1]))}"`);
    if (face.weight !== 400) parts.push(`font-weight="${face.weight}"`);
    if (face.style === 'italic') parts.push('font-style="italic"');
  }
  return parts.join(' ');
}

/** One line as `<text>` elements: a `<tspan>` per word run at the x the
 *  layout measured, so a face with other metrics cannot push the words
 *  together. The runs stand in the order they have on the sheet; a word of
 *  a right-to-left script is its own right-to-left `<text>`, anchored at
 *  its right edge, so the browser joins its letters and puts its marks and
 *  stops on the right side. */
function lineText(layout: VDTFigureLabelLayout, line: VDTLine, extra: string): string {
  const y = n(line.baseline);
  const segments = line.segments ?? [];
  if (segments.length === 0) {
    if (line.text.trim() === '') return '';
    if (layout.direction === 'rtl') {
      return `<text direction="rtl" y="${y}"${extra}><tspan x="${n(line.bbox.x + line.bbox.width)}" ${fontAttrs(layout.fontString)}>${xmlText(line.text)}</tspan></text>`;
    }
    return `<text x="${n(line.bbox.x)}" y="${y}" ${fontAttrs(layout.fontString)}${extra}>${xmlText(line.text)}</text>`;
  }
  let x = line.bbox.x;
  const runs: string[] = [];
  const words: string[] = [];
  for (const i of line.order ?? segments.map((_, k) => k)) {
    const seg = segments[i]!;
    if (seg.kind === 'text' && seg.text.trim() !== '') {
      if (seg.rtl) {
        words.push(`<text direction="rtl" y="${y}"${extra}><tspan x="${n(x + seg.width)}" ${fontAttrs(faceOf(layout, seg))}>${xmlText(seg.text)}</tspan></text>`);
      } else {
        const tracking = seg.tracking ? ` letter-spacing="${n(seg.tracking)}"` : '';
        runs.push(`<tspan x="${n(x)}" ${fontAttrs(faceOf(layout, seg))}${tracking}>${xmlText(seg.text)}</tspan>`);
      }
    }
    x += seg.width;
  }
  return (runs.length === 0 ? '' : `<text y="${y}"${extra}>${runs.join('')}</text>`) + words.join('');
}

function labelGroup(layout: VDTFigureLabelLayout): string {
  const m = figureLabelMatrix(layout, 0, 0);
  const out: string[] = [];
  if (layout.background) {
    const plate = layout.background;
    const r = plate.rect;
    // A plate's outline (drawn inside it) and corners (#1058).
    const bw = plate.border?.widthPx ?? 0;
    const rect = bw > 0 ? { x: r.x + bw / 2, y: r.y + bw / 2, width: Math.max(0, r.width - bw), height: Math.max(0, r.height - bw) } : r;
    const radius = plate.radiusPx ? ` rx="${n(Math.max(0, plate.radiusPx - bw / 2))}"` : '';
    const stroke = plate.border && bw > 0 ? ` stroke="${xmlAttr(plate.border.color)}" stroke-width="${n(bw)}"` : '';
    out.push(`<rect x="${n(rect.x)}" y="${n(rect.y)}" width="${n(rect.width)}" height="${n(rect.height)}"${radius} fill="${plate.color ? xmlAttr(plate.color) : 'none'}"${stroke}/>`);
  }
  if (layout.halo && layout.halo.widthPx > 0) {
    const halo = ` fill="${xmlAttr(layout.halo.color)}" stroke="${xmlAttr(layout.halo.color)}" stroke-width="${n(2 * layout.halo.widthPx)}" stroke-linejoin="round"`;
    for (const line of layout.lines) out.push(lineText(layout, line, halo));
  }
  const ink = ` fill="${xmlAttr(layout.color)}"`;
  for (const line of layout.lines) out.push(lineText(layout, line, ink));
  const body = out.filter(Boolean).join('');
  return body ? `<g transform="matrix(${m.map(n).join(' ')})">${body}</g>` : '';
}

/** A label's leader (#1057) as SVG paths in the body's coordinates. */
function leaderSvg(path: VDTDesignPathBlock): string {
  const out: string[] = [];
  const stroke = path.stroke;
  if (stroke && stroke.widthPx > 0 && path.subpaths.length > 0) {
    const dash = stroke.dash && stroke.dash.length > 0 ? ` stroke-dasharray="${stroke.dash.map(n).join(' ')}"` : '';
    out.push(`<path d="${pathSvgData(path.subpaths)}" fill="none" stroke="${xmlAttr(stroke.color)}" stroke-width="${n(stroke.widthPx)}"${dash}/>`);
  }
  for (const m of path.markers ?? []) out.push(markerSvgElement(m, 0, 0, xmlAttr));
  return out.join('');
}

/**
 * The SVG laid over the picture of a figure with labels, or undefined when
 * no label can be drawn that way. Its viewBox is the picture's box in the
 * body's coordinates (the whole picture, past the safe area the print
 * crops to), so the labels land where the print puts them. The pages of a
 * right-to-left book are laid out mirrored: the caller says so with
 * `mirrored`, and the labels are drawn as they stand on the sheet.
 */
export function figureLabelsOverlay(rb: ResolvedResourceBlock, options: { mirrored?: boolean } = {}): string | undefined {
  if (rb.kind !== 'bitmap' && rb.kind !== 'svg') return undefined;
  // The labels of a mirrored page are given back as they stand on the sheet.
  const onSheet = (layout: VDTFigureLabelLayout): VDTFigureLabelLayout => (options.mirrored ? labelLayoutOnSheet(layout, rb.bodyRect.width) : layout);
  const drawn = (rb.labels ?? []).filter((l) => l.layout && drawable(l.layout)).map((l) => onSheet(l.layout!));
  // The leaders of the labels drawn here (#1057), under every label.
  const leaders = drawn.map((layout) => figureLabelLeaderPath(layout, 0, 0)).filter((p): p is VDTDesignPathBlock => p !== undefined).map(leaderSvg);
  const groups = [...leaders, ...drawn.map(labelGroup)].filter(Boolean);
  if (groups.length === 0) return undefined;
  const { width, height } = rb.bodyRect;
  const box = rb.bodySource ? uncroppedPictureBox(0, 0, width, height, rb.bodySource) : { x: 0, y: 0, width, height };
  return `<svg class="pt-label-layer" xmlns="http://www.w3.org/2000/svg" viewBox="${n(box.x)} ${n(box.y)} ${n(box.width)} ${n(box.height)}" preserveAspectRatio="none" aria-hidden="true" focusable="false">${groups.join('')}</svg>`;
}
