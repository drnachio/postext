import { footnoteRuleSegments } from './columnRule';
import type {
  VDTDocument,
  VDTPage,
  VDTBlock,
  VDTLine,
  VDTLineSegment,
  VDTChip,
  VDTChipRun,
  VDTDesignSlot,
  VDTDesignBlock,
  VDTDesignTextBlock,
  VDTDesignRuleBlock,
  VDTDesignBoxBlock,
  VDTDesignImageBlock,
  VDTDesignBoxStyle,
  BoundingBox,
  ResolvedResourceBlock,
  RoundedOutline,
  RenderWarning,
} from './vdt';
import { tableCellFillRects, tableFrameOutline } from './vdt';
import { dimensionToPx } from './units';
import { documentInkHex, isSingleInkSvgUrl, singleInkColorMatrix } from './svg/singleInk';
import { lineInkExtent, lineTrailingTracking } from './lineInk';
import { CHARACTER_GRID_COLOR, cjkGridCells, type CjkGridCells } from './pipeline/cjkGrid';
import { renderLangOf } from './locale';

export interface RenderHtmlOptions {
  /** Layout mode: single vertical column or many columns laid out horizontally. */
  mode?: 'single' | 'multi';
  /** Horizontal gap between pages/columns in multi mode. Default: 24 */
  columnGap?: number;
  /** Outer padding around the document. Default: 24 */
  padding?: number;
  /** Background color for each page (overrides config). */
  background?: string;
  /** Resolver from a resource `fileId` to a displayable image URL (object
   *  URL, data URI, …). Image payloads live out-of-band (IndexedDB in the
   *  sandbox), so the host supplies them. When omitted, or when it returns
   *  undefined for a fileId, bitmap/SVG resources render as a neutral
   *  placeholder box so layout stays stable. */
  resourceImageUrl?: ((fileId: string) => string | undefined) & {
    /** The default of {@link RenderHtmlOptions.singleInk} for this
     *  resolver's URLs: `false` on one whose SVG URLs are already recoloured
     *  for single ink (`bundleImageUrl` does), `true` on one that serves the
     *  raw markup. */
    singleInk?: boolean;
  };
  /** Whether `diagramStyle.singleInk` recolours SVG pictures here: each
   *  SVG `<img>` gets a CSS filter (an `feColorMatrix` on its page) that
   *  maps its pixels to tints of the document's ink — the mapping
   *  `applySingleInkToSvg` applies to the markup, and the PDF backend to
   *  SVG bytes. Bitmaps are never tinted, and neither is an SVG data URI
   *  whose markup `applySingleInkToSvg` marked. (A design image of a VDT built
   *  before design images carried `imageKind` is tinted when its URL is an
   *  SVG data URI or ends in `.svg`.) Every page then carries the filter
   *  definition. Defaults to the resolver's own `singleInk`, else false in
   *  postext 1.x: hosts written for 1.4 serve SVGs recoloured with
   *  `applySingleInkToSvg`, as the Sandbox does, and a picture tinted twice
   *  comes out lighter. Pass `true` when `resourceImageUrl` returns the raw
   *  markup. The next major release turns it on by default. */
  singleInk?: boolean;
  /** Told of what the render could not produce as asked: an image with no
   *  URL (no `resourceImageUrl`, or one that returns nothing for its
   *  `fileId`) is emitted as a placeholder and reported once per `fileId`
   *  and render call, as a `missingImage` warning. */
  onWarning?: (warning: RenderWarning) => void;
  /** Resources anchored elsewhere on the page that shows this document's
   *  HTML (`id="pt-res-<id>"`). A `:ref` links to its resource's anchor
   *  when this document places that resource or the id is listed here;
   *  otherwise it is set as plain text in its link colour, since nothing on
   *  the page would take the link. A host that joins several documents'
   *  HTML on one page — a book's chapters, each rendered on its own — lists
   *  the resources all of them place ({@link anchoredResourceIds}), so a
   *  reference to a figure an earlier chapter placed links to it. */
  refTargets?: Iterable<string>;
}

/** The single-ink filter of one page: its element id and the colour
 *  matrix. Every page carries the `<filter>` definition while single ink
 *  applies, used or not, so a block patched in later resolves it. */
interface InkFilter {
  id: string;
  matrix: number[];
}

/** Render options as the painters see them: the caller's, plus the page's
 *  single-ink filter when single ink applies and the reporter of the images
 *  emitted as placeholders on the page in progress. */
interface HtmlPaint extends RenderHtmlOptions {
  ink?: InkFilter;
  missingImage?: (fileId: string, resourceId?: string) => void;
  /** Resources a `:ref` links to: those this document anchors (see
   *  {@link anchoredResourceIds}) and the caller's `refTargets`. A `:ref`
   *  to any other one — a figure an earlier chapter placed, in a chapter
   *  rendered on its own — is set as plain text in its link colour, not as
   *  a link to nowhere (the PDF backend drops such a link the same way). */
  linkTargets?: ReadonlySet<string>;
}

/**
 * The resources this document anchors in its HTML (`id="pt-res-<id>"`):
 * those whose embed (a first slice, for a split table) is on one of its
 * pages. A host that renders a book's chapters one by one onto a single page
 * passes the union over the chapters as `RenderHtmlOptions.refTargets`:
 *
 * ```ts
 * const docs = buildBundle(bundle);
 * const refTargets = new Set(docs.flatMap((d) => [...anchoredResourceIds(d)]));
 * const html = docs.map((d) => renderToHtml(d, { refTargets })).join('');
 * ```
 */
export function anchoredResourceIds(doc: VDTDocument): Set<string> {
  const ids = new Set<string>();
  for (const page of doc.pages) {
    for (const block of [...page.columns.flatMap((c) => c.blocks), ...(page.floats ?? [])]) {
      const rb = block.resourceBlock;
      if (rb?.resource.id && !rb.slice?.continued) ids.add(rb.resource.id);
    }
  }
  return ids;
}

/** Whether a `:ref` segment links anywhere in the document being rendered. */
function refLinks(resourceId: string, targets: ReadonlySet<string> | undefined): boolean {
  return !targets || targets.has(resourceId);
}

