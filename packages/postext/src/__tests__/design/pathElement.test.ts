import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build.js';
import { createMeasurementCache } from '../../measure/index.js';
import { layoutDesignSlot, type ResolvedPathPrimitive } from '../../design/layout.js';
import { resolveHeadingsConfig } from '../../defaults/index.js';
import { resolveDesignSlot } from '../../defaults/headerFooter.js';
import { measureHeadingAdvancedDesignHeight } from '../../pipeline/pages/headerFooter.js';
import { collectConfigWarnings } from '../../configWarnings.js';
import { renderHeaderFooterSlot } from '../../canvas-backend/headerFooter.js';
import { renderToHtmlIndexed } from '../../html-backend.js';
import { sourceAt } from '../../composed/sourceMap.js';
import { dimensionToPx } from '../../units.js';
import type { DesignPlaceholderContext } from '../../design/placeholders.js';
import type { PageTemplate } from '../../composed/types.js';
import type { DesignElement, DesignPathElement, PostextConfig, VDTDesignPathBlock, VDTDocument, VDTPage } from '../../index.js';

// A path element (#1060): SVG path data in fractions of its own box, laid
// into the vector design block in every design slot.

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

const mm = (value: number) => ({ value, unit: 'mm' as const });
const pt = (value: number) => ({ value, unit: 'pt' as const });
const px = (value: number) => ({ value, unit: 'px' as const });
const ink = (hex: string, paletteId?: string) => ({ hex, model: 'hex' as const, ...(paletteId ? { paletteId } : {}) });

/** Three chevrons pointing right, in a 9 × 3 box. */
const CHEVRONS = 'M0 0L1.5 1.5L0 3H1L2.5 1.5L1 0Z M3 0l1.5 1.5L3 3h1l1.5-1.5L4 0z M6 0L7.5 1.5L6 3H7L8.5 1.5L7 0Z';
/** A bar ending in an arrow head. */
const RIBBON = 'M0 0H0.94L1 0.5L0.94 1H0Z';

const path = (id: string, extra: Partial<DesignPathElement> & Pick<DesignPathElement, 'placement'>): DesignElement =>
  ({ kind: 'path', id, d: 'M0 0L1 0L1 1Z', ...extra }) as DesignElement;

const stubPage = { index: 0, pageLabel: '1' } as unknown as VDTPage;
const placeholders: DesignPlaceholderContext = { kind: 'header', page: stubPage, allPages: [stubPage], metadata: {}, chapterTitleByPageIndex: [] };
const sheet = { x: 0, y: 0, width: 400, height: 300 };
const lay = (elements: DesignElement[]) =>
  layoutDesignSlot(resolveDesignSlot({ elements }), { container: sheet, dpi: 96, placeholders, frames: { page: sheet, bleed: sheet } }, 0);
const points = (p: ResolvedPathPrimitive | VDTDesignPathBlock) =>
  p.subpaths.flat().filter((c) => c.op !== 'Z').map((c) => [Math.round((c as { x: number }).x * 1000) / 1000, Math.round((c as { y: number }).y * 1000) / 1000]);

