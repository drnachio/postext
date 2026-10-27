// The values the Japanese defaults write (line pitch, grid, chapter
// templates, faces, heading line spans and indents, list numbers) and the
// texts the rows show for them (#1276: split out of japaneseDefaults.ts).
import { type Dimension, defaultCaptionLabels, type OrderedListLevelConfig, type OrderedListNumberFormat, type FootnotesConfig, parseNumberFormat, formatNumeral, type HeadingLevelConfig, type PostextConfig } from 'postext';
import { chineseFontsFor } from '../chineseDefaults.js';
import { isDesignText } from '../defaultsReview.js';
import type { JapaneseBook, JapaneseDefaultId, JapaneseDefaultValue } from './types.js';

export const IDEOGRAPHIC_SPACE = '　';
export const ONE_EM: Dimension = { value: 1, unit: 'em' };
/** Line pitch of a Japanese book: bunko set 9–9.25 pt type on a 16–16.5 pt
 *  feed, about 1.75 em, which leaves three quarters of an em between lines
 *  for half-em furigana (JLReq §2.4.2, §2.5.2). */
export const LINE_HEIGHT: Dimension = { value: 1.75, unit: 'em' };
/** The longest vertical line JLReq advises (§2.4.2: about 52 characters;
 *  beyond that, columns). A page whose margins leave more gets a 52-character
 *  grid in the middle of them. */
export const MAX_VERTICAL_CHARS = 52;
/** 第一章 in a vertical book (`一` reads as japanese-informal in a `ja`
 *  document), 第1章 in a horizontal one (JLReq §4.1, ja-typography §9). */
export const CHAPTER_TEMPLATES: Record<JapaneseBook, string> = {
  vertical: '第{1:一}章',
  horizontal: '第{1}章',
};
/** The engine's caption label in a Japanese document (図1-1　), and in
 *  any other (Figure 1.1. ): `defaultCaptionLabels`. */
export const { labelNumberGap: CAPTION_GAP, labelSeparator: CAPTION_SEPARATOR } = defaultCaptionLabels('ja');
export const { labelNumberGap: DEFAULT_CAPTION_GAP, labelSeparator: DEFAULT_CAPTION_SEPARATOR } = defaultCaptionLabels();
export const DEFAULT_NUMBER_SEPARATOR = ' ';

export const FONTS = { body: 'Noto Serif JP', headings: 'Noto Sans JP' } as const;
/** The Chinese Noto faces: a Chinese book turned Japanese takes the JP
 *  faces without asking, as it does the other script's in the Chinese
 *  list. */
const CHINESE_FONT_SETS = ['zh-Hans', 'zh-Hant', 'zh-HK'].map((l) => chineseFontsFor(l));
export const CJK_BODY_FONTS = new Set<string>([FONTS.body, ...CHINESE_FONT_SETS.map((f) => f.body)]);
export const CJK_HEADING_FONTS = new Set<string>([FONTS.headings, ...CHINESE_FONT_SETS.map((f) => f.headings)]);

/** Kana and kanji (and the CJK marks): what a Japanese design text prints
 *  that a Latin face has no glyphs for. */
export const JAPANESE_LETTERS = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}　-〿！-｠]/u;

/** Heading 行取り and 字下げ (JLReq §4.1.3, §4.1.6; ja-typography §11):
 *  the middle heading (H2) takes three body lines, the low one (H3) two,
 *  each centred in them. A vertical book indents its headings about two
 *  characters more per level: 4, 6 and 8 body characters from the head of
 *  the line. A horizontal book sets them from the line start. */
export const HEADING_LAYOUT: Record<JapaneseBook, Record<1 | 2 | 3, { lineSpan?: number; indent?: number }>> = {
  vertical: { 1: { indent: 4 }, 2: { lineSpan: 3, indent: 6 }, 3: { lineSpan: 2, indent: 8 } },
  horizontal: { 1: {}, 2: { lineSpan: 3 }, 3: { lineSpan: 2 } },
};
export const HEADING_LEVELS = [1, 2, 3] as const;

type ListLevel = Required<Pick<OrderedListLevelConfig, 'level' | 'numberFormat' | 'prefix' | 'separator'>>;

/** Japanese list numbers (ja-typography §9, §12). Vertical: 一、（一）1
 *  （1）①, the kanji counted as Japanese numbers. Horizontal, as official
 *  and technical documents number them (公用文作成の考え方, 2022): 1.
 *  （1） ア （ア） ①. */
export function japaneseListLevels(book: JapaneseBook): ListLevel[] {
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
export const FOREIGN_NOTE_VALUES: Partial<Record<keyof FootnotesConfig, readonly string[]>> = {
  numberFormat: ['circled-decimal', '①'],
  markerPosition: ['inline'],
  numbering: ['page'],
  markerTemplate: ['({n})'],
  noteNumberPosition: ['inline'],
};

/** What a heading template prints for the first chapter (`第{1:一}章` →
 *  第一章 in Japanese). Spelled-out styles show as 1. */
export function sampleHeading(template: string, locale: string): string {
  return template.replace(/\{(\d)(?::([^}]*))?\}/g, (_m, _level: string, style: string | undefined) => {
    const parsed = style ? parseNumberFormat(style, locale) : 'decimal';
    return parsed ? formatNumeral(1, parsed) : '1';
  });
}

/** `42字 × 16行`. */
export function gridText(chars: number, lines: number): string {
  return `${chars}字 × ${lines}行`;
}

/** H2: 3行取り 6字下げ; …, for the levels that set either. */
export function headingLayoutText(levels: readonly HeadingLevelConfig[]): string | null {
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
export function hasVerticalFolio(config: PostextConfig): boolean {
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

export interface Row {
  id: JapaneseDefaultId;
  from: JapaneseDefaultValue;
  to: JapaneseDefaultValue;
  customised: boolean;
  required?: boolean;
  apply: (c: PostextConfig) => PostextConfig;
}
