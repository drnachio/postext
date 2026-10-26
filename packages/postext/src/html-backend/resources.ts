// Resource blocks: lines of a resource's caption, tables, figure labels
// and the block that holds them (#1276: split out of html-backend.ts).
import { type VDTLineSegment, type VDTLine, type ResolvedResourceBlock, tableFrameOutline, tableCellFillRects, type VDTBlock } from '../vdt.js';
import { hasCJK } from '../measure/cjk/cjk.js';
import { warichuHtml, rubyHtml, kuntenHtml, lineMarksHtml, lineHighlightsHtml } from './htmlAnnotations.js';
import { altWithLabels } from '../composed/labelText.js';
import { figureLabelLeaderPaths, unmirrorLabelLayout, figureLabelMatrix, undrawnLabels } from '../composed/labels.js';
import { renderDesignPathBlock } from './design.js';
import { clipToOutline, imageUrl, renderFittedImage, renderVideoHtml } from './images.js';
import { renderSwatchSegment, renderChip, baselineLineHeightDecl } from './lines.js';
import type { HtmlPaint } from './render.js';
import { orderedOffsets } from './segments.js';
import { wordSegmentsOf, renderTextSegment, renderWordTextSegment, linkRuns, segmentHref, copyTextHtml, mathSegmentSvg, renderRefRuns, refLinks, refKey, lineEndHtml, lineEndText, resourceAnchorId, renderScoreBodyHtml } from './segmentText.js';
import { type TextDirection, quoteFontString, lineCjkDecl, ligaturesDecl, segmentBox, segmentCjk, cjkTextDecl } from './styles.js';
import { wordsHtml, esc } from './textRuns.js';
import { type VerticalHtml, renderVerticalLine } from './vertical.js';

// ---------------------------------------------------------------------------
// Resource blocks (image / svg / table + caption) — mirrors the canvas
// renderer: geometry is pre-measured and absolute (page coords), so cells,
// borders, and text lines emit as absolutely positioned elements.
// ---------------------------------------------------------------------------

interface ResourceLineFonts {
  normal: string;
  bold: string;
  italic: string;
  boldItalic: string;
}

function pickResourceFont(seg: VDTLineSegment, fonts: ResourceLineFonts): string {
  if (seg.fontString) return seg.fontString;
  if (seg.bold && seg.italic) return fonts.boldItalic;
  if (seg.bold) return fonts.bold;
  if (seg.italic) return fonts.italic;
  return fonts.normal;
}

/** Render one already-positioned rich-text line (caption or table cell).
 *  Alignment and justification are baked into the measured geometry, so
 *  segments paint sequentially from the line origin — `:ref` segments in the
 *  link colour, `captionLabel` segments in the label colour — with ruby
 *  readings, warichu rows and the line's marks as on a body line (#429). */
