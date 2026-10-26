import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { resolveBodyTextConfig, resolveOrderedListsConfig, stripConfigDefaults, stripOrderedListsDefaults } from '../../../defaults/index.js';
import type { OrderedListsConfig, PostextConfig } from '../../../types.js';
import type { VDTBlock, VDTDocument } from '../../../vdt.js';

// `orderedLists.numberWidth: 'item'` (#722): the number column of an item
// is its own number, so its text starts one gap after its own label:
// 第九條 and 第十一條 are each followed by one em, as the Japanese Official
// Gazette prints the articles of a law. Kana and kanji are one em (20 px)
// wide in the stub, any other character half an em.
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const size = Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? 20);
    let w = 0;
    for (const ch of s) w += ch.codePointAt(0)! >= 0x2e80 ? size : size / 2;
    return { width: w };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const em = (value: number) => ({ value, unit: 'em' as const });
/** The list of the Gazette: 第九條, a one-em gap, turnovers back at the
 *  head of the line. 20 px text, twelve characters to the line, the
 *  content area from x = 20. */
const gazette = (ordered: OrderedListsConfig = {}, extra: Partial<PostextConfig> = {}): PostextConfig => ({
  locale: 'ja',
  page: { width: pt(12 * 20 + 40), height: pt(600), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontSize: pt(20), lineHeight: pt(30), textAlign: 'left', firstLineIndent: pt(0) },
  headings: { balancing: { enabled: false } },
  orderedLists: {
    numberFormat: 'japanese-informal', prefix: '第', separator: '條', gap: em(1), indent: em(0), hangingIndent: false,
    marginTop: pt(0), marginBottom: pt(0), itemSpacing: pt(0), ...ordered,
  },
  ...extra,
});
const ARTICLES = '9. 日本臣民ハ法律命令ノ定ムル所ノ資格ニ應シ均ク文武官ニ任セラル\n10. 天皇ハ行政各部ノ官制及文武官ノ俸給ヲ定ム\n11. 天皇ハ陸海軍ヲ統帥ス';
const build = (md: string, cfg: PostextConfig): VDTDocument => buildDocument({ markdown: md }, cfg, createMeasurementCache());
const items = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.type === 'listItem');
const lineX = (b: VDTBlock): number[] => b.lines.map((l) => l.bbox.x);

