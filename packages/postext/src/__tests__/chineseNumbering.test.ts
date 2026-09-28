import { describe, it, expect } from 'vitest';
import {
  formatCounter,
  formatNumeral,
  parseNumberFormat,
  renderCounterTemplate,
  computeHeadingNumbers,
  buildPageLabels,
  type NumeralStyle,
} from '../numbering';
import { parseChineseNumeral } from '../chineseNumerals';
import { numberToWords } from '../numberWords';
import { parsePartNumber } from '../pipeline/parts';
import { formatListNumber } from '../pipeline/lists';
import { flattenTitleBreaks } from '../parse/inlineFormatting';
import { parseMarkdown } from '../parse';
import { buildDocument } from '../pipeline';
import { computeOutlineFor } from '../pipeline/outline';
import { collectConfigWarnings } from '../configWarnings';
import { stripConfigDefaults } from '../defaults';
import { renderToHtml } from '../html-backend';
import { computeChapterTitles } from '../pipeline/placeholders';
import type { OrderedListNumberFormat, PageNumberFormat, PostextConfig, Resource } from '../types';
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

/** The text an opener band (a heading's or a part's) prints. */
const bandText = (doc: VDTDocument): string =>
  doc.pages.flatMap((p) => p.openerBand?.blocks ?? [])
    .flatMap((b) => (b.kind === 'text' ? (b as VDTDesignTextBlock).lines.map((l) => l.text) : []))
    .join('');

const D = '零一二三四五六七八九';
/** Tens and units with the 一 of 一十 kept (the form after 百 and 千). */
function below100(n: number): string {
  const t = Math.floor(n / 10);
  const u = n % 10;
  if (t === 0) return D[u]!;
  return D[t]! + '十' + (u ? D[u] : '');
}
/** An independent reading of the informal rules for 1–10 000, written the
 *  way a style guide states them, to check the engine against. */
function reference(n: number): string {
  if (n === 10_000) return '一万';
  if (n < 10) return D[n]!;
  if (n < 20) return '十' + (n % 10 ? D[n % 10] : '');
  if (n < 100) return below100(n);
  if (n < 1000) {
    const r = n % 100;
    return D[Math.floor(n / 100)]! + '百' + (r === 0 ? '' : r < 10 ? '零' + D[r] : below100(r));
  }
  const r = n % 1000;
  const head = D[Math.floor(n / 1000)]! + '千';
  if (r === 0) return head;
  if (r < 100) return head + '零' + below100(r);
  const h = Math.floor(r / 100);
  const rr = r % 100;
  return head + D[h] + '百' + (rr === 0 ? '' : rr < 10 ? '零' + D[rr] : below100(rr));
}

describe('Chinese informal numerals', () => {
  it('match the reference for every number from 1 to 10 000', () => {
    for (let n = 1; n <= 10_000; n++) expect(formatNumeral(n, 'simp-chinese-informal'), String(n)).toBe(reference(n));
  });

  it('style-guide examples', () => {
    const cases: [number, string][] = [
      [1, '一'], [10, '十'], [11, '十一'], [19, '十九'], [20, '二十'], [100, '一百'], [101, '一百零一'], [110, '一百一十'],
      [120, '一百二十'], [1000, '一千'], [1001, '一千零一'], [1010, '一千零一十'], [1050, '一千零五十'], [10_000, '一万'],
      [10_010, '一万零一十'], [100_000, '十万'], [110_000, '十一万'], [100_010_000, '一亿零一万'], [100_000_000, '一亿'],
      [120_000_000, '一亿二千万'],
    ];
    for (const [n, s] of cases) expect(formatNumeral(n, 'simp-chinese-informal'), String(n)).toBe(s);
    expect(formatNumeral(10_000, 'trad-chinese-informal')).toBe('一萬');
    expect(formatNumeral(10_010, 'trad-chinese-informal')).toBe('一萬零一十');
    expect(formatNumeral(100_000_000, 'trad-chinese-informal')).toBe('一億');
    expect(formatNumeral(0, 'simp-chinese-informal')).toBe('零');
  });

  it('formal numerals keep 壹 before 拾', () => {
    expect(formatNumeral(12, 'simp-chinese-formal')).toBe('壹拾贰');
    expect(formatNumeral(120, 'simp-chinese-formal')).toBe('壹佰贰拾');
    expect(formatNumeral(12, 'trad-chinese-formal')).toBe('壹拾貳');
    expect(formatNumeral(3006, 'trad-chinese-formal')).toBe('參仟零陸');
  });
});

