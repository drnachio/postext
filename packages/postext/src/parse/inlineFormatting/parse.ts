// parseInlineFormatting and stripInlineFormatting: a run of text to styled
// spans, or to plain text (#1276: split out of inlineFormatting.ts).
import { stripOrientationMarks, markOrientation, applyOrientationMarks } from '../orientationMarks.js';
import type { InlineSpan, InlineLink } from '../types.js';
import { stripAnnotations, type QueuedAnnotation, markAnnotations, applyAnnotationMarks } from '../annotations.js';
import { dataRanges } from './breaks.js';
import { replaceLinkSyntax, LINK_OPEN, LINK_CLOSE, stripNonEmphasisFormatting } from './links.js';
import { MARKUP_BOUNDARY, restoreEscapes, replaceMarkSyntax, protectEscapes, INLINE_SMALLCAPS_RE, unescapeBrackets, UNDERSCORE_BOLD_RE, UNDERSCORE_ITALIC_RE, SUPERSCRIPT_RE, SUBSCRIPT_RE, ESCAPE_BASE, MARK_OPEN, MARK_CLOSE, splitScriptSpans, underscores, underscoresClose, markSmallCaps, ESCAPED_RE, applySmallCapsMarks, dropMarkupBoundaries } from './markup.js';

/** The text {@link parseInlineFormatting} sets, without its spans: each
 *  mark taken out leaves a {@link MARKUP_BOUNDARY}, as the parser's own
 *  marks and span splits do, so an `_` next to bold, a link or code opens
 *  emphasis in a heading as it does in a paragraph. */
export function stripInlineFormatting(text: string): string {
  const b = MARKUP_BOUNDARY;
  const wrap = (_: string, inner: string): string => b + inner + b;
  return restoreEscapes(stripOrientationMarks(replaceLinkSyntax(replaceLinkSyntax(stripAnnotations(replaceMarkSyntax(protectEscapes(text), (inner) => b + inner + b), b), true, () => b), false, (label) => b + label + b), b)
    .replace(INLINE_SMALLCAPS_RE, (_, inner: string) => b + unescapeBrackets(inner) + b) // small caps
    .replace(/`(.+?)`/g, wrap)               // inline code
    .replace(/\*\*(.+?)\*\*/g, wrap)          // bold
    .replace(UNDERSCORE_BOLD_RE, wrap)        // bold alt
    .replace(/\*(.+?)\*/g, wrap)              // italic
    .replace(UNDERSCORE_ITALIC_RE, wrap)      // italic alt
    .replace(SUPERSCRIPT_RE, '$1')           // superscript
    .replace(SUBSCRIPT_RE, '$1')             // subscript
    .split(b).join('')
    .trim());
}

/**
 * `\$` sets a dollar sign. In the body the maths pass unescapes it; in a
 * snippet (a table cell, a caption, a note), whose maths is read after
 * this pass (#541), and in a chip's label, which takes no maths, it is
 * protected like the other escapes and restored in the spans (EF-151). Inside inline code the pair is already
 * protected and prints as written. A link destination and a directive's
 * attributes are left alone: `linkHref` reads the destination's escapes
 * itself, and a ref's `text="…"` prints as written, as in the body.
 */
const DOLLAR_ESCAPE_RE = /\\\$/g;
const DOLLAR_PLACEHOLDER = String.fromCharCode(ESCAPE_BASE + 0x24);
export function protectDollarEscapes(text: string): string {
  if (!text.includes('\\$')) return text;
  const kept = dataRanges(text);
  return text.replace(DOLLAR_ESCAPE_RE, (match: string, offset: number) =>
    kept.some(([s, e]) => offset >= s && offset < e) ? match : DOLLAR_PLACEHOLDER);
}

/** Remove the link marks from parsed spans, recording each link as a
 *  range of the spans it covers (`InlineSpan.links`); a span left empty
 *  (it held marks only) is dropped. `hrefs` are the targets in order. */
function takeLinkMarks(spans: InlineSpan[], hrefs: readonly string[], markStyles: readonly string[] = []): InlineSpan[] {
  const out: InlineSpan[] = [];
  let next = 0;
  let open: string | undefined;
  // The highlight mark open (#888): its style and number.
  let nextMark = 0;
  let mark: { style: string; id: number } | undefined;
  for (const span of spans) {
    let text = '';
    let start = 0;
    let markStart = 0;
    const links: InlineLink[] = [];
    const close = () => {
      if (open !== undefined && text.length > start) links.push({ start, end: text.length, href: open });
    };
    const closeMark = () => {
      if (mark && text.length > markStart) links.push({ start: markStart, end: text.length, href: '', mark });
    };
    for (let i = 0; i < span.text.length; i++) {
      const ch = span.text[i]!;
      if (ch === LINK_OPEN) {
        open = hrefs[next++];
        start = text.length;
      } else if (ch === LINK_CLOSE) {
        close();
        open = undefined;
      } else if (ch === MARK_OPEN) {
        mark = { style: markStyles[nextMark] ?? '', id: nextMark };
        nextMark++;
        markStart = text.length;
      } else if (ch === MARK_CLOSE) {
        closeMark();
        mark = undefined;
      } else {
        text += ch;
      }
    }
    // A link or a mark still open runs on into the next span.
    close();
    closeMark();
    if (text.length === 0) continue;
    out.push(links.length > 0 ? { ...span, text, links } : text === span.text ? span : { ...span, text });
  }
  return out;
}

