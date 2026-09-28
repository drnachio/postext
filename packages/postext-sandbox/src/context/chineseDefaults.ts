// "Apply Chinese defaults" (Design › Writing system): the dozen settings a
// Chinese book changes together, worked out as a list the author reviews
// before anything moves. Pure: the section shows `changes`, ticks and
// unticks rows, and dispatches `config` as one step; `undoChineseDefaults`
// takes that step back.

import type {
  Dimension,
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
  DOCUMENT_LANGUAGES,
  chineseScriptOf,
  cjkRegionOf,
  defaultResourceTypes,
  dimensionsEqual,
  formatNumeral,
  parseNumberFormat,
  resolveBodyTextConfig,
  resolveLayoutConfig,
  resolveOrderedListsConfig,
  resolvePageConfig,
} from 'postext';

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
  | 'listNumbers';

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

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return v;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) out[k] = (v as Record<string, unknown>)[k];
    return out;
  });
}

/** Whether `types` are, field for field, the built-in types of some
 *  language (the ones a new book gets, in any document language). */
function builtInTypes(types: readonly ResourceType[], extraLocales: readonly string[]): boolean {
  const current = canonicalJson(types);
  const tags = new Set([...DOCUMENT_LANGUAGES.map((l) => l.tag), 'en', 'es', ...extraLocales]);
  for (const tag of tags) if (canonicalJson(defaultResourceTypes(tag)) === current) return true;
  return false;
}

/** The first number a template prints, for the review list: `{h1}.{n}` →
 *  `1.1`. */
function sampleNumber(template: string): string {
  return template.replace(/\{h[1-6]\}/g, '1').replace(/\{n\}/g, '1');
}

/** What a heading template prints for the first chapter (`第{1:一}章` →
 *  第一章, `Chapter {1:I}` → Chapter I). Spelled-out styles show as 1. */
function sampleHeading(template: string, locale: string): string {
  return template.replace(/\{(\d)(?::([^}]*))?\}/g, (_m, _level: string, style: string | undefined) => {
    const parsed = style ? parseNumberFormat(style, locale) : 'decimal';
    return parsed ? formatNumeral(1, parsed) : '1';
  });
}

function listSignature(levels: readonly { numberFormat: string; prefix: string; separator: string }[]): string {
  return levels.map((l) => `${l.numberFormat}|${l.prefix}|${l.separator}`).join(';');
}

function listSample(levels: readonly { numberFormat: string; prefix: string; separator: string }[], locale: string): string {
  return levels
    .map((l) => `${l.prefix}${formatNumeral(1, parseNumberFormat(l.numberFormat, locale) ?? 'decimal')}${l.separator}`)
    .join(' ');
}

function typeNames(types: readonly ResourceType[]): string {
  return types.map((t) => t.name).join(', ');
}

function figureOf(types: readonly ResourceType[]): ResourceType | undefined {
  return types.find((t) => t.id === 'figure') ?? types[0];
}

/** The built-in types of `target` in place of the ones with the same id,
 *  keeping every other field of those and every type of the author's own. */
function mergeBuiltInTypes(types: readonly ResourceType[], target: readonly ResourceType[]): ResourceType[] {
  const byId = new Map(target.map((t) => [t.id, t]));
  return types.map((t) => {
    const builtIn = byId.get(t.id);
    if (!builtIn) return t;
    const next: ResourceType = {
      ...t,
      name: builtIn.name,
      shortLabel: builtIn.shortLabel,
      captionPrefix: builtIn.captionPrefix,
      numberingTemplate: builtIn.numberingTemplate,
    };
    if (builtIn.namePlural !== undefined) next.namePlural = builtIn.namePlural;
    else delete next.namePlural;
    return next;
  });
}

/** `obj` without `key`, or undefined when nothing is left. */
function without<T extends object>(obj: T | undefined, key: keyof T): T | undefined {
  if (!obj) return undefined;
  const next = { ...obj };
  delete next[key];
  return Object.keys(next).length > 0 ? next : undefined;
}

function set<K extends keyof PostextConfig>(config: PostextConfig, key: K, value: PostextConfig[K] | undefined): PostextConfig {
  const next = { ...config };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
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
  const fromBinding = resolvePageConfig(config.page, fromLocale, fromMode).binding;
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
  const autoBinding = toMode === 'vertical-rl' ? 'right' : 'left';
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
  const fromHeadingFont = config.headings?.fontFamily ?? DEFAULT_HEADINGS_CONFIG.fontFamily;
  if (fromHeadingFont !== fonts.headings) {
    const raw = config.headings?.fontFamily;
    rows.push({
      id: 'headingFont',
      from: { kind: 'text', text: fromHeadingFont },
      to: { kind: 'text', text: fonts.headings },
      customised: raw !== undefined && raw !== DEFAULT_HEADINGS_CONFIG.fontFamily && !CHINESE_HEADING_FONTS.has(raw),
      apply: (c) => ({ ...c, headings: { ...c.headings, fontFamily: fonts.headings } }),
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
  // the language is Chinese, unless the author turned it on.
  if (fromBody.hyphenation.enabled) {
    const explicit = body?.hyphenation?.enabled === true;
    rows.push({
      id: 'hyphenation',
      from: { kind: 'switch', on: true },
      to: { kind: 'switch', on: false },
      customised: explicit,
      required: !explicit,
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

  const include = options.include ? new Set(options.include) : null;
  let next = config;
  const changes: ChineseDefaultChange[] = rows.map((row) => {
    const required = row.required ?? false;
    const applied = required || (include ? include.has(row.id) : !row.customised);
    if (applied) next = row.apply(next);
    return { id: row.id, from: row.from, to: row.to, customised: row.customised, required, applied };
  });
  // The binding the book ends with, now that the rows are applied.
  modeTo.binding = resolvePageConfig(next.page, locale, toMode).binding;
  return { locale, changes, config: next };
}

/**
 * Takes the action back: every top-level setting it changed returns to
 * what it was before, unless the author has changed that setting again
 * since (it then stays as it is now). `before` and `after` are the configs
 * the action went from and to.
 */
export function undoChineseDefaults(current: PostextConfig, before: PostextConfig, after: PostextConfig): PostextConfig {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)] as (keyof PostextConfig)[]);
  let next: PostextConfig | null = null;
  for (const key of keys) {
    if (before[key] === after[key] || current[key] !== after[key]) continue;
    next ??= { ...current };
    if (before[key] === undefined) delete next[key];
    else (next as Record<string, unknown>)[key] = before[key];
  }
  return next ?? current;
}
