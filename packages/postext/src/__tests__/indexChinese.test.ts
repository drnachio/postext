import { describe, it, expect } from 'vitest';
import { expandIndexDirectives } from '../pipeline/indexDirective';
import {
  PINYIN_BOUNDARIES,
  PINYIN_INITIALS,
  STROKE_BOUNDARIES,
  canGroupBy,
  STROKE_COUNTS,
  indexGrouping,
  pinyinInitial,
  pinyinMarker,
  sortLocaleFor,
  strokeGroup,
  strokeLabel,
  strokeMarker,
} from '../pipeline/indexGroups';
import { parseMarkdown } from '../parse';
import { resolveAllConfig } from '../pipeline/config';
import { resolveIndexConfig, stripIndexDefaults } from '../defaults/indexConfig';
import { resolveBodyTextConfig } from '../defaults/bodyText';
import type { ContentBlock } from '../parse';
import type { OutlineEntry, PostextConfig } from '../types';

// Chinese group heads of the back-of-book index (#182), with the names of
// 红楼梦.

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
 *  starts without a head. */
const expanded = (blocks: ContentBlock[]): string[] => blocks.filter((b) => b.index).map((b) =>
  `${b.index!.group ? `[${b.index!.group}] ` : b.index!.groupStart ? '+ ' : ''}${b.text}`);

const directive = parseMarkdown(':::index');
const build = (config: PostextConfig, outline: OutlineEntry[]) =>
  expanded(expandIndexDirectives(directive, outline, resolveAllConfig({ ...base, ...config })).blocks);

/** Every Han character of the URO, extension A and the compatibility block. */
const hanCharacters = (): string[] => {
  const out: string[] = [];
  for (const [a, b] of [[0x3400, 0x4dbf], [0x4e00, 0x9fff], [0xf900, 0xfaff]] as const) {
    for (let c = a; c <= b; c++) {
      const s = String.fromCodePoint(c);
      if (/\p{sc=Han}/u.test(s)) out.push(s);
    }
  }
  return out;
};

describe('pinyin initials', () => {
  const zh = new Intl.Collator('zh-u-co-pinyin', { sensitivity: 'base', numeric: true });

  it('files the names of the novel under their initials', () => {
    const names = ['阿Q', '巴金', '曹雪芹', '贾宝玉', '林黛玉', '王熙凤', '薛宝钗', '张三', '史湘云', '秦可卿', '平儿'];
    expect(names.map((n) => pinyinInitial(zh, n[0]!))).toEqual(['A', 'B', 'C', 'J', 'L', 'W', 'X', 'Z', 'S', 'Q', 'P']);
    // Traditional characters read the same way.
    expect([...'賈寶薛王林史秦鳳'].map((c) => pinyinInitial(zh, c))).toEqual(['J', 'B', 'X', 'W', 'L', 'S', 'Q', 'F']);
  });

  it('boundary characters open their letter under the collator (guards against ICU data changes)', () => {
    const sorted = hanCharacters().sort(zh.compare);
    PINYIN_INITIALS.forEach((letter, i) => {
      const boundary = PINYIN_BOUNDARIES[i]!;
      // The collator's own marker sorts right before the boundary.
      expect(zh.compare(pinyinMarker(letter), boundary)).toBeLessThan(0);
      const at = sorted.indexOf(boundary);
      expect(at).toBeGreaterThanOrEqual(0);
      if (at > 0) expect(zh.compare(sorted[at - 1]!, pinyinMarker(letter))).toBeLessThan(0);
      expect(pinyinInitial(zh, boundary)).toBe(letter);
    });
  });
});

describe('collators without index markers', () => {
  /** `real` as an older ICU would sort: the U+FDD0 markers unknown, so
   *  after every character. */
  const withoutMarkers = (real: Intl.Collator): Intl.Collator => ({
    compare: (a: string, b: string) => {
      const ma = a.startsWith('\uFDD0');
      const mb = b.startsWith('\uFDD0');
      return ma === mb ? real.compare(a, b) : ma ? 1 : -1;
    },
  }) as unknown as Intl.Collator;

  it('groups with the boundary characters instead', () => {
    const pinyin = withoutMarkers(new Intl.Collator('zh-u-co-pinyin', { sensitivity: 'base' }));
    expect([...'阿巴曹贾林王薛张賈寶'].map((c) => pinyinInitial(pinyin, c))).toEqual(['A', 'B', 'C', 'J', 'L', 'W', 'X', 'Z', 'J', 'B']);
    const stroke = withoutMarkers(new Intl.Collator('zh-Hant-u-co-stroke', { sensitivity: 'base' }));
    expect([...'一人王賈薛寶'].map((c) => strokeGroup(stroke, c))).toEqual([1, 2, 4, 13, 17, 20]);
  });

  it('gives no groups when the collator does not sort Chinese at all', () => {
    const root = new Intl.Collator('en');
    expect(canGroupBy(root, 'pinyin')).toBe(false);
    expect(canGroupBy(root, 'stroke')).toBe(false);
    expect(pinyinInitial(root, '贾')).toBeUndefined();
  });
});

