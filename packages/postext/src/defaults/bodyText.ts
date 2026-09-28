import type { BlockquoteConfig, BodyTextConfig, ResolvedBlockquoteConfig, ResolvedBodyTextConfig, HyphenationConfig, LocaleTag } from '../types';
import { hyphenationLocaleFor, isCjkLanguage, presentTag } from '../locale';
import { dimensionsEqual, colorsEqual, DEFAULT_MAIN_COLOR } from './shared';

export const DEFAULT_HYPHENATION_CONFIG: ResolvedBodyTextConfig['hyphenation'] = {
  enabled: true,
  locale: 'en-us',
  ragged: false,
  zone: { value: 3, unit: 'em' },
  compounds: true,
};

/** Blockquotes as postext 1.4 set them: grey, italic, the body's
 *  first-line indent, no side indent. */
export const DEFAULT_BLOCKQUOTE_CONFIG: ResolvedBlockquoteConfig = {
  color: { hex: '#666666', model: 'hex' },
  italic: true,
  indent: { value: 0, unit: 'em' },
};

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
  repeatHyphen: false,
  blockquote: DEFAULT_BLOCKQUOTE_CONFIG,
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
};

export function hyphenationEqual(a: HyphenationConfig | undefined, b: HyphenationConfig | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const D = DEFAULT_HYPHENATION_CONFIG;
  return (a.enabled ?? D.enabled) === (b.enabled ?? D.enabled)
    && (a.locale ?? D.locale) === (b.locale ?? D.locale)
    && (a.ragged ?? D.ragged) === (b.ragged ?? D.ragged)
    && dimensionsEqual(a.zone ?? D.zone, b.zone ?? D.zone)
    && (a.compounds ?? D.compounds) === (b.compounds ?? D.compounds);
}

/** Resolve the hyphenation settings. The locale — the explicit one, else the
 *  document language; a blank tag counts as unset — becomes the bundled
 *  patterns it names (`'es-ES'` → `'es'`), keeping the original tag when it
 *  differs. A language without patterns is reported only when hyphenation
 *  is on: switching it off is the remedy.
 *
 *  Chinese, Japanese and Korean have no patterns and need none: a document
 *  in one of them is set without hyphenation unless `enabled` says
 *  otherwise, and hyphenation only runs when its language (the explicit
 *  `locale`) has patterns, for the Latin words quoted in the text. */
function resolveHyphenation(partial: HyphenationConfig | undefined, documentLocale: LocaleTag | undefined): ResolvedBodyTextConfig['hyphenation'] {
  const D = DEFAULT_HYPHENATION_CONFIG;
  const requested = presentTag(partial?.locale) ?? presentTag(documentLocale) ?? D.locale;
  const enabled = isCjkLanguage(requested)
    ? false
    : partial?.enabled ?? (isCjkLanguage(documentLocale) ? false : D.enabled);
  const locale = hyphenationLocaleFor(requested, enabled);
  return {
    enabled,
    locale,
    ...(requested !== locale ? { tag: requested } : {}),
    ragged: partial?.ragged ?? D.ragged,
    zone: partial?.zone ?? D.zone,
    compounds: partial?.compounds ?? D.compounds,
  };
}

/** A blockquote style in full: unset fields keep postext 1.4's look (see
 *  {@link DEFAULT_BLOCKQUOTE_CONFIG}); an unset `firstLineIndent` stays
 *  unset, the body's then applying. */
export function resolveBlockquoteConfig(partial?: BlockquoteConfig): ResolvedBlockquoteConfig {
  const D = DEFAULT_BLOCKQUOTE_CONFIG;
  return {
    color: partial?.color ?? D.color,
    italic: partial?.italic ?? D.italic,
    indent: partial?.indent ?? D.indent,
    ...(partial?.firstLineIndent ? { firstLineIndent: partial.firstLineIndent } : {}),
  };
}

/** `blockquote` without the fields that hold their default; undefined when
 *  none is left. */
