// stripBodyTextDefaults: drops the body text fields that match the defaults
// (#1278: split out of bodyText.ts).
import type { HyphenationConfig, LocaleTag, BodyTextConfig } from '../../../types.js';
import { presentTag, hyphenationLocaleFor, isUnhyphenatedLanguage } from '../../../hyphenation/locale.js';
import { dimensionsEqual, colorsEqual } from '../../shared.js';
import { stripVerseDefaults } from '../verse.js';
import { isArabicScriptLanguage, DEFAULT_KASHIDA_CONFIG } from './arabic.js';
import { DEFAULT_BODY_TEXT_CONFIG, hyphenationEqual } from './defaults.js';
import { stripBlockquoteDefaults } from './resolve.js';

/** Whether `hyphenation` names patterns other than the ones a document in
 *  `documentLocale` takes when it names none (`resolveHyphenation`):
 *  `locale: 'en-us'` in a Spanish document is no default there (#651). */
function namesOtherPatterns(hyphenation: HyphenationConfig, documentLocale: LocaleTag | undefined): boolean {
  const named = presentTag(hyphenation.locale);
  const ofDocument = presentTag(documentLocale);
  if (named === undefined || ofDocument === undefined) return false;
  return hyphenationLocaleFor(named, false) !== hyphenationLocaleFor(ofDocument, false);
}

/** `bodyText` without the fields that hold their default. `documentLocale`
 *  (the config's `locale`) matters to hyphenation only: in a Chinese,
 *  Japanese or Korean document its default is off, and the patterns of a
 *  document that names its language are that language's. `avoidWidowsOn`
 *  and `avoidOrphansOn` are the document's defaults for the two break
 *  rules (`avoidWidowsByDefault(config)`, `avoidOrphansByDefault(config)`,
 *  #717): each rule is dropped when it restates its own, so `true` is
 *  kept on a character grid where the rule is off, and `false` dropped
 *  there. */
export function stripBodyTextDefaults(
  bodyText?: BodyTextConfig,
  documentLocale?: LocaleTag,
  avoidWidowsOn: boolean = DEFAULT_BODY_TEXT_CONFIG.avoidWidows,
  avoidOrphansOn: boolean = DEFAULT_BODY_TEXT_CONFIG.avoidOrphans,
): BodyTextConfig | undefined {
  if (!bodyText) return undefined;

  const result: BodyTextConfig = {};
  let hasOverride = false;

  if (bodyText.fontFamily !== undefined && bodyText.fontFamily !== DEFAULT_BODY_TEXT_CONFIG.fontFamily) {
    result.fontFamily = bodyText.fontFamily;
    hasOverride = true;
  }
  if (bodyText.figureStyle !== undefined) {
    result.figureStyle = bodyText.figureStyle;
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
  // The reference colour follows the bold colour, so one set back to the
  // default under another bold colour is no default there (#694).
  if (bodyText.referenceColor !== undefined && (
    !colorsEqual(bodyText.referenceColor, DEFAULT_BODY_TEXT_CONFIG.referenceColor)
    || (bodyText.boldColor !== undefined && !colorsEqual(bodyText.boldColor, bodyText.referenceColor))
  )) {
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
  if (bodyText.hyphenation && (isUnhyphenatedLanguage(documentLocale) || namesOtherPatterns(bodyText.hyphenation, documentLocale) || !hyphenationEqual(bodyText.hyphenation, DEFAULT_BODY_TEXT_CONFIG.hyphenation))) {
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
  // On by default, and resolved only when off (#1164).
  if (bodyText.breakAfterSlashes === false) {
    result.breakAfterSlashes = false;
    hasOverride = true;
  }
  // On by default, and resolved only when off (#725).
  if (bodyText.scriptContext === false) {
    result.scriptContext = false;
    hasOverride = true;
  }
  // Kept as written, the default too (#764): the default of this key was
  // the document's in postext 1.29.0, the host's in 1.29.1 and 1.29.2 and
  // the document's again from 1.30 (#770), so a stored value says which
  // language the document was laid out in.
  if (bodyText.shapingLanguage === 'host' || bodyText.shapingLanguage === 'document') {
    result.shapingLanguage = bodyText.shapingLanguage;
    hasOverride = true;
  }
  if (Array.isArray(bodyText.tabStops)) {
    result.tabStops = bodyText.tabStops;
    hasOverride = true;
  }
  if (bodyText.tabInterval !== undefined) {
    result.tabInterval = bodyText.tabInterval;
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
  // The break rules are compared with the default of the document (#717):
  // on a character grid `true` is kept and `false` dropped.
  if (bodyText.avoidOrphans !== undefined && bodyText.avoidOrphans !== avoidOrphansOn) {
    result.avoidOrphans = bodyText.avoidOrphans;
    hasOverride = true;
  }
  if (bodyText.orphanMinLines !== undefined && bodyText.orphanMinLines !== DEFAULT_BODY_TEXT_CONFIG.orphanMinLines) {
    result.orphanMinLines = bodyText.orphanMinLines;
    hasOverride = true;
  }
  if (bodyText.avoidWidows !== undefined && bodyText.avoidWidows !== avoidWidowsOn) {
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
  if (bodyText.shortListSplit !== undefined && bodyText.shortListSplit !== DEFAULT_BODY_TEXT_CONFIG.shortListSplit) {
    result.shortListSplit = bodyText.shortListSplit;
    hasOverride = true;
  }
  if (bodyText.shortListMaxItems !== undefined && bodyText.shortListMaxItems !== DEFAULT_BODY_TEXT_CONFIG.shortListMaxItems) {
    result.shortListMaxItems = bodyText.shortListMaxItems;
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
  if (bodyText.hyphenateAcrossColumns === false || bodyText.hyphenateAcrossColumns === 'withinPage') {
    result.hyphenateAcrossColumns = bodyText.hyphenateAcrossColumns;
    hasOverride = true;
  }
  if (bodyText.paragraphContainerSpacing !== undefined && bodyText.paragraphContainerSpacing !== DEFAULT_BODY_TEXT_CONFIG.paragraphContainerSpacing) {
    result.paragraphContainerSpacing = bodyText.paragraphContainerSpacing;
    hasOverride = true;
  }
  if (bodyText.paragraphStylesInBoxes === 'document') {
    result.paragraphStylesInBoxes = 'document';
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