function renderResourceLine(
  line: VDTLine,
  fonts: ResourceLineFonts,
  color: string,
  linkColor: string,
  labelColor: string = color,
  targets?: ReadonlySet<string>,
  /** The direction the document's root declares (see {@link dirAttr}). */
  rootDir: TextDirection = 'ltr',
  /** The language the document's root declares. */
  rootLang?: string,
  /** What a copy puts after the line (see {@link lineEndText}). */
  end = '',
  /** The render's options: the pictures of inline symbols (#1058). */
  paint?: HtmlPaint,
): string {
  const baseFont = quoteFontString(fonts.normal);
  const parts: string[] = [];
  const lineDecl = lineCjkDecl(line);
  if (line.segments && line.segments.length > 0) {
    const composed = line.cjkComposed === true;
    const tracking = line.letterSpacing ?? 0;
    // The pieces of a word the layout measured whole are one box (#770).
    const set = composed ? { segments: line.segments, order: line.order } : wordSegmentsOf(line, tracking, (seg) => pickResourceFont(seg, fonts));
    const segs = set.segments!;
    const cjk = !composed && hasCJK(line.text);
    // A caption or cell line with right-to-left runs, or on a mirrored
    // page, advances through its segments in `order` (#379).
    const at = set.order && set.order.length === segs.length ? orderedOffsets(segs, set.order, 0, undefined) : undefined;
    const segColorOf = (seg: VDTLineSegment): string => (seg.refResourceId !== undefined
      ? linkColor
      : seg.captionLabel
        ? labelColor
        : color);
    const paintText = (seg: VDTLineSegment, at: number, inLink = false): string => {
      const font = quoteFontString(pickResourceFont(seg, fonts));
      const segColor = segColorOf(seg);
      const fontDecl = font !== baseFont ? `font:${font};${tracking !== 0 ? ligaturesDecl() : ''}` : '';
      const colorDecl = segColor !== color ? `color:${segColor};` : '';
      const top = seg.baselineShift ? `${seg.baselineShift.toFixed(3)}px` : '0';
      // Its direction, untracked joining letters and styled runs (#379).
      const box = segmentBox(seg, rootDir, rootLang, tracking, font, segColor, (probe) => ({ font: quoteFontString(pickResourceFont(probe, fonts)), color: segColor }));
      // A line set word by word as every line was before the CJK
      // features (see `renderSegments`).
      return composed
        ? renderTextSegment(inLink ? { ...seg, refResourceId: undefined } : seg, at, top, fontDecl, colorDecl, segColor, line.letterSpacing ?? 0, segmentCjk(seg, lineDecl), box)
        : renderWordTextSegment(inLink ? { ...seg, refResourceId: undefined } : seg, at, top, fontDecl, colorDecl, segColor, cjk && hasCJK(seg.text), box);
    };
    const links = linkRuns();
    let x = 0;
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i]!;
      if (at) x = at[i]!;
      if (seg.kind === 'space') {
        // The space as text, for copying (#403).
        parts.push(links.space(segs[i + 1] && segmentHref(segs[i + 1]!)));
        parts.push(copyTextHtml(seg.text, x));
        x += seg.width;
        continue;
      }
      parts.push(links.at(segmentHref(seg)));
      if (seg.kind === 'math') {
        parts.push(mathSegmentSvg(seg, x, line, color));
        x += seg.width;
        continue;
      }
      if (seg.kind === 'swatch') {
        parts.push(renderSwatchSegment(seg.swatch, x, line.baseline - line.bbox.y, seg.width, color, paint, seg.rtl === true));
        x += seg.width;
        continue;
      }
      if (seg.chip) {
        parts.push(renderChip(seg.chip, x, line.baseline - line.bbox.y, baseFont, color, () => color, rootDir));
        x += seg.width;
        continue;
      }
      if (composed && seg.warichu) {
        // A warichu note's part: its two rows (#195, #429).
        parts.push(warichuHtml(seg.warichu, x, color, quoteFontString));
        x += seg.width;
        continue;
      }
      if (seg.refResourceId !== undefined && segs[i + 1]?.refContinues) {
        const group = renderRefRuns(segs, i, x, linkColor, (run, runX) => paintText(run, runX, true), refLinks(refKey(seg), targets), at ? { at } : undefined);
        parts.push(group.html);
        x = group.x;
        i = group.end - 1;
        continue;
      }
      parts.push(paintText(seg, x, seg.refResourceId !== undefined && !refLinks(refKey(seg), targets)));
      // A ruby base's reading (#194, #429).
      if (seg.ruby) parts.push(rubyHtml(seg.ruby, x, segColorOf(seg), quoteFontString));
      // Kanbun marks (#430), the 送り仮名 read after their character.
      if (seg.kunten) {
        parts.push(kuntenHtml(seg.kunten, x, segColorOf(seg), quoteFontString));
        if (seg.kunten.okuri) parts.push(lineEndHtml(seg.kunten.okuri, x + seg.width));
      }
      x += seg.width;
    }
    parts.push(links.end());
    parts.push(lineEndHtml(end, x));
    // Emphasis marks, side lines, the proper-name and book-title lines
    // (#193, #421, #429).
    if (line.marks) parts.push(lineMarksHtml(line, color));
  } else {
    parts.push(`<span style="position:absolute;left:0;top:0;white-space:pre;">${wordsHtml(line.text)}</span>`);
    parts.push(lineEndHtml(end, line.bbox.width));
  }
  return (
    `<div class="pt-line" style="` +
    `position:absolute;` +
    `left:${line.bbox.x}px;` +
    `top:${line.bbox.y}px;` +
    `height:${line.bbox.height}px;` +
    `font:${baseFont};` +
    // After `font:`, which resets the line height to `normal`.
    baselineLineHeightDecl(line, fonts.normal) +
    `color:${color};` +
    // A tracked line (a table header set with `headerLetterSpacing`) was
    // measured with the tracking in its widths.
    (line.letterSpacing ? `letter-spacing:${line.letterSpacing}px;${ligaturesDecl()}` : '') +
    (lineDecl ? cjkTextDecl(!!line.letterSpacing) : '') +
    `">${lineHighlightsHtml(line)}${parts.join('')}</div>`
  );
}

