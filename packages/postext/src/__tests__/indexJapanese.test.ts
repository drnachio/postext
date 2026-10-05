import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline';
import { expandIndexDirectives } from '../pipeline/indexDirective';
import { indexGrouping } from '../pipeline/indexGroups';
import { GOJUON, GOJUON_ROWS, compareJapanese, gojuonRow, japaneseLead, sameJapaneseBase } from '../pipeline/indexJapanese';
import { computeOutline } from '../pipeline/outline';
import { parseMarkdown } from '../parse';
import { resolveAllConfig } from '../pipeline/config';
import { resolveIndexConfig, stripIndexDefaults } from '../defaults/indexConfig';
import { resolveBodyTextConfig } from '../defaults/bodyText';
import type { ContentBlock } from '../parse';
import type { OutlineEntry, PostextConfig } from '../types';

// The Japanese back-of-book index (#425): readings, JIS X 4061 order and
// gojūon heads.

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: [...s].length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const base: PostextConfig = {
  page: { width: pt(360), height: pt(300), margins: { top: pt(18), bottom: pt(18), left: pt(18), right: pt(18) } },
  layout: { layoutType: 'single' },
};

const markEntry = (path: string[], pageIndex: number, extra: Partial<NonNullable<OutlineEntry['indexMark']>> = {}): OutlineEntry => ({
  kind: 'indexMark', level: 0, title: path.join('!'), number: '', numbered: false, listed: false,
  indexMark: { index: '', path, sourceStart: pageIndex * 100 + path.length, ...extra },
  pageIndex, pageLabel: String(pageIndex + 1), pageFormat: 'decimal',
});

/** The entry blocks of an expansion: `[head] text`, `+` where a group
 *  starts without a head, two spaces per sub-level. */
const expanded = (blocks: ContentBlock[]): string[] => blocks.filter((b) => b.index).map((b) =>
  `${'  '.repeat(b.index!.level)}${b.index!.group ? `[${b.index!.group}] ` : b.index!.groupStart ? '+ ' : ''}${b.text}`);

const directive = parseMarkdown(':::index');
const expand = (config: PostextConfig, outline: OutlineEntry[]) =>
  expandIndexDirectives(directive, outline, resolveAllConfig({ ...base, ...config }));
const build = (config: PostextConfig, outline: OutlineEntry[]) => expanded(expand(config, outline).blocks);

const sorted = (list: string[]) => [...list].sort(compareJapanese);

