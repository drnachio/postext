/**
 * Translucent connector and leader lines, ring and bar caps (#1079): a
 * line's colour may carry an alpha channel (`#rrggbbaa`) or an `opacity`,
 * and a line may end in a hollow dot (a ring) or a stroke across it (a
 * bar), stroked in the line's width.
 */
import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build.js';
import { createMeasurementCache } from '../../measure/index.js';
import { collectConfigWarnings } from '../../checks/configWarnings.js';
import { validatePageTemplates } from '../../composed/validate.js';
import { figureLabelLeaderPath } from '../../composed/labels.js';
import { renderToHtmlIndexed } from '../../html-backend/html-backend.js';
import { renderPageToCanvas } from '../../index.js';
import { colorWithOpacity, markerSvgElement, pathHit, pathInkBox, pathMarkerOutline } from '../../design/pathBlock.js';
import { flowRectToPage, type VDTDesignPathBlock, type VDTPathCommand, type VDTPathMarker } from '../../vdt.js';
import type { PageTemplate } from '../../composed/types.js';
import type { DesignConnectorElement, PostextConfig, VDTBlock, VDTDocument, VDTPage } from '../../index.js';
import { CONNECTOR_CONFIG, mm } from './fixtures/connectors.js';
import { mapPartsFixture } from './fixtures/mapParts.js';

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

const PT = 300 / 72;
const hex = (h: string) => ({ hex: h, model: 'hex' as const });
const two: PageTemplate = {
  id: 'dos',
  header: false,
  frames: [
    { name: 'izq', width: mm(40), height: mm(20), placement: { anchor: { to: 'container', edge: 'top-left' } } },
    { name: 'der', width: mm(40), height: mm(20), placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { x: mm(100) } } },
  ],
};
const md = '::::page{template="dos"}\n:::frame{slot="izq"}\nLeft\n:::\n:::frame{slot="der"}\nRight\n:::\n::::\n';
const build = (c: Partial<DesignConnectorElement>, extra: Partial<PostextConfig> = {}): { doc: VDTDocument; page: VDTPage } => {
  const t: PageTemplate = { ...two, decoration: { elements: [{ kind: 'connector', id: 'c', routing: 'straight', from: { to: '#izq' }, to: { to: '#der' }, ...c } as DesignConnectorElement] } };
  const doc = buildDocument({ markdown: md }, { ...CONNECTOR_CONFIG, pageTemplates: [t], ...extra }, createMeasurementCache());
  return { doc, page: doc.pages.find((p) => p.composed)! };
};
const pathOf = (page: VDTPage, id = 'c'): VDTDesignPathBlock => page.composed!.decoration!.blocks.find((b) => b.elementId === id) as VDTDesignPathBlock;
const pointsOf = (b: VDTDesignPathBlock) => b.subpaths.flat().filter((c): c is Extract<VDTPathCommand, { x: number }> => c.op !== 'Z');
const box = (page: VDTPage, name: string) => flowRectToPage(page, page.composed!.frames.find((f) => f.name === name)!.rect);