function renderResourceTable(rb: ResolvedResourceBlock, bx: number, by: number, options: HtmlPaint): string {
  const t = rb.table;
  if (!t) return '';
  const parts: string[] = [];
  // A rounded frame clips the fills to the frame line and the inner rules
  // to its outer contour, then is drawn round on top.
  const rounded = t.frameRadii !== undefined;
  const outline = (outset: number) => tableFrameOutline(t, bx, by, rb.bodyRect.width, outset);
  // Cell backgrounds first (the cell's own fill, else the header tint / the
  // body or zebra fill), then borders, then text — same paint order as the
  // canvas backend. Each opaque fill runs across the edges it shares with
  // the cells painted after it, so no seam shows between cells at a
  // fractional device-pixel ratio (see `tableCellFillRects`).
  const fills: string[] = [];
  for (const { fill, rects } of tableCellFillRects(t)) {
    for (const r of rects) {
      fills.push(
        `<div aria-hidden="true" style="position:absolute;` +
        `left:${r.x}px;top:${r.y}px;` +
        `width:${r.width}px;height:${r.height}px;` +
        `background:${fill};"></div>`,
      );
    }
  }
  parts.push(rounded ? clipToOutline(fills.join(''), outline(0)) : fills.join(''));
  if (t.strokes) {
    // Booktabs (#625): one box per stroke of the layout, centred on its
    // line (the rules are horizontal; a vertical one is drawn as tall).
    for (const s of t.strokes) {
      const x = bx + Math.min(s.x1, s.x2);
      const y = by + Math.min(s.y1, s.y2);
      const w = Math.abs(s.x2 - s.x1);
      const h = Math.abs(s.y2 - s.y1);
      parts.push(
        `<div aria-hidden="true" style="position:absolute;` +
        (h === 0
          ? `left:${x}px;top:${y - s.widthPx / 2}px;width:${w}px;height:${s.widthPx}px;`
          : `left:${x - s.widthPx / 2}px;top:${y}px;width:${s.widthPx}px;height:${h}px;`) +
        `background:${t.borderColor};"></div>`,
      );
    }
  } else if (t.borderWidthPx > 0) {
    // Border boxes are inflated by half the stroke so the border centres on
    // the cell edge — adjacent cells overlap exactly, like canvas strokeRect.
    const bw = t.borderWidthPx;
    const rules = t.rules ?? 'grid';
    const borderBox = (x: number, y: number, w: number, h: number, sides: string): string =>
      `<div aria-hidden="true" style="position:absolute;` +
      `left:${x - bw / 2}px;top:${y - bw / 2}px;` +
      `width:${w + bw}px;height:${h + bw}px;` +
      `${sides}box-sizing:border-box;"></div>`;
    const lines: string[] = [];
    if (rules === 'grid') {
      for (const cell of t.cells) {
        lines.push(borderBox(cell.rect.x, cell.rect.y, cell.rect.width, cell.rect.height,
          `border:${bw}px solid ${t.borderColor};`));
      }
    } else if (rules === 'horizontal') {
      for (const cell of t.cells) {
        lines.push(borderBox(cell.rect.x, cell.rect.y, cell.rect.width, cell.rect.height,
          `border-top:${bw}px solid ${t.borderColor};border-bottom:${bw}px solid ${t.borderColor};`));
      }
    } else if (rules === 'outer' && !rounded) {
      const tableHeight = t.rowEdges[t.rowEdges.length - 1] ?? rb.bodyRect.height;
      lines.push(borderBox(bx, by, rb.bodyRect.width, tableHeight, `border:${bw}px solid ${t.borderColor};`));
    }
    parts.push(rounded ? clipToOutline(lines.join(''), outline(bw / 2)) : lines.join(''));
    if (rounded && (rules === 'grid' || rules === 'outer')) {
      // The frame's border box is its outer contour, so its radii are the
      // outer ones.
      const o = outline(bw / 2);
      parts.push(
        `<div aria-hidden="true" style="position:absolute;left:${o.x}px;top:${o.y}px;` +
        `width:${o.width}px;height:${o.height}px;border:${bw}px solid ${t.borderColor};` +
        `border-radius:${o.radii.map((r) => `${r}px`).join(' ')};box-sizing:border-box;"></div>`,
      );
    }
  }
  const bodyFonts: ResourceLineFonts = {
    normal: t.fontString,
    bold: t.boldFontString,
    italic: t.italicFontString,
    boldItalic: t.boldItalicFontString,
  };
  const headerFonts: ResourceLineFonts = {
    normal: t.headerFontString,
    bold: t.headerBoldFontString,
    italic: t.headerItalicFontString,
    boldItalic: t.headerBoldItalicFontString,
  };
  // Cell images (bitmap / SVG resources embedded in cells), then text.
  for (const cell of t.cells) {
    const img = cell.image;
    if (!img) continue;
    const url = imageUrl(options, img.fileId, img.resourceId);
    const { x, y, width, height } = img.rect;
    parts.push(renderFittedImage(url, '', img.kind === 'svg' ? 'SVG' : 'Image', x, y, width, height, options, img.kind === 'svg'));
  }
  for (const cell of t.cells) {
    const fonts = cell.isHeader ? headerFonts : bodyFonts;
    const color = cell.isHeader ? t.headerColor : t.color;
    cell.lines.forEach((line, i) => {
      parts.push(renderResourceLine(line, fonts, color, rb.linkColor, color, options.linkTargets, options.dir, options.rootLang, lineEndText(line, cell.lines[i + 1]), options));
    });
  }
  return parts.join('');
}