describe("orderedLists.numberWidth: 'item' (#722)", () => {
  it('resolves, strips and falls back', () => {
    const body = resolveBodyTextConfig();
    expect(resolveOrderedListsConfig(undefined, body).numberWidth).toBe('run');
    expect(resolveOrderedListsConfig({ numberWidth: 'item' }, body).numberWidth).toBe('item');
    expect(resolveOrderedListsConfig({ numberWidth: 'level' }, body).numberWidth).toBe('level');
    expect(resolveOrderedListsConfig({ numberWidth: 'each' as never }, body).numberWidth).toBe('run');
    expect(stripOrderedListsDefaults({ numberWidth: 'item' })).toEqual({ numberWidth: 'item' });
    expect(stripOrderedListsDefaults({ numberWidth: 'run' })).toBeUndefined();
    expect(stripConfigDefaults({ orderedLists: { numberWidth: 'item' } })).toEqual({ orderedLists: { numberWidth: 'item' } });
  });

  it("the text of each item starts one gap after its own label", () => {
    const list = items(build(ARTICLES, gazette({ numberWidth: 'item' })));
    expect(list.map((b) => b.bulletText)).toEqual(['第九條', '第十條', '第十一條']);
    // Every label at the head of its line, 60, 60 and 80 px wide.
    expect(list.map((b) => b.bulletOffsetX)).toEqual([20, 20, 20]);
    // One em (20 px) after the end of the label.
    expect(list.map((b) => b.lines[0]!.bbox.x)).toEqual([100, 100, 120]);
    // The run's widest label set every text at 120 before.
    const run = items(build(ARTICLES, gazette()));
    expect(run.map((b) => b.lines[0]!.bbox.x)).toEqual([120, 120, 120]);
    // The first line of the short labels is an em longer.
    expect(list[0]!.lines[0]!.text.length).toBe(run[0]!.lines[0]!.text.length + 1);
  });

  it('turnover lines follow hangingIndent: the list indent, or the item\'s own text', () => {
    const flush = items(build(ARTICLES, gazette({ numberWidth: 'item' })));
    expect(lineX(flush[0]!).slice(1).every((x) => x === 20)).toBe(true);
    expect(lineX(flush[1]!).slice(1).every((x) => x === 20)).toBe(true);
    expect(flush[0]!.lines.length).toBeGreaterThan(1);
    const hung = items(build(ARTICLES, gazette({ numberWidth: 'item', hangingIndent: true })));
    expect(hung[0]!.lines.length).toBeGreaterThan(1);
    expect(lineX(hung[0]!).every((x) => x === 100)).toBe(true);
    expect(lineX(hung[1]!).every((x) => x === 100)).toBe(true);
    expect(lineX(hung[2]!).every((x) => x === 120)).toBe(true);
  });

  it('numberAlign has no room to act: both values set the same list', () => {
    const start = build(ARTICLES, gazette({ numberWidth: 'item', numberAlign: 'start' }));
    const end = build(ARTICLES, gazette({ numberWidth: 'item', numberAlign: 'end' }));
    expect(JSON.stringify(items(start))).toBe(JSON.stringify(items(end)));
  });

  it('a separator in a style of its own follows its number, the text one gap after it', () => {
    const cfg = gazette({ numberWidth: 'item', separatorFontWeight: 400, fontWeight: 700 });
    const list = items(build(ARTICLES, cfg));
    // 第 + 九 (40 px), then 條 (20 px), then the gap: 20 + 60 + 20.
    expect(list.map((b) => b.lines[0]!.bbox.x)).toEqual([100, 100, 120]);
    // The separator right after its own number (九, 十, 十一).
    expect(list.map((b) => b.separatorX! - b.bulletOffsetX!)).toEqual([20, 20, 40]);
  });

  it('a nested level keeps one indent, from the widest number of the level above', () => {
    const md = '9. 天皇ハ\n   1. 陸海軍ヲ統帥ス\n10. 天皇ハ\n11. 天皇ハ\n    1. 宣戰シ';
    const cfg = (numberWidth: 'item' | 'run'): PostextConfig => gazette({ numberWidth, levels: [{ level: 2, numberFormat: 'arabic', prefix: '', separator: '.' }] });
    const item = items(build(md, cfg('item')));
    const run = items(build(md, cfg('run')));
    const nested = (list: VDTBlock[]): VDTBlock[] => list.filter((b) => (b.listDepth ?? 1) === 2);
    expect(nested(item).length).toBe(2);
    // Under 第九條 and under 第十一條 the sub-items stand at one place,
    // where they stood with the run's column.
    expect(nested(item)[0]!.bulletOffsetX).toBe(nested(item)[1]!.bulletOffsetX);
    expect(nested(item).map((b) => b.bulletOffsetX)).toEqual(nested(run).map((b) => b.bulletOffsetX));
  });

  it('holds in vertical Japanese and on a right-to-left page', () => {
    const vertical = gazette({ numberWidth: 'item' }, {
      layout: { layoutType: 'single', writingMode: 'vertical-rl' },
      page: { width: pt(400), height: pt(12 * 20 + 40), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
    });
    const v = items(build(ARTICLES, vertical));
    // Along the line (the flow frame): the same places as on a horizontal page.
    expect(v.map((b) => b.bulletOffsetX)).toEqual([v[0]!.bulletOffsetX, v[0]!.bulletOffsetX, v[0]!.bulletOffsetX]);
    expect(v[2]!.lines[0]!.bbox.x - v[0]!.lines[0]!.bbox.x).toBeCloseTo(20, 5);
    expect(v[1]!.lines[0]!.bbox.x).toBeCloseTo(v[0]!.lines[0]!.bbox.x, 5);
    // Right to left: the list is laid out in a mirrored frame, whose start
    // is the right of the sheet.
    const rtl = (numberWidth: 'item' | 'run'): VDTBlock[] => items(build('9. تسعة\n10. عشرة', {
      locale: 'ar', direction: 'rtl',
      page: { width: pt(280), height: pt(400), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
      layout: { layoutType: 'single' },
      bodyText: { fontSize: pt(20), lineHeight: pt(30), firstLineIndent: pt(0), textAlign: 'left' },
      headings: { balancing: { enabled: false } },
      orderedLists: { numberWidth, indent: em(0), gap: em(1) },
    }));
    const [nine, ten] = rtl('item');
    // Both labels at the start of the frame, each text one gap after its
    // own: '9.' is 20 px wide and '10.' 30 px.
    expect(nine!.bulletOffsetX).toBe(ten!.bulletOffsetX);
    expect(nine!.lines[0]!.bbox.x - nine!.bulletOffsetX!).toBeCloseTo(20 + 20, 5);
    expect(ten!.lines[0]!.bbox.x - ten!.bulletOffsetX!).toBeCloseTo(30 + 20, 5);
    // With the run's column both texts start at one place.
    const run = rtl('run');
    expect(run[0]!.lines[0]!.bbox.x).toBeCloseTo(run[1]!.lines[0]!.bbox.x, 5);
    expect(run[0]!.lines[0]!.bbox.x).toBeCloseTo(ten!.lines[0]!.bbox.x, 5);
  });

  it("'run' and 'level' lay out as before", () => {
    const md = '8. Eight\n9. Nine\n10. Ten\n\nBetween.\n\n100. Hundred';
    const base: PostextConfig = {
      page: { width: pt(300), height: pt(400), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
      layout: { layoutType: 'single' },
      bodyText: { fontSize: pt(20), lineHeight: pt(30), firstLineIndent: pt(0) },
      headings: { balancing: { enabled: false } },
    };
    const of = (ordered: OrderedListsConfig | undefined): number[] => items(build(md, { ...base, ...(ordered ? { orderedLists: ordered } : {}) })).map((b) => b.lines[0]!.bbox.x);
    const unset = of(undefined);
    expect(of({ numberWidth: 'run' })).toEqual(unset);
    // The run: '10.' sets the first three, '100.' the last on its own.
    expect(new Set(unset.slice(0, 3)).size).toBe(1);
    expect(unset[3]).toBeGreaterThan(unset[0]!);
    // The level: all four at the widest.
    expect(new Set(of({ numberWidth: 'level' })).size).toBe(1);
    // The item: each by its own number.
    const item = of({ numberWidth: 'item' });
    expect(item[0]).toBe(item[1]);
    expect(item[2]! - item[1]!).toBeCloseTo(10, 5);
    expect(item[3]! - item[2]!).toBeCloseTo(10, 5);
  });
});
