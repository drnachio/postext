// A horizontal line and what sits on it besides text: leaders, swatches,
// inline icons, chips, task boxes, bullets and drop caps
// (#1276: split out of html-backend.ts).
import { type VDTLineSegment, type VDTBlock, leaderRuleGeometry, type VDTSwatch, type VDTInlineIcon, type VDTChip, type VDTChipRun, type VDTLine, type VDTDropCap } from '../vdt.js';
import { hasCJK } from '../measure/cjk/cjk.js';
import { arabicMarkNeeded } from '../writing/bidi.js';
import { measureFontBox } from '../measure/canvas.js';
import { chipReadingsHtml, lineHighlightsHtml } from './htmlAnnotations.js';
import { hasSwatchShape, swatchGeometry, type SwatchGeometry } from '../paint/swatchShape.js';
import { inlineIconBox, iconLineDash } from '../measure/inlineIcon.js';
import { taskBoxText, taskBoxSvgBody } from '../paint/taskBox.js';
import { textDotsSvg } from './design.js';
import { imageUrl } from './images.js';
import { ownShaping, type HtmlPaint } from './render.js';
import { renderSegments } from './segments.js';
import { pickSegmentColor, renderTextSegment, lineEndText } from './segmentText.js';
import { quoteFontString, pickSegmentFont, type TextDirection, dirAttr, PLAIN_BOX, CJK_TEXT_DECL, CJK_FEATURES_DECL, ligaturesDecl, lineCjkDecl, cjkTextDecl } from './styles.js';
import { esc } from './textRuns.js';

/** A leader (#622, `VDTLineSegment.leader`): a contents row's or a tab
 *  stop's dots in the segment's font, or a rule under the baseline
 *  (`baselineOffset` from the line top), `aria-hidden` and unselectable,
 *  so neither a screen reader nor a copy reads it. */
export function leaderHtml(seg: VDTLineSegment, x: number, baselineOffset: number, block: VDTBlock): string {
  const color = pickSegmentColor(seg, block);
  const hidden = 'aria-hidden="true"';
  const noSelect = 'user-select:none;-webkit-user-select:none;pointer-events:none;';
  if (seg.leader === 'rule') {
    const m = /(\d*\.?\d+)px/.exec(block.fontString);
    const { dy, thickness } = leaderRuleGeometry(m ? Number(m[1]) : 16);
    return `<span ${hidden} style="position:absolute;left:${x.toFixed(3)}px;top:${(baselineOffset + dy - thickness / 2).toFixed(3)}px;`
      + `width:${seg.width.toFixed(3)}px;height:${thickness.toFixed(3)}px;background:${color};${noSelect}"></span>`;
  }
  const font = quoteFontString(pickSegmentFont(seg, block));
  const fontDecl = font !== quoteFontString(block.fontString) ? `font:${font};` : '';
  const colorDecl = color !== block.color ? `color:${color};` : '';
  // The dots are measured and painted on the canvas left to right, as a
  // text of their own. In the box of a right-to-left block the browser
  // draws them in the forms of the script around them: a contents row of
  // 66 `. ` in Amiri at 27.08 px is 441.46 px in the layout and on the
  // canvas and 544.23 px in the box, 318.34 px against 277.98 px in Noto
  // Naskh Arabic. With its own direction on the positioned box (an inline
  // one inside it changes nothing) the leader is 441.47 px and 318.34 px.
  // In a document shaped in its own language (#770); one that keeps its
  // host's measured the stop as the page had it and is written as it was.
  // The direction is the box's `dir`, not a `direction` declaration, which
  // an EPUB's pages may not carry (EPUBCheck CSS-001); Chrome sets the
  // leader the same with either (882.92 px for 66 `. ` in Amiri).
  const pos = `position:absolute;left:${x.toFixed(3)}px;top:0;white-space:pre;${noSelect}`;
  const dir = ownShaping ? ' dir="ltr"' : '';
  if (fontDecl) return `<span ${hidden} style="${pos}"${dir}><span style="${fontDecl}line-height:0;${colorDecl}">${esc(seg.text)}</span></span>`;
  return `<span ${hidden} style="${pos}${colorDecl}"${dir}>${esc(seg.text)}</span>`;
}

