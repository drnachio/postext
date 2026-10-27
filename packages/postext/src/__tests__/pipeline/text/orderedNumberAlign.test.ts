import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { resolveBodyTextConfig, resolveOrderedListsConfig, stripOrderedListsDefaults } from '../../../defaults/index.js';
import type { OrderedListsConfig, PostextConfig } from '../../../types.js';
import type { VDTBlock, VDTDocument } from '../../../vdt.js';

// `orderedLists.numberAlign` (#682): the numbers of a list at the start of
// their column, so labels of different lengths begin together (第九條,
// 第十一條). Every character is 7 px wide in the stub: '9.' is 14 px and
// '10.' 21 px.
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

const pt = (value: number) => ({ value, unit: 'pt' as const });
const mm = (value: number) => ({ value, unit: 'mm' as const });
const config = (ordered: OrderedListsConfig = {}, extra: Partial<PostextConfig> = {}): PostextConfig => ({
  page: { width: mm(120), height: mm(150), dpi: 72, margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'single' },
  bodyText: { fontSize: pt(10), lineHeight: pt(12), firstLineIndent: pt(0) },
  orderedLists: ordered,
  headings: { balancing: { enabled: false } },
  ...extra,
});
const build = (md: string, cfg: PostextConfig): VDTDocument => buildDocument({ markdown: md }, cfg, createMeasurementCache());
const items = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.type === 'listItem');
const textX = (b: VDTBlock): number => b.lines[0]!.bbox.x;

const LIST = '8. Eight\n9. Nine\n10. Ten\n11. Eleven';

describe('orderedLists.numberAlign (#682)', () => {
  it('defaults to \'end\', strips the default and reads an unknown value as \'end\'', () => {
    const body = resolveBodyTextConfig();
    expect(resolveOrderedListsConfig(undefined, body).numberAlign).toBe('end');
    expect(resolveOrderedListsConfig({ numberAlign: 'start' }, body).numberAlign).toBe('start');
    expect(resolveOrderedListsConfig({ numberAlign: 'left' as never }, body).numberAlign).toBe('end');
    expect(stripOrderedListsDefaults({ numberAlign: 'end' })).toBeUndefined();
    expect(stripOrderedListsDefaults({ numberAlign: 'start' })).toEqual({ numberAlign: 'start' });
  });

  it('by default the numbers end together', () => {
    const list = items(build(LIST, config()));
    // '9.' one digit right of '10.'.
    expect(list[1]!.bulletOffsetX! - list[2]!.bulletOffsetX!).toBeCloseTo(7, 5);
    expect(JSON.stringify(items(build(LIST, config({ numberAlign: 'end' }))))).toBe(JSON.stringify(list));
  });

  it('\'start\' begins every number at the start of the column, the text where it was', () => {
    const end = items(build(LIST, config()));
    const start = items(build(LIST, config({ numberAlign: 'start' })));
    const x = start[0]!.bulletOffsetX!;
    for (const b of start) expect(b.bulletOffsetX!).toBeCloseTo(x, 5);
    // Where the widest number of the run stood.
    expect(x).toBeCloseTo(end[2]!.bulletOffsetX!, 5);
    start.forEach((b, i) => {
      expect(textX(b)).toBeCloseTo(textX(end[i]!), 5);
      expect(b.lines.map((l) => l.text)).toEqual(end[i]!.lines.map((l) => l.text));
      expect(b.bbox).toEqual(end[i]!.bbox);
    });
  });

  it('works with the level-wide column and per depth', () => {
    const md = '1. Stem\n   9. ninth\n   10. tenth\n\nBetween.\n\n10. Other';
    const [stem, ninth, tenth, other] = items(build(md, config({ numberAlign: 'start', numberWidth: 'level' })));
    expect(stem!.bulletOffsetX!).toBeCloseTo(other!.bulletOffsetX!, 5);
    expect(ninth!.bulletOffsetX!).toBeCloseTo(tenth!.bulletOffsetX!, 5);
    expect(textX(stem!)).toBeCloseTo(textX(other!), 5);
  });

  it('a separator run follows its own number', () => {
    const cfg = (align: 'start' | 'end'): PostextConfig => config({ numberAlign: align, separatorFontWeight: 400, fontWeight: 700 });
    const start = items(build(LIST, cfg('start')));
    const end = items(build(LIST, cfg('end')));
    // Flush right: the separators of '9' and '10' stand in one column.
    expect(end[1]!.separatorX!).toBeCloseTo(end[2]!.separatorX!, 5);
    // At the start: each right after its number, '9' one digit before '10'.
    expect(start[1]!.bulletOffsetX!).toBeCloseTo(start[2]!.bulletOffsetX!, 5);
    expect(start[2]!.separatorX! - start[1]!.separatorX!).toBeCloseTo(7, 5);
    expect(start[1]!.separatorX! - start[1]!.bulletOffsetX!).toBeCloseTo(7, 5);
  });

  it('a prefix and a suffix: 第九條 and 第十一條 begin together in vertical Japanese', () => {
    const cfg = (align?: 'start'): PostextConfig => config(
      { numberFormat: 'japanese-informal', prefix: '第', separator: '條', hangingIndent: false, ...(align ? { numberAlign: align } : {}) },
      { locale: 'ja', layout: { layoutType: 'single', writingMode: 'vertical-rl' } },
    );
    const md = '9. 天皇ハ\n10. 天皇ハ\n11. 天皇ハ';
    const end = items(build(md, cfg()));
    const start = items(build(md, cfg('start')));
    expect(end.map((b) => b.bulletText)).toEqual(['第九條', '第十條', '第十一條']);
    // One character further down the line for the shorter labels …
    expect(end[0]!.bulletOffsetX!).toBeGreaterThan(end[2]!.bulletOffsetX!);
    // … and all three at the head with 'start'.
    expect(start[0]!.bulletOffsetX!).toBeCloseTo(start[2]!.bulletOffsetX!, 5);
    expect(start[1]!.bulletOffsetX!).toBeCloseTo(start[2]!.bulletOffsetX!, 5);
    expect(start[2]!.bulletOffsetX!).toBeCloseTo(end[2]!.bulletOffsetX!, 5);
    expect(textX(start[0]!)).toBeCloseTo(textX(end[0]!), 5);
  });

  it('on a right-to-left page the numbers begin at the start of the mirrored frame', () => {
    // The flow of a right-to-left document is laid out in a mirrored frame
    // (`VDTPage.flow`): its start is the right of the sheet.
    const cfg = (align?: 'start'): PostextConfig => config(align ? { numberAlign: align } : {}, { locale: 'ar', direction: 'rtl' });
    const md = '9. تسعة\n10. عشرة';
    const end = items(build(md, cfg()));
    const start = items(build(md, cfg('start')));
    expect(end[0]!.bulletOffsetX! - end[1]!.bulletOffsetX!).toBeCloseTo(7, 5);
    expect(start[0]!.bulletOffsetX!).toBeCloseTo(start[1]!.bulletOffsetX!, 5);
    expect(start[1]!.bulletOffsetX!).toBeCloseTo(end[1]!.bulletOffsetX!, 5);
    expect(textX(start[0]!)).toBeCloseTo(textX(end[0]!), 5);
  });
});
