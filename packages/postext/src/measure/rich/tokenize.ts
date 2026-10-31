// tokenizeSpans and the passes over its tokens: styled runs joined into
// words, cuts at bidi levels, dash joins and stacked scripts
// (#1276: split out of rich.ts).
import { uprightFace } from '../../writing/uprightArabic.js';
import type { InlineSpan } from '../../parse/index.js';
import { getMeasureLanguage, setMeasureLanguage, measureTextWidth } from '../canvas.js';
import { spanShapingLanguage } from '../spanLanguage.js';
import { hasCJK } from '../cjk/cjk.js';
import { spanMarks, cjkWordBreaks } from '../cjk/cjkCompose.js';
import { graphemeCount } from '../graphemes.js';
import { measuringVertically, getMeasureWritingMode } from '../vertical.js';
import { WORDS_AND_SPACES_RE, isBreakingSpaceRun } from '../spaces.js';
import { ZERO_WIDTH_SPACE, isDash, breaksAfterDash } from '../breakRules.js';
import { wordLetterSpacing, joiningScriptIn, insideJoiningWord } from '../rtl/joining.js';
import { type BidiParagraph, type BidiIsolate, spanIsolates } from '../../writing/bidi.js';
import { getMeasureScriptContext, type ScriptContext, faceReadsScript, isLetterless, wordPieceScript, isDoubledMark, resolveScriptContext, scriptTextWidth, rtlTextWidth, scriptContextUntracked, cutDoubledMarks } from '../script.js';
import { withFace, applyChipGaps } from './chips.js';
import { refLabelTokens, atomicSpanToken } from './spanTokens.js';
import { type RichToken, pickSpanFont, scriptMetrics, textWidth, type RichBreakPoint, tokenFont, rtlWordWidth, stackedScriptPairs } from './tokens.js';
import { compoundMask, URL_LIKE_RE, urlBreakIndices, syllabify, dropZeroWidthSpaces, wordBreakPoints } from './wordBreaks.js';