describe('JIS X 4061 order', () => {
  it('reads katakana as hiragana, hiragana first on a tie', () => {
    expect(sameJapaneseBase('カメラ', 'かめら')).toBe(true);
    expect(sorted(['カキ', 'かき', 'かく', 'カカ'])).toEqual(['カカ', 'かき', 'カキ', 'かく']);
  });

  it('reads voiced kana as plain, 清 < 濁 < 半濁 on a tie', () => {
    expect(sorted(['ぱん', 'はん', 'ばん'])).toEqual(['はん', 'ばん', 'ぱん']);
    // The base letters decide first: ぱい (はい), ばか (はか), はなし.
    expect(sorted(['はなし', 'ばか', 'ぱい'])).toEqual(['ぱい', 'ばか', 'はなし']);
    expect(sorted(['ヴァイオリン', 'うさぎ', 'ういろう'])).toEqual(['ヴァイオリン', 'ういろう', 'うさぎ']);
  });

  it('reads small kana as large, small first on a tie', () => {
    expect(sorted(['きつね', 'きって', 'きつて'])).toEqual(['きって', 'きつて', 'きつね']);
    expect(sorted(['しよう', 'しょう'])).toEqual(['しょう', 'しよう']);
    expect(sameJapaneseBase('ヵ月', 'か月')).toBe(true);
  });

  it('reads ー as the vowel before it, and sets it before the vowel written out', () => {
    // コーヒー reads こおひい: after こうちゃ, before こおり.
    expect(sorted(['こおり', 'コーヒー', 'こうちゃ'])).toEqual(['こうちゃ', 'コーヒー', 'こおり']);
    expect(sameJapaneseBase('カード', 'かあど')).toBe(true);
    expect(sorted(['かあど', 'カード'])).toEqual(['カード', 'かあど']);
    // ン repeats itself; a long mark after the vowel row of や or わ.
    expect(sameJapaneseBase('ヨーヨー', 'よおよお')).toBe(true);
    expect(sameJapaneseBase('ワー', 'わあ')).toBe(true);
  });

  it('expands the iteration marks, before the letter written out on a tie', () => {
    expect(sameJapaneseBase('いすゞ', 'いすず')).toBe(true);
    expect(sameJapaneseBase('こゝろ', 'こころ')).toBe(true);
    expect(sameJapaneseBase('ハヽ', 'はは')).toBe(true);
    expect(sorted(['いすず', 'いすゞ'])).toEqual(['いすゞ', 'いすず']);
    // ー < small < iteration < large.
    expect(sorted(['ああ', 'あゝ', 'あぁ', 'あー'])).toEqual(['あー', 'あぁ', 'あゝ', 'ああ']);
    // かゝ reads かか: after かあ.
    expect(sorted(['かゝ', 'かあ'])).toEqual(['かあ', 'かゝ']);
  });

  it('orders the gojūon rows, ん last', () => {
    const letters = [...GOJUON];
    expect(sorted([...letters].reverse())).toEqual(letters);
    expect(letters.slice(-5)).toEqual(['わ', 'ゐ', 'ゑ', 'を', 'ん']);
    expect(GOJUON_ROWS.map((r) => GOJUON[r.start])).toEqual([...'あかさたなはまやらわ']);
    expect([...'あおかこさそたとなのはほまもやよらろわん'].map((c) => gojuonRow(GOJUON.indexOf(c))))
      .toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9]);
  });

  it('sets symbols, digits, Latin, kana, kanji and geta in that order; digit runs by value', () => {
    expect(sorted(['漢字', 'かな', 'Latin', '10章', '2章', '〓', '「題」', ' 空白']))
      .toEqual([' 空白', '「題」', '2章', '10章', 'Latin', 'かな', '漢字', '〓']);
    // Fullwidth and halfwidth forms fold (NFKC).
    expect(sameJapaneseBase('ＡＢＣ', 'abc')).toBe(true);
    expect(sameJapaneseBase('ｶﾞｸ', 'がく')).toBe(true);
    expect(sorted(['１０', '９'])).toEqual(['９', '１０']);
    expect(['かな', 'abc', '12', '・', '漢', 'ーあ'].map((k) => japaneseLead(k).kind))
      .toEqual(['kana', 'latin', 'digit', 'symbol', 'kanji', 'symbol']);
  });
});

