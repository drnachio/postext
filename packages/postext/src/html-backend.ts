import type {
  VDTDocument,
  VDTPage,
  VDTBlock,
  VDTLine,
  VDTLineSegment,
  VDTDesignSlot,
  VDTDesignBlock,
  VDTDesignTextBlock,
  VDTDesignRuleBlock,
  VDTDesignBoxBlock,
  VDTDesignBoxStyle,
  BoundingBox,
} from './vdt';

export interface RenderHtmlOptions {
  /** Layout mode: single vertical column or many columns laid out horizontally. */
  mode?: 'single' | 'multi';
  /** Horizontal gap between pages/columns in multi mode. Default: 24 */
  columnGap?: number;
  /** Outer padding around the document. Default: 24 */
  padding?: number;
  /** Background color for each page (overrides config). */
  background?: string;
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

function renderSegments(line: VDTLine, block: VDTBlock): string {
  if (!line.segments || line.segments.length === 0) {
    return `<span style="position:absolute;left:0;top:0;white-space:pre;">${esc(line.text)}</span>`;
  }

  // Match canvas justification: stretch inter-word spaces to fill effective width.
  const lineIndent = line.bbox.x - block.bbox.x;
  const effectiveWidth = block.bbox.width - lineIndent;

  let wordWidth = 0;
  let spaceCount = 0;
  for (const seg of line.segments) {
    if (seg.kind === 'space') spaceCount++;
    else wordWidth += seg.width;
  }

  const useJustify =
    block.textAlign === 'justify' && !line.isLastLine && spaceCount > 0;
  const justifiedSpaceWidth = useJustify
    ? (effectiveWidth - wordWidth) / spaceCount
    : 0;

  // Centred alignment — used by math display blocks. Distribute leading gap.
  const useCenter = block.textAlign === 'center';
  const contentWidth = line.segments.reduce((s, seg) => s + seg.width, 0);
  const centerLeft = useCenter ? Math.max(0, (effectiveWidth - contentWidth) / 2) : 0;

  const parts: string[] = [];
  let x = centerLeft;
  for (const seg of line.segments) {
    if (seg.kind === 'space') {
      x += useJustify ? justifiedSpaceWidth : seg.width;
      continue;
    }
    if (seg.kind === 'math') {
      parts.push(renderMathSegmentSvg(seg, x, line, block));
      x += seg.width;
      continue;
    }
    const font = quoteFontString(pickSegmentFont(seg, block));
    const color = pickSegmentColor(seg, block);
    const fontDecl = font !== quoteFontString(block.fontString) ? `font:${font};` : '';
    const colorDecl = color !== block.color ? `color:${color};` : '';
    parts.push(
      `<span style="position:absolute;left:${x.toFixed(3)}px;top:0;white-space:pre;${fontDecl}${colorDecl}">${esc(seg.text)}</span>`,
    );
    x += seg.width;
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
  return (
    `<div class="pt-bullet" aria-hidden="true" style="` +
    `position:absolute;` +
    `left:${block.bulletOffsetX}px;` +
    `top:${firstLine.bbox.y}px;` +
    `height:${firstLine.bbox.height}px;` +
    `font:${bulletFont};` +
    `color:${bulletColor};` +
    `white-space:pre;` +
    `">${esc(block.bulletText)}</div>`
  );
}

function renderLine(line: VDTLine, block: VDTBlock): string {
  const font = quoteFontString(block.fontString);
  const strikethroughDecl = block.strikethroughText ? 'text-decoration:line-through;' : '';
  return (
    `<div class="pt-line" data-block="${esc(block.id)}" style="` +
    `position:absolute;` +
    `left:${line.bbox.x}px;` +
    `top:${line.bbox.y}px;` +
    `height:${line.bbox.height}px;` +
    `font:${font};` +
    `color:${block.color};` +
    strikethroughDecl +
    `">${renderSegments(line, block)}</div>`
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
    lineParts.push(
      `<span style="` +
      `position:absolute;` +
      `left:${line.xOffset.toFixed(3)}px;` +
      `top:${top.toFixed(3)}px;` +
      `line-height:1;white-space:pre;` +
      `">${esc(line.text)}</span>`,
    );
  }
  const clipDecl = block.clip ? 'overflow:hidden;' : '';
  parts.push(
    `<div style="` +
    `position:absolute;` +
    `left:${block.bbox.x}px;top:${block.bbox.y}px;` +
    `width:${block.bbox.width}px;height:${block.bbox.height}px;` +
    `font:${font};color:${block.color};` +
    clipDecl +
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
  return renderBoxAt(block.bbox, block.box);
}

function renderDesignBlock(block: VDTDesignBlock): string {
  if (block.kind === 'text') return renderDesignTextBlock(block);
  if (block.kind === 'rule') return renderDesignRuleBlock(block);
  return renderDesignBoxBlock(block);
}

function renderDesignSlot(slot: VDTDesignSlot): string {
  const parts: string[] = [];
  for (const block of slot.blocks) parts.push(renderDesignBlock(block));
  return parts.join('');
}

function renderBlockInner(block: VDTBlock): string {
  if (block.hidden) return '';
  if (block.designOverlay) return renderDesignSlot(block.designOverlay);
  const parts: string[] = [];
  parts.push(renderBullet(block));
  for (const line of block.lines) {
    parts.push(renderLine(line, block));
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
function renderBlock(block: VDTBlock): string {
  return (
    `<div class="pt-block" data-block-id="${esc(block.id)}" style="display:contents;">` +
    renderBlockInner(block) +
    `</div>`
  );
}

interface PageRenderResult {
  /** Full outer HTML including the wrapping <div class="pt-page">. */
  outerHtml: string;
  /** Inner HTML (all pt-block wrappers concatenated). */
  innerHtml: string;
  /** Per-block outer-HTML strings, in render order. */
  blocks: Array<{ id: string; html: string }>;
}

function renderPageDetailed(page: VDTPage, background: string): PageRenderResult {
  const bgDecl = background && background !== 'transparent' ? `background:${background};` : '';
  const blocks: Array<{ id: string; html: string }> = [];
  for (const col of page.columns) {
    for (const block of col.blocks) {
      blocks.push({ id: block.id, html: renderBlock(block) });
    }
  }
  const blocksHtml = blocks.map((b) => b.html).join('');
  const slotParts: string[] = [];
  if (page.openerBand) slotParts.push(renderDesignSlot(page.openerBand));
  if (page.header) slotParts.push(renderDesignSlot(page.header));
  if (page.footer) slotParts.push(renderDesignSlot(page.footer));
  const innerHtml = blocksHtml + slotParts.join('');
  const outerHtml =
    `<div class="pt-page" data-page="${page.index}" style="` +
    `position:relative;` +
    `width:${page.width}px;` +
    `height:${page.height}px;` +
    `flex-shrink:0;` +
    bgDecl +
    `">${innerHtml}</div>`;
  return { outerHtml, innerHtml, blocks };
}

export interface HtmlRenderIndexPage {
  index: number;
  width: number;
  height: number;
  innerHtml: string;
  blocks: Array<{ id: string; html: string }>;
}

export interface HtmlRenderIndex {
  html: string;
  mode: 'single' | 'multi';
  pages: HtmlRenderIndexPage[];
}

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

  const docStyle =
    mode === 'multi'
      ? `display:flex;flex-direction:row;gap:${gap}px;align-items:flex-start;padding:${padding}px;box-sizing:border-box;width:max-content;`
      : `display:flex;flex-direction:column;align-items:center;padding:${padding}px 0;box-sizing:border-box;`;

  const indexedPages: HtmlRenderIndexPage[] = [];
  const pageHtmlParts: string[] = [];
  for (const p of doc.pages) {
    const detail = renderPageDetailed(p, background);
    pageHtmlParts.push(detail.outerHtml);
    indexedPages.push({
      index: p.index,
      width: p.width,
      height: p.height,
      innerHtml: detail.innerHtml,
      blocks: detail.blocks,
    });
  }

  const html =
    `<div class="pt-doc" data-mode="${mode}" style="${docStyle}">` +
    pageHtmlParts.join('') +
    `</div>`;

  return { html, mode, pages: indexedPages };
}

export function renderToHtml(doc: VDTDocument, options: RenderHtmlOptions = {}): string {
  return renderToHtmlIndexed(doc, options).html;
}
