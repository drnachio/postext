import { describe, it, expect } from 'vitest';
import {
  cjkRegionOf,
  DOCUMENT_LANGUAGES,
  isJapaneseLanguage,
  renderLangOf,
  stringsFor,
  stringsKeyOf,
} from '../locale';
import {
  defaultCjkBookTitleMark,
  defaultCjkCompression,
  defaultCjkLineBreak,
  defaultCjkPunctuationWidth,
  defaultCjkWarichuBrackets,
  resolveCjkConfig,
  stripCjkDefaults,
} from '../defaults/cjk';
import { defaultResourceTypes } from '../defaults/resourceTypes';
import { defaultTableContinuationStrings } from '../defaults/tableStyle';
import { defaultCrossRefStrings } from '../pipeline/crossRefs';
import { defaultBibliographyTitle } from '../pipeline/citations';
import { resolveAllConfig } from '../pipeline/config';
import { expandIndexDirectives } from '../pipeline/indexDirective';
import { parseMarkdown } from '../parse';
import { buildDocument } from '../pipeline';
import { verticalCellEms, verticalOrientation } from '../writingMode';
import { cjkClassOf } from '../measure/cjkClasses';
import { mayHang, punctuationAdvance, punctuationSide, type CjkComposition } from '../measure/cjkPunctuation';
import type { CjkRegion, OutlineEntry, PostextConfig } from '../types';
import type { VDTDocument, VDTLine } from '../vdt';
import { installSizedStub } from './vertical/stub';

// The document language `ja` and the `japan` CJK region (#416): Japanese
// is no longer composed as mainland Chinese, and its built-in strings are
// Japanese. The stub measures kana and kanji 1 em, Latin ½ em.
installSizedStub();

const pt = (value: number) => ({ value, unit: 'pt' as const });
/** 72 dpi, 20 px text on a 30 px line, a measure of 20 characters. */
const config = (extra: Partial<PostextConfig> = {}): PostextConfig => ({
  locale: 'ja',
  page: { width: pt(440), height: pt(600), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontSize: pt(20), lineHeight: pt(30), textAlign: 'justify', firstLineIndent: pt(0) },
  ...extra,
});
const lines = (doc: VDTDocument): VDTLine[] => doc.blocks.filter((b) => b.type === 'paragraph').flatMap((b) => b.lines);

describe('Japanese locale tags', () => {
  it('read as the japan region, keyed ja', () => {
    for (const tag of ['ja', 'ja-JP', 'JA_jp', 'ja-Jpan', 'ja-Jpan-JP', 'ja-Latn']) {
      expect([isJapaneseLanguage(tag), cjkRegionOf(tag), stringsKeyOf(tag)], tag).toEqual([true, 'japan', 'ja']);
    }
    for (const tag of ['zh', 'zh-Hant', 'ko', 'jv', 'en', '', undefined, 42]) expect(isJapaneseLanguage(tag), String(tag)).toBe(false);
    expect(cjkRegionOf('ko')).toBeUndefined();
    expect(renderLangOf({ locale: 'ja-jp' })).toBe('ja-JP');
  });

  it('are a document language, named in Japanese, after Chinese and before Arabic', () => {
    const tags = DOCUMENT_LANGUAGES.map((l) => l.tag);
    expect(tags.indexOf('ja')).toBe(tags.indexOf('zh-Hant-HK') + 1);
    expect(tags.indexOf('ar')).toBe(tags.indexOf('ja') + 1);
    expect(DOCUMENT_LANGUAGES.find((l) => l.tag === 'ja')!.name).toBe('日本語');
  });

  it('never borrow a Chinese string', () => {
    expect(stringsFor({ en: 'Figure', 'zh-hans': '图', 'zh-hant': '圖' }, 'ja-JP')).toBe('Figure');
    expect(stringsFor({ en: 'Figure', ja: '図', 'zh-hans': '图' }, 'ja-JP')).toBe('図');
  });
});

