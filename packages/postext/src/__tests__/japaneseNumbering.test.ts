import { describe, it, expect } from 'vitest';
import {
  buildPageLabels,
  computeHeadingNumbers,
  formatCounter,
  formatNumeral,
  hanInformalStyle,
  parseNumberFormat,
  EAST_ASIAN_NUMERAL_STYLES,
} from '../numbering';
import { HIRAGANA, HIRAGANA_IROHA, KATAKANA, KATAKANA_IROHA, japaneseNumeral } from '../japaneseNumerals';
import { parseChineseNumeral } from '../chineseNumerals';
import { numberToWords } from '../numberWords';
import { parsePartNumber } from '../pipeline/parts';
import { formatListNumber } from '../pipeline/lists';
import { computeHeadingContext, computeResourceNumbering } from '../pipeline/resourceNumbering';
import { formatFootnoteNumber } from '../pipeline/footnotes';
import { resolveFootnotesConfig } from '../defaults/footnotes';
import { collectConfigWarnings } from '../configWarnings';
import { parseMarkdown } from '../parse';
import { buildDocument } from '../pipeline';
import type { PostextConfig, Resource, ResourceType } from '../types';
import type { VDTDesignTextBlock, VDTDocument } from '../vdt';

// Deterministic text measurement stub (no DOM in the node test env).
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

/** CSS Counter Styles 3's additive algorithm, run on the spec's own
 *  `additive-symbols` table (code points as the spec lists them): an
 *  independent reading of `japanese-informal` and `japanese-formal` over
 *  their range, 0–9 999. */
function cssAdditive(n: number, table: readonly [number, string][]): string {
  if (n === 0) return table.find(([w]) => w === 0)![1];
  let value = n;
  let out = '';
  for (const [weight, symbol] of table) {
    if (weight === 0 || weight > value) continue;
    const reps = Math.floor(value / weight);
    out += symbol.repeat(reps);
    value -= reps * weight;
  }
  return out;
}
const cp = (...codes: number[]) => String.fromCodePoint(...codes);
/** The digits 1–9 of each style, as code points, and the markers. */
const INFORMAL_DIGIT_CP = [0x4e00, 0x4e8c, 0x4e09, 0x56db, 0x4e94, 0x516d, 0x4e03, 0x516b, 0x4e5d];
const FORMAL_DIGIT_CP = [0x58f1, 0x5f10, 0x53c2, 0x56db, 0x4f0d, 0x516d, 0x4e03, 0x516b, 0x4e5d];
function additiveTable(digits: number[], markers: [number, number, number], formal: boolean, zero: number): [number, string][] {
  const rows: [number, string][] = [];
  for (const [pos, marker] of [[3, markers[2]], [2, markers[1]], [1, markers[0]]] as const) {
    for (let d = 9; d >= 1; d--) {
      // The informal 1000, 100 and 10 are the bare marker: 千, 百, 十.
      const head = d === 1 && !formal ? '' : cp(digits[d - 1]!);
      rows.push([d * 10 ** pos, head + cp(marker)]);
    }
  }
  for (let d = 9; d >= 1; d--) rows.push([d, cp(digits[d - 1]!)]);
  rows.push([0, cp(zero)]);
  return rows;
}
const CSS_INFORMAL = additiveTable(INFORMAL_DIGIT_CP, [0x5341, 0x767e, 0x5343], false, 0x3007);
const CSS_FORMAL = additiveTable(FORMAL_DIGIT_CP, [0x62fe, 0x767e, 0x9621], true, 0x96f6);

