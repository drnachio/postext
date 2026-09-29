import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { computePageMetrics, contentAreaForPage, pageMirrored } from '../../pipeline/buildHelpers';
import { resolveAllConfig } from '../../pipeline/config';
import { flowRectToPage, flowToPage, pageRectToFlow, pageToFlow, type VDTDocument, type VDTPage } from '../../vdt';
import type { PostextConfig, Dimension } from '../../types';
import { installSizedStub } from './stub';

installSizedStub();

const pt = (value: number): Dimension => ({ value, unit: 'pt' });
const px = (d: Dimension): number => (d.value * 300) / 72;

// 紅樓夢, chapter 1 (程乙本): real Chinese text for the flow.
const HLM = '此開卷第一回也。作者自云：因曾歷過一番夢幻之後，故將真事隱去，而借「通靈」之說，撰此《石頭記》一書也。故曰「甄士隱」云云。但書中所記何事何人？自又云：今風塵碌碌，一事無成，忽念及當日所有之女子，一一細考較去，覺其行止見識，皆出我之上。';
const chapter = (n: number) => Array.from({ length: n }, () => HLM).join('\n\n');

/** A vertical page W × H and the horizontal page H × W it is laid out as:
 *  the flow's top margin is the sheet's right one, its left the sheet's
 *  top, its right the sheet's bottom, its bottom the sheet's left. */
function pair(margins: { top: number; right: number; bottom: number; left: number }, layout: PostextConfig['layout'] = {}): [PostextConfig, PostextConfig] {
  const common: PostextConfig = {
    bodyText: { fontSize: pt(10), lineHeight: pt(16), textAlign: 'justify' },
    headings: { balancing: { enabled: false } },
    locale: 'zh-Hant',
  };
  const vertical: PostextConfig = {
    ...common,
    page: { width: pt(300), height: pt(420), margins: { top: pt(margins.top), right: pt(margins.right), bottom: pt(margins.bottom), left: pt(margins.left) } },
    layout: { ...layout, writingMode: 'vertical-rl' },
  };
  const horizontal: PostextConfig = {
    ...common,
    page: { width: pt(420), height: pt(300), margins: { top: pt(margins.right), right: pt(margins.bottom), bottom: pt(margins.left), left: pt(margins.top) } },
    layout: { ...layout },
  };
  return [vertical, horizontal];
}

/** Numbers rounded to 1e-6 px: the flow frame's content area is computed
 *  as `W − (x + w)`, a hair off the horizontal page's `x`. */
function rounded<T>(v: T): T {
  if (typeof v === 'number') return (Math.round(v * 1e6) / 1e6) as T;
  if (Array.isArray(v)) return v.map(rounded) as T;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rounded(x)])) as T;
  return v;
}

function flowShape(doc: VDTDocument) {
  return rounded(doc.pages.map((p) => ({
    contentArea: p.contentArea,
    columns: p.columns.map((c) => ({
      bbox: c.bbox,
      blocks: c.blocks.map((b) => ({ type: b.type, bbox: b.bbox, lines: b.lines.map((l) => ({ text: l.text, bbox: l.bbox })) })),
    })),
  })));
}

describe('vertical flow frame — helpers', () => {
  const page = { flow: { writingMode: 'vertical-rl' as const, rotation: { direction: 'cw' as const, originX: 300, originY: 0, width: 420, height: 300 } } };

  it('maps a flow point to the sheet as a quarter turn clockwise, and back', () => {
    expect(flowToPage(page, 0, 0)).toEqual({ x: 300, y: 0 });
    expect(flowToPage(page, 10, 20)).toEqual({ x: 280, y: 10 });
    expect(pageToFlow(page, 280, 10)).toEqual({ x: 10, y: 20 });
    for (const [x, y] of [[0, 0], [17.5, 3], [419, 299]] as const) {
      const p = flowToPage(page, x, y);
      expect(pageToFlow(page, p.x, p.y)).toEqual({ x, y });
    }
  });

  it('maps rects with width and height swapped', () => {
    const r = { x: 10, y: 20, width: 100, height: 30 };
    expect(flowRectToPage(page, r)).toEqual({ x: 250, y: 10, width: 30, height: 100 });
    expect(pageRectToFlow(page, flowRectToPage(page, r))).toEqual(r);
  });

  it('is the identity on a horizontal page', () => {
    const h = {} as Pick<VDTPage, 'flow'>;
    expect(flowToPage(h, 5, 6)).toEqual({ x: 5, y: 6 });
    expect(flowRectToPage(h, { x: 1, y: 2, width: 3, height: 4 })).toEqual({ x: 1, y: 2, width: 3, height: 4 });
  });
});

