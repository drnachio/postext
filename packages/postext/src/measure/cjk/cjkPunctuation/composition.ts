// How CJK text is composed: the resolved `cjk` settings, the document's
// composition and the region and script rules read from them.
import type { CjkRegion, CjkPunctuationWidth, CjkHangingPunctuation, CjkParagraphStartBracket, ResolvedCjkConfig, Dimension } from '../../../types.js';
import { setCjkCircledNumbers } from '../cjkClasses.js';
import { dimensionToPx } from '../../../units.js';
import { languageOf } from '../../../hyphenation/locale.js';

/** How CJK text is composed: the resolved `cjk` settings, as the composer
 *  reads them. */
export interface CjkComposition {
  region: CjkRegion;
  punctuationWidth: CjkPunctuationWidth;
  compressAdjacent: boolean;
  trimLineStart: boolean;
  hangingPunctuation: CjkHangingPunctuation;
  /** The space between Han and Latin: in em of the CJK text's font size
   *  (`em`), or in px when `cjk.latinSpacing` was a length (`px`). Zero
   *  turns it off. */
  latinSpacing: { em: number; px?: undefined } | { px: number; em?: undefined };
  /** The text runs down the page (vertical-rl): ：；？！ keep one em. */
  vertical?: boolean;
  /** The document's language, the primary subtag of its locale in lower
   *  case (`zh`, `ja`, `ko`, `en`…); unset when unknown. Japanese and
   *  Korean text keeps the marks it shares with Latin text at their own
   *  advance (see {@link routesSharedMarks}). */
  language?: string;
  /** One em of blank after a ？ or ！ that ends a sentence inside the
   *  paragraph (`cjk.spaceAfterQuestion`, JLReq §3.1.6); unset: none. */
  spaceAfterQuestion?: boolean;
  /** How an opening bracket that starts an indented paragraph is set
   *  (`cjk.paragraphStartBracket`); unset: as at any line start. */
  paragraphStartBracket?: CjkParagraphStartBracket;
  /** Lines break only at spaces and next to punctuation, never between
   *  two letters (`cjk.wordBreak: 'keep-all'`); unset: between any two
   *  characters the line-break level allows. A paragraph may set its own
   *  (`MeasureBlockOptions.cjkWordBreak`). */
  keepAll?: boolean;
  /** How many characters of a book title (`《…》`, `〈…〉`, a `:book[…]`
   *  span) a line break leaves on either side of it at least
   *  (`cjk.titleMinChars`, #637); unset: {@link DEFAULT_TITLE_MIN_CHARS}.
   *  1 lets a line break anywhere in a title the level allows. */
  titleMinChars?: number;
  /** `'western'`: the circled numbers ①–⑳ and their kin are Western
   *  letters, as up to 1.24 (`cjk.circledNumbers`, #637); unset: Chinese
   *  characters (see `setCjkCircledNumbers`). */
  circledNumbers?: 'western';
  /** Design text (openers, heading designs, running heads, page designs)
   *  is wrapped word by word at the font's own advances, as up to 1.24
   *  (`cjk.composeDesignText: false`, #637); unset: a design text that
   *  composes as CJK is set by the CJK composer. */
  plainDesignText?: true;
  /** `'western'`: a Western word that holds a letter or a digit takes the
   *  Han–Latin space on a side that ends in a bracket or a sign too
   *  (`cjk.latinSpacingEdge`, #721); unset: on a side that ends in a
   *  letter or a digit only. */
  latinSpacingEdge?: 'western';
  /** How many characters of a warichu note a line break leaves on either
   *  side of it at least (`cjk.warichu.minChars`, #720); unset:
   *  {@link DEFAULT_NOTE_MIN_CHARS}. 1 lets a line break anywhere in a
   *  note the level allows. */
  noteMinChars?: number;
  /** The document's character grid keeps its full lines full
   *  (`cjk.grid.fullLines`, #718): the runt rule carries no character down
   *  from a line that is not justified, which it could not spread. */
  gridFullLines?: true;
}

/** Characters of a book title a line break leaves on either side of it by
 *  default (`cjk.titleMinChars`). */
export const DEFAULT_TITLE_MIN_CHARS = 2;

/** Characters of a warichu note a line break leaves on either side of it
 *  by default (`cjk.warichu.minChars`). */
export const DEFAULT_NOTE_MIN_CHARS = 2;

/** The composition outside a build: every mark at its full advance, no
 *  compression, no hanging, no Han–Latin space — CJK text set as the
 *  composer set it before these settings existed. A build replaces it with
 *  the document's (`setCjkComposition`). */
