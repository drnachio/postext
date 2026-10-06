// "Arabic defaults" (Design › Writing system): the settings an Arabic book
// changes together, worked out as a list the author reviews before anything
// moves, as the Chinese defaults are. Pure: the section shows `changes`,
// ticks and unticks rows, and dispatches `config` as one step;
// `undoArabicDefaults` takes that step back.
//

import type {
  DesignTextElement,
  DigitSystem,
  Dimension,
  EmphasisStyle,
  FootnoteNumbering,
  FootnotesConfig,
  ResolvedFootnotesConfig,
  HeadingLevelConfig,
  OrderedListLevelConfig,
  PostextConfig,
  TextAlign,
} from 'postext';
import {
  DEFAULT_BODY_TEXT_CONFIG,
  DEFAULT_FOOTER_SLOT,
  DEFAULT_HEADER_SLOT,
  DEFAULT_HEADINGS_CONFIG,
  DEFAULT_TEXT_ELEMENT,
  defaultNumeralsFor,
  defaultResourceTypes,
  dimensionsEqual,
  documentNumeralStyle,
  formatNumeral,
  formatFootnoteNumber,
  footnoteFormatOf,
  localeScript,
  parseNumberFormat,
  resolveBodyTextConfig,
  resolveFootnotesConfig,
  resolveOrderedListsConfig,
  withDigits,
} from 'postext';
import { documentDigits, documentDirection } from './documentDirection';
import {
  builtInTypes,
  canonicalJson,
  createDefaultsMemory,
  designTextNeedsScript,
  ENGINE_DESIGN_FACES,
  figureOf,
  headingFacesText,
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
export type ArabicDefaultId =
  | 'direction'
  | 'binding'
  | 'bodyFont'
  | 'headingFont'
  | 'designFonts'
  | 'lineHeight'
  | 'textAlign'
  | 'hyphenation'
  | 'kashida'
  | 'emphasis'
  | 'numerals'
  | 'resourceTypes'
  | 'captionLabel'
  | 'chapterNumbering'
  | 'listNumbers'
  | 'footnotes';

/** The typefaces the list proposes: Amiri, the Naskh of the Būlāq press,
 *  for a classical text; Noto Naskh Arabic with Noto Kufi Arabic headings
 *  for a modern book. */
export type ArabicFaces = 'classical' | 'modern';

/** A value as the review list shows it. Words the interface translates
 *  (on/off, alignments, directions, digit systems) stay typed; the rest is
 *  text shown as written (typefaces, samples such as الفصل الأول). */
export type ArabicDefaultValue =
  | { kind: 'text'; text: string }
  | { kind: 'switch'; on: boolean }
  | { kind: 'dimension'; value: Dimension }
  | { kind: 'align'; value: TextAlign }
  | { kind: 'direction'; value: 'ltr' | 'rtl'; auto?: boolean }
  | { kind: 'binding'; value: 'left' | 'right'; auto?: boolean }
  | { kind: 'digits'; value: DigitSystem; auto?: boolean }
  | { kind: 'emphasis'; value: EmphasisStyle; auto?: boolean }
  | {
    kind: 'footnotes';
    /** The marker as the text shows it, its template applied: «(١)». */
    marker: string;
    position: ResolvedFootnotesConfig['markerPosition'];
    numbering: FootnoteNumbering;
    /** Where the note's own number stands, when not as the marker. */
    noteNumber?: 'superscript' | 'inline';
  }
  | { kind: 'none' };

export interface ArabicDefaultChange {
  id: ArabicDefaultId;
  from: ArabicDefaultValue;
  to: ArabicDefaultValue;
  /** The author set this to a value of their own (neither the engine's
   *  default nor an Arabic default of either set of typefaces): unticked
   *  unless `include` names it. */
  customised: boolean;
  /** Part of the language: always applied. */
  required: boolean;
  /** Whether `config` carries it. */
  applied: boolean;
}

export interface ArabicDefaultsOptions {
  /** The document language (an Arabic tag: `ar`, `ar-EG`, `ar-MA`…). The
   *  list keeps it; it only decides the digits and the strings. */
  locale: string;
  /** Default `'classical'`. */
  faces?: ArabicFaces;
  /** The optional rows to apply. Unset: every row the author has not
   *  customised. Required rows apply whatever it says. */
  include?: Iterable<ArabicDefaultId>;
  /** The Fontsource subsets of a family (`arabic`, `latin`…), as the font
   *  picker lists them; undefined for a family it does not know (an
   *  uploaded face). Decides which design texts are set in a face with no
   *  Arabic letters. Without it only the engine's own design faces (Open
   *  Sans, EB Garamond) count as lacking them. */
  fontSubsets?: (family: string) => readonly string[] | undefined;
}

export interface ArabicDefaultsResult {
  /** Only the rows that change something, in list order. */
  changes: ArabicDefaultChange[];
  config: PostextConfig;
}

/** Whether `locale` is written in the Arabic script (Arabic, and Persian
 *  or Urdu, which have no picker entry yet): the books the list is for. */
export function isArabicScriptLanguage(locale: string | undefined): boolean {
  return locale !== undefined && localeScript(locale) === 'Arab';
}

const FONTS: Record<ArabicFaces, { body: string; headings: string }> = {
  classical: { body: 'Amiri', headings: 'Amiri' },
  modern: { body: 'Noto Naskh Arabic', headings: 'Noto Kufi Arabic' },
};
const ARABIC_BODY_FONTS = new Set<string>(Object.values(FONTS).map((f) => f.body));
const ARABIC_HEADING_FONTS = new Set<string>(Object.values(FONTS).map((f) => f.headings));

/** The typefaces of a set (see {@link ArabicFaces}). */
export function arabicFontsFor(faces: ArabicFaces): { body: string; headings: string } {
  return { ...FONTS[faces] };
}

/** Whether a design text with this template prints Arabic-script
 *  characters in a book whose numbers take `digits`: Arabic letters
 *  written in it, a placeholder that copies the book's text, or a number
 *  in Arabic-Indic digits. `{{`/`}}` are literal braces. */
export function designTextNeedsArabic(content: string, digits: DigitSystem): boolean {
  return designTextNeedsScript(content, /\p{Script=Arabic}/u, digits !== 'latn');
}

/** Naskh sits low on the line and stacks its vowel marks above and below
 *  it: 1.75 em gives fully vocalised text room without the lines touching
 *  (Amiri and Noto Naskh both run past 1.5 em with marks). */
const LINE_HEIGHT: Dimension = { value: 1.75, unit: 'em' };
const ARABIC_COMMA = '، ';
const DEFAULT_CAPTION_GAP = ' ';
const DEFAULT_CAPTION_SEPARATOR = '. ';
/** شكل ١-١: العنوان — a colon after the number: a full stop after Arabic
 *  digits reads as the decimal separator ٫. */
const CAPTION_SEPARATOR = ': ';
/** الفصل الأول: the masculine definite ordinal in words (`numberWords.ts`). */
const CHAPTER_TEMPLATE = 'الفصل {1:ordinal}';
const CHAPTER_SAMPLE = 'الفصل الأول';
const CHAPTER_SEPARATOR = ': ';
const DEFAULT_NUMBER_SEPARATOR = ' ';
/** Notes numbered again on every page, as critical editions and most
 *  Arabic books number them, in parentheses: the marker raised in the text
 *  «(١)», the note opening with its «(١)» on the line (#376). The numbers
 *  take the document's digits. */
const ARABIC_FOOTNOTES: Pick<FootnotesConfig, 'numbering' | 'markerTemplate' | 'noteNumberPosition'> = {
  numbering: 'page',
  markerTemplate: '({n})',
  noteNumberPosition: 'inline',
};

/** Arabic list numbers: ١- then أ- (abjad letters) then (١). The hyphen
 *  after the number is the usual Arabic mark; decimal levels take the
 *  document's digits. */
const ARABIC_LIST_LEVELS: Required<Pick<OrderedListLevelConfig, 'level' | 'numberFormat' | 'prefix' | 'separator'>>[] = [
  { level: 1, numberFormat: 'arabic', prefix: '', separator: '-' },
  { level: 2, numberFormat: 'abjad', prefix: '', separator: '-' },
  { level: 3, numberFormat: 'arabic', prefix: '(', separator: ')' },
];

/** What a heading template prints for the first chapter, in `digits`;
 *  spelled-out styles show as 1 (the Arabic template's own sample is
 *  written out). */
function sampleHeading(template: string, locale: string, digits: DigitSystem): string {
  if (template === CHAPTER_TEMPLATE) return CHAPTER_SAMPLE;
  return template.replace(/\{(\d)(?::([^}]*))?\}/g, (_m, _level: string, style: string | undefined) => {
    const parsed = style ? parseNumberFormat(style, locale) : 'decimal';
    return formatNumeral(1, parsed ?? 'decimal', digits);
  });
}