describe('the other East Asian styles', () => {
  it('digit by digit, stems, branches, circled and fullwidth', () => {
    const table: [NumeralStyle, number, string][] = [
      ['cjk-decimal', 0, '〇'], ['cjk-decimal', 120, '一二〇'], ['cjk-decimal', 2026, '二〇二六'],
      ['cjk-heavenly-stem', 1, '甲'], ['cjk-heavenly-stem', 10, '癸'], ['cjk-heavenly-stem', 11, '11'],
      ['cjk-earthly-branch', 1, '子'], ['cjk-earthly-branch', 12, '亥'], ['cjk-earthly-branch', 13, '13'],
      ['circled-decimal', 1, '①'], ['circled-decimal', 20, '⑳'], ['circled-decimal', 21, '㉑'], ['circled-decimal', 35, '㉟'],
      ['circled-decimal', 36, '㊱'], ['circled-decimal', 50, '㊿'], ['circled-decimal', 51, '51'],
      ['fullwidth-decimal', 123, '１２３'],
    ];
    for (const [style, n, s] of table) expect(formatNumeral(n, style), `${style} ${n}`).toBe(s);
  });

  it('the Latin styles print nothing for zero, as before', () => {
    expect(formatNumeral(0, 'decimal')).toBe('');
    expect(formatNumeral(0, 'upper-roman')).toBe('');
  });
});

describe('format spellings', () => {
  it('reads the CSS names and the one-character tokens', () => {
    expect(parseNumberFormat('simp-chinese-informal')).toBe('simp-chinese-informal');
    expect(parseNumberFormat('TRAD-CHINESE-FORMAL')).toBe('trad-chinese-formal');
    expect(parseNumberFormat('cjk-ideographic')).toBe('trad-chinese-informal');
    expect(parseNumberFormat('〇')).toBe('cjk-decimal');
    expect(parseNumberFormat('①')).toBe('circled-decimal');
    expect(parseNumberFormat('甲')).toBe('cjk-heavenly-stem');
    // 一 and 壹 follow the document's script.
    expect(parseNumberFormat('一')).toBe('simp-chinese-informal');
    expect(parseNumberFormat('一', 'zh-Hant')).toBe('trad-chinese-informal');
    expect(parseNumberFormat('一', 'zh-TW')).toBe('trad-chinese-informal');
    expect(parseNumberFormat('壹', 'zh-Hans')).toBe('simp-chinese-formal');
    expect(parseNumberFormat('壹', 'zh-HK')).toBe('trad-chinese-formal');
  });

  it('no config warning for the new names', () => {
    expect(collectConfigWarnings({
      page: { pageNumbering: { format: 'trad-chinese-informal' } },
      orderedLists: { numberFormat: 'circled-decimal' },
      resourceTypes: [{ id: 'figure', name: '图', shortLabel: '图', captionPrefix: '图', numberingTemplate: '{n}', resetOn: 'never', counterFormat: 'cjk-decimal' }],
    })).toEqual([]);
  });
});