/** Inline colour swatch (`:swatch{…}`): a square of `side` px on the line's
 *  baseline (`baselineOffset` from the line top), filled with `fill` when
 *  the colour resolved and outlined in the text colour. */
function renderSwatch(x: number, baselineOffset: number, side: number, fill: string | undefined, ink: string): string {
  const stroke = Math.max(0.5, side * 0.06);
  return (
    `<span aria-hidden="true" style="position:absolute;left:${x.toFixed(3)}px;top:${(baselineOffset - side).toFixed(3)}px;` +
    `width:${side.toFixed(3)}px;height:${side.toFixed(3)}px;box-sizing:border-box;` +
    `border:${stroke.toFixed(2)}px solid ${ink};${fill ? `background:${fill};` : ''}"></span>`
  );
}

/** A `'swatch'` segment: its inline symbol when it carries one (#1058),
 *  else the colour swatch. */
export function renderSwatchSegment(
  swatch: VDTSwatch | undefined,
  x: number,
  baselineOffset: number,
  width: number,
  ink: string,
  paint?: HtmlPaint,
  rtl = false,
): string {
  if (swatch?.icon) return renderInlineIconHtml(swatch.icon, x, baselineOffset, ink, paint);
  if (swatch && hasSwatchShape(swatch)) return renderShapedSwatch(swatchGeometry(swatch, x, baselineOffset, width, rtl), swatch.color, swatch.borderColor ?? ink);
  return renderSwatch(x, baselineOffset, width, swatch?.color, ink);
}

/** A swatch with a shape of its own (#1104): the square of `g` (from the
 *  line top), its outline inside the edge, its corners rounded. */
function renderShapedSwatch(g: SwatchGeometry, fill: string | undefined, ink: string): string {
  const border = g.stroke > 0 ? `border:${g.stroke.toFixed(2)}px solid ${ink};` : '';
  const radius = g.radius > 0 ? `border-radius:${g.radius.toFixed(3)}px;` : '';
  return (
    `<span aria-hidden="true" style="position:absolute;left:${g.x.toFixed(3)}px;top:${g.y.toFixed(3)}px;` +
    `width:${g.side.toFixed(3)}px;height:${g.side.toFixed(3)}px;box-sizing:border-box;` +
    `${border}${radius}${fill ? `background:${fill};` : ''}"></span>`
  );
}

/**
 * An inline symbol (`:icon[alt]{…}`, #1058) on its line, its box standing
 * on the baseline (`baselineOffset` from the line top): a picture as an
 * `<img>` (a tinted one as the colour through the picture's mask), a glyph
 * and a line sample as a small SVG, so the glyph's baseline and the
 * stroke's dashes land where the canvas paints them. Named by its
 * alternative text (`role="img"`), hidden when it has none.
 */
