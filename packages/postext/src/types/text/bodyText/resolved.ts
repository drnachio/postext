// ResolvedBodyTextConfig: the body text with every default filled in
// (#1278: split out of bodyText.ts).
import type { TextAlign, ResolvedHyphenationConfig, KashidaPatterns } from '../locale.js';
import type { Dimension, ColorValue } from '../../page.js';
import type { TabStop } from '../paragraphStyles.js';
import type { ResolvedVerseConfig } from '../verse.js';
import type { ResolvedBlockquoteConfig, CompositionRule, ColonListRoom, ParagraphContainerSpacing, ParagraphStylesInBoxes, EmphasisStyle, TashkilMode } from './options.js';

export interface ResolvedBodyTextConfig {
  fontFamily: string;
  fontSize: Dimension;
  lineHeight: Dimension;
  paragraphSpacing: boolean | Dimension;
  color: ColorValue;
  boldColor?: ColorValue;
  italicColor?: ColorValue;
  /** Resolved colour for inline `:ref` labels (defaults to the bold colour). */
  referenceColor: ColorValue;
  /** Whether reference labels use the bold font. */
  referenceBold: boolean;
  /** Whether reference labels are italic. */
  referenceItalic: boolean;
  textAlign: TextAlign;
  fontWeight: number;
  boldFontWeight: number;
  hyphenation: ResolvedHyphenationConfig;
  firstLineIndent: Dimension;
  hangingIndent: boolean;
  indentAfterHeading: boolean;
  maxWordSpacing: number;
  minWordSpacing: number;
  maxJustifyTracking: number;
  /** Kashida justification (see `BodyTextConfig.kashida`): `'auto'` and
   *  its three details, all resolved, when it is on; all four absent when
   *  it is off, so a document that does not use it resolves as it did
   *  before kashidas existed. Read them with `resolvedKashida`. */
  kashida?: 'auto';
  kashidaPatterns?: KashidaPatterns;
  kashidaPerWord?: number;
  kashidaMaxLength?: number;
  optimalLineBreaking: boolean;
  optimalRagged: boolean;
  breakAfterDashes: boolean;
  breakAfterHyphens: boolean;
  hardLineBreaks: boolean;
  /** Present only when switched off (see
   *  {@link BodyTextConfig.breakAfterSlashes}). */
  breakAfterSlashes?: false;
  /** Present only when switched off (see
   *  {@link BodyTextConfig.scriptContext}). */
  scriptContext?: false;
  /** Present only when the host's (see
   *  {@link BodyTextConfig.shapingLanguage}). */
  shapingLanguage?: 'host';
  /** Absent when unset (see {@link BodyTextConfig.tabStops}). */
  tabStops?: TabStop[];
  /** Absent when unset (see {@link BodyTextConfig.tabInterval}). */
  tabInterval?: Dimension;
  repeatHyphen: boolean;
  blockquote: ResolvedBlockquoteConfig;
  verse: ResolvedVerseConfig;
  avoidOrphans: boolean;
  orphanMinLines: number;
  orphanPenalty: number;
  avoidOrphansInLists: boolean;
  avoidWidows: boolean;
  widowMinLines: number;
  widowPenalty: number;
  avoidWidowsInLists: boolean;
  shortListSplit: CompositionRule;
  shortListMaxItems: number;
  slackWeight: number;
  avoidRunts: boolean;
  runtMinCharacters: number;
  runtPenalty: number;
  gradedRuntPenalty: boolean;
  avoidRuntsInLists: boolean;
  tightenRunts: boolean;
  maxRuntTracking: number;
  keepColonWithList: boolean;
  colonListRoom: ColonListRoom;
  hyphenateAcrossColumns: boolean | 'withinPage';
  paragraphContainerSpacing: ParagraphContainerSpacing;
  paragraphStylesInBoxes: ParagraphStylesInBoxes;
  /** `emphasis` resolved; absent when `*…*` is set in italics. */
  emphasis?: Exclude<EmphasisStyle, 'italic'>;
  /** `tashkil`; absent when the marks are kept. */
  tashkil?: Exclude<TashkilMode, 'keep'>;
  /** Set only in the derived config a callout lays its children out with
   *  (a style's `body.italic` / `body.smallCaps`): the running text of a
   *  document is always upright, in lowercase. */
  italic?: boolean;
  smallCaps?: boolean;
  /** Set only in the derived config of a callout whose `body.letterSpacing`
   *  is not zero (#974). */
  letterSpacing?: Dimension;
}