describe('heading templates', () => {
  const at = (tpl: string, n: number, locale?: string) => {
    const blocks = parseMarkdown('# A');
    return computeHeadingNumbers(blocks, { 1: tpl }, [n - 1], undefined, { locale })[0];
  };

  it('第{1:一}回 in either script', () => {
    expect([1, 10, 101, 120].map((n) => at('第{1:一}回', n, 'zh-Hans'))).toEqual(['第一回', '第十回', '第一百零一回', '第一百二十回']);
    expect(at('第{1:一}回', 10_000, 'zh-Hant')).toBe('第一萬回');
    expect(at('第{1:一}回', 10_000, 'zh-Hans')).toBe('第一万回');
    expect(at('卷{1:〇}', 12)).toBe('卷一二');
    expect(at('{1:①}', 3)).toBe('③');
    expect(at('{1:壹}', 12, 'zh-TW')).toBe('壹拾貳');
    expect(at('{1:simp-chinese-informal}、', 2)).toBe('二、');
  });

  it('spelled-out numbers in Chinese', () => {
    expect(at('{1:ordinal}', 12, 'zh')).toBe('第十二');
    expect(at('{1:Words}', 21, 'zh-Hant')).toBe('二十一');
    expect(formatCounter(10_000, 'ORDINAL', 'zh-TW')).toBe('第一萬');
    expect(numberToWords(120, 'cardinal', 'zh-Hans')).toBe('一百二十');
    // English and Spanish are unchanged.
    expect(numberToWords(21, 'cardinal', 'es')).toBe('veintiuno');
    expect(numberToWords(21, 'ordinal', 'en')).toBe('twenty-first');
  });

  it('keeps Han text before a missing counter', () => {
    expect(renderCounterTemplate([{ kind: 'literal', text: '第一' }, { kind: 'counter', text: '' }])).toBe('第一');
    expect(renderCounterTemplate([{ kind: 'counter', text: '一' }, { kind: 'literal', text: '、' }, { kind: 'counter', text: '' }])).toBe('一');
    // `{h1}.{n}` without h1 still renders `1`, and a trailing stop still goes.
    expect(renderCounterTemplate([{ kind: 'counter', text: '' }, { kind: 'literal', text: '.' }, { kind: 'counter', text: '1' }])).toBe('1');
    expect(renderCounterTemplate([{ kind: 'literal', text: 'Fig ' }, { kind: 'counter', text: '' }])).toBe('Fig');
  });
});

describe('part numbers', () => {
  it('reads Chinese numerals and fullwidth digits', () => {
    const cases: [string, number | undefined][] = [
      ['三', 3], ['卷一', 1], ['第一卷', 1], ['第十二卷', 12], ['第十二部', 12], ['１２', 12], ['〇', 0], ['一二〇', 120],
      ['一百零一', 101], ['壹佰贰拾', 120], ['二〇二六', 2026], ['一万零一十', 10_010], ['第3卷', 3],
      ['III', 3], ['12', 12], ['Première', undefined], ['卷', undefined], ['三國', undefined],
    ];
    for (const [raw, n] of cases) expect(parsePartNumber(raw), raw).toBe(n);
    expect(parseChineseNumeral('十')).toBe(10);
    expect(parseChineseNumeral('一亿二千万')).toBe(120_000_000);
    expect(parseChineseNumeral('一万亿')).toBe(1e12);
  });

  it('a part numbered 三 prints {numberDecimal} and {numberRoman}', () => {
    const doc = buildDocument({ markdown: ':::part{number="卷三" title="石頭記"}\n\n# 第一回\n\n正文。' }, {
      parts: { design: { elements: [{ kind: 'text', id: 'n', content: '{partNumber}|{numberDecimal}|{numberRoman}', placement: { anchor: { to: 'container', edge: 'top-left' } } }] } },
    } as PostextConfig);
    expect(bandText(doc)).toContain('卷三|3|III');
  });
});

