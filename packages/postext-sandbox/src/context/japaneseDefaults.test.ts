import { describe, expect, it } from 'vitest';
import type { PostextConfig } from 'postext';
import {
  DEFAULT_FOOTER_SLOT,
  cjkGridGeometry,
  defaultResourceTypes,
  resolveBodyTextConfig,
  resolveCjkConfig,
  resolveLayoutConfig,
  resolveOrderedListsConfig,
  resolvePageConfig,
} from 'postext';
import { createDefaultConfig } from './defaultConfig';
import { chineseDefaults } from './chineseDefaults';
import {
  forgetJapaneseDefaults,
  japaneseDefaults,
  recallJapaneseDefaults,
  rememberJapaneseDefaults,
  undoJapaneseDefaults,
  type JapaneseDefaultId,
} from './japaneseDefaults';
import { foreEdgeElements } from '../sidebar/sections/HeaderFooterSection/foreEdge';

const ids = (r: ReturnType<typeof japaneseDefaults>) => r.changes.map((c) => c.id);
const change = (r: ReturnType<typeof japaneseDefaults>, id: JapaneseDefaultId) => r.changes.find((c) => c.id === id);

describe('japaneseDefaults', () => {
  it('sets up a pristine English book as a vertical Japanese book', () => {
    const before = createDefaultConfig('en');
    const r = japaneseDefaults(before, { book: 'vertical', fallbackLocale: 'en' });
    expect(r.locale).toBe('ja');
    expect(ids(r)).toEqual([
      'locale', 'writingMode', 'bodyFont', 'headingFont', 'designFonts', 'lineHeight', 'grid', 'firstLineIndent',
      'hyphenation', 'resourceTypes', 'captionLabel', 'chapterNumbering', 'headingLayout', 'listNumbers',
    ]);
    expect(r.changes.every((c) => c.applied && !c.customised)).toBe(true);
    const c = r.config;
    expect(c.locale).toBe('ja');
    expect(c.layout).toMatchObject({ writingMode: 'vertical-rl' });
    expect(resolvePageConfig(c.page, c.locale, 'vertical-rl').binding).toBe('right');
    expect(c.bodyText?.fontFamily).toBe('Noto Serif JP');
    expect(c.headings?.fontFamily).toBe('Noto Sans JP');
    expect(c.bodyText?.lineHeight).toEqual({ value: 1.75, unit: 'em' });
    expect(c.bodyText?.firstLineIndent).toEqual({ value: 1, unit: 'em' });
    expect(c.resourceTypes).toEqual(defaultResourceTypes('ja'));
    expect(c.resourceTypes?.map((t) => t.name)).toEqual(['図', '表', '動画']);
    expect(c.captionStyle).toEqual({ labelNumberGap: '', labelSeparator: '　' });
    expect(c.headings?.levels).toEqual([
      { level: 1, numberingTemplate: '第{1:一}章', numberSeparator: '　', indent: { value: 4, unit: 'em' } },
      { level: 2, lineSpan: 3, indent: { value: 6, unit: 'em' } },
      { level: 3, lineSpan: 2, indent: { value: 8, unit: 'em' } },
    ]);
    const body = resolveBodyTextConfig(c.bodyText, c.locale);
    expect(body.hyphenation.enabled).toBe(false);
    expect(body.textAlign).toBe('justify');
    const lists = resolveOrderedListsConfig(c.orderedLists, body, c.locale);
    expect(lists.levels.map((l) => [l.numberFormat, l.prefix, l.separator])).toEqual([
      ['japanese-informal', '', '、'],
      ['japanese-informal', '（', '）'],
      ['arabic', '', ''],
      ['arabic', '（', '）'],
      ['circled-decimal', '', ''],
    ]);
    // The notes and the CJK rules are the engine's Japanese defaults: not
    // written into the config.
    expect(c.footnotes).toBeUndefined();
    expect(c.cjk).toEqual({ grid: { enabled: true, charsPerLine: expect.any(Number), linesPerPage: expect.any(Number) } });
    const cjk = resolveCjkConfig(c.cjk, c.locale);
    expect(cjk.region).toBe('japan');
    expect(cjk.lineBreak).toBe('ja-very-strict');
    expect(cjk.emphasisMark.style).toBe('sesame');
    // The page keeps its size and its margins.
    expect(c.page?.sizePreset).toBe(before.page?.sizePreset);
    expect(c.page?.margins).toBe(before.page?.margins);
    expect(c.colorPalette).toBe(before.colorPalette);
  });

  it('works the grid out from the page, the margins, the body size and the leading', () => {
    const base: PostextConfig = {
      ...createDefaultConfig('en'),
      page: { sizePreset: '11x17' },
      layout: { layoutType: 'single' },
      bodyText: { fontSize: { value: 9, unit: 'pt' } },
    };
    const r = japaneseDefaults(base, { book: 'vertical' });
    const grid = r.config.cjk?.grid;
    const g = cjkGridGeometry({ ...r.config, cjk: { grid: { enabled: true } } })!;
    expect(grid).toEqual({ enabled: true, charsPerLine: g.charsPerLine, linesPerPage: g.linesPerPage });
    expect(change(r, 'grid')).toMatchObject({ from: { kind: 'switch', on: false }, to: { kind: 'text', text: `${g.charsPerLine}字 × ${g.linesPerPage}行` } });
    // The grid fits inside the margins: no clamp.
    expect(cjkGridGeometry(r.config)!.clamped).toEqual({});
    // Without the 1.75 leading, the lines the old leading holds.
    const kept = japaneseDefaults(base, { book: 'vertical', include: ['grid'] });
    const gKept = cjkGridGeometry({ ...base, locale: 'ja', layout: { ...base.layout, writingMode: 'vertical-rl' }, cjk: { grid: { enabled: true } } })!;
    expect(kept.config.cjk?.grid?.linesPerPage).toBe(gKept.linesPerPage);
    expect(gKept.linesPerPage).toBeGreaterThan(g.linesPerPage);
  });

  it('keeps a vertical line to 52 characters on a tall page, and leaves a grid of the author\'s alone', () => {
    const tall: PostextConfig = {
      ...createDefaultConfig('en'),
      layout: { layoutType: 'single' },
      page: { sizePreset: '21x28' },
      bodyText: { fontSize: { value: 7, unit: 'pt' } },
    };
    expect(japaneseDefaults(tall, { book: 'vertical' }).config.cjk?.grid?.charsPerLine).toBe(52);
    const own: PostextConfig = { ...createDefaultConfig('en'), cjk: { grid: { enabled: true, charsPerLine: 40, linesPerPage: 15 } } };
    const r = japaneseDefaults(own, { book: 'vertical' });
    expect(ids(r)).not.toContain('grid');
    expect(r.config.cjk?.grid).toEqual({ enabled: true, charsPerLine: 40, linesPerPage: 15 });
  });

  it('sets up a horizontal technical book: left-bound, 第1章, no grid, no heading indents', () => {
    const r = japaneseDefaults(createDefaultConfig('en'), { book: 'horizontal' });
    expect(ids(r)).not.toContain('writingMode');
    expect(ids(r)).not.toContain('grid');
    const c = r.config;
    expect(c.layout).toBeUndefined();
    expect(change(r, 'chapterNumbering')?.to).toEqual({ kind: 'text', text: '第1章' });
    expect(c.headings?.levels).toEqual([
      { level: 1, numberingTemplate: '第{1}章', numberSeparator: '　' },
      { level: 2, lineSpan: 3 },
      { level: 3, lineSpan: 2 },
    ]);
    expect(change(r, 'listNumbers')?.to).toEqual({ kind: 'text', text: '1. （1） ア （ア） ①' });
    expect(change(r, 'headingLayout')).toMatchObject({ from: { kind: 'headingMargins' }, to: { kind: 'text', text: 'H2: 3行取り; H3: 2行取り' } });
  });

  it('turns a vertical Japanese book horizontal without asking about its own vertical values', () => {
    const vertical = japaneseDefaults(createDefaultConfig('en'), { book: 'vertical' }).config;
    const r = japaneseDefaults(vertical, { book: 'horizontal' });
    expect(ids(r)).toEqual(['writingMode', 'chapterNumbering', 'headingLayout', 'listNumbers']);
    expect(r.changes.every((c) => c.applied && !c.customised)).toBe(true);
    expect(r.config.layout?.writingMode).toBeUndefined();
    expect(r.config.headings?.levels?.find((l) => l.level === 1)).toEqual({ level: 1, numberingTemplate: '第{1}章', numberSeparator: '　' });
    expect(r.config.headings?.levels?.find((l) => l.level === 2)).toEqual({ level: 2, lineSpan: 3 });
    // The grid stays: a horizontal Japanese book may keep one.
    expect(r.config.cjk?.grid?.enabled).toBe(true);
    expect(change(r, 'headingLayout')?.from).toEqual({ kind: 'text', text: 'H1: 4字下げ; H2: 3行取り 6字下げ; H3: 2行取り 8字下げ' });
    // And back: nothing left but the direction and what goes with it.
    expect(japaneseDefaults(japaneseDefaults(vertical, { book: 'horizontal' }).config, { book: 'vertical' }).config).toEqual(vertical);
    expect(japaneseDefaults(vertical, { book: 'vertical' }).changes).toEqual([]);
  });

  it('turns a Chinese book Japanese: faces, indent, lists and notes, taking its settings for the other language\'s', () => {
    const chinese = chineseDefaults(createDefaultConfig('en'), { locale: 'zh-Hant', vertical: true }).config;
    const r = japaneseDefaults(chinese, { book: 'vertical' });
    for (const id of ['locale', 'bodyFont', 'headingFont', 'firstLineIndent', 'resourceTypes', 'listNumbers', 'footnotes', 'headingLayout'] as const) {
      expect(change(r, id), id).toMatchObject({ customised: false, applied: true });
    }
    expect(ids(r)).not.toContain('writingMode');
    expect(ids(r)).not.toContain('captionLabel');
    expect(ids(r)).not.toContain('chapterNumbering');
    expect(change(r, 'footnotes')).toMatchObject({ from: { kind: 'footnotes', marker: '①', position: 'inline', numbering: 'page' }, to: { kind: 'japanAuto' } });
    expect(r.config.footnotes).toBeUndefined();
    expect(r.config.bodyText?.fontFamily).toBe('Noto Serif JP');
    expect(change(r, 'resourceTypes')?.to).toEqual({ kind: 'text', text: '図、表、動画' });
    // 第一章 now counts in Japanese numerals: 第{1:一}章 stays as written.
    expect(r.config.headings?.levels?.[0]?.numberingTemplate).toBe('第{1:一}章');
  });

  it('returns East Asian rules to Auto, ticked when a Chinese region is set, else as the author\'s', () => {
    const chineseRules: PostextConfig = { ...createDefaultConfig('en'), cjk: { region: 'mainland', lineBreak: 'gb', emphasisMark: { style: 'auto' }, uprightDigits: 3 } };
    const r = japaneseDefaults(chineseRules, { book: 'vertical' });
    expect(change(r, 'cjkRules')).toMatchObject({ from: { kind: 'cjkFields', fields: ['region', 'lineBreak'] }, to: { kind: 'japanAuto' }, customised: false, applied: true });
    expect(r.config.cjk).toEqual({ emphasisMark: { style: 'auto' }, uprightDigits: 3, grid: expect.objectContaining({ enabled: true }) });

    const own: PostextConfig = { ...createDefaultConfig('en'), cjk: { lineBreak: 'ja-strict', hangingPunctuation: 'none', region: 'japan' } };
    const kept = japaneseDefaults(own, { book: 'horizontal' });
    expect(change(kept, 'cjkRules')).toMatchObject({ from: { kind: 'cjkFields', fields: ['lineBreak', 'hangingPunctuation'] }, customised: true, applied: false });
    expect(kept.config.cjk).toBe(own.cjk);
    expect(japaneseDefaults(own, { book: 'horizontal', include: ['cjkRules'] }).config.cjk).toEqual({ region: 'japan' });
  });

  it('keeps a Japanese tag the book has, and the author\'s own settings unticked', () => {
    const base: PostextConfig = {
      ...createDefaultConfig('en'),
      locale: 'ja-JP',
      bodyText: { fontFamily: 'Shippori Mincho', firstLineIndent: { value: 0, unit: 'em' }, lineHeight: { value: 2, unit: 'em' } },
      headings: { levels: [{ level: 2, lineSpan: 4 }] },
      page: { binding: 'left', pageNumbering: { format: 'lower-roman' } },
      layout: { writingMode: 'vertical-rl' },
    };
    const r = japaneseDefaults(base, { book: 'vertical' });
    expect(r.locale).toBe('ja-JP');
    expect(ids(r)).not.toContain('locale');
    for (const id of ['bodyFont', 'firstLineIndent', 'lineHeight', 'headingLayout', 'binding', 'folio'] as const) {
      expect(change(r, id), id).toMatchObject({ customised: true, applied: false });
    }
    expect(r.config.bodyText?.fontFamily).toBe('Shippori Mincho');
    expect(r.config.headings?.levels?.find((l) => l.level === 2)).toEqual({ level: 2, lineSpan: 4 });
    expect(r.config.page?.binding).toBe('left');
  });

  it('prints the folio in kanji only when the design sets it vertically', () => {
    const plain = japaneseDefaults(createDefaultConfig('en'), { book: 'vertical' });
    expect(ids(plain)).not.toContain('folio');
    const [head, folio] = foreEdgeElements(new Set(), { value: 9, unit: 'pt' });
    const foreEdge: PostextConfig = { ...createDefaultConfig('en'), footer: { ...DEFAULT_FOOTER_SLOT, elements: [head, folio] } };
    const r = japaneseDefaults(foreEdge, { book: 'vertical' });
    expect(change(r, 'folio')).toMatchObject({ from: { kind: 'text', text: '105' }, to: { kind: 'text', text: '一〇五' }, customised: false, applied: true });
    expect(r.config.page?.pageNumbering?.format).toBe('cjk-decimal');
    // A horizontal Japanese book keeps a kanji folio set vertically too;
    // the folio goes back to Arabic once the design sets it across.
    const across = { ...r.config, footer: { ...DEFAULT_FOOTER_SLOT } };
    const back = japaneseDefaults(across, { book: 'vertical' });
    expect(change(back, 'folio')).toMatchObject({ to: { kind: 'text', text: '105' }, applied: true });
    expect(back.config.page?.pageNumbering).toBeUndefined();
  });

  it('moves design texts set in a face without kana to the headings\' face', () => {
    const r = japaneseDefaults(createDefaultConfig('en'), { book: 'vertical' });
    expect(change(r, 'designFonts')).toMatchObject({ from: { kind: 'text', text: 'Open Sans' }, to: { kind: 'text', text: 'Noto Sans JP' } });
    const fonts = JSON.stringify([r.config.header, r.config.footer]);
    expect(fonts).toContain('Noto Sans JP');
    expect(fonts).not.toContain('Open Sans');
    // With the font list: a family that lists the japanese subset stays.
    const listed = japaneseDefaults(createDefaultConfig('en'), { book: 'vertical', fontSubsets: (f) => (f === 'Open Sans' ? ['japanese', 'latin'] : undefined) });
    expect(ids(listed)).not.toContain('designFonts');
  });

  it('is taken back by undo, keeping what the author changed since', () => {
    const before = createDefaultConfig('en');
    const after = japaneseDefaults(before, { book: 'vertical' }).config;
    expect(undoJapaneseDefaults(after, before, after)).toEqual({ config: before, kept: [] });
    const edited: PostextConfig = { ...after, bodyText: { ...after.bodyText, fontFamily: 'Zen Old Mincho' } };
    const undone = undoJapaneseDefaults(edited, before, after);
    expect(undone.kept).toEqual(['bodyText.fontFamily']);
    expect(undone.config.bodyText?.fontFamily).toBe('Zen Old Mincho');
    expect(undone.config.locale).toBe(before.locale);
    expect(resolveLayoutConfig(undone.config.layout).writingMode).toBe('horizontal-tb');
  });

  it('remembers the last application for its book only', () => {
    forgetJapaneseDefaults();
    rememberJapaneseDefaults({ book: 'a', at: 0, status: { kind: 'applied', count: 3 }, undo: null });
    expect(recallJapaneseDefaults('a', 1000)?.status).toEqual({ kind: 'applied', count: 3 });
    expect(recallJapaneseDefaults('b', 1000)).toBeNull();
    expect(recallJapaneseDefaults('a', 1000)).toBeNull();
  });
});
