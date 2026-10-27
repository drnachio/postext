// Resolving the body text config: hyphenation, blockquotes and the rest
// (#1278: split out of bodyText.ts).
import type { HyphenationConfig, LocaleTag, ResolvedBodyTextConfig, BlockquoteConfig, ResolvedBlockquoteConfig, BodyTextConfig } from '../../../types.js';
import { presentTag, isUnhyphenatedLanguage, hyphenationLocaleFor } from '../../../hyphenation/locale.js';
import { colorsEqual, dimensionsEqual, startEndAsLeftRight, compositionRuleOf } from '../../shared.js';
import { resolveVerseConfig } from '../verse.js';
import { normalizeHyphenationExceptions } from '../../../hyphenation/hyphenationExceptions.js';
import { withFigureStyle } from '../../../fonts/figureStyle.js';
import { arabicScript, emphasisAndTashkil, resolveKashida } from './arabic.js';
import { DEFAULT_HYPHENATION_CONFIG, DEFAULT_BLOCKQUOTE_CONFIG, DEFAULT_BODY_TEXT_CONFIG, shortListMaxItemsOf } from './defaults.js';

/** Tags of languages set without hyphenation (CJK, right-to-left scripts)
 *  already reported for hyphenation switched on without a pattern
 *  language: each is reported once. */
const warnedUnhyphenatedTags = new Set<string>();

/** Resolve the hyphenation settings. The locale — the explicit one, else the
 *  document language; a blank tag counts as unset — becomes the bundled
 *  patterns it names (`'es-ES'` → `'es'`), keeping the original tag when it
 *  differs. A language without patterns is reported only when hyphenation
 *  is on: switching it off is the remedy.
 *
 *  Chinese, Japanese and Korean have no patterns and need none, and neither
 *  do the languages written in a right-to-left script (Arabic, Persian,
 *  Urdu, Hebrew…: `isUnhyphenatedLanguage`), whose words are never divided
 *  at a line end: a document in one of them is set without hyphenation by
 *  default, and hyphenation only runs, for the Latin words quoted in the
 *  text, when `enabled` is `true` and `locale` names a language with
 *  patterns (`'en-us'`). Switched on with such a `locale`, or with none in
 *  such a document, it stays off, and the console says so once per tag.
 *  Words of a joining script are left whole even then (`hyphenateText`). */
function resolveHyphenation(partial: HyphenationConfig | undefined, documentLocale: LocaleTag | undefined): ResolvedBodyTextConfig['hyphenation'] {
  const D = DEFAULT_HYPHENATION_CONFIG;
  const requested = presentTag(partial?.locale) ?? presentTag(documentLocale) ?? D.locale;
  if (partial?.enabled === true && isUnhyphenatedLanguage(requested) && !warnedUnhyphenatedTags.has(requested)) {
    warnedUnhyphenatedTags.add(requested);
    console.warn(
      `[postext] Hyphenation is on, but "${requested}" has no patterns, so the text is set without it. `
      + 'Name the language of the Latin words to divide in bodyText.hyphenation.locale (for example \'en-us\').',
    );
  }
  const enabled = isUnhyphenatedLanguage(requested)
    ? false
    : partial?.enabled ?? (isUnhyphenatedLanguage(documentLocale) ? false : D.enabled);
  const locale = hyphenationLocaleFor(requested, enabled);
  const exceptions = normalizeHyphenationExceptions(partial?.exceptions);
  return {
    enabled,
    locale,
    ...(requested !== locale ? { tag: requested } : {}),
    ragged: partial?.ragged ?? D.ragged,
    zone: partial?.zone ?? D.zone,
    compounds: partial?.compounds ?? D.compounds,
    ...(exceptions ? { exceptions } : {}),
    capitalized: partial?.capitalized ?? D.capitalized,
  };
}

/** A blockquote style in full: unset fields keep postext 1.4's look (see
 *  {@link DEFAULT_BLOCKQUOTE_CONFIG}); an unset `firstLineIndent` stays
 *  unset, the body's then applying. In a document written in Arabic
 *  script (`locale`) a quotation is upright by default: its type has no
 *  italics (#376). */
export function resolveBlockquoteConfig(partial?: BlockquoteConfig, locale?: unknown): ResolvedBlockquoteConfig {
  const D = DEFAULT_BLOCKQUOTE_CONFIG;
  return {
    color: partial?.color ?? D.color,
    italic: partial?.italic ?? (arabicScript(locale) ? false : D.italic),
    indent: partial?.indent ?? D.indent,
    ...(partial?.firstLineIndent ? { firstLineIndent: partial.firstLineIndent } : {}),
  };
}

/** `blockquote` without the fields that hold their default (in a document
 *  in `locale`); undefined when none is left. */