export function tokenizeSpans(
  spans: InlineSpan[],
  normalFont: string,
  boldFont: string,
  italicFont: string,
  boldItalicFont: string,
  shouldHyphenate: boolean,
  letterSpacingPx = 0,
  /** `MeasureBlockOptions.breakAfterDashes`. */
  dashBreaks = false,
  /** `MeasureBlockOptions.hyphenateCompounds === false`: the dictionary
   *  leaves the words of a compound whole. */
  keepCompounds = false,
  /** Whether the spans hold CJK characters (`hasCJK` of their text): only
   *  then is each word looked into. */
  cjkText = true,
  /** The paragraph's bidi levels (`measure/rtl/bidiLines.ts`), when it has
   *  right-to-left text: a word whose level changes inside it (`ABC،`,
   *  `و١٤٤٥`, `(API)` in Arabic) is cut there into words that touch, each
   *  measured as it is painted, as a run of its own direction. */
  bidi?: BidiParagraph,
  /** `keep-all` is in force for the block (its own `cjkWordBreak`, else
   *  the document's `cjk.wordBreak`): a word that holds CJK characters does
   *  not break between two letters (#705). */
  keepAll = false,
): RichToken[] {
  const tokens: RichToken[] = [];
  // Which characters of the joined text sit in a compound, a word (across
  // runs: "*after*-dinner") with a hyphen between two letters.
  const inCompound = keepCompounds && shouldHyphenate ? compoundMask(spans) : undefined;
  let spanStart = 0;
  // Tracking: every character (spaces included) advances `letterSpacingPx`
  // more, exactly as canvas `letterSpacing` / CSS `letter-spacing` / PDF `Tc`
  // paint it, so measured widths stay in step with the renderers. A word of
  // a joining script takes none: the renderers paint it untracked too.
  const track = (text: string): number => (letterSpacingPx === 0 ? 0 : wordLetterSpacing(text, letterSpacingPx) * graphemeCount(text));
  /** The script fields of a span's tokens (font at the script size, shift). */
  // The span's own face: its style's, unslanted for the Arabic words of a
  // slanted style (`uprightArabic.ts`).
  const faceOf = (span: InlineSpan): string => {
    const face = pickSpanFont(span.bold, span.italic, normalFont, boldFont, italicFont, boldItalicFont);
    return span.upright ? uprightFace(face) : face;
  };
  const scriptFieldsOf = (span: InlineSpan): Pick<RichToken, 'script' | 'scriptFont' | 'baselineShift' | 'faceFont'> => {
    if (!span.script) return span.upright ? { faceFont: faceOf(span) } : {};
    const m = scriptMetrics(faceOf(span), span.script);
    return { script: span.script, scriptFont: m.font, baselineShift: m.baselineShift };
  };
  const spanFont = (span: InlineSpan): string => scriptFieldsOf(span).scriptFont ?? faceOf(span);
  // A word with no letter takes the script of the text around it (#725),
  // in a face that draws its punctuation by script; the paragraph's text
  // and isolates are read when the first such word turns up.
  const scriptState = getMeasureScriptContext();
  // A document shaped in its own language measures the two halves of a
  // word broken at a line end as the texts painted (#770).
  const ownPieces = getMeasureLanguage() !== undefined && !measuringVertically();
  let paragraphText: string | undefined;
  let isolates: BidiIsolate[] | undefined;
  // `script` undefined: a word with letters. Right to left, it is measured
  // as it is painted (`rtlTextWidth`); left to right, the pieces of it
  // that hold no letter are measured and painted in `pieces`, the script
  // they have inside it (`wordPieceScript`).
  const contextOf = !scriptState.enabled || measuringVertically()
    ? undefined
    : (word: string, at: number, length: number, font: string): { script: ScriptContext | undefined; rtl: boolean; pieces?: ScriptContext } | undefined => {
        const rtl = bidi !== undefined && (bidi.levels[at]! & 1) === 1;
        // A face whose marks are the same in every script: no word of it
        // is given one, and a right-to-left word is still measured as it
        // is painted in a document shaped in its own language (#770).
        if (!faceReadsScript(font)) return rtl && getMeasureLanguage() !== undefined && !hasCJK(word) ? { script: undefined, rtl } : undefined;
        if (hasCJK(word)) return undefined;
        if (!isLetterless(word)) {
          if (rtl) return { script: undefined, rtl };
          const pieces = wordPieceScript(word);
          return pieces ? { script: undefined, rtl, pieces } : undefined;
        }
        // The Chinese or Japanese document's own ellipsis and dash.
        if (!rtl && scriptState.hanMarks && isDoubledMark(word)) return { script: 'Hani', rtl };
        paragraphText ??= bidi?.text ?? spans.map((sp) => sp.text).join('');
        isolates ??= spans.some((sp) => sp.direction) ? spanIsolates(spans) : [];
        const script = resolveScriptContext(paragraphText, at, at + length, rtl, isolates, scriptState.script);
        return script ? { script, rtl } : rtl ? { script: undefined, rtl } : undefined;
      };

  /** How a word in the context `contextOf` gave it is measured: whole
   *  (`whole`, undefined: as any text) and up to one of its breaks
   *  (`upTo`), the tracking it takes, and the fields its token carries. */
  const scriptMeasure = (context: ReturnType<NonNullable<typeof contextOf>>, font: string, sc: boolean): {
    whole?: (text: string) => number;
    upTo?: (text: string) => number;
    untracked: boolean;
    fields: Pick<RichToken, 'scriptContext' | 'scriptRtl' | 'wordScript'>;
  } => {
    if (!context) return { untracked: false, fields: {} };
    const { script, rtl, pieces } = context;
    const whole = script ? (text: string): number => (text === '' ? 0 : scriptTextWidth(text, font, script, rtl))
      : rtl ? (text: string): number => (text === '' ? 0 : rtlTextWidth(text, font))
      : undefined;
    // What stands before the word's first letter is measured in its
    // script; from that letter on, a shaper gives the text that script.
    const upTo = pieces
      ? (text: string): number => (text === '' ? 0 : isLetterless(text) ? scriptTextWidth(text, font, pieces, false) : textWidth(text, font, sc))
      : whole;
    return {
      ...(whole ? { whole } : {}),
      ...(upTo ? { upTo } : {}),
      untracked: scriptContextUntracked(script),
      fields: { ...(script ? { scriptContext: script } : {}), ...(rtl ? { scriptRtl: true as const } : {}), ...(pieces ? { wordScript: pieces } : {}) },
    };
  };

  for (const span of spans) {
    // A run that names its language (`:ltr[…]{lang=en}`) is measured in it,
    // in a document shaped in its own (#764); its tokens say so, for what
    // is measured of them later (a cut, a piece).
    const ownLanguage = spanShapingLanguage(span);
    const spanTokensFrom = tokens.length;
    const languageBefore = getMeasureLanguage();
    if (ownLanguage !== undefined) setMeasureLanguage(ownLanguage);
    try {
    const spanBase = spanStart;
    spanStart += span.text.length;
    // A tab (#622): its width is set where its line gets to it.
    // Tab characters in a row are one character of the text that goes on
    // that many stops: the later ones have no text.
    if (span.tab) {
      const tab = span.tab.px ? { stop: span.tab.px } : {};
      for (let k = 0; k < Math.max(1, span.tab.count ?? 1); k++) {
        tokens.push({ text: k === 0 ? span.text : '', bold: span.bold, italic: span.italic, kind: 'space', width: 0, tab });
      }
      continue;
    }
    // A reference whose label is words: one token per word and space (#702).
    const label = refLabelTokens(span, normalFont, boldFont, italicFont, boldItalicFont, letterSpacingPx);
    if (label) {
      tokens.push(...label);
      continue;
    }
    const atomic = atomicSpanToken(span, normalFont, boldFont, italicFont, boldItalicFont, letterSpacingPx);
    if (atomic) {
      tokens.push(atomic);
      continue;
    }
    const font = spanFont(span);
    // A space inside inline code (#845): as wide as the code face's own
    // spaces once the two pieces around it are one box, less the paddings
    // and borders the two pieces' boxes have on that side, which the joined
    // box drops (so an empty one, after a hyphen, is that much narrower
    // than nothing). A line may end there, but justification leaves it be.
    if (span.codeSpace) {
      const box = span.codeSpace;
      const codeFont = withFace(normalFont, box.fontFamily, box.fontSizePx);
      const inner = 2 * (box.paddingXPx + box.borderWidthPx);
      tokens.push({ text: span.text, bold: span.bold, italic: span.italic, kind: 'space', width: measureTextWidth(span.text, codeFont) - inner, fixedGlue: true });
      continue;
    }
    // A fixed space is set as text: no break, no justification glue.
    if (span.fixedSpace) {
      if (span.text.length > 0) {
        tokens.push({ text: span.text, bold: span.bold, italic: span.italic, kind: 'text', width: textWidth(span.text, font, false) + track(span.text) });
      }
      continue;
    }
    // Chinese marks (#193) ride on the span's words like its script.
    const marks = spanMarks(span, getMeasureWritingMode() === 'vertical-rl');
    const scriptFields = {
      ...scriptFieldsOf(span),
      ...(marks ? { cjkMarks: marks } : {}),
      ...(span.inserted ? { inserted: true } : {}),
    };
    // Small capitals: the words keep their case (hyphenation reads it) and
    // measure as they will be painted.
    const sc = !!span.smallCaps;
    const scFields = sc ? { smallCaps: true } : {};

    // Split on word boundaries while preserving spaces. Each word is
    // hyphenated on its own (the dictionary works word by word anyway), so
    // its soft hyphens can be told apart from the ones the source carries.
    // A no-break space is no boundary: it stays inside the word it glues
    // ("37 °C"), which the line then never breaks at (EF-66).
    const matched = span.text.match(WORDS_AND_SPACES_RE);
    if (!matched) continue;
    const levelled = bidi ? cutAtLevels(matched, spanBase, bidi) : matched;
    // In a Chinese or Japanese document a word with no letter is cut
    // around its doubled ellipses and dashes: the document's own marks,
    // set as Han text whatever sentence cites them (`cutDoubledMarks`).
    const parts = contextOf && scriptState.hanMarks && faceReadsScript(font)
      ? levelled.flatMap((part) => (isBreakingSpaceRun(part) ? undefined : cutDoubledMarks(part)) ?? [part])
      : levelled;

    let partStart = spanBase;
    for (const part of parts) {
      const partAt = partStart;
      partStart += part.length;
      const isSpace = isBreakingSpaceRun(part);
      if (!isSpace && (span.url || URL_LIKE_RE.test(part.replace(/\u00AD/g, ''))) && !(letterSpacingPx !== 0 && joiningScriptIn(part))) {
        const clean = part.replace(/\u00AD/g, '');
        // An address is one script run: its pieces with no letter
        // (`10.1006/`, `.2001`) are measured in the script they have in
        // it, and an address with no letter at all in its context's (#725).
        const inScript = scriptMeasure(contextOf?.(clean, partAt, part.length, font), font, sc);
        const spacing = inScript.untracked ? 0 : letterSpacingPx;
        const upTo = inScript.upTo ?? ((text: string): number => textWidth(text, font, sc));
        const breakPoints: RichBreakPoint[] = urlBreakIndices(clean).map((charIndex) => ({
          charIndex,
          widthBefore: upTo(clean.slice(0, charIndex)) + (spacing === 0 ? 0 : spacing * graphemeCount(clean.slice(0, charIndex))),
        }));
        tokens.push({
          text: clean,
          bold: span.bold,
          italic: span.italic,
          captionLabel: span.captionLabel,
          ...scriptFields,
          ...scFields,
          ...inScript.fields,
          kind: 'text',
          width: (inScript.whole ? inScript.whole(clean) : textWidth(clean, font, sc)) + (inScript.untracked ? 0 : track(clean)),
          ...(breakPoints.length > 0 ? { breakPoints, hyphenWidth: 0, bareBreaks: true } : {}),
          // The rest of an address divided at a joint is measured as the
          // text that opens the next line (#770).
          ...(ownPieces && breakPoints.length > 0 ? { ownPieces: spacing } : {}),
        });
        continue;
      }
      const syllabified = isSpace ? { clean: part, soft: [] } : syllabify(part, shouldHyphenate && inCompound?.[partAt] !== true);
      // The author's zero-width spaces: breaks, out of the text (#1164).
      const { clean, soft, zeroWidth } = isSpace || !syllabified.clean.includes(ZERO_WIDTH_SPACE) || hasCJK(syllabified.clean) ? { ...syllabified, zeroWidth: [] } : dropZeroWidthSpaces(syllabified.clean, syllabified.soft);
      // The characters this word touches, for a dash that opens it
      // ("**riddles.**—I", "*\"no\"*—and"): the end of a word run just
      // before, no space in between.
      const before = tokens[tokens.length - 1];
      const touching = dashBreaks && before && before.kind === 'text' && !before.mathRender && !before.swatch && !before.chip
        ? before.text.slice(-2)
        : undefined;
      // A word that holds CJK characters: measured unit by unit, once each.
      const cjk = cjkText && !isSpace && hasCJK(clean) ? cjkWordBreaks(clean, font, sc, letterSpacingPx, undefined, keepAll) : undefined;
      // A word of a joining script is measured untracked, its break points
      // (after a hyphen or a dash it carries) too.
      // A word with no letter: measured in the script of its context, its
      // pieces at a break too (#725). In the Arabic script it takes no
      // tracking, as the Arabic words around it take none.
      // A word with a letter: its pieces with no letter (`COVID-` | `19`)
      // in the script they have inside it.
      const measured = scriptMeasure(contextOf && !isSpace && !cjk ? contextOf(clean, partAt, part.length, font) : undefined, font, sc);
      const untracked = measured.untracked;
      const wordSpacing = isSpace ? letterSpacingPx : untracked ? 0 : wordLetterSpacing(clean, letterSpacingPx);
      const inScript = measured.whole;
      const contextFields = measured.fields;
      const breakPoints = isSpace ? [] : wordBreakPoints(clean, soft, font, wordSpacing, sc, dashBreaks, touching, cjk, measured.upTo, ownPieces && !cjk, zeroWidth);
      if (breakPoints.length > 0) {
        tokens.push({
          text: clean,
          bold: span.bold,
          italic: span.italic,
          captionLabel: span.captionLabel,
          ...scriptFields,
          ...scFields,
          ...contextFields,
          kind: 'text',
          width: cjk ? cjk.width : (inScript ? inScript(clean) : textWidth(clean, font, sc)) + (untracked ? 0 : track(clean)),
          breakPoints,
          hyphenWidth: measureTextWidth('-', font) + letterSpacingPx,
          // A word that holds CJK characters is measured unit by unit:
          // its rest is already the text that opens the next line.
          ...(ownPieces && !cjk ? { ownPieces: wordSpacing } : {}),
        });
      } else {
        // A word of a joining script loses the soft hyphens it may not
        // break at (`syllabify`); any other keeps its text as written.
        const word = clean !== part && !isSpace && joiningScriptIn(part) ? clean : part;
        tokens.push({
          text: word,
          bold: span.bold,
          italic: span.italic,
          captionLabel: span.captionLabel,
          ...scriptFields,
          ...(isSpace ? {} : scFields),
          ...contextFields,
          kind: isSpace ? 'space' : 'text',
          width: (inScript ? inScript(word) : textWidth(word, font, sc && !isSpace)) + (untracked ? 0 : track(word)),
        });
      }
    }
    } finally {
      if (ownLanguage !== undefined) {
        setMeasureLanguage(languageBefore);
        if (ownLanguage !== languageBefore) for (let k = spanTokensFrom; k < tokens.length; k++) tokens[k]!.lang = ownLanguage;
      }
    }
  }

  // A word of a joining script cut into runs by a style change is one
  // word again (only text that holds such a script is looked at).
  if (spans.length > 1) joinStyledRuns(tokens, normalFont, boldFont, italicFont, boldItalicFont);
  if (tokens.some((t) => t.script)) stackScriptTokens(tokens, normalFont, boldFont, italicFont, boldItalicFont);
  if (tokens.some((t) => t.chip)) {
    applyChipGaps(tokens, (t, run) => measureTextWidth(run, tokenFont(t, normalFont, boldFont, italicFont, boldItalicFont)) + (letterSpacingPx === 0 ? 0 : letterSpacingPx * graphemeCount(run)));
  }
  if (dashBreaks) markDashJoins(tokens);
  return tokens;
}