describe('ordered lists', () => {
  const pt = (value: number) => ({ value, unit: 'pt' as const });
  const base: PostextConfig = {
    locale: 'zh-Hans',
    page: { width: pt(300), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  };
  const markers = (doc: VDTDocument) => doc.blocks.filter((b) => b.type === 'listItem').map((b) => (b.prefixText ?? '') + (b.bulletText ?? '') + (b.separatorText ?? ''));

  it('the five-level GB/T 15834 hierarchy', () => {
    const md = '1. 甲\n  1. 乙\n    1. 丙\n      1. 丁\n        1. 戊\n        2. 己';
    const doc = buildDocument({ markdown: md }, {
      ...base,
      orderedLists: {
        levels: [
          { level: 1, numberFormat: 'simp-chinese-informal', separator: '、' },
          { level: 2, numberFormat: 'simp-chinese-informal', prefix: '（', separator: '）' },
          { level: 3, numberFormat: 'arabic', separator: '.' },
          { level: 4, numberFormat: 'arabic', prefix: '（', separator: '）' },
          { level: 5, numberFormat: 'circled-decimal', separator: '' },
        ],
      },
    });
    expect(markers(doc)).toEqual(['一、', '（一）', '1.', '（1）', '①', '②']);
  });

  it('a styled separator paints the prefix as a run of its own before the number', () => {
    const doc = buildDocument({ markdown: '1. 甲\n2. 乙' }, {
      ...base,
      orderedLists: { numberFormat: 'simp-chinese-informal', prefix: '（', separator: '）', separatorColor: { hex: '#ff0000', model: 'hex' } },
    });
    const [first] = doc.blocks.filter((b) => b.type === 'listItem');
    expect(first!.bulletText).toBe('一');
    expect(first!.prefixText).toBe('（');
    expect(first!.separatorText).toBe('）');
    // One em of the stub font (7 px per character) before the number.
    expect(first!.bulletOffsetX! - first!.prefixX!).toBeCloseTo(7, 5);
    const html = renderToHtml(doc);
    expect(html.indexOf('>（<')).toBeLessThan(html.indexOf('>一<'));
    expect(html.indexOf('>一<')).toBeLessThan(html.indexOf('>）<'));
  });

  it('numbers through the shared formatter, keeping the list edges', () => {
    expect(formatListNumber(3, 'arabic')).toBe('3');
    expect(formatListNumber(0, 'upper-roman')).toBe('0');
    expect(formatListNumber(4000, 'upper-roman')).toBe('4000');
    expect(formatListNumber(27, 'lower-alpha')).toBe('aa');
    expect(formatListNumber(0, 'cjk-decimal')).toBe('〇');
    expect(formatListNumber(12, 'trad-chinese-informal')).toBe('十二');
  });

  it('read 壹 in the document language, the hyphenation tag included, and so do page numbers and part lists', () => {
    // No `locale`: the document language is the hyphenation tag as written,
    // as for heading templates. `壹` is a format spelling the types leave out.
    const TOKEN = '壹' as OrderedListNumberFormat & PageNumberFormat;
    const doc = buildDocument({ markdown: '# 甲\n\n乙。\n\n# 丙\n\n1. 一\n2. 二\n' }, {
      bodyText: { hyphenation: { locale: 'zh-Hant' } },
      page: { ...base.page, pageNumbering: { format: TOKEN, startAt: 2 } },
      headings: { levels: [{ level: 1, numberingTemplate: '第{1:壹}回' }] },
      orderedLists: { numberFormat: TOKEN, separator: '、' },
    });
    expect(doc.blocks.filter((b) => b.type === 'heading').map((b) => b.numberPrefix)).toEqual(['第壹回', '第貳回']);
    expect(markers(doc)).toEqual(['壹、', '貳、']);
    expect(doc.pages[0]!.pageLabel).toBe('貳');
    expect([doc.config.orderedLists.numberFormat, doc.config.page.pageNumbering.format]).toEqual(['trad-chinese-formal', 'trad-chinese-formal']);
    // A part's list override, list-wide or per level.
    const overrides: NonNullable<PostextConfig['orderedLists']>[] = [{ numberFormat: TOKEN }, { levels: [{ level: 1, numberFormat: TOKEN }] }];
    for (const orderedLists of overrides) {
      const part = buildDocument({ markdown: ':::part{number="一" title="卷"}\n1. 甲\n2. 乙\n:::\n' }, {
        ...base,
        locale: 'zh-Hant',
        orderedLists: { numberFormat: 'arabic' },
        parts: { bodyStyle: { orderedLists } },
      });
      expect(part.blocks.filter((b) => b.type === 'listItem').map((b) => b.bulletText), JSON.stringify(orderedLists)).toEqual(['壹.', '貳.']);
    }
  });

  it('strips a default prefix and keeps a set one', () => {
    expect(stripConfigDefaults({ orderedLists: { prefix: '' } })?.orderedLists).toBeUndefined();
    expect(stripConfigDefaults({ orderedLists: { prefix: '（', levels: [{ level: 2, prefix: '(' }] } })?.orderedLists).toEqual({ prefix: '（', levels: [{ level: 2, prefix: '(' }] });
  });
});

describe('headings: number separator and couplet titles', () => {
  const pt = (value: number) => ({ value, unit: 'pt' as const });
  const config = (sep: string | undefined, span: 'column' | 'page' = 'column'): PostextConfig => ({
    locale: 'zh-Hant',
    page: { width: pt(400), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
    headings: { levels: [{ level: 1, numberingTemplate: '第{1:一}回', span, ...(sep !== undefined ? { numberSeparator: sep } : {}) }] },
    header: { elements: [{ kind: 'text', id: 'rh', content: '{chapterNumber}|{chapterTitle}', placement: { anchor: { to: 'container', edge: 'top-left' } } }] },
  } as PostextConfig);
  const md = '# 甄士隱夢幻識通靈 \\\\ 賈雨村風塵懷閨秀\n\n' + '此開卷第一回也。';

  it('joins a couplet title with an ideographic space', () => {
    expect(flattenTitleBreaks('甄士隱夢幻識通靈 賈雨村風塵懷閨秀')).toBe('甄士隱夢幻識通靈　賈雨村風塵懷閨秀');
    expect(flattenTitleBreaks('Part one the storm')).toBe('Part one the storm');
    expect(flattenTitleBreaks('Chapter 甄士隱')).toBe('Chapter 甄士隱');
    // Characters outside the BMP (two UTF-16 units), the Chinese dash and
    // ellipsis; the same marks between Latin words stay a space.
    expect(flattenTitleBreaks('𠀀𠀁\u2028𠀂𠀃')).toBe('𠀀𠀁\u3000𠀂𠀃');
    expect(flattenTitleBreaks('「红楼梦」\u2028——序')).toBe('「红楼梦」\u3000——序');
    expect(flattenTitleBreaks('卷一……\u2028甄士隱')).toBe('卷一……\u3000甄士隱');
    expect(flattenTitleBreaks('Wait…\u2028…what')).toBe('Wait… …what');
    expect(flattenTitleBreaks('One—\u2028two')).toBe('One— two');
  });

  it('sets the separator between number and title in the column', () => {
    for (const [sep, expected] of [[undefined, '第一回 甄士隱夢幻識通靈　賈雨村風塵懷閨秀'], ['　', '第一回　甄士隱夢幻識通靈　賈雨村風塵懷閨秀'], ['', '第一回甄士隱夢幻識通靈　賈雨村風塵懷閨秀']] as const) {
      const doc = buildDocument({ markdown: md }, config(sep));
      const heading = doc.blocks.find((b) => b.type === 'heading')!;
      expect(heading.lines.map((l) => l.text).join(''), String(sep)).toBe(expected);
      expect(heading.numberPrefix).toBe('第一回');
      expect(heading.numberSeparator).toBe(sep === undefined ? undefined : sep);
    }
  });

  it('the running head keeps the couplet\'s ideographic space, however the heading wraps', () => {
    // 400 pt sets the heading on one line; 111 pt breaks it after 賈, 105 pt
    // ends a line with the couplet's ideographic space and 102 pt starts one
    // with it; 63 pt sets one character a line.
    for (const [width, sep] of [[400, undefined], [400, '　'], [120, ''], [111, '　'], [105, '　'], [102, '　'], [63, '　']] as const) {
      const cfg = config(sep);
      const doc = buildDocument({ markdown: md }, { ...cfg, page: { ...cfg.page!, width: pt(width) } });
      if (width < 400) expect(doc.blocks.find((b) => b.type === 'heading')!.lines.length, String(width)).toBeGreaterThan(1);
      const header = (doc.pages[0]!.header?.blocks ?? []).filter((b): b is VDTDesignTextBlock => b.kind === 'text');
      expect(computeChapterTitles(doc.blocks, doc.pages.length)[0], `${width} ${JSON.stringify(sep)}`).toBe('甄士隱夢幻識通靈\u3000賈雨村風塵懷閨秀');
      if (width === 400) expect(header.flatMap((b) => b.lines.map((l) => l.text)).join('')).toBe('第一回|甄士隱夢幻識通靈\u3000賈雨村風塵懷閨秀');
    }
  });

  it('the default opener of a page-span level uses it too', () => {
    const doc = buildDocument({ markdown: md }, config('　', 'page'));
    expect(bandText(doc).startsWith('第一回\u3000甄士隱')).toBe(true);
  });

  it('the contents keep the couplet\'s ideographic space and number it 第一回', () => {
    const [entry] = computeOutlineFor(parseMarkdown(md), config('\u3000'));
    expect(entry!.title).toBe('甄士隱夢幻識通靈\u3000賈雨村風塵懷閨秀');
    expect(entry!.number).toBe('第一回');
    expect(entry!.spans!.map((s) => s.text).join('')).toBe('甄士隱夢幻識通靈\u3000賈雨村風塵懷閨秀');
  });

  it('strips a default separator', () => {
    expect(stripConfigDefaults({ headings: { levels: [{ level: 1, numberSeparator: ' ' }] } })?.headings).toBeUndefined();
    expect(stripConfigDefaults({ headings: { levels: [{ level: 1, numberSeparator: '' }] } })?.headings).toEqual({ levels: [{ level: 1, numberSeparator: '' }] });
  });
});

describe('captions and references', () => {
  const pt = (value: number) => ({ value, unit: 'pt' as const });
  const figure: Resource = {
    id: 'plate', typeId: 'figure', kind: 'bitmap', caption: '大觀園圖', createdAt: 0, updatedAt: 0,
    bitmap: { fileId: 'p.png', format: 'png', width: 400, height: 300 },
  };
  const md = '# 第一回\n\n見:ref{id="plate"}。\n\n::resource{id="plate"}';
  const build = (extra: PostextConfig = {}) => buildDocument({ markdown: md, resources: [figure] }, {
    locale: 'zh-Hans',
    page: { width: pt(400), height: pt(600), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
    ...extra,
  });
  const captionText = (doc: VDTDocument) => {
    const all = [...doc.blocks, ...doc.pages.flatMap((p) => p.floats ?? [])];
    const res = all.find((b) => b.type === 'resource')!;
    return (res.resourceBlock?.captionLines ?? []).map((l) => l.text).join('');
  };
  const refText = (doc: VDTDocument) => doc.blocks.find((b) => b.type === 'paragraph')!.lines.map((l) => l.text).join('');

  it('图1-1　标题 with the two caption settings', () => {
    const doc = build({ captionStyle: { labelNumberGap: '', labelSeparator: '　' } });
    expect(captionText(doc)).toBe('图1-1　大觀園圖');
    expect(refText(doc)).toBe('見图1-1。');
  });

  it('the defaults are unchanged', () => {
    const doc = build();
    expect(captionText(doc)).toBe('图 1-1. 大觀園圖');
    expect(refText(doc)).toBe('見图 1-1。');
    expect(stripConfigDefaults({ captionStyle: { labelNumberGap: ' ', labelSeparator: '. ' } })?.captionStyle).toBeUndefined();
  });
});

describe('page labels', () => {
  it('number pages in Chinese numerals', () => {
    const labels = buildPageLabels(3, [{ startPageIndex: 0, format: 'trad-chinese-informal', startAt: 9 }]);
    expect(labels.map((l) => l.label)).toEqual(['九', '十', '十一']);
  });

  it('the {numberHan} placeholder prints the heading counter in the document script', () => {
    const pt = (value: number) => ({ value, unit: 'pt' as const });
    const doc = buildDocument({ markdown: '# 甄士隱' }, {
      locale: 'zh-Hant',
      page: { width: pt(400), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
      headings: { levels: [{ level: 1, span: 'page', numberingTemplate: '{1}', advancedDesign: { enabled: true, slot: { elements: [{ kind: 'text', id: 't', content: '第{numberHan}回 {titleText}', placement: { anchor: { to: 'container', edge: 'top-left' } } }] } } }] },
    } as PostextConfig, undefined);
    expect(bandText(doc)).toContain('第一回');
  });
});
