import type { VDTDocument, VDTPage, VDTBlock, VDTLine, VDTLineSegment } from './vdt';

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

  const parts: string[] = [];
  let x = 0;
  for (const seg of line.segments) {
    if (seg.kind === 'space') {
      x += useJustify ? justifiedSpaceWidth : seg.width;
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
    block.bulletOffsetX === undefined ||
    block.bulletY === undefined
  ) {
    return '';
  }
  const bulletFont = quoteFontString(block.bulletFontString ?? block.fontString);
  const bulletColor = block.bulletColor ?? block.color;
  return (
    `<div class="pt-bullet" aria-hidden="true" style="` +
    `position:absolute;` +
    `left:${block.bulletOffsetX}px;` +
    `top:${block.bulletY}px;` +
    `font:${bulletFont};` +
    `color:${bulletColor};` +
    `transform:translateY(-50%);` +
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

function renderBlock(block: VDTBlock): string {
  const parts: string[] = [];
  parts.push(renderBullet(block));
  for (const line of block.lines) {
    parts.push(renderLine(line, block));
  }
  return parts.join('');
}

function renderPage(page: VDTPage, background: string): string {
  const bgDecl = background && background !== 'transparent' ? `background:${background};` : '';
  const blocks: string[] = [];
  for (const col of page.columns) {
    for (const block of col.blocks) {
      blocks.push(renderBlock(block));
    }
  }
  return (
    `<div class="pt-page" data-page="${page.index}" style="` +
    `position:relative;` +
    `width:${page.width}px;` +
    `height:${page.height}px;` +
    `flex-shrink:0;` +
    bgDecl +
    `">${blocks.join('')}</div>`
  );
}

export function renderToHtml(doc: VDTDocument, options: RenderHtmlOptions = {}): string {
  const mode = options.mode ?? 'multi';
  const gap = options.columnGap ?? 24;
  const padding = options.padding ?? 24;
  const background =
    options.background ?? doc.config.page.backgroundColor.hex ?? 'transparent';

  const docStyle =
    mode === 'multi'
      ? `display:flex;flex-direction:row;gap:${gap}px;align-items:flex-start;padding:${padding}px;box-sizing:border-box;width:max-content;`
      : `display:flex;flex-direction:column;align-items:center;padding:${padding}px 0;box-sizing:border-box;`;

  const pages = doc.pages.map((p) => renderPage(p, background)).join('');
  return `<div class="pt-doc" data-mode="${mode}" style="${docStyle}">${pages}</div>`;
}