/** Whether an image URL names an SVG: a data URI of that type, or a path
 *  ending in `.svg` (query and fragment aside). Blob URLs cannot tell. */
function isSvgUrl(url: string): boolean {
  return /^data:image\/svg\+xml[;,]/i.test(url) || /\.svg(?:[?#]|$)/i.test(url);
}

/** The `filter` declaration tinting an image to the page's ink: an SVG
 *  (`svg: true`) or, of unknown kind, an SVG-looking URL; never a bitmap,
 *  and never an SVG data URI `applySingleInkToSvg` recoloured already (it
 *  carries `SINGLE_INK_MARK`). Empty when single ink does not apply. */
function inkFilterDecl(paint: HtmlPaint, svg: boolean | undefined, url: string): string {
  const ink = paint.ink;
  if (!ink || svg === false || (svg === undefined && !isSvgUrl(url)) || isSingleInkSvgUrl(url)) return '';
  return `filter:url(#${ink.id});`;
}

/** The page's `<filter>` definition: a zero-size inline SVG, first in the
 *  page so every `url(#…)` on it resolves. */
function inkFilterDefs(ink: InkFilter): string {
  const values = ink.matrix.map((v) => +v.toFixed(6)).join(' ');
  return (
    `<svg aria-hidden="true" focusable="false" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden;">` +
    `<filter id="${ink.id}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${values}"/></filter>` +
    `</svg>`
  );
}

/** The URL of an image payload, reporting a miss (the caller then emits the
 *  placeholder). */
function imageUrl(options: HtmlPaint | undefined, fileId: string, resourceId?: string): string | undefined {
  const url = options?.resourceImageUrl?.(fileId);
  if (!url) options?.missingImage?.(fileId, resourceId);
  return url || undefined;
}

const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPE[c] ?? c);
}

/** Element id for a resource embed's in-document anchor. `:ref` segments link
 *  to it with `#<id>` so references navigate in standalone HTML output. */
function resourceAnchorId(resourceId: string): string {
  return `pt-res-${resourceId}`;
}

function refAnchorHref(resourceId: string): string {
  return `#${encodeURIComponent(resourceAnchorId(resourceId))}`;
}

function quoteFontString(fontString: string): string {
  // Canvas accepts unquoted multi-word families; CSS is stricter. Wrap family in
  // single quotes (double quotes would collide with the outer HTML attribute
  // delimiter) if it contains a space and isn't already quoted. If the family
  // arrives already wrapped in double quotes, rewrite them to single quotes.
  const match = fontString.match(/^(.*?)(\d+(?:\.\d+)?px)\s+(.+)$/);
  if (!match) return fontString;
  const [, prefix, size, family] = match;
  const trimmed = (family ?? '').trim();
  let quoted: string;
  if (trimmed.startsWith("'")) {
    quoted = trimmed;
  } else if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    quoted = `'${trimmed.slice(1, -1)}'`;
  } else if (/\s/.test(trimmed)) {
    quoted = `'${trimmed}'`;
  } else {
    quoted = trimmed;
  }
  return `${prefix}${size} ${quoted}`.trim();
}

function pickSegmentFont(
  seg: VDTLineSegment,
  block: VDTBlock,
): string {
  if (seg.fontString) return seg.fontString;
  const bold = !!seg.bold;
  const italic = !!seg.italic;
  if (bold && italic && block.boldItalicFontString) return block.boldItalicFontString;
  if (bold && block.boldFontString) return block.boldFontString;
  if (italic && block.italicFontString) return block.italicFontString;
  return block.fontString;
}

function pickSegmentColor(
  seg: VDTLineSegment,
  block: VDTBlock,
): string {
  if (seg.color) return seg.color;
  if (seg.refResourceId !== undefined && block.refColor) return block.refColor;
  const bold = !!seg.bold;
  const italic = !!seg.italic;
  if (bold && block.boldColor) return block.boldColor;
  if (italic && block.italicColor) return block.italicColor;
  return block.color;
}

