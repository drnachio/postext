// "Japanese defaults" (Design › Writing system): the settings a Japanese
// book changes together, worked out as a list the author reviews before
// anything moves, as the Chinese and Arabic defaults are. Two kinds of
// book: a vertical one set as a bunko or tankōbon novel is (縦組, bound on
// the right, a character grid), and a horizontal one set as a technical
// book is (横組, bound on the left). Pure: the section shows `changes`,
// ticks and unticks rows, and dispatches `config` as one step;
// `undoJapaneseDefaults` takes that step back.
//
// Values follow the defaults table of the Japanese typesetting reference
// (JLReq, JIS X 4051). What the engine already does by itself for a `ja`
// document (the japan region: JLReq line breaking, yakumono spacing, sesame
// emphasis marks, 『』 titles, （） warichu; the notes' Japanese defaults)
// is not written into the config: the rows below only take back settings
// that would stand in its way.

import type {
  CjkConfig,
  Dimension,
  DesignTextElement,
  FootnoteNumbering,
  ResolvedFootnotesConfig,
  FootnotesConfig,
  HeadingLevelConfig,
  OrderedListLevelConfig,
  OrderedListNumberFormat,
  PageNumberFormat,
  PostextConfig,
  ResourceType,
  TextAlign,
  WritingMode,
} from 'postext';
import {
  DEFAULT_BODY_TEXT_CONFIG,
  DEFAULT_FOOTER_SLOT,
  DEFAULT_HEADER_SLOT,
  DEFAULT_HEADINGS_CONFIG,
  DEFAULT_TEXT_ELEMENT,
  cjkGridGeometry,
  defaultCaptionLabels,
  defaultResourceTypes,
  dimensionsEqual,
  formatNumeral,
  isCjkLanguage,
  isJapaneseLanguage,
  parseNumberFormat,
  resolveBodyTextConfig,
  resolveFootnotesConfig,
  resolveLayoutConfig,
  resolveOrderedListsConfig,
  resolvePageConfig,
} from 'postext';
import { chineseFontsFor } from './chineseDefaults';
import { documentDirection } from './documentDirection';
import {
  builtInTypes,
  canonicalJson,
  createDefaultsMemory,
  designTextNeedsScript,
  ENGINE_DESIGN_FACES,
  figureOf,
  headingFacesText,
  isDesignText,
  listSample,
  listSignature,
  mapDesignTexts,
  mergeBuiltInTypes,
  sampleNumber,
  set,
  typeNames,
  undoDefaults,
  without,
} from './defaultsReview';

/** One row of the review list, in the order the list shows them. */
export type JapaneseDefaultId =
  | 'locale'
  | 'writingMode'
  | 'binding'
  | 'bodyFont'
  | 'headingFont'
  | 'designFonts'
  | 'lineHeight'
  | 'grid'
  | 'firstLineIndent'
  | 'indentAfterHeading'
  | 'paragraphSpacing'
  | 'textAlign'
  | 'hyphenation'
  | 'cjkRules'
  | 'resourceTypes'
  | 'captionLabel'
  | 'chapterNumbering'
  | 'headingLayout'
  | 'listNumbers'
  | 'footnotes'
  | 'folio';

/** The two kinds of book the list sets up: vertical (縦組, a bunko or
 *  tankōbon novel) and horizontal (横組, a technical book). */
export type JapaneseBook = 'vertical' | 'horizontal';

/** The `cjk` settings the `cjkRules` row returns to Auto (the japan
 *  region's values), in the order the East Asian typography section shows
 *  them. */
export const JAPANESE_RULE_FIELDS = [
  'region',
  'lineBreak',
  'punctuationWidth',
  'compressAdjacent',
  'trimLineStart',
  'hangingPunctuation',
  'paragraphStartBracket',
  'spaceAfterQuestion',
  'emphasis',
  'emphasisMark',
  'bookTitleMark',
  'bookTitleBrackets',
] as const satisfies readonly (keyof CjkConfig)[];
export type JapaneseRuleField = (typeof JAPANESE_RULE_FIELDS)[number];

/** A value as the review list shows it. Words the interface translates
 *  (on/off, alignments, directions, language names, setting names) stay
 *  typed; the rest is text shown as written (typefaces, samples such as
 *  第一章, 42字 × 16行). */
export type JapaneseDefaultValue =
  | { kind: 'locale'; tag: string }
  | { kind: 'text'; text: string }
  | { kind: 'switch'; on: boolean }
  | { kind: 'dimension'; value: Dimension }
  | { kind: 'align'; value: TextAlign }
  | { kind: 'writingMode'; value: WritingMode; binding: 'left' | 'right' }
  | { kind: 'binding'; value: 'left' | 'right'; auto?: boolean }
  | { kind: 'footnotes'; marker: string; position: ResolvedFootnotesConfig['markerPosition']; numbering: FootnoteNumbering }
  /** Settings the row names (by their `cjk` keys). */
  | { kind: 'cjkFields'; fields: JapaneseRuleField[] }
  /** Auto, which in a Japanese book follows the japan region. */
  | { kind: 'japanAuto' }
  /** Headings spaced by their margins (no 行取り, no 字下げ). */
  | { kind: 'headingMargins' }
  | { kind: 'none' };