/** A token that may be one run of a word set in several styles: plain
 *  text, nothing set as a whole (a reference, a note marker, a chip, a
 *  formula, a swatch), no script, small capitals, vertical run or marks. */
function isStyledRunPart(t: RichToken | undefined): t is RichToken {
  return t !== undefined && t.kind === 'text' && !t.mathRender && !t.swatch && !t.chip && t.refResourceId === undefined
    && t.footnoteId === undefined && !t.labelTab && !t.script && !t.stacked && !t.smallCaps && !t.tcy && !t.orientation
    && !t.cjkMarks && !t.inserted && !t.runs;
}

/** Whether two runs that touch (no space between) are pieces of one word
 *  of a joining script: the cut between them falls between two of its
 *  letters, or before a mark (see `insideJoiningWord`). */
function joinsAcross(a: string, b: string): boolean {
  if (a.length === 0 || b.length === 0) return false;
  if (a.charCodeAt(a.length - 1) < 0x0600 && b.charCodeAt(0) < 0x0600) return false;
  return insideJoiningWord(a + b, a.length);
}

/**
 * Join the runs a style change cuts a word of a joining script into
 * (`كتا**ب**`, a coloured letter or vowel sign in a primer) back into one
 * token. Measured in pieces, each piece would be shaped alone: the letters
 * at the cut would take their isolated or final forms, the widths would be
 * off by a fifth or more (engine-ltr-audit §1.4), and the renderers would
 * paint a broken word. The token is measured whole in the style of its
 * longest run (an approximation when the runs differ in weight, never in
 * joining) and keeps each run's text and style (`runs`), so the renderers
 * shape the word once and give each run its style. It never breaks.
 */