describe('index.groupBy gojuon and kana', () => {
  const outline = () => [
    markEntry(['夏目漱石'], 1, { yomi: 'なつめそうせき' }),
    markEntry(['芥川龍之介'], 2, { yomi: 'あくたがわりゅうのすけ' }),
    markEntry(['森鷗外'], 3, { yomi: 'もりおうがい' }),
    markEntry(['カメラ'], 4),
    markEntry(['樋口一葉'], 5, { yomi: 'ひぐちいちよう' }),
    markEntry(['ガラス'], 6),
    markEntry(['吾輩は猫である'], 7, { yomi: 'わがはいはねこである' }),
    markEntry(['坊っちゃん'], 8, { yomi: 'ぼっちゃん' }),
    markEntry(['こころ'], 9),
  ];

  it('auto groups a Japanese index by gojūon row', () => {
    expect(build({ locale: 'ja' }, outline())).toEqual([
      '[あ行] 芥川龍之介, 3',
      // ガラス reads からす, after カメラ (かめら): め comes before ら.
      '[か行] カメラ, 5', 'ガラス, 7', 'こころ, 10',
      '[な行] 夏目漱石, 2',
      '[は行] 樋口一葉, 6', '坊っちゃん, 9',
      '[ま行] 森鷗外, 4',
      '[わ行] 吾輩は猫である, 8',
    ]);
    expect(build({ locale: 'ja-JP' }, outline())).toEqual(build({ locale: 'ja', index: { groupBy: 'gojuon' } }, outline()));
    expect(expand({ locale: 'ja' }, outline()).warnings).toEqual([]);
  });

  it('kana grouping heads each kana; letter does the same in Japanese', () => {
    const kana = build({ locale: 'ja', index: { groupBy: 'kana' } }, outline());
    expect(kana).toEqual([
      '[あ] 芥川龍之介, 3', '[か] カメラ, 5', 'ガラス, 7', '[こ] こころ, 10', '[な] 夏目漱石, 2',
      '[ひ] 樋口一葉, 6', '[ほ] 坊っちゃん, 9', '[も] 森鷗外, 4', '[わ] 吾輩は猫である, 8',
    ]);
    expect(build({ locale: 'ja', index: { groupBy: 'letter' } }, outline())).toEqual(kana);
  });

  it('none sets no heads, in reading order', () => {
    expect(build({ locale: 'ja', index: { groupBy: 'none' } }, outline())).toEqual([
      '芥川龍之介, 3', 'カメラ, 5', 'ガラス, 7', 'こころ, 10', '夏目漱石, 2', '樋口一葉, 6', '坊っちゃん, 9', '森鷗外, 4', '吾輩は猫である, 8',
    ]);
  });

  it('files symbols, numbers and Latin before the kana, unread kanji after them', () => {
    const list = [
      markEntry(['東京'], 1, { yomi: 'とうきょう' }),
      markEntry(['JIS X 4061'], 2),
      markEntry(['2進法'], 3, { yomi: '2しんほう' }),
      markEntry(['「こころ」'], 4),
      markEntry(['京都'], 5),
      markEntry(['Unicode'], 6),
      markEntry(['大阪'], 7),
      markEntry(['あんず'], 8),
    ];
    const labels = { groups: { symbolsLabel: '記号', numbersLabel: '数字' } };
    expect(build({ locale: 'ja', index: labels }, list)).toEqual([
      '[記号] 「こころ」, 5',
      '[数字] 2進法, 4',
      '[J] JIS X 4061, 3', '[U] Unicode, 7',
      '[あ行] あんず, 9', '[た行] 東京, 2',
      // No reading: after the kana, with no head, by code point.
      '+ 京都, 6', '大阪, 8',
    ]);
    expect(expand({ locale: 'ja' }, list).warnings).toMatchObject([
      { kind: 'indexReadingMissing', term: '京都', index: '' },
      { kind: 'indexReadingMissing', term: '大阪', index: '' },
    ]);
  });

  it('reads yomi first, then the ruby of the marked text, then sort', () => {
    const list = [
      // The reading wins over a sort key.
      markEntry(['日本'], 1, { yomi: 'にほん', sort: 'やまと' }),
      markEntry(['大和'], 2, { rubyYomi: 'やまと', sort: 'だいわ' }),
      markEntry(['生田'], 3, { sort: 'いくた' }),
    ];
    expect(build({ locale: 'ja' }, list)).toEqual(['[あ行] 生田, 4', '[な行] 日本, 2', '[や行] 大和, 3']);
    // A sort key with a kanji is no reading.
    expect(expand({ locale: 'ja' }, [markEntry(['重陽'], 1, { sort: '重陽' })]).warnings)
      .toMatchObject([{ kind: 'indexReadingMissing', term: '重陽' }]);
  });

  it('sorts sub-entries by their readings and names an unread one by its path', () => {
    const list = [
      markEntry(['漱石', '門'], 1, { yomi: 'もん' }),
      markEntry(['漱石', '三四郎'], 2, { yomi: 'さんしろう' }),
      markEntry(['漱石', 'それから'], 3),
      markEntry(['漱石', '草枕'], 4),
      markEntry(['漱石'], 5, { yomi: 'そうせき' }),
    ];
    expect(build({ locale: 'ja' }, list)).toEqual(['[さ行] 漱石, 6', '  三四郎, 3', '  それから, 4', '  門, 2', '  草枕, 5']);
    expect(expand({ locale: 'ja' }, list).warnings).toMatchObject([{ kind: 'indexReadingMissing', term: '漱石!草枕', index: '' }]);
  });

  it('a gojūon grouping sorts by reading in any document language', () => {
    expect(build({ locale: 'en', index: { groupBy: 'gojuon' } }, [markEntry(['東京'], 1, { yomi: 'とうきょう' }), markEntry(['青森'], 2, { yomi: 'あおもり' })]))
      .toEqual(['[あ行] 青森, 3', '[た行] 東京, 2']);
    // yomi alone sorts an index of another language like `sort`.
    expect(build({}, [markEntry(['Zeta'], 1, { yomi: 'alpha' }), markEntry(['beta'], 2)])).toEqual(['[A] Zeta, 2', '[B] beta, 3']);
  });

  it('resolves auto per locale and keeps the new values', () => {
    expect(['ja', 'ja-JP', 'ja_JP', 'ja-Jpan', 'zh', 'en'].map((l) => indexGrouping('auto', l)))
      .toEqual(['gojuon', 'gojuon', 'gojuon', 'gojuon', 'pinyin', 'letter']);
    expect(indexGrouping('kana', 'en')).toBe('kana');
    const body = resolveBodyTextConfig(undefined);
    expect(resolveIndexConfig({ groupBy: 'gojuon' }, body).groupBy).toBe('gojuon');
    expect(resolveIndexConfig({ groupBy: 'kana' }, body).groupBy).toBe('kana');
    expect(stripIndexDefaults({ groupBy: 'kana' })).toEqual({ groupBy: 'kana' });
  });
});