export interface JapaneseDefaultChange {
  id: JapaneseDefaultId;
  from: JapaneseDefaultValue;
  to: JapaneseDefaultValue;
  /** The author set this to a value of their own (neither the engine's
   *  default nor a Japanese default of either kind of book, nor a Chinese
   *  default): unticked unless `include` names it. */
  customised: boolean;
  /** Part of the language and direction chosen (or, for hyphenation,
   *  something the language switches off by itself): always applied. */
  required: boolean;
  /** Whether `config` carries it. */
  applied: boolean;
}

export interface JapaneseDefaultsOptions {
  /** Default `'vertical'`. */
  book?: JapaneseBook;
  /** The optional rows to apply. Unset: every row the author has not
   *  customised. Required rows apply whatever it says. */
  include?: Iterable<JapaneseDefaultId>;
  /** The language of a document that names none (the interface's). */
  fallbackLocale?: string;
  /** The Fontsource subsets of a family (`japanese`, `latin`…), as the
   *  font picker lists them; undefined for a family it does not know (an
   *  uploaded face). Decides which design texts are set in a face with no
   *  kana. Without it only the engine's own design faces (Open Sans, EB
   *  Garamond) count as lacking them. */
  fontSubsets?: (family: string) => readonly string[] | undefined;
}

export interface JapaneseDefaultsResult {
  /** The document language the book gets. */
  locale: string;
  changes: JapaneseDefaultChange[];
  config: PostextConfig;
}

const IDEOGRAPHIC_SPACE = '　';
const ONE_EM: Dimension = { value: 1, unit: 'em' };
/** Line pitch of a Japanese book: bunko set 9–9.25 pt type on a 16–16.5 pt
 *  feed, about 1.75 em, which leaves three quarters of an em between lines
 *  for half-em furigana (JLReq §2.4.2, §2.5.2). */
const LINE_HEIGHT: Dimension = { value: 1.75, unit: 'em' };
/** The longest vertical line JLReq advises (§2.4.2: about 52 characters;
 *  beyond that, columns). A page whose margins leave more gets a 52-character
 *  grid in the middle of them. */
const MAX_VERTICAL_CHARS = 52;
/** 第一章 in a vertical book (`一` reads as japanese-informal in a `ja`
 *  document), 第1章 in a horizontal one (JLReq §4.1, ja-typography §9). */
const CHAPTER_TEMPLATES: Record<JapaneseBook, string> = {
  vertical: '第{1:一}章',
  horizontal: '第{1}章',
};
/** The engine's caption label in a Japanese document (図1-1　), and in
 *  any other (Figure 1.1. ): `defaultCaptionLabels`. */
const { labelNumberGap: CAPTION_GAP, labelSeparator: CAPTION_SEPARATOR } = defaultCaptionLabels('ja');
const { labelNumberGap: DEFAULT_CAPTION_GAP, labelSeparator: DEFAULT_CAPTION_SEPARATOR } = defaultCaptionLabels();
const DEFAULT_NUMBER_SEPARATOR = ' ';

const FONTS = { body: 'Noto Serif JP', headings: 'Noto Sans JP' } as const;
/** The Chinese Noto faces: a Chinese book turned Japanese takes the JP
 *  faces without asking, as it does the other script's in the Chinese
 *  list. */
const CHINESE_FONT_SETS = ['zh-Hans', 'zh-Hant', 'zh-HK'].map((l) => chineseFontsFor(l));
const CJK_BODY_FONTS = new Set<string>([FONTS.body, ...CHINESE_FONT_SETS.map((f) => f.body)]);
const CJK_HEADING_FONTS = new Set<string>([FONTS.headings, ...CHINESE_FONT_SETS.map((f) => f.headings)]);

/** Kana and kanji (and the CJK marks): what a Japanese design text prints
 *  that a Latin face has no glyphs for. */
const JAPANESE_LETTERS = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}　-〿！-｠]/u;

/** Heading 行取り and 字下げ (JLReq §4.1.3, §4.1.6; ja-typography §11):
 *  the middle heading (H2) takes three body lines, the low one (H3) two,
 *  each centred in them. A vertical book indents its headings about two
 *  characters more per level: 4, 6 and 8 body characters from the head of
 *  the line. A horizontal book sets them from the line start. */
const HEADING_LAYOUT: Record<JapaneseBook, Record<1 | 2 | 3, { lineSpan?: number; indent?: number }>> = {
  vertical: { 1: { indent: 4 }, 2: { lineSpan: 3, indent: 6 }, 3: { lineSpan: 2, indent: 8 } },
  horizontal: { 1: {}, 2: { lineSpan: 3 }, 3: { lineSpan: 2 } },
};
const HEADING_LEVELS = [1, 2, 3] as const;

type ListLevel = Required<Pick<OrderedListLevelConfig, 'level' | 'numberFormat' | 'prefix' | 'separator'>>;

/** Japanese list numbers (ja-typography §9, §12). Vertical: 一、（一）1
 *  （1）①, the kanji counted as Japanese numbers. Horizontal, as official
 *  and technical documents number them (公用文作成の考え方, 2022): 1.
 *  （1） ア （ア） ①. */