describe('japanese-informal', () => {
  it('matches the CSS additive table for every number from 0 to 9 999', () => {
    for (let n = 0; n <= 9999; n++) expect(formatNumeral(n, 'japanese-informal'), String(n)).toBe(cssAdditive(n, CSS_INFORMAL));
  });

  it('drops 一 before 十百千 and writes no 零 for a gap', () => {
    const cases: [number, string][] = [
      [0, '〇'], [1, '一'], [9, '九'], [10, '十'], [11, '十一'], [19, '十九'], [20, '二十'], [99, '九十九'],
      [100, '百'], [101, '百一'], [110, '百十'], [1000, '千'], [1001, '千一'], [1010, '千十'], [6001, '六千一'],
      [2026, '二千二十六'], [9999, '九千九百九十九'],
    ];
    for (const [n, text] of cases) expect(formatNumeral(n, 'japanese-informal'), String(n)).toBe(text);
  });

  it('goes on past 9 999 with 万 億 兆, keeping 一 before a unit', () => {
    const cases: [number, string][] = [
      [10_000, '一万'], [10_001, '一万一'], [11_000, '一万千'], [100_000, '十万'], [110_000, '十一万'],
      [1_000_000, '百万'], [10_000_000, '千万'], [100_000_000, '一億'], [100_010_000, '一億一万'],
      [100_000_001, '一億一'], [1e12, '一兆'], [123_456_789, '一億二千三百四十五万六千七百八十九'],
      // The last safe integer, then past it: digits.
      [Number.MAX_SAFE_INTEGER, '九千七兆千九百九十二億五千四百七十四万九百九十一'],
      [2 ** 53, String(2 ** 53)],
    ];
    for (const [n, text] of cases) expect(formatNumeral(n, 'japanese-informal'), String(n)).toBe(text);
  });

  it('prints nothing below zero, as the other styles', () => {
    expect(formatNumeral(-1, 'japanese-informal')).toBe('');
  });
});

describe('japanese-formal', () => {
  it('matches the CSS additive table for every number from 0 to 9 999', () => {
    for (let n = 0; n <= 9999; n++) expect(formatNumeral(n, 'japanese-formal'), String(n)).toBe(cssAdditive(n, CSS_FORMAL));
  });

  it('keeps 壱 before 拾百阡 and uses the daiji 壱弐参伍', () => {
    const cases: [number, string][] = [
      [0, '零'], [1, '壱'], [2, '弐'], [3, '参'], [4, '四'], [5, '伍'], [9, '九'], [10, '壱拾'], [11, '壱拾壱'],
      [19, '壱拾九'], [20, '弐拾'], [99, '九拾九'], [100, '壱百'], [101, '壱百壱'], [110, '壱百壱拾'],
      [1000, '壱阡'], [1001, '壱阡壱'], [10_000, '壱萬'], [10_001, '壱萬壱'], [35_000, '参萬伍阡'],
      [100_000_000, '壱億'], [1e12, '壱兆'],
    ];
    for (const [n, text] of cases) expect(formatNumeral(n, 'japanese-formal'), String(n)).toBe(text);
  });
});

describe('kana series', () => {
  it('are the CSS symbol lists: 48 gojūon kana with ゐ ゑ, 47 iroha kana without ん', () => {
    expect(HIRAGANA).toHaveLength(48);
    expect(KATAKANA).toHaveLength(48);
    expect(HIRAGANA_IROHA).toHaveLength(47);
    expect(KATAKANA_IROHA).toHaveLength(47);
    for (const series of [HIRAGANA, KATAKANA, HIRAGANA_IROHA, KATAKANA_IROHA]) expect(new Set(series).size).toBe(series.length);
    // The iroha uses every gojūon kana once, ん aside.
    expect([...HIRAGANA_IROHA].sort()).toEqual(HIRAGANA.filter((k) => k !== 'ん').sort());
    expect([...KATAKANA_IROHA].sort()).toEqual(KATAKANA.filter((k) => k !== 'ン').sort());
    // Katakana is hiragana moved by 0x60, kana by kana.
    expect(KATAKANA.map((k) => k.codePointAt(0)! - 0x60)).toEqual(HIRAGANA.map((k) => k.codePointAt(0)));
    expect(HIRAGANA.slice(43).join('')).toBe('わゐゑをん');
    expect(HIRAGANA_IROHA.slice(0, 7).join('')).toBe('いろはにほへと');
    expect(HIRAGANA_IROHA.slice(-5).join('')).toBe('ゑひもせす');
  });

  it('number alphabetically and wrap into two kana past the last', () => {
    const cases: [string, number, string][] = [
      ['hiragana', 1, 'あ'], ['hiragana', 9, 'け'], ['hiragana', 10, 'こ'], ['hiragana', 11, 'さ'], ['hiragana', 19, 'て'],
      ['hiragana', 20, 'と'], ['hiragana', 48, 'ん'], ['hiragana', 49, 'ああ'], ['hiragana', 50, 'あい'], ['hiragana', 96, 'あん'],
      ['hiragana', 97, 'いあ'], ['hiragana', 48 * 49, 'んん'], ['hiragana', 48 * 49 + 1, 'あああ'],
      ['katakana', 1, 'ア'], ['katakana', 48, 'ン'], ['katakana', 49, 'アア'],
      ['hiragana-iroha', 1, 'い'], ['hiragana-iroha', 2, 'ろ'], ['hiragana-iroha', 3, 'は'], ['hiragana-iroha', 47, 'す'],
      ['hiragana-iroha', 48, 'いい'], ['hiragana-iroha', 49, 'いろ'], ['hiragana-iroha', 94, 'いす'], ['hiragana-iroha', 95, 'ろい'],
      ['katakana-iroha', 1, 'イ'], ['katakana-iroha', 10, 'ヌ'], ['katakana-iroha', 47, 'ス'], ['katakana-iroha', 48, 'イイ'],
    ];
    for (const [style, n, text] of cases) expect(formatNumeral(n, style as 'hiragana'), `${style} ${n}`).toBe(text);
  });

  it('have no zero', () => {
    for (const style of ['hiragana', 'katakana', 'hiragana-iroha', 'katakana-iroha'] as const) expect(formatNumeral(0, style)).toBe('');
  });
});

