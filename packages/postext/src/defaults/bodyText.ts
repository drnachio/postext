import type { BlockquoteConfig, BodyTextConfig, EmphasisStyle, ResolvedBlockquoteConfig, ResolvedBodyTextConfig, ResolvedKashidaConfig, HyphenationConfig, KashidaPatterns, LocaleTag, TashkilMode } from '../types';
import { hyphenationLocaleFor, isUnhyphenatedLanguage, localeScript, presentTag } from '../locale';
import { dimensionsEqual, colorsEqual, DEFAULT_MAIN_COLOR, startEndAsLeftRight } from './shared';
import { DEFAULT_VERSE_CONFIG, resolveVerseConfig, stripVerseDefaults } from './verse';

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
  return {
    enabled,
    locale,
    ...(requested !== locale ? { tag: requested } : {}),
    ragged: partial?.ragged ?? D.ragged,
    zone: partial?.zone ?? D.zone,
    compounds: partial?.compounds ?? D.compounds,
  };
}

/** Whether a document in `locale` is written in Arabic script (`ar`,
 *  `fa`, `ur`…): its type has no italics. */
function arabicScript(locale: unknown): boolean {
  return localeScript(locale) === 'Arab';
}

const EMPHASES: readonly EmphasisStyle[] = ['italic', 'bold', 'color', 'overline'];
const TASHKIL_MODES: readonly TashkilMode[] = ['keep', 'strip', 'strip-vowels'];

/** Whether `value` names an emphasis style. */
export function isEmphasisStyle(value: unknown): value is EmphasisStyle {
  return EMPHASES.includes(value as EmphasisStyle);
}

/** Whether `value` names a tashkīl mode. */
export function isTashkilMode(value: unknown): value is TashkilMode {
  return TASHKIL_MODES.includes(value as TashkilMode);
}

/** How `*…*` is set by default in a document in `locale`: in bold when
 *  it is written in Arabic script, in italics otherwise (#376). */
export function defaultEmphasisFor(locale: unknown): EmphasisStyle {
  return arabicScript(locale) ? 'bold' : 'italic';
}

/** `bodyText.emphasis` resolved: `'auto'`, unset or an unknown value
 *  follow the language. */
export function resolveEmphasis(value: unknown, locale: unknown): EmphasisStyle {
  return isEmphasisStyle(value) ? value : defaultEmphasisFor(locale);
}

/** The fields `emphasis` and `tashkil` add to a resolved body config:
 *  each only when it is not the plain default (italics, marks kept), so a
 *  document that uses neither resolves exactly as before. */
function emphasisAndTashkil(partial: BodyTextConfig | undefined, locale: unknown): Pick<ResolvedBodyTextConfig, 'emphasis' | 'tashkil'> {
  const emphasis = resolveEmphasis(partial?.emphasis, locale);
  const tashkil = partial?.tashkil;
  return {
    ...(emphasis !== 'italic' ? { emphasis } : {}),
    ...(tashkil === 'strip' || tashkil === 'strip-vowels' ? { tashkil } : {}),
  };
}

/** The defaults of kashida justification once it is on (see
 *  `BodyTextConfig.kashida`). */
export const DEFAULT_KASHIDA_CONFIG: ResolvedKashidaConfig = {
  patterns: 'auto',
  perWord: 1,
  maxLength: 0.6,
};

/** Whether `tag` names a language written in the Arabic script (`ar`,
 *  `fa`, `ur`, `ps`, `ks-Arab`…): its justified text takes kashidas unless
 *  the config says `kashida: 'none'`. */
export function isArabicScriptLanguage(tag: unknown): boolean {
  const script = localeScript(tag);
  return script === 'Arab' || script === 'Aran';
}

const KASHIDA_PATTERNS: readonly KashidaPatterns[] = ['auto', 'naskh', 'simple', 'nastaliq'];

/** Kashida justification as resolved: `undefined` when it is off — unset
 *  outside an Arabic-script document, `'none'` — so a document without it
 *  resolves as before (#375). An unknown `kashida` value reads as unset (and
 *  `collectConfigWarnings` reports it); unknown or out-of-range details
 *  read as their defaults. */