function japaneseListLevels(book: JapaneseBook): ListLevel[] {
  const informal: OrderedListNumberFormat = 'japanese-informal';
  return book === 'vertical'
    ? [
        { level: 1, numberFormat: informal, prefix: '', separator: '、' },
        { level: 2, numberFormat: informal, prefix: '（', separator: '）' },
        { level: 3, numberFormat: 'arabic', prefix: '', separator: '' },
        { level: 4, numberFormat: 'arabic', prefix: '（', separator: '）' },
        { level: 5, numberFormat: 'circled-decimal', prefix: '', separator: '' },
      ]
    : [
        { level: 1, numberFormat: 'arabic', prefix: '', separator: '.' },
        { level: 2, numberFormat: 'arabic', prefix: '（', separator: '）' },
        { level: 3, numberFormat: 'katakana', prefix: '', separator: '' },
        { level: 4, numberFormat: 'katakana', prefix: '（', separator: '）' },
        { level: 5, numberFormat: 'circled-decimal', prefix: '', separator: '' },
      ];
}

/** The note settings the other review lists write (Chinese: ① on the
 *  baseline, again on every page; Arabic: «(١)» again on every page, the
 *  note's own number on the line). In a Japanese book they stand in the
 *  way of the notes' Japanese defaults, which the engine applies to the
 *  fields the author leaves unset. */
const FOREIGN_NOTE_VALUES: Partial<Record<keyof FootnotesConfig, readonly string[]>> = {
  numberFormat: ['circled-decimal', '①'],
  markerPosition: ['inline'],
  numbering: ['page'],
  markerTemplate: ['({n})'],
  noteNumberPosition: ['inline'],
};

/** What a heading template prints for the first chapter (`第{1:一}章` →
 *  第一章 in Japanese). Spelled-out styles show as 1. */
function sampleHeading(template: string, locale: string): string {
  return template.replace(/\{(\d)(?::([^}]*))?\}/g, (_m, _level: string, style: string | undefined) => {
    const parsed = style ? parseNumberFormat(style, locale) : 'decimal';
    return parsed ? formatNumeral(1, parsed) : '1';
  });
}

/** `42字 × 16行`. */
function gridText(chars: number, lines: number): string {
  return `${chars}字 × ${lines}行`;
}

/** H2: 3行取り 6字下げ; …, for the levels that set either. */
function headingLayoutText(levels: readonly HeadingLevelConfig[]): string | null {
  const parts: string[] = [];
  for (const n of HEADING_LEVELS) {
    const l = levels.find((x) => x.level === n);
    const words: string[] = [];
    if (l?.lineSpan !== undefined && l.lineSpan > 0) words.push(`${l.lineSpan}行取り`);
    if (l?.indent !== undefined && l.indent.value !== 0) words.push(`${l.indent.value}${l.indent.unit === 'em' ? '字' : l.indent.unit}下げ`);
    if (words.length > 0) parts.push(`H${n}: ${words.join(' ')}`);
  }
  return parts.length > 0 ? parts.join('; ') : null;
}

/** Whether a design text sets the folio vertically (a fore-edge folio). */
function hasVerticalFolio(config: PostextConfig): boolean {
  let found = false;
  const visit = (v: unknown): void => {
    if (found || typeof v !== 'object' || v === null) return;
    if (Array.isArray(v)) { v.forEach(visit); return; }
    if (isDesignText(v)) {
      if (v.writingMode === 'vertical-rl' && /\{\s*pageNumber\s*\}/.test(v.content)) found = true;
      return;
    }
    Object.values(v).forEach(visit);
  };
  visit(config.header);
  visit(config.footer);
  return found;
}

interface Row {
  id: JapaneseDefaultId;
  from: JapaneseDefaultValue;
  to: JapaneseDefaultValue;
  customised: boolean;
  required?: boolean;
  apply: (c: PostextConfig) => PostextConfig;
}

/**
 * The Japanese defaults for `config`: what each setting is and what it
 * becomes, and the config with the chosen rows applied. A row appears only
 * when it changes something. Settings the author made their own are listed
 * unticked; the values of the other kind of Japanese book, and the Chinese
 * defaults, do not count as the author's (a vertical book switched to
 * horizontal takes 第1章 without asking).
 */