describe('stroke counts', () => {
  const hant = new Intl.Collator('zh-Hant-u-co-stroke', { sensitivity: 'base', numeric: true });

  it('counts the strokes of the first character', () => {
    expect([...'一人王賈薛寶林史秦鳳'].map((c) => strokeGroup(hant, c))).toEqual([1, 2, 4, 13, 17, 20, 8, 5, 10, 14]);
    expect([1, 2, 4, 13, 20, 48].map((n) => strokeLabel(n, true))).toEqual(['一畫', '二畫', '四畫', '十三畫', '二十畫', '四十八畫']);
    expect(strokeLabel(10, false)).toBe('十画');
  });

  it('boundary characters open their stroke count under the collator', () => {
    const sorted = [...hanCharacters(), '𠀾', '𠁆', '𠁎', '𣬚', '𡤻'].sort(hant.compare);
    STROKE_COUNTS.forEach((n, i) => {
      const boundary = STROKE_BOUNDARIES[i]!;
      expect(hant.compare(strokeMarker(n), boundary)).toBeLessThan(0);
      const at = sorted.indexOf(boundary);
      if (at > 0) expect(hant.compare(sorted[at - 1]!, strokeMarker(n))).toBeLessThan(0);
      expect(strokeGroup(hant, boundary)).toBe(n);
    });
  });
});