describe('ring and bar marks (#1079)', () => {
  const ring: VDTPathMarker = { kind: 'ring', x: 50, y: 50, angle: 0, sizePx: 12, color: '#000', widthPx: 2 };
  const bar: VDTPathMarker = { kind: 'bar', x: 50, y: 50, angle: 0, sizePx: 10, color: '#000', widthPx: 2 };

  it('a ring is a circle stroked in the line width, its outer edge sizePx across; a bar a segment across the line', () => {
    expect(pathMarkerOutline(ring)).toEqual({ kind: 'ring', cx: 50, cy: 50, r: 5, widthPx: 2 });
    const b = pathMarkerOutline(bar);
    expect(b.kind).toBe('bar');
    if (b.kind !== 'bar') return;
    expect(b.points[0].x).toBeCloseTo(50, 6);
    expect(b.points[1].x).toBeCloseTo(50, 6);
    expect(Math.abs(b.points[0].y - b.points[1].y)).toBeCloseTo(10, 6);
    expect(b.widthPx).toBe(2);
  });

  it('as SVG: a stroked path with no fill', () => {
    expect(markerSvgElement(ring, 0, 0, (v) => v)).toBe('<path d="M45 50A5 5 0 1 0 55 50A5 5 0 1 0 45 50Z" fill="none" stroke="#000" stroke-width="2"/>');
    expect(markerSvgElement(bar, 0, 0, (v) => v)).toBe('<path d="M50 55L50 45" fill="none" stroke="#000" stroke-width="2"/>');
    expect(markerSvgElement({ ...ring, kind: 'dot' }, 0, 0, (v) => v)).toBe('<path d="M44 50A6 6 0 1 0 56 50A6 6 0 1 0 44 50Z" fill="#000"/>');
  });

  it('ink box and hits: on the ring, not in its hole; on the bar', () => {
    const block: VDTDesignPathBlock = { kind: 'path', bbox: { x: 0, y: 0, width: 0, height: 0 }, subpaths: [], markers: [ring] };
    const ink = pathInkBox(block);
    expect(ink.x).toBeCloseTo(44, 6);
    expect(ink.width).toBeCloseTo(12, 6);
    expect(pathHit(block, { x: 55.5, y: 50 }, 0.5)).toBe(true);
    expect(pathHit(block, { x: 50, y: 50 }, 0.5)).toBe(false);
    const barBlock: VDTDesignPathBlock = { ...block, markers: [bar] };
    expect(pathHit(barBlock, { x: 50.8, y: 53 }, 0.5)).toBe(true);
    expect(pathHit(barBlock, { x: 53, y: 50 }, 0.5)).toBe(false);
  });

  it('colorWithOpacity multiplies the alpha the colour has', () => {
    expect(colorWithOpacity('#2a6f97', 0.4)).toBe('#2a6f9766');
    expect(colorWithOpacity('#2a6f9780', 0.5)).toBe('#2a6f9740');
    expect(colorWithOpacity('#abc', 0.5)).toBe('#aabbcc80');
    expect(colorWithOpacity('#2a6f97', 1)).toBe('#2a6f97');
    expect(colorWithOpacity('#2a6f97', undefined)).toBe('#2a6f97');
    expect(colorWithOpacity('rgb(1, 2, 3)', 0.5)).toBe('rgb(1, 2, 3)');
  });
});

describe('connector caps ring and bar (#1079)', () => {
  it('a ring at the end, the line stopping where its corners meet the ring\'s outer edge', () => {
    const { page } = build({ endCap: 'ring', width: { value: 1, unit: 'pt' }, capSize: mm(3) });
    const c = pathOf(page);
    const m = c.markers![0]!;
    expect(m).toMatchObject({ kind: 'ring', widthPx: expect.closeTo(PT, 6), sizePx: expect.closeTo(3 * 300 / 25.4, 6) });
    const der = box(page, 'der');
    expect(m.x).toBeCloseTo(der.x, 3);
    const end = pointsOf(c).at(-1)!;
    const R = m.sizePx / 2;
    expect(m.x - end.x).toBeCloseTo(Math.sqrt(R * R - (PT / 2) ** 2), 3);
  });

  it('a bar at the start, the line from its inner side; the tree drops of a timeline end in rings', () => {
    const { page } = build({ startCap: 'bar', endCap: 'ring' });
    const c = pathOf(page);
    expect(c.markers!.map((m) => m.kind)).toEqual(['bar', 'ring']);
    const izq = box(page, 'izq');
    const w = 0.75 * PT;
    expect(pointsOf(c)[0]!.x - (izq.x + izq.width)).toBeCloseTo(w / 2, 3);
  });

  it('dots and arrows in an opaque colour lay out as before', () => {
    const { page } = build({ startCap: 'dot', endCap: 'arrow', capSize: mm(3) });
    const c = pathOf(page);
    const izq = box(page, 'izq');
    const der = box(page, 'der');
    expect(pointsOf(c)[0]!.x).toBeCloseTo(izq.x + izq.width, 3);
    expect(der.x - pointsOf(c).at(-1)!.x).toBeCloseTo(0.6 * 3 * 300 / 25.4, 3);
    expect(c.markers!.every((m) => m.widthPx === undefined)).toBe(true);
  });
});