export function stripBlockquoteDefaults(blockquote?: BlockquoteConfig): BlockquoteConfig | undefined {
  if (!blockquote) return undefined;
  const D = DEFAULT_BLOCKQUOTE_CONFIG;
  const out: BlockquoteConfig = {};
  if (blockquote.color !== undefined && !colorsEqual(blockquote.color, D.color)) out.color = blockquote.color;
  if (blockquote.italic !== undefined && blockquote.italic !== D.italic) out.italic = blockquote.italic;
  if (blockquote.indent !== undefined && !dimensionsEqual(blockquote.indent, D.indent)) out.indent = blockquote.indent;
  if (blockquote.firstLineIndent !== undefined) out.firstLineIndent = blockquote.firstLineIndent;
  return Object.keys(out).length > 0 ? out : undefined;
}

export function resolveBodyTextConfig(partial?: BodyTextConfig, documentLocale?: LocaleTag): ResolvedBodyTextConfig {
  if (!partial) return { ...DEFAULT_BODY_TEXT_CONFIG, hyphenation: resolveHyphenation(undefined, documentLocale) };

  return {
    fontFamily: partial.fontFamily ?? DEFAULT_BODY_TEXT_CONFIG.fontFamily,
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
    textAlign: partial.textAlign ?? DEFAULT_BODY_TEXT_CONFIG.textAlign,
    fontWeight: partial.fontWeight ?? DEFAULT_BODY_TEXT_CONFIG.fontWeight,
    boldFontWeight: partial.boldFontWeight ?? DEFAULT_BODY_TEXT_CONFIG.boldFontWeight,
    hyphenation: resolveHyphenation(partial.hyphenation, documentLocale),
    firstLineIndent: partial.firstLineIndent ?? DEFAULT_BODY_TEXT_CONFIG.firstLineIndent,
    hangingIndent: partial.hangingIndent ?? DEFAULT_BODY_TEXT_CONFIG.hangingIndent,
    indentAfterHeading: partial.indentAfterHeading ?? DEFAULT_BODY_TEXT_CONFIG.indentAfterHeading,
    maxWordSpacing: partial.maxWordSpacing ?? DEFAULT_BODY_TEXT_CONFIG.maxWordSpacing,
    minWordSpacing: partial.minWordSpacing ?? DEFAULT_BODY_TEXT_CONFIG.minWordSpacing,
    maxJustifyTracking: partial.maxJustifyTracking ?? DEFAULT_BODY_TEXT_CONFIG.maxJustifyTracking,
    optimalLineBreaking: partial.optimalLineBreaking ?? DEFAULT_BODY_TEXT_CONFIG.optimalLineBreaking,
    optimalRagged: partial.optimalRagged ?? DEFAULT_BODY_TEXT_CONFIG.optimalRagged,
    breakAfterDashes: partial.breakAfterDashes ?? DEFAULT_BODY_TEXT_CONFIG.breakAfterDashes,
    breakAfterHyphens: partial.breakAfterHyphens ?? DEFAULT_BODY_TEXT_CONFIG.breakAfterHyphens,
    repeatHyphen: partial.repeatHyphen ?? DEFAULT_BODY_TEXT_CONFIG.repeatHyphen,
    blockquote: resolveBlockquoteConfig(partial.blockquote),
    avoidOrphans: partial.avoidOrphans ?? DEFAULT_BODY_TEXT_CONFIG.avoidOrphans,
    orphanMinLines: partial.orphanMinLines ?? DEFAULT_BODY_TEXT_CONFIG.orphanMinLines,
    orphanPenalty: partial.orphanPenalty ?? DEFAULT_BODY_TEXT_CONFIG.orphanPenalty,
    avoidOrphansInLists: partial.avoidOrphansInLists ?? DEFAULT_BODY_TEXT_CONFIG.avoidOrphansInLists,
    avoidWidows: partial.avoidWidows ?? DEFAULT_BODY_TEXT_CONFIG.avoidWidows,
    widowMinLines: partial.widowMinLines ?? DEFAULT_BODY_TEXT_CONFIG.widowMinLines,
    widowPenalty: partial.widowPenalty ?? DEFAULT_BODY_TEXT_CONFIG.widowPenalty,
    avoidWidowsInLists: partial.avoidWidowsInLists ?? DEFAULT_BODY_TEXT_CONFIG.avoidWidowsInLists,
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
    hyphenateAcrossColumns: partial.hyphenateAcrossColumns ?? DEFAULT_BODY_TEXT_CONFIG.hyphenateAcrossColumns,
    paragraphContainerSpacing: partial.paragraphContainerSpacing === 'add' || partial.paragraphContainerSpacing === 'collapse'
      ? partial.paragraphContainerSpacing
      : DEFAULT_BODY_TEXT_CONFIG.paragraphContainerSpacing,
  };
}

