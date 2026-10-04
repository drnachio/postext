// Laid-out lines back to running text: the segments of each line become
// inline items (formatting and links kept, justification and tracking
// dropped) and the lines of a paragraph are joined again — with a space
// where the line broke at one, with nothing after a hyphen the break added
// (which goes) or one the text carries (which stays), and with nothing
// between Chinese, Japanese or Thai characters, which break without spaces.

import type { MathRender, VDTLine, VDTLineSegment } from 'postext';
import type { Format, InlineItem, LinkTarget } from './model';
import { escapeAttr, escapeXml, stripInvalidXmlChars } from '../shared/xml';

/** What turning lines into items needs to know about their document. */
export interface InlineContext {
  /** Index of the chapter document (footnote ids are per document). */
  doc: number;
  /** Language of the text: a Catalan `l·l` broken as `l-` | `l` gets its
   *  middle dot back. */
  lang: string;
  /** Size (px) of the block's text, for formulas sized in ems. */
  basePx: number;
  /** A footnote marker was read: whether it is the note's first. */
  noteRef(id: string): boolean;
}

/** Characters set without spaces between words: a line may break right
 *  before or after one with nothing between them. */
const UNSPACED = /[⺀-⿿　-〿぀-ヿ㄀-ㇿ㈀-鿿豈-﫿︰-﹏＀-￯฀-໿က-႟ក-៿\u{20000}-\u{3FFFF}]/u;

const HYPHENS = /[-‐]$/;

/** Size of a CSS font shorthand in px (16 when it has none). */
export function fontPx(fontString: string | undefined): number {
  const m = fontString ? /(\d+(?:\.\d+)?)px/.exec(fontString) : null;
  return m ? Number(m[1]) : 16;
}

/** An element id from any string: ASCII letters, digits, `-` and `_`
 *  kept, every other character written as `_<hex>` (so two ids never
 *  collide and the fragment needs no escaping in an href). */
export function idOf(prefix: string, raw: string): string {
  return prefix + raw.replace(/[^A-Za-z0-9_-]/gu, (c) => `_${c.codePointAt(0)!.toString(16)}`);
}

/** Text safe for an XML text node. */
export function xmlText(text: string): string {
  return escapeXml(stripInvalidXmlChars(text));
}

/** Text safe for an XML attribute value. */
export function xmlAttr(text: string): string {
  return escapeAttr(stripInvalidXmlChars(text));
}

/** The link a segment carries: a `:ref` to a resource or an anchor, a
 *  Markdown link (`#id` being an anchor of the book), a footnote marker,
 *  an index page number. */
function linkOf(seg: VDTLineSegment, ctx: InlineContext): LinkTarget | undefined {
  if (seg.refResourceId !== undefined) {
    return seg.refAnchor ? { kind: 'anchor', id: seg.refResourceId } : { kind: 'resource', id: seg.refResourceId };
  }
  if (seg.href !== undefined) {
    if (seg.href.startsWith('#') && seg.href.length > 1) {
      let id = seg.href.slice(1);
      try {
        id = decodeURIComponent(id);
      } catch {
        // Keep it as written.
      }
      return { kind: 'anchor', id };
    }
    return { kind: 'url', href: seg.href };
  }
  if (seg.footnoteId !== undefined) return { kind: 'note', doc: ctx.doc, id: seg.footnoteId, first: ctx.noteRef(seg.footnoteId) };
  if (seg.pageLink !== undefined) return { kind: 'page', bookIndex: seg.pageLink };
  return undefined;
}

function formatOf(seg: { bold?: boolean; italic?: boolean }, full?: VDTLineSegment): Format {
  const fmt: Format = {};
  if (seg.bold) fmt.bold = true;
  if (seg.italic) fmt.italic = true;
  if (!full) return fmt;
  if (full.script) fmt.script = full.script;
  if (full.fontString?.includes('small-caps')) fmt.smallCaps = true;
  if (full.captionLabel) fmt.label = true;
  if (full.cjkMarks?.dots) fmt.dots = true;
  if (full.cjkMarks?.properName !== undefined) fmt.proper = true;
  if (full.cjkMarks?.bookTitle !== undefined) fmt.book = true;
  if (full.tcy) fmt.tcy = true;
  if (full.orientation) fmt.orientation = full.orientation;
  if (full.warichu) fmt.warichu = true;
  return fmt;
}

/** A formula's SVG as XML a content document can embed: namespaces
 *  declared, MathJax's `data-*` attributes and HTML entities gone, sized
 *  in ems of the surrounding text so it scales with the reader's font. */