describe('vertical flow frame — page geometry', () => {
  it('computePageMetrics turns the content area into the flow frame', () => {
    const [v] = pair({ top: 40, right: 20, bottom: 30, left: 50 });
    const m = computePageMetrics(resolveAllConfig(v));
    expect(m.vertical).toBe(true);
    expect(m.pageWidthPx).toBeCloseTo(px(pt(300)));
    expect(m.flowWidthPx).toBeCloseTo(px(pt(420)));
    // Flow: left = the sheet's top margin, top = the sheet's right margin.
    expect(m.contentArea.x).toBeCloseTo(px(pt(40)));
    expect(m.contentArea.y).toBeCloseTo(px(pt(20)));
    expect(m.contentArea.width).toBeCloseTo(px(pt(420 - 40 - 30)));
    expect(m.contentArea.height).toBeCloseTo(px(pt(300 - 20 - 50)));
    // Physical: the margins as written.
    expect(m.physical.contentArea.x).toBeCloseTo(px(pt(50)));
    expect(m.physical.contentArea.y).toBeCloseTo(px(pt(40)));
  });

  it('stamps the flow frame on vertical pages and keeps the sheet size physical', () => {
    const [v] = pair({ top: 40, right: 20, bottom: 30, left: 50 });
    const doc = buildDocument({ markdown: chapter(6) }, v);
    for (const page of doc.pages) {
      expect(page.flow?.writingMode).toBe('vertical-rl');
      expect(page.flow?.rotation).toEqual({ direction: 'cw', originX: page.width, originY: 0, width: page.height, height: page.width });
      expect(page.width).toBeCloseTo(px(pt(300)));
      expect(page.height).toBeCloseTo(px(pt(420)));
      // The physical content area lies inside the sheet.
      const a = flowRectToPage(page, page.contentArea);
      expect(a.x).toBeCloseTo(px(pt(50)));
      expect(a.y).toBeCloseTo(px(pt(40)));
    }
  });

  it('a horizontal document carries no flow frame', () => {
    const [, h] = pair({ top: 40, right: 20, bottom: 30, left: 50 });
    const doc = buildDocument({ markdown: chapter(2) }, h);
    expect(doc.pages.every((p) => p.flow === undefined)).toBe(true);
    expect(doc.binding).toBeUndefined();
  });

  it('a vertical W × H page lays out exactly like a horizontal H × W page with the margins turned', () => {
    for (const layout of [{ layoutType: 'single' as const }, { layoutType: 'double' as const, gutterWidth: pt(24) }]) {
      const [v, h] = pair({ top: 40, right: 20, bottom: 30, left: 50 }, layout);
      const dv = buildDocument({ markdown: `# 第一回\n\n${chapter(8)}` }, v);
      const dh = buildDocument({ markdown: `# 第一回\n\n${chapter(8)}` }, h);
      expect(dv.pages.length).toBeGreaterThan(1);
      expect(dv.pages.length).toBe(dh.pages.length);
      expect(flowShape(dv)).toEqual(flowShape(dh));
      // The baselines differ: a vertical line centres its characters in
      // its line box (the stub's central baseline is 0.38 em), a horizontal
      // one sets its baseline 0.8 of the line height down.
      const offsets = (d: VDTDocument) => [...new Set(d.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks.filter((b) => b.type === 'paragraph').flatMap((b) => b.lines.map((l) => Math.round((l.baseline - l.bbox.y) * 1e6) / 1e6)))))];
      expect(offsets(dv)).toEqual([Math.round((px(pt(16)) / 2 + 0.38 * px(pt(10))) * 1e6) / 1e6]);
      expect(offsets(dh)).toEqual([Math.round(px(pt(16)) * 0.8 * 1e6) / 1e6]);
    }
  });

  it('two tiers: the flow fills the upper tier, then the lower one', () => {
    const [v] = pair({ top: 40, right: 20, bottom: 30, left: 50 }, { layoutType: 'double', gutterWidth: pt(24) });
    const doc = buildDocument({ markdown: chapter(6) }, v);
    const page = doc.pages[0]!;
    const [upper, lower] = page.columns.map((c) => flowRectToPage(page, c.bbox));
    // Tiers are stacked top to bottom on the sheet, each as wide as the area.
    expect(upper!.y).toBeLessThan(lower!.y);
    expect(upper!.x).toBeCloseTo(lower!.x);
    expect(upper!.width).toBeCloseTo(lower!.width);
    // The first line of each tier is its rightmost column of text.
    const firstLine = (ci: number) => {
      const line = page.columns[ci]!.blocks[0]!.lines[0]!;
      return flowRectToPage(page, line.bbox);
    };
    expect(firstLine(0).x + firstLine(0).width).toBeCloseTo(upper!.x + upper!.width, 0);
    expect(page.columns[0]!.blocks.length).toBeGreaterThan(0);
    expect(page.columns[1]!.blocks.length).toBeGreaterThan(0);
  });

  it('does not balance tiers unless the config asks for it', () => {
    const cfg: PostextConfig = { layout: { writingMode: 'vertical-rl' } };
    expect(resolveAllConfig(cfg).headings.balancing.enabled).toBe(false);
    expect(resolveAllConfig({ ...cfg, headings: { balancing: { enabled: true } } }).headings.balancing.enabled).toBe(true);
    expect(resolveAllConfig({}).headings.balancing.enabled).toBe(true);
  });

  it('a heading style may set a section horizontal inside a vertical book, and inherits vertical otherwise', () => {
    const cfg: PostextConfig = {
      layout: { writingMode: 'vertical-rl' },
      headingStyles: [
        { id: 'appendix', layout: { layoutType: 'single', writingMode: 'horizontal-tb' } },
        { id: 'wide', layout: { layoutType: 'single' } },
      ],
    };
    const r = resolveAllConfig(cfg);
    expect(r.headingStyles.find((s) => s.id === 'appendix')!.layout!.writingMode).toBe('horizontal-tb');
    expect(r.headingStyles.find((s) => s.id === 'wide')!.layout!.writingMode).toBe('vertical-rl');
    const doc = buildDocument({ markdown: `# 第一回\n\n${chapter(3)}\n\n# Appendix {style="appendix"}\n\nThe notes in English.` }, { ...cfg, page: { width: pt(300), height: pt(420) } });
    const first = doc.pages[0]!;
    const last = doc.pages[doc.pages.length - 1]!;
    expect(first.flow).toBeDefined();
    expect(last.flow).toBeUndefined();
  });
});