describe('format spellings', () => {
  it('reads the CSS names, case-insensitive, and the kana and daiji tokens', () => {
    for (const name of ['japanese-informal', 'japanese-formal', 'hiragana', 'katakana', 'hiragana-iroha', 'katakana-iroha'] as const) {
      expect(EAST_ASIAN_NUMERAL_STYLES).toContain(name);
      expect(parseNumberFormat(name)).toBe(name);
      expect(parseNumberFormat(name.toUpperCase())).toBe(name);
    }
    expect(parseNumberFormat('あ')).toBe('hiragana');
    expect(parseNumberFormat('ア')).toBe('katakana');
    expect(parseNumberFormat('い')).toBe('hiragana-iroha');
    expect(parseNumberFormat('イ')).toBe('katakana-iroha');
    expect(parseNumberFormat('壱')).toBe('japanese-formal');
  });

  it('一 is japanese-informal in a Japanese document and Chinese elsewhere', () => {
    for (const ja of ['ja', 'ja-JP', 'JA_jp', 'ja-Jpan-JP']) expect(parseNumberFormat('一', ja), ja).toBe('japanese-informal');
    expect(parseNumberFormat('一')).toBe('simp-chinese-informal');
    expect(parseNumberFormat('一', 'zh')).toBe('simp-chinese-informal');
    expect(parseNumberFormat('一', 'zh-Hant')).toBe('trad-chinese-informal');
    expect(parseNumberFormat('一', 'en')).toBe('simp-chinese-informal');
    // 壹 stays the Chinese formal of the script; the Japanese daiji are 壱.
    expect(parseNumberFormat('壹', 'ja')).toBe('simp-chinese-formal');
    expect(hanInformalStyle('ja-JP')).toBe('japanese-informal');
    expect(hanInformalStyle('zh-TW')).toBe('trad-chinese-informal');
  });

  it('no config warning for the new names and tokens', () => {
    expect(collectConfigWarnings({
      locale: 'ja',
      page: { pageNumbering: { format: 'japanese-informal' } },
      orderedLists: { numberFormat: 'katakana-iroha' },
      footnotes: { numberFormat: 'hiragana' },
      resourceTypes: [{ id: 'figure', name: '図', shortLabel: '図', captionPrefix: '図', numberingTemplate: '{n}', resetOn: 'never', counterFormat: 'japanese-formal' }],
    })).toEqual([]);
  });
});