/**
 * The labels of a `:::figure` drawn on its picture (#860), its body's
 * top-left corner at (`bx`, `by`): one box per label, turned by its
 * matrix about the block's frame, holding its plate and its lines. The
 * labels follow the picture in the markup, in the order written, so they
 * are read after it; a halo strokes the letters under their fill.
 */
function renderFigureLabelsHtml(rb: ResolvedResourceBlock, bx: number, by: number, options: HtmlPaint): string {
  const n2 = (v: number): string => String(+v.toFixed(4));
  // Their leaders first (#1057), under every label: vector lines hidden
  // from assistive technology, as design paths are.
  const parts: string[] = figureLabelLeaderPaths(rb, bx, by).map((p) => renderDesignPathBlock(p));
  for (const label of rb.labels ?? []) {
    let layout = label.layout;
    if (!layout) continue;
    // A vertical label on a mirrored page (#955): set from its unmirrored
    // layout in a wrapper that reflects the flow's mirror back about the
    // body, so its runs and cells read as they do on any page.
    const unmirrored = layout.mirrored === true && !rb.rotation;
    if (unmirrored) layout = unmirrorLabelLayout(layout, rb.bodyRect.width);
    const m = figureLabelMatrix(layout, bx, by);
    const fonts: ResourceLineFonts = { normal: layout.fontString, bold: layout.boldFontString, italic: layout.italicFontString, boldItalic: layout.boldItalicFontString };
    const halo = layout.halo && layout.halo.widthPx > 0
      ? `-webkit-text-stroke:${n2(2 * layout.halo.widthPx)}px ${layout.halo.color};paint-order:stroke fill;stroke-linejoin:round;`
      : '';
    const inner: string[] = [];
    if (layout.background) {
      const plate = layout.background;
      const r = plate.rect;
      // A plate's outline and corners (#1058), the outline inside the box.
      const look = (plate.color ? `background:${plate.color};` : '')
        + (plate.border ? `box-sizing:border-box;border:${n2(plate.border.widthPx)}px solid ${plate.border.color};` : '')
        + (plate.radiusPx ? `border-radius:${n2(plate.radiusPx)}px;` : '');
      inner.push(`<div aria-hidden="true" style="position:absolute;left:${n2(r.x)}px;top:${n2(r.y)}px;width:${n2(r.width)}px;height:${n2(r.height)}px;${look}"></div>`);
    }
    if (layout.vertical) {
      // A vertical label (#902): its frame is turned a quarter turn by the
      // matrix, as a vertical page's flow is, and each line is set down the
      // column like a body line, from a block that stands for the label.
      const vt = layout.vertical;
      const v: VerticalHtml = { region: vt.region, uprightDigits: vt.uprightDigits, axes: vt.centralBaselines };
      const host = {
        id: label.id ?? '', fontString: layout.fontString, boldFontString: layout.boldFontString, italicFontString: layout.italicFontString,
        boldItalicFontString: layout.boldItalicFontString, color: layout.color, textAlign: 'left', bbox: layout.box,
      } as unknown as VDTBlock;
      layout.lines.forEach((line, i) => inner.push(renderVerticalLine(line, host, v, options.linkTargets, layout.lines[i + 1], options)));
    } else {
      layout.lines.forEach((line, i) => {
        inner.push(renderResourceLine(line, fonts, layout.color, rb.linkColor, layout.color, options.linkTargets, options.dir, options.rootLang, lineEndText(line, layout.lines[i + 1]) || (i + 1 < layout.lines.length ? ' ' : ''), options));
      });
    }
    const dir = layout.direction === 'rtl' ? ' dir="rtl"' : '';
    const id = label.id ? ` data-label="${esc(label.id)}"` : '';
    const box =
      `<div class="pt-figure-label"${id}${dir} style="position:absolute;left:0;top:0;width:0;height:0;transform-origin:0 0;` +
      `transform:matrix(${m.map(n2).join(',')});${halo}">` + inner.join('') + '</div>';
    parts.push(unmirrored
      ? `<div class="pt-unmirrored" style="position:absolute;left:0;top:0;width:0;height:0;transform-origin:0 0;transform:matrix(-1,0,0,1,${n2(2 * bx + rb.bodyRect.width)},0);">${box}</div>`
      : box);
  }
  return parts.join('');
}