function renderMathSegmentSvg(seg: VDTLineSegment, xPx: number, line: VDTLine, block: VDTBlock): string {
  const render = seg.mathRender;
  if (!render) return '';
  // Position the SVG with top = (line.baseline - block.bbox.y - ascent).
  // line.bbox.y is absolute; we need top relative to the line's wrapper top.
  const topOffset = line.baseline - line.bbox.y - render.ascentPx;
  const color = block.color;
  // Use the pre-serialised self-contained SVG. Replace any currentColor fills
  // with the block colour so the SVG is independent of CSS inheritance.
  const svg = render.svg
    .replace(/<svg\b[^>]*>/, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${render.viewBox.minX} ${render.viewBox.minY} ${render.viewBox.width} ${render.viewBox.height}" width="${render.widthPx}" height="${render.heightPx}" style="color:${color};">`);
  return `<span style="position:absolute;left:${xPx.toFixed(3)}px;top:${topOffset.toFixed(3)}px;display:inline-block;line-height:0;">${svg}</span>`;
}

/** One text segment of a line, absolutely positioned at `x` / `top` inside
 *  the line box. The wrapper inherits the line's font, so its line box —
 *  and the baseline the text sits on — is the block face's; a segment set
 *  in another face (a bold `:ref`, a superscript, an italic run whose
 *  family differs) goes in an inner inline box with `line-height: 0`,
 *  which aligns on that baseline without growing or shifting the line
 *  box. A face with other vertical metrics would otherwise float its own
 *  baseline higher or lower than the surrounding text. */
function renderTextSegment(
  seg: VDTLineSegment,
  x: number,
  top: string,
  fontDecl: string,
  colorDecl: string,
  color: string,
  /** The tracking the line box already carries (block + line); a segment's
   *  own (a justified CJK line) is added to it. */
  tracking = 0,
): string {
  const spacingDecl = seg.tracking !== undefined ? `letter-spacing:${tracking + seg.tracking}px;` : '';
  // A compressed CJK mark is painted before its box (`inkOffset`).
  const left = seg.inkOffset !== undefined ? x + seg.inkOffset : x;
  const pos = `position:absolute;left:${left.toFixed(3)}px;top:${top};white-space:pre;${spacingDecl}`;
  const text = esc(seg.text);
  if (seg.refResourceId !== undefined) {
    // Anchors carry an explicit color so the UA link blue never leaks in.
    const inner = `<a href="${refAnchorHref(seg.refResourceId)}" style="text-decoration:none;${fontDecl}${fontDecl ? 'line-height:0;' : ''}color:${color};">${text}</a>`;
    return `<span style="${pos}">${inner}</span>`;
  }
  if (fontDecl) {
    return `<span style="${pos}"><span style="${fontDecl}line-height:0;${colorDecl}">${text}</span></span>`;
  }
  return `<span style="${pos}${colorDecl}">${text}</span>`;
}

/** A `:ref` painted as several runs (a label in small capitals: one run per
 *  case) from `segs[start]` on. Every run is placed as measured, and all of
 *  them sit in one anchor, so the reference stays one link. `paint` renders
 *  one run, as plain text, at its x. Returns the markup, the index past the
 *  last run and the x after it. */
function renderRefRuns(
  segs: readonly VDTLineSegment[],
  start: number,
  x: number,
  color: string,
  paint: (seg: VDTLineSegment, x: number) => string,
  linked = true,
): { html: string; end: number; x: number } {
  const runs: string[] = [];
  let i = start;
  do {
    const seg = segs[i]!;
    runs.push(paint(seg, x));
    x += seg.width;
    i++;
  } while (segs[i]?.refContinues);
  if (!linked) return { html: runs.join(''), end: i, x };
  const href = refAnchorHref(segs[start]!.refResourceId!);
  return { html: `<a href="${href}" style="text-decoration:none;color:${color};">${runs.join('')}</a>`, end: i, x };
}

/** Wraps each run of segments of one link (`VDTLineSegment.href`) in an
 *  `<a>`: `at` returns the markup to emit before a segment with that link
 *  (closing the previous anchor, opening its own), `end` the markup that
 *  closes the line. The segments stay absolutely positioned inside it; the
 *  anchor takes the text colour, so a link reads as the surrounding text. */
function linkRuns(): { at: (href: string | undefined) => string; end: () => string } {
  let open: string | undefined;
  return {
    at(href) {
      if (href === open) return '';
      const close = open !== undefined ? '</a>' : '';
      open = href;
      return close + (href !== undefined
        ? `<a href="${esc(href)}" rel="noopener noreferrer" style="color:inherit;text-decoration:none;">`
        : '');
    },
    end() {
      const close = open !== undefined ? '</a>' : '';
      open = undefined;
      return close;
    },
  };
}

/** A segment's link, unless it is a `:ref` (which links to its resource). */
function segmentHref(seg: VDTLineSegment): string | undefined {
  return seg.refResourceId === undefined ? seg.href : undefined;
}

function renderSegments(line: VDTLine, block: VDTBlock, targets?: ReadonlySet<string>): string {
  // The tracking after the last glyph is advance, not ink: centring and
  // right alignment leave it out (EF-153), as the canvas does.
  const lineTracking = (block.letterSpacing ?? 0) + (line.letterSpacing ?? 0);
  const trailing = lineTrailingTracking(line, lineTracking);
  if (!line.segments || line.segments.length === 0) {
    const plainIndent = line.bbox.x - block.bbox.x;
    const plainWidth = line.bbox.width - trailing;
    const plainLeft = block.textAlign === 'right'
      ? Math.max(0, block.bbox.width - plainIndent - plainWidth)
      : block.textAlign === 'center'
        ? Math.max(0, (block.bbox.width - plainIndent - plainWidth) / 2)
        : 0;
    return `<span style="position:absolute;left:${plainLeft.toFixed(3)}px;top:0;white-space:pre;">${esc(line.text)}</span>`;
  }

  // Match canvas justification: stretch inter-word spaces to fill effective width.
  const lineIndent = line.bbox.x - block.bbox.x;
  const effectiveWidth = block.bbox.width - lineIndent;

  let wordWidth = 0;
  let spaceCount = 0;
  for (const seg of line.segments) {
    // A hung mark is outside the measure; a Han–Latin space keeps its
    // width.
    if (seg.hangs) continue;
    if (seg.kind === 'space' && !seg.autospace) spaceCount++;
    else wordWidth += seg.width;
  }
  const contentWidth = lineInkExtent(line, 0).width;

  // Last lines render ragged at natural width — except when overfull:
  // Knuth-Plass may accept a final line wider than the measure on the
  // assumption that its inter-word glue shrinks (TeX glue-setting semantics),
  // so honor that by compressing the spaces to fit the measure exactly.
  const useJustify =
    block.textAlign === 'justify' && spaceCount > 0 &&
    ((!line.isLastLine && !line.ragged) || contentWidth > effectiveWidth);
  const justifiedSpaceWidth = useJustify
    ? (effectiveWidth - wordWidth) / spaceCount
    : 0;

  // Centred / right alignment — math display blocks, ragged-left paragraph
  // styles. Distribute the leading gap.
  const slack = Math.max(0, effectiveWidth - (contentWidth - trailing));
  const leadingGap = block.textAlign === 'center' ? slack / 2 : block.textAlign === 'right' ? slack : 0;

  const parts: string[] = [];
  const links = linkRuns();
  let x = leadingGap;
  const segs = line.segments;
  const paintText = (seg: VDTLineSegment, at: number, inLink = false): string => {
    const font = quoteFontString(pickSegmentFont(seg, block));
    const color = pickSegmentColor(seg, block);
    const fontDecl = font !== quoteFontString(block.fontString) ? `font:${font};` : '';
    const colorDecl = color !== block.color ? `color:${color};` : '';
    const top = seg.baselineShift ? `${seg.baselineShift.toFixed(3)}px` : '0';
    return renderTextSegment(inLink ? { ...seg, refResourceId: undefined } : seg, at, top, fontDecl, colorDecl, color, lineTracking);
  };
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]!;
    if (seg.kind === 'space') {
      x += useJustify && !seg.autospace ? justifiedSpaceWidth : seg.width;
      continue;
    }
    parts.push(links.at(segmentHref(seg)));
    if (seg.kind === 'math') {
      parts.push(renderMathSegmentSvg(seg, x, line, block));
      x += seg.width;
      continue;
    }
    if (seg.kind === 'swatch') {
      parts.push(renderSwatch(x, line.baseline - line.bbox.y, seg.width, seg.swatch?.color, block.color));
      x += seg.width;
      continue;
    }
    if (seg.chip) {
      parts.push(renderChip(seg.chip, x, line.baseline - line.bbox.y, quoteFontString(block.fontString), block.color, (run) =>
        pickSegmentColor({ kind: 'text', text: run.text, width: run.width, bold: run.bold, italic: run.italic }, block)));
      x += seg.width;
      continue;
    }
    if (seg.refResourceId !== undefined && segs[i + 1]?.refContinues) {
      const group = renderRefRuns(segs, i, x, pickSegmentColor(seg, block), (run, at) => paintText(run, at, true), refLinks(seg.refResourceId, targets));
      parts.push(group.html);
      x = group.x;
      i = group.end - 1;
      continue;
    }
    parts.push(paintText(seg, x, seg.refResourceId !== undefined && !refLinks(seg.refResourceId, targets)));
    x += seg.width;
  }
  parts.push(links.end());
  return parts.join('');
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