export function japaneseDefaults(config: PostextConfig, options: JapaneseDefaultsOptions = {}): JapaneseDefaultsResult {
  const book = options.book ?? 'vertical';
  const other: JapaneseBook = book === 'vertical' ? 'horizontal' : 'vertical';
  const fromLocale = config.locale ?? config.bodyText?.hyphenation?.locale ?? options.fallbackLocale ?? 'en';
  // A document already in a Japanese tag (`ja-JP`) keeps it.
  const locale = isJapaneseLanguage(config.locale) ? config.locale! : 'ja';
  const D = DEFAULT_BODY_TEXT_CONFIG;
  const body = config.bodyText;
  const fromBody = resolveBodyTextConfig(body, fromLocale);
  const rows: Row[] = [];

  // Document language.
  if (config.locale !== locale) {
    rows.push({
      id: 'locale',
      from: { kind: 'locale', tag: fromLocale },
      to: { kind: 'locale', tag: locale },
      customised: false,
      required: true,
      apply: (c) => ({ ...c, locale }),
    });
  }

  // Direction and binding: vertical lines bound on the right, horizontal
  // ones on the left (JLReq §2.3). The writing mode row names the binding
  // each side ends with; it is filled in once the rows are applied.
  const fromMode = resolveLayoutConfig(config.layout).writingMode;
  const toMode: WritingMode = book === 'vertical' ? 'vertical-rl' : 'horizontal-tb';
  const fromDirection = documentDirection(config.direction, fromLocale);
  const toDirection = documentDirection(config.direction, locale);
  const fromBinding = resolvePageConfig(config.page, fromLocale, fromMode, fromDirection).binding;
  const modeTo: Extract<JapaneseDefaultValue, { kind: 'writingMode' }> = { kind: 'writingMode', value: toMode, binding: 'left' };
  if (toMode !== fromMode) {
    rows.push({
      id: 'writingMode',
      from: { kind: 'writingMode', value: fromMode, binding: fromBinding },
      to: modeTo,
      customised: false,
      required: true,
      apply: (c) => set(c, 'layout', toMode === 'vertical-rl'
        ? { ...c.layout, writingMode: 'vertical-rl' }
        : without(c.layout, 'writingMode')),
    });
  }
  const rawBinding = config.page?.binding;
  const autoBinding = toMode === 'vertical-rl' || toDirection === 'rtl' ? 'right' : 'left';
  if ((rawBinding === 'left' || rawBinding === 'right') && rawBinding !== autoBinding) {
    rows.push({
      id: 'binding',
      from: { kind: 'binding', value: rawBinding },
      to: { kind: 'binding', value: autoBinding, auto: true },
      customised: true,
      apply: (c) => set(c, 'page', without(c.page, 'binding')),
    });
  }

  // Typefaces: a mincho for the text, a gothic for headings (JLReq §4.1.3).
  if (fromBody.fontFamily !== FONTS.body) {
    const raw = body?.fontFamily;
    rows.push({
      id: 'bodyFont',
      from: { kind: 'text', text: fromBody.fontFamily },
      to: { kind: 'text', text: FONTS.body },
      customised: raw !== undefined && raw !== D.fontFamily && !CJK_BODY_FONTS.has(raw),
      apply: (c) => ({ ...c, bodyText: { ...c.bodyText, fontFamily: FONTS.body } }),
    });
  }
  // The headings' typeface, and the ones levels and named styles set for
  // themselves: a Chinese Noto face becomes the JP one of its kind, any
  // other face goes and the heading follows the headings' typeface.
  const fromHeadingFont = config.headings?.fontFamily ?? DEFAULT_HEADINGS_CONFIG.fontFamily;
  const headingFace = (f: string): string | undefined =>
    f === FONTS.headings || f === FONTS.body ? f
      : CJK_BODY_FONTS.has(f) ? FONTS.body
        : CJK_HEADING_FONTS.has(f) ? FONTS.headings
          : undefined;
  const moves = (item: { fontFamily?: string }) => item.fontFamily !== undefined && headingFace(item.fontFamily) !== item.fontFamily;
  const levelFaces = (config.headings?.levels ?? []).filter(moves);
  const styleFaces = (config.headingStyles ?? []).filter(moves);
  if (fromHeadingFont !== FONTS.headings || levelFaces.length > 0 || styleFaces.length > 0) {
    const own = (f: string | undefined) => f !== undefined && f !== DEFAULT_HEADINGS_CONFIG.fontFamily
      && !CJK_BODY_FONTS.has(f) && !CJK_HEADING_FONTS.has(f);
    const retarget = <T extends { fontFamily?: string }>(item: T): T => {
      if (!moves(item)) return item;
      const face = headingFace(item.fontFamily!);
      if (face !== undefined) return { ...item, fontFamily: face };
      const next = { ...item };
      delete next.fontFamily;
      return next;
    };
    rows.push({
      id: 'headingFont',
      from: { kind: 'text', text: headingFacesText(fromHeadingFont, levelFaces, styleFaces) },
      to: { kind: 'text', text: FONTS.headings },
      customised: own(config.headings?.fontFamily) || levelFaces.some((l) => own(l.fontFamily)) || styleFaces.some((st) => own(st.fontFamily)),
      apply: (c) => {
        const headings = { ...c.headings, fontFamily: FONTS.headings };
        if (c.headings?.levels?.some(moves)) headings.levels = c.headings.levels.map(retarget);
        const next: PostextConfig = { ...c, headings };
        if (c.headingStyles?.some(moves)) next.headingStyles = c.headingStyles.map(retarget);
        return next;
      },
    });
  }

  // Page numbers in Han numerals when the folio is set vertically (below):
  // the digit placeholders then print kanji.
  const verticalFolio = hasVerticalFolio(config);
  const toFolioFormat: PageNumberFormat = verticalFolio ? 'cjk-decimal' : 'decimal';

  // Design texts (running heads, folios, opener and heading designs) set in
  // a face with no kana, whose text is Japanese: the PDF prints such
  // characters as empty boxes. They take the headings' face. The built-in
  // header and footer (Open Sans) are written out to do so. A face that
  // cannot set the text is a fault, never the author's choice: the row
  // comes ticked.
  const lacksJapanese = (family: string): boolean => {
    // The Chinese Noto faces carry kana too (GB 18030 asks for them).
    if (CJK_BODY_FONTS.has(family) || CJK_HEADING_FONTS.has(family)) return false;
    const subsets = options.fontSubsets?.(family);
    return subsets ? !subsets.includes('japanese') : ENGINE_DESIGN_FACES.has(family);
  };
  const movedFaces = new Set<string>();
  const moveDesignText = (el: DesignTextElement): DesignTextElement => {
    const face = el.fontFamily ?? DEFAULT_TEXT_ELEMENT.fontFamily;
    if (!lacksJapanese(face) || !designTextNeedsScript(el.content, JAPANESE_LETTERS, verticalFolio)) return el;
    movedFaces.add(face);
    const next: DesignTextElement = { ...el, fontFamily: FONTS.headings };
    if (el.dropCap?.fontFamily !== undefined && lacksJapanese(el.dropCap.fontFamily)) next.dropCap = { ...el.dropCap, fontFamily: FONTS.headings };
    return next;
  };
  const designed = mapDesignTexts(
    {
      ...config,
      header: config.header ?? (DEFAULT_HEADER_SLOT as PostextConfig['header']),
      footer: config.footer ?? (DEFAULT_FOOTER_SLOT as PostextConfig['footer']),
    },
    moveDesignText,
  );
  if (movedFaces.size > 0) {
    rows.push({
      id: 'designFonts',
      from: { kind: 'text', text: [...movedFaces].sort().join(', ') },
      to: { kind: 'text', text: FONTS.headings },
      customised: false,
      apply: (c) => {
        const out: PostextConfig = { ...mapDesignTexts(c, moveDesignText) };
        // The built-in slots, written out only when they move.
        if (c.header === undefined && designed.header !== DEFAULT_HEADER_SLOT) out.header = designed.header;
        if (c.footer === undefined && designed.footer !== DEFAULT_FOOTER_SLOT) out.footer = designed.footer;
        return out;
      },
    });
  }

  // Leading: 1.75 em, room in the line gap for furigana.
  if (!dimensionsEqual(fromBody.lineHeight, LINE_HEIGHT)) {
    const raw = body?.lineHeight;
    rows.push({
      id: 'lineHeight',
      from: { kind: 'dimension', value: fromBody.lineHeight },
      to: { kind: 'dimension', value: { ...LINE_HEIGHT } },
      customised: raw !== undefined && !dimensionsEqual(raw, D.lineHeight),
      apply: (c) => ({ ...c, bodyText: { ...c.bodyText, lineHeight: { ...LINE_HEIGHT } } }),
    });
  }

  // The character grid of a vertical book (kihon hanmen, JLReq §2.2.4): the
  // type area in characters per line and lines per page of the body size
  // and leading the book ends with, as many as the page and its margins
  // hold (so the page size stays as it is), at most 52 characters a line.
  // A book with a grid of its own keeps it.
  const gridTo: Extract<JapaneseDefaultValue, { kind: 'text' }> = { kind: 'text', text: '' };
  const withGrid = (c: PostextConfig): PostextConfig => {
    const probe: PostextConfig = { ...c, cjk: { ...c.cjk, grid: { ...c.cjk?.grid, enabled: true } } };
    delete probe.cjk!.grid!.charsPerLine;
    delete probe.cjk!.grid!.linesPerPage;
    const g = cjkGridGeometry(probe);
    if (!g) return probe;
    const charsPerLine = Math.min(g.charsPerLine, MAX_VERTICAL_CHARS);
    return { ...c, cjk: { ...c.cjk, grid: { ...c.cjk?.grid, enabled: true, charsPerLine, linesPerPage: g.linesPerPage } } };
  };
  if (book === 'vertical' && config.cjk?.grid?.enabled !== true) {
    rows.push({
      id: 'grid',
      from: { kind: 'switch', on: false },
      to: gridTo,
      customised: false,
      apply: withGrid,
    });
  }

  // Paragraphs: a one-em indent (JLReq §3.5: 1字下げ, in both directions),
  // also after headings, no space between paragraphs, justified (§3.8.1:
  // Japanese has no ragged setting).
  if (!dimensionsEqual(fromBody.firstLineIndent, ONE_EM)) {
    const raw = body?.firstLineIndent;
    rows.push({
      id: 'firstLineIndent',
      from: { kind: 'dimension', value: fromBody.firstLineIndent },
      to: { kind: 'dimension', value: { ...ONE_EM } },
      // Two ems is the Chinese default, not the author's own.
      customised: raw !== undefined && !dimensionsEqual(raw, D.firstLineIndent) && !dimensionsEqual(raw, { value: 2, unit: 'em' }),
      apply: (c) => ({ ...c, bodyText: { ...c.bodyText, firstLineIndent: { ...ONE_EM } } }),
    });
  }
  const flag = (id: 'indentAfterHeading' | 'paragraphSpacing', target: boolean) => {
    if (fromBody[id] === target) return;
    const raw = body?.[id];
    rows.push({
      id,
      from: { kind: 'switch', on: fromBody[id] },
      to: { kind: 'switch', on: target },
      customised: raw !== undefined && raw !== D[id],
      apply: (c) => (target === D[id] ? set(c, 'bodyText', without(c.bodyText, id)) : { ...c, bodyText: { ...c.bodyText, [id]: target } }),
    });
  };
  flag('indentAfterHeading', true);
  flag('paragraphSpacing', false);
  if (fromBody.textAlign !== 'justify') {
    const raw = body?.textAlign;
    rows.push({
      id: 'textAlign',
      from: { kind: 'align', value: fromBody.textAlign },
      to: { kind: 'align', value: 'justify' },
      customised: raw !== undefined && raw !== D.textAlign,
      apply: (c) => ({ ...c, bodyText: { ...c.bodyText, textAlign: 'justify' } }),
    });
  }

  // Hyphenation: Japanese is not hyphenated. Off by itself once the
  // language is Japanese, unless the author turned it on for a Latin
  // language they named (the rōmaji or English words in the text).
  if (fromBody.hyphenation.enabled) {
    const explicit = body?.hyphenation?.enabled === true;
    const named = body?.hyphenation?.locale;
    const own = explicit && typeof named === 'string' && named.trim() !== '' && !isCjkLanguage(named);
    rows.push({
      id: 'hyphenation',
      from: { kind: 'switch', on: true },
      to: { kind: 'switch', on: false },
      customised: own,
      required: !own,
      apply: (c) => {
        if (c.bodyText?.hyphenation?.enabled !== true) return c;
        const hyphenation = without(c.bodyText.hyphenation, 'enabled');
        return hyphenation ? { ...c, bodyText: { ...c.bodyText, hyphenation } } : set(c, 'bodyText', without(c.bodyText, 'hyphenation'));
      },
    });
  }

  // East Asian typography back to Auto, which in a Japanese book is the
  // japan region: JLReq line breaking (ja-very-strict), full-width marks
  // with pair compression, burasagari of 、。, the space after ？！, the
  // bracket opening a paragraph in its indent, sesame emphasis marks over
  // the text and 『』 titles. Settings that give the same as Auto are left
  // alone. A region set to China is a Chinese book's: the row comes
  // ticked; any other setting is the author's own.
  const cjk = config.cjk;
  const ruleFields = JAPANESE_RULE_FIELDS.filter((f) => {
    const v = cjk?.[f];
    if (v === undefined || v === 'auto') return false;
    if (f === 'region') return v !== 'japan';
    if (f === 'emphasisMark') {
      const m = v as NonNullable<CjkConfig['emphasisMark']>;
      return [m.style, m.fill, m.position].some((x) => x !== undefined && x !== 'auto');
    }
    if (f === 'bookTitleBrackets') return Array.isArray(v) && v.length > 0;
    return true;
  });
  if (ruleFields.length > 0) {
    const chineseRegion = cjk?.region === 'mainland' || cjk?.region === 'taiwan' || cjk?.region === 'hongkong';
    rows.push({
      id: 'cjkRules',
      from: { kind: 'cjkFields', fields: ruleFields },
      to: { kind: 'japanAuto' },
      customised: !chineseRegion,
      apply: (c) => {
        const next: CjkConfig = { ...c.cjk };
        for (const f of ruleFields) delete next[f];
        return set(c, 'cjk', Object.keys(next).length > 0 ? next : undefined);
      },
    });
  }

  // Figure and table names: 図 and 表, numbered 1-1.
  const fromTypes = config.resourceTypes ?? defaultResourceTypes(fromLocale);
  const targetTypes = defaultResourceTypes(locale);
  const ownTypes = !builtInTypes(fromTypes, [fromLocale, locale]);
  const proposedTypes = ownTypes ? mergeBuiltInTypes(fromTypes, targetTypes) : targetTypes;
  if (canonicalJson(proposedTypes) !== canonicalJson(fromTypes)) {
    rows.push({
      id: 'resourceTypes',
      from: { kind: 'text', text: typeNames(fromTypes) },
      to: { kind: 'text', text: typeNames(proposedTypes, '、') },
      customised: ownTypes,
      apply: (c) => ({ ...c, resourceTypes: proposedTypes }),
    });
  }

  // Caption label: 図1-1　タイトル (JLReq §4.3: an ideographic space
  // between the number and the caption) is what the engine sets in a `ja`
  // document by itself (#464). A gap or separator the config writes
  // otherwise stands in its way: the row takes it out.
  const rawGap = config.captionStyle?.labelNumberGap;
  const rawSep = config.captionStyle?.labelSeparator;
  const strayGap = rawGap !== undefined && rawGap !== CAPTION_GAP;
  const straySep = rawSep !== undefined && rawSep !== CAPTION_SEPARATOR;
  if (strayGap || straySep) {
    const fromLabels = defaultCaptionLabels(fromLocale);
    const sample = (t: ResourceType | undefined, gap: string, sep: string) =>
      t ? `${t.captionPrefix}${gap}${sampleNumber(t.numberingTemplate)}${sep}…` : `1${sep}…`;
    rows.push({
      id: 'captionLabel',
      from: { kind: 'text', text: sample(figureOf(fromTypes), rawGap ?? fromLabels.labelNumberGap, rawSep ?? fromLabels.labelSeparator) },
      to: { kind: 'text', text: sample(figureOf(proposedTypes), CAPTION_GAP, CAPTION_SEPARATOR) },
      customised: (strayGap && rawGap !== DEFAULT_CAPTION_GAP) || (straySep && rawSep !== DEFAULT_CAPTION_SEPARATOR),
      apply: (c) => {
        let next = c.captionStyle;
        if (strayGap) next = without(next, 'labelNumberGap');
        if (straySep) next = without(next, 'labelSeparator');
        return set(c, 'captionStyle', next);
      },
    });
  }

  // Chapter numbers: 第一章 (vertical) or 第1章 (horizontal), the title
  // after an ideographic space.
  const chapterTemplate = CHAPTER_TEMPLATES[book];
  const level1 = config.headings?.levels?.find((l) => l.level === 1);
  const rawTemplate = level1?.numberingTemplate;
  const rawNumberSep = level1?.numberSeparator;
  const fromTemplate = rawTemplate ?? '';
  if (fromTemplate !== chapterTemplate || (rawNumberSep ?? DEFAULT_NUMBER_SEPARATOR) !== IDEOGRAPHIC_SPACE) {
    rows.push({
      id: 'chapterNumbering',
      from: fromTemplate === '' ? { kind: 'none' } : { kind: 'text', text: sampleHeading(fromTemplate, fromLocale) },
      to: { kind: 'text', text: sampleHeading(chapterTemplate, locale) },
      customised: (rawTemplate !== undefined && rawTemplate !== '' && rawTemplate !== chapterTemplate && rawTemplate !== CHAPTER_TEMPLATES[other])
        || (rawNumberSep !== undefined && rawNumberSep !== DEFAULT_NUMBER_SEPARATOR && rawNumberSep !== IDEOGRAPHIC_SPACE),
      apply: (c) => {
        const levels = c.headings?.levels ?? [];
        const entry: HeadingLevelConfig = {
          ...levels.find((l) => l.level === 1),
          level: 1,
          numberingTemplate: chapterTemplate,
          numberSeparator: IDEOGRAPHIC_SPACE,
        };
        const next = levels.some((l) => l.level === 1)
          ? levels.map((l) => (l.level === 1 ? entry : l))
          : [entry, ...levels];
        return { ...c, headings: { ...c.headings, levels: next } };
      },
    });
  }

  // Headings: 行取り and 字下げ per level (H1–H3). A value of the other
  // kind of book is replaced; one of the author's own stays unticked.
  const fromLevels = config.headings?.levels ?? [];
  const headingTarget = HEADING_LAYOUT[book];
  const headingOther = HEADING_LAYOUT[other];
  const lineSpanOf = (n: 1 | 2 | 3) => fromLevels.find((l) => l.level === n)?.lineSpan;
  const indentOf = (n: 1 | 2 | 3) => fromLevels.find((l) => l.level === n)?.indent;
  const indentIs = (d: Dimension | undefined, ems: number | undefined) =>
    (d === undefined || d.value === 0) ? ems === undefined : ems !== undefined && dimensionsEqual(d, { value: ems, unit: 'em' });
  const lineSpanIs = (v: number | undefined, want: number | undefined) => ((v ?? 0) === 0 ? want === undefined : v === want);
  const headingsDiffer = HEADING_LEVELS.some((n) =>
    !lineSpanIs(lineSpanOf(n), headingTarget[n].lineSpan) || !indentIs(indentOf(n), headingTarget[n].indent));
  if (headingsDiffer) {
    const ownHeading = HEADING_LEVELS.some((n) => {
      const ls = lineSpanOf(n);
      const ind = indentOf(n);
      const lsKnown = lineSpanIs(ls, headingTarget[n].lineSpan) || lineSpanIs(ls, headingOther[n].lineSpan) || lineSpanIs(ls, undefined);
      const indKnown = indentIs(ind, headingTarget[n].indent) || indentIs(ind, headingOther[n].indent) || indentIs(ind, undefined);
      return !lsKnown || !indKnown;
    });
    const target: HeadingLevelConfig[] = HEADING_LEVELS.map((n) => {
      const t = headingTarget[n];
      return {
        level: n,
        ...(t.lineSpan !== undefined ? { lineSpan: t.lineSpan } : {}),
        ...(t.indent !== undefined ? { indent: { value: t.indent, unit: 'em' as const } } : {}),
      };
    });
    const fromText = headingLayoutText(fromLevels);
    rows.push({
      id: 'headingLayout',
      from: fromText === null ? { kind: 'headingMargins' } : { kind: 'text', text: fromText },
      to: { kind: 'text', text: headingLayoutText(target) ?? '' },
      customised: ownHeading,
      apply: (c) => {
        const levels = c.headings?.levels ?? [];
        const next = levels.map((l) => {
          if (l.level !== 1 && l.level !== 2 && l.level !== 3) return l;
          const t = headingTarget[l.level];
          const entry: HeadingLevelConfig = { ...l };
          delete entry.lineSpan;
          delete entry.indent;
          if (t.lineSpan !== undefined) entry.lineSpan = t.lineSpan;
          if (t.indent !== undefined) entry.indent = { value: t.indent, unit: 'em' };
          return entry;
        });
        for (const t of target) {
          if (!next.some((l) => l.level === t.level) && Object.keys(t).length > 1) next.push(t);
        }
        next.sort((a, b) => a.level - b.level);
        return { ...c, headings: { ...c.headings, levels: next } };
      },
    });
  }

  // Ordered lists: 一、（一）1（1）① (vertical) or 1.（1）ア（ア）①
  // (horizontal).
  const fromLists = resolveOrderedListsConfig(config.orderedLists, fromBody, fromLocale).levels;
  const targetLists = japaneseListLevels(book);
  if (listSignature(fromLists.slice(0, targetLists.length)) !== listSignature(targetLists)) {
    const known = [
      listSignature(resolveOrderedListsConfig(undefined, fromBody, fromLocale).levels.slice(0, targetLists.length)),
      listSignature(japaneseListLevels(other)),
      // The Chinese hierarchy (GB/T 9704), either script.
      ...(['simp-chinese-informal', 'trad-chinese-informal'] as const).map((informal) => listSignature([
        { numberFormat: informal, prefix: '', separator: '、' },
        { numberFormat: informal, prefix: '（', separator: '）' },
        { numberFormat: 'arabic', prefix: '', separator: '.' },
        { numberFormat: 'arabic', prefix: '（', separator: '）' },
        { numberFormat: 'circled-decimal', prefix: '', separator: '' },
      ])),
    ];
    rows.push({
      id: 'listNumbers',
      from: { kind: 'text', text: listSample(fromLists.slice(0, targetLists.length), fromLocale) },
      to: { kind: 'text', text: listSample(targetLists, locale) },
      customised: !known.includes(listSignature(fromLists.slice(0, targetLists.length))),
      apply: (c) => {
        const levels = c.orderedLists?.levels ?? [];
        const merged = targetLists.map((t) => ({ ...levels.find((l) => l.level === t.level), ...t }));
        const others = levels.filter((l) => !targetLists.some((t) => t.level === l.level));
        return { ...c, orderedLists: { ...c.orderedLists, levels: [...merged, ...others] } };
      },
    });
  }

  // Notes: the settings the Chinese or Arabic list wrote go, so the notes
  // follow the Japanese defaults the engine gives a `ja` book.
  const notes = config.footnotes;
  const foreignNotes = (Object.keys(FOREIGN_NOTE_VALUES) as (keyof FootnotesConfig)[])
    .filter((k) => typeof notes?.[k] === 'string' && FOREIGN_NOTE_VALUES[k]!.includes(notes[k] as string));
  if (foreignNotes.length > 0) {
    const f = resolveFootnotesConfig(notes, fromLocale);
    rows.push({
      id: 'footnotes',
      from: { kind: 'footnotes', marker: (f.markerTemplate ?? '{n}').replace('{n}', formatNumeral(1, f.numberFormat)), position: f.markerPosition, numbering: f.numbering },
      to: { kind: 'japanAuto' },
      customised: false,
      apply: (c) => {
        let next: FootnotesConfig | undefined = c.footnotes;
        for (const k of foreignNotes) next = without(next, k);
        return set(c, 'footnotes', next);
      },
    });
  }

  // Folio numerals (JLReq §2.6.1): Arabic in a folio set horizontally, as
  // nearly every Japanese book sets it, vertical ones included; kanji
  // (一〇五, positional) when the design sets the folio vertically down the
  // fore-edge. A format of the author's own (Roman front matter) stays.
  const rawFolio = config.page?.pageNumbering?.format;
  const fromFolio = resolvePageConfig(config.page, fromLocale).pageNumbering.format;
  const folioKnown = (v: string | undefined) => v === undefined || v === 'decimal' || v === 'cjk-decimal';
  if (fromFolio !== toFolioFormat) {
    rows.push({
      id: 'folio',
      from: { kind: 'text', text: formatNumeral(105, fromFolio) },
      to: { kind: 'text', text: formatNumeral(105, toFolioFormat) },
      customised: !folioKnown(rawFolio),
      apply: (c) => {
        if (toFolioFormat === 'decimal') {
          const pageNumbering = without(c.page?.pageNumbering, 'format');
          return set(c, 'page', pageNumbering ? { ...c.page, pageNumbering } : without(c.page, 'pageNumbering'));
        }
        return { ...c, page: { ...c.page, pageNumbering: { ...c.page?.pageNumbering, format: toFolioFormat } } };
      },
    });
  }

  // TODO(J7 #422): once `cjk.ruby` carries `overhang`, `align` and
  // `smallKana`, nothing is to be written here either: their Auto values
  // follow the japan region. A row would only take back a Chinese ruby
  // `position: 'right'` (zhuyin) left in the config.

  const include = options.include ? new Set(options.include) : null;
  let next = config;
  const changes: JapaneseDefaultChange[] = rows.map((row) => {
    const required = row.required ?? false;
    const applied = required || (include ? include.has(row.id) : !row.customised);
    if (applied) next = row.apply(next);
    return { id: row.id, from: row.from, to: row.to, customised: row.customised, required, applied };
  });
  // What the rows end with: the binding, and the grid the book's page,
  // margins, size and leading hold.
  modeTo.binding = resolvePageConfig(next.page, locale, toMode, toDirection).binding;
  const grid = (next.cjk?.grid?.enabled ? next : withGrid(next)).cjk?.grid;
  gridTo.text = gridText(grid?.charsPerLine ?? 0, grid?.linesPerPage ?? 0);
  return { locale, changes, config: next };
}

/**
 * Takes the action back: every setting it wrote returns to what it was
 * before, unless the author has changed it again since (see
 * `undoDefaults`).
 */
export const undoJapaneseDefaults = undoDefaults;

const memory = createDefaultsMemory();
export const rememberJapaneseDefaults = memory.remember;
export const forgetJapaneseDefaults = memory.forget;
export const recallJapaneseDefaults = memory.recall;
export const takeJapaneseDefaultsFocus = memory.takeFocus;
export const keepJapaneseDefaultsFocus = memory.keepFocus;