describe('a path element laid on its box (#1060)', () => {
  const at = { anchor: { to: 'container' as const, edge: 'top-left' as const }, offset: { x: px(10), y: px(20) } };

  it('stretches the unit square to the box by default', () => {
    const [prim] = lay([path('p', { placement: { ...at, size: { width: px(200), height: px(100) } } })]).primitives as ResolvedPathPrimitive[];
    expect(prim!.kind).toBe('path');
    expect([prim!.x, prim!.y, prim!.width, prim!.height]).toEqual([10, 20, 200, 100]);
    expect(points(prim!)).toEqual([[10, 20], [210, 20], [210, 120]]);
    // Neither a fill nor an outline set: filled black, as an SVG path.
    expect(prim!.fill).toBe('#000000');
    expect(prim!.stroke).toBeUndefined();
  });

  it('fits a viewBox evenly inside the box, centred, with `meet`', () => {
    const el = path('p', { d: 'M0 0H2V1H0Z', viewBox: [2, 1], preserveAspectRatio: 'meet', placement: { ...at, size: { width: px(100), height: px(100) } } });
    const [prim] = lay([el]).primitives as ResolvedPathPrimitive[];
    // 2 × 1 in a 100 × 100 box: 100 × 50, 25 px down.
    expect(points(prim!)).toEqual([[10, 45], [110, 45], [110, 95], [10, 95]]);
    // The same path stretched fills the box.
    const [stretched] = lay([{ ...el, preserveAspectRatio: 'none' } as DesignElement]).primitives as ResolvedPathPrimitive[];
    expect(points(stretched!)).toEqual([[10, 20], [110, 20], [110, 120], [10, 120]]);
  });

  it('fills and strokes with its colours; the outline keeps its width and dash whatever the box', () => {
    const el = path('p', {
      fill: ink('#336699'), stroke: ink('#112233'), width: px(3), dash: [px(4), px(2)],
      placement: { ...at, size: { width: px(400), height: px(20) } },
    });
    const [prim] = lay([el]).primitives as ResolvedPathPrimitive[];
    expect(prim!.fill).toBe('#336699');
    expect(prim!.stroke).toEqual({ color: '#112233', widthPx: 3, dash: [4, 2] });
    // An outline alone draws no fill; its width defaults to half a point.
    const [line] = lay([path('l', { stroke: ink('#112233'), placement: { ...at, size: { width: px(10), height: px(10) } } })]).primitives as ResolvedPathPrimitive[];
    expect(line!.fill).toBeUndefined();
    expect(line!.stroke!.widthPx).toBeCloseTo(dimensionToPx(pt(0.5), 96), 6);
  });

  it('sizes like a box: a side left out fills to the container, a size runs to another element', () => {
    const els = [
      { kind: 'box', id: 'b', style: {}, placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { x: px(300) }, size: { width: px(20), height: px(20) } } } as DesignElement,
      path('p', { placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: { to: '#b', edge: 'left' }, height: px(30) } } }),
      path('q', { placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { y: px(100) } } }),
    ];
    const prims = lay(els).primitives as ResolvedPathPrimitive[];
    expect(prims[1]!.width).toBeCloseTo(300, 6);
    expect([prims[2]!.width, prims[2]!.height]).toEqual([400, 200]);
  });

  it('draws nothing for path data it cannot read or a viewBox with no area; elements anchored to it stay put', () => {
    const els = [
      path('bad', { d: 'M0 0 L1', placement: { ...at, size: { width: px(50), height: px(40) } } }),
      path('flat', { viewBox: [1, 0], placement: { ...at, size: { width: px(50), height: px(40) } } }),
      { kind: 'box', id: 'b', style: {}, placement: { anchor: { to: '#bad', edge: 'below' }, size: { width: px(5), height: px(5) } } } as DesignElement,
    ];
    const r = lay(els);
    expect(r.primitives.map((p) => p.kind)).toEqual(['box']);
    expect([r.primitives[0]!.x, r.primitives[0]!.y]).toEqual([10, 60]);
  });

  it('takes the part palette’s colour for a palette-linked fill and outline', () => {
    const el = path('p', { fill: ink('#9bcdbf', 'band'), stroke: ink('#000000', 'line'), placement: { ...at, size: { width: px(10), height: px(10) } } });
    const ctx = { ...placeholders, partPaletteByPageIndex: [{ band: '#f6c297', line: '#224466' }] };
    const [prim] = layoutDesignSlot(resolveDesignSlot({ elements: [el] }), { container: sheet, dpi: 96, placeholders: ctx }, 0).primitives as ResolvedPathPrimitive[];
    expect(prim!.fill).toBe('#f6c297');
    expect(prim!.stroke!.color).toBe('#224466');
  });
});