describe('cjk defaults for Japan', () => {
  it('resolves auto: JIS X 4051 breaks (ja-very-strict), full-width marks with compression and trimming, hanging 、。, sesame emphasis, 『』 titles, （） warichu', () => {
    expect(resolveCjkConfig(undefined, 'ja')).toMatchObject({
      region: 'japan',
      lineBreak: 'ja-very-strict',
      punctuationWidth: 'fullwidth',
      compressAdjacent: true,
      trimLineStart: true,
      hangingPunctuation: 'allow',
      spaceAfterQuestion: true,
      paragraphStartBracket: 'half',
      emphasis: 'dots',
      emphasisMark: { style: 'sesame', fill: 'auto', position: 'over' },
      bookTitleMark: 'brackets',
      bookTitleBrackets: [{ open: '『', close: '』' }, { open: '「', close: '」' }],
      warichu: { open: '（', close: '）' },
    });
    expect(resolveAllConfig({ locale: 'ja-JP' }).cjk.region).toBe('japan');
  });

  it('per region, through the default resolvers', () => {
    expect(defaultCjkLineBreak('japan')).toBe('ja-very-strict');
    expect(defaultCjkPunctuationWidth('japan')).toBe('fullwidth');
    expect(defaultCjkCompression('japan')).toBe(true);
    expect(defaultCjkBookTitleMark('japan')).toBe('brackets');
    expect(defaultCjkWarichuBrackets('japan')).toEqual({ open: '（', close: '）' });
    // The Chinese regions are unchanged.
    expect((['mainland', 'taiwan', 'hongkong'] as CjkRegion[]).map((r) => [defaultCjkLineBreak(r), defaultCjkPunctuationWidth(r), defaultCjkBookTitleMark(r), defaultCjkWarichuBrackets(r).open]))
      .toEqual([['gb', 'kaiming', 'brackets', ''], ['basic', 'fullwidth', 'wavy', ''], ['basic', 'fullwidth', 'wavy', '']]);
    expect(resolveCjkConfig(undefined, 'zh-Hans').emphasis).toBe('dots');
    expect(resolveCjkConfig(undefined, 'ko').emphasis).toBe('italic');
  });

  it('keeps what the author sets, an empty bracket included', () => {
    expect(resolveCjkConfig({ lineBreak: 'none', punctuationWidth: 'kaiming', emphasis: 'italic', bookTitleMark: 'brackets' }, 'ja'))
      .toMatchObject({ region: 'japan', lineBreak: 'none', punctuationWidth: 'kaiming', emphasis: 'italic', bookTitleMark: 'brackets' });
    expect(resolveCjkConfig({ warichu: { open: '', close: '' } }, 'ja').warichu).toMatchObject({ open: '', close: '' });
    expect(resolveCjkConfig({ warichu: { open: '〔', close: '〕' } }, 'ja').warichu).toMatchObject({ open: '〔', close: '〕' });
    // A Japanese region chosen by hand in a Chinese document.
    expect(resolveCjkConfig({ region: 'japan' }, 'zh-Hans')).toMatchObject({ region: 'japan', warichu: { open: '（' } });
    // An empty bracket survives stripping: it is no default in Japan.
    expect(stripCjkDefaults({ warichu: { open: '', close: '' } })).toEqual({ warichu: { open: '', close: '' } });
    expect(stripCjkDefaults({ region: 'japan' })).toEqual({ region: 'japan' });
  });
});