function joinStyledRuns(
  tokens: RichToken[],
  normalFont: string,
  boldFont: string,
  italicFont: string,
  boldItalicFont: string,
): void {
  for (let i = 0; i + 1 < tokens.length; i++) {
    if (!isStyledRunPart(tokens[i])) continue;
    // Each next run is read against the whole word so far: a run of marks
    // alone (`ب**َ**يت`, a coloured fatha) has no letter of its own to join
    // from, the letter it sits on does.
    let j = i + 1;
    let word = tokens[i]!.text;
    while (j < tokens.length && isStyledRunPart(tokens[j]) && joinsAcross(word, tokens[j]!.text)) {
      word += tokens[j]!.text;
      j++;
    }
    if (j === i + 1) continue;
    const parts = tokens.slice(i, j);
    const runs: { text: string; bold?: boolean; italic?: boolean }[] = [];
    let dominant = parts[0]!;
    let most = -1;
    for (const p of parts) {
      const last = runs[runs.length - 1];
      if (last && !!last.bold === p.bold && !!last.italic === p.italic) last.text += p.text;
      else runs.push({ text: p.text, ...(p.bold ? { bold: true } : {}), ...(p.italic ? { italic: true } : {}) });
      const n = graphemeCount(p.text);
      if (n > most) { most = n; dominant = p; }
    }
    const text = parts.map((p) => p.text).join('');
    const merged: RichToken = {
      text,
      bold: dominant.bold,
      italic: dominant.italic,
      ...(parts[0]!.captionLabel ? { captionLabel: true } : {}),
      kind: 'text',
      width: rtlWordWidth(text, tokenFont(dominant, normalFont, boldFont, italicFont, boldItalicFont)),
      ...(dominant.faceFont ? { faceFont: dominant.faceFont } : {}),
      ...(runs.length > 1 ? { runs } : {}),
      ...(parts[parts.length - 1]!.dashJoin ? { dashJoin: true } : {}),
    };
    tokens.splice(i, j - i, merged);
  }
}