/** Inline chip (`:chip[…]`): the box — fill, outline, radius — as one
 *  decorative span (`x` is the segment's left edge; the box starts after its
 *  gap margin), then the text runs as ordinary text spans on the line's
 *  baseline (`baselineOffset` from the line top), so the words stay real,
 *  selectable text. `lineFont` / `lineColor` are the line box's own. */
function renderChip(
  chip: VDTChip,
  x: number,
  baselineOffset: number,
  lineFont: string,
  lineColor: string,
  inkFor: (run: VDTChipRun) => string,
): string {
  const bx = x + chip.marginLeft;
  const parts: string[] = [];
  if (chip.background || (chip.borderColor && chip.borderWidth > 0)) {
    parts.push(
      `<span aria-hidden="true" style="position:absolute;left:${bx.toFixed(3)}px;top:${(baselineOffset - chip.ascent).toFixed(3)}px;` +
      `width:${chip.boxWidth.toFixed(3)}px;height:${(chip.ascent + chip.descent).toFixed(3)}px;box-sizing:border-box;` +
      (chip.background ? `background:${chip.background};` : '') +
      (chip.borderColor && chip.borderWidth > 0 ? `border:${chip.borderWidth.toFixed(3)}px solid ${chip.borderColor};` : '') +
      (chip.borderRadius > 0 ? `border-radius:${chip.borderRadius.toFixed(3)}px;` : '') +
      `"></span>`,
    );
  }
  let tx = bx + chip.borderWidth + chip.paddingX;
  for (const run of chip.runs) {
    const font = quoteFontString(run.fontString);
    const color = chip.color ?? inkFor(run);
    const fontDecl = font !== lineFont ? `font:${font};` : '';
    const colorDecl = color !== lineColor ? `color:${color};` : '';
    const top = run.baselineShift ? `${run.baselineShift.toFixed(3)}px` : '0';
    parts.push(renderTextSegment({ kind: 'text', text: run.text, width: run.width }, tx, top, fontDecl, colorDecl, color));
    tx += run.width;
  }
  return parts.join('');
}

function renderBullet(block: VDTBlock): string {
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
  const markerDiv = (cls: string, x: number, font: string, color: string, text: string): string =>
    `<div class="${cls}" aria-hidden="true" style="` +
    `position:absolute;` +
    `left:${x}px;` +
    `top:${firstLine.bbox.y + baselineShift}px;` +
    `height:${firstLine.bbox.height}px;` +
    `font:${onBaseline ? lineFont : font};` +
    `color:${color};` +
    `white-space:pre;` +
    (onBaseline
      ? `"><span style="font:${font};line-height:0;">${esc(text)}</span></div>`
      : `">${esc(text)}</div>`);
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

function renderLine(line: VDTLine, block: VDTBlock, targets?: ReadonlySet<string>): string {
  const font = quoteFontString(block.fontString);
  const strikethroughDecl = block.strikethroughText ? 'text-decoration:line-through;' : '';
  // Tracking — the block's (column balancing, a runt set short) and the
  // line's own (justification): measured into the segment widths, so the
  // glyphs must spread the same way.
  const tracking = (block.letterSpacing ?? 0) + (line.letterSpacing ?? 0);
  const trackingDecl = tracking !== 0 ? `letter-spacing:${tracking}px;` : '';
  return (
    `<div class="pt-line" data-block="${esc(block.id)}" style="` +
    `position:absolute;` +
    `left:${line.bbox.x}px;` +
    `top:${line.bbox.y}px;` +
    `height:${line.bbox.height}px;` +
    `font:${font};` +
    `color:${block.color};` +
    strikethroughDecl +
    trackingDecl +
    `">${renderSegments(line, block, targets)}</div>`
  );
}

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
 *  link colour, `captionLabel` segments in the label colour. */
function renderResourceLine(
  line: VDTLine,
  fonts: ResourceLineFonts,
  color: string,
  linkColor: string,
  labelColor: string = color,
  targets?: ReadonlySet<string>,
): string {
  const baseFont = quoteFontString(fonts.normal);
  const parts: string[] = [];
  if (line.segments && line.segments.length > 0) {
    const segs = line.segments;
    const segColorOf = (seg: VDTLineSegment): string => (seg.refResourceId !== undefined
      ? linkColor
      : seg.captionLabel
        ? labelColor
        : color);
    const paintText = (seg: VDTLineSegment, at: number, inLink = false): string => {
      const font = quoteFontString(pickResourceFont(seg, fonts));
      const segColor = segColorOf(seg);
      const fontDecl = font !== baseFont ? `font:${font};` : '';
      const colorDecl = segColor !== color ? `color:${segColor};` : '';
      const top = seg.baselineShift ? `${seg.baselineShift.toFixed(3)}px` : '0';
      return renderTextSegment(inLink ? { ...seg, refResourceId: undefined } : seg, at, top, fontDecl, colorDecl, segColor, line.letterSpacing ?? 0);
    };
    const links = linkRuns();
    let x = 0;
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i]!;
      if (seg.kind === 'space') {
        x += seg.width;
        continue;
      }
      parts.push(links.at(segmentHref(seg)));
      if (seg.kind === 'swatch') {
        parts.push(renderSwatch(x, line.baseline - line.bbox.y, seg.width, seg.swatch?.color, color));
        x += seg.width;
        continue;
      }
      if (seg.chip) {
        parts.push(renderChip(seg.chip, x, line.baseline - line.bbox.y, baseFont, color, () => color));
        x += seg.width;
        continue;
      }
      if (seg.refResourceId !== undefined && segs[i + 1]?.refContinues) {
        const group = renderRefRuns(segs, i, x, linkColor, (run, at) => paintText(run, at, true), refLinks(seg.refResourceId, targets));
        parts.push(group.html);
        x = group.x;
        i = group.end - 1;
        continue;
      }
      parts.push(paintText(seg, x, seg.refResourceId !== undefined && !refLinks(seg.refResourceId, targets)));
      x += seg.width;
    }
    parts.push(links.end());
  } else {
    parts.push(`<span style="position:absolute;left:0;top:0;white-space:pre;">${esc(line.text)}</span>`);
  }
  return (
    `<div class="pt-line" style="` +
    `position:absolute;` +
    `left:${line.bbox.x}px;` +
    `top:${line.bbox.y}px;` +
    `height:${line.bbox.height}px;` +
    `font:${baseFont};` +
    `color:${color};` +
    // A tracked line (a table header set with `headerLetterSpacing`) was
    // measured with the tracking in its widths.
    (line.letterSpacing ? `letter-spacing:${line.letterSpacing}px;` : '') +
    `">${parts.join('')}</div>`
  );
}