function renderInlineIconHtml(icon: VDTInlineIcon, x: number, baselineOffset: number, ink: string, paint?: HtmlPaint): string {
  const box = inlineIconBox(icon, x, baselineOffset);
  const n = (v: number): string => String(+v.toFixed(3));
  const name = icon.alt ? `role="img" aria-label="${esc(icon.alt)}"` : 'aria-hidden="true"';
  const pos = `position:absolute;left:${n(box.x)}px;top:${n(box.y)}px;width:${n(box.width)}px;height:${n(box.height)}px;`;
  const color = icon.color ?? ink;
  if (icon.kind === 'glyph' && icon.glyph && icon.fontString) {
    return `<svg ${name} style="${pos}overflow:visible;" width="${n(box.width)}" height="${n(box.height)}"><text x="0" y="${n(box.height)}" fill="${esc(color)}" style="font:${esc(quoteFontString(icon.fontString))};">${esc(icon.glyph)}</text></svg>`;
  }
  if (icon.kind === 'line') {
    const dash = iconLineDash(icon);
    const y = n(box.height / 2);
    return `<svg ${name} style="${pos}overflow:visible;" width="${n(box.width)}" height="${n(box.height)}"><line x1="0" y1="${y}" x2="${n(box.width)}" y2="${y}" stroke="${esc(color)}" stroke-width="${n(icon.strokePx ?? 1)}"${dash ? ` stroke-dasharray="${dash.map(n).join(' ')}"` : ''}${icon.line === 'dotted' ? ' stroke-linecap="round"' : ''}/></svg>`;
  }
  const url = icon.fileId ? imageUrl(paint, icon.fileId, icon.resourceId) : undefined;
  if (!url) {
    const stroke = Math.max(0.5, box.height * 0.06);
    return `<span ${name} style="${pos}box-sizing:border-box;border:${stroke.toFixed(2)}px solid ${ink};"></span>`;
  }
  if (icon.color) {
    const mask = `url(&quot;${esc(url)}&quot;) center / 100% 100% no-repeat`;
    return `<span ${name} style="${pos}background:${esc(icon.color)};-webkit-mask:${mask};mask:${mask};"></span>`;
  }
  return `<img src="${esc(url)}" alt="${esc(icon.alt)}"${icon.alt ? '' : ' aria-hidden="true"'} style="${pos}"/>`;
}

export function renderChip(
  chip: VDTChip,
  x: number,
  baselineOffset: number,
  lineFont: string,
  lineColor: string,
  inkFor: (run: VDTChipRun) => string,
  /** The direction the document's root declares (see {@link dirAttr}). */
  rootDir: TextDirection = 'ltr',
): string {
  const bx = x + chip.marginLeft;
  const parts: string[] = [];
  const boxGeometry = `position:absolute;left:${bx.toFixed(3)}px;top:${(baselineOffset - chip.ascent).toFixed(3)}px;` +
    `width:${chip.boxWidth.toFixed(3)}px;height:${(chip.ascent + chip.descent).toFixed(3)}px;box-sizing:border-box;`;
  if (chip.background || (chip.borderColor && chip.borderWidth > 0)) {
    // An underline (#1227) is the box's bottom border alone.
    const border = chip.borderColor && chip.borderWidth > 0
      ? `${chip.underline ? 'border-bottom' : 'border'}:${chip.borderWidth.toFixed(3)}px ${chip.underline && chip.underline !== 'solid' ? chip.underline : 'solid'} ${chip.borderColor};`
      : '';
    parts.push(
      `<span aria-hidden="true" style="${boxGeometry}` +
      (chip.background ? `background:${chip.background};` : '') +
      border +
      (chip.borderRadius > 0 && !chip.underline ? `border-radius:${chip.borderRadius.toFixed(3)}px;` : '') +
      `"></span>`,
    );
  }
  // Where an exercise is answered (#1230): a box the digital outputs find
  // by its slot. A blank reads as what it is; its answer is not written.
  if (chip.exercise || chip.blank) {
    const data = chip.exercise ? ` data-pt-ex="${chip.exercise.ex}" data-pt-slot="${esc(chip.exercise.slot)}"` : '';
    const label = chip.blank ? ` role="img" aria-label="${esc(chip.blankLabel ?? 'blank')}"` : '';
    parts.push(`<span class="pt-ex-slot${chip.blank ? ' pt-ex-blank' : ''}"${data}${label} style="${boxGeometry}"></span>`);
  }
  // The readings of its ruby words, over a blank too (#1244).
  if (chip.readings && chip.runs[0]) parts.push(chipReadingsHtml(chip.readings, bx, inkFor(chip.runs[0]), quoteFontString));
  if (chip.blank) return parts.join('');
  let tx = bx + chip.borderWidth + chip.paddingX;
  // The runs in the chip's paint order (`VDTChip.order`); a right-to-left
  // run's box reads right to left.
  const order = chip.order && chip.order.length === chip.runs.length ? chip.order : undefined;
  for (let k = 0; k < chip.runs.length; k++) {
    const run = chip.runs[order ? order[k]! : k]!;
    const font = quoteFontString(run.fontString);
    const color = chip.color ?? inkFor(run);
    const fontDecl = font !== lineFont ? `font:${font};` : '';
    // Letters to trace (#1017): the dots, the text transparent under them.
    const dots = chip.dotted ? textDotsSvg(run.text, run.fontString, chip.dotted, color, tx, baselineOffset + (run.baselineShift ?? 0), 0, run.rtl === true) : null;
    if (dots) parts.push(dots);
    const colorDecl = dots !== null ? 'color:transparent;' : color !== lineColor ? `color:${color};` : '';
    const top = run.baselineShift ? `${run.baselineShift.toFixed(3)}px` : '0';
    // A chip's runs were measured one by one, as a whole each.
    // A run whose direction differs from what it inherits says so, so its
    // neutral characters are ordered and its brackets mirrored as the
    // engine resolved them.
    const dir = dirAttr(run.rtl ? 'rtl' : 'ltr', rootDir);
    parts.push(renderTextSegment({ kind: 'text', text: run.text, width: run.width }, tx, top, fontDecl, colorDecl, color, 0, hasCJK(run.text) ? 'own' : false, dir ? { attrs: dir, decl: '' } : PLAIN_BOX));
    tx += run.width;
  }
  return parts.join('');
}

