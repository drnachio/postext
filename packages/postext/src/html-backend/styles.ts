// CSS declarations the HTML boxes carry: CJK spacing and features, tracked
// ligatures, the dir attribute and box of a word segment, and the font
// strings a segment is written in (#1276: split out of html-backend.ts).
import type { VDTLine, VDTLineSegment, VDTBlock } from '../vdt.js';
import { hasCJK } from '../measure/cjk/cjk.js';
import { joiningScriptIn } from '../measure/rtl/joining.js';
import { scriptContextUntracked } from '../measure/script.js';
import { ownShaping } from './render.js';
import { type TrackedText, esc, wordRunsHtml, kashidaTextHtml, setsAlone, scriptTextHtml } from './textRuns.js';

/**
 * Declarations of every box of CJK text measured with no punctuation
 * trimming: the browser adds and removes nothing. Chrome's
 * `text-spacing-trim: normal` (and fonts' `chws`) would set the first of
 * two marks that meet half width (`）》`, `”“`), and `text-autospace` would
 * add space between Han and Latin, where the layout measured them apart
 * (`measureTextWidth`, `markCuts`) and the CJK composer adjusted the marks
 * itself; the renderers position what it set. Set on a line of the CJK
 * composer (`VDTLine.cjkComposed`), on each word of another line that holds
 * CJK text (each was measured alone), on a design text line or run and a
 * list marker that holds CJK text. Absent from any other box, so the
 * output of other documents is unchanged.
 */
export const CJK_TEXT_DECL = "text-spacing-trim:space-all;text-autospace:no-autospace;font-feature-settings:'chws' 0,'halt' 0,'vchw' 0;";
/** The part of {@link CJK_TEXT_DECL} a `font` shorthand resets: repeated
 *  after it on an inner box in another face. */
export const CJK_FEATURES_DECL = "font-feature-settings:'chws' 0,'halt' 0,'vchw' 0;";
/** A dash of a 破折号 stretched over its em (`VDTLineSegment.inkScale`):
 *  scaled from its start, with the glyph the layout measured. Under
 *  `lang="zh-Hans"` a face may swap its own Chinese form in (`locl`: Noto
 *  Serif SC's full-width dash), which the scale was not computed for. */
export const DASH_FEATURES_DECL = "font-feature-settings:'chws' 0,'halt' 0,'vchw' 0,'locl' 0;";
export const inkScaleDecl = (scale: number): string =>
  `transform:scaleX(${scale.toFixed(4)});transform-origin:0 0;${DASH_FEATURES_DECL}`;

/** The ligatures of a tracked line (#663). A tracked word was measured at
 *  its natural width, ligatures counted, plus its tracking; under a
 *  `letter-spacing` other than zero browsers turn the common ligatures off
 *  and the word comes out wider than its place (fi in Newsreader: 4.5 px at
 *  40 px). Asked for as features they stay (`font-variant-ligatures` does
 *  not bring them back). After the `font` shorthand, which resets them: on
 *  the line's box and on each run in another face. Design text (running
 *  heads, openers, callout titles, balloon lettering) and the lines of a
 *  vertical page carry it too (#703). A box that also takes
 *  {@link CJK_TEXT_DECL} takes {@link CJK_TRACKED_TEXT_DECL} in its place. */
export const TRACKED_LIGATURES_DECL = "font-feature-settings:'liga' 1,'clig' 1;";
/** The box of a script mark (see {@link scriptTextHtml}): no size, so it
 *  advances nothing, and no part of a selection or a copy. */
export const SCRIPT_MARK_DECL = 'font-size:0;-webkit-user-select:none;user-select:none;';
/** {@link CJK_TEXT_DECL} for a box of a tracked text (#703): one
 *  `font-feature-settings` with the ligatures of
 *  {@link TRACKED_LIGATURES_DECL} beside its own features. The property
 *  does not merge: of two declarations the last one stands alone, and a
 *  tracked CJK line lost the ligatures of its Latin words. */
const CJK_TRACKED_TEXT_DECL = "text-spacing-trim:space-all;text-autospace:no-autospace;font-feature-settings:'chws' 0,'halt' 0,'vchw' 0,'liga' 1,'clig' 1;";
/** {@link CJK_FEATURES_DECL} for a box of a tracked text. */
const CJK_TRACKED_FEATURES_DECL = "font-feature-settings:'chws' 0,'halt' 0,'vchw' 0,'liga' 1,'clig' 1;";