describe('index marks: readings', () => {
  const marksOf = (md: string) => parseMarkdown(md).flatMap((b) => b.indexMarks ?? []);

  it('reads yomi and its alias reading', () => {
    const marks = marksOf('漱石:index{term="夏目漱石" yomi="なつめそうせき"}と鷗外:index{term="森鷗外" reading=" もりおうがい "}。');
    expect(marks.map((m) => [m.path[0], m.yomi])).toEqual([['夏目漱石', 'なつめそうせき'], ['森鷗外', 'もりおうがい']]);
  });

  it('takes the kana ruby of the marked text as its reading', () => {
    const [mark] = marksOf('首都は:index[{東京|とう|きょう}]です。');
    expect(mark!.path).toEqual(['東京']);
    expect(mark!.rubyYomi).toBe('とうきょう');
    // Kana outside the ruby joins the reading; ruby read in one group too.
    expect(marksOf(':index[お{茶|ちゃ}]')[0]!.rubyYomi).toBe('おちゃ');
    expect(marksOf(':index[{明日|あした}]')[0]!.rubyYomi).toBe('あした');
    // The paragraph keeps the ruby.
    const [b] = parseMarkdown('首都は:index[{東京|とう|きょう}]です。');
    expect(b!.text).toBe('首都は東京です。');
    expect(b!.spans.some((s) => s.ruby)).toBe(true);
  });

  it('gives no ruby reading when a kanji stays unread, a reading is not kana, or the text is not the entry', () => {
    expect(marksOf(':index[{東京|とう|きょう}駅]')[0]!.rubyYomi).toBeUndefined();
    expect(marksOf(':index[{紅樓|hóng|lóu}]')[0]!.rubyYomi).toBeUndefined();
    expect(marksOf(':index[{東京|とう|きょう}]{sub="地下鉄"}')[0]!.rubyYomi).toBeUndefined();
    expect(marksOf(':index[{東京|とう|きょう}]{term="首都"}')[0]!.rubyYomi).toBeUndefined();
    // An explicit yomi makes the ruby reading moot.
    expect(marksOf(':index[{東京|とう|きょう}]{yomi="とうけい"}')[0]).toMatchObject({ yomi: 'とうけい' });
    expect(marksOf(':index[{東京|とう|きょう}]{yomi="とうけい"}')[0]!.rubyYomi).toBeUndefined();
  });

  it('carries the readings through the outline into the index', () => {
    const md = '# 本文\n\n:index[{東京|とう|きょう}]、:index[青森]{yomi="あおもり"}、:index[京都]。\n\n# 索引\n\n:::index';
    const outline = computeOutline(parseMarkdown(md), resolveAllConfig({ ...base, locale: 'ja' }));
    expect(outline.filter((e) => e.indexMark).map((e) => [e.title, e.indexMark!.yomi ?? e.indexMark!.rubyYomi ?? null]))
      .toEqual([['東京', 'とうきょう'], ['青森', 'あおもり'], ['京都', null]]);
    const doc = buildDocument({ markdown: md }, { ...base, locale: 'ja' });
    const warnings = (doc.contentWarnings ?? []).filter((w) => w.kind === 'indexReadingMissing');
    expect(warnings).toMatchObject([{ kind: 'indexReadingMissing', term: '京都', index: '' }]);
    const lines = doc.blocks.flatMap((b) => b.lines.map((l) => l.text));
    const from = lines.indexOf('索引');
    expect(from).toBeGreaterThan(0);
    const at = (s: string) => lines.findIndex((l, i) => i > from && l.startsWith(s));
    expect(at('あ行')).toBeLessThan(at('青森'));
    expect(at('青森')).toBeLessThan(at('た行'));
    expect(at('た行')).toBeLessThan(at('東京'));
    expect(at('東京')).toBeLessThan(at('京都'));
  });
});
