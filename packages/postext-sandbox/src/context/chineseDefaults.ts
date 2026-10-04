// "Apply Chinese defaults" (Design › Writing system): the dozen settings a
// Chinese book changes together, worked out as a list the author reviews
// before anything moves. Pure: the section shows `changes`, ticks and
// unticks rows, and dispatches `config` as one step; `undoChineseDefaults`
// takes that step back.

import type {
  Dimension,
  FootnoteNumbering,
  FootnotesConfig,
  TextAlign,
  HeadingLevelConfig,
  OrderedListLevelConfig,
  OrderedListNumberFormat,
  PostextConfig,
  ResourceType,
  WritingMode,
} from 'postext';
import {
  DEFAULT_BODY_TEXT_CONFIG,
  DEFAULT_HEADINGS_CONFIG,
  chineseScriptOf,
  cjkRegionOf,
  defaultResourceTypes,
  dimensionsEqual,
  formatNumeral,
  isCjkLanguage,
  parseNumberFormat,
  resolveBodyTextConfig,
  resolveFootnotesConfig,
  resolveLayoutConfig,
  resolveOrderedListsConfig,
  resolvePageConfig,
} from 'postext';
import { documentDirection } from './documentDirection';
import {
  builtInTypes,
  canonicalJson,
  createDefaultsMemory,
  figureOf,
  headingFacesText,
  listSample,
  listSignature,
  mergeBuiltInTypes,
  sampleNumber,
  set,
  typeNames,
  undoDefaults,
  without,
  type DefaultsFocus,
  type DefaultsMemory,
  type DefaultsStatus,
  type DefaultsUndo,
} from './defaultsReview';

/** One row of the review list, in the order the list shows them. */
export type ChineseDefaultId =
  | 'locale'
  | 'writingMode'
  | 'binding'
  | 'bodyFont'
  | 'headingFont'
  | 'firstLineIndent'
  | 'indentAfterHeading'
  | 'paragraphSpacing'
  | 'textAlign'
  | 'hyphenation'
  | 'resourceTypes'
  | 'captionLabel'
  | 'chapterNumbering'
  | 'listNumbers'
  | 'footnotes';

/** A value as the review list shows it. Words the interface translates
 *  (on/off, alignments, directions, language names) stay typed; the rest
 *  is text shown as written (typefaces, samples such as 第一章). */
export type ChineseDefaultValue =
  | { kind: 'locale'; tag: string }
  | { kind: 'text'; text: string }
  | { kind: 'switch'; on: boolean }
  | { kind: 'dimension'; value: Dimension }
  | { kind: 'align'; value: TextAlign }
  | { kind: 'writingMode'; value: WritingMode; binding: 'left' | 'right' }
  | { kind: 'binding'; value: 'left' | 'right'; auto?: boolean }
  | { kind: 'footnotes'; marker: string; position: 'superscript' | 'inline'; numbering: FootnoteNumbering }
  | { kind: 'none' };

export interface ChineseDefaultChange {
  id: ChineseDefaultId;
  from: ChineseDefaultValue;
  to: ChineseDefaultValue;
  /** The author set this to a value of their own (neither the engine's
   *  default nor a Chinese default of either script): unticked unless
   *  `include` names it. */
  customised: boolean;
  /** Part of the language and direction chosen (or, for hyphenation,
   *  something the language switches off by itself): always applied. */
  required: boolean;
  /** Whether `config` carries it. */
  applied: boolean;
}

export interface ChineseDefaultsOptions {
  /** `zh-Hans` or `zh-Hant` (any Chinese tag: its script is what counts).
   *  A document already in a Chinese tag of that script keeps its tag
   *  (`zh-TW`, `zh-Hant-HK`). */
  locale: string;
  /** Vertical lines, bound on the right (`true`) or horizontal (`false`);
   *  unset keeps the writing mode the book has. */
  vertical?: boolean;
  /** The optional rows to apply. Unset: every row the author has not
   *  customised. Required rows apply whatever it says. */
  include?: Iterable<ChineseDefaultId>;
  /** The language of a document that names none (the interface's). */
  fallbackLocale?: string;
}