/** {@link TRACKED_LIGATURES_DECL} where a tracked box asks for its
 *  ligatures, nothing where its words are written in pieces
 *  ({@link ownShaping}). */
export const ligaturesDecl = (): string => (ownShaping ? '' : TRACKED_LIGATURES_DECL);
/** {@link CJK_TEXT_DECL} of a box, with its ligatures when it is `tracked`. */
export const cjkTextDecl = (tracked: boolean): string => (tracked && !ownShaping ? CJK_TRACKED_TEXT_DECL : CJK_TEXT_DECL);
/** {@link CJK_FEATURES_DECL} of a box in another face, with its ligatures
 *  when it is `tracked`. */
export const cjkFeaturesDecl = (tracked: boolean): string => (tracked && !ownShaping ? CJK_TRACKED_FEATURES_DECL : CJK_FEATURES_DECL);
/**
 * The box of the cells of a line of the CJK composer (#770). The composer
 * measures each Chinese or Japanese character alone and a line carries
 * the cells of one style as one segment (`cellsOf`); set in one box, the
 * browser kerns inside it: a kana against the mark after it, a kana
 * against a kana. Chrome 154, thousandths of the em under `lang="ja"`:
 * Noto Sans JP `す。` −100, `れ、` +11; Noto Serif JP `す。` −130; and
 * it kerns more pairs than the canvas (21 of 41 texts against 13 in Noto
 * Sans JP). With the kerning off the box is as wide as its cells (41 texts,
 * the two faces, two languages, at 7.5 and 10 px: none differs), and its
 * text stays one run for a selection, a ruby or a link. After the `font`
 * shorthand, which resets it. A Western run was measured with its kerning
 * and keeps it.
 */
export const CELLS_DECL = 'font-kerning:none;';

/** Whether a line box carries {@link CJK_TEXT_DECL}: a line of the CJK
 *  composer, which it measured character by character, or a line with no
 *  segments (one span) holding CJK text. A word-by-word line holding CJK
 *  text sets it on the words that hold some (`segmentCjk`). */
export function lineCjkDecl(line: VDTLine): boolean {
  return line.cjkComposed === true || ((!line.segments || line.segments.length === 0) && hasCJK(line.text));
}

/** How a text segment's box takes {@link CJK_TEXT_DECL}: from its line
 *  (`'line'`), on its own box (`'own'`), or not at all. */
export type SegmentCjk = 'line' | 'own' | false;

export function segmentCjk(seg: VDTLineSegment, lineDecl: boolean): SegmentCjk {
  return lineDecl ? 'line' : hasCJK(seg.text) ? 'own' : false;
}

/** A direction of text, as a `dir` attribute names it. */
export type TextDirection = 'ltr' | 'rtl';

/** The `dir` attribute of a box of text running `own`, inside boxes that
 *  run `inherited` (#379): only where the two differ, so the markup of a
 *  left-to-right document, whose text never runs right to left, carries
 *  none. A box with `dir` is also a bidi isolate (the HTML default), so its
 *  neutrals — a full stop, a bracket — resolve inside it, as the engine
 *  resolved them in the run it measured. */
export function dirAttr(own: TextDirection, inherited: TextDirection): string {
  return own === inherited ? '' : ` dir="${own}"`;
}

/** What a text segment's box adds to the markup of an unmarked one (#379):
 *  attributes — its `dir` (see {@link dirAttr}) and `lang` —, declarations (no tracking on a word of
 *  a joining script, which the engine measured untracked) and, for a word
 *  whose letters change style inside it (`VDTLineSegment.runs`), the inner
 *  markup that replaces its plain text. */
export interface SegmentBox {
  attrs: string;
  decl: string;
  html?: string;
  /** The font and tracking of a tracked word whose ligatures take the
   *  tracking of each letter (see {@link trackedWordHtml}). */
  tracked?: TrackedText;
}
export const PLAIN_BOX: SegmentBox = { attrs: '', decl: '' };

/** The font and colour (CSS values) a run of text in a style is painted
 *  in where a word's letters change style (see {@link wordRunsHtml}). */
export type RunPaint = (probe: VDTLineSegment) => { font: string; color: string };

