// Laid-out lines back to running text: the segments of each line become
// inline items (formatting and links kept, justification and tracking
// dropped) and the lines of a paragraph are joined again — with a space
// where the line broke at one, with nothing after a hyphen the break added
// (which goes) or one the text carries (which stays), and with nothing
// between Chinese, Japanese or Thai characters, which break without spaces.

import type { CjkRegion, MathRender, VDTLine, VDTLineSegment, VDTRuby } from 'postext';
import { graphemesOf, verticalRuns } from 'postext';
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
  /** The document is set in vertical lines: emphasis marks on the right
   *  of the text are the default side (`under right`, see `.pt-dots`). */
  vertical?: boolean;
  /** Vertical Japanese text (#428): the short numbers (`uprightDigits`)
   *  and the !? pairs the print sets in one upright cell, which carry no
   *  `tcy` flag (the renderers find them with `verticalRuns`), are
   *  written as `.pt-tcy` too. */
  tcy?: { region: CjkRegion; uprightDigits: number };
  /** The one-em space after a Japanese ？ or ！ (`cjk.spaceAfterQuestion`,
   *  #418) is on: the empty `autospace` segment after such a mark, which
   *  the print paints as space, is written as an ideographic space. */
  spaceAfterQuestion?: boolean;
  /** Emphasis marks other than the filled dot on the default side were
   *  read: the classes they need (`pt-dots-filled-sesame`, `pt-dots-over`…),
   *  for the stylesheet to define. */
  dotsClass?(cls: string): void;
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

/**
 * The classes beyond `pt-dots` that emphasis marks need (#428), '' for the
 * filled dot on the writing mode's default side (under horizontal text,
 * right of vertical text: the `.pt-dots` rule, Chinese practice). The
 * shape and fill: `pt-dots-<fill>-<shape>` (`pt-dots-filled-sesame`, the
 * Japanese 傍点). The side, in the flow frame as the layout gives it:
 * `pt-dots-over` (over horizontal text, right of vertical text) in a
 * horizontal document, `pt-dots-under` (under, left) in a vertical one.
 */
export function dotsClasses(dots: NonNullable<NonNullable<VDTLineSegment['cjkMarks']>['dots']>, vertical: boolean): string {
  const out: string[] = [];
  if (dots.style !== 'dot' || dots.fill !== 'filled') out.push(`pt-dots-${dots.fill}-${dots.style}`);
  if (dots.position !== (vertical ? 'over' : 'under')) out.push(`pt-dots-${dots.position}`);
  return out.join(' ');
}

function formatOf(seg: { bold?: boolean; italic?: boolean }, full?: VDTLineSegment, ctx?: InlineContext): Format {
  const fmt: Format = {};
  if (seg.bold) fmt.bold = true;
  if (seg.italic) fmt.italic = true;
  if (!full) return fmt;
  if (full.lang !== undefined && full.lang !== ctx?.lang) fmt.lang = full.lang;
  if (full.script) fmt.script = full.script;
  if (full.fontString?.includes('small-caps')) fmt.smallCaps = true;
  if (full.captionLabel) fmt.label = true;
  if (full.cjkMarks?.dots) {
    fmt.dots = true;
    const classes = dotsClasses(full.cjkMarks.dots, ctx?.vertical === true);
    if (classes) {
      fmt.dotsStyle = classes;
      for (const cls of classes.split(' ')) ctx?.dotsClass?.(cls);
    }
  }
  if (full.cjkMarks?.properName !== undefined) fmt.proper = true;
  if (full.cjkMarks?.bookTitle !== undefined) fmt.book = true;
  if (full.cjkMarks?.sideline) fmt.side = { style: full.cjkMarks.sideline.style, position: full.cjkMarks.sideline.position };
  if (full.tcy) fmt.tcy = true;
  if (full.orientation) fmt.orientation = full.orientation;
  if (full.warichu) fmt.warichu = true;
  // A marker in the line gap, or one the layout moved to the right of a
  // vertical line (reduced, shifted, on the line: no superscript).
  if (full.sideMarker) fmt.note = 'side';
  else if (full.footnoteId !== undefined && full.baselineShift !== undefined && !full.script) fmt.note = 'right';
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
    // No <rp> fallback brackets: EPUB 3.3 discourages them (EPUBCheck
    // HTM_055), every EPUB 3 reading system lays ruby out.
    return `<ruby${pos}>${rubyPair(seg, ctx)}</ruby>`;
  }
  return undefined;
}

