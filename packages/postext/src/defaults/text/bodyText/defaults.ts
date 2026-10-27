// Default body text, hyphenation and blockquote values, and the widow and
// orphan defaults (#1278: split out of bodyText.ts).
import type { ResolvedBodyTextConfig, PostextConfig, ResolvedBlockquoteConfig, HyphenationConfig } from '../../../types.js';
import { cjkRegionOfConfig } from '../cjk.js';
import { DEFAULT_MAIN_COLOR, dimensionsEqual } from '../../shared.js';
import { DEFAULT_VERSE_CONFIG } from '../verse.js';
import { normalizeHyphenationExceptions } from '../../../hyphenation/hyphenationExceptions.js';

export const DEFAULT_HYPHENATION_CONFIG: ResolvedBodyTextConfig['hyphenation'] = {
  enabled: true,
  locale: 'en-us',
  ragged: false,
  zone: { value: 3, unit: 'em' },
  compounds: true,
  capitalized: true,
};

/**
 * Whether a paragraph keeps `widowMinLines` lines at the foot of a column
 * when `config` does not set `bodyText.avoidWidows` itself. Off on a
 * character grid (`cjk.grid`, #717): the grid counts the lines of a page,
 * and a paragraph moved on whole leaves the page a line short. clreq
 * §7.1.2 and JLReq §3.5.4 have no rule for a paragraph's first line at
 * the foot of a page.
 */
export function avoidWidowsByDefault(config: PostextConfig | undefined): boolean {
  return config?.cjk?.grid?.enabled !== true;
}

/**
 * Whether a paragraph keeps `orphanMinLines` lines at the head of the next
 * column when `config` does not set `bodyText.avoidOrphans` itself. Off on
 * a character grid in the Japan region (#717): JLReq §3.5.4 counts the
 * characters of a paragraph's last line, never its lines at a page break.
 * A Chinese grid keeps the rule: 孤行, the last line of a paragraph alone
 * at the head of a page, is the one clreq §7.1.2 names. The region is
 * `cjk.region`, or under `'auto'` the one of the document language as
 * `resolveAllConfig` reads it (`locale`, else the hyphenation locale).
 */
export function avoidOrphansByDefault(config: PostextConfig | undefined): boolean {
  if (config?.cjk?.grid?.enabled !== true) return true;
  return cjkRegionOfConfig(config) !== 'japan';
}

/** Blockquotes as postext 1.4 set them: grey, italic, the body's
 *  first-line indent, no side indent. */
export const DEFAULT_BLOCKQUOTE_CONFIG: ResolvedBlockquoteConfig = {
  color: { hex: '#666666', model: 'hex' },
  italic: true,
  indent: { value: 0, unit: 'em' },
};

/** A `shortListMaxItems` as written (#749): a whole number of items, one
 *  or more, else `undefined`. */
export function shortListMaxItemsOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : undefined;
}

export const DEFAULT_BODY_TEXT_CONFIG: ResolvedBodyTextConfig = {
  fontFamily: 'EB Garamond',
  fontSize: { value: 8, unit: 'pt' },
  lineHeight: { value: 1.5, unit: 'em' },
  paragraphSpacing: false,
  color: { hex: '#000000', model: 'cmyk' },
  boldColor: { ...DEFAULT_MAIN_COLOR },
  italicColor: { ...DEFAULT_MAIN_COLOR },
  // Inline `:ref` labels default to the emphasis (bold) colour, in the bold
  // font, upright.
  referenceColor: { ...DEFAULT_MAIN_COLOR },
  referenceBold: true,
  referenceItalic: false,
  textAlign: 'justify',
  fontWeight: 400,
  boldFontWeight: 700,
  hyphenation: { ...DEFAULT_HYPHENATION_CONFIG },
  firstLineIndent: { value: 1.5, unit: 'em' },
  hangingIndent: false,
  indentAfterHeading: true,
  maxWordSpacing: 2,
  minWordSpacing: 0.6,
  maxJustifyTracking: 0,
  optimalLineBreaking: true,
  optimalRagged: true,
  breakAfterDashes: true,
  breakAfterHyphens: true,
  hardLineBreaks: true,
  repeatHyphen: false,
  blockquote: DEFAULT_BLOCKQUOTE_CONFIG,
  verse: DEFAULT_VERSE_CONFIG,
  avoidOrphans: true,
  orphanMinLines: 2,
  // Penalties below are normalized to a shared 0–10000 scale. Each expresses
  // "equivalent cost" for the avoidance:
  //   • orphan/widow: added linearly in chooseParagraphSplit, alongside
  //     slackWeight·slack². At 1000 the threshold where slack wins is
  //     slack > √100 = 10 lines of whitespace — strong but not absolute.
  //   • runt: injected as equivalent badness in Knuth–Plass (squared scale).
  //     At 1000 it dominates alternatives up to roughly r≈2.15 stretch.
  orphanPenalty: 1000,
  avoidOrphansInLists: true,
  avoidWidows: true,
  widowMinLines: 2,
  widowPenalty: 1000,
  avoidWidowsInLists: true,
  shortListSplit: 'allow',
  shortListMaxItems: 3,
  slackWeight: 10,
  avoidRunts: true,
  runtMinCharacters: 20,
  runtPenalty: 1000,
  gradedRuntPenalty: false,
  avoidRuntsInLists: true,
  tightenRunts: true,
  maxRuntTracking: 10,
  keepColonWithList: true,
  colonListRoom: 'item',
  hyphenateAcrossColumns: true,
  paragraphContainerSpacing: 'collapse',
  paragraphStylesInBoxes: 'box',
};

export function hyphenationEqual(a: HyphenationConfig | undefined, b: HyphenationConfig | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const D = DEFAULT_HYPHENATION_CONFIG;
  return (a.enabled ?? D.enabled) === (b.enabled ?? D.enabled)
    && (a.locale ?? D.locale) === (b.locale ?? D.locale)
    && (a.ragged ?? D.ragged) === (b.ragged ?? D.ragged)
    && dimensionsEqual(a.zone ?? D.zone, b.zone ?? D.zone)
    && (a.compounds ?? D.compounds) === (b.compounds ?? D.compounds)
    && (a.capitalized ?? D.capitalized) === (b.capitalized ?? D.capitalized)
    // A list that names no valid word is no list.
    && (normalizeHyphenationExceptions(a.exceptions) ?? []).join('\x00') === (normalizeHyphenationExceptions(b.exceptions) ?? []).join('\x00');
}
