import type { BodyTextConfig, ResolvedBodyTextConfig, HyphenationConfig, HyphenationLocale } from '../types';
import { dimensionsEqual, colorsEqual } from './shared';

export const DEFAULT_HYPHENATION_CONFIG: ResolvedBodyTextConfig['hyphenation'] = {
  enabled: true,
  locale: 'en-us',
};

export const DEFAULT_BODY_TEXT_CONFIG: ResolvedBodyTextConfig = {
  fontFamily: 'EB Garamond',
  fontSize: { value: 8, unit: 'pt' },
  lineHeight: { value: 1.5, unit: 'em' },
  paragraphSpacing: false,
  color: { hex: '#000000', model: 'cmyk' },
  textAlign: 'justify',
  fontWeight: 400,
  boldFontWeight: 700,
  hyphenation: { ...DEFAULT_HYPHENATION_CONFIG },
  firstLineIndent: { value: 1.5, unit: 'em' },
  hangingIndent: false,
  maxWordSpacing: 1.8,
  minWordSpacing: 0.5,
  optimalLineBreaking: true,
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
  avoidRuntsInLists: true,
  keepColonWithList: true,
};

export function hyphenationEqual(a: HyphenationConfig | undefined, b: HyphenationConfig | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (a.enabled ?? DEFAULT_HYPHENATION_CONFIG.enabled) === (b.enabled ?? DEFAULT_HYPHENATION_CONFIG.enabled)
    && (a.locale ?? DEFAULT_HYPHENATION_CONFIG.locale) === (b.locale ?? DEFAULT_HYPHENATION_CONFIG.locale);
}

export function resolveBodyTextConfig(partial?: BodyTextConfig, documentLocale?: HyphenationLocale): ResolvedBodyTextConfig {
  if (!partial) return { ...DEFAULT_BODY_TEXT_CONFIG, hyphenation: { ...DEFAULT_HYPHENATION_CONFIG, locale: documentLocale ?? DEFAULT_HYPHENATION_CONFIG.locale } };

  return {
    fontFamily: partial.fontFamily ?? DEFAULT_BODY_TEXT_CONFIG.fontFamily,
    fontSize: partial.fontSize ?? DEFAULT_BODY_TEXT_CONFIG.fontSize,
    lineHeight: partial.lineHeight ?? DEFAULT_BODY_TEXT_CONFIG.lineHeight,
    paragraphSpacing: partial.paragraphSpacing ?? DEFAULT_BODY_TEXT_CONFIG.paragraphSpacing,
    color: partial.color ?? DEFAULT_BODY_TEXT_CONFIG.color,
    boldColor: partial.boldColor,
    italicColor: partial.italicColor,
    textAlign: partial.textAlign ?? DEFAULT_BODY_TEXT_CONFIG.textAlign,
    fontWeight: partial.fontWeight ?? DEFAULT_BODY_TEXT_CONFIG.fontWeight,
    boldFontWeight: partial.boldFontWeight ?? DEFAULT_BODY_TEXT_CONFIG.boldFontWeight,
    hyphenation: {
      enabled: partial.hyphenation?.enabled ?? DEFAULT_HYPHENATION_CONFIG.enabled,
      locale: partial.hyphenation?.locale ?? documentLocale ?? DEFAULT_HYPHENATION_CONFIG.locale,
    },
    firstLineIndent: partial.firstLineIndent ?? DEFAULT_BODY_TEXT_CONFIG.firstLineIndent,
    hangingIndent: partial.hangingIndent ?? DEFAULT_BODY_TEXT_CONFIG.hangingIndent,
    maxWordSpacing: partial.maxWordSpacing ?? DEFAULT_BODY_TEXT_CONFIG.maxWordSpacing,
    minWordSpacing: partial.minWordSpacing ?? DEFAULT_BODY_TEXT_CONFIG.minWordSpacing,
    optimalLineBreaking: partial.optimalLineBreaking ?? DEFAULT_BODY_TEXT_CONFIG.optimalLineBreaking,
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
    avoidRuntsInLists: partial.avoidRuntsInLists ?? DEFAULT_BODY_TEXT_CONFIG.avoidRuntsInLists,
    keepColonWithList: partial.keepColonWithList ?? DEFAULT_BODY_TEXT_CONFIG.keepColonWithList,
  };
}

export function stripBodyTextDefaults(bodyText?: BodyTextConfig): BodyTextConfig | undefined {
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
  if (bodyText.boldColor !== undefined) {
    result.boldColor = bodyText.boldColor;
    hasOverride = true;
  }
  if (bodyText.italicColor !== undefined) {
    result.italicColor = bodyText.italicColor;
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
  if (bodyText.hyphenation && !hyphenationEqual(bodyText.hyphenation, DEFAULT_BODY_TEXT_CONFIG.hyphenation)) {
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
  if (bodyText.maxWordSpacing !== undefined && bodyText.maxWordSpacing !== DEFAULT_BODY_TEXT_CONFIG.maxWordSpacing) {
    result.maxWordSpacing = bodyText.maxWordSpacing;
    hasOverride = true;
  }
  if (bodyText.minWordSpacing !== undefined && bodyText.minWordSpacing !== DEFAULT_BODY_TEXT_CONFIG.minWordSpacing) {
    result.minWordSpacing = bodyText.minWordSpacing;
    hasOverride = true;
  }
  if (bodyText.optimalLineBreaking !== undefined && bodyText.optimalLineBreaking !== DEFAULT_BODY_TEXT_CONFIG.optimalLineBreaking) {
    result.optimalLineBreaking = bodyText.optimalLineBreaking;
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
  if (bodyText.avoidRuntsInLists !== undefined && bodyText.avoidRuntsInLists !== DEFAULT_BODY_TEXT_CONFIG.avoidRuntsInLists) {
    result.avoidRuntsInLists = bodyText.avoidRuntsInLists;
    hasOverride = true;
  }
  if (bodyText.keepColonWithList !== undefined && bodyText.keepColonWithList !== DEFAULT_BODY_TEXT_CONFIG.keepColonWithList) {
    result.keepColonWithList = bodyText.keepColonWithList;
    hasOverride = true;
  }

  return hasOverride ? result : undefined;
}