/** A ruby base and its reading, inside a `<ruby>`. */
function rubyPair(seg: VDTLineSegment, ctx: InlineContext): string {
  return `${wrapFormat(xmlText(seg.text), formatOf(seg, seg, { ...ctx, lang: '' }))}<rt>${xmlText(seg.ruby!.text)}</rt>`;
}

/** The annotation a ruby base belongs to, when the layout names it
 *  (`VDTRuby.id`, #422): the bases of one jukugo reading share it and go
 *  in one `<ruby>`, their readings alternating with them, so a reading
 *  system can let a reading run over its neighbour base. Without it,
 *  every base is a `<ruby>` of its own. */
function rubyGroupOf(ruby: VDTRuby): string | undefined {
  const id = (ruby as VDTRuby & { id?: unknown }).id;
  return typeof id === 'string' || typeof id === 'number' ? String(id) : undefined;
}

type RawItem = Extract<InlineItem, { t: 'raw' }>;

/** Joins `next`, a `<ruby>` of one base, to `last` when it holds bases of
 *  the same annotation with the same link: the bases of a jukugo word, on
 *  one line or across a line break (the ids are a block's, and a sink
 *  reads one block). Whether it did. */
function joinRuby(last: RawItem, next: RawItem): boolean {
  if (next.ruby === undefined || last.ruby !== next.ruby || linkKey(last.link) !== linkKey(next.link) || last.lvl !== next.lvl) return false;
  last.xhtml = last.xhtml.replace(/<\/ruby>$/, next.xhtml.replace(/^<ruby[^>]*>/, ''));
  return true;
}

/** Japanese marks a one-em space follows (`cjk.spaceAfterQuestion`). */
const QUESTION = /[？！‼⁇⁈⁉]$/u;
/** What takes no space after a ？ or ！: a closing bracket or another mark. */
const NO_AKI_BEFORE = /^[」』）〕］｝〉》】〙〗”’？！‼⁇⁈⁉]/u;

/** Whether the segment before `i` (a footnote marker glued to the mark
 *  aside) ends with a ？ or ！. */
function afterQuestion(segs: readonly VDTLineSegment[], i: number): boolean {
  for (let j = i - 1; j >= 0; j--) {
    const prev = segs[j]!;
    if (prev.footnoteId !== undefined) continue;
    return prev.kind === 'text' && QUESTION.test(prev.text);
  }
  return false;
}

/** `text` split at the runs vertical Japanese sets in one upright cell
 *  (see {@link InlineContext.tcy}): `[text, tcy][]`, in order. */
function tcyRuns(text: string, tcy: NonNullable<InlineContext['tcy']>): [string, boolean][] {
  if (!/[0-9!?！？]/.test(text)) return [[text, false]];
  const out: [string, boolean][] = [];
  for (const run of verticalRuns(graphemesOf(text), tcy.region, tcy.uprightDigits)) {
    const cell = run.glyph.orient === 'tcy';
    const last = out[out.length - 1];
    if (last && !cell && !last[1]) last[0] += run.text;
    else out.push([run.text, cell]);
  }
  return out;
}