export function mathSvg(render: MathRender, basePx: number, inline: boolean): string {
  const em = (px: number) => `${round(px / basePx)}em`;
  const vb = render.viewBox;
  let body = render.svg.replace(/^[\s\S]*?<svg\b[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  body = body
    .replace(/\s+data-[\w-]+="[^"]*"/g, '')
    .replace(/&nbsp;/g, '&#160;')
    .replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');
  const xlink = /\bxlink:/.test(body) ? ' xmlns:xlink="http://www.w3.org/1999/xlink"' : '';
  const align = inline ? ` style="vertical-align:${round(-render.depthPx / basePx)}em"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg"${xlink} viewBox="${vb.minX} ${vb.minY} ${vb.width} ${vb.height}" width="${em(render.widthPx)}" height="${em(render.heightPx)}"${align} aria-hidden="true" focusable="false">${body}</svg>`;
}

export function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** The markup of a segment that is no plain text run, or undefined. */
function rawOf(seg: VDTLineSegment, ctx: InlineContext): string | undefined {
  if (seg.kind === 'math' && seg.mathRender) {
    const tex = seg.mathRender.tex;
    return `<span class="pt-math" role="math" aria-label="${xmlAttr(tex)}">${mathSvg(seg.mathRender, ctx.basePx, true)}</span>`;
  }
  if (seg.kind === 'swatch') {
    const color = seg.swatch?.color;
    return color
      ? `<span class="pt-swatch" role="img" aria-label="${xmlAttr(color)}" style="background-color:${xmlAttr(color)}"></span>`
      : '<span class="pt-swatch" role="img" aria-label="?"></span>';
  }
  if (seg.chip) {
    const runs = seg.chip.runs.map((r) => wrapFormat(xmlText(r.text), formatOf(r))).join('');
    return `<span class="pt-chip pt-chip-${idOf('', seg.chip.styleId)}">${runs}</span>`;
  }
  if (seg.ruby) {
    const pos = seg.ruby.position === 'under' ? ' class="pt-ruby-under"' : seg.ruby.position === 'right' ? ' class="pt-ruby-right"' : '';
    return `<ruby${pos}>${wrapFormat(xmlText(seg.text), formatOf(seg, seg))}<rp>(</rp><rt>${xmlText(seg.ruby.text)}</rt><rp>)</rp></ruby>`;
  }
  return undefined;
}

/** `inner` inside the elements and classes of `fmt`. */
export function wrapFormat(inner: string, fmt: Format): string {
  const classes = [
    fmt.smallCaps && 'pt-sc',
    fmt.label && 'pt-label',
    fmt.dots && 'pt-dots',
    fmt.proper && 'pt-proper',
    fmt.book && 'pt-book',
    fmt.tcy && 'pt-tcy',
    fmt.orientation && `pt-${fmt.orientation}`,
    fmt.warichu && 'pt-warichu',
    fmt.done && 'pt-done',
  ].filter(Boolean);
  let out = classes.length > 0 ? `<span class="${classes.join(' ')}">${inner}</span>` : inner;
  if (fmt.script) out = `<${fmt.script}>${out}</${fmt.script}>`;
  if (fmt.italic) out = `<em>${out}</em>`;
  if (fmt.bold) out = `<strong>${out}</strong>`;
  return out;
}

/** The text items of one line, in logical order. */
export function lineItems(line: VDTLine, ctx: InlineContext, segments = line.segments): InlineItem[] {
  const out: InlineItem[] = [];
  const segs = segments ?? (line.text ? [{ kind: 'text', text: line.text, width: 0 } as VDTLineSegment] : []);
  let first = true;
  for (const seg of segs) {
    const link = linkOf(seg, ctx);
    const raw = rawOf(seg, ctx);
    if (raw !== undefined) {
      out.push({ t: 'raw', xhtml: raw, ...(link ? { link } : {}) });
      first = false;
      continue;
    }
    if (seg.kind === 'space') {
      const text = seg.labelTab ? ' ' : seg.text.length > 0 ? seg.text : seg.autospace ? '' : ' ';
      if (text) out.push({ t: 'text', text, fmt: {}, ...(link ? { link } : {}) });
      continue;
    }
    if (seg.kind !== 'text') continue;
    const runs = seg.runs && seg.runs.length > 0 ? seg.runs : [{ text: seg.text, bold: seg.bold, italic: seg.italic }];
    for (const run of runs) {
      let text = run.text;
      // The repeated hyphen of a compound broken at its hyphen
      // ("vencer-" | "-se") is not in the text.
      if (first && line.repeatedHyphen) text = text.replace(/^-/, '');
      // Kashidas justification stretched the words with.
      if (line.kashida) text = text.replace(/ـ/g, '');
      first = false;
      if (!text) continue;
      out.push({ t: 'text', text, fmt: formatOf(run, seg), ...(link ? { link } : {}) });
    }
  }
  return out;
}

/** Text runs flowing into one paragraph (or heading, list item, cell…). */
export interface TextSink {
  inl: InlineItem[];
  /** The last line appended, which decides how the next one joins. */
  prev?: VDTLine;
}

function lastText(inl: InlineItem[]): Extract<InlineItem, { t: 'text' }> | undefined {
  for (let i = inl.length - 1; i >= 0; i--) {
    const item = inl[i]!;
    if (item.t === 'text') return item;
    if (item.t === 'raw') return undefined;
  }
  return undefined;
}

function firstChar(items: InlineItem[]): string {
  for (const item of items) {
    if (item.t === 'text' && item.text.length > 0) return [...item.text][0]!;
    if (item.t === 'raw') return 'x';
  }
  return '';
}

/** Append a line to `sink`, joined to the line before it. `before` (page
 *  starts, anchors) goes right before the line's text. */
export function appendLine(sink: TextSink, line: VDTLine, ctx: InlineContext, before: InlineItem[] = [], segments?: VDTLineSegment[]): void {
  const items = lineItems(line, ctx, segments);
  const prev = sink.prev;
  if (prev && sink.inl.length > 0) {
    const last = lastText(sink.inl);
    const tail = last ? [...last.text].pop() ?? '' : '';
    if (prev.hyphenated) {
      // The break added the hyphen the line ends on, unless the text has
      // it (a compound) or the line ends at a dash or inside a URL.
      if (!prev.hardHyphen && last && HYPHENS.test(last.text)) {
        last.text = last.text.slice(0, -1);
        // Catalan: `il-` | `lusió` was `il·lusió` (the hyphen took the
        // middle dot's place).
        if (/^ca\b/i.test(ctx.lang) && /[lL]$/.test(last.text) && /^[lL]/.test(firstChar(items))) last.text += '·';
      }
    } else if (tail && !/\s/.test(tail) && !HYPHENS.test(tail)) {
      const next = firstChar(items);
      if (next && !/\s/.test(next) && !UNSPACED.test(tail) && !UNSPACED.test(next)) {
        sink.inl.push({ t: 'text', text: ' ', fmt: {} });
      }
    }
  }
  sink.inl.push(...before, ...items);
  sink.prev = line;
}

/** Append every line of a block. */
export function appendLines(sink: TextSink, lines: readonly VDTLine[], ctx: InlineContext, beforeLine?: (line: VDTLine, i: number) => InlineItem[]): void {
  lines.forEach((line, i) => appendLine(sink, line, ctx, beforeLine?.(line, i) ?? []));
}

/** The plain text of inline items (labels, titles, alt text). */
export function plainText(inl: readonly InlineItem[]): string {
  return inl.map((i) => (i.t === 'text' ? i.text : '')).join('').replace(/\s+/g, ' ').trim();
}

/** A space with no link of its own between two runs that share one takes
 *  it, so linked words separated by spaces stay one link. */
export function bridgeLinks(inl: InlineItem[]): InlineItem[] {
  for (let i = 1; i < inl.length - 1; i++) {
    const item = inl[i]!;
    if (item.t !== 'text' || item.link || /\S/.test(item.text)) continue;
    const a = inl[i - 1]!;
    const b = inl[i + 1]!;
    if ((a.t === 'text' || a.t === 'raw') && (b.t === 'text' || b.t === 'raw') && a.link && b.link && linkKey(a.link) === linkKey(b.link)) {
      inl[i] = { ...item, link: a.link };
    }
  }
  // Likewise a plain space between two runs in one format (two bold words)
  // takes their format, so they make one element.
  for (let i = 1; i < inl.length - 1; i++) {
    const item = inl[i]!;
    if (item.t !== 'text' || /\S/.test(item.text) || formatKey(item.fmt) !== formatKey({})) continue;
    const a = inl[i - 1]!;
    const b = inl[i + 1]!;
    if (a.t === 'text' && b.t === 'text' && linkKey(a.link) === linkKey(b.link) && linkKey(item.link) === linkKey(a.link) && formatKey(a.fmt) === formatKey(b.fmt)) {
      inl[i] = { ...item, fmt: a.fmt };
    }
  }
  return inl;
}

export function linkKey(link: LinkTarget | undefined): string {
  if (!link) return '';
  switch (link.kind) {
    case 'url': return `u:${link.href}`;
    case 'anchor': return `a:${link.id}`;
    case 'resource': return `r:${link.id}`;
    case 'note': return `n:${link.doc}:${link.id}:${link.first ? 1 : 0}`;
    case 'page': return `p:${link.bookIndex}`;
  }
}

export function formatKey(fmt: Format): string {
  return [
    fmt.bold ? 'b' : '', fmt.italic ? 'i' : '', fmt.script ?? '', fmt.smallCaps ? 'c' : '', fmt.label ? 'l' : '',
    fmt.dots ? 'd' : '', fmt.proper ? 'p' : '', fmt.book ? 'k' : '', fmt.tcy ? 't' : '', fmt.orientation ?? '',
    fmt.warichu ? 'w' : '', fmt.done ? 'x' : '',
  ].join('|');
}