describe('right binding (page.binding)', () => {
  const base = (binding?: 'auto' | 'left' | 'right', writingMode?: 'vertical-rl'): PostextConfig => ({
    page: {
      width: pt(300), height: pt(420),
      margins: { top: pt(40), bottom: pt(30), left: pt(20), right: pt(50), mirror: true },
      ...(binding ? { binding } : {}),
    },
    ...(writingMode ? { layout: { writingMode } } : {}),
  });

  it("'auto' is right in a vertical document, left otherwise", () => {
    expect(resolveAllConfig(base()).page.binding).toBe('left');
    expect(resolveAllConfig(base('auto', 'vertical-rl')).page.binding).toBe('right');
    expect(resolveAllConfig(base('left', 'vertical-rl')).page.binding).toBe('left');
    expect(resolveAllConfig(base('right')).page.binding).toBe('right');
  });

  it('pageMirrored over binding × parity × mirror', () => {
    const cases: Array<[binding: 'left' | 'right', mirror: boolean, index: number, expected: boolean]> = [
      ['left', true, 0, false], ['left', true, 1, true], ['left', false, 1, false],
      ['right', true, 0, true], ['right', true, 1, false], ['right', false, 0, false],
    ];
    for (const [binding, mirror, index, expected] of cases) {
      const r = resolveAllConfig({ page: { binding, margins: { mirror } } });
      expect(pageMirrored(r, index)).toBe(expected);
    }
    // The pages before a continued document shift parity.
    expect(pageMirrored(resolveAllConfig({ page: { binding: 'right', margins: { mirror: true } } }), 0, 1)).toBe(false);
  });

  it('a right-bound recto has its inner margin on its right (horizontal flow)', () => {
    const r = resolveAllConfig(base('right'));
    const m = computePageMetrics(r);
    const p1 = contentAreaForPage(m, r, 0);
    const p2 = contentAreaForPage(m, r, 1);
    // Page 1 (recto, left page of the spread): inner 20 pt on the right.
    expect(p1.x).toBeCloseTo(px(pt(50)));
    expect(m.pageWidthPx - (p1.x + p1.width)).toBeCloseTo(px(pt(20)));
    // Page 2 (verso, right page): inner 20 pt on the left.
    expect(p2.x).toBeCloseTo(px(pt(20)));
  });

  it('a right-bound vertical book mirrors in the flow frame', () => {
    const doc = buildDocument({ markdown: chapter(40) }, base('auto', 'vertical-rl'));
    expect(doc.binding).toBe('right');
    expect(doc.pages.length).toBeGreaterThan(2);
    const sheet = (p: VDTPage) => flowRectToPage(p, p.contentArea);
    // Page 1: its spine on its right — the 20 pt inner margin there.
    const p1 = sheet(doc.pages[0]!);
    expect(doc.pages[0]!.width - (p1.x + p1.width)).toBeCloseTo(px(pt(20)));
    expect(p1.x).toBeCloseTo(px(pt(50)));
    const p2 = sheet(doc.pages[1]!);
    expect(p2.x).toBeCloseTo(px(pt(20)));
    // The vertical extent never moves.
    expect(p1.y).toBeCloseTo(px(pt(40)));
    expect(p2.y).toBeCloseTo(px(pt(40)));
  });

  it('a chapter asking for an odd page still opens on an odd page', () => {
    const cfg: PostextConfig = {
      ...base('right', 'vertical-rl'),
      headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'odd' } }] },
    };
    const doc = buildDocument({ markdown: `# 第一回\n\n${chapter(1)}\n\n# 第二回\n\n${chapter(1)}` }, cfg);
    const second = doc.blocks.find((b) => b.type === 'heading' && b.lines.some((l) => l.text.includes('第二回')));
    expect(second).toBeDefined();
    expect((second!.pageIndex + 1) % 2).toBe(1);
  });
});