/**
 * Split a text region into italic/non-italic spans, carrying an ambient bold flag.
 */
function splitItalicSpans(text: string, bold: boolean, forcedItalic: boolean, out: InlineSpan[]): void {
  if (forcedItalic) {
    if (text.length > 0) splitScriptSpans(text, bold, true, out);
    return;
  }
  const italicRe = new RegExp(`\\*(.+?)\\*|${underscores(1)}(.+?)${underscoresClose(1)}`, 'gu');
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = italicRe.exec(text)) !== null) {
    if (m.index > last) {
      const before = text.slice(last, m.index);
      if (before.length > 0) splitScriptSpans(before, bold, false, out);
    }
    const inner = m[1] ?? m[2]!;
    if (inner.length > 0) splitScriptSpans(inner, bold, true, out);
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    const rest = text.slice(last);
    if (rest.length > 0) splitScriptSpans(rest, bold, false, out);
  }
}

/**
 * Parse inline formatting to produce spans with bold and italic flags.
 * Recognizes ***bold italic***, **bold**, *italic* (and underscore equivalents),
 * `^sup^` / `~sub~` and `:smallcaps[…]`.
 */
export function parseInlineFormatting(text: string): InlineSpan[] {
  // Links keep their text between two marks while the emphasis scanners
  // run — so a link inside, across or around emphasis never changes how
  // the text splits into spans — and become ranges once the spans exist.
  const hrefs: string[] = [];
  // Highlight marks (`:mark[…]{style}`, #888) keep their text between two
  // marks too, their styles queued, and become ranges the same way.
  const markStyles: string[] = [];
  // Chinese annotations (`:dots[…]`, `:ruby[…]{rt="…"}`, `{紅樓|hóng|lóu}`…)
  // become marks around their text, their attributes queued, before the
  // emphasis scanners run (#193, #194, #195); so do the orientation marks
  // of vertical text (`:tcy[…]`, `:upright[…]`, `:sideways[…]`, #190),
  // which may sit inside an annotation.
  const annotations: QueuedAnnotation[] = [];
  const highlighted = replaceMarkSyntax(protectEscapes(text), (inner, style) => {
    markStyles.push(style);
    return MARK_OPEN + inner + MARK_CLOSE;
  });
  const cleaned = stripNonEmphasisFormatting(markAnnotations(markOrientation(markSmallCaps(highlighted)), annotations, restoreEscapes), hrefs);
  const spans: InlineSpan[] = [];

  // Triple markers (bold+italic) first, then double (bold) — longest first.
  const boldRe = new RegExp(
    `\\*\\*\\*(.+?)\\*\\*\\*|${underscores(3)}(.+?)${underscoresClose(3)}|\\*\\*(.+?)\\*\\*|${underscores(2)}(.+?)${underscoresClose(2)}`,
    'gu',
  );
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = boldRe.exec(cleaned)) !== null) {
    if (match.index > lastIndex) {
      splitItalicSpans(cleaned.slice(lastIndex, match.index), false, false, spans);
    }
    const triple = match[1] ?? match[2];
    if (triple !== undefined) {
      splitItalicSpans(triple, true, true, spans);
    } else {
      const inner = match[3] ?? match[4]!;
      splitItalicSpans(inner, true, false, spans);
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < cleaned.length) {
    splitItalicSpans(cleaned.slice(lastIndex), false, false, spans);
  }

  if (spans.length === 0) {
    const trimmed = cleaned.trim();
    if (trimmed.length > 0) {
      splitItalicSpans(trimmed, false, false, spans);
    }
  }

  for (const s of spans) if (ESCAPED_RE.test(s.text)) s.text = restoreEscapes(s.text);
  // Small caps first: its marks split spans without moving link ranges,
  // which are taken from the finished spans.
  const marked = applyAnnotationMarks(applyOrientationMarks(applySmallCapsMarks(dropMarkupBoundaries(spans))), annotations);
  return hrefs.length > 0 || markStyles.length > 0 ? takeLinkMarks(marked, hrefs, markStyles) : marked;
}