function resolveKashida(partial: BodyTextConfig | undefined, documentLocale: LocaleTag | undefined): Pick<ResolvedBodyTextConfig, 'kashida' | 'kashidaPatterns' | 'kashidaPerWord' | 'kashidaMaxLength'> {
  const setting: unknown = partial?.kashida;
  const on = setting === 'auto' || (setting !== 'none' && isArabicScriptLanguage(documentLocale));
  if (!on) return {};
  const D = DEFAULT_KASHIDA_CONFIG;
  const perWord = partial?.kashidaPerWord;
  const maxLength = partial?.kashidaMaxLength;
  return {
    kashida: 'auto',
    kashidaPatterns: KASHIDA_PATTERNS.includes(partial?.kashidaPatterns as KashidaPatterns) ? partial!.kashidaPatterns! : D.patterns,
    kashidaPerWord: typeof perWord === 'number' && perWord >= 1 ? Math.floor(perWord) : D.perWord,
    kashidaMaxLength: typeof maxLength === 'number' && maxLength >= 0 ? maxLength : D.maxLength,
  };
}

/** Kashida justification of a resolved body text, or `undefined` when it
 *  is off. */
export function resolvedKashida(bodyText: Pick<ResolvedBodyTextConfig, 'kashida' | 'kashidaPatterns' | 'kashidaPerWord' | 'kashidaMaxLength'>): ResolvedKashidaConfig | undefined {
  if (bodyText.kashida !== 'auto') return undefined;
  const D = DEFAULT_KASHIDA_CONFIG;
  return {
    patterns: bodyText.kashidaPatterns ?? D.patterns,
    perWord: bodyText.kashidaPerWord ?? D.perWord,
    maxLength: bodyText.kashidaMaxLength ?? D.maxLength,
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
    ...emphasisAndTashkil(partial, documentLocale),
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
  // In a Chinese, Japanese, Korean or right-to-left document hyphenation
  // defaults to off, so settings equal to the Latin defaults
  // (`enabled: true`) are kept.
  if (bodyText.hyphenation && (isUnhyphenatedLanguage(documentLocale) || !hyphenationEqual(bodyText.hyphenation, DEFAULT_BODY_TEXT_CONFIG.hyphenation))) {
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
  // Kashida is on by default in an Arabic-script document only, so the
  // setting that matches the document's default is the one dropped.
  if (bodyText.kashida !== undefined && bodyText.kashida !== (isArabicScriptLanguage(documentLocale) ? 'auto' : 'none')) {
    result.kashida = bodyText.kashida;
    hasOverride = true;
  }
  if (bodyText.kashidaPatterns !== undefined && bodyText.kashidaPatterns !== DEFAULT_KASHIDA_CONFIG.patterns) {
    result.kashidaPatterns = bodyText.kashidaPatterns;
    hasOverride = true;
  }
  if (bodyText.kashidaPerWord !== undefined && bodyText.kashidaPerWord !== DEFAULT_KASHIDA_CONFIG.perWord) {
    result.kashidaPerWord = bodyText.kashidaPerWord;
    hasOverride = true;
  }
  if (bodyText.kashidaMaxLength !== undefined && bodyText.kashidaMaxLength !== DEFAULT_KASHIDA_CONFIG.maxLength) {
    result.kashidaMaxLength = bodyText.kashidaMaxLength;
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
  if (bodyText.hardLineBreaks !== undefined && bodyText.hardLineBreaks !== DEFAULT_BODY_TEXT_CONFIG.hardLineBreaks) {
    result.hardLineBreaks = bodyText.hardLineBreaks;
    hasOverride = true;
  }
  if (bodyText.repeatHyphen !== undefined && bodyText.repeatHyphen !== DEFAULT_BODY_TEXT_CONFIG.repeatHyphen) {
    result.repeatHyphen = bodyText.repeatHyphen;
    hasOverride = true;
  }
  const blockquote = stripBlockquoteDefaults(bodyText.blockquote, documentLocale);
  if (blockquote) {
    result.blockquote = blockquote;
    hasOverride = true;
  }
  const verse = stripVerseDefaults(bodyText.verse);
  if (verse) {
    result.verse = verse;
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
  // Its default follows the language: a set value other than `'auto'` is
  // kept, so the document reads the same in any language.
  if (bodyText.emphasis !== undefined && bodyText.emphasis !== 'auto') {
    result.emphasis = bodyText.emphasis;
    hasOverride = true;
  }
  if (bodyText.tashkil !== undefined && bodyText.tashkil !== 'keep') {
    result.tashkil = bodyText.tashkil;
    hasOverride = true;
  }

  return hasOverride ? result : undefined;
}