describe('translucent connector lines (#1079)', () => {
  it('a #rrggbbaa colour goes to the stroke and the marks as it is; the line stops at a translucent dot\'s edge and an arrow\'s base', () => {
    const { page } = build({ color: hex('#ffffff99'), width: mm(3), startCap: 'dot', endCap: 'arrow', capSize: mm(5) });
    const c = pathOf(page);
    expect(c.stroke!.color).toBe('#ffffff99');
    expect(c.markers!.map((m) => m.color)).toEqual(['#ffffff99', '#ffffff99']);
    const izq = box(page, 'izq');
    const der = box(page, 'der');
    const R = 2.5 * 300 / 25.4;
    const half = 1.5 * 300 / 25.4;
    expect(pointsOf(c)[0]!.x - (izq.x + izq.width)).toBeCloseTo(Math.sqrt(R * R - half * half), 3);
    expect(der.x - pointsOf(c).at(-1)!.x).toBeCloseTo(5 * 300 / 25.4, 3);
  });

  it('opacity multiplies a palette-linked colour, and follows a part palette', () => {
    const linked = { hex: '#2a6f97', model: 'hex' as const, paletteId: 'tinta' };
    const { page } = build({ color: linked, opacity: 0.4, endCap: 'ring' });
    expect(pathOf(page).stroke!.color).toBe('#2a6f9766');
    expect(pathOf(page).markers![0]!.color).toBe('#2a6f9766');
    const t: PageTemplate = { ...two, decoration: { elements: [{ kind: 'connector', id: 'c', routing: 'straight', from: { to: '#izq' }, to: { to: '#der' }, color: linked, opacity: 0.4 }] } };
    const doc = buildDocument(
      { markdown: `:::part{palette="tinta=#aa0000"}\n# One\n:::\n\n${md}` },
      { ...CONNECTOR_CONFIG, pageTemplates: [t] },
      createMeasurementCache(),
    );
    const composed = doc.pages.find((p) => p.composed)!;
    expect(pathOf(composed).stroke!.color.toLowerCase()).toBe('#aa000066');
  });

  it('a cased line: a wide translucent casing under a dashed line, both painted on the canvas and in HTML', () => {
    const casing: DesignConnectorElement = { kind: 'connector', id: 'casing', routing: 'straight', from: { to: '#izq' }, to: { to: '#der' }, color: hex('#ffffff'), opacity: 0.6, width: mm(2.5) };
    const line: DesignConnectorElement = { kind: 'connector', id: 'line', routing: 'straight', from: { to: '#izq' }, to: { to: '#der' }, color: hex('#c0392b'), width: mm(0.8), dash: [mm(3), mm(1.5)], startCap: 'ring', endCap: 'bar', capSize: mm(4) };
    const t: PageTemplate = { ...two, decoration: { elements: [casing, line] } };
    const doc = buildDocument({ markdown: md }, { ...CONNECTOR_CONFIG, pageTemplates: [t] }, createMeasurementCache());
    const page = doc.pages.find((p) => p.composed)!;
    // Canvas: the casing stroked first, translucent; the ring and the bar
    // stroked solid in the line's width, the dash undone.
    const ops: string[] = [];
    const ctx = new Proxy({ font: '', fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1 } as Record<string | symbol, unknown>, {
      get(target, key) {
        if (key === 'stroke') return () => ops.push(`stroke:${String(target.strokeStyle)}:${Number(target.lineWidth).toFixed(2)}:${String(target.dash ?? '')}`);
        if (key === 'setLineDash') return (d: number[]) => { target.dash = d.length; };
        if (key === 'arc') return () => ops.push('arc');
        if (key === 'measureText') return (s: string) => ({ width: [...s].length * 7 });
        if (key in target) return target[key];
        return () => undefined;
      },
      set(target, key, value) { target[key] = value; return true; },
    });
    renderPageToCanvas(page, doc, { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement);
    const w = (v: number) => (v * 300 / 25.4).toFixed(2);
    const strokes = ops.filter((o) => o.startsWith('stroke:#ffffff99') || o.startsWith('stroke:#c0392b'));
    expect(strokes).toEqual([`stroke:#ffffff99:${w(2.5)}:0`, `stroke:#c0392b:${w(0.8)}:2`, `stroke:#c0392b:${w(0.8)}:0`, `stroke:#c0392b:${w(0.8)}:0`]);
    // HTML: the casing's stroke with its alpha, the ring and the bar as
    // stroked paths with no fill.
    const html = JSON.stringify(renderToHtmlIndexed(doc)).replace(/\\"/g, '"');
    expect(html).toContain('stroke="#ffffff99"');
    const svg = html.match(/<svg[^>]*>(?:(?!<\/svg>).)*#c0392b(?:(?!<\/svg>).)*<\/svg>/)![0];
    expect(svg.match(/fill="none" stroke="#c0392b" stroke-width="[\d.]+"/g)?.length).toBe(3);
  });
});

describe('leaders with rings and opacity (#1079)', () => {
  it('a label style\'s leader look ends in a ring, translucent', () => {
    const f = mapPartsFixture('en', {});
    const config: PostextConfig = {
      ...f.config,
      labelStyles: (f.config.labelStyles ?? []).map((s) => (s.leader ? { ...s, leader: { ...s.leader, endCap: 'ring' as const, opacity: 0.5 } } : s)),
    };
    const doc = buildDocument({ markdown: f.markdown, resources: f.resources }, config, createMeasurementCache());
    let block: VDTBlock | undefined;
    for (const p of doc.pages) block ??= (p.floats ?? []).find((b) => b.resourceBlock?.resource.id === 'varenia');
    const rb = block!.resourceBlock!;
    const peaks = rb.labels!.find((l) => 'anchor' in l.at && l.at.anchor === 'peaks')!;
    expect(peaks.layout!.leader).toMatchObject({ endCap: 'ring', opacity: 0.5 });
    // The colour stays the look's in the layout (part palettes read it).
    expect(peaks.layout!.leader!.stroke.color).toBe('#3b2a1a');
    const path = figureLabelLeaderPath(peaks.layout!, block!.bbox.x + rb.bodyRect.x, block!.bbox.y + rb.bodyRect.y)!;
    expect(path.stroke!.color).toBe('#3b2a1a80');
    expect(path.markers).toEqual([expect.objectContaining({ kind: 'ring', color: '#3b2a1a80', widthPx: expect.closeTo(0.6 * PT, 6) })]);
  });
});

describe('validation of caps and opacity (#1079)', () => {
  const template = (c: Record<string, unknown>): PageTemplate => ({ ...two, decoration: { elements: [{ kind: 'connector', id: 'c', from: { to: '#izq' }, to: { to: '#der' }, ...c } as unknown as DesignConnectorElement] } });
  const warnings = (c: Record<string, unknown>) => collectConfigWarnings({ pageTemplates: [template(c)] }).filter((w) => w.kind === 'unknownConfigValue');

  it('ring and bar are caps; another word is not', () => {
    expect(warnings({ startCap: 'ring', endCap: 'bar' })).toEqual([]);
    expect(warnings({ endCap: 'rings' })).toEqual([expect.objectContaining({ path: 'pageTemplates[0].decoration.elements[0].endCap', suggestion: 'ring' })]);
  });

  it('an opacity outside 0…1 is held; one that is not a number is opaque', () => {
    expect(warnings({ opacity: 0.3 })).toEqual([]);
    expect(warnings({ opacity: 2 })).toEqual([expect.objectContaining({ path: 'pageTemplates[0].decoration.elements[0].opacity', value: '2', used: '1' })]);
    expect(warnings({ opacity: -1 })).toEqual([expect.objectContaining({ used: '0' })]);
    expect(warnings({ opacity: 'half' })).toEqual([expect.objectContaining({ value: 'half', used: '1' })]);
  });

  it('a leader look takes the new caps and checks its opacity', () => {
    const out = validatePageTemplates({ labelStyles: [{ id: 'n', leader: { endCap: 'ring', startCap: 'bar', opacity: 1.5 } }] } as PostextConfig);
    expect(out).toEqual([expect.objectContaining({ kind: 'unknownConfigValue', path: '/labelStyles/0/leader/opacity', used: '1' })]);
  });
});