// ---------------------------------------------------------------------------
// Running heads, part palettes, outputs.
// ---------------------------------------------------------------------------

const DPI = 300;
const filler = (n: number) =>
  Array.from({ length: n }, (_, i) => `Paragraph ${i} with enough words to fill the column and carry the text on to the next page.`).join('\n\n');
const base: PostextConfig = {
  page: { width: pt(360), height: pt(240), dpi: DPI, margins: { top: pt(30), bottom: pt(18), left: pt(18), right: pt(18) } } as never,
  layout: { layoutType: 'single' },
  colorPalette: [{ id: 'band', name: 'Band', value: ink('#9bcdbf') }],
  headings: { levels: [{ level: 1, breakBefore: { enabled: false } }] } as never,
};
/** The running head: the part's title, and the chevron trio beside it,
 *  centred on its height. */
const header = {
  elements: [
    { kind: 'text', id: 'head', content: '{partTitle}', fontSize: pt(8), placement: { anchor: { to: 'container', edge: 'bottom-left' } } },
    path('chevrons', {
      d: CHEVRONS, viewBox: [9, 3], fill: ink('#9bcdbf', 'band'),
      placement: { anchor: { to: '#head', edge: 'right-of', at: 'center' }, offset: { x: mm(2) }, size: { width: mm(9), height: mm(3) } },
    }),
  ],
} as PostextConfig['header'];
const md = [
  ':::part{number="I" title="Rivers"}', ':::', '', '# One', '', filler(14), '',
  ':::part{number="II" title="Mountains and valleys" palette="band=#f6c297"}', ':::', '', '# Two', '', filler(14),
].join('\n');

const chevronsOf = (page: VDTPage) => page.header?.blocks.find((b) => b.elementId === 'chevrons') as VDTDesignPathBlock | undefined;

describe('chevrons beside a running head (#1060)', () => {
  const doc = buildDocument({ markdown: md }, { ...base, header }, createMeasurementCache());
  const withHead = doc.pages.filter((p) => chevronsOf(p) && !p.partInfo);

  it('follow the end of the part title, centred on its height, on every page', () => {
    expect(withHead.length).toBeGreaterThan(2);
    for (const page of withHead) {
      const head = page.header!.blocks.find((b) => b.elementId === 'head')!;
      const chev = chevronsOf(page)!;
      expect(chev.subpaths).toHaveLength(3);
      expect(chev.bbox.x).toBeCloseTo(head.bbox.x + head.bbox.width + dimensionToPx(mm(2), DPI), 3);
      expect(chev.bbox.y + chev.bbox.height / 2).toBeCloseTo(head.bbox.y + head.bbox.height / 2, 3);
      // The ink: the chevrons reach 8.5 of the box’s 9 units.
      expect(chev.bbox.width).toBeCloseTo(dimensionToPx(mm(8.5), DPI), 3);
    }
    // A longer title moves them along.
    const xs = new Set(withHead.map((p) => Math.round(chevronsOf(p)!.bbox.x)));
    expect(xs.size).toBe(2);
  });

  it('take the colour of the part’s palette', () => {
    const fills = withHead.map((p) => [chevronsOf(p)!.fill, (p.header!.blocks.find((b) => b.elementId === 'head') as { lines: { text: string }[] }).lines[0]!.text]);
    expect(fills.filter(([, t]) => t === 'Rivers').every(([f]) => f === '#9bcdbf')).toBe(true);
    expect(fills.filter(([, t]) => t === 'Mountains and valleys').every(([f]) => f === '#f6c297')).toBe(true);
    expect(fills.some(([, t]) => t === 'Rivers') && fills.some(([, t]) => t === 'Mountains and valleys')).toBe(true);
  });

  it('paint as vector outlines on the canvas and as an inline SVG in HTML', () => {
    const page = withHead[0]!;
    const calls: string[] = [];
    const rec = (op: string) => (...args: unknown[]) => { calls.push(`${op}(${args.map((a) => (typeof a === 'number' ? Math.round(a) : String(a))).join(',')})`); };
    const ctx = {
      fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter', font: '', textBaseline: 'alphabetic', textAlign: 'left', globalAlpha: 1,
      save() {}, restore() {}, setLineDash() {}, beginPath: rec('beginPath'), moveTo: rec('moveTo'), lineTo: rec('lineTo'), bezierCurveTo: rec('bezierCurveTo'),
      quadraticCurveTo: rec('quadraticCurveTo'), closePath: rec('closePath'), fill: rec('fill'), stroke: rec('stroke'), fillRect: rec('fillRect'), fillText: rec('fillText'),
      rect: rec('rect'), clip: rec('clip'), measureText: (s: string) => ({ width: s.length * 7 }), translate() {}, rotate() {}, scale() {}, setTransform() {}, strokeText() {},
    };
    renderHeaderFooterSlot(ctx as unknown as CanvasRenderingContext2D, { bbox: page.header!.bbox, blocks: [chevronsOf(page)!] });
    expect(calls.filter((c) => c.startsWith('moveTo'))).toHaveLength(3);
    expect(calls.filter((c) => c.startsWith('closePath'))).toHaveLength(3);
    expect(calls.filter((c) => c.startsWith('fill('))).toHaveLength(1);

    const out = renderToHtmlIndexed(doc).pages[page.index]!;
    const html = out.innerHtml + out.decorationHtml;
    const svg = html.slice(html.indexOf('<svg'), html.indexOf('</svg>') + 6);
    expect(svg).toContain('aria-hidden="true"');
    expect((svg.match(/M/g) ?? []).length).toBe(3);
    expect(svg).toContain('fill="#9bcdbf"');
  });
});