describe('a vertical part page (#188)', () => {
  // The sheet margins of a page, top / right / bottom / left, from its
  // content area turned back onto the sheet.
  const sheetMargins = (p: VDTPage) => {
    const s = flowRectToPage(p, p.contentArea);
    return rounded([s.y, p.width - s.x - s.width, p.height - s.y - s.height, s.x]);
  };
  const book = (margins: NonNullable<PostextConfig['page']>['margins'], writingMode?: 'vertical-rl') => {
    const md = `# 第一回\n\n${chapter(6)}\n\n:::part{number="卷二" title="第十一回至第二十回"}\n本卷所收。\n:::\n\n# 第十一回\n\n${chapter(6)}`;
    return buildDocument({ markdown: md }, {
      locale: 'zh-Hant',
      page: { width: pt(300), height: pt(420), dpi: 72, margins },
      bodyText: { fontSize: pt(10), lineHeight: pt(16) },
      ...(writingMode ? { layout: { writingMode } } : {}),
    });
  };

  for (const writingMode of [undefined, 'vertical-rl'] as const) {
    for (const mirror of [false, true]) {
      it(`keeps the page margins' names on the sheet (${writingMode ?? 'horizontal'}, mirror ${mirror})`, () => {
        const doc = book({ top: pt(60), right: pt(20), bottom: pt(30), left: pt(45), mirror }, writingMode);
        const part = doc.pages.find((p) => p.role === 'part');
        expect(part).toBeDefined();
        // A body page of the same parity as the part page.
        const twin = doc.pages.find((p) => p.role !== 'part' && p.index !== part!.index && (p.index - part!.index) % 2 === 0);
        expect(twin).toBeDefined();
        expect(sheetMargins(part!)).toEqual(sheetMargins(twin!));
        // The part's single column fills that area.
        expect(rounded(flowRectToPage(part!, part!.columns[0]!.bbox))).toEqual(rounded(flowRectToPage(part!, part!.contentArea)));
      });
    }
  }

  it('reads parts.margins with the sheet names too', () => {
    const doc = buildDocument(
      { markdown: `# 第一回\n\n${chapter(2)}\n\n:::part{number="卷二" title="第十一回至第二十回"}\n:::\n\n# 第十一回\n\n${chapter(2)}` },
      {
        locale: 'zh-Hant',
        page: { width: pt(300), height: pt(420), dpi: 72, margins: { top: pt(40), right: pt(40), bottom: pt(40), left: pt(40) } },
        layout: { writingMode: 'vertical-rl' },
        parts: { margins: { top: pt(10), right: pt(20), bottom: pt(40), left: pt(80) } },
      },
    );
    const part = doc.pages.find((p) => p.role === 'part')!;
    expect(sheetMargins(part)).toEqual([10, 20, 40, 80]);
  });
});