/** The words of a span (`parts`, starting at `from` in the paragraph) cut
 *  where their bidi level changes, never between two letters of a joining
 *  script. Spaces are left whole. */
function cutAtLevels(parts: readonly string[], from: number, bidi: BidiParagraph): string[] {
  const out: string[] = [];
  let at = from;
  for (const part of parts) {
    const start = at;
    at += part.length;
    if (isBreakingSpaceRun(part)) {
      out.push(part);
      continue;
    }
    let piece = 0;
    for (let k = 1; k < part.length; k++) {
      if (bidi.levels[start + k] === bidi.levels[start + k - 1] || insideJoiningWord(part, k)) continue;
      const c = part.charCodeAt(k);
      if (c >= 0xDC00 && c <= 0xDFFF) continue;
      out.push(part.slice(piece, k));
      piece = k;
    }
    out.push(part.slice(piece));
  }
  return out;
}

/** A run of words a dash break may read across: not a formula, a swatch,
 *  a chip or one of two stacked scripts. */
function isWordRun(t: RichToken | undefined): t is RichToken {
  return t !== undefined && t.kind === 'text' && !t.mathRender && !t.swatch && !t.chip && !t.stacked;
}

/** Flag `dashJoin` on each word run that ends on a closed dash (as
 *  `breaksAfterDash` reads it) touched by the next word run: the dash
 *  closes one run and the next one opens in another style ("riddles—*and*",
 *  "say—**that**"). A dash inside a run, or opening one, is a break point
 *  of its own word (see {@link wordBreakPoints}). */