describe('a bar across the gutter of a composed spread (#1060)', () => {
  const W = dimensionToPx(mm(200), DPI);
  const t: PageTemplate = {
    id: 'tl',
    spread: true,
    gutter: mm(10),
    grid: { columns: 4, rows: 4, columnGap: mm(12) },
    frames: [
      { name: 'left', grid: { col: 1, row: 2 } },
      { name: 'right', grid: { col: 4, row: 2 } },
    ],
    decoration: {
      elements: [path('bar', {
        d: RIBBON, fill: ink('#c0392b'),
        placement: { anchor: { to: 'page', edge: 'top-left' }, offset: { x: mm(20), y: mm(30) }, size: { width: mm(330), height: mm(12) } },
      })],
    },
  };
  const spreadMd = ['::::page{template="tl" spread}', ':::frame{slot="left"}', 'Left card', ':::', '', ':::frame{slot="right"}', 'Right card', ':::', '::::', '', 'After.'].join('\n');
  const doc: VDTDocument = buildDocument(
    { markdown: spreadMd },
    { page: { width: mm(200), height: mm(260), margins: { top: mm(20), bottom: mm(20), left: mm(20), right: mm(20) } } as never, pageTemplates: [t] },
    createMeasurementCache(),
  );
  const [verso, recto] = doc.pages.filter((p) => p.composed?.spread) as [VDTPage, VDTPage];
  const bar = (p: VDTPage) => p.composed!.decoration!.blocks.find((b) => b.elementId === 'bar') as VDTDesignPathBlock;

  it('is drawn once over the sheet and cut for each page, the head on the right page', () => {
    const left = bar(verso);
    const right = bar(recto);
    expect(left.kind).toBe('path');
    expect(right.kind).toBe('path');
    // The same outline, moved by a page's width onto the right page.
    expect(right.bbox.x).toBeCloseTo(left.bbox.x - W, 3);
    expect(left.bbox.x + left.bbox.width).toBeGreaterThan(W);
    expect(right.bbox.x).toBeLessThan(0);
    // The arrow's tip lies on the right page.
    const tip = Math.max(...points(right).map(([x]) => x!));
    expect(tip).toBeCloseTo(dimensionToPx(mm(350), DPI) - W, 3);
    expect(tip).toBeLessThan(W);
  });

  it('is in the HTML of both pages and answers the source map on its ink only', () => {
    const html = renderToHtmlIndexed(doc);
    expect(html.pages[verso.index]!.decorationHtml).toContain('<svg');
    expect(html.pages[recto.index]!.decorationHtml).toContain('<svg');
    const b = bar(verso);
    const hit = sourceAt(doc, verso.index, b.bbox.x + 20, b.bbox.y + b.bbox.height / 2);
    expect(hit[0]).toMatchObject({ level: 'design', id: 'cp0:decoration:bar', source: { kind: 'config', path: '/pageTemplates/0/decoration/elements/0' } });
    // Beside the arrow head, inside the block's box but off its ink.
    const r = bar(recto);
    const off = sourceAt(doc, recto.index, r.bbox.x + r.bbox.width - 3, r.bbox.y + 3);
    expect(off.some((e) => e.id === 'cp0:decoration:bar')).toBe(false);
  });
});