describe('heading templates', () => {
  const at = (tpl: string, n: number, locale?: string) => {
    const blocks = parseMarkdown('# A');
    return computeHeadingNumbers(blocks, { 1: tpl }, [n - 1], undefined, { locale })[0];
  };

  it('第{1:一}章 in Japanese, Chinese unchanged', () => {
    expect([1, 10, 11, 101, 110, 1001, 10_001].map((n) => at('第{1:一}章', n, 'ja'))).toEqual(
      ['第一章', '第十章', '第十一章', '第百一章', '第百十章', '第千一章', '第一万一章'],
    );
    expect(at('第{1:一}回', 101, 'zh-Hans')).toBe('第一百零一回');
    expect(at('第{1:一}回', 101, 'zh-Hant')).toBe('第一百零一回');
    expect(at('{1:壱}', 12, 'ja')).toBe('壱拾弐');
    expect(at('{1:あ}、', 2, 'ja')).toBe('い、');
    expect(at('（{1:イ}）', 3, 'ja')).toBe('（ハ）');
    expect(at('{1:japanese-informal}', 20)).toBe('二十');
  });

  it('spelled-out numbers in Japanese: cardinal kanji and 第 ordinals', () => {
    const cases: [number, string][] = [[1, '一'], [10, '十'], [21, '二十一'], [101, '百一'], [1000, '千'], [10_001, '一万一']];
    for (const [n, text] of cases) {
      expect(numberToWords(n, 'cardinal', 'ja'), String(n)).toBe(text);
      expect(numberToWords(n, 'ordinal', 'ja-JP'), String(n)).toBe(`第${text}`);
    }
    expect(at('{1:ordinal}', 21, 'ja')).toBe('第二十一');
    expect(formatCounter(21, 'Words', 'ja')).toBe('二十一');
    expect(formatCounter(3, 'ORDINAL', 'ja')).toBe('第三');
    expect(numberToWords(0, 'cardinal', 'ja')).toBe('');
    // Chinese and English are unchanged.
    expect(numberToWords(101, 'cardinal', 'zh')).toBe('一百零一');
    expect(numberToWords(21, 'cardinal', 'en')).toBe('twenty-one');
  });
});

describe('numbers read back', () => {
  it('reads the Japanese counted forms and the daiji', () => {
    const cases: [string, number][] = [
      ['百一', 101], ['千十', 1010], ['百', 100], ['千', 1000], ['十一', 11], ['一万一', 10_001], ['一億一万', 100_010_000],
      ['二〇二六', 2026], ['壱拾', 10], ['壱百壱', 101], ['弐阡', 2000], ['参萬伍阡', 35_000],
    ];
    for (const [raw, n] of cases) expect(parseChineseNumeral(raw), raw).toBe(n);
  });

  it('a part number with 巻 or 部', () => {
    expect(parsePartNumber('第三巻')).toBe(3);
    expect(parsePartNumber('巻之一')).toBeUndefined();
    expect(parsePartNumber('第百一部')).toBe(101);
    expect(parsePartNumber('巻十二')).toBe(12);
  });

  it('round-trips every formatted number', () => {
    for (const n of [1, 9, 10, 11, 19, 20, 99, 100, 101, 110, 1000, 1001, 10_000, 10_001, 123_456_789]) {
      expect(parseChineseNumeral(japaneseNumeral(n, 'informal')), String(n)).toBe(n);
      expect(parseChineseNumeral(japaneseNumeral(n, 'formal')), String(n)).toBe(n);
    }
  });
});