/**
 * The box of a task item (`VDTBlock.bulletBox`, #765): an inline SVG the
 * size of the box, from `bulletOffsetX` and centred on `bulletY`, in the
 * marker's colour. Its holder is an image named ☐ or ☑, which is what
 * assistive technology reads, and holds that character as text of no
 * size, so a selection copies it as it copied the character the box
 * stands for. On a vertical page the tick is drawn turned back
 * (`vertical`); on a right-to-left one the flow's own rule turns every
 * `svg` back.
 */
export function renderTaskBox(block: VDTBlock, vertical = false): string {
  const box = block.bulletBox;
  const firstLine = block.lines[0];
  if (!box || block.bulletOffsetX === undefined || !firstLine) return '';
  const { side, stroke, checked } = box;
  const top = (block.bulletY ?? firstLine.baseline) - side / 2;
  const mark = esc(taskBoxText(checked));
  return (
    `<div class="pt-bullet pt-task-box" role="img" aria-label="${mark}" style="position:absolute;` +
    `left:${block.bulletOffsetX}px;top:${top}px;width:${side}px;height:${side}px;` +
    `color:${block.bulletColor ?? block.color};font-size:0;">` +
    `<svg aria-hidden="true" focusable="false" viewBox="0 0 100 100" width="${side}" height="${side}" style="position:absolute;left:0;top:0;">` +
    taskBoxSvgBody(stroke / side, checked, vertical ? 'vertical' : undefined) +
    `</svg>${mark}</div>`
  );
}