/** `bodyText` without the fields that hold their default. `documentLocale`
 *  (the config's `locale`) matters to hyphenation only: in a Chinese,
 *  Japanese or Korean document its default is off. */
export function stripBodyTextDefaults(bodyText?: BodyTextConfig, documentLocale?: LocaleTag): BodyTextConfig | undefined {
  if (!bodyText) return undefined;

  const result: BodyTextConfig = {};
  let hasOverride = false;

  if (bodyText.fontFamily !== undefined && bodyText.fontFamily !== DEFAULT_BODY_TEXT_CONFIG.fontFamily) {
    result.fontFamily = bodyText.fontFamily;
    hasOverride = true;
  }
  if (bodyText.fontSize !== undefined && !dimensionsEqual(bodyText.fontSize, DEFAULT_BODY_TEXT_CONFIG.fontSize)) {
    result.fontSize = bodyText.fontSize;
    hasOverride = true;
  }
  if (bodyText.lineHeight !== undefined && !dimensionsEqual(bodyText.lineHeight, DEFAULT_BODY_TEXT_CONFIG.lineHeight)) {
    result.lineHeight = bodyText.lineHeight;
    hasOverride = true;
  }
  if (bodyText.paragraphSpacing !== undefined && bodyText.paragraphSpacing !== DEFAULT_BODY_TEXT_CONFIG.paragraphSpacing) {
    result.paragraphSpacing = bodyText.paragraphSpacing;
    hasOverride = true;
  }
  if (bodyText.color !== undefined && !colorsEqual(bodyText.color, DEFAULT_BODY_TEXT_CONFIG.color)) {
    result.color = bodyText.color;
    hasOverride = true;
  }
  if (bodyText.boldColor !== undefined && !colorsEqual(bodyText.boldColor, DEFAULT_BODY_TEXT_CONFIG.boldColor!)) {
    result.boldColor = bodyText.boldColor;
    hasOverride = true;
  }
  if (bodyText.italicColor !== undefined && !colorsEqual(bodyText.italicColor, DEFAULT_BODY_TEXT_CONFIG.italicColor!)) {
    result.italicColor = bodyText.italicColor;
    hasOverride = true;
  }
  if (bodyText.referenceColor !== undefined && !colorsEqual(bodyText.referenceColor, DEFAULT_BODY_TEXT_CONFIG.referenceColor)) {
    result.referenceColor = bodyText.referenceColor;
    hasOverride = true;
  }
  if (bodyText.referenceBold !== undefined && bodyText.referenceBold !== DEFAULT_BODY_TEXT_CONFIG.referenceBold) {
    result.referenceBold = bodyText.referenceBold;
    hasOverride = true;
  }
  if (bodyText.referenceItalic !== undefined && bodyText.referenceItalic !== DEFAULT_BODY_TEXT_CONFIG.referenceItalic) {
    result.referenceItalic = bodyText.referenceItalic;
    hasOverride = true;
  }
  if (bodyText.textAlign !== undefined && bodyText.textAlign !== DEFAULT_BODY_TEXT_CONFIG.textAlign) {
    result.textAlign = bodyText.textAlign;
    hasOverride = true;
  }
  if (bodyText.fontWeight !== undefined && bodyText.fontWeight !== DEFAULT_BODY_TEXT_CONFIG.fontWeight) {
    result.fontWeight = bodyText.fontWeight;
    hasOverride = true;
  }
  if (bodyText.boldFontWeight !== undefined && bodyText.boldFontWeight !== DEFAULT_BODY_TEXT_CONFIG.boldFontWeight) {
    result.boldFontWeight = bodyText.boldFontWeight;
    hasOverride = true;
  }
  // In a Chinese, Japanese or Korean document hyphenation defaults to off,
  // so settings equal to the Latin defaults (`enabled: true`) are kept.
  if (bodyText.hyphenation && (isCjkLanguage(documentLocale) || !hyphenationEqual(bodyText.hyphenation, DEFAULT_BODY_TEXT_CONFIG.hyphenation))) {
    result.hyphenation = bodyText.hyphenation;
    hasOverride = true;
  }
  if (bodyText.firstLineIndent !== undefined && !dimensionsEqual(bodyText.firstLineIndent, DEFAULT_BODY_TEXT_CONFIG.firstLineIndent)) {
    result.firstLineIndent = bodyText.firstLineIndent;
    hasOverride = true;
  }
  if (bodyText.hangingIndent !== undefined && bodyText.hangingIndent !== DEFAULT_BODY_TEXT_CONFIG.hangingIndent) {
    result.hangingIndent = bodyText.hangingIndent;
    hasOverride = true;
  }
  if (bodyText.indentAfterHeading !== undefined && bodyText.indentAfterHeading !== DEFAULT_BODY_TEXT_CONFIG.indentAfterHeading) {
    result.indentAfterHeading = bodyText.indentAfterHeading;
    hasOverride = true;
  }
  if (bodyText.maxWordSpacing !== undefined && bodyText.maxWordSpacing !== DEFAULT_BODY_TEXT_CONFIG.maxWordSpacing) {
    result.maxWordSpacing = bodyText.maxWordSpacing;
    hasOverride = true;
  }
  if (bodyText.minWordSpacing !== undefined && bodyText.minWordSpacing !== DEFAULT_BODY_TEXT_CONFIG.minWordSpacing) {
    result.minWordSpacing = bodyText.minWordSpacing;
    hasOverride = true;
  }
  if (bodyText.maxJustifyTracking !== undefined && bodyText.maxJustifyTracking !== DEFAULT_BODY_TEXT_CONFIG.maxJustifyTracking) {
    result.maxJustifyTracking = bodyText.maxJustifyTracking;
    hasOverride = true;
  }
  if (bodyText.optimalLineBreaking !== undefined && bodyText.optimalLineBreaking !== DEFAULT_BODY_TEXT_CONFIG.optimalLineBreaking) {
    result.optimalLineBreaking = bodyText.optimalLineBreaking;
    hasOverride = true;
  }
  if (bodyText.optimalRagged !== undefined && bodyText.optimalRagged !== DEFAULT_BODY_TEXT_CONFIG.optimalRagged) {
    result.optimalRagged = bodyText.optimalRagged;
    hasOverride = true;
  }
  if (bodyText.breakAfterDashes !== undefined && bodyText.breakAfterDashes !== DEFAULT_BODY_TEXT_CONFIG.breakAfterDashes) {
    result.breakAfterDashes = bodyText.breakAfterDashes;
    hasOverride = true;
  }
  if (bodyText.breakAfterHyphens !== undefined && bodyText.breakAfterHyphens !== DEFAULT_BODY_TEXT_CONFIG.breakAfterHyphens) {
    result.breakAfterHyphens = bodyText.breakAfterHyphens;
    hasOverride = true;
  }
  if (bodyText.repeatHyphen !== undefined && bodyText.repeatHyphen !== DEFAULT_BODY_TEXT_CONFIG.repeatHyphen) {
    result.repeatHyphen = bodyText.repeatHyphen;
    hasOverride = true;
  }
  const blockquote = stripBlockquoteDefaults(bodyText.blockquote);
  if (blockquote) {
    result.blockquote = blockquote;
    hasOverride = true;
  }
  if (bodyText.avoidOrphans !== undefined && bodyText.avoidOrphans !== DEFAULT_BODY_TEXT_CONFIG.avoidOrphans) {
    result.avoidOrphans = bodyText.avoidOrphans;
    hasOverride = true;
  }
  if (bodyText.orphanMinLines !== undefined && bodyText.orphanMinLines !== DEFAULT_BODY_TEXT_CONFIG.orphanMinLines) {
    result.orphanMinLines = bodyText.orphanMinLines;
    hasOverride = true;
  }
  if (bodyText.avoidWidows !== undefined && bodyText.avoidWidows !== DEFAULT_BODY_TEXT_CONFIG.avoidWidows) {
    result.avoidWidows = bodyText.avoidWidows;
    hasOverride = true;
  }
  if (bodyText.widowMinLines !== undefined && bodyText.widowMinLines !== DEFAULT_BODY_TEXT_CONFIG.widowMinLines) {
    result.widowMinLines = bodyText.widowMinLines;
    hasOverride = true;
  }
  if (bodyText.orphanPenalty !== undefined && bodyText.orphanPenalty !== DEFAULT_BODY_TEXT_CONFIG.orphanPenalty) {
    result.orphanPenalty = bodyText.orphanPenalty;
    hasOverride = true;
  }
  if (bodyText.widowPenalty !== undefined && bodyText.widowPenalty !== DEFAULT_BODY_TEXT_CONFIG.widowPenalty) {
    result.widowPenalty = bodyText.widowPenalty;
    hasOverride = true;
  }
  if (bodyText.avoidOrphansInLists !== undefined && bodyText.avoidOrphansInLists !== DEFAULT_BODY_TEXT_CONFIG.avoidOrphansInLists) {
    result.avoidOrphansInLists = bodyText.avoidOrphansInLists;
    hasOverride = true;
  }
  if (bodyText.avoidWidowsInLists !== undefined && bodyText.avoidWidowsInLists !== DEFAULT_BODY_TEXT_CONFIG.avoidWidowsInLists) {
    result.avoidWidowsInLists = bodyText.avoidWidowsInLists;
    hasOverride = true;
  }
  if (bodyText.slackWeight !== undefined && bodyText.slackWeight !== DEFAULT_BODY_TEXT_CONFIG.slackWeight) {
    result.slackWeight = bodyText.slackWeight;
    hasOverride = true;
  }
  if (bodyText.avoidRunts !== undefined && bodyText.avoidRunts !== DEFAULT_BODY_TEXT_CONFIG.avoidRunts) {
    result.avoidRunts = bodyText.avoidRunts;
    hasOverride = true;
  }
  if (bodyText.runtMinCharacters !== undefined && bodyText.runtMinCharacters !== DEFAULT_BODY_TEXT_CONFIG.runtMinCharacters) {
    result.runtMinCharacters = bodyText.runtMinCharacters;
    hasOverride = true;
  }
  if (bodyText.runtPenalty !== undefined && bodyText.runtPenalty !== DEFAULT_BODY_TEXT_CONFIG.runtPenalty) {
    result.runtPenalty = bodyText.runtPenalty;
    hasOverride = true;
  }
  if (bodyText.gradedRuntPenalty !== undefined && bodyText.gradedRuntPenalty !== DEFAULT_BODY_TEXT_CONFIG.gradedRuntPenalty) {
    result.gradedRuntPenalty = bodyText.gradedRuntPenalty;
    hasOverride = true;
  }
  if (bodyText.avoidRuntsInLists !== undefined && bodyText.avoidRuntsInLists !== DEFAULT_BODY_TEXT_CONFIG.avoidRuntsInLists) {
    result.avoidRuntsInLists = bodyText.avoidRuntsInLists;
    hasOverride = true;
  }
  if (bodyText.tightenRunts !== undefined && bodyText.tightenRunts !== DEFAULT_BODY_TEXT_CONFIG.tightenRunts) {
    result.tightenRunts = bodyText.tightenRunts;
    hasOverride = true;
  }
  if (bodyText.maxRuntTracking !== undefined && bodyText.maxRuntTracking !== DEFAULT_BODY_TEXT_CONFIG.maxRuntTracking) {
    result.maxRuntTracking = bodyText.maxRuntTracking;
    hasOverride = true;
  }
  if (bodyText.keepColonWithList !== undefined && bodyText.keepColonWithList !== DEFAULT_BODY_TEXT_CONFIG.keepColonWithList) {
    result.keepColonWithList = bodyText.keepColonWithList;
    hasOverride = true;
  }
  if (bodyText.colonListRoom !== undefined && bodyText.colonListRoom !== DEFAULT_BODY_TEXT_CONFIG.colonListRoom) {
    result.colonListRoom = bodyText.colonListRoom;
    hasOverride = true;
  }
  if (bodyText.hyphenateAcrossColumns !== undefined && bodyText.hyphenateAcrossColumns !== DEFAULT_BODY_TEXT_CONFIG.hyphenateAcrossColumns) {
    result.hyphenateAcrossColumns = bodyText.hyphenateAcrossColumns;
    hasOverride = true;
  }
  if (bodyText.paragraphContainerSpacing !== undefined && bodyText.paragraphContainerSpacing !== DEFAULT_BODY_TEXT_CONFIG.paragraphContainerSpacing) {
    result.paragraphContainerSpacing = bodyText.paragraphContainerSpacing;
    hasOverride = true;
  }

  return hasOverride ? result : undefined;
}
