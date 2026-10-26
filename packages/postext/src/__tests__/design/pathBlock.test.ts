import { describe, it, expect } from 'vitest';
import { renderHeaderFooterSlot } from '../../canvas-backend/headerFooter.js';
import { renderToHtml } from '../../html-backend/html-backend.js';
import { buildDocument } from '../../pipeline/index.js';
import { offsetDesignBlock } from '../../pipeline/callouts/calloutLayout.js';
import { applyPartPalettesToFlow } from '../../pipeline/sections/partPalette.js';
import { preflightDocument } from '../../checks/preflight.js';
import { markerSvgData, pathHit, pathInkBox, pathMarkerOutline, pathSvgData, quadToCubic } from '../../design/pathBlock.js';
import type { PostextConfig } from '../../types.js';
import type { VDTBlock, VDTDesignPathBlock, VDTDesignSlot, VDTDocument } from '../../vdt.js';

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

/** A filled triangle (even-odd), a dashed stroked line with round caps,
 *  and a curve, in page px. */
const filled = (): VDTDesignPathBlock => ({
  kind: 'path',
  bbox: { x: 10, y: 10, width: 40, height: 30 },
  subpaths: [[{ op: 'M', x: 10, y: 40 }, { op: 'L', x: 30, y: 10 }, { op: 'L', x: 50, y: 40 }, { op: 'Z' }]],
  fill: '#336699',
  fillRule: 'evenodd',
});

const dashed = (): VDTDesignPathBlock => ({
  kind: 'path',
  bbox: { x: 99, y: 19, width: 102, height: 2 },
  subpaths: [[{ op: 'M', x: 100, y: 20 }, { op: 'L', x: 200, y: 20 }]],
  stroke: { color: '#cc0000', widthPx: 2, dash: [6, 3], cap: 'round', join: 'bevel' },
});

const marked = (): VDTDesignPathBlock => ({
  kind: 'path',
  bbox: { x: 0, y: 0, width: 100, height: 100 },
  subpaths: [[{ op: 'M', x: 10, y: 50 }, { op: 'Q', x1: 50, y1: 0, x: 90, y: 50 }]],
  stroke: { color: '#000000', widthPx: 1 },
  markers: [
    { kind: 'dot', x: 10, y: 50, angle: 0, sizePx: 6, color: '#00aa00' },
    { kind: 'arrow', x: 90, y: 50, angle: 0, sizePx: 10, color: '#0000aa' },
  ],
});

type Call = { op: string; args: unknown[]; fill: string; stroke: string; lineWidth: number; cap: string; join: string; dash: number[] };

