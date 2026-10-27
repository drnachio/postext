// Citation text as inline spans: resolved citation spans, direction
// isolates, the final stop, links and merged plain runs (#1278: split out
// of citations.ts).
import type { InlineSpan, ContentBlock } from '../../../parse/index.js';
import type { InlineDirection } from '../../../parse/types.js';
import { isRtlScriptChar } from '../../../writing/bidi.js';

/** `spans` with each citation span replaced by its formatted text from
 *  `formatted`, in order, with the emphasis of the text around it; a
 *  citation with none prints as written. */
export function resolveCitationSpans(spans: InlineSpan[], formatted: readonly (InlineSpan[] | undefined)[] | undefined): InlineSpan[] {
  if (!spans.some((s) => s.citation)) return spans;
  let k = 0;
  return spans.flatMap((span) => {
    if (!span.citation) return [span];
    const text = formatted?.[k++];
    if (!text) return [plain(span.citation.raw, span)];
    return text.map((s) => ({ ...s, bold: s.bold || span.bold, italic: s.italic !== span.italic, ...(span.smallCaps ? { smallCaps: true } : {}) }));
  });
}

/** The ids of the isolates citations are set in ({@link isolated}): clear
 *  of the ones a paragraph's own `:ltr[…]` and `:rtl[…]` count from 1. */
const CITATION_ISOLATE_BASE = 2_000_000;

/** The direction of the first strong letter of `spans` (UAX #9 P2),
 *  undefined when they hold none: a numbered marker, a page number. */
function firstStrong(spans: readonly InlineSpan[]): 'ltr' | 'rtl' | undefined {
  for (const span of spans) {
    for (const ch of span.text) {
      const cp = ch.codePointAt(0)!;
      if (isRtlScriptChar(cp)) return 'rtl';
      if (/\p{L}/u.test(ch)) return 'ltr';
    }
  }
  return undefined;
}

/**
 * A formatted citation or bibliography entry as it joins text that runs
 * `base` (#667): when its first strong letter runs the other way (a Latin
 * work in an Arabic note, an Arabic one in an English paragraph) its spans
 * become one bidi isolate of that direction (`InlineSpan.direction`, what
 * `:ltr[…]` writes), so the reference's own neutral characters, the last
 * solidus of a URL, a closing quotation mark, its full stop, resolve
 * inside it and stay where it ends; left alone they would take the
 * paragraph's direction and move to the far end of the line. A citation
 * with no letter, or one that runs as the text does, is returned as it
 * is. `id` tells the isolates of one paragraph apart; `outer` is the
 * author's isolate the citation is written in.
 */
export function isolated(spans: InlineSpan[], base: 'ltr' | 'rtl', id: number, outer?: InlineDirection): InlineSpan[] {
  const own = firstStrong(spans);
  if (own === undefined || own === (outer?.dir ?? base)) return spans;
  const direction: InlineDirection = { dir: own, id: CITATION_ISOLATE_BASE + id, ...(outer ? { outer } : {}) };
  return spans.map((s) => ({ ...s, direction }));
}

/** A Chinese mark that ends a clause or a sentence, at the start of a text. */
export const CLOSING_CJK = /^[，。、；：！？）」』】》〕]/u;

/** `spans` without the full stop that ends them. */
export function withoutFinalStop(spans: InlineSpan[]): InlineSpan[] {
  const last = spans[spans.length - 1];
  if (!last || !last.text.endsWith('.')) return spans;
  const text = last.text.slice(0, -1);
  const links = last.links?.map((l) => ({ ...l, end: Math.min(l.end, text.length) })).filter((l) => l.end > l.start);
  const trimmed: InlineSpan = { ...last, text, ...(last.links ? { links } : {}) };
  return [...spans.slice(0, -1), ...(text.length > 0 ? [trimmed] : [])];
}

/** The spans of a plain text with the emphasis of the text around it. */
export function plain(text: string, base: InlineSpan): InlineSpan {
  return { text, bold: base.bold, italic: base.italic, ...(base.smallCaps ? { smallCaps: true } : {}) };
}

/** `spans` linked to `href`, each over its whole text. */
export function linked(spans: InlineSpan[], href: string): InlineSpan[] {
  return spans.map((s) => (s.links && s.links.length > 0 ? s : { ...s, links: [{ start: 0, end: s.text.length, href }] }));
}

/** A block whose spans are `spans`, its plain text and source map rebuilt:
 *  each span replacing a citation placeholder takes the placeholder's
 *  source offset for every character. */
export function withSpans(block: ContentBlock, replace: Map<number, InlineSpan[]>, dropLead: ReadonlySet<number> = new Set()): ContentBlock {
  const spans: InlineSpan[] = [];
  const sourceMap: number[] = [];
  let at = 0;
  block.spans.forEach((span, i) => {
    const repl = replace.get(i);
    const src = block.sourceMap.slice(at, at + span.text.length);
    at += span.text.length;
    if (!repl && dropLead.has(i)) {
      if (span.text.length > 1) spans.push({ ...span, text: span.text.slice(1) });
      sourceMap.push(...src.slice(1));
      return;
    }
    if (!repl) {
      spans.push(span);
      sourceMap.push(...src);
      return;
    }
    const origin = src[0] ?? block.sourceStart;
    for (const r of repl) {
      spans.push(r);
      for (let k = 0; k < r.text.length; k++) sourceMap.push(origin);
    }
  });
  sourceMap.push(...block.sourceMap.slice(at));
  const merged = mergePlainSpans(spans);
  return { ...block, spans: merged, text: merged.map((s) => s.text).join(''), sourceMap };
}

/** Whether a span is plain text: emphasis and small capitals at most. */
function isPlain(s: InlineSpan): boolean {
  return Object.keys(s).every((k) => k === 'text' || k === 'bold' || k === 'italic' || k === 'smallCaps');
}

/** Adjacent plain spans of one emphasis joined, so a citation printed back
 *  as written leaves the spans as they were without the citation syntax. */
function mergePlainSpans(spans: InlineSpan[]): InlineSpan[] {
  const out: InlineSpan[] = [];
  for (const s of spans) {
    const last = out[out.length - 1];
    if (last && isPlain(last) && isPlain(s) && last.bold === s.bold && last.italic === s.italic && (last.smallCaps ?? false) === (s.smallCaps ?? false)) {
      out[out.length - 1] = { ...last, text: last.text + s.text };
    } else {
      out.push(s);
    }
  }
  return out;
}