/**
 * The box of a word segment of a line (#379): its direction against the
 * one it inherits, the language the author named for its text
 * (`VDTLineSegment.lang`) where it is not the root's (`rootLang`), its
 * letters untracked when they are of a joining script on a tracked line
 * (`tracking`), and its styled runs (`VDTLineSegment.runs`) painted by
 * `paint` around the segment's own `font` / `color`.
 */
export function segmentBox(seg: VDTLineSegment, inherited: TextDirection, rootLang: string | undefined, tracking: number, font: string, color: string, paint: RunPaint): SegmentBox {
  const attrs = dirAttr(seg.rtl ? 'rtl' : 'ltr', inherited) + (seg.lang !== undefined && seg.lang !== rootLang ? ` lang="${esc(seg.lang)}"` : '');
  // A word of a joining script takes no tracking, nor does a word with no
  // letter shaped in the Arabic script (#725).
  const decl = tracking !== 0 && (joiningScriptIn(seg.text) || scriptContextUntracked(seg.scriptContext)) ? 'letter-spacing:0;' : '';
  const html = seg.runs && seg.runs.length > 0 ? wordRunsHtml(seg, font, color, paint)
    : seg.kashida && seg.kashida.length > 0 ? kashidaTextHtml(seg.text, seg.kashida)
    : seg.scriptContext !== undefined && !setsAlone(seg, font, tracking) ? scriptTextHtml(seg.text, seg.scriptContext, seg.rtl === true) : undefined;
  // A tracked word is written in the canvas's pieces where it holds a
  // ligature (#770); `font` is the CSS value, which the canvas takes too.
  const tracked = ownShaping && tracking !== 0 && !decl && html === undefined ? { font, tracking, ...(seg.lang !== undefined ? { lang: seg.lang } : {}) } : undefined;
  if (!attrs && !decl && html === undefined && !tracked) return PLAIN_BOX;
  return { attrs, decl, ...(html !== undefined ? { html } : {}), ...(tracked ? { tracked } : {}) };
}

const isDigit = (c: string | undefined): boolean => c !== undefined && c >= '0' && c <= '9';
const isLineTerminator = (c: string): boolean => c === '\n' || c === '\r' || c === '\u2028' || c === '\u2029';

/**
 * A font shorthand split at its first size followed by white space and a
 * family: what comes before the size, the size (`16px`, `12.5px`) and the
 * family. The same as `/^(.*?)(\d+(?:\.\d+)?px)\s+(.+)$/` (`.` stops at a
 * line terminator), read in one pass so that long runs of digits or
 * spaces stay linear; null when there is none.
 */
function splitFontSize(font: string): [prefix: string, size: string, family: string] | null {
  const n = font.length;
  let lastBreak = -1;
  for (let i = n - 1; i >= 0 && lastBreak < 0; i--) if (isLineTerminator(font[i]!)) lastBreak = i;
  for (let i = 0; i < n; i++) {
    const c = font[i]!;
    // The prefix holds no line terminator.
    if (isLineTerminator(c)) return null;
    // A size starts at a run's first digit: one inside the run would end
    // where the run's does.
    if (!isDigit(c) || isDigit(font[i - 1])) continue;
    let j = i;
    while (isDigit(font[j])) j++;
    if (font[j] === '.' && isDigit(font[j + 1])) {
      j++;
      while (isDigit(font[j])) j++;
    }
    if (!font.startsWith('px', j)) continue;
    const sizeEnd = j + 2;
    let spaces = sizeEnd;
    while (spaces < n && /\s/.test(font[spaces]!)) spaces++;
    // The spaces take all they can and leave the family one character
    // (the last space when nothing else follows); the family holds no
    // line terminator.
    const familyStart = spaces < n ? spaces : n - 1;
    if (familyStart <= sizeEnd || lastBreak >= familyStart) continue;
    return [font.slice(0, i), font.slice(i, sizeEnd), font.slice(familyStart)];
  }
  return null;
}

export function quoteFontString(fontString: string): string {
  // Canvas accepts unquoted multi-word families; CSS is stricter. Wrap family in
  // single quotes (double quotes would collide with the outer HTML attribute
  // delimiter) if it contains a space and isn't already quoted. If the family
  // arrives already wrapped in double quotes, rewrite them to single quotes.
  const match = splitFontSize(fontString);
  if (!match) return fontString;
  const [prefix, size, family] = match;
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

export function pickSegmentFont(
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