describe('Japanese marks', () => {
  const japan: CjkComposition = { region: 'japan', punctuationWidth: 'fullwidth', compressAdjacent: true, trimLineStart: true, hangingPunctuation: 'allow', latinSpacing: { em: 0.25 } };
  const em = 20;

  it('、。 keep their blank after the glyph, as on the mainland', () => {
    for (const g of ['、', '。']) expect(punctuationSide(g, cjkClassOf(g), 'japan'), g).toBe('end');
    expect(punctuationAdvance('、', cjkClassOf('、'), em, em, japan).advance).toBe(em);
    // An opening bracket at a line start gives up its outer half (天付き);
    // a closing one at a line end keeps it (JLReq §3.1.9, #418).
    expect(punctuationAdvance('「', cjkClassOf('「'), em, em, japan, { lineStart: true }).advance).toBe(em / 2);
    expect(punctuationAdvance('」', cjkClassOf('」'), em, em, japan, { lineEnd: true }).advance).toBe(em);
  });

  it('・ keeps its whole em (JLReq §3.1.2), the mainland interpunct half of it', () => {
    expect(punctuationAdvance('・', cjkClassOf('・'), em, em, japan).advance).toBe(em);
    expect(punctuationAdvance('・', cjkClassOf('・'), em, em, { ...japan, region: 'mainland' }).advance).toBe(em / 2);
    expect(verticalCellEms('・', 'japan')).toBe(1);
    expect(verticalCellEms('・', 'mainland')).toBe(0.5);
  });

  it('hang 、，。． only, in either writing mode', () => {
    for (const vertical of [false, true]) {
      const c = { ...japan, ...(vertical ? { vertical } : {}) };
      for (const g of ['、', '，', '。', '．']) expect(mayHang(g, cjkClassOf(g), c), `${g} ${vertical}`).toBe(true);
      for (const g of ['？', '！', '：', '；', '」']) expect(mayHang(g, cjkClassOf(g), c), `${g} ${vertical}`).toBe(false);
    }
    // Unchanged elsewhere: the mainland hangs ？ too, horizontal Taiwan nothing.
    expect(mayHang('？', cjkClassOf('？'), { ...japan, region: 'mainland' })).toBe(true);
    expect(mayHang('。', cjkClassOf('。'), { ...japan, region: 'taiwan' })).toBe(false);
  });

  it('vertical text: 、。 in the corner, ！？ upright, “” as 〝〟 (#419), never as 『』', () => {
    expect(verticalOrientation('。', 'japan')).toMatchObject({ orient: 'alternate', fallback: 'corner' });
    expect(verticalOrientation('、', 'japan')).toMatchObject({ orient: 'alternate', fallback: 'corner' });
    expect(verticalOrientation('！', 'japan')).toEqual({ orient: 'upright' });
    expect(verticalOrientation('？', 'japan')).toEqual({ orient: 'upright' });
    expect(verticalOrientation('“', 'japan')).toEqual({ orient: 'alternate', fallback: 'rotate', paintAs: '〝' });
    expect(verticalOrientation('“', 'mainland').substitute).toBe('『');
    for (const g of ['あ', 'カ', '漢', 'ー']) expect(verticalOrientation(g, 'japan').orient, g).not.toBe('sideways');
  });
});

describe('Japanese text in a build', () => {
  it('*…* sets emphasis marks (the sesame, J6 #421) on kana and kanji; Latin keeps its italics', () => {
    const doc = buildDocument({ markdown: 'これは*大切な*ことと *emphasis* の違い' }, config());
    const line = lines(doc)[0]!;
    expect(line.marks!.filter((m) => m.kind === 'sesame')).toHaveLength(3);
    expect(line.segments!.find((s) => s.text === 'emphasis')!.italic).toBe(true);
  });

  it(':book sets 『』 around the title (J6, #421); 『』 typed by the author stay', () => {
    const doc = buildDocument({ markdown: '漱石の:book[こころ]と『坊っちゃん』' }, config());
    expect(lines(doc)[0]!.text).toBe('漱石の『こころ』と『坊っちゃん』');
    expect(lines(doc)[0]!.marks).toBeUndefined();
  });

  it('a warichu note is set between （ ）, unless the note or the config says otherwise', () => {
    const brackets = (md: string, extra: Partial<PostextConfig> = {}): string[] =>
      lines(buildDocument({ markdown: md }, config(extra))).flatMap((l) => l.segments ?? []).filter((s) => s.inserted).map((s) => s.text);
    expect(brackets('本文:warichu[わりちゅう]本文')).toEqual(['（', '）']);
    expect(brackets('本文:warichu[わりちゅう]{open="〔" close="〕"}本文')).toEqual(['〔', '〕']);
    expect(brackets('本文:warichu[わりちゅう]本文', { cjk: { warichu: { open: '', close: '' } } })).toEqual([]);
    // Chinese warichu stays bare.
    expect(brackets('本文:warichu[夾注]本文', { locale: 'zh-Hans' })).toEqual([]);
  });
});

