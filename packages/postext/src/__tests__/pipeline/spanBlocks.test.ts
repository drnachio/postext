import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import { collectColumnGaps } from '../../pipeline/columnBalancing';
import { columnRuleSegments } from '../../columnRule';
import { renderToHtml } from '../../html-backend';
import {
  createVDTPage,
  createVDTColumn,
  createVDTDocument,
  type VDTBlock,
  type VDTColumn,
  type VDTDocument,
  type VDTPage,
} from '../../vdt';
import { resolveAllConfig } from '../../pipeline/config';
import type { PostextConfig, PostextContent, Resource } from '../../types';

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

// Default 300 dpi: body 8pt → 33.33px, grid (1.5em) → 50px, callout
// margins (0.75em) → 25px.
const BODY_PX = (8 * 300) / 72;
const GRID = BODY_PX * 1.5;
const PAD = BODY_PX * 0.75;

const SENTENCE =
  'La linterna del faro debe permanecer encendida toda la noche para guiar a los barcos que cruzan la bahía. ';
const filler = (n: number): string => SENTENCE.repeat(n).trim();

const mm = (value: number) => ({ value, unit: 'mm' as const });

/** Two-column page, ~23 grid lines tall. */
const TWO_COL: PostextConfig = {
  headings: { balancing: { enabled: false } },
  page: { width: mm(160), height: mm(120), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'double' },
};

function build(md: string, config: PostextConfig = TWO_COL, resources?: Resource[]): VDTDocument {
  const content: PostextContent = resources ? { markdown: md, resources } : { markdown: md };
  return buildDocument(content, config, createMeasurementCache());
}

const frames = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.type === 'callout');
const childrenOf = (doc: VDTDocument, frame: VDTBlock): VDTBlock[] =>
  doc.blocks.filter((b) => b.containerId === frame.containerId && b !== frame);
const columnOf = (doc: VDTDocument, b: VDTBlock): VDTColumn => doc.pages[b.pageIndex]!.columns[b.columnIndex]!;
const textColumns = (page: VDTPage, band: number): VDTColumn[] =>
  page.columns.filter((c) => c.kind !== 'span' && (c.band ?? 0) === band);
const spanColumns = (page: VDTPage): VDTColumn[] => page.columns.filter((c) => c.kind === 'span');
const onGrid = (v: number): boolean => Math.abs(v / GRID - Math.round(v / GRID)) < 1e-6;

const SPAN_CALLOUT = [
  ':::callout{span="page" title="Recuerda"}',
  filler(2),
  '',
  '- Revisa la mecha.',
  '- Recórtala al anochecer.',
  ':::',
].join('\n');

const SPAN_CALLOUT_2 = [':::callout{span="page" type="warning"}', filler(1), ':::'].join('\n');