describe('a path in a heading design (#1060)', () => {
  const frames = { page: { x: 0, y: 0, width: 400, height: 600 }, bleed: { x: 0, y: 0, width: 400, height: 600 } };
  const title: DesignElement = { kind: 'text', id: 'title', content: '{titleText}', fontSize: pt(20), overflow: 'wrap', placement: { anchor: { to: 'container', edge: 'top-left' } } };
  const ribbon = (reserve?: boolean) => path('ribbon', {
    d: RIBBON, fill: ink('#c0392b'), ...(reserve === undefined ? {} : { reserve }),
    placement: { anchor: { to: '#title', edge: 'below' }, offset: { y: pt(10) }, size: { width: pt(200), height: pt(30) } },
  });
  const measure = (elements: DesignElement[]) => measureHeadingAdvancedDesignHeight(
    resolveHeadingsConfig({ levels: [{ level: 1, advancedDesign: { enabled: true, slot: { elements } } }] }).levels.find((l) => l.level === 1)!,
    { titleText: 'Title', formattedNumber: '', chapterNumber: '' }, 320, 72, {}, 0, frames, { x: 40, y: 40 },
  );

  it('counts toward the height the heading reserves unless `reserve: false`', () => {
    expect(measure([title, ribbon()])).toBeCloseTo(24 + 10 + 30, 5);
    expect(measure([title, ribbon(false)])).toBeCloseTo(24, 5);
  });
});

describe('path elements in the config warnings (#1060)', () => {
  it('reports unreadable path data, a bad viewBox, a bad preserveAspectRatio and unknown keys', () => {
    const placement = { anchor: { to: 'container', edge: 'top-left' } };
    const warnings = collectConfigWarnings({
      header: { elements: [
        path('a', { d: 'M0 0 L1', placement } as never),
        path('b', { viewBox: [0, 1], preserveAspectRatio: 'slice' as never, placement } as never),
        { ...(path('c', { placement } as never) as object), colour: '#fff' } as never,
        path('ok', { d: CHEVRONS, viewBox: [9, 3], placement } as never),
      ] },
      pageTemplates: [{ id: 't', frames: [], decoration: { elements: [path('d', { d: 'Q1 1 2 2', placement } as never)] } }] as never,
    }).filter((w) => w.kind === 'unknownConfigValue' || w.kind === 'unknownConfigKey');
    expect(warnings.map((w) => [w.kind, w.path, w.value, w.used])).toEqual([
      ['unknownConfigValue', 'header.elements[0].d', 'M0 0 L1', ''],
      ['unknownConfigValue', 'header.elements[1].viewBox', '[0,1]', ''],
      ['unknownConfigValue', 'header.elements[1].preserveAspectRatio', 'slice', 'none'],
      ['unknownConfigValue', 'pageTemplates[0].decoration.elements[0].d', 'Q1 1 2 2', ''],
      ['unknownConfigKey', 'header.elements[2].colour', 'colour', ''],
    ]);
  });
});