/** `inner` inside the elements and classes of `fmt`. */
export function wrapFormat(inner: string, fmt: Format): string {
  const classes = [
    fmt.smallCaps && 'pt-sc',
    fmt.label && 'pt-label',
    fmt.dots && 'pt-dots',
    fmt.dots && fmt.dotsStyle,
    fmt.proper && 'pt-proper',
    fmt.book && 'pt-book',
    fmt.side && 'pt-side',
    fmt.side && fmt.side.position === 'over' && 'pt-side-over',
    fmt.side && fmt.side.style !== 'solid' && `pt-side-${fmt.side.style}`,
    fmt.tcy && 'pt-tcy',
    fmt.orientation && `pt-${fmt.orientation}`,
    fmt.warichu && 'pt-warichu',
    fmt.done && 'pt-done',
  ].filter(Boolean);
  let out = classes.length > 0 ? `<span class="${classes.join(' ')}">${inner}</span>` : inner;
  // A marker in the line gap: a box of no advance from which it runs back
  // over the character it marks (see `.pt-note-side`).
  if (fmt.note === 'side') out = `<span class="pt-note-side"><span>${out}</span></span>`;
  else if (fmt.note === 'right') out = `<span class="pt-note-right">${out}</span>`;
  if (fmt.script) out = `<${fmt.script}>${out}</${fmt.script}>`;
  if (fmt.italic) out = `<em>${out}</em>`;
  if (fmt.bold) out = `<strong>${out}</strong>`;
  if (fmt.lang) out = `<span lang="${xmlAttr(fmt.lang)}" xml:lang="${xmlAttr(fmt.lang)}">${out}</span>`;
  return out;
}

/** `text` (which starts at `start` in its segment's text) without the
 *  characters at `offsets` (into the segment's text, ascending). */
function dropOffsets(text: string, offsets: readonly number[], start: number): string {
  let out = '';
  let last = 0;
  for (const offset of offsets) {
    const i = offset - start;
    if (i < last || i >= text.length) continue;
    out += text.slice(last, i);
    last = i + 1;
  }
  return out + text.slice(last);
}