/** An image fitted to a box: `<img>` from `resourceImageUrl`, or the neutral
 *  placeholder the canvas backend paints when nothing is registered. */
function renderFittedImage(
  url: string | undefined,
  alt: string,
  label: string,
  x: number,
  y: number,
  w: number,
  h: number,
  paint?: HtmlPaint,
  svg?: boolean,
): string {
  if (url) {
    const filter = paint ? inkFilterDecl(paint, svg, url) : '';
    return (
      `<img src="${esc(url)}" alt="${esc(alt)}" style="position:absolute;` +
      `left:${x}px;top:${y}px;width:${w}px;height:${h}px;${filter}" />`
    );
  }
  const labelSize = Math.max(10, Math.min(16, h * 0.1));
  return (
    `<div aria-hidden="true" style="position:absolute;` +
    `left:${x}px;top:${y}px;width:${w}px;height:${h}px;` +
    `background:rgba(160,160,160,0.12);border:1px solid rgba(160,160,160,0.5);box-sizing:border-box;` +
    `display:flex;align-items:center;justify-content:center;` +
    `font:${labelSize}px sans-serif;color:rgba(120,120,120,0.8);` +
    `">${label}</div>`
  );
}

/** Wrap absolutely positioned page markup in a box clipped to a rounded
 *  outline: the box sits on the outline and rounds its corners, and an inner
 *  layer shifted back by the box's offset keeps the children's page
 *  coordinates. */
