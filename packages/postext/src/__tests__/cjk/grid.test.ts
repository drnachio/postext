import { describe, it, expect } from 'vitest';
import { buildDocument, renderPageToCanvas, collectConfigWarnings, formatWarning } from '../../index';
import { renderToHtml } from '../../html-backend';
import { resolveAllConfig } from '../../pipeline/config';
import { applyCjkGrid, cjkGridCells, cjkGridGeometry } from '../../pipeline/cjkGrid';
import { computePageMetrics } from '../../pipeline/buildHelpers';
import { flowRectToPage, verticalFlowOf } from '../../index';
import type { PostextConfig } from '../../types';

// CJK characters one em wide, anything else half.
const adv = (s: string, size: number): number => {
  let w = 0;
  for (const ch of s) w += ch.codePointAt(0)! >= 0x2e80 ? size : size / 2;
  return w;
};
class StubCtx {
  font = '';
  letterSpacing = '0px';
  measureText(s: string): { width: number } {
    const m = /(\d*\.?\d+)px/.exec(this.font);
    return { width: adv(s, m ? parseFloat(m[1]!) : 16) };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const mm = (value: number) => ({ value, unit: 'mm' as const });
const pt = (value: number) => ({ value, unit: 'pt' as const });
const MM = 72 / 25.4;

// 大32开 (140 × 203 mm), 五号 (10.5 pt) with a 6 pt line gap, 28 × 28
// (clreq §7.1.1.3). 72 dpi: 1 pt = 1 px.
const bookConfig = (grid: NonNullable<PostextConfig['cjk']>['grid'], extra: Partial<PostextConfig> = {}): PostextConfig => ({
  locale: 'zh-Hans',
  page: { width: mm(140), height: mm(203), dpi: 72, margins: { top: mm(18), bottom: mm(20), left: mm(16), right: mm(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontSize: pt(10.5), lineHeight: pt(16.5), textAlign: 'justify', firstLineIndent: pt(21), hyphenation: { enabled: false } },
  cjk: { grid },
  ...extra,
});

// 红楼梦, the opening of chapter 1.
const PASSAGE = '此开卷第一回也。作者自云：因曾历过一番梦幻之后，故将真事隐去，而借「通灵」之说，撰此《石头记》一书也。故曰「甄士隐」云云。但书中所记何事何人？自又云：今风尘碌碌，一事无成，忽念及当日所有之女子，一一细考较去，觉其行止见识，皆出于我之上。何我堂堂须眉，诚不若彼裙钗哉？实愧则有余，悔又无益之大无可如何之日也！';

describe('character grid (cjk.grid)', () => {
  it('sets a 28-character measure and centres the type area inside the margins', () => {
    const config = bookConfig({ enabled: true, charsPerLine: 28, linesPerPage: 28 });
    const g = cjkGridGeometry(config)!;
    expect(g).toMatchObject({ charsPerLine: 28, linesPerPage: 28, columns: 1, clamped: {} });
    const resolved = resolveAllConfig(config);
    const area = computePageMetrics(resolved).contentArea;
    expect(area.width).toBeCloseTo(294, 9); // 28 × 10.5 pt
    expect(area.height).toBeCloseTo(462, 9); // 28 × 16.5 pt
    // The slack left by the margins is shared: 104 mm less 294 pt, halved.
    const slack = (104 * MM - 294) / 2;
    expect(area.x).toBeCloseTo(16 * MM + slack, 9);
    expect(140 * MM - area.x - area.width).toBeCloseTo(20 * MM + slack, 9);
    expect(area.y).toBeCloseTo(18 * MM + (165 * MM - 462) / 2, 9);
    expect(resolved.cjk.grid).toEqual({ enabled: true, charsPerLine: 28, linesPerPage: 28, show: false });

    const doc = buildDocument({ markdown: PASSAGE }, config);
    const lines = doc.blocks.filter((b) => b.type === 'paragraph').flatMap((b) => b.lines);
    expect(lines.length).toBeGreaterThan(3);
    const block = doc.blocks.find((b) => b.type === 'paragraph')!;
    expect(block.bbox.width).toBeCloseTo(294, 9);
    for (const line of lines.slice(0, -1)) {
      expect(line.bbox.x - block.bbox.x + line.bbox.width).toBeCloseTo(294, 6);
    }
  });

  it('keeps the margins and the measure as written when off', () => {
    const config = bookConfig({ enabled: false, charsPerLine: 28 });
    expect(applyCjkGrid(config)).toBe(config);
    expect(computePageMetrics(resolveAllConfig(config)).contentArea.width).toBeCloseTo(104 * MM, 9);
  });

  it('fills the margins with whole characters and lines when no numbers are given', () => {
    const g = cjkGridGeometry(bookConfig({ enabled: true }))!;
    expect(g.charsPerLine).toBe(Math.floor((104 * MM) / 10.5));
    expect(g.linesPerPage).toBe(Math.floor((165 * MM) / 16.5));
  });

  it('sets two columns of 23 characters with a two-em gutter', () => {
    // 16开 (184 × 260 mm), 小五 (9 pt): 23 × 2, gutter 2 characters.
    const config: PostextConfig = {
      ...bookConfig({ enabled: true, charsPerLine: 23, linesPerPage: 46 }),
      page: { width: mm(184), height: mm(260), dpi: 72, margins: { top: mm(15), bottom: mm(15), left: mm(15), right: mm(15) } },
      layout: { layoutType: 'double', gutterWidth: mm(6) },
      bodyText: { fontSize: pt(9), lineHeight: pt(13.5), textAlign: 'justify', hyphenation: { enabled: false } },
    };
    const g = cjkGridGeometry(config)!;
    // 6 mm = 17 pt, the nearest whole number of 9 pt characters: 2.
    expect(g.gutterEm).toBe(2);
    const resolved = resolveAllConfig(config);
    expect(resolved.layout.gutterWidth).toEqual({ value: 18, unit: 'px' });
    const doc = buildDocument({ markdown: PASSAGE.repeat(8) }, config);
    const cols = doc.pages[0]!.columns;
    expect(cols.length).toBe(2);
    expect(cols[0]!.bbox.width).toBeCloseTo(207, 9);
    expect(cols[1]!.bbox.x - (cols[0]!.bbox.x + cols[0]!.bbox.width)).toBeCloseTo(18, 9);
  });

  it('cuts a oneAndHalf page into columns of whole characters and draws the grid on each', () => {
    // 大32开 as above, mirrored, the side column outside: 30 % of the 104 mm
    // inside the margins is 88.4 pt, 8 characters; the 6 mm gutter 2; the
    // main column 18. The type area is 28 characters wide, as before.
    const base = bookConfig({ enabled: true, charsPerLine: 18, linesPerPage: 28, show: true }, {
      layout: { layoutType: 'oneAndHalf', sideColumnPercent: 30, gutterWidth: mm(6), sideColumnRole: 'text', sideColumnSide: 'outer' },
      cjk: { punctuationWidth: 'fullwidth', compressAdjacent: false, trimLineStart: false, grid: { enabled: true, charsPerLine: 18, linesPerPage: 28, show: true } },
    });
    const config: PostextConfig = { ...base, page: { ...base.page!, margins: { ...base.page!.margins!, mirror: true } } };
    const g = cjkGridGeometry(config)!;
    expect(g).toMatchObject({ charsPerLine: 18, sideChars: 8, gutterEm: 2, clamped: {} });
    expect(g.inline).toBeCloseTo(294, 9);
    // Han text alone: every full line is 18 or 8 characters, set solid.
    const han = PASSAGE.replace(/[^一-鿿]/g, '');
    const doc = buildDocument({ markdown: `${han.repeat(14)}\n\n${han.repeat(14)}` }, config);
    expect(doc.pages.length).toBeGreaterThan(1);
    for (const page of doc.pages.slice(0, 2)) {
      expect(page.columns.map((c) => c.bbox.width).map((w) => Math.round(w * 1e6) / 1e6)).toEqual([189, 84]);
      const recto = page.index % 2 === 0;
      const [main, side] = page.columns;
      // The side column outside: right on a recto, left on a verso.
      expect(side!.bbox.x > main!.bbox.x).toBe(recto);
      for (const col of page.columns) {
        for (const block of col.blocks) {
          for (const line of block.lines.slice(0, -1)) {
            expect(line.segments!.every((s) => s.tracking === undefined)).toBe(true);
            expect(line.bbox.x - block.bbox.x + line.bbox.width).toBeCloseTo(col.bbox.width, 6);
          }
        }
      }
      // The overlay: a set of cells on each column, as many as it holds.
      const cells = cjkGridCells(doc.config, page.contentArea, doc.baselineGrid, page.columns)!;
      const byX = [...page.columns].sort((a, b) => a.bbox.x - b.bbox.x);
      expect(cells.columns).toEqual(byX.map((c) => c.bbox.x));
      expect(cells.columnChars).toEqual(byX.map((c) => (c === main ? 18 : 8)));
    }
  });

  it('reduces a grid larger than the page and warns', () => {
    const config = bookConfig({ enabled: true, charsPerLine: 40, linesPerPage: 60 });
    const g = cjkGridGeometry(config)!;
    expect(g.charsPerLine).toBe(28);
    expect(g.linesPerPage).toBe(28);
    const warnings = collectConfigWarnings(config);
    expect(warnings).toEqual([
      { kind: 'cjkGridClamped', path: 'cjk.grid.charsPerLine', value: '40', used: '28' },
      { kind: 'cjkGridClamped', path: 'cjk.grid.linesPerPage', value: '60', used: '28' },
    ]);
    expect(formatWarning(warnings[0]!)).toBe('cjk.grid.charsPerLine: 40 characters per line do not fit inside the margins — the grid is set with 28');
    const doc = buildDocument({ markdown: PASSAGE }, config);
    expect(doc.configWarnings?.filter((w) => w.kind === 'cjkGridClamped').length).toBe(2);
    expect(computePageMetrics(resolveAllConfig(config)).contentArea.width).toBeCloseTo(294, 9);
  });

  it('runs characters down the page in vertical text', () => {
    // 148 × 210 mm, 10.5 pt, margins 15 mm: a column of 38 characters
    // (399 pt) runs down the 180 mm (510 pt) the margins leave.
    const config = {
      ...bookConfig({ enabled: true, charsPerLine: 38, linesPerPage: 20 }),
      page: { width: mm(148), height: mm(210), dpi: 72, margins: { top: mm(15), bottom: mm(15), left: mm(15), right: mm(15) } },
      layout: { layoutType: 'single', writingMode: 'vertical-rl' },
    } as unknown as PostextConfig;
    const g = cjkGridGeometry(config)!;
    expect(g.vertical).toBe(true);
    expect(g.charsPerLine).toBe(38);
    // Along the height: 38 characters; across the width: 20 lines.
    expect(210 * MM - g.margins.top - g.margins.bottom).toBeCloseTo(38 * 10.5, 9);
    expect(148 * MM - g.margins.left - g.margins.right).toBeCloseTo(20 * 16.5, 9);
    // 180 mm of height hold 48 characters, 118 mm of width 20 lines.
    expect(cjkGridGeometry({ ...config, cjk: { grid: { enabled: true } } })!).toMatchObject({ charsPerLine: 48, linesPerPage: 20 });
  });

  it('lays a vertical page out on the grid: 38 characters down each line, 20 lines across', () => {
    const config: PostextConfig = {
      ...bookConfig({ enabled: true, charsPerLine: 38, linesPerPage: 20, show: true }),
      page: { width: mm(148), height: mm(210), dpi: 72, margins: { top: mm(15), bottom: mm(15), left: mm(15), right: mm(15) } },
      layout: { layoutType: 'single', writingMode: 'vertical-rl' },
    };
    config.cjk = { ...config.cjk, punctuationWidth: 'fullwidth', compressAdjacent: false, trimLineStart: false };
    const doc = buildDocument({ markdown: PASSAGE.repeat(6) }, config);
    const page = doc.pages[0]!;
    expect(page.flow).toBeDefined();
    // The flow frame: lines run down the sheet's height, 38 ems long; 20
    // lines of 16.5 pt across its width.
    expect(page.contentArea.width).toBeCloseTo(38 * 10.5, 9);
    expect(page.contentArea.height).toBeCloseTo(20 * 16.5, 9);
    const lines = page.columns.flatMap((c) => c.blocks.flatMap((b) => b.lines.map((l) => ({ l, b }))));
    expect(lines).toHaveLength(20);
    const block = page.columns[0]!.blocks[0]!;
    for (const { l, b } of lines.slice(0, -1)) {
      if (b !== block) continue;
      expect(l.bbox.x - page.contentArea.x + l.bbox.width).toBeCloseTo(38 * 10.5, 6);
      // Han characters one em (a cell) each down the line, set solid.
      for (const s of l.segments ?? []) if (/^[一-鿿]+$/.test(s.text)) expect(s.width).toBeCloseTo(10.5 * [...s.text].length, 6);
    }
    // The overlay on a vertical page: one set of 38 cells, a row per line
    // centred on the axis the characters stand on.
    const cells = cjkGridCells(doc.config, page.contentArea, doc.baselineGrid, page.columns, page.flow)!;
    expect(cells.columns).toEqual([page.contentArea.x]);
    expect(cells.columnChars).toEqual([38]);
    expect(cells.rows).toHaveLength(20);
    const central = verticalFlowOf(page)!.centralBaselines?.['Noto Serif SC'] ?? 0.38;
    lines.forEach(({ l }, j) => expect(cells.rows[j]! + 10.5 / 2).toBeCloseTo(l.baseline - central * 10.5, 6));
  });

  it('cuts a vertical double page into two tiers of whole characters, a whole-em gutter between them', () => {
    // 148 × 210 mm, 10.5 pt, 20 characters to a tier, 6 mm gutter (2 em).
    const config: PostextConfig = {
      ...bookConfig({ enabled: true, charsPerLine: 20, linesPerPage: 20, show: true }),
      page: { width: mm(148), height: mm(210), dpi: 72, margins: { top: mm(15), bottom: mm(15), left: mm(15), right: mm(15) } },
      layout: { layoutType: 'double', gutterWidth: mm(6), writingMode: 'vertical-rl' },
    };
    config.cjk = { ...config.cjk, punctuationWidth: 'fullwidth', compressAdjacent: false, trimLineStart: false };
    const g = cjkGridGeometry(config)!;
    expect(g).toMatchObject({ vertical: true, columns: 2, gutterEm: 2, charsPerLine: 20, linesPerPage: 20 });
    const doc = buildDocument({ markdown: PASSAGE.repeat(8) }, config);
    const page = doc.pages[0]!;
    const [upper, lower] = page.columns;
    expect(page.columns).toHaveLength(2);
    expect(upper!.bbox.width).toBeCloseTo(210, 9);
    expect(lower!.bbox.width).toBeCloseTo(210, 9);
    expect(lower!.bbox.x - (upper!.bbox.x + upper!.bbox.width)).toBeCloseTo(21, 9);
    // On the sheet the tiers stack top to bottom (the flow's x runs down).
    const sheet = page.columns.map((c) => flowRectToPage(page, c.bbox));
    expect(sheet[0]!.y + sheet[0]!.height).toBeLessThanOrEqual(sheet[1]!.y + 1e-9);
    expect(sheet[1]!.y - (sheet[0]!.y + sheet[0]!.height)).toBeCloseTo(21, 9);
    // Every full line of each tier is 20 ems.
    for (const col of page.columns) {
      for (const b of col.blocks) {
        for (const l of b.lines.slice(0, -1)) expect(l.bbox.x - col.bbox.x + l.bbox.width).toBeCloseTo(210, 6);
      }
    }
    const cells = cjkGridCells(doc.config, page.contentArea, doc.baselineGrid, page.columns, page.flow)!;
    expect(cells.columns).toEqual([upper!.bbox.x, lower!.bbox.x]);
    expect(cells.columnChars).toEqual([20, 20]);
  });

  it('draws the grid on screen when shown', () => {
    const shown = buildDocument({ markdown: PASSAGE }, bookConfig({ enabled: true, charsPerLine: 28, linesPerPage: 28, show: true }));
    const hidden = buildDocument({ markdown: PASSAGE }, bookConfig({ enabled: true, charsPerLine: 28, linesPerPage: 28 }));
    const strokes = (doc: typeof shown): number => {
      let moves = 0;
      const target: Record<string | symbol, unknown> = { letterSpacing: '0px' };
      const ctx = new Proxy(target, {
        get(t, key) {
          if (key === 'moveTo') return () => { moves++; };
          if (key === 'measureText') return (s: string) => ({ width: adv(s, 10.5) });
          if (key in t) return t[key];
          return () => undefined;
        },
        set(t, key, value) { t[key] = value; return true; },
      });
      renderPageToCanvas(doc.pages[0]!, doc, { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement);
      return moves;
    };
    // 28 rows × (2 edges + 29 cell walls).
    expect(strokes(shown) - strokes(hidden)).toBe(28 * 31);
    expect(renderToHtml(shown)).toContain('class="pt-char-grid"');
    expect(renderToHtml(hidden)).not.toContain('pt-char-grid');
  });
});