/** The text items of one line, in logical order. */
export function lineItems(line: VDTLine, ctx: InlineContext, segments = line.segments): InlineItem[] {
  const out: InlineItem[] = [];
  const segs = segments ?? (line.text ? [{ kind: 'text', text: line.text, width: 0 } as VDTLineSegment] : []);
  // A line the engine read for directions (#369) gives each segment its
  // embedding level: odd when `rtl`, `level` when past 1, else 0. Lines
  // with no right-to-left run carry none, and their items none either.
  const bidi = (line.segments ?? segs).some((s) => s.rtl || s.level !== undefined);
  const lvlOf = (seg: VDTLineSegment): { lvl?: number } => (bidi ? { lvl: seg.level ?? (seg.rtl ? 1 : 0) } : {});
  // The tatweels kashida justification inserted (#375) are print
  // justification: a reading system justifies the text itself. A tatweel
  // the author typed is not among a segment's `kashida` offsets and stays.
  // A line counted as stretched with no offsets on its segments comes from
  // a layout older than the offsets: every tatweel on it goes. (The whole
  // line decides: `segments` may be a part of it, a poem's hemistich.)
  const offsets = (line.segments ?? segs).some((s) => s.kashida !== undefined && s.kashida.length > 0);
  let first = true;
  for (const [i, seg] of segs.entries()) {
    const link = linkOf(seg, ctx);
    const raw = rawOf(seg, ctx);
    if (raw !== undefined) {
      // The bases of one annotation share a `<ruby>`, their readings
      // alternating with them (#428).
      const group = seg.ruby && raw.startsWith('<ruby') ? rubyGroupOf(seg.ruby) : undefined;
      const item: RawItem = { t: 'raw', xhtml: raw, ...(link ? { link } : {}), ...lvlOf(seg), ...(group !== undefined ? { ruby: group } : {}) };
      const last = out[out.length - 1];
      if (!(last?.t === 'raw' && joinRuby(last, item))) out.push(item);
      first = false;
      continue;
    }
    if (seg.kind === 'space') {
      // The one-em space after a Japanese ？ or ！ (#418) is space the
      // text needs; a Han–Latin space or a ruby gap is the print's
      // spacing, which a reading system makes itself.
      const aki = ctx.spaceAfterQuestion === true && seg.autospace === true && afterQuestion(segs, i) ? '\u3000' : '';
      const text = seg.labelTab ? ' ' : seg.text.length > 0 ? seg.text : seg.autospace ? aki : ' ';
      if (text) out.push({ t: 'text', text, fmt: {}, ...(link ? { link } : {}), ...lvlOf(seg) });
      continue;
    }
    if (seg.kind !== 'text') continue;
    const runs = seg.runs && seg.runs.length > 0 ? seg.runs : [{ text: seg.text, bold: seg.bold, italic: seg.italic }];
    // Where each run starts in the segment's text (kashida offsets).
    let at = 0;
    for (const run of runs) {
      let text = run.text;
      const start = at;
      at += run.text.length;
      if (offsets) {
        if (seg.kashida) text = dropOffsets(text, seg.kashida, start);
      } else if (line.kashida) {
        text = text.replace(/ـ/g, '');
      }
      // The repeated hyphen of a compound broken at its hyphen
      // ("vencer-" | "-se") is not in the text.
      if (first && line.repeatedHyphen) text = text.replace(/^-/, '');
      first = false;
      if (!text) continue;
      const fmt = formatOf(run, seg, ctx);
      if (ctx.tcy && !fmt.tcy && !fmt.orientation) {
        for (const [part, cell] of tcyRuns(text, ctx.tcy)) {
          out.push({ t: 'text', text: part, fmt: cell ? { ...fmt, tcy: true } : fmt, ...(link ? { link } : {}), ...lvlOf(seg) });
        }
        continue;
      }
      out.push({ t: 'text', text, fmt, ...(link ? { link } : {}), ...lvlOf(seg) });
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

/** Append a line to `sink`, joined to the line before it (or after a line
 *  break, `hardBreak`: a line the author ended). `before` (page starts,
 *  anchors) goes right before the line's text. */
export function appendLine(sink: TextSink, line: VDTLine, ctx: InlineContext, before: InlineItem[] = [], segments?: VDTLineSegment[], hardBreak = false): void {
  const items = lineItems(line, ctx, segments);
  const prev = sink.prev;
  if (hardBreak && sink.inl.length > 0) {
    sink.inl.push({ t: 'raw', xhtml: '<br/>' });
  } else if (prev && sink.inl.length > 0) {
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
      } else if (next && ctx.spaceAfterQuestion && QUESTION.test(tail) && !NO_AKI_BEFORE.test(next)) {
        // A ？ or ！ that ended a printed line, where its space went (#418).
        sink.inl.push({ t: 'text', text: '\u3000', fmt: {} });
      }
    }
  }
  // A jukugo word the line break cut goes on in the same `<ruby>`.
  const last = sink.inl[sink.inl.length - 1];
  if (before.length === 0 && last?.t === 'raw' && items[0]?.t === 'raw' && joinRuby(last, items[0])) items.shift();
  sink.inl.push(...before, ...items);
  sink.prev = line;
}

/** Append every line of a block. */
/** Append every line of a block (or of a fragment of one). A line marked
 *  the paragraph's last with more lines after it in the same fragment
 *  ended at a line break the author typed. */
export function appendLines(sink: TextSink, lines: readonly VDTLine[], ctx: InlineContext, beforeLine?: (line: VDTLine, i: number) => InlineItem[]): void {
  lines.forEach((line, i) => appendLine(sink, line, ctx, beforeLine?.(line, i) ?? [], undefined, i > 0 && lines[i - 1]!.isLastLine === true));
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
    fmt.dots ? `d${fmt.dotsStyle ?? ''}` : '', fmt.proper ? 'p' : '', fmt.book ? 'k' : '', fmt.side ? `s${fmt.side.style}${fmt.side.position}` : '', fmt.tcy ? 't' : '', fmt.orientation ?? '',
    fmt.warichu ? 'w' : '', fmt.done ? 'x' : '', fmt.lang ?? '',
  ].join('|');
}
