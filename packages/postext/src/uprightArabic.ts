/**
 * Arabic letters are never slanted (#376). Arabic type has no italics: a
 * face that lacks them is slanted by the browser when an italic is asked
 * for, and a slanted Naskh is a distortion, not an emphasis. So the words
 * in Arabic script of an italic run are set upright, in the run's other
 * face; Latin words in the same run keep their italics. In a document in
 * Arabic script `*…*` is set in bold by default (`bodyText.emphasis`),
 * whose faces are upright already; this covers what is still italic: an
 * explicit `emphasis: 'italic'`, an Arabic word quoted in italics in a
 * Latin text, a reference label set italic.
 *
 * A style whose base face is italic (an italic blockquote, a heading
 * level set italic) slants its plain runs too. Their Arabic words are
 * marked `upright` instead: the measurer sets them in the run's face with
 * the slant taken off ({@link uprightFace}) and gives their segments that
 * face (`fontString`), which every renderer paints.
 *
 * Applied to the spans of every text the rich measurer sets, before it
 * measures them, so lines and segments carry the upright flag and every
 * renderer paints what was measured. Spans holding no Arabic in a slanted
 * face pass through (the same array).
 */

import type { InlineSpan } from './parse';
import { sliceSpan } from './parse/links';
import { graphemesOf } from './measure/graphemes';

/** Letters (and marks) of the Arabic script. */
const ARABIC_RE = /\p{Script=Arabic}/u;
/** Any other letter. */
const OTHER_LETTER_RE = /(?!\p{Script=Arabic})\p{L}/u;
/** A font shorthand that asks for a slanted face. */
const SLANTED_RE = /(^|\s)(italic|oblique)(\s|$)/;

/** Whether a span is set as one piece (a formula, a chip, a swatch, a
 *  reference label, a footnote marker): it is turned upright whole, when
 *  its text is all Arabic, or left as it is. */
function atomic(s: InlineSpan): boolean {
  return !!(s.math || s.mathRender || s.chip || s.swatch || s.ref || s.footnote || s.ruby || s.kunten || s.warichu || s.citation);
}

/** `font` (a CSS font shorthand, style first as `buildFontString` writes
 *  it) with its slant taken off: `italic 400 16px Amiri` → `400 16px
 *  Amiri`. */
export function uprightFace(font: string): string {
  return font.replace(/^(?:italic|oblique)\s+/, '');
}

/**
 * The spans with the Arabic words of their slanted runs set upright (see
 * the module comment). `italicFont` / `boldItalicFont` are the faces an
 * italic run is measured in, `normalFont` / `boldFont` the faces of a plain
 * one (absent: taken as upright). An italic run whose plain face is
 * upright turns its Arabic words plain (`italic: false`); a run whose
 * plain face is slanted too (a style whose base face is italic) marks them
 * `upright`. A run whose face is upright (the faces of `emphasis: 'bold'`
 * or `'color'`, the flipped face of an italic blockquote) is left as it is.
 */
export function uprightArabicSpans(
  spans: InlineSpan[],
  italicFont: string,
  boldItalicFont: string,
  normalFont?: string,
  boldFont?: string,
): InlineSpan[] {
  const faceOf = (s: InlineSpan, italic: boolean): string | undefined =>
    italic ? (s.bold ? boldItalicFont : italicFont) : s.bold ? boldFont : normalFont;
  const isSlanted = (font: string | undefined): boolean => font !== undefined && SLANTED_RE.test(font);
  const slanted = (s: InlineSpan): boolean => !s.upright && isSlanted(faceOf(s, s.italic));
  if (!spans.some((s) => slanted(s) && ARABIC_RE.test(s.text))) return spans;
  const out: InlineSpan[] = [];
  for (const span of spans) {
    if (!slanted(span) || !ARABIC_RE.test(span.text)) {
      out.push(span);
      continue;
    }
    // Plain again where the plain face is upright; else the same style,
    // its face unslanted.
    const mark: 'plain' | 'upright' = span.italic && !isSlanted(faceOf(span, false)) ? 'plain' : 'upright';
    if (atomic(span)) {
      out.push(OTHER_LETTER_RE.test(span.text) || mark === 'upright' ? span : { ...span, italic: false });
      continue;
    }
    out.push(...splitByScript(span, mark));
  }
  return out;
}

/** A slanted span cut where the script changes, its Arabic pieces upright
 *  (`mark`: plain, or flagged `upright`).
 *  Characters of no script (spaces, digits, punctuation) go with the
 *  letters before them, or, at the start, with the first letters after. */
function splitByScript(span: InlineSpan, mark: 'plain' | 'upright'): InlineSpan[] {
  const graphemes = graphemesOf(span.text);
  const classes = graphemes.map((g) => (ARABIC_RE.test(g) ? 'a' : OTHER_LETTER_RE.test(g) ? 'l' : undefined));
  const first = classes.find((c) => c !== undefined) ?? 'l';
  let prev: 'a' | 'l' = first;
  const resolved = classes.map((c) => (prev = c ?? prev));
  const out: InlineSpan[] = [];
  let from = 0;
  let at = 0;
  for (let i = 0; i < graphemes.length; i++) {
    if (i > 0 && resolved[i] !== resolved[i - 1]) {
      out.push(piece(span, from, at, resolved[i - 1]!, mark));
      from = at;
    }
    at += graphemes[i]!.length;
  }
  out.push(piece(span, from, at, resolved[graphemes.length - 1] ?? first, mark));
  return out;
}

function piece(span: InlineSpan, start: number, end: number, cls: 'a' | 'l', mark: 'plain' | 'upright'): InlineSpan {
  const s = sliceSpan(span, start, end);
  if (cls !== 'a') return s;
  return mark === 'plain' ? { ...s, italic: false } : { ...s, upright: true };
}