function markDashJoins(tokens: RichToken[]): void {
  for (let t = 0; t + 1 < tokens.length; t++) {
    const a = tokens[t]!;
    const b = tokens[t + 1]!;
    if (!isWordRun(a) || !isWordRun(b) || a.refResourceId !== undefined) continue;
    const dash = a.text[a.text.length - 1];
    if (!isDash(dash)) continue;
    // The dash and the two characters before it, read back into the run
    // before when this one is shorter.
    const tail = (isWordRun(tokens[t - 1]) ? tokens[t - 1]!.text.slice(-2) : '') + a.text.slice(-3);
    if (breaksAfterDash(tail[tail.length - 2], dash!, b.text[0], tail[tail.length - 3])) a.dashJoin = true;
  }
}

/** Set every subscript and superscript that touch one over the other (see
 *  {@link stackedScriptPairs}): the first token of a pair advances nothing,
 *  the second the pair's advance; the subscript drops to its stacked
 *  position; neither keeps a break point, so the pair never parts. Words
 *  only: a script reference, or one in small capitals, sets as it is. */
function stackScriptTokens(
  tokens: RichToken[],
  normalFont: string,
  boldFont: string,
  italicFont: string,
  boldItalicFont: string,
): void {
  const scripts = tokens.map((t) => (
    t.kind === 'text' && t.script && !t.smallCaps && t.refResourceId === undefined && t.footnoteId === undefined && !t.chip && !t.mathRender && !t.swatch
      ? t.script
      : undefined
  ));
  for (const i of stackedScriptPairs(scripts)) {
    const pair = [tokens[i]!, tokens[i + 1]!];
    for (const t of pair) {
      delete t.breakPoints;
      delete t.hyphenWidth;
      delete t.bareBreaks;
    }
    const sub = pair[0]!.script === 'sub' ? pair[0]! : pair[1]!;
    sub.baselineShift = scriptMetrics(pickSpanFont(sub.bold, sub.italic, normalFont, boldFont, italicFont, boldItalicFont), 'sub', true).baselineShift;
    pair[1]!.width = Math.max(pair[0]!.width, pair[1]!.width);
    pair[0]!.width = 0;
    pair[0]!.stacked = 'first';
    pair[1]!.stacked = 'second';
  }
}