describe('index.groupBy', () => {
  const outline = () => [
    markEntry(['阿Q'], 1), markEntry(['巴金'], 2), markEntry(['曹雪芹'], 3), markEntry(['贾宝玉'], 4),
    markEntry(['林黛玉'], 5), markEntry(['王熙凤'], 6), markEntry(['薛宝钗'], 7), markEntry(['张三'], 8),
    markEntry(['贾母'], 9, { sort: 'jia mu' }),
  ];

  it('auto groups a Simplified Chinese index by pinyin initial', () => {
    expect(build({ locale: 'zh-Hans' }, outline())).toEqual([
      '[A] 阿Q, 2', '[B] 巴金, 3', '[C] 曹雪芹, 4',
      // The Latin sort key joins the J of 贾宝玉, after the Han entries
      // (the collator sorts Latin after Han).
      '[J] 贾宝玉, 5', '贾母, 10',
      '[L] 林黛玉, 6', '[W] 王熙凤, 7', '[X] 薛宝钗, 8', '[Z] 张三, 9',
    ]);
    expect(build({ locale: 'zh-CN' }, outline())[0]).toBe('[A] 阿Q, 2');
  });

  it('auto groups a Traditional Chinese index by stroke count', () => {
    const names = [markEntry(['賈寶玉'], 1), markEntry(['王熙鳳'], 2), markEntry(['林黛玉'], 3), markEntry(['薛寶釵'], 4), markEntry(['史湘雲'], 5), markEntry(['賈政'], 6)];
    expect(build({ locale: 'zh-Hant' }, names)).toEqual([
      '[四畫] 王熙鳳, 3', '[五畫] 史湘雲, 6', '[八畫] 林黛玉, 4',
      // 政 (9 strokes) before 寶 (20).
      '[十三畫] 賈政, 7', '賈寶玉, 2', '[十七畫] 薛寶釵, 5',
    ]);
    expect(build({ locale: 'zh-TW' }, names)[0]).toBe('[四畫] 王熙鳳, 3');
    // Simplified heads when the index asks for strokes in zh-Hans.
    expect(build({ locale: 'zh-Hans', index: { groupBy: 'stroke' } }, [markEntry(['王熙凤'], 1), markEntry(['贾宝玉'], 2)]))
      .toEqual(['[四画] 王熙凤, 2', '[十画] 贾宝玉, 3']);
  });

  it('sorts a Traditional index grouped by pinyin by pinyin', () => {
    const names = [markEntry(['賈寶玉'], 1), markEntry(['王熙鳳'], 2), markEntry(['林黛玉'], 3)];
    expect(build({ locale: 'zh-Hant', index: { groupBy: 'pinyin' } }, names)).toEqual(['[J] 賈寶玉, 2', '[L] 林黛玉, 4', '[W] 王熙鳳, 3']);
    expect(sortLocaleFor('zh-Hant', 'pinyin')).toBe('zh-Hant-u-co-pinyin');
    expect(sortLocaleFor('en', 'pinyin')).toBe('zh-u-co-pinyin');
    expect(sortLocaleFor('zh', 'letter')).toBe('zh');
  });

  it('none sets no heads and keeps symbols, numbers and words apart', () => {
    const list = [...outline(), markEntry(['1791年'], 10), markEntry(['《石头记》'], 11)];
    expect(build({ locale: 'zh-Hans', index: { groupBy: 'none' } }, list)).toEqual([
      '《石头记》, 12', '+ 1791年, 11',
      // No letters: the Latin sort key sorts where the collator puts it.
      '+ 阿Q, 2', '巴金, 3', '曹雪芹, 4', '贾宝玉, 5', '林黛玉, 6', '王熙凤, 7', '薛宝钗, 8', '张三, 9', '贾母, 10',
    ]);
  });

  it('keeps letter heads in other languages, and on request in Chinese', () => {
    const en = [markEntry(['heart'], 1), markEntry(['apple'], 2), markEntry(['Árbol'], 3)];
    expect(build({}, en)).toEqual(build({ index: { groupBy: 'letter' } }, en));
    expect(build({}, en)).toEqual(['[A] apple, 3', 'Árbol, 4', '[H] heart, 2']);
    expect(build({ locale: 'zh', index: { groupBy: 'letter' } }, [markEntry(['贾宝玉'], 1), markEntry(['林黛玉'], 2)]))
      .toEqual(['[贾] 贾宝玉, 2', '[林] 林黛玉, 3']);
  });

  it('sorts a Han homophone sort key in place, a Latin one after the Han entries of its letter', () => {
    const cGroup = (key: string) => build({ locale: 'zh-Hans' }, [
      markEntry(['曹雪芹'], 1), markEntry(['陈也俊'], 2), markEntry(['程日兴'], 3), markEntry(['崔莺莺'], 4),
      markEntry(['重阳'], 5, { sort: key }),
    ]);
    // 崇 is read chóng only: 重阳 files between 程 and 崔.
    expect(cGroup('崇阳')).toEqual(['[C] 曹雪芹, 2', '陈也俊, 3', '程日兴, 4', '重阳, 6', '崔莺莺, 5']);
    // The collator sets Latin after Han: the pinyin key reaches C, at its end.
    expect(cGroup('chong yang')).toEqual(['[C] 曹雪芹, 2', '陈也俊, 3', '程日兴, 4', '崔莺莺, 5', '重阳, 6']);
  });

  it('files fullwidth Latin letters and Han numerals with their kin', () => {
    expect(build({ locale: 'zh-Hans' }, [markEntry(['Ｑ版'], 1), markEntry(['Q版'], 2), markEntry(['秦可卿'], 3)]))
      .toEqual(['[Q] 秦可卿, 4', 'Q版, 3', 'Ｑ版, 2']);
    expect(build({ locale: 'zh', index: { groupBy: 'letter' } }, [markEntry(['Ｑ版'], 1)])).toEqual(['[Q] Ｑ版, 2']);
    // 〇 is a Han numeral read líng: it files with 零, not under 0–9.
    expect(build({ locale: 'zh-Hans' }, [markEntry(['〇号'], 1), markEntry(['零号'], 2), markEntry(['1号'], 3)]))
      .toEqual(['[0–9] 1号, 4', '[L] 〇号, 2', '零号, 3']);
    expect(build({ locale: 'zh-Hant' }, [markEntry(['〇號'], 1), markEntry(['1號'], 2)])[1]).toMatch(/^\[[一二三四五六七八九十]+畫\] 〇號/);
  });

  it('labels symbols and cross-references in the document script', () => {
    const hans = build({ locale: 'zh-Hans' }, [markEntry(['《石头记》'], 1), markEntry(['贾琏'], 2, { see: '贾政' }), markEntry(['贾政'], 3)]);
    expect(hans).toEqual(['[符号] 《石头记》, 2', '[J] 贾琏。见贾政', '贾政, 4']);
    const hant = build({ locale: 'zh-Hant' }, [markEntry(['《石頭記》'], 1), markEntry(['賈璉'], 2, { seeAlso: '賈政' }), markEntry(['賈政'], 3)]);
    expect(hant).toEqual(['[符號] 《石頭記》, 2', '[十三畫] 賈政, 4', '賈璉, 3。另見賈政']);
  });

  it('resolves the auto rule per locale', () => {
    expect(['zh', 'zh-Hans', 'zh-CN', 'zh-SG', 'zh-Hant', 'zh-TW', 'zh-HK', 'zh_TW', 'en', 'es', 'ja'].map((l) => indexGrouping('auto', l)))
      .toEqual(['pinyin', 'pinyin', 'pinyin', 'pinyin', 'stroke', 'stroke', 'stroke', 'stroke', 'letter', 'letter', 'letter']);
    expect(indexGrouping('none', 'zh')).toBe('none');
  });

  it('resolves and strips groupBy', () => {
    const body = resolveBodyTextConfig(undefined);
    expect(resolveIndexConfig(undefined, body).groupBy).toBe('auto');
    expect(resolveIndexConfig({ groupBy: 'stroke' }, body).groupBy).toBe('stroke');
    expect(resolveIndexConfig({ groupBy: 'radical' as never }, body).groupBy).toBe('auto');
    expect(stripIndexDefaults({ groupBy: 'auto' })).toBeUndefined();
    expect(stripIndexDefaults({ groupBy: 'pinyin' })).toEqual({ groupBy: 'pinyin' });
  });
});
