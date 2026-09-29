// "Apply Chinese defaults" (Design › Writing system): the dozen settings a
// Chinese book changes together, worked out as a list the author reviews
// before anything moves. Pure: the section shows `changes`, ticks and
// unticks rows, and dispatches `config` as one step; `undoChineseDefaults`
// takes that step back.

import type {
  Dimension,
  TextAlign,
  HeadingLevelConfig,
  HeadingStyleConfig,
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
  isCjkLanguage,
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

/** `2, 3, 4` → `H2–H4`; `2, 4` → `H2, H4`. */
function levelRanges(levels: readonly number[]): string {
  const sorted = [...levels].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j++;
    if (j - i >= 2) out.push(`H${sorted[i]}–H${sorted[j]}`);
    else for (let k = i; k <= j; k++) out.push(`H${sorted[k]}`);
    i = j + 1;
  }
  return out.join(', ');
}

/** The headings' typeface and the ones levels and styles set for
 *  themselves: `Fraunces; H2–H4: Bricolage Grotesque; Preface: Geist`. */
function headingFacesText(general: string, levels: readonly HeadingLevelConfig[], styles: readonly HeadingStyleConfig[]): string {
  const byFace = new Map<string, number[]>();
  for (const l of levels) byFace.set(l.fontFamily!, [...(byFace.get(l.fontFamily!) ?? []), l.level]);
  return [
    general,
    ...[...byFace].map(([face, lv]) => `${levelRanges(lv)}: ${face}`),
    ...styles.map((st) => `${st.name ?? st.id}: ${st.fontFamily}`),
  ].join('; ');
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

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** A measure (`{ value, unit }`) is one setting: restored or kept whole. */
function isMeasure(v: Record<string, unknown>): boolean {
  return 'unit' in v && Object.keys(v).every((k) => k === 'value' || k === 'unit');
}

/** Structural equality, as JSON sees it (an `undefined` field is no field). */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => same(v, b[i]));
  }
  if (!isRecord(a) || !isRecord(b)) return false;
  const ka = Object.keys(a).filter((k) => a[k] !== undefined);
  const kb = Object.keys(b).filter((k) => b[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => same(a[k], b[k]));
}

/** The entries of a list by their key (`level`, else `id`), or null when
 *  some entry has none or two share one. */
function keyedEntries(list: readonly unknown[]): Map<string, unknown> | null {
  const map = new Map<string, unknown>();
  for (const v of list) {
    const key = !isRecord(v) ? undefined
      : typeof v.level === 'number' ? `level=${v.level}`
        : typeof v.id === 'string' ? `id=${v.id}`
          : undefined;
    if (key === undefined || map.has(key)) return null;
    map.set(key, v);
  }
  return map;
}

/**
 * `current` with each setting that went from `before` to `after` back to
 * `before`, unless it no longer reads `after` (the author changed it since:
 * it is kept, and its path pushed onto `kept`). Groups of settings are
 * walked setting by setting; lists whose entries carry a `level` or an
 * `id` (heading levels, list levels, resource types) entry by entry. A
 * measure, a list of any other kind, and a group or entry the action
 * created (`fresh` false) are restored or kept whole.
 */
function revert(current: unknown, before: unknown, after: unknown, path: string, kept: string[], fresh = true): unknown {
  if (same(before, after)) return current;
  if (same(current, after)) return before;
  if (isRecord(current) && isRecord(after) && !isMeasure(current) && !isMeasure(after)
    && ((fresh && before === undefined) || (isRecord(before) && !isMeasure(before)))) {
    const was = (before ?? {}) as Record<string, unknown>;
    let out: Record<string, unknown> | null = null;
    for (const key of new Set([...Object.keys(was), ...Object.keys(after)])) {
      const value = revert(current[key], was[key], after[key], path ? `${path}.${key}` : key, kept);
      if (value === current[key]) continue;
      out ??= { ...current };
      if (value === undefined) delete out[key];
      else out[key] = value;
    }
    if (!out) return current;
    return before === undefined && Object.keys(out).length === 0 ? undefined : out;
  }
  if (Array.isArray(current) && Array.isArray(after) && Array.isArray(before)) {
    const was = keyedEntries(before);
    const now = keyedEntries(after);
    const cur = keyedEntries(current);
    if (was && now && cur) {
      let changed = false;
      const out: unknown[] = [];
      for (const key of new Set([...cur.keys(), ...was.keys(), ...now.keys()])) {
        const entry = cur.get(key);
        const value = revert(entry, was.get(key), now.get(key), `${path}[${key}]`, kept, false);
        if (value !== entry) changed = true;
        if (value !== undefined) out.push(value);
      }
      return changed ? out : current;
    }
  }
  kept.push(path);
  return current;
}