export function stripBlockquoteDefaults(blockquote?: BlockquoteConfig, locale?: unknown): BlockquoteConfig | undefined {
  if (!blockquote) return undefined;
  const D = DEFAULT_BLOCKQUOTE_CONFIG;
  const out: BlockquoteConfig = {};
  if (blockquote.color !== undefined && !colorsEqual(blockquote.color, D.color)) out.color = blockquote.color;
  if (blockquote.italic !== undefined && blockquote.italic !== (arabicScript(locale) ? false : D.italic)) out.italic = blockquote.italic;
  if (blockquote.indent !== undefined && !dimensionsEqual(blockquote.indent, D.indent)) out.indent = blockquote.indent;
  if (blockquote.firstLineIndent !== undefined) out.firstLineIndent = blockquote.firstLineIndent;
  return Object.keys(out).length > 0 ? out : undefined;
}

export function resolveBodyTextConfig(partial?: BodyTextConfig, documentLocale?: LocaleTag): ResolvedBodyTextConfig {
  if (!partial) {
    return {
      ...DEFAULT_BODY_TEXT_CONFIG,
      hyphenation: resolveHyphenation(undefined, documentLocale),
      ...(arabicScript(documentLocale) ? { blockquote: resolveBlockquoteConfig(undefined, documentLocale) } : {}),
      ...emphasisAndTashkil(undefined, documentLocale),
      ...resolveKashida(undefined, documentLocale),
    };
  }
  const kashida = resolveKashida(partial, documentLocale);

  return {
    // The figures (#1237) name the family: every style that takes it
    // takes them too.
    fontFamily: withFigureStyle(partial.fontFamily ?? DEFAULT_BODY_TEXT_CONFIG.fontFamily, partial.figureStyle),
    fontSize: partial.fontSize ?? DEFAULT_BODY_TEXT_CONFIG.fontSize,
    lineHeight: partial.lineHeight ?? DEFAULT_BODY_TEXT_CONFIG.lineHeight,
    paragraphSpacing: partial.paragraphSpacing ?? DEFAULT_BODY_TEXT_CONFIG.paragraphSpacing,
    color: partial.color ?? DEFAULT_BODY_TEXT_CONFIG.color,
    boldColor: partial.boldColor ?? DEFAULT_BODY_TEXT_CONFIG.boldColor,
    italicColor: partial.italicColor ?? DEFAULT_BODY_TEXT_CONFIG.italicColor,
    // Reference colour follows the (possibly overridden) bold/emphasis colour
    // unless explicitly set.
    referenceColor:
      partial.referenceColor
      ?? partial.boldColor
      ?? DEFAULT_BODY_TEXT_CONFIG.referenceColor,
    referenceBold: partial.referenceBold ?? DEFAULT_BODY_TEXT_CONFIG.referenceBold,
    referenceItalic: partial.referenceItalic ?? DEFAULT_BODY_TEXT_CONFIG.referenceItalic,
    textAlign: startEndAsLeftRight(partial.textAlign ?? DEFAULT_BODY_TEXT_CONFIG.textAlign),
    fontWeight: partial.fontWeight ?? DEFAULT_BODY_TEXT_CONFIG.fontWeight,
    boldFontWeight: partial.boldFontWeight ?? DEFAULT_BODY_TEXT_CONFIG.boldFontWeight,
    hyphenation: resolveHyphenation(partial.hyphenation, documentLocale),
    firstLineIndent: partial.firstLineIndent ?? DEFAULT_BODY_TEXT_CONFIG.firstLineIndent,
    hangingIndent: partial.hangingIndent ?? DEFAULT_BODY_TEXT_CONFIG.hangingIndent,
    indentAfterHeading: partial.indentAfterHeading ?? DEFAULT_BODY_TEXT_CONFIG.indentAfterHeading,
    maxWordSpacing: partial.maxWordSpacing ?? DEFAULT_BODY_TEXT_CONFIG.maxWordSpacing,
    minWordSpacing: partial.minWordSpacing ?? DEFAULT_BODY_TEXT_CONFIG.minWordSpacing,
    maxJustifyTracking: partial.maxJustifyTracking ?? DEFAULT_BODY_TEXT_CONFIG.maxJustifyTracking,
    ...kashida,
    optimalLineBreaking: partial.optimalLineBreaking ?? DEFAULT_BODY_TEXT_CONFIG.optimalLineBreaking,
    optimalRagged: partial.optimalRagged ?? DEFAULT_BODY_TEXT_CONFIG.optimalRagged,
    breakAfterDashes: partial.breakAfterDashes ?? DEFAULT_BODY_TEXT_CONFIG.breakAfterDashes,
    breakAfterHyphens: partial.breakAfterHyphens ?? DEFAULT_BODY_TEXT_CONFIG.breakAfterHyphens,
    hardLineBreaks: partial.hardLineBreaks ?? DEFAULT_BODY_TEXT_CONFIG.hardLineBreaks,
    // Present only when off (#725): a document that shapes its words with
    // no letter in the script of their context resolves as before.
    // Present only when off (#1164), as the script context.
    ...(partial.breakAfterSlashes === false ? { breakAfterSlashes: false as const } : {}),
    ...(partial.scriptContext === false ? { scriptContext: false as const } : {}),
    // Present only for the host's language (#764): a document shaped in
    // its own, the default since postext 1.30 (#770), resolves as before.
    ...(partial.shapingLanguage === 'host' ? { shapingLanguage: 'host' as const } : {}),
    // Absent unless set, so a document without tab stops resolves as before (#622).
    ...(Array.isArray(partial.tabStops) ? { tabStops: partial.tabStops } : {}),
    ...(partial.tabInterval ? { tabInterval: partial.tabInterval } : {}),
    repeatHyphen: partial.repeatHyphen ?? DEFAULT_BODY_TEXT_CONFIG.repeatHyphen,
    blockquote: resolveBlockquoteConfig(partial.blockquote, documentLocale),
    verse: resolveVerseConfig(partial.verse),
    avoidOrphans: partial.avoidOrphans ?? DEFAULT_BODY_TEXT_CONFIG.avoidOrphans,
    orphanMinLines: partial.orphanMinLines ?? DEFAULT_BODY_TEXT_CONFIG.orphanMinLines,
    orphanPenalty: partial.orphanPenalty ?? DEFAULT_BODY_TEXT_CONFIG.orphanPenalty,
    avoidOrphansInLists: partial.avoidOrphansInLists ?? DEFAULT_BODY_TEXT_CONFIG.avoidOrphansInLists,
    avoidWidows: partial.avoidWidows ?? DEFAULT_BODY_TEXT_CONFIG.avoidWidows,
    widowMinLines: partial.widowMinLines ?? DEFAULT_BODY_TEXT_CONFIG.widowMinLines,
    widowPenalty: partial.widowPenalty ?? DEFAULT_BODY_TEXT_CONFIG.widowPenalty,
    avoidWidowsInLists: partial.avoidWidowsInLists ?? DEFAULT_BODY_TEXT_CONFIG.avoidWidowsInLists,
    shortListSplit: compositionRuleOf(partial.shortListSplit) ?? DEFAULT_BODY_TEXT_CONFIG.shortListSplit,
    shortListMaxItems: shortListMaxItemsOf(partial.shortListMaxItems) ?? DEFAULT_BODY_TEXT_CONFIG.shortListMaxItems,
    slackWeight: partial.slackWeight ?? DEFAULT_BODY_TEXT_CONFIG.slackWeight,
    avoidRunts: partial.avoidRunts ?? DEFAULT_BODY_TEXT_CONFIG.avoidRunts,
    runtMinCharacters: partial.runtMinCharacters ?? DEFAULT_BODY_TEXT_CONFIG.runtMinCharacters,
    runtPenalty: partial.runtPenalty ?? DEFAULT_BODY_TEXT_CONFIG.runtPenalty,
    gradedRuntPenalty: partial.gradedRuntPenalty ?? DEFAULT_BODY_TEXT_CONFIG.gradedRuntPenalty,
    avoidRuntsInLists: partial.avoidRuntsInLists ?? DEFAULT_BODY_TEXT_CONFIG.avoidRuntsInLists,
    tightenRunts: partial.tightenRunts ?? DEFAULT_BODY_TEXT_CONFIG.tightenRunts,
    maxRuntTracking: partial.maxRuntTracking ?? DEFAULT_BODY_TEXT_CONFIG.maxRuntTracking,
    keepColonWithList: partial.keepColonWithList ?? DEFAULT_BODY_TEXT_CONFIG.keepColonWithList,
    colonListRoom: partial.colonListRoom === 'line' || partial.colonListRoom === 'item'
      ? partial.colonListRoom
      : DEFAULT_BODY_TEXT_CONFIG.colonListRoom,
    // `false` and `'withinPage'` (#701) are kept; anything else reads `true`.
    hyphenateAcrossColumns: partial.hyphenateAcrossColumns === false || partial.hyphenateAcrossColumns === 'withinPage' ? partial.hyphenateAcrossColumns : DEFAULT_BODY_TEXT_CONFIG.hyphenateAcrossColumns,
    paragraphContainerSpacing: partial.paragraphContainerSpacing === 'add' || partial.paragraphContainerSpacing === 'collapse'
      ? partial.paragraphContainerSpacing
      : DEFAULT_BODY_TEXT_CONFIG.paragraphContainerSpacing,
    paragraphStylesInBoxes: partial.paragraphStylesInBoxes === 'document' ? 'document' : DEFAULT_BODY_TEXT_CONFIG.paragraphStylesInBoxes,
    ...emphasisAndTashkil(partial, documentLocale),
  };
}