export function renderBullet(block: VDTBlock, rootDir: TextDirection = 'ltr'): string {
  if (block.type === 'listItem' && block.bulletBox) return renderTaskBox(block);
  if (
    block.type !== 'listItem' ||
    !block.bulletText ||
    block.bulletOffsetX === undefined
  ) {
    return '';
  }
  const firstLine = block.lines[0];
  if (!firstLine) return '';
  const bulletFont = quoteFontString(block.bulletFontString ?? block.fontString);
  const bulletColor = block.bulletColor ?? block.color;
  // Render the bullet with the same geometry as the first text line so the
  // browser aligns the bullet glyph on the same baseline as the body text.
  // Canvas uses `textBaseline='middle'` at `bulletY` to center the em square
  // on the x-height; in HTML we get the equivalent alignment naturally when
  // both bullet and line share top/height and font metrics.
  // A marker set on the line's baseline (a contents number, whatever its
  // face and size): the box takes the line's own font, so its baseline is
  // the text's, and the marker sits in an inner box of its face with no
  // line height, which aligns on that baseline without moving it — the
  // way a text segment in another face does (`renderTextSegment`).
  const onBaseline = block.bulletBaselineY !== undefined;
  const lineFont = quoteFontString(block.fontString);
  const baselineShift = onBaseline ? block.bulletBaselineY! - firstLine.baseline : 0;
  // A marker reads in its item's direction: `١.` with its full stop on the
  // left in an Arabic list (#379).
  const markerDir = dirAttr(block.direction ?? rootDir, rootDir);
  // In an Arabic-script document European digits that open the marker read
  // as Arabic numbers (`bulletDirection: 'rtl-arabic'`, #665): `3-1`, a
  // contents number, with the 3 on the right. The browser resolves the
  // marker's order itself, so where that reading changes it the text takes
  // an Arabic letter mark (U+061C) before it, which rule W2 reads as the
  // letter the number follows.
  const markerText = (text: string): string => (block.bulletDirection === 'rtl-arabic' && arabicMarkNeeded(text) ? '&#x61C;' : '') + esc(text);
  const markerDiv = (cls: string, x: number, font: string, color: string, text: string): string =>
    `<div class="${cls}" aria-hidden="true"${markerDir} style="` +
    `position:absolute;` +
    `left:${x}px;` +
    `top:${firstLine.bbox.y + baselineShift}px;` +
    `height:${firstLine.bbox.height}px;` +
    `font:${onBaseline ? lineFont : font};` +
    `color:${color};` +
    `white-space:pre;` +
    (hasCJK(text) ? CJK_TEXT_DECL : '') +
    (onBaseline
      ? `"><span style="font:${font};${hasCJK(text) ? CJK_FEATURES_DECL : ''}line-height:0;">${markerText(text)}</span></div>`
      : `">${markerText(text)}</div>`);
  let html = markerDiv('pt-bullet', block.bulletOffsetX, bulletFont, bulletColor, block.bulletText);
  // Ordered-list separator styled apart from the number (own font/colour).
  if (block.separatorText && block.separatorX !== undefined) {
    const separatorFont = quoteFontString(block.separatorFontString ?? block.bulletFontString ?? block.fontString);
    const separatorColor = block.separatorColor ?? bulletColor;
    // The prefix run before the number, in the separator's style, first in
    // the markup so a copy reads （一）.
    if (block.prefixText && block.prefixX !== undefined) {
      html = markerDiv('pt-separator', block.prefixX, separatorFont, separatorColor, block.prefixText) + html;
    }
    html += markerDiv('pt-separator', block.separatorX, separatorFont, separatorColor, block.separatorText);
  }
  return html;
}

/**
 * The `line-height` a line box takes so the browser stands its text on the
 * line's baseline: a box of that height sets its text `(height + ascent −
 * descent) / 2` from its top, and the engine puts the baseline at
 * `line.baseline` (`lineBaselineOffset`: 0.8 of the leading), which the
 * canvas and the PDF paint on.
 *
 * Without it a line box keeps `line-height: normal`, which stands the text
 * on the face's own ascent — the leading's 0.8 only where the two happen to
 * meet — while everything else the line carries (a highlight band, an
 * emphasis mark, a formula, a chip, a swatch, a leader) is placed from
 * `line.baseline`. The two then drift apart as the leading moves away from
 * the face's natural line: a page set 1.5 em on a face whose ascent is 0.85
 * em leaves the text a third of an em above its band.
 *
 * '' where the measurer gives no face metrics (nothing measures, or the
 * faces are not loaded where the markup is written): the box keeps
 * `normal`, as it did up to postext 1.55.
 */