describe('lists, footnotes, resources and pages', () => {
  const pt = (value: number) => ({ value, unit: 'pt' as const });
  const base: PostextConfig = {
    locale: 'ja',
    page: { width: pt(300), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  };
  const markers = (doc: VDTDocument) => doc.blocks.filter((b) => b.type === 'listItem').map((b) => (b.prefixText ?? '') + (b.bulletText ?? '') + (b.separatorText ?? ''));
  const bandText = (doc: VDTDocument): string =>
    doc.pages.flatMap((p) => p.openerBand?.blocks ?? [])
      .flatMap((b) => (b.kind === 'text' ? (b as VDTDesignTextBlock).lines.map((l) => l.text) : []))
      .join('');

  it('list items: a zero of their own for the counted styles, none for kana', () => {
    expect(formatListNumber(0, 'japanese-informal')).toBe('〇');
    expect(formatListNumber(0, 'japanese-formal')).toBe('零');
    expect(formatListNumber(0, 'hiragana')).toBe('0');
    expect(formatListNumber(3, 'katakana-iroha')).toBe('ハ');
    expect(formatListNumber(11, 'japanese-informal')).toBe('十一');
  });

  it('一 in the list, page and heading settings of a ja document', () => {
    const TOKEN = '一' as 'decimal';
    const doc = buildDocument({ markdown: '# 序\n\n本文。\n\n# 次\n\n1. あ\n2. い\n' }, {
      ...base,
      page: { ...base.page, pageNumbering: { format: TOKEN, startAt: 11 } },
      headings: { levels: [{ level: 1, numberingTemplate: '第{1:一}章' }] },
      orderedLists: { numberFormat: 'あ' as 'arabic', separator: '、' },
    });
    expect(doc.blocks.filter((b) => b.type === 'heading').map((b) => b.numberPrefix)).toEqual(['第一章', '第二章']);
    expect(markers(doc)).toEqual(['あ、', 'い、']);
    expect(doc.pages[0]!.pageLabel).toBe('十一');
    expect([doc.config.orderedLists.numberFormat, doc.config.page.pageNumbering.format]).toEqual(['hiragana', 'japanese-informal']);
  });

  it('page labels', () => {
    expect(buildPageLabels(3, [{ startPageIndex: 0, format: 'japanese-informal', startAt: 99 }]).map((l) => l.label)).toEqual(['九十九', '百', '百一']);
    expect(buildPageLabels(2, [{ startPageIndex: 0, format: 'hiragana-iroha', startAt: 1 }]).map((l) => l.label)).toEqual(['い', 'ろ']);
  });

  it('footnote numbers in kana', () => {
    const f = resolveFootnotesConfig({ numberFormat: 'イ' as 'decimal' }, 'ja');
    expect(f.numberFormat).toBe('katakana-iroha');
    expect(formatFootnoteNumber(2, f.numberFormat, '（{n}）')).toBe('（ロ）');
    expect(resolveFootnotesConfig({ numberFormat: '一' as 'decimal' }, 'ja').numberFormat).toBe('japanese-informal');
  });

  it('a resource counter 一 follows the document language', () => {
    const blocks = parseMarkdown('# A\n\n::resource{id="r"}');
    const types: ResourceType[] = [{ id: 'figure', name: '図', shortLabel: '図', captionPrefix: '図', numberingTemplate: '{n}', resetOn: 'never', counterFormat: '一' as 'decimal' }];
    const resources: Resource[] = [{ id: 'r', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0, bitmap: { fileId: 'r.png', format: 'png', width: 10, height: 10 } }];
    const context = computeHeadingContext(blocks);
    const start = { counters: { figure: { counter: 100, heading: context[0]! } } };
    expect(computeResourceNumbering(blocks, types, resources, context, start, undefined, 'ja').r!.number).toBe('百一');
    expect(computeResourceNumbering(blocks, types, resources, context, start, undefined, 'zh').r!.number).toBe('一百零一');
    expect(computeResourceNumbering(blocks, types, resources, context, start).r!.number).toBe('一百零一');
  });

  it('{numberHan} writes Japanese numerals in a ja document', () => {
    const levels = (content: string) => ({ levels: [{ level: 1, span: 'page' as const, numberingTemplate: '{1}', advancedDesign: { enabled: true, slot: { elements: [{ kind: 'text' as const, id: 't', content, placement: { anchor: { to: 'container' as const, edge: 'top-left' as const } } }] } } }] });
    const md = '# こころ {startAt=101}';
    const ja = buildDocument({ markdown: md }, { ...base, headings: levels('第{numberHan}章 {titleText}') } as PostextConfig);
    expect(bandText(ja)).toContain('第百一章');
    const words = buildDocument({ markdown: md }, { ...base, headings: levels('{numberOrdinalWords}') } as PostextConfig);
    expect(bandText(words)).toContain('第百一');
    const zh = buildDocument({ markdown: md }, { ...base, locale: 'zh-Hans', headings: levels('第{numberHan}回') } as PostextConfig);
    expect(bandText(zh)).toContain('第一百零一回');
  });
});