export const PLAIN_CJK_COMPOSITION: CjkComposition = {
  region: 'mainland',
  punctuationWidth: 'fullwidth',
  compressAdjacent: false,
  trimLineStart: false,
  hangingPunctuation: 'none',
  latinSpacing: { em: 0 },
};

let documentComposition: CjkComposition = PLAIN_CJK_COMPOSITION;

/** Set the composition CJK text is set with when a measurement names none
 *  (the build does, from the resolved `cjk`), as `setCjkLineBreak` sets the
 *  line-break level. `undefined` restores {@link PLAIN_CJK_COMPOSITION}. */
export function setCjkComposition(composition: CjkComposition | undefined): void {
  documentComposition = composition ?? PLAIN_CJK_COMPOSITION;
  setCjkCircledNumbers(documentComposition.circledNumbers !== 'western');
}

/** The composition set by {@link setCjkComposition}. */
export function getCjkComposition(): CjkComposition {
  return documentComposition;
}

/** The composition of a resolved `cjk` config: `latinSpacing` in em when it
 *  is written in em (or rem), else converted to px at `dpi`. `locale` is
 *  the document language (`language`). */
export function cjkCompositionOf(cjk: ResolvedCjkConfig, dpi: number, locale?: string): CjkComposition {
  const ls: Dimension = cjk.latinSpacing;
  const language = languageOf(locale);
  return {
    region: cjk.region,
    punctuationWidth: cjk.punctuationWidth,
    compressAdjacent: cjk.compressAdjacent,
    trimLineStart: cjk.trimLineStart,
    hangingPunctuation: cjk.hangingPunctuation,
    latinSpacing: ls.unit === 'em' || ls.unit === 'rem' ? { em: Math.max(0, ls.value) } : { px: Math.max(0, dimensionToPx(ls, dpi)) },
    ...(language ? { language } : {}),
    ...(cjk.spaceAfterQuestion ? { spaceAfterQuestion: true } : {}),
    ...(cjk.paragraphStartBracket ? { paragraphStartBracket: cjk.paragraphStartBracket } : {}),
    ...(cjk.wordBreak === 'keep-all' ? { keepAll: true } : {}),
    ...(cjk.titleMinChars !== DEFAULT_TITLE_MIN_CHARS ? { titleMinChars: cjk.titleMinChars } : {}),
    ...(cjk.circledNumbers === 'western' ? { circledNumbers: 'western' as const } : {}),
    ...(cjk.composeDesignText === false ? { plainDesignText: true as const } : {}),
    ...(cjk.latinSpacingEdge === 'western' ? { latinSpacingEdge: 'western' as const } : {}),
    ...(cjk.warichu.minChars !== DEFAULT_NOTE_MIN_CHARS ? { noteMinChars: cjk.warichu.minChars } : {}),
    ...(cjk.grid.enabled && cjk.grid.fullLines ? { gridFullLines: true as const } : {}),
  };
}

/** Kana and hangul: a paragraph holding them is Japanese or Korean. */
const KANA_HANGUL_RE = /[ᄀ-ᇿ぀-ゟ゠-ヿ㄰-㆏ㇰ-ㇿꥠ-꥿가-힯ힰ-퟿ｦ-ﾟ]/;

/** Whether the composition sets Japanese or Korean text. */
function japaneseOrKorean(c: CjkComposition): boolean {
  return c.language === 'ja' || c.language === 'ko';
}

/**
 * Whether the marks Latin text shares with Chinese (“ ” ‘ ’ … — ·) may take
 * a Chinese mark's box in a paragraph of `text` (clreq's context routing,
 * `cjkCompose.ts`). They do in Chinese text: in a Chinese document, and in
 * a CJK paragraph of a document in another language (or none) unless it
 * holds kana or hangul. Never in a Japanese or Korean document, whose
 * typography sets them otherwise (Korean at their proportional width).
 */
export function routesSharedMarks(c: CjkComposition, text: string): boolean {
  if (japaneseOrKorean(c)) return false;
  return c.language === 'zh' || !KANA_HANGUL_RE.test(text);
}

/** Kana: a paragraph holding them is Japanese. */
const KANA_RE = /[぀-ゟ゠-ヿㇰ-ㇿｦ-ﾟ]/;