describe('page-span callouts (span blocks, stage 1)', () => {
  it('places a page-span callout on an empty page as a span column across the content width', () => {
    const doc = build([SPAN_CALLOUT, '', filler(6)].join('\n'));
    const [frame] = frames(doc);
    expect(frame).toBeDefined();
    const page = doc.pages[frame!.pageIndex]!;
    expect(page.index).toBe(0);
    const spanCol = columnOf(doc, frame!);
    expect(spanCol.kind).toBe('span');
    expect(spanCol.bbox.x).toBeCloseTo(page.contentArea.x, 5);
    expect(spanCol.bbox.width).toBeCloseTo(page.contentArea.width, 5);
    expect(spanCol.bbox.y).toBeCloseTo(page.contentArea.y, 5);
    // The box is laid out at page width, at the page top (no spacing there).
    expect(frame!.bbox.x).toBeCloseTo(page.contentArea.x, 5);
    expect(frame!.bbox.width).toBeCloseTo(page.contentArea.width, 5);
    expect(frame!.bbox.y).toBeCloseTo(page.contentArea.y, 5);
    expect(frame!.callout!.span).toBe('page');
    // The span column is as tall as the box plus marginBottom, on the grid,
    // and holds the frame then its children with matching indices.
    expect(onGrid(spanCol.bbox.height)).toBe(true);
    expect(spanCol.bbox.height).toBeGreaterThanOrEqual(frame!.bbox.height + PAD - 0.01);
    expect(spanCol.bbox.height).toBeLessThan(frame!.bbox.height + PAD + GRID);
    expect(spanCol.availableHeight).toBe(0);
    const children = childrenOf(doc, frame!);
    expect(children.map((c) => c.type)).toEqual(['paragraph', 'listItem', 'listItem']);
    expect(spanCol.blocks).toEqual([frame, ...children]);
    for (const c of children) {
      expect([c.pageIndex, c.columnIndex]).toEqual([frame!.pageIndex, frame!.columnIndex]);
      expect(c.bbox.x).toBeGreaterThanOrEqual(frame!.bbox.x + PAD - 1e-6);
      expect(c.bbox.x + c.bbox.width).toBeLessThanOrEqual(frame!.bbox.x + frame!.bbox.width + 1e-6);
    }
    // Band 0: the two original text columns, closed at the page top
    // (zero-height). Band 1: two fresh columns below the span, same x /
    // width, reaching the content-area bottom.
    const band0 = textColumns(page, 0);
    const band1 = textColumns(page, 1);
    expect(band0).toHaveLength(2);
    expect(band1).toHaveLength(2);
    for (const c of band0) {
      expect(c.bbox.height).toBe(0);
      expect(c.availableHeight).toBe(0);
      expect(c.blocks).toHaveLength(0);
    }
    band1.forEach((c, i) => {
      expect(c.bbox.x).toBeCloseTo(band0[i]!.bbox.x, 5);
      expect(c.bbox.width).toBeCloseTo(band0[i]!.bbox.width, 5);
      expect(c.bbox.y).toBeCloseTo(spanCol.bbox.y + spanCol.bbox.height, 5);
      expect(c.bbox.y + c.bbox.height).toBeCloseTo(page.contentArea.y + page.contentArea.height, 5);
    });
    // Columns are appended in reading order with monotonic indices.
    expect(page.columns.map((c) => c.index)).toEqual(page.columns.map((_, i) => i));
    expect(page.columns.map((c) => c.kind ?? 'text')).toEqual(['text', 'text', 'span', 'text', 'text']);
    // The text after the box flows into the first column of band 1, and
    // doc.blocks keeps placement order.
    const after = doc.blocks.find((b) => b.type === 'paragraph' && b.containerId === undefined)!;
    expect(after.columnIndex).toBe(band1[0]!.index);
    expect(after.bbox.y).toBeCloseTo(band1[0]!.bbox.y, 5);
    expect(doc.blocks.indexOf(after)).toBe(doc.blocks.indexOf(frame!) + children.length + 1);
    // The HTML backend renders the span block like any other (absolute
    // geometry, full width).
    expect(renderToHtml(doc)).toContain(`data-block-id="${frame!.id}"`);
  });

  it('places a span callout directly below a span:page opener heading', () => {
    const config: PostextConfig = {
      ...TWO_COL,
      headings: {
        balancing: { enabled: false },
        levels: [{ level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' } }],
      },
    };
    const doc = build(['# Capítulo', '', SPAN_CALLOUT, '', filler(6)].join('\n'), config);
    const heading = doc.blocks.find((b) => b.type === 'heading')!;
    const [frame] = frames(doc);
    expect(frame!.pageIndex).toBe(heading.pageIndex);
    expect(frame!.pageIndex).toBe(0);
    const page = doc.pages[0]!;
    const spanCol = columnOf(doc, frame!);
    expect(spanCol.kind).toBe('span');
    // The opener reserved its (grid-snapped) band in both columns, so the
    // band is level and the cut sits right at the heading's bottom.
    const headingBottom = heading.bbox.y + heading.bbox.height;
    expect(onGrid(headingBottom - page.contentArea.y)).toBe(true);
    expect(spanCol.bbox.y).toBeCloseTo(headingBottom, 5);
    const band0 = textColumns(page, 0);
    expect(band0).toHaveLength(2);
    for (const c of band0) {
      expect(c.bbox.y + c.bbox.height).toBeCloseTo(headingBottom, 5);
      expect(c.availableHeight).toBe(0);
    }
    expect(band0[0]!.blocks).toEqual([heading]);
    // marginTop separates the box from the heading (band already holds
    // content), and the box spans the page.
    expect(frame!.bbox.y - headingBottom).toBeCloseTo(PAD, 5);
    expect(frame!.bbox.width).toBeCloseTo(page.contentArea.width, 5);
    expect(textColumns(page, 1)).toHaveLength(2);
  });

  it('band 1 columns start on the baseline grid below the span block', () => {
    const openerConfig: PostextConfig = {
      ...TWO_COL,
      headings: {
        balancing: { enabled: false },
        levels: [{ level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' } }],
      },
    };
    const docs = [
      build([SPAN_CALLOUT, '', filler(6)].join('\n')),
      build(['# Capítulo', '', SPAN_CALLOUT, '', filler(6)].join('\n'), openerConfig),
      build([SPAN_CALLOUT, '', SPAN_CALLOUT_2, '', filler(6)].join('\n')),
    ];
    for (const doc of docs) {
      const page = doc.pages[0]!;
      const spans = spanColumns(page);
      expect(spans.length).toBeGreaterThan(0);
      for (const s of spans) {
        expect(onGrid(s.bbox.y - page.contentArea.y)).toBe(true);
        expect(onGrid(s.bbox.height)).toBe(true);
      }
      const lastBand = Math.max(...page.columns.map((c) => c.band ?? 0));
      const cols = textColumns(page, lastBand);
      expect(cols).toHaveLength(2);
      for (const c of cols) expect(onGrid(c.bbox.y - page.contentArea.y)).toBe(true);
      // The first body line after the box sits on the global grid too.
      const after = doc.blocks.find((b) => b.type === 'paragraph' && b.containerId === undefined)!;
      expect(after.pageIndex).toBe(0);
      expect(columnOf(doc, after)).toBe(cols[0]);
      expect(onGrid(after.lines[0]!.bbox.y - page.contentArea.y)).toBe(true);
    }
  });

  it('pushes a span block to the next page when no level cut leaves room for it and leaves the page balanceable', () => {
    // Page 0 holds ~30 lines of text across its two columns: a level cut
    // (stage 2, `spanBands.test.ts`) would sit at line 15 and leave no room
    // for the 7-line box plus the widow minimum below it, so the box opens
    // page 1 at its top and page 0 keeps its plain two columns.
    const md = [filler(16), '', '## Sección', '', filler(2), '', filler(8), '', SPAN_CALLOUT, '', filler(6)].join('\n');
    const doc = build(md);
    const [frame] = frames(doc);
    expect(doc.iterationCount).toBe(1);
    expect(frame!.pageIndex).toBe(1);
    const page0 = doc.pages[0]!;
    const page1 = doc.pages[1]!;
    expect(spanColumns(page0)).toHaveLength(0);
    expect(page0.columns).toHaveLength(2);
    expect(page0.columns[0]!.blocks.length).toBeGreaterThan(0);
    expect(page0.columns[1]!.blocks.length).toBeGreaterThan(0);
    expect(columnOf(doc, frame!).kind).toBe('span');
    expect(frame!.bbox.y).toBeCloseTo(page1.contentArea.y, 5);
    // Page 0 was NOT marked as a forced break: its last column is a
    // balancing target (the heading inside it is a stretch point)…
    const gaps = collectColumnGaps(doc, new Set());
    const gap0 = gaps.find((g) => g.pageIndex === 0 && g.columnIndex === 0);
    expect(gap0).toBeDefined();
    expect(gap0!.candidates.some((c) => c.kind === 'heading')).toBe(true);
    // …so with balancing on, the heading moves down to absorb the gap.
    const balanced = build(md, { ...TWO_COL, headings: { balancing: { enabled: true } } });
    const h0 = doc.blocks.find((b) => b.type === 'heading')!;
    const h1 = balanced.blocks.find((b) => b.type === 'heading')!;
    expect(h1.pageIndex).toBe(0);
    expect(h1.bbox.y - h0.bbox.y).toBeGreaterThanOrEqual(GRID - 0.01);
    expect(frames(balanced)[0]!.pageIndex).toBe(1);
  });

  it('consecutive span blocks stack with a zero-height intermediate band', () => {
    const doc = build([SPAN_CALLOUT, '', SPAN_CALLOUT_2, '', filler(4)].join('\n'));
    const [a, b] = frames(doc);
    expect(a!.pageIndex).toBe(0);
    expect(b!.pageIndex).toBe(0);
    const page = doc.pages[0]!;
    const colA = columnOf(doc, a!);
    const colB = columnOf(doc, b!);
    expect(colA.kind).toBe('span');
    expect(colB.kind).toBe('span');
    expect(colA.band).toBe(0);
    expect(colB.band).toBe(1);
    // B sits right under A's column (A's marginBottom is baked into its
    // grid-rounded height; no spacing above B — the band held no text).
    expect(colB.bbox.y).toBeCloseTo(colA.bbox.y + colA.bbox.height, 5);
    expect(b!.bbox.y).toBeCloseTo(colB.bbox.y, 5);
    // The band between them exists but is zero-height and empty.
    const band1 = textColumns(page, 1);
    expect(band1).toHaveLength(2);
    for (const c of band1) {
      expect(c.bbox.height).toBe(0);
      expect(c.blocks).toHaveLength(0);
    }
    // Band 2 carries the text after both boxes.
    const band2 = textColumns(page, 2);
    expect(band2).toHaveLength(2);
    expect(band2[0]!.bbox.y).toBeCloseTo(colB.bbox.y + colB.bbox.height, 5);
    const after = doc.blocks.find((p) => p.type === 'paragraph' && p.containerId === undefined)!;
    expect(columnOf(doc, after)).toBe(band2[0]);
    expect(page.columns.map((c) => c.kind ?? 'text')).toEqual(
      ['text', 'text', 'span', 'text', 'text', 'span', 'text', 'text'],
    );
    // Reading order in doc.blocks: A + children, B + children, then the text.
    const order = doc.blocks.map((blk) => blk.containerId ?? 'free');
    expect(order.indexOf(b!.containerId!)).toBeGreaterThan(order.lastIndexOf(a!.containerId!));
    expect(order.indexOf('free')).toBeGreaterThan(order.lastIndexOf(b!.containerId!));
  });

  it('single-column layout keeps span callouts inline', () => {
    const doc = build(['Intro.', '', SPAN_CALLOUT, '', 'After.'].join('\n'), {
      ...TWO_COL,
      layout: { layoutType: 'single' },
    });
    const [frame] = frames(doc);
    const page = doc.pages[frame!.pageIndex]!;
    expect(page.columns).toHaveLength(1);
    expect(spanColumns(page)).toHaveLength(0);
    const col = columnOf(doc, frame!);
    expect(col.kind).toBeUndefined();
    expect(col.blocks).toContain(frame);
    expect(frame!.callout!.span).toBe('page');
    expect(frame!.bbox.width).toBeCloseTo(col.bbox.width, 5);
    // Intro above, After below, all in the same column.
    const intro = doc.blocks[0]!;
    const after = doc.blocks[doc.blocks.length - 1]!;
    expect(intro.lines[0]!.text).toBe('Intro.');
    expect(after.lines[0]!.text).toBe('After.');
    expect(intro.bbox.y).toBeLessThan(frame!.bbox.y);
    expect(after.bbox.y).toBeGreaterThan(frame!.bbox.y + frame!.bbox.height);
  });

  it('floating placements (top / bottom) still fall back to inline placement', () => {
    const doc = build(['Intro.', '', ':::callout{span="page" placement="bottom"}', filler(1), ':::', '', 'After.'].join('\n'));
    const [frame] = frames(doc);
    expect(frame!.callout!.placement).toBe('bottom');
    expect(spanColumns(doc.pages[0]!)).toHaveLength(0);
    expect(frame!.bbox.width).toBeCloseTo(columnOf(doc, frame!).bbox.width, 5);
  });

  it('span band is cut inside float-reduced column extents (top and bottom floats)', () => {
    const wide = (id: string, position: 'top' | 'bottom'): Resource => ({
      id,
      typeId: 'figure',
      kind: 'bitmap',
      caption: `Figura ${id}.`,
      createdAt: 0,
      updatedAt: 0,
      bitmap: { fileId: `${id}.png`, format: 'png', width: 1600, height: 200 },
      placement: { position, span: 'page' },
    });
    // Both floats are referenced in the first paragraph of page 0. The
    // bottom float takes the first free slot after its reference — the
    // bottom band of page 0, which every column still has room for. The
    // top float only accepts top slots, so it waits for the next page. Page
    // 0 is then filled past the point where a level cut could still hold
    // the box (stage 2), so the box opens page 1 — whose top band is
    // reserved first — and cuts the band right below it.
    const md = ['Ver :ref{id="ft"} y :ref{id="fb"}.', '', filler(40), '', SPAN_CALLOUT_2, '', filler(6)].join('\n');
    const doc = build(md, TWO_COL, [wide('ft', 'top'), wide('fb', 'bottom')]);
    const [frame] = frames(doc);
    expect(frame!.pageIndex).toBe(1);
    const page0 = doc.pages[0]!;
    const bottom = (page0.floats ?? []).find((f) => f.resourceBlock!.resource.id === 'fb')!;
    expect(bottom).toBeDefined();
    // The bottom band shortens every text column of page 0.
    for (const c of textColumns(page0, 0)) {
      expect(c.bbox.y + c.bbox.height).toBeLessThanOrEqual(bottom.bbox.y + 1e-6);
      expect(c.bbox.y + c.bbox.height).toBeLessThan(page0.contentArea.y + page0.contentArea.height);
    }
    const page = doc.pages[1]!;
    const floats = page.floats ?? [];
    expect(floats.map((f) => f.resourceBlock!.resource.id)).toEqual(['ft']);
    const top = floats[0]!;
    const spanCol = columnOf(doc, frame!);
    expect(spanCol.kind).toBe('span');
    // The cut lies inside the float-reduced band: at or below the top band
    // (a few lines spilled from page 0 may sit above it, cut level by a
    // band cap).
    const band0 = textColumns(page, 0);
    expect(band0).toHaveLength(2);
    expect(spanCol.bbox.y).toBeGreaterThanOrEqual(band0[0]!.bbox.y - 1e-6);
    expect(spanCol.bbox.y).toBeGreaterThanOrEqual(top.bbox.y + top.bbox.height - 1e-6);
    expect(spanCol.bbox.y).toBeGreaterThan(page.contentArea.y);
    const band1 = textColumns(page, 1);
    expect(band1).toHaveLength(2);
    for (const c of band1) {
      expect(c.bbox.y).toBeCloseTo(spanCol.bbox.y + spanCol.bbox.height, 5);
    }
    // Text after the box flows into band 1 on the same page.
    const after = doc.blocks.find((b) =>
      b.type === 'paragraph' && b.containerId === undefined && b.pageIndex === 1
      && (b.contentIndex ?? -1) > frame!.contentIndex!)!;
    expect(columnOf(doc, after)).toBe(band1[0]);
  }, 30_000); // lays out a full two-float page: ~2 s locally, ~8 s on the CI runner

  it('columnBalancing: collectColumnGaps ignores span columns and treats the last text column as the page end', () => {
    const resolved = resolveAllConfig();
    const doc = createVDTDocument(resolved, GRID);
    const mk = (id: string, type: VDTBlock['type'], contentIndex: number, extra: Partial<VDTBlock> = {}): VDTBlock => ({
      id, type, bbox: { x: 0, y: 0, width: 500, height: GRID }, lines: [],
      pageIndex: 0, columnIndex: 0, dirty: false, snappedToGrid: false,
      fontString: '', color: '', textAlign: 'left', contentIndex, ...extra,
    });
    const page = createVDTPage(0, 1200, 1000);
    // Band 0: two text columns closed at y = 600 (the cut), then a span
    // column, then a zero-height band 1 (nothing landed there).
    const c0 = createVDTColumn(0, { x: 0, y: 0, width: 500, height: 600 });
    const c1 = createVDTColumn(1, { x: 600, y: 0, width: 500, height: 600 });
    c0.band = 0; c1.band = 0;
    c0.blocks.push(mk('p0', 'paragraph', 0), mk('h1', 'heading', 1, { headingLevel: 2 }), mk('p2', 'paragraph', 2));
    c0.availableHeight = 2 * GRID;
    c1.blocks.push(mk('p3', 'paragraph', 3), mk('h4', 'heading', 4, { headingLevel: 2 }), mk('p5', 'paragraph', 5));
    c1.availableHeight = 3 * GRID;
    const span = createVDTColumn(2, { x: 0, y: 600, width: 1100, height: 300 });
    span.kind = 'span'; span.band = 0;
    span.blocks.push(mk('frame', 'callout', 6, { containerId: 1, columnIndex: 2 }));
    span.availableHeight = 4 * GRID; // bogus slack — must never be a gap
    const z0 = createVDTColumn(3, { x: 0, y: 900, width: 500, height: 0 });
    const z1 = createVDTColumn(4, { x: 600, y: 900, width: 500, height: 0 });
    z0.band = 1; z1.band = 1;
    page.columns.push(c0, c1, span, z0, z1);
    const page2 = createVDTPage(1, 1200, 1000);
    const c20 = createVDTColumn(0, { x: 0, y: 0, width: 500, height: 900 });
    c20.blocks.push(mk('p7', 'paragraph', 7, { pageIndex: 1 }));
    page2.columns.push(c20);
    doc.pages.push(page, page2);
    doc.blocks.push(...c0.blocks, ...c1.blocks, ...span.blocks, ...c20.blocks);

    // Page flows on: both text columns balance, the span column never.
    const flowing = collectColumnGaps(doc, new Set());
    expect(flowing.map((g) => [g.pageIndex, g.columnIndex, g.gapLines])).toEqual([[0, 0, 2], [0, 1, 3]]);
    // Forced break after page 0: column 1 is the page's real last column
    // even though a span column (and an empty band) trail it.
    const forced = collectColumnGaps(doc, new Set([0]));
    expect(forced.map((g) => [g.pageIndex, g.columnIndex, g.gapLines])).toEqual([[0, 0, 2]]);
  });

  it('column rule is drawn per band', () => {
    const col = (index: number, bbox: VDTColumn['bbox'], extra: Partial<VDTColumn> = {}): VDTColumn => ({
      ...createVDTColumn(index, bbox),
      ...extra,
    });
    // Plain two-column page: one rule across the full column height.
    const plain = columnRuleSegments([
      col(0, { x: 0, y: 0, width: 100, height: 500 }),
      col(1, { x: 120, y: 0, width: 100, height: 500 }),
    ]);
    expect(plain).toEqual([{ x: 110, top: 0, bottom: 500 }]);
    // Banded page: band 0 (0–200), span (200–300), band 1 (300–600), and a
    // trailing zero-height band — the rule breaks at the span block.
    const banded = columnRuleSegments([
      col(0, { x: 0, y: 0, width: 100, height: 200 }, { band: 0 }),
      col(1, { x: 120, y: 0, width: 100, height: 200 }, { band: 0 }),
      col(2, { x: 0, y: 200, width: 220, height: 100 }, { band: 0, kind: 'span' }),
      col(3, { x: 0, y: 300, width: 100, height: 300 }, { band: 1 }),
      col(4, { x: 120, y: 300, width: 100, height: 300 }, { band: 1 }),
      col(5, { x: 0, y: 600, width: 100, height: 0 }, { band: 2 }),
      col(6, { x: 120, y: 600, width: 100, height: 0 }, { band: 2 }),
    ]);
    expect(banded).toEqual([
      { x: 110, top: 0, bottom: 200 },
      { x: 110, top: 300, bottom: 600 },
    ]);
    // A page that opens with a span block has a zero-height band 0: no rule
    // there, one for the band below.
    const opening = columnRuleSegments([
      col(0, { x: 0, y: 0, width: 100, height: 0 }, { band: 0 }),
      col(1, { x: 120, y: 0, width: 100, height: 0 }, { band: 0 }),
      col(2, { x: 0, y: 0, width: 220, height: 150 }, { band: 0, kind: 'span' }),
      col(3, { x: 0, y: 150, width: 100, height: 450 }, { band: 1 }),
      col(4, { x: 120, y: 150, width: 100, height: 450 }, { band: 1 }),
    ]);
    expect(opening).toEqual([{ x: 110, top: 150, bottom: 600 }]);
    // Single column: nothing to rule.
    expect(columnRuleSegments([col(0, { x: 0, y: 0, width: 100, height: 500 })])).toEqual([]);
  });
});