function clipToOutline(html: string, o: RoundedOutline): string {
  if (!html) return '';
  const radius = o.radii.map((r) => `${r}px`).join(' ');
  return (
    `<div aria-hidden="true" style="position:absolute;left:${o.x}px;top:${o.y}px;` +
    `width:${o.width}px;height:${o.height}px;overflow:hidden;border-radius:${radius};">` +
    `<div style="position:absolute;left:${-o.x}px;top:${-o.y}px;">${html}</div></div>`
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
  if (t.borderWidthPx > 0) {
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
    for (const line of cell.lines) {
      parts.push(renderResourceLine(line, fonts, color, rb.linkColor, color, options.linkTargets));
    }
  }
  return parts.join('');
}

function renderResourceBlockHtml(block: VDTBlock, options: HtmlPaint): string {
  const rb = block.resourceBlock;
  if (!rb) return '';
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

  if (rb.kind === 'bitmap' || rb.kind === 'svg') {
    const url = rb.fileId ? imageUrl(options, rb.fileId, rb.resource.id) : undefined;
    // `<img>`, or a neutral placeholder matching the canvas backend's colours.
    parts.push(renderFittedImage(url, rb.resource.altText ?? '', rb.kind === 'svg' ? 'SVG' : 'Image', bx, by, bw, bh, options, rb.kind === 'svg'));
  } else if (rb.kind === 'table') {
    parts.push(renderResourceTable(rb, bx, by, options));
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
  for (const line of rb.captionLines) {
    parts.push(renderResourceLine(line, captionFonts, rb.captionColor, rb.linkColor, rb.captionLabelColor, options.linkTargets));
  }
  const noteFonts: ResourceLineFonts = {
    normal: rb.noteFontString,
    bold: rb.noteBoldFontString,
    italic: rb.noteItalicFontString,
    boldItalic: rb.noteBoldItalicFontString,
  };
  for (const line of [...rb.noteLines, ...(rb.continuesLines ?? [])]) {
    parts.push(renderResourceLine(line, noteFonts, rb.noteColor, rb.linkColor, rb.noteColor, options.linkTargets));
  }
  if (!rot) return anchor + parts.join('');
  return (
    anchor +
    `<div style="position:absolute;left:${rot.originX}px;top:${rot.originY}px;width:0;height:0;` +
    `transform:rotate(${rot.direction === 'ccw' ? -90 : 90}deg);transform-origin:0 0;">` +
    parts.join('') +
    '</div>'
  );
}

function extractFontSizePx(fontString: string): number {
  const m = fontString.match(/(\d+(?:\.\d+)?)px/);
  return m ? parseFloat(m[1]) : 16;
}

function boxStyleDecls(style: VDTDesignBoxStyle): string {
  const bg = style.backgroundColor ? `background:${style.backgroundColor};` : '';
  const border = style.borderColor && style.borderWidthPx > 0
    ? `border:${style.borderWidthPx}px solid ${style.borderColor};box-sizing:border-box;`
    : '';
  const radius = style.borderRadiusPx > 0 ? `border-radius:${style.borderRadiusPx}px;` : '';
  return `${bg}${border}${radius}`;
}

function renderBoxAt(bbox: BoundingBox, style: VDTDesignBoxStyle): string {
  if (bbox.width <= 0 || bbox.height <= 0) return '';
  if (!style.backgroundColor && !style.borderColor) return '';
  return (
    `<div aria-hidden="true" style="` +
    `position:absolute;` +
    `left:${bbox.x}px;top:${bbox.y}px;` +
    `width:${bbox.width}px;height:${bbox.height}px;` +
    boxStyleDecls(style) +
    `"></div>`
  );
}

function renderDesignTextBlock(block: VDTDesignTextBlock): string {
  const parts: string[] = [];
  if (block.box) parts.push(renderBoxAt(block.bbox, block.box));
  const font = quoteFontString(block.fontString);
  const fontSize = extractFontSizePx(block.fontString);
  const lineParts: string[] = [];
  for (const line of block.lines) {
    const top = line.baselineY - block.bbox.y - fontSize * 0.8;
    // Inline marks: the runs as inline spans on the line's baseline, each
    // in its own font; a script is shifted off the baseline. Of a subscript
    // and a superscript set over each other, the first sits in a box that
    // takes no room and the second in one as wide as the pair (EF-80).
    const inner = line.runs
      ? line.runs.map((run, i) => {
          const runFont = quoteFontString(run.fontString);
          const fontDecl = runFont !== font ? `font:${runFont};` : '';
          const stackDecl = run.stacked
            ? 'display:inline-block;width:0;'
            : line.runs![i - 1]?.stacked ? `display:inline-block;min-width:${run.width.toFixed(3)}px;` : '';
          const shiftDecl = run.baselineShift ? `position:relative;top:${run.baselineShift.toFixed(3)}px;` : '';
          return fontDecl || stackDecl || shiftDecl ? `<span style="${fontDecl}${stackDecl}${shiftDecl}">${esc(run.text)}</span>` : esc(run.text);
        }).join('')
      : esc(line.text);
    // A justified line: its word spaces widened as the canvas and the PDF
    // advance its runs (EF-109).
    const wordSpacingDecl = line.wordSpacingPx ? `word-spacing:${line.wordSpacingPx.toFixed(3)}px;` : '';
    lineParts.push(
      `<span style="` +
      `position:absolute;` +
      `left:${line.xOffset.toFixed(3)}px;` +
      `top:${top.toFixed(3)}px;` +
      `line-height:1;white-space:pre;` +
      wordSpacingDecl +
      `">${inner}</span>`,
    );
  }
  const clipDecl = block.clip ? 'overflow:hidden;' : '';
  const trackingDecl = block.letterSpacingPx ? `letter-spacing:${block.letterSpacingPx}px;` : '';
  // An outline over the glyphs (centred on their edges, as on canvas and in
  // the PDF); hollow letters leave the fill transparent.
  const strokeDecl = block.stroke && block.stroke.widthPx > 0
    ? `-webkit-text-stroke:${block.stroke.widthPx}px ${block.stroke.color};` +
      (block.stroke.hollow ? '-webkit-text-fill-color:transparent;' : '')
    : '';
  // Pagination furniture (a split callout's repeated title and marker) is
  // read once: hidden from assistive technology.
  const hidden = block.artifact ? ' aria-hidden="true"' : '';
  parts.push(
    `<div${hidden} style="` +
    `position:absolute;` +
    `left:${block.bbox.x}px;top:${block.bbox.y}px;` +
    `width:${block.bbox.width}px;height:${block.bbox.height}px;` +
    `font:${font};color:${block.color};` +
    clipDecl + trackingDecl + strokeDecl +
    `">${lineParts.join('')}</div>`,
  );
  return parts.join('');
}

function renderDesignRuleBlock(block: VDTDesignRuleBlock): string {
  const w = block.direction === 'vertical' ? block.thicknessPx : block.bbox.width;
  const h = block.direction === 'vertical' ? block.bbox.height : block.thicknessPx;
  return (
    `<div aria-hidden="true" style="` +
    `position:absolute;` +
    `left:${block.bbox.x}px;top:${block.bbox.y}px;` +
    `width:${w}px;height:${h}px;` +
    `background:${block.color};` +
    `"></div>`
  );
}

function renderDesignBoxBlock(block: VDTDesignBoxBlock): string {
  const html = renderBoxAt(block.bbox, block.box);
  // A callout stripe on a rounded frame: clipped to the frame's outline.
  return block.clip ? clipToOutline(html, block.clip) : html;
}

/** Image block (e.g. a callout icon): `<img>` from `resourceImageUrl`, or a
 *  neutral placeholder box when the host cannot supply the image. */
function renderDesignImageBlock(block: VDTDesignImageBlock, options?: HtmlPaint): string {
  const { x, y, width, height } = block.bbox;
  if (width <= 0 || height <= 0) return '';
  const url = imageUrl(options, block.fileId);
  if (url) {
    const svg = block.imageKind === undefined ? undefined : block.imageKind === 'svg';
    const filter = options ? inkFilterDecl(options, svg, url) : '';
    return (
      `<img src="${esc(url)}" alt="" style="position:absolute;` +
      `left:${x}px;top:${y}px;width:${width}px;height:${height}px;${filter}" />`
    );
  }
  return (
    `<div aria-hidden="true" style="position:absolute;` +
    `left:${x}px;top:${y}px;width:${width}px;height:${height}px;` +
    `background:rgba(160,160,160,0.12);border:1px solid rgba(160,160,160,0.5);box-sizing:border-box;` +
    `"></div>`
  );
}

function renderDesignBlock(block: VDTDesignBlock, options?: HtmlPaint): string {
  if (block.kind === 'text') return renderDesignTextBlock(block);
  if (block.kind === 'rule') return renderDesignRuleBlock(block);
  if (block.kind === 'image') return renderDesignImageBlock(block, options);
  return renderDesignBoxBlock(block);
}

function renderDesignSlot(slot: VDTDesignSlot, options?: HtmlPaint): string {
  const parts: string[] = [];
  for (const block of slot.blocks) parts.push(renderDesignBlock(block, options));
  return parts.join('');
}

function renderBlockInner(block: VDTBlock, options: HtmlPaint): string {
  if (block.hidden) return '';
  if (block.designOverlay) return renderDesignSlot(block.designOverlay, options);
  // Resource embeds carry their own measured geometry (image/table + caption);
  // the block's single placeholder line renders nothing useful.
  if (block.resourceBlock) return renderResourceBlockHtml(block, options);
  const parts: string[] = [];
  parts.push(renderBullet(block));
  for (const line of block.lines) {
    parts.push(renderLine(line, block, options.linkTargets));
  }
  return parts.join('');
}

/**
 * Render a block wrapped in a `<div class="pt-block" data-block-id="...">`
 * container with `display:contents` so lines keep their absolute positioning
 * against the page wrapper. The wrapper exists solely as a stable anchor for
 * per-block DOM patching — consumers can replace a single block's outerHTML
 * without touching the rest of the page.
 */
function renderBlock(block: VDTBlock, options: HtmlPaint): string {
  return (
    `<div class="pt-block" data-block-id="${esc(block.id)}" style="display:contents;">` +
    renderBlockInner(block, options) +
    `</div>`
  );
}

interface PageRenderResult {
  /** Full outer HTML including the wrapping <div class="pt-page">. */
  outerHtml: string;
  /** Inner HTML: opener band, pt-block wrappers, header and footer. */
  innerHtml: string;
  /** Per-block outer-HTML strings, in render order. */
  blocks: Array<{ id: string; html: string }>;
  /** Everything on the page that is not a block — opener / part band,
   *  header, footer. Lives outside `blocks`, so a patcher that diffs blocks
   *  must compare this separately to catch a design-only change. */
  decorationHtml: string;
}

function renderPageDetailed(
  page: VDTPage,
  background: string,
  pageOptions: HtmlPaint,
  ink: { hex: string; matrix: number[] } | null = null,
  /** With cut lines, how far the bleed box lies inside the sheet (px); 0
   *  without them. */
  bleedInset = 0,
  /** The character grid drawn over the type area (`cjk.grid.show`). */
  gridCells?: CjkGridCells,
): PageRenderResult {
  const bgDecl = background && background !== 'transparent' ? `background:${background};` : '';
  // With cut lines nothing the page paints shows past the bleed box, as on
  // the canvas and in the PDF (EF-133).
  const clipDecl = bleedInset > 0 ? `clip-path:inset(${bleedInset}px);` : '';
  // A filter id local to the page and its ink, so every page is
  // self-contained (a patcher may replace pages one by one) and two
  // documents on one page never share a filter.
  const options: HtmlPaint = ink
    ? { ...pageOptions, ink: { id: `pt-ink-${ink.hex.replace(/[^0-9a-z]/gi, '')}-${page.index}`, matrix: ink.matrix } }
    : pageOptions;
  const blocks: Array<{ id: string; html: string }> = [];
  for (const col of page.columns) {
    for (const block of col.blocks) {
      blocks.push({ id: block.id, html: renderBlock(block, options) });
    }
  }
  // Floated resources live in page bands outside the columns (a span:'page'
  // float crosses the gutter); they carry absolute geometry already.
  for (const fb of page.floats ?? []) {
    blocks.push({ id: fb.id, html: renderBlock(fb, options) });
  }
  const blocksHtml = blocks.map((b) => b.html).join('');
  // Same paint order as the canvas backend: the opener / part band goes
  // under the body (a part page's full-bleed background must not cover its
  // chapter list); header and footer paint on top.
  const openerHtml = page.openerBand ? renderDesignSlot(page.openerBand, options) : '';
  const slotParts: string[] = [];
  if (page.header) slotParts.push(renderDesignSlot(page.header, options));
  if (page.footer) slotParts.push(renderDesignSlot(page.footer, options));
  // Whether or not a picture on the page uses it: a host patching blocks
  // one by one may bring in an SVG image the first render did not have.
  const defsHtml = options.ink ? inkFilterDefs(options.ink) : '';
  // The separators above the footnotes of the columns.
  const footnoteRulesHtml = footnoteRuleSegments(page).map((r) =>
    `<div class="pt-footnote-rule" style="position:absolute;left:${r.x}px;top:${r.y - r.lineWidthPx / 2}px;width:${r.width}px;height:${r.lineWidthPx}px;background:${r.color};"></div>`,
  ).join('');
  const gridHtml = gridCells ? renderCharacterGridSvg(gridCells, page.width, page.height) : '';
  const decorationHtml = defsHtml + gridHtml + openerHtml + footnoteRulesHtml + slotParts.join('');
  const innerHtml = defsHtml + gridHtml + openerHtml + blocksHtml + footnoteRulesHtml + slotParts.join('');
  const outerHtml =
    `<div class="pt-page" data-page="${page.index}" style="` +
    `position:relative;` +
    `width:${page.width}px;` +
    `height:${page.height}px;` +
    `flex-shrink:0;` +
    bgDecl +
    clipDecl +
    `">${innerHtml}</div>`;
  return { outerHtml, innerHtml, blocks, decorationHtml };
}

/** The character grid (稿纸) as one SVG path over the page, under the
 *  text (see `cjkGridCells`). */
function renderCharacterGridSvg(cells: CjkGridCells, width: number, height: number): string {
  const { cell } = cells;
  const d: string[] = [];
  const n = (v: number): string => String(Math.round(v * 1000) / 1000);
  cells.columns.forEach((x0, c) => {
    const chars = cells.columnChars[c] ?? cells.chars;
    const w = chars * cell;
    for (const y of cells.rows) {
      d.push(`M${n(x0)} ${n(y)}h${n(w)}M${n(x0)} ${n(y + cell)}h${n(w)}`);
      for (let i = 0; i <= chars; i++) d.push(`M${n(x0 + i * cell)} ${n(y)}v${n(cell)}`);
    }
  });
  return `<svg class="pt-char-grid" aria-hidden="true" width="${width}" height="${height}" style="position:absolute;left:0;top:0;pointer-events:none;">` +
    `<path d="${d.join('')}" fill="none" stroke="${CHARACTER_GRID_COLOR}" stroke-width="0.5"/></svg>`;
}

export interface HtmlRenderIndexPage {
  index: number;
  width: number;
  height: number;
  innerHtml: string;
  blocks: Array<{ id: string; html: string }>;
  /** Non-block markup (opener band, header, footer); see `PageRenderResult`. */
  decorationHtml: string;
}

export interface HtmlRenderIndex {
  html: string;
  mode: 'single' | 'multi';
  pages: HtmlRenderIndexPage[];
}

/**
 * CSS declarations (a `prop:value;` list) that reset the inherited text
 * properties to the values the engine measured with. Every line of the
 * output is positioned at the widths the canvas measured, so a host that
 * sets `letter-spacing`, `word-spacing`, `text-transform`, a `font-variant`
 * or a `line-height` on an ancestor would otherwise widen or change the
 * glyph runs and make lines overprint. The `.pt-doc` root carries them
 * before its own layout declarations; a host that mounts the pages'
 * `innerHtml` in containers of its own sets them on its root.
 */
export const HTML_TEXT_RESET =
  'letter-spacing:normal;word-spacing:normal;text-transform:none;text-indent:0;' +
  'white-space:normal;word-break:normal;overflow-wrap:normal;' +
  'font-style:normal;font-variant:normal;font-weight:400;font-stretch:normal;' +
  'font-feature-settings:normal;font-variation-settings:normal;font-kerning:auto;' +
  'font-optical-sizing:auto;font-size-adjust:none;font-synthesis:initial;' +
  'line-height:normal;text-align:left;text-shadow:none;text-rendering:auto;' +
  'text-emphasis:none;hyphens:manual;direction:ltr;writing-mode:horizontal-tb;' +
  '-webkit-text-stroke:0;-webkit-text-fill-color:currentcolor;' +
  '-webkit-text-size-adjust:100%;text-size-adjust:100%;';

/**
 * Like renderToHtml, but also returns a per-page / per-block breakdown that
 * callers can use to diff against a previous render and patch only the DOM
 * subtrees whose HTML actually changed.
 */
export function renderToHtmlIndexed(
  doc: VDTDocument,
  options: RenderHtmlOptions = {},
): HtmlRenderIndex {
  const mode = options.mode ?? 'multi';
  const gap = options.columnGap ?? 24;
  const padding = options.padding ?? 24;
  const background =
    options.background ?? doc.config.page.backgroundColor.hex ?? 'transparent';

  // A right-bound book lays its pages out right to left in a row.
  const docStyle =
    mode === 'multi'
      ? `display:flex;flex-direction:${doc.binding === 'right' ? 'row-reverse' : 'row'};gap:${gap}px;align-items:flex-start;padding:${padding}px;box-sizing:border-box;width:max-content;`
      : `display:flex;flex-direction:column;align-items:center;padding:${padding}px 0;box-sizing:border-box;`;

  // Single-ink diagrams: SVG pictures are filtered to the ink when the host
  // asks (its URLs are not recoloured already).
  const singleInk = options.singleInk ?? options.resourceImageUrl?.singleInk ?? false;
  const inkHex = singleInk ? documentInkHex(doc.config) : null;
  const inkMatrix = inkHex ? singleInkColorMatrix(inkHex) : null;
  const ink = inkHex && inkMatrix ? { hex: inkHex, matrix: inkMatrix } : null;

  const indexedPages: HtmlRenderIndexPage[] = [];
  const pageHtmlParts: string[] = [];
  const onWarning = options.onWarning;
  const reported = new Set<string>();
  const linkTargets = anchoredResourceIds(doc);
  for (const id of options.refTargets ?? []) linkTargets.add(id);
  const bleedInset = doc.trimOffset > 0
    ? Math.max(0, doc.trimOffset - dimensionToPx(doc.config.page.cutLines.bleed, doc.config.page.dpi))
    : 0;
  for (const p of doc.pages) {
    const pageOptions: HtmlPaint = onWarning
      ? {
          ...options,
          linkTargets,
          missingImage: (fileId: string, resourceId?: string) => {
            if (reported.has(fileId)) return;
            reported.add(fileId);
            onWarning({ kind: 'missingImage', fileId, ...(resourceId !== undefined ? { resourceId } : {}), pageIndex: p.index });
          },
        }
      : { ...options, linkTargets };
    const gridCells = doc.config.cjk?.grid?.show ? cjkGridCells(doc.config, p.contentArea, doc.baselineGrid, p.columns) : undefined;
    const detail = renderPageDetailed(p, background, pageOptions, ink, bleedInset, gridCells);
    pageHtmlParts.push(detail.outerHtml);
    indexedPages.push({
      index: p.index,
      width: p.width,
      height: p.height,
      innerHtml: detail.innerHtml,
      blocks: detail.blocks,
      decorationHtml: detail.decorationHtml,
    });
  }

  // The host's inherited text properties are reset first (EF-96). A
  // Chinese, Japanese or Korean document declares its language, so the
  // browser picks the region's glyph forms (see `renderLangOf`).
  const docLang = renderLangOf(doc.config);
  const html =
    `<div class="pt-doc"${docLang ? ` lang="${docLang}"` : ''} data-mode="${mode}" style="${HTML_TEXT_RESET}${docStyle}">` +
    pageHtmlParts.join('') +
    `</div>`;

  return { html, mode, pages: indexedPages };
}

export function renderToHtml(doc: VDTDocument, options: RenderHtmlOptions = {}): string {
  return renderToHtmlIndexed(doc, options).html;
}