export interface ChineseDefaultsResult {
  /** The document language the book gets. */
  locale: string;
  /** Only the rows that change something, in list order. */
  changes: ChineseDefaultChange[];
  config: PostextConfig;
}

const IDEOGRAPHIC_SPACE = '　';
const TWO_EM: Dimension = { value: 2, unit: 'em' };
const CHAPTER_TEMPLATE = '第{1:一}章';
const CAPTION_GAP = '';
const CAPTION_SEPARATOR = IDEOGRAPHIC_SPACE;
const DEFAULT_CAPTION_GAP = ' ';
const DEFAULT_CAPTION_SEPARATOR = '. ';
const DEFAULT_NUMBER_SEPARATOR = ' ';
/** Notes as a mainland book sets them: ① on the baseline, from ① on
 *  every page. */
const CHINESE_FOOTNOTES: Pick<FootnotesConfig, 'numberFormat' | 'markerPosition' | 'numbering'> = {
  numberFormat: 'circled-decimal',
  markerPosition: 'inline',
  numbering: 'page',
};

const FONTS = {
  hans: { body: 'Noto Serif SC', headings: 'Noto Sans SC' },
  hant: { body: 'Noto Serif TC', headings: 'Noto Sans TC' },
  hk: { body: 'Noto Serif HK', headings: 'Noto Sans HK' },
} as const;
const CHINESE_BODY_FONTS = new Set<string>(Object.values(FONTS).map((f) => f.body));
const CHINESE_HEADING_FONTS = new Set<string>(Object.values(FONTS).map((f) => f.headings));

/** The Noto faces (on Google Fonts and Fontsource) a Chinese document is
 *  set in: Simplified (SC), Traditional (TC), or Hong Kong's (HK). */
export function chineseFontsFor(locale: string): { body: string; headings: string } {
  if (cjkRegionOf(locale) === 'hongkong') return { ...FONTS.hk };
  return chineseScriptOf(locale) === 'Hant' ? { ...FONTS.hant } : { ...FONTS.hans };
}

/** The GB/T 9704 hierarchy of list numbers: 一、 （一） 1. （1） ①. */
function chineseListLevels(locale: string): Required<Pick<OrderedListLevelConfig, 'level' | 'numberFormat' | 'prefix' | 'separator'>>[] {
  const informal: OrderedListNumberFormat = chineseScriptOf(locale) === 'Hant' ? 'trad-chinese-informal' : 'simp-chinese-informal';
  return [
    { level: 1, numberFormat: informal, prefix: '', separator: '、' },
    { level: 2, numberFormat: informal, prefix: '（', separator: '）' },
    { level: 3, numberFormat: 'arabic', prefix: '', separator: '.' },
    { level: 4, numberFormat: 'arabic', prefix: '（', separator: '）' },
    { level: 5, numberFormat: 'circled-decimal', prefix: '', separator: '' },
  ];
}

/** What a heading template prints for the first chapter (`第{1:一}章` →
 *  第一章, `Chapter {1:I}` → Chapter I). Spelled-out styles show as 1. */
function sampleHeading(template: string, locale: string): string {
  return template.replace(/\{(\d)(?::([^}]*))?\}/g, (_m, _level: string, style: string | undefined) => {
    const parsed = style ? parseNumberFormat(style, locale) : 'decimal';
    return parsed ? formatNumeral(1, parsed) : '1';
  });
}

interface Row {
  id: ChineseDefaultId;
  from: ChineseDefaultValue;
  to: ChineseDefaultValue;
  customised: boolean;
  required?: boolean;
  apply: (c: PostextConfig) => PostextConfig;
}

/**
 * The Chinese defaults for `config`: what each setting is and what it
 * becomes, and the config with the chosen rows applied. A row appears only
 * when it changes something. Settings the author made their own are listed
 * unticked; the Chinese values of either script do not count as the
 * author's (a Simplified book switched to Traditional takes 圖 and 繁
 * numerals without asking).
 */