describe('Japanese built-in strings', () => {
  it('figures and tables: 図 and 表, numbered 1-1', () => {
    for (const tag of ['ja', 'ja-JP']) {
      const [figure, table] = defaultResourceTypes(tag);
      expect([figure!.name, figure!.namePlural, figure!.shortLabel, figure!.captionPrefix], tag).toEqual(['図', '図', '図', '図']);
      expect([table!.name, table!.namePlural, table!.shortLabel, table!.captionPrefix], tag).toEqual(['表', '表', '表', '表']);
      expect([figure!.numberingTemplate, table!.numberingTemplate]).toEqual(['{h1}-{n}', '{h1}-{n}']);
    }
  });

  it('continuations, cross-references and the bibliography', () => {
    expect(defaultTableContinuationStrings('ja')).toEqual({ continuedSuffix: '（続き）', continuesMarker: '次ページへ続く' });
    const resolved = resolveAllConfig({ locale: 'ja-JP', calloutStyles: [{ id: 'note' }] });
    expect(resolved.tableStyle.continuedSuffix).toBe('（続き）');
    expect(resolved.calloutStyles.find((c) => c.id === 'note')!.continuesMarker).toBe('次ページへ続く');
    expect(defaultCrossRefStrings('ja')).toEqual({ chapter: '第{n}章', section: '{n}節', page: '{n}ページ' });
    expect(defaultBibliographyTitle('ja-JP')).toBe('参考文献');
  });

  const markEntry = (path: string[], pageIndex: number, extra: Partial<NonNullable<OutlineEntry['indexMark']>> = {}): OutlineEntry => ({
    kind: 'indexMark', level: 0, title: path.join('!'), number: '', numbered: false, listed: false,
    indexMark: { index: '', path, sourceStart: pageIndex * 100 + path.length, ...extra },
    pageIndex, pageLabel: String(pageIndex + 1), pageFormat: 'decimal',
  });
  const expand = (config: PostextConfig, outline: OutlineEntry[]) =>
    expandIndexDirectives(parseMarkdown(':::index'), outline, resolveAllConfig(config)).blocks.filter((b) => b.index);

  it('index: → for see, →…も見よ for see also, upright; 記号 and 数字 heads', () => {
    const outline = [
      markEntry(['夏目漱石'], 1), markEntry(['金之助'], 2, { see: '夏目漱石', yomi: 'きんのすけ' }),
      markEntry(['正岡子規'], 3, { seeAlso: '夏目漱石', yomi: 'まさおかしき' }), markEntry(['正岡子規'], 4, { seeAlso: '森鷗外', yomi: 'まさおかしき' }), markEntry(['森鷗外'], 5),
      markEntry(['#'], 6), markEntry(['1914'], 7),
    ];
    const blocks = expand({ locale: 'ja' }, outline);
    const text = blocks.map((b) => `${b.index!.group ? `[${b.index!.group}] ` : ''}${b.text}`);
    // Heads are gojūon rows taken from the readings (#425).
    expect(text).toContain('[か行] 金之助　→夏目漱石');
    expect(text).toContain('[ま行] 正岡子規, 4–5　→夏目漱石、森鷗外も見よ');
    expect(text.some((t) => t.startsWith('[記号]'))).toBe(true);
    expect(text.some((t) => t.startsWith('[数字]'))).toBe(true);
    const spans = blocks.flatMap((b) => b.spans ?? []);
    expect(spans.filter((s) => s.text === '→' || s.text === 'も見よ').every((s) => !s.italic)).toBe(true);
    // An author's own label stands alone.
    const own = expand({ locale: 'ja', index: { see: { alsoLabel: '参照' } } }, outline).map((b) => b.text);
    expect(own).toContain('正岡子規, 4–5　参照夏目漱石、森鷗外');
  });
});