function recordingCtx() {
  const calls: Call[] = [];
  const state = { fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter', dash: [] as number[] };
  const stack: (typeof state)[] = [];
  const rec = (op: string) => function (this: typeof state, ...args: unknown[]) {
    calls.push({ op, args, fill: this.fillStyle, stroke: this.strokeStyle, lineWidth: this.lineWidth, cap: this.lineCap, join: this.lineJoin, dash: this.dash });
  };
  const ctx = {
    ...state,
    save() { stack.push({ ...this } as typeof state); },
    restore() { Object.assign(this, stack.pop()); },
    setLineDash(d: number[]) { this.dash = d; },
    beginPath: rec('beginPath'),
    moveTo: rec('moveTo'),
    lineTo: rec('lineTo'),
    bezierCurveTo: rec('bezierCurveTo'),
    quadraticCurveTo: rec('quadraticCurveTo'),
    arc: rec('arc'),
    closePath: rec('closePath'),
    fill: rec('fill'),
    stroke: rec('stroke'),
    fillRect: rec('fillRect'),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

const slotOf = (...blocks: VDTDesignPathBlock[]): VDTDesignSlot => ({ bbox: { x: 0, y: 0, width: 400, height: 400 }, blocks });

describe('path block geometry (#1055)', () => {
  it('a dot marker is a circle sizePx across; an arrow a triangle whose tip is the point, pointing along angle', () => {
    expect(pathMarkerOutline({ kind: 'dot', x: 5, y: 6, angle: 0, sizePx: 4, color: '#000' })).toEqual({ kind: 'dot', cx: 5, cy: 6, r: 2 });
    const arrow = pathMarkerOutline({ kind: 'arrow', x: 100, y: 50, angle: Math.PI / 2, sizePx: 10, color: '#000' });
    if (arrow.kind !== 'arrow') throw new Error('arrow');
    // Pointing down: the tip at the point, the base 10 px above it, 7 px wide.
    expect(arrow.points[0]).toEqual({ x: 100, y: 50 });
    expect(arrow.points[1].y).toBeCloseTo(40);
    expect(arrow.points[2].y).toBeCloseTo(40);
    expect(Math.abs(arrow.points[1].x - arrow.points[2].x)).toBeCloseTo(7);
  });

  it('writes SVG path data relative to an origin', () => {
    expect(pathSvgData(filled().subpaths, 10, 10)).toBe('M0 30L20 0L40 30Z');
    expect(pathSvgData(marked().subpaths)).toBe('M10 50Q50 0 90 50');
    expect(markerSvgData({ kind: 'arrow', x: 10, y: 0, angle: 0, sizePx: 10, color: '#000' })).toBe('M10 0L0 3.5L0 -3.5Z');
  });

  it('turns a quadratic curve into the cubic PDF draws', () => {
    expect(quadToCubic(0, 0, { op: 'Q', x1: 30, y1: 30, x: 60, y: 0 })).toEqual({ op: 'C', x1: 20, y1: 20, x2: 40, y2: 20, x: 60, y: 0 });
  });

  it('boxes the whole ink: half the stroke and the markers', () => {
    expect(pathInkBox(dashed())).toEqual({ x: 99, y: 19, width: 102, height: 2 });
    const box = pathInkBox(marked());
    expect(box.x).toBeCloseTo(7); // the dot, 3 px round its point at x 10
    expect(box.x + box.width).toBeCloseTo(90.5); // the stroke's half width past the arrow tip
  });

  it('moves its outline and markers with its box (offsetDesignBlock)', () => {
    const b = marked();
    offsetDesignBlock(b, 5, -10);
    expect(b.bbox).toEqual({ x: 5, y: -10, width: 100, height: 100 });
    expect(b.subpaths[0]).toEqual([{ op: 'M', x: 15, y: 40 }, { op: 'Q', x1: 55, y1: -10, x: 95, y: 40 }]);
    expect(b.markers!.map((m) => [m.x, m.y])).toEqual([[15, 40], [95, 40]]);
  });

  it('is hit on its ink only, not across its box', () => {
    const line = dashed();
    expect(pathHit(line, { x: 150, y: 21 })).toBe(true);
    expect(pathHit(line, { x: 150, y: 30 })).toBe(false);
    const tri = filled();
    expect(pathHit(tri, { x: 30, y: 30 })).toBe(true);
    expect(pathHit(tri, { x: 12, y: 12 })).toBe(false);
    expect(pathHit(marked(), { x: 84, y: 52 })).toBe(true); // in the arrowhead
  });
});

describe('path block on canvas (#1055)', () => {
  it('fills an outline by its fill rule', () => {
    const { ctx, calls } = recordingCtx();
    renderHeaderFooterSlot(ctx, slotOf(filled()));
    expect(calls.filter((c) => c.op === 'moveTo' || c.op === 'lineTo').map((c) => c.args)).toEqual([[10, 40], [30, 10], [50, 40]]);
    expect(calls.some((c) => c.op === 'closePath')).toBe(true);
    const fill = calls.find((c) => c.op === 'fill')!;
    expect(fill.args).toEqual(['evenodd']);
    expect(fill.fill).toBe('#336699');
    expect(calls.some((c) => c.op === 'stroke')).toBe(false);
  });

  it('strokes with its width, dash, cap and join', () => {
    const { ctx, calls } = recordingCtx();
    renderHeaderFooterSlot(ctx, slotOf(dashed()));
    const stroke = calls.find((c) => c.op === 'stroke')!;
    expect(stroke).toMatchObject({ stroke: '#cc0000', lineWidth: 2, cap: 'round', join: 'bevel', dash: [6, 3] });
    expect(calls.some((c) => c.op === 'fill')).toBe(false);
  });

  it('draws a curve, then fills a dot and an arrow in their colours', () => {
    const { ctx, calls } = recordingCtx();
    renderHeaderFooterSlot(ctx, slotOf(marked()));
    expect(calls.find((c) => c.op === 'quadraticCurveTo')!.args).toEqual([50, 0, 90, 50]);
    expect(calls.find((c) => c.op === 'arc')!.args.slice(0, 3)).toEqual([10, 50, 3]);
    expect(calls.filter((c) => c.op === 'fill').map((c) => c.fill)).toEqual(['#00aa00', '#0000aa']);
  });
});

// ---------------------------------------------------------------------------

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config: PostextConfig = {
  page: { dpi: 72, width: pt(400), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
};

/** A one-page document whose header holds `blocks`. */
function docWith(...blocks: VDTDesignPathBlock[]): VDTDocument {
  const doc = buildDocument({ markdown: 'Text.' }, config);
  doc.pages[0]!.header = slotOf(...blocks);
  return doc;
}

describe('path block in HTML (#1055)', () => {
  it('is an inline svg placed on its box, hidden from assistive technology', () => {
    const html = renderToHtml(docWith(filled(), dashed(), marked()));
    expect(html).toContain('<svg aria-hidden="true" focusable="false" width="40" height="30" style="position:absolute;left:10px;top:10px;width:40px;height:30px;overflow:visible;">');
    expect(html).toContain('<path d="M0 30L20 0L40 30Z" fill="#336699" fill-rule="evenodd"/>');
    expect(html).toContain('<path d="M1 1L101 1" fill="none" stroke="#cc0000" stroke-width="2" stroke-dasharray="6 3" stroke-linecap="round" stroke-linejoin="bevel"/>');
    // The dot and the arrow, filled in their colours.
    expect(html).toContain('fill="#00aa00"/>');
    expect(html).toContain('<path d="M90 50L80 53.5L80 46.5Z" fill="#0000aa"/>');
  });
});

describe('path block in preflight (#1055)', () => {
  it('reads a hairline stroke as a thin rule', () => {
    const hair = dashed();
    hair.stroke = { ...hair.stroke!, widthPx: 0.05 };
    const rule = preflightDocument(docWith(hair)).find((i) => i.kind === 'thinRule');
    expect(rule?.kind === 'thinRule' && rule.color).toBe('#cc0000');
  });
});

describe('path block under a part palette (#1055)', () => {
  it("recolours a box frame's path fill, stroke and markers that come from the palette, nothing else", () => {
    const LAKE = '#2d6a7d';
    const RUST = '#9a5a2e';
    const path: VDTDesignPathBlock = {
      kind: 'path',
      bbox: { x: 0, y: 0, width: 10, height: 10 },
      subpaths: [[{ op: 'M', x: 0, y: 0 }, { op: 'L', x: 10, y: 10 }]],
      fill: LAKE,
      stroke: { color: LAKE, widthPx: 1 },
      markers: [{ kind: 'dot', x: 0, y: 0, angle: 0, sizePx: 2, color: LAKE }, { kind: 'dot', x: 10, y: 10, angle: 0, sizePx: 2, color: '#123456' }],
    };
    const box = { type: 'callout', lines: [], designOverlay: slotOf(path) } as unknown as VDTBlock;
    const doc = { pages: [{ index: 0, columns: [], floats: [box] }] } as unknown as VDTDocument;
    applyPartPalettesToFlow(doc, [{ lake: RUST }], [{ id: 'lake', name: 'Lake', value: { hex: LAKE, model: 'hex' } }]);
    expect(path.fill).toBe(RUST);
    expect(path.stroke!.color).toBe(RUST);
    expect(path.markers!.map((m) => m.color)).toEqual([RUST, '#123456']);
  });
});