export function chineseDefaults(config: PostextConfig, options: ChineseDefaultsOptions): ChineseDefaultsResult {
  const fromLocale = config.locale ?? config.bodyText?.hyphenation?.locale ?? options.fallbackLocale ?? 'en';
  const sameScript = config.locale !== undefined && chineseScriptOf(config.locale) !== undefined
    && chineseScriptOf(config.locale) === chineseScriptOf(options.locale);
  const locale = sameScript ? config.locale! : options.locale;
  const fonts = chineseFontsFor(locale);
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

  // Direction and binding. The writing mode row names the binding each
  // side ends with; it is filled in once the rows are applied.
  const fromMode = resolveLayoutConfig(config.layout).writingMode;
  const toMode: WritingMode = options.vertical === undefined ? fromMode : options.vertical ? 'vertical-rl' : 'horizontal-tb';
  // A book set right to left (an Arabic one turned Chinese keeps its
  // `direction` only when the author wrote one) is bound on the right too.
  const fromDirection = documentDirection(config.direction, fromLocale);
  const toDirection = documentDirection(config.direction, locale);
  const fromBinding = resolvePageConfig(config.page, fromLocale, fromMode, fromDirection).binding;
  const modeTo: Extract<ChineseDefaultValue, { kind: 'writingMode' }> = { kind: 'writingMode', value: toMode, binding: 'left' };
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

  // Typefaces.
  if (fromBody.fontFamily !== fonts.body) {
    const raw = body?.fontFamily;
    rows.push({
      id: 'bodyFont',
      from: { kind: 'text', text: fromBody.fontFamily },
      to: { kind: 'text', text: fonts.body },
      customised: raw !== undefined && raw !== D.fontFamily && !CHINESE_BODY_FONTS.has(raw),
      apply: (c) => ({ ...c, bodyText: { ...c.bodyText, fontFamily: fonts.body } }),
    });
  }
  // The headings' typeface, and the ones levels and named styles set for
  // themselves (they win over it): a Chinese face of the other script
  // becomes this script's, any other face goes and the heading follows the
  // headings' typeface.
  const fromHeadingFont = config.headings?.fontFamily ?? DEFAULT_HEADINGS_CONFIG.fontFamily;
  const headingFace = (f: string): string | undefined =>
    f === fonts.headings || f === fonts.body ? f
      : CHINESE_BODY_FONTS.has(f) ? fonts.body
        : CHINESE_HEADING_FONTS.has(f) ? fonts.headings
          : undefined;
  const moves = (item: { fontFamily?: string }) => item.fontFamily !== undefined && headingFace(item.fontFamily) !== item.fontFamily;
  const levelFaces = (config.headings?.levels ?? []).filter(moves);
  const styleFaces = (config.headingStyles ?? []).filter(moves);
  if (fromHeadingFont !== fonts.headings || levelFaces.length > 0 || styleFaces.length > 0) {
    const own = (f: string | undefined) => f !== undefined && f !== DEFAULT_HEADINGS_CONFIG.fontFamily
      && !CHINESE_BODY_FONTS.has(f) && !CHINESE_HEADING_FONTS.has(f);
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
      to: { kind: 'text', text: fonts.headings },
      customised: own(config.headings?.fontFamily) || levelFaces.some((l) => own(l.fontFamily)) || styleFaces.some((st) => own(st.fontFamily)),
      apply: (c) => {
        const headings = { ...c.headings, fontFamily: fonts.headings };
        if (c.headings?.levels?.some(moves)) headings.levels = c.headings.levels.map(retarget);
        const next: PostextConfig = { ...c, headings };
        if (c.headingStyles?.some(moves)) next.headingStyles = c.headingStyles.map(retarget);
        return next;
      },
    });
  }

  // Paragraphs: a two-em indent, also after headings, no space between
  // paragraphs, justified.
  if (!dimensionsEqual(fromBody.firstLineIndent, TWO_EM)) {
    const raw = body?.firstLineIndent;
    rows.push({
      id: 'firstLineIndent',
      from: { kind: 'dimension', value: fromBody.firstLineIndent },
      to: { kind: 'dimension', value: { ...TWO_EM } },
      customised: raw !== undefined && !dimensionsEqual(raw, D.firstLineIndent),
      apply: (c) => ({ ...c, bodyText: { ...c.bodyText, firstLineIndent: { ...TWO_EM } } }),
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

  // Hyphenation: a Chinese document is not hyphenated. Off by itself once
  // the language is Chinese, unless the author turned it on for a Latin
  // language they named (the words of that language in the text); turned
  // on with no language named, it would divide Chinese, which the engine
  // sets without it whatever the switch says.
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

  // Figure and table names: 图 / 圖 and 表, numbered 1-1.
  const fromTypes = config.resourceTypes ?? defaultResourceTypes(fromLocale);
  const targetTypes = defaultResourceTypes(locale);
  const ownTypes = !builtInTypes(fromTypes, [fromLocale, locale]);
  const proposedTypes = ownTypes ? mergeBuiltInTypes(fromTypes, targetTypes) : targetTypes;
  if (canonicalJson(proposedTypes) !== canonicalJson(fromTypes)) {
    rows.push({
      id: 'resourceTypes',
      from: { kind: 'text', text: typeNames(fromTypes) },
      to: { kind: 'text', text: typeNames(proposedTypes) },
      customised: ownTypes,
      apply: (c) => ({ ...c, resourceTypes: proposedTypes }),
    });
  }

  // Caption label: 图1-1　标题.
  const rawGap = config.captionStyle?.labelNumberGap;
  const rawSep = config.captionStyle?.labelSeparator;
  const fromGap = rawGap ?? DEFAULT_CAPTION_GAP;
  const fromSep = rawSep ?? DEFAULT_CAPTION_SEPARATOR;
  if (fromGap !== CAPTION_GAP || fromSep !== CAPTION_SEPARATOR) {
    const fromFigure = figureOf(fromTypes);
    const toFigure = figureOf(proposedTypes);
    const sample = (t: ResourceType | undefined, gap: string, sep: string) =>
      t ? `${t.captionPrefix}${gap}${sampleNumber(t.numberingTemplate)}${sep}…` : `1${sep}…`;
    rows.push({
      id: 'captionLabel',
      from: { kind: 'text', text: sample(fromFigure, fromGap, fromSep) },
      to: { kind: 'text', text: sample(toFigure, CAPTION_GAP, CAPTION_SEPARATOR) },
      customised: (rawGap !== undefined && rawGap !== DEFAULT_CAPTION_GAP && rawGap !== CAPTION_GAP)
        || (rawSep !== undefined && rawSep !== DEFAULT_CAPTION_SEPARATOR && rawSep !== CAPTION_SEPARATOR),
      apply: (c) => ({ ...c, captionStyle: { ...c.captionStyle, labelNumberGap: CAPTION_GAP, labelSeparator: CAPTION_SEPARATOR } }),
    });
  }

  // Chapter numbers: 第一章, the title after an ideographic space.
  const level1 = config.headings?.levels?.find((l) => l.level === 1);
  const rawTemplate = level1?.numberingTemplate;
  const rawNumberSep = level1?.numberSeparator;
  const fromTemplate = rawTemplate ?? '';
  if (fromTemplate !== CHAPTER_TEMPLATE || (rawNumberSep ?? DEFAULT_NUMBER_SEPARATOR) !== IDEOGRAPHIC_SPACE) {
    rows.push({
      id: 'chapterNumbering',
      from: fromTemplate === '' ? { kind: 'none' } : { kind: 'text', text: sampleHeading(fromTemplate, fromLocale) },
      to: { kind: 'text', text: sampleHeading(CHAPTER_TEMPLATE, locale) },
      customised: (rawTemplate !== undefined && rawTemplate !== '' && rawTemplate !== CHAPTER_TEMPLATE)
        || (rawNumberSep !== undefined && rawNumberSep !== DEFAULT_NUMBER_SEPARATOR && rawNumberSep !== IDEOGRAPHIC_SPACE),
      apply: (c) => {
        const levels = c.headings?.levels ?? [];
        const entry: HeadingLevelConfig = {
          ...levels.find((l) => l.level === 1),
          level: 1,
          numberingTemplate: CHAPTER_TEMPLATE,
          numberSeparator: IDEOGRAPHIC_SPACE,
        };
        const next = levels.some((l) => l.level === 1)
          ? levels.map((l) => (l.level === 1 ? entry : l))
          : [entry, ...levels];
        return { ...c, headings: { ...c.headings, levels: next } };
      },
    });
  }

  // Ordered lists: 一、 （一） 1. （1） ①.
  const fromLists = resolveOrderedListsConfig(config.orderedLists, fromBody, fromLocale).levels;
  const targetLists = chineseListLevels(locale);
  if (listSignature(fromLists) !== listSignature(targetLists)) {
    const known = [
      listSignature(resolveOrderedListsConfig(undefined, fromBody, fromLocale).levels),
      listSignature(chineseListLevels('zh-Hans')),
      listSignature(chineseListLevels('zh-Hant')),
    ];
    rows.push({
      id: 'listNumbers',
      from: { kind: 'text', text: listSample(fromLists, fromLocale) },
      to: { kind: 'text', text: listSample(targetLists, locale) },
      customised: !known.includes(listSignature(fromLists)),
      apply: (c) => {
        const levels = c.orderedLists?.levels ?? [];
        const merged = targetLists.map((t) => ({ ...levels.find((l) => l.level === t.level), ...t }));
        const others = levels.filter((l) => !targetLists.some((t) => t.level === l.level));
        return { ...c, orderedLists: { ...c.orderedLists, levels: [...merged, ...others] } };
      },
    });
  }

  // Footnotes: ① set inline, counted from ① on every page (页下注).
  const fromNotes = resolveFootnotesConfig(config.footnotes, fromLocale);
  const toNotes = resolveFootnotesConfig({ ...config.footnotes, ...CHINESE_FOOTNOTES }, locale);
  const notesValue = (f: typeof fromNotes): ChineseDefaultValue => ({
    kind: 'footnotes',
    marker: formatNumeral(1, f.numberFormat),
    position: f.markerPosition,
    numbering: f.numbering,
  });
  if (fromNotes.numberFormat !== toNotes.numberFormat || fromNotes.markerPosition !== toNotes.markerPosition || fromNotes.numbering !== toNotes.numbering) {
    const raw = config.footnotes;
    const rawFormat = raw?.numberFormat === undefined ? undefined : parseNumberFormat(raw.numberFormat, fromLocale);
    rows.push({
      id: 'footnotes',
      from: notesValue(fromNotes),
      to: notesValue(toNotes),
      customised: (rawFormat !== undefined && rawFormat !== 'decimal' && rawFormat !== 'circled-decimal')
        || (raw?.markerPosition !== undefined && raw.markerPosition !== 'auto' && raw.markerPosition !== 'inline')
        || (raw?.numbering !== undefined && raw.numbering !== 'chapter' && raw.numbering !== 'page'),
      apply: (c) => ({ ...c, footnotes: { ...c.footnotes, ...CHINESE_FOOTNOTES } }),
    });
  }

  const include = options.include ? new Set(options.include) : null;
  let next = config;
  const changes: ChineseDefaultChange[] = rows.map((row) => {
    const required = row.required ?? false;
    const applied = required || (include ? include.has(row.id) : !row.customised);
    if (applied) next = row.apply(next);
    return { id: row.id, from: row.from, to: row.to, customised: row.customised, required, applied };
  });
  // The binding the book ends with, now that the rows are applied.
  modeTo.binding = resolvePageConfig(next.page, locale, toMode, toDirection).binding;
  return { locale, changes, config: next };
}

export type ChineseDefaultsUndo = DefaultsUndo;
export type ChineseDefaultsStatus = DefaultsStatus;
export type ChineseDefaultsMemory = DefaultsMemory;
export type ChineseDefaultsFocus = DefaultsFocus;

/**
 * Takes the action back: every setting it wrote returns to what it was
 * before, unless the author has changed it again since (see
 * `undoDefaults`).
 */
export const undoChineseDefaults = undoDefaults;

const memory = createDefaultsMemory();
export const rememberChineseDefaults = memory.remember;
export const forgetChineseDefaults = memory.forget;
export const recallChineseDefaults = memory.recall;
export const takeChineseDefaultsFocus = memory.takeFocus;
export const keepChineseDefaultsFocus = memory.keepFocus;