/**
 * Whether a two-em dash (―― or ——, 2倍ダッシュ) is drawn as one stroke in
 * a paragraph of `text` whose shared marks are not routed
 * (`routesSharedMarks`): in Japanese text (#680), a Japanese document or a
 * paragraph with kana in a document of no CJK language. JLReq names the
 * pair as one mark (the double dash of its line-breaking rules), and a
 * face whose dash leaves blank at both ends of its em (Noto Serif JP's ―,
 * 0.07 em) would print it as two. Not in Korean, whose dashes are Latin.
 */
export function joinsDashPairs(c: CjkComposition, text: string): boolean {
  if (c.language === 'ja') return true;
  return c.language !== 'ko' && c.language !== 'zh' && KANA_RE.test(text);
}

const verticalOf = new WeakMap<CjkComposition, CjkComposition>();

/** `c` for text set in the writing mode `vertical` names: the same
 *  composition, flagged `vertical` when the text runs down the page (the
 *  composer derives it from the writing mode it measures in, so a
 *  horizontal heading in a vertical book, or a caption, is set as
 *  horizontal text). */
export function compositionFor(c: CjkComposition, vertical: boolean): CjkComposition {
  if (!!c.vertical === vertical) return c;
  let hit = verticalOf.get(c);
  if (!hit) {
    hit = { ...c };
    if (vertical) hit.vertical = true;
    else delete hit.vertical;
    verticalOf.set(c, hit);
  }
  return hit;
}

/** The settings of a composition as a cache key: measurements of CJK text
 *  under other settings never share an entry. */
export function cjkCompositionKey(c: CjkComposition): string {
  const ls = c.latinSpacing.px !== undefined ? `${c.latinSpacing.px}px` : `${c.latinSpacing.em}em`;
  // The language counts where it changes a measurement: Japanese and
  // Korean route no shared marks, and only a Chinese document routes them
  // in a paragraph with kana.
  // Japanese joins its dash pairs where Korean does not (#680).
  const lang = c.language === 'ja' ? ':ja' : japaneseOrKorean(c) ? ':jk' : c.language === 'zh' ? ':zh' : '';
  // Japanese settings only where set, so other keys stay as they were.
  const ja = `${c.spaceAfterQuestion ? ':q' : ''}${c.paragraphStartBracket ? `:p${c.paragraphStartBracket}` : ''}${c.keepAll ? ':ka' : ''}`;
  // The title rule and the circled numbers (#637) only where they differ
  // from the default.
  const titles = c.titleMinChars !== undefined && c.titleMinChars !== DEFAULT_TITLE_MIN_CHARS ? `:t${c.titleMinChars}` : '';
  const circled = c.circledNumbers === 'western' ? ':cw' : '';
  // The grid's full lines (#718) only where set: they change how a ragged
  // paragraph that ends on one character is broken.
  const grid = c.gridFullLines ? ':g' : '';
  // The note rule (#720) only where it differs from the default.
  const notes = c.noteMinChars !== undefined && c.noteMinChars !== DEFAULT_NOTE_MIN_CHARS ? `:n${c.noteMinChars}` : '';
  // The Western edge rule (#721) only where set, so every key of a
  // document that spaces letters and digits alone stays as it was.
  const edge = c.latinSpacingEdge === 'western' ? ':lw' : '';
  return `${c.region}:${c.punctuationWidth}:${c.compressAdjacent ? 1 : 0}:${c.trimLineStart ? 1 : 0}:${c.hangingPunctuation}:${ls}${c.vertical ? ':v' : ''}${lang}${ja}${titles}${circled}${grid}${notes}${edge}`;
}

/** Whether a composition changes nothing: the text is set as without it. */
export function isPlainComposition(c: CjkComposition): boolean {
  return c.punctuationWidth === 'fullwidth' && !c.compressAdjacent && !c.trimLineStart
    && c.hangingPunctuation === 'none' && (c.latinSpacing.px ?? c.latinSpacing.em ?? 0) === 0
    && !c.spaceAfterQuestion && !c.paragraphStartBracket;
}

/**
 * Whether marks are spaced as JLReq sets Japanese full-width text (§3.1,
 * Appendix B): the `japan` region with `fullwidth` marks (its default).
 * Then ・：； hold a quarter em on each side ({@link punctuationSide}), a
 * closing mark or 、。 keeps its half em at a line end
 * ({@link lineEndTrim}), and a line takes one more character by giving up
 * blank in JLReq's order ({@link jlreqShrinkStep}); a Chinese region, or
 * Japan under another width style, keeps clreq's rules.
 */
export function isJlreqSpacing(c: CjkComposition): boolean {
  return c.region === 'japan' && c.punctuationWidth === 'fullwidth';
}