export interface ChineseDefaultsUndo {
  /** The config with the action taken back (`current` itself when there
   *  is nothing left to take back). */
  config: PostextConfig;
  /** The settings the action wrote that the author has changed since,
   *  left as they are now (`bodyText.fontFamily`). */
  kept: string[];
}

/**
 * Takes the action back: every setting it wrote returns to what it was
 * before, down to the single field (`bodyText.fontFamily`, level 1's
 * numbering), unless the author has changed that setting again since (it
 * then stays as it is now, and `kept` names it). Other edits made since,
 * in the same groups or elsewhere, stay. `before` and `after` are the
 * configs the action went from and to.
 */
export function undoChineseDefaults(current: PostextConfig, before: PostextConfig, after: PostextConfig): ChineseDefaultsUndo {
  const kept: string[] = [];
  const config = revert(current, before, after, '', kept) as PostextConfig | undefined;
  return { config: config ?? {}, kept };
}

/** The message under the button: applied (how many changes) or undone
 *  (`partial`: some settings had been changed since and stayed). */
export type ChineseDefaultsStatus = { kind: 'applied'; count: number } | { kind: 'undone'; partial: boolean };

/** What the section remembers between mounts (while the author looks at
 *  another group of the panel): the last application, for Undo, and its
 *  message, tied to the book they were made in. */
export interface ChineseDefaultsMemory {
  /** The book (project, or preset and language, and load) on screen. */
  book: string;
  /** When it happened (ms). */
  at: number;
  status: ChineseDefaultsStatus;
  undo: { before: PostextConfig; after: PostextConfig } | null;
  /** Where the focus goes once the section is on screen: the message
   *  after Apply, Review after Undo. Both may change the typefaces, and
   *  the sandbox then puts its interface away until the fonts load: the
   *  section that takes the focus is a new mount. */
  focus?: ChineseDefaultsFocus;
}

export type ChineseDefaultsFocus = 'status' | 'review';

/** How long a remounted section still shows the message (and Undo): the
 *  application's for a while, the undo's for a few seconds. */
const APPLIED_LIFETIME = 10 * 60_000;
const UNDONE_LIFETIME = 10_000;

let memory: ChineseDefaultsMemory | null = null;

export function rememberChineseDefaults(entry: ChineseDefaultsMemory): void {
  memory = entry;
}

export function forgetChineseDefaults(): void {
  memory = null;
}

/** The memory, if it belongs to `book` and has not lapsed. Asking for
 *  another book forgets it: Undo is offered only in the book the action
 *  ran on. */
export function recallChineseDefaults(book: string, now = Date.now()): ChineseDefaultsMemory | null {
  if (!memory) return null;
  const lifetime = memory.status.kind === 'applied' ? APPLIED_LIFETIME : UNDONE_LIFETIME;
  if (memory.book !== book || now - memory.at >= lifetime) memory = null;
  return memory;
}

/** The focus the memory asks for in `book`, taken once: a later mount
 *  (the author back from another group) leaves the focus where it is. */
export function takeChineseDefaultsFocus(book: string, now = Date.now()): ChineseDefaultsFocus | null {
  const m = recallChineseDefaults(book, now);
  if (!m?.focus) return null;
  memory = { ...m, focus: undefined };
  return m.focus;
}

/** The section goes away with the focus on `target` (the interface put
 *  away while fonts load): the next mount takes it back. */
export function keepChineseDefaultsFocus(target: ChineseDefaultsFocus): void {
  if (memory) memory = { ...memory, focus: target };
}