export function baselineLineHeightDecl(line: VDTLine, fontString: string): string {
  const box = measureFontBox(fontString);
  if (!box) return '';
  const height = 2 * (line.baseline - line.bbox.y) - (box.ascent - box.descent);
  if (!Number.isFinite(height) || height < 0) return '';
  return `line-height:${height.toFixed(3)}px;`;
}

export function renderLine(
  line: VDTLine,
  block: VDTBlock,
  targets?: ReadonlySet<string>,
  rootDir: TextDirection = 'ltr',
  rootLang?: string,
  /** The block's line after this one (see {@link lineEndText}). */
  next?: VDTLine,
  /** Markup set at the start of the line's box, before its text (a drop
   *  cap, #623). */
  lead = '',
  /** Where the line's inline pictures come from (#1249). */
  paint?: HtmlPaint,
): string {
  const font = quoteFontString(block.fontString);
  const strikethroughDecl = block.strikethroughText ? 'text-decoration:line-through;' : '';
  // Tracking — the block's (column balancing, a runt set short) and the
  // line's own (justification): measured into the segment widths, so the
  // glyphs must spread the same way.
  const tracking = (block.letterSpacing ?? 0) + (line.letterSpacing ?? 0);
  const trackingDecl = tracking !== 0 ? `letter-spacing:${tracking}px;${ligaturesDecl()}` : '';
  return (
    `<div class="pt-line" data-block="${esc(block.id)}" style="` +
    `position:absolute;` +
    `left:${line.bbox.x}px;` +
    `top:${line.bbox.y}px;` +
    `height:${line.bbox.height}px;` +
    `font:${font};` +
    // After `font:`, which resets the line height to `normal`.
    baselineLineHeightDecl(line, block.fontString) +
    `color:${block.color};` +
    strikethroughDecl +
    trackingDecl +
    (lineCjkDecl(line) ? cjkTextDecl(tracking !== 0) : '') +
    `">${lineHighlightsHtml(line)}${lead}${renderSegments(line, block, targets, rootDir, rootLang, lineEndText(line, next), paint)}</div>`
  );
}

/**
 * A paragraph's drop cap (#623), as the first runs of its first line's box:
 * an opening mark hung before it, then the initial, each standing on its
 * baseline (a box in the line's font shifted down to it, the glyphs in an
 * inner box of their own face with no line height, as a contents number
 * sits on its line). In the markup they come right before the line's text,
 * with nothing between, so a copy and a screen reader read the first word
 * whole.
 */
export function dropCapHtml(cap: VDTDropCap, line: VDTLine, lineFont: string, tracking = 0): string {
  // The cap is measured and painted on the canvas with no tracking; set
  // inside the box of a tracked line it would inherit the line's
  // (#770: `Se` at 86.25 px on a line tracked 0.25 px, 95.39 px measured,
  // 95.91 px in the box).
  const untracked = tracking !== 0 ? 'letter-spacing:normal;' : '';
  const run = (text: string, font: string, x: number, baselineY: number, width: number, cls: string): string =>
    `<span class="${cls}" style="position:absolute;left:${(x - line.bbox.x).toFixed(3)}px;top:${(baselineY - line.baseline).toFixed(3)}px;` +
    `width:${width.toFixed(3)}px;height:${line.bbox.height}px;font:${lineFont};color:${cap.color};white-space:pre;` + untracked +
    (hasCJK(text) ? CJK_TEXT_DECL : '') +
    `"><span style="font:${quoteFontString(font)};line-height:0;">${esc(text)}</span></span>`;
  const hang = cap.hang ? run(cap.hang.text, cap.hang.fontString, cap.hang.x, cap.hang.baselineY, cap.hang.width, 'pt-dropcap-hang') : '';
  return hang + run(cap.text, cap.fontString, cap.x, cap.baselineY, cap.width, 'pt-dropcap');
}