interface Row {
  id: ArabicDefaultId;
  from: ArabicDefaultValue;
  to: ArabicDefaultValue;
  customised: boolean;
  required?: boolean;
  apply: (c: PostextConfig) => PostextConfig;
}

/**
 * The Arabic defaults for `config`, a book in `options.locale`: what each
 * setting is and what it becomes, and the config with the chosen rows
 * applied. A row appears only when it changes something. Settings the
 * author made their own are listed unticked; the faces of the other set
 * do not count as the author's (a classical book switched to modern takes
 * Noto Naskh without asking).
 */
export function arabicDefaults(config: PostextConfig, options: ArabicDefaultsOptions): ArabicDefaultsResult {
  const locale = options.locale;
  const fonts = FONTS[options.faces ?? 'classical'];
  const D = DEFAULT_BODY_TEXT_CONFIG;
  const body = config.bodyText;
  const fromBody = resolveBodyTextConfig(body, locale);
  const digits = documentDigits(config.numerals, locale);
  const rows: Row[] = [];

  // Direction: right to left goes with the language. A book the author set
  // left to right returns to Auto.
  if (config.direction === 'ltr' && documentDirection(undefined, locale) === 'rtl') {
    rows.push({
      id: 'direction',
      from: { kind: 'direction', value: 'ltr' },
      to: { kind: 'direction', value: 'rtl', auto: true },
      customised: false,
      required: true,
      apply: (c) => set(c, 'direction', undefined),
    });
  }

  // Binding: Auto binds a right-to-left book on the right.
  const rawBinding = config.page?.binding;
  if (rawBinding === 'left') {
    rows.push({
      id: 'binding',
      from: { kind: 'binding', value: 'left' },
      to: { kind: 'binding', value: 'right', auto: true },
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
      customised: raw !== undefined && raw !== D.fontFamily && !ARABIC_BODY_FONTS.has(raw),
      apply: (c) => ({ ...c, bodyText: { ...c.bodyText, fontFamily: fonts.body } }),
    });
  }
  // The headings' typeface, and the ones levels and named styles set for
  // themselves: an Arabic face of the other set becomes this set's, any
  // other face goes and the heading follows the headings' typeface.
  const fromHeadingFont = config.headings?.fontFamily ?? DEFAULT_HEADINGS_CONFIG.fontFamily;
  const headingFace = (f: string): string | undefined =>
    f === fonts.headings || f === fonts.body ? f
      : ARABIC_HEADING_FONTS.has(f) ? fonts.headings
        : ARABIC_BODY_FONTS.has(f) ? fonts.body
          : undefined;
  const moves = (item: { fontFamily?: string }) => item.fontFamily !== undefined && headingFace(item.fontFamily) !== item.fontFamily;
  const levelFaces = (config.headings?.levels ?? []).filter(moves);
  const styleFaces = (config.headingStyles ?? []).filter(moves);
  if (fromHeadingFont !== fonts.headings || levelFaces.length > 0 || styleFaces.length > 0) {
    const own = (f: string | undefined) => f !== undefined && f !== DEFAULT_HEADINGS_CONFIG.fontFamily
      && !ARABIC_BODY_FONTS.has(f) && !ARABIC_HEADING_FONTS.has(f);
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

  // Design texts (running heads, folios, opener and heading designs) set in
  // a face with no Arabic letters, whose text is Arabic: the PDF prints
  // their letters and Arabic-Indic digits as empty boxes (the canvas falls
  // back to another face). They take the headings' Arabic face. The
  // built-in header and footer (Open Sans) are written out to do so. Never
  // the author's own choice in the sense of the other rows: a face that
  // cannot set the text is a fault, so the row comes ticked.
  const lacksArabic = (family: string): boolean => {
    if (ARABIC_BODY_FONTS.has(family) || ARABIC_HEADING_FONTS.has(family)) return false;
    const subsets = options.fontSubsets?.(family);
    return subsets ? !subsets.includes('arabic') : ENGINE_DESIGN_FACES.has(family);
  };
  const movedFaces = new Set<string>();
  const moveDesignText = (el: DesignTextElement): DesignTextElement => {
    const face = el.fontFamily ?? DEFAULT_TEXT_ELEMENT.fontFamily;
    if (!lacksArabic(face) || !designTextNeedsArabic(el.content, digits)) return el;
    movedFaces.add(face);
    const next: DesignTextElement = { ...el, fontFamily: fonts.headings };
    if (el.dropCap?.fontFamily !== undefined && lacksArabic(el.dropCap.fontFamily)) next.dropCap = { ...el.dropCap, fontFamily: fonts.headings };
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
      to: { kind: 'text', text: fonts.headings },
      customised: false,
      apply: (c) => {
        const next = mapDesignTexts(c, moveDesignText);
        const out: PostextConfig = { ...next };
        // The built-in slots, written out only when they move.
        if (c.header === undefined && designed.header !== DEFAULT_HEADER_SLOT) out.header = designed.header;
        if (c.footer === undefined && designed.footer !== DEFAULT_FOOTER_SLOT) out.footer = designed.footer;
        return out;
      },
    });
  }

  // Leading: 1.75 em of the body size.
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

  // Justified text.
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

  // Hyphenation: Arabic words are never divided at the end of a line. The
  // engine sets an Arabic book without it (#368); it runs only when the
  // author turned it on for a Latin language they named (the quoted words
  // of that language in the text), which this row offers to turn off.
  if (fromBody.hyphenation.enabled) {
    const explicit = body?.hyphenation?.enabled === true;
    const named = body?.hyphenation?.locale;
    const own = explicit && typeof named === 'string' && named.trim() !== '' && !isArabicScriptLanguage(named);
    rows.push({
      id: 'hyphenation',
      from: { kind: 'switch', on: true },
      to: { kind: 'switch', on: false },
      customised: own,
      apply: (c) => ({ ...c, bodyText: { ...c.bodyText, hyphenation: { ...c.bodyText?.hyphenation, enabled: false } } }),
    });
  }

  // Kashida: justified Arabic lines elongate letter joins (#375). The
  // engine does so by default in an Arabic book; the row turns back an
  // author's 'none'.
  if (body?.kashida === 'none') {
    rows.push({
      id: 'kashida',
      from: { kind: 'switch', on: false },
      to: { kind: 'switch', on: true },
      customised: true,
      apply: (c) => set(c, 'bodyText', without(c.bodyText, 'kashida')),
    });
  }

  // Emphasis: in bold, Arabic type having no italics. Auto already sets it
  // so in an Arabic book; the row returns an emphasis the author chose
  // (italics, which leave Arabic words upright and unmarked, a colour, a
  // line over the words) to Auto.
  const rawEmphasis = body?.emphasis;
  if (rawEmphasis === 'italic' || rawEmphasis === 'color' || rawEmphasis === 'overline') {
    rows.push({
      id: 'emphasis',
      from: { kind: 'emphasis', value: rawEmphasis },
      to: { kind: 'emphasis', value: 'bold', auto: true },
      customised: true,
      apply: (c) => set(c, 'bodyText', without(c.bodyText, 'emphasis')),
    });
  }

  // Digits: those of the region (٠١٢ in the Mashriq, 012 in the Maghreb).
  const regionDigits = defaultNumeralsFor(locale);
  if (config.numerals !== undefined && config.numerals !== 'auto' && digits !== regionDigits) {
    rows.push({
      id: 'numerals',
      from: { kind: 'digits', value: digits },
      to: { kind: 'digits', value: regionDigits, auto: true },
      customised: true,
      apply: (c) => set(c, 'numerals', undefined),
    });
  }
  // The digits the book ends with, for the samples below (the row above
  // may be left unticked).
  const include = options.include ? new Set(options.include) : null;
  const numeralsRow = rows.find((r) => r.id === 'numerals');
  const toDigits = numeralsRow && (include ? include.has('numerals') : !numeralsRow.customised) ? regionDigits : digits;

  // Figure and table names: شكل and جدول, numbered 1-1.
  const fromTypes = config.resourceTypes ?? defaultResourceTypes(locale);
  const targetTypes = defaultResourceTypes(locale);
  const ownTypes = !builtInTypes(fromTypes, [locale]);
  const proposedTypes = ownTypes ? mergeBuiltInTypes(fromTypes, targetTypes) : targetTypes;
  if (canonicalJson(proposedTypes) !== canonicalJson(fromTypes)) {
    rows.push({
      id: 'resourceTypes',
      from: { kind: 'text', text: typeNames(fromTypes) },
      to: { kind: 'text', text: typeNames(proposedTypes, ARABIC_COMMA) },
      customised: ownTypes,
      apply: (c) => ({ ...c, resourceTypes: proposedTypes }),
    });
  }

  // Caption label: شكل ١-١: العنوان.
  const rawGap = config.captionStyle?.labelNumberGap;
  const rawSep = config.captionStyle?.labelSeparator;
  const fromGap = rawGap ?? DEFAULT_CAPTION_GAP;
  const fromSep = rawSep ?? DEFAULT_CAPTION_SEPARATOR;
  if (fromGap !== DEFAULT_CAPTION_GAP || fromSep !== CAPTION_SEPARATOR) {
    const sample = (t: ReturnType<typeof figureOf>, gap: string, sep: string, d: DigitSystem) =>
      t ? `${t.captionPrefix}${gap}${withDigits(sampleNumber(t.numberingTemplate), d)}${sep}…` : `${withDigits('1', d)}${sep}…`;
    rows.push({
      id: 'captionLabel',
      from: { kind: 'text', text: sample(figureOf(fromTypes), fromGap, fromSep, digits) },
      to: { kind: 'text', text: sample(figureOf(proposedTypes), DEFAULT_CAPTION_GAP, CAPTION_SEPARATOR, toDigits) },
      customised: (rawGap !== undefined && rawGap !== DEFAULT_CAPTION_GAP)
        || (rawSep !== undefined && rawSep !== DEFAULT_CAPTION_SEPARATOR && rawSep !== CAPTION_SEPARATOR),
      apply: (c) => {
        const captionStyle = { ...c.captionStyle, labelSeparator: CAPTION_SEPARATOR };
        delete captionStyle.labelNumberGap;
        return { ...c, captionStyle };
      },
    });
  }

  // Chapter numbers: الفصل الأول, the title after a colon.
  const level1 = config.headings?.levels?.find((l) => l.level === 1);
  const rawTemplate = level1?.numberingTemplate;
  const rawNumberSep = level1?.numberSeparator;
  const fromTemplate = rawTemplate ?? '';
  if (fromTemplate !== CHAPTER_TEMPLATE || (rawNumberSep ?? DEFAULT_NUMBER_SEPARATOR) !== CHAPTER_SEPARATOR) {
    rows.push({
      id: 'chapterNumbering',
      from: fromTemplate === '' ? { kind: 'none' } : { kind: 'text', text: sampleHeading(fromTemplate, locale, digits) },
      to: { kind: 'text', text: CHAPTER_SAMPLE },
      customised: (rawTemplate !== undefined && rawTemplate !== '' && rawTemplate !== CHAPTER_TEMPLATE)
        || (rawNumberSep !== undefined && rawNumberSep !== DEFAULT_NUMBER_SEPARATOR && rawNumberSep !== CHAPTER_SEPARATOR),
      apply: (c) => {
        const levels = c.headings?.levels ?? [];
        const entry: HeadingLevelConfig = {
          ...levels.find((l) => l.level === 1),
          level: 1,
          numberingTemplate: CHAPTER_TEMPLATE,
          numberSeparator: CHAPTER_SEPARATOR,
        };
        const next = levels.some((l) => l.level === 1)
          ? levels.map((l) => (l.level === 1 ? entry : l))
          : [entry, ...levels];
        return { ...c, headings: { ...c.headings, levels: next } };
      },
    });
  }

  // Ordered lists: ١- أ- (١).
  const fromLists = resolveOrderedListsConfig(config.orderedLists, fromBody, locale).levels.slice(0, ARABIC_LIST_LEVELS.length);
  if (listSignature(fromLists) !== listSignature(ARABIC_LIST_LEVELS)) {
    const known = listSignature(resolveOrderedListsConfig(undefined, fromBody, locale).levels.slice(0, ARABIC_LIST_LEVELS.length));
    rows.push({
      id: 'listNumbers',
      from: { kind: 'text', text: listSample(fromLists, locale, digits) },
      to: { kind: 'text', text: listSample(ARABIC_LIST_LEVELS, locale, toDigits) },
      customised: listSignature(fromLists) !== known,
      apply: (c) => {
        const levels = c.orderedLists?.levels ?? [];
        const merged = ARABIC_LIST_LEVELS.map((t) => ({ ...levels.find((l) => l.level === t.level), ...t }));
        const others = levels.filter((l) => !ARABIC_LIST_LEVELS.some((t) => t.level === l.level));
        return { ...c, orderedLists: { ...c.orderedLists, levels: [...merged, ...others] } };
      },
    });
  }

  // Footnotes: numbered again on every page, in parentheses, the note's
  // own number on the line.
  const fromNotes = resolveFootnotesConfig(config.footnotes, locale);
  const toNotes = resolveFootnotesConfig({ ...config.footnotes, ...ARABIC_FOOTNOTES }, locale);
  const notesValue = (f: typeof fromNotes, d: DigitSystem): ArabicDefaultValue => ({
    kind: 'footnotes',
    marker: formatFootnoteNumber(1, footnoteFormatOf(f, d), f.markerTemplate),
    position: f.markerPosition,
    numbering: f.numbering,
    ...(f.noteNumberPosition && f.noteNumberPosition !== f.markerPosition ? { noteNumber: f.noteNumberPosition } : {}),
  });
  const notesKey = (f: typeof fromNotes) => `${f.numbering} ${f.markerTemplate ?? '{n}'} ${f.noteNumberPosition ?? f.markerPosition}`;
  if (notesKey(fromNotes) !== notesKey(toNotes)) {
    const raw = config.footnotes;
    // The author's own: a value that is neither the engine's default nor
    // the Arabic one.
    const own = (raw?.numbering !== undefined && raw.numbering !== 'chapter' && raw.numbering !== ARABIC_FOOTNOTES.numbering)
      || (raw?.markerTemplate !== undefined && raw.markerTemplate !== '{n}' && raw.markerTemplate !== ARABIC_FOOTNOTES.markerTemplate)
      || (raw?.noteNumberPosition !== undefined && raw.noteNumberPosition !== 'auto' && raw.noteNumberPosition !== ARABIC_FOOTNOTES.noteNumberPosition);
    rows.push({
      id: 'footnotes',
      from: notesValue(fromNotes, digits),
      to: notesValue(toNotes, toDigits),
      customised: own,
      apply: (c) => ({ ...c, footnotes: { ...c.footnotes, ...ARABIC_FOOTNOTES } }),
    });
  }

  let next = config;
  const changes: ArabicDefaultChange[] = rows.map((row) => {
    const required = row.required ?? false;
    const applied = required || (include ? include.has(row.id) : !row.customised);
    if (applied) next = row.apply(next);
    return { id: row.id, from: row.from, to: row.to, customised: row.customised, required, applied };
  });
  return { changes, config: next };
}

/**
 * Takes the action back: every setting it wrote returns to what it was
 * before, unless the author has changed it again since (see
 * `undoDefaults`).
 */
export const undoArabicDefaults = undoDefaults;

const memory = createDefaultsMemory();
export const rememberArabicDefaults = memory.remember;
export const forgetArabicDefaults = memory.forget;
export const recallArabicDefaults = memory.recall;
export const takeArabicDefaultsFocus = memory.takeFocus;
export const keepArabicDefaultsFocus = memory.keepFocus;