export function renderResourceBlockHtml(block: VDTBlock, paint: HtmlPaint): string {
  const rb = block.resourceBlock;
  if (!rb) return '';
  // Its caption, notes and cells are horizontal text, in its own frame
  // (upright on a vertical page).
  const options: HtmlPaint = paint.vertical ? { ...paint, vertical: undefined } : paint;
  const parts: string[] = [];
  // A rotated block: its geometry is in the upright frame, emitted inside a
  // wrapper turned a quarter turn about the frame's origin on the page.
  const rot = rb.rotation;
  const bx = (rot ? 0 : block.bbox.x) + rb.bodyRect.x;
  const by = (rot ? 0 : block.bbox.y) + rb.bodyRect.y;
  const bw = rb.bodyRect.width;
  const bh = rb.bodyRect.height;

  // Zero-size anchor at the embed's top-left — the target of `:ref` links.
  // A continued slice of a split table is not a target: links land on the
  // first slice.
  const anchor = rb.resource.id && !rb.slice?.continued
    ? `<span id="${esc(resourceAnchorId(rb.resource.id))}" style="position:absolute;` +
      `left:${block.bbox.x}px;top:${block.bbox.y}px;width:0;height:0;"></span>`
    : '';

  if (rb.kind === 'video') {
    // Named like the PDF's figure: its alt text, else its caption, else
    // its label (`Video 1.2`).
    const name = rb.resource.altText?.trim()
      || rb.captionLines.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim()
      || `${rb.captionPrefix} ${rb.number}`.trim();
    parts.push(renderVideoHtml(rb.video, rb.fileId, name, bx, by, bw, bh, options, rb.bodySource));
  } else if (rb.kind === 'bitmap' || rb.kind === 'svg') {
    const url = rb.fileId ? imageUrl(options, rb.fileId, rb.resource.id) : undefined;
    // `<img>`, or a neutral placeholder matching the canvas backend's colours.
    // A `:::figure`'s labels follow its alternative text (#862) unless
    // they are drawn as text over it (#860).
    parts.push(renderFittedImage(url, altWithLabels(rb.resource.altText ?? '', undrawnLabels(rb.labels)), rb.kind === 'svg' ? 'SVG' : 'Image', bx, by, bw, bh, options, rb.kind === 'svg', rb.bodySource));
    if (rb.labels) parts.push(renderFigureLabelsHtml(rb, bx, by, options));
  } else if (rb.kind === 'table') {
    parts.push(renderResourceTable(rb, bx, by, options));
  } else if (rb.kind === 'score') {
    parts.push(renderScoreBodyHtml(rb, bx, by, bw, bh));
  }

  // Caption bar (behind the caption lines), like other absolute decorations.
  if (rb.captionBar) {
    const { rect, background } = rb.captionBar;
    parts.push(
      `<div aria-hidden="true" style="position:absolute;` +
      `left:${rect.x}px;top:${rect.y}px;width:${rect.width}px;height:${rect.height}px;` +
      `background:${background};"></div>`,
    );
  }
  const captionFonts: ResourceLineFonts = {
    normal: rb.captionFontString,
    bold: rb.captionBoldFontString,
    italic: rb.captionItalicFontString,
    boldItalic: rb.captionBoldItalicFontString,
  };
  rb.captionLines.forEach((line, i) => {
    parts.push(renderResourceLine(line, captionFonts, rb.captionColor, rb.linkColor, rb.captionLabelColor, options.linkTargets, options.dir, options.rootLang, lineEndText(line, rb.captionLines[i + 1]), options));
  });
  const noteFonts: ResourceLineFonts = {
    normal: rb.noteFontString,
    bold: rb.noteBoldFontString,
    italic: rb.noteItalicFontString,
    boldItalic: rb.noteBoldItalicFontString,
  };
  const noteLines = [...rb.noteLines, ...(rb.continuesLines ?? [])];
  noteLines.forEach((line, i) => {
    parts.push(renderResourceLine(line, noteFonts, rb.noteColor, rb.linkColor, rb.noteColor, options.linkTargets, options.dir, options.rootLang, lineEndText(line, noteLines[i + 1]), options));
  });
  if (!rot) return anchor + parts.join('');
  return (
    anchor +
    `<div style="position:absolute;left:${rot.originX}px;top:${rot.originY}px;width:0;height:0;` +
    `transform:rotate(${rot.direction === 'ccw' ? -90 : 90}deg);transform-origin:0 0;">` +
    parts.join('') +
    '</div>'
  );
}
