/**
 * Leaders to picture anchors (#1057, DESIGN §12.4): a connector's end at an
 * anchor of the picture its frame holds, and labels set away from their
 * point with a line back to it. The fixture is "the parts of a map": a map
 * in a frame, three notes beside it joined to its title, key and scale.
 */
import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build.js';
import { createMeasurementCache } from '../../measure/index.js';
import { parseMarkdown } from '../../parse/index.js';
import { renderToHtmlIndexed } from '../../html-backend/html-backend.js';
import { renderPageToCanvas } from '../../index.js';
import { collectConfigWarnings } from '../../checks/configWarnings.js';
import { validatePageTemplates } from '../../composed/validate.js';
import { figureAnchorPointOnPage, figureLabelLeaderPath, labelLayoutOnSheet, overlappingLabels } from '../../composed/labels.js';
import { formatWarning } from '../../pipeline/contentWarnings.js';
import { flowRectToPage, pageIsMirrored, type VDTDesignPathBlock, type VDTPathCommand } from '../../vdt.js';
import type { PageTemplate } from '../../composed/types.js';
import type { ContentWarning, DesignConnectorElement, PostextConfig, Resource, VDTBlock, VDTDocument, VDTFigureLabel, VDTPage } from '../../index.js';
import { MAP_PARTS_RESOURCES, MAP_PARTS_TEMPLATE, mapPartsFixture, type MapPartsLocale } from './fixtures/mapParts.js';
import { GRID_CONFIG, GRID_RESOURCES, photoPage, PHOTO_TEMPLATE } from './fixtures/grid.js';

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    // Half an em a character, from the font's size.
    const m = /(\d+(?:\.\d+)?)px/.exec(this.font);
    const em = m ? Number(m[1]) : 10;
    return { width: [...s].length * em * 0.5 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const MM = 300 / 25.4;
type Options = Parameters<typeof mapPartsFixture>[1];
const build = (locale: MapPartsLocale, options: Options = {}, patch: (c: PostextConfig) => PostextConfig = (c) => c, resources?: Resource[]): VDTDocument => {
  const f = mapPartsFixture(locale, options);
  return buildDocument({ markdown: f.markdown, resources: resources ?? f.resources }, patch(f.config), createMeasurementCache());
};
const composedPages = (doc: VDTDocument): VDTPage[] => doc.pages.filter((p) => p.composed);
const pathOf = (page: VDTPage, id: string): VDTDesignPathBlock | undefined =>
  page.composed!.decoration?.blocks.find((x) => x.elementId === id) as VDTDesignPathBlock | undefined;
type Pt = { x: number; y: number };
const pointsOf = (b: VDTDesignPathBlock): Pt[] =>
  b.subpaths.flat().filter((c): c is Extract<VDTPathCommand, { x: number }> => c.op !== 'Z').map((c) => ({ x: c.x, y: c.y }));
const first = (b: VDTDesignPathBlock): Pt => pointsOf(b)[0]!;
const last = (b: VDTDesignPathBlock): Pt => pointsOf(b).at(-1)!;
const frameBox = (page: VDTPage, name: string) => flowRectToPage(page, page.composed!.frames.find((f) => f.name === name)!.rect);
const mapBlock = (doc: VDTDocument): { page: VDTPage; block: VDTBlock } => {
  for (const page of doc.pages) {
    const block = (page.floats ?? []).find((b) => b.resourceBlock?.resource.id === 'varenia');
    if (block) return { page, block };
  }
  throw new Error('no map');
};
const labelAt = (block: VDTBlock, anchor: string): VDTFigureLabel => block.resourceBlock!.labels!.find((l) => 'anchor' in l.at && l.at.anchor === anchor)!;
/** The map's body on the sheet. */
const bodyOnSheet = (page: VDTPage, block: VDTBlock) => {
  const rb = block.resourceBlock!;
  return flowRectToPage(page, { x: block.bbox.x + rb.bodyRect.x, y: block.bbox.y + rb.bodyRect.y, width: rb.bodyRect.width, height: rb.bodyRect.height });
};
const anchorOf = (id: string) => MAP_PARTS_RESOURCES[0]!.anchors!.find((a) => a.id === id)!;
const CONNECTORS = [['a-titulo', 'n1', 'title'], ['a-leyenda', 'n2', 'legend'], ['a-escala', 'n3', 'scale']] as const;
const GAP = 1.2 * MM;

/** Where a connector to `anchor` must end: the anchor's point on the map as
 *  the sheet shows it, `GAP` short of it on the side it arrives from. */
function expectOnTarget(doc: VDTDocument, page: VDTPage, id: string, anchor: string, from: 'left' | 'right' = 'left'): void {
  const { page: mapPage, block } = mapBlock(doc);
  const body = bodyOnSheet(mapPage, block);
  const a = anchorOf(anchor);
  const shift = mapPage === page ? 0 : (mapPage.index > page.index ? page.width : -page.width);
  const px = body.x + shift + a.x * body.width;
  const py = body.y + a.y * body.height;
  const path = pathOf(page, id)!;
  expect(path).toBeDefined();
  const end = last(path);
  expect(end.x).toBeCloseTo(from === 'left' ? px - GAP : px + GAP, 3);
  expect(end.y).toBeCloseTo(py, 3);
  // The dot is drawn on the end.
  expect(path.markers?.find((m) => m.kind === 'dot')).toMatchObject({ x: end.x, y: end.y });
}

describe('a connector to an anchor of the picture its frame holds (#1057)', () => {
  it('joins each note to the title, the key and the scale of the map, a dot on each part', () => {
    const doc = build('en');
    const page = composedPages(doc)[0]!;
    for (const [id, note, anchor] of CONNECTORS) {
      expectOnTarget(doc, page, id, anchor);
      // It leaves the note's end side, at its middle.
      const n = frameBox(page, note);
      expect(first(pathOf(page, id)!)).toEqual({ x: n.x + n.width, y: n.y + n.height / 2 });
    }
    // The dot stands just left of where the title label is drawn.
    const { block } = mapBlock(doc);
    const title = labelAt(block, 'title');
    expect(last(pathOf(page, 'a-titulo')!).x).toBeCloseTo(title.rect!.x - GAP, 3);
    expect(last(pathOf(page, 'a-titulo')!).y).toBeCloseTo(title.rect!.y, 3);
    expect(doc.contentWarnings?.filter((w) => w.kind === 'labelAnchorUnknown') ?? []).toEqual([]);
  });

  it('stays on target when the notes run longer (another language) and move', () => {
    const en = build('en');
    const es = build('es');
    const pe = composedPages(en)[0]!;
    const ps = composedPages(es)[0]!;
    // The Spanish notes are longer: the second and third start lower.
    expect(frameBox(ps, 'n2').y).toBeGreaterThan(frameBox(pe, 'n2').y + 10);
    expect(frameBox(ps, 'n3').y).toBeGreaterThan(frameBox(pe, 'n3').y + 10);
    for (const [id, note, anchor] of CONNECTORS) {
      expectOnTarget(es, ps, id, anchor);
      // The far end is the same point of the map in both editions.
      expect(last(pathOf(ps, id)!)).toEqual(last(pathOf(pe, id)!));
      const n = frameBox(ps, note);
      expect(first(pathOf(ps, id)!).y).toBeCloseTo(n.y + n.height / 2, 3);
    }
  });

  it('follows the picture when the frame scales it down to make room (the ladder)', () => {
    const lead = Array.from({ length: 70 }, (_, i) => `word${i}`).join(' ');
    const plain = build('en');
    const doc = build('en', { lead });
    const { block: small } = mapBlock(doc);
    const { block: whole } = mapBlock(plain);
    expect(small.resourceBlock!.bodyRect.width).toBeLessThan(whole.resourceBlock!.bodyRect.width - 20);
    const page = composedPages(doc)[0]!;
    for (const [id, , anchor] of CONNECTORS) expectOnTarget(doc, page, id, anchor);
    // The paragraph above it moved the picture and the ladder shrank it:
    // the ends moved with the art.
    expect(Math.abs(last(pathOf(page, 'a-escala')!).y - last(pathOf(composedPages(plain)[0]!, 'a-escala')!).y)).toBeGreaterThan(10);
  });

  it('drops an end whose point its frame cuts off (the picture pushed past the frame\'s foot)', () => {
    const lead = Array.from({ length: 600 }, (_, i) => `word${i}`).join(' ');
    const doc = build('en', { lead });
    const page = composedPages(doc)[0]!;
    const dropped = page.composed!.log.filter((e) => e.kind === 'connectorDropped');
    expect(dropped.length).toBeGreaterThan(0);
    for (const e of dropped) {
      expect(e.frame).toBe('mapa');
      expect(pathOf(page, e.cause!)).toBeUndefined();
    }
    expect((doc.contentWarnings ?? []).filter((w) => w.kind === 'labelAnchorUnknown')).toEqual([]);
  });

  it('on a right-to-left page ends where the picture, painted the right way round, shows the anchor', () => {
    const doc = build('ar');
    const page = composedPages(doc)[0]!;
    expect(pageIsMirrored(page)).toBe(true);
    // The notes stand at the flow's start: right of the map.
    expect(frameBox(page, 'n1').x).toBeGreaterThan(frameBox(page, 'mapa').x);
    for (const [id, note, anchor] of CONNECTORS) {
      expectOnTarget(doc, page, id, anchor, 'right');
      // `end` of a right-to-left page is the note's left side.
      const n = frameBox(page, note);
      expect(first(pathOf(page, id)!)).toEqual({ x: n.x, y: n.y + n.height / 2 });
    }
    // The label drawn at the title anchor stands at the same point of the
    // sheet: the flow's mirrored label, put back by the page's reflection.
    const { block } = mapBlock(doc);
    const body = bodyOnSheet(page, block);
    const sheetX = body.x + anchorOf('title').x * body.width;
    expect(figureAnchorPointOnPage(page, block, 'title')!.x).toBeCloseTo(sheetX, 6);
    const titleLayout = labelLayoutOnSheet(labelAt(block, 'title-rtl').layout!, block.resourceBlock!.bodyRect.width);
    expect(body.x + titleLayout.x).toBeCloseTo(sheetX, 3);
  });

  it('crosses the spine of a spread to the anchor on the other page', () => {
    const doc = build('en', { template: 'partesPliego', spread: true });
    const [verso, recto] = composedPages(doc) as [VDTPage, VDTPage];
    expect(verso.composed!.spread).toBe('left');
    // The notes on the left page, the map on the right.
    expect(mapBlock(doc).page).toBe(recto);
    for (const [id, , anchor] of CONNECTORS) {
      expectOnTarget(doc, verso, id, anchor);
      expectOnTarget(doc, recto, id, anchor);
    }
  });

  it('reaches the picture of an instance of a repeated frame', () => {
    const withAnchors = GRID_RESOURCES.map((r) => (r.kind === 'bitmap' ? { ...r, anchors: [{ id: 'eye', x: 0.25, y: 0.5 }] } : r));
    const t: PageTemplate = {
      ...PHOTO_TEMPLATE,
      decoration: { elements: [{ kind: 'connector', id: 'mira', routing: 'straight', from: { to: '#titulo' }, to: [{ to: '#foto[*]', anchor: 'eye' }] } as DesignConnectorElement] },
    };
    const doc = buildDocument({ markdown: photoPage('River animals', ['The heron', 'The otter']), resources: withAnchors }, { ...GRID_CONFIG, pageTemplates: [t] }, createMeasurementCache());
    const page = composedPages(doc)[0]!;
    const path = pathOf(page, 'mira')!;
    const ends = path.subpaths.map((sp) => sp.filter((c): c is Extract<VDTPathCommand, { x: number }> => c.op !== 'Z').at(-1)!);
    const pictures = page.composed!.frames.filter((f) => f.name.startsWith('foto[')).map((f) => {
      const block = (page.floats ?? []).find((b) => f.blockIds.includes(b.id) && b.resourceBlock)!;
      return figureAnchorPointOnPage(page, block, 'eye')!;
    });
    expect(pictures).toHaveLength(2);
    for (const p of pictures) expect(ends.some((e) => Math.abs(e.x - p.x) < 1e-6 && Math.abs(e.y - p.y) < 1e-6)).toBe(true);
  });

  it('leaves out an end at an anchor the picture lacks, with labelAnchorUnknown naming the connector', () => {
    const t: PageTemplate = {
      ...MAP_PARTS_TEMPLATE,
      decoration: {
        elements: [
          ...MAP_PARTS_TEMPLATE.decoration!.elements,
          { kind: 'connector', id: 'perdido', from: { to: '#n1' }, to: { to: '#mapa', anchor: 'compass' } } as DesignConnectorElement,
          { kind: 'connector', id: 'vacio', from: { to: '#n1' }, to: { to: '#n2', anchor: 'title' } } as DesignConnectorElement,
        ],
      },
    };
    const doc = build('en', {}, (c) => ({ ...c, pageTemplates: [t] }));
    const page = composedPages(doc)[0]!;
    expect(pathOf(page, 'perdido')).toBeUndefined();
    expect(pathOf(page, 'vacio')).toBeUndefined();
    expect(pathOf(page, 'a-titulo')).toBeDefined();
    const unknown = (doc.contentWarnings ?? []).filter((w): w is Extract<ContentWarning, { kind: 'labelAnchorUnknown' }> => w.kind === 'labelAnchorUnknown');
    expect(unknown).toHaveLength(2);
    expect(unknown[0]).toMatchObject({ connector: 'perdido', frame: 'mapa', anchor: 'compass', resourceId: 'varenia', pageIndex: page.index });
    expect(unknown[0]!.known).toContain('legend');
    expect(unknown[1]).toMatchObject({ connector: 'vacio', frame: 'n2', anchor: 'title', resourceId: '', known: [] });
    expect(formatWarning(unknown[0]!)).toContain('Connector "perdido"');
  });
});

describe('labels set away from their point, with a leader (#1057)', () => {
  const doc = build('en');
  const { page, block } = mapBlock(doc);
  const rb = block.resourceBlock!;
  const bx = block.bbox.x + rb.bodyRect.x;
  const by = block.bbox.y + rb.bodyRect.y;

  it('stands the label at labelAt and draws a line from its box to the point, a dot on the point', () => {
    const peaks = labelAt(block, 'peaks');
    const layout = peaks.layout!;
    // The box is centred on `labelAt`, the leader ends on the anchor.
    expect(layout.x).toBeCloseTo(0.62 * rb.bodyRect.width, 3);
    expect(layout.y).toBeCloseTo(0.6 * rb.bodyRect.height, 3);
    expect(layout.leader).toMatchObject({ x: 0.42 * rb.bodyRect.width, routing: 'straight', endCap: 'dot' });
    expect(layout.leader!.y).toBeCloseTo(0.8 * rb.bodyRect.height, 3);
    // The look of the label style: colour, width, cap size.
    expect(layout.leader!.stroke.color).toBe('#3b2a1a');
    expect(layout.leader!.stroke.widthPx).toBeCloseTo(0.6 * 300 / 72, 3);
    const path = figureLabelLeaderPath(layout, bx, by)!;
    const pts = pointsOf(path);
    expect(pts).toHaveLength(2);
    expect(pts[1]!.x).toBeCloseTo(bx + layout.leader!.x, 3);
    expect(pts[1]!.y).toBeCloseTo(by + layout.leader!.y, 3);
    expect(path.markers).toEqual([expect.objectContaining({ kind: 'dot', x: pts[1]!.x, y: pts[1]!.y, sizePx: 10 })]);
    // It leaves the box from the middle of the side facing the point (the
    // point is below and to the left, further across than down): the left
    // side, a gap off the words, so it crosses none of them.
    const r = peaks.rect!;
    expect(pts[0]!.y).toBeCloseTo(r.y + r.height / 2, 3);
    expect(r.x - pts[0]!.x).toBeCloseTo(layout.leader!.gapPx, 3);
  });

  it('runs an elbow out of the facing side square and onto the point', () => {
    const lake = labelAt(block, 'lake');
    const layout = lake.layout!;
    const path = figureLabelLeaderPath(layout, bx, by)!;
    const pts = pointsOf(path);
    expect(pts).toHaveLength(3);
    const r = lake.rect!;
    // The point is left of the box and a little above: out of the left side.
    expect(pts[0]!.x).toBeLessThan(r.x);
    expect(pts[0]!.y).toBeCloseTo(r.y + r.height / 2, 3);
    expect(pts[1]!.y).toBeCloseTo(pts[0]!.y, 6);
    expect(pts[1]!.x).toBeCloseTo(pts[2]!.x, 6);
    expect(pts[2]!.x).toBeCloseTo(bx + layout.leader!.x, 3);
    expect(pts[2]!.y).toBeCloseTo(by + layout.leader!.y, 3);
  });

  it('draws none for a label that stands at its point, and none where the point is under the box', () => {
    expect(labelAt(block, 'title').layout!.leader).toBeUndefined();
    const md = mapPartsFixture('en').markdown.replace('{at="title"}', '{at="title" leader}').replace('{at="peaks"}', '{at="peaks" leader="none"}');
    const f = mapPartsFixture('en');
    const d2 = buildDocument({ markdown: md, resources: f.resources }, f.config, createMeasurementCache());
    const b2 = mapBlock(d2).block;
    // Asked for, but its point is the corner of its own box: nothing to draw.
    const title = labelAt(b2, 'title').layout!;
    expect(title.leader).toBeDefined();
    expect(figureLabelLeaderPath(title, 0, 0)).toBeUndefined();
    // `leader="none"` wins over the anchor's `leader: true`.
    expect(labelAt(b2, 'peaks').layout!.leader).toBeUndefined();
    // The label keeps its place away from its point either way.
    expect(labelAt(b2, 'peaks').layout!.x).toBeCloseTo(labelAt(block, 'peaks').layout!.x, 6);
  });

  it('reads the leader attribute of ::label and :::label', () => {
    const blocks = parseMarkdown(':::figure{resource="varenia"}\n::label[A]{at="peaks" leader}\n::label[B]{at="lake" leader="none"}\n:::label{at="legend" leader="yes"}\nC\n:::\n::label[D]{at="title"}\n:::\n');
    const labels = blocks.find((b) => b.figure)!.figure!.labels;
    expect(labels.map((l) => l.leader)).toEqual([true, false, true, undefined]);
  });

  it('a style leader look turns leaders on for labels set away from their point only', () => {
    const resources = MAP_PARTS_RESOURCES.map((r) => ({ ...r, anchors: r.anchors!.map((a) => (a.id === 'peaks' ? { ...a, leader: undefined } : a)) }));
    const d2 = build('en', {}, (c) => c, resources as Resource[]);
    expect(labelAt(mapBlock(d2).block, 'peaks').layout!.leader).toBeDefined();
    const off = MAP_PARTS_RESOURCES.map((r) => ({ ...r, anchors: r.anchors!.map((a) => (a.id === 'peaks' ? { ...a, leader: false } : a)) }));
    expect(labelAt(mapBlock(build('en', {}, (c) => c, off as Resource[])).block, 'peaks').layout!.leader).toBeUndefined();
  });

  it('is not a label box for labelOverlap: a leader over another label raises nothing', () => {
    // The lake's elbow runs under nothing; the labels' boxes are what meet.
    expect(overlappingLabels(rb.labels!).size).toBe(0);
    expect((doc.contentWarnings ?? []).filter((w) => w.kind === 'labelOverlap')).toEqual([]);
  });

  it('mirrors the leader with its label on a right-to-left page, back on the point on the sheet', () => {
    const ar = build('ar');
    const { page: p, block: b } = mapBlock(ar);
    const w = b.resourceBlock!.bodyRect.width;
    const layout = labelAt(b, 'peaks').layout!;
    // In the mirrored flow the point is reflected about the body's axis …
    expect(layout.leader!.x).toBeCloseTo(w - 0.42 * w, 3);
    // … and given back on the sheet.
    const sheet = labelLayoutOnSheet(layout, w);
    expect(sheet.leader!.x).toBeCloseTo(0.42 * w, 3);
    const body = bodyOnSheet(p, b);
    const path = figureLabelLeaderPath(sheet, body.x, body.y)!;
    expect(last(path).x).toBeCloseTo(figureAnchorPointOnPage(p, b, 'peaks')!.x, 3);
  });

  it('is painted with the labels: first on the canvas, an SVG in the figure in HTML', () => {
    const ops: string[] = [];
    const ctx = new Proxy({ font: '', fillStyle: '#000000' } as Record<string | symbol, unknown>, {
      get(target, key) {
        if (key === 'fillText') return (text: string) => ops.push(`text:${text}`);
        if (key === 'moveTo') return (x: number, y: number) => ops.push(`move:${Math.round(x)},${Math.round(y)}`);
        if (key === 'measureText') return (s: string) => ({ width: [...s].length * 7 });
        if (key in target) return target[key];
        return () => undefined;
      },
      set(target, key, value) { target[key] = value; return true; },
    });
    renderPageToCanvas(page, doc, { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement);
    const start = first(figureLabelLeaderPath(labelAt(block, 'peaks').layout!, bx, by)!);
    const move = ops.indexOf(`move:${Math.round(start.x)},${Math.round(start.y)}`);
    expect(move).toBeGreaterThan(-1);
    // Before the label's words.
    expect(move).toBeLessThan(ops.findIndex((o) => o.startsWith('text:Grey')));
    // HTML: the leaders as hidden SVG just before the figure's first label.
    const html = JSON.stringify(renderToHtmlIndexed(doc));
    const labelAtHtml = html.indexOf('pt-figure-label');
    const leaderAt = html.lastIndexOf('stroke=\\"#3b2a1a\\"', labelAtHtml);
    expect(leaderAt).toBeGreaterThan(-1);
    expect(html.lastIndexOf('<svg aria-hidden=\\"true\\"', leaderAt)).toBeGreaterThan(-1);
  });
});

describe('leader validation (#1057)', () => {
  it('unknownConfigKey and unknownConfigValue in a label style leader and an anchor', () => {
    const f = mapPartsFixture('en');
    const config: PostextConfig = {
      ...f.config,
      labelStyles: [...f.config.labelStyles!, { id: 'bad', leader: { colour: '#000', endCap: 'arow', routing: 'curvy' } as never }],
    };
    const resources = [{
      ...MAP_PARTS_RESOURCES[0]!,
      anchors: [
        { id: 'a', x: 0.1, y: 0.1, labelAt: { x: 'left', y: 0.2 } as never },
        { id: 'b', x: 0.1, y: 0.1, leader: 'yes' as never },
        { id: 'c', x: 0.1, y: 0.1, leader: { startCap: 'star', size: 2 } as never, labelAt: { x: 0.5, y: 0.5, z: 1 } as never },
      ],
    }] as Resource[];
    const warnings = validatePageTemplates(config, { resources });
    const at = (path: string) => warnings.filter((w) => w.path === path).map((w) => ({ kind: w.kind, value: w.value }));
    const s = '/labelStyles/4/leader';
    expect(at(`${s}/colour`)).toEqual([{ kind: 'unknownConfigKey', value: 'colour' }]);
    expect(warnings.find((w) => w.path === `${s}/colour`)).toMatchObject({ suggestion: 'color' });
    expect(warnings.find((w) => w.path === `${s}/endCap`)).toMatchObject({ kind: 'unknownConfigValue', value: 'arow', used: 'dot', suggestion: 'arrow' });
    expect(warnings.find((w) => w.path === `${s}/routing`)).toMatchObject({ kind: 'unknownConfigValue', value: 'curvy', used: 'straight' });
    expect(at('/resources/0/anchors/0/labelAt')).toEqual([{ kind: 'unknownConfigValue', value: '{"x":"left","y":0.2}' }]);
    expect(at('/resources/0/anchors/1/leader')).toEqual([{ kind: 'unknownConfigValue', value: 'yes' }]);
    expect(at('/resources/0/anchors/2/leader/startCap')).toEqual([{ kind: 'unknownConfigValue', value: 'star' }]);
    expect(at('/resources/0/anchors/2/leader/size')).toEqual([{ kind: 'unknownConfigKey', value: 'size' }]);
    expect(at('/resources/0/anchors/2/labelAt/z')).toEqual([{ kind: 'unknownConfigKey', value: 'z' }]);
    // The fixture itself is clean.
    expect(validatePageTemplates(f.config, { resources: f.resources })).toEqual([]);
  });

  it('a connector end whose anchor is not a name', () => {
    const t: PageTemplate = {
      ...MAP_PARTS_TEMPLATE,
      decoration: { elements: [{ kind: 'connector', id: 'x', from: { to: '#n1' }, to: { to: '#mapa', anchor: 7 } } as unknown as DesignConnectorElement] },
    };
    const warnings = collectConfigWarnings({ ...mapPartsFixture('en').config, pageTemplates: [t] }).filter((w) => w.kind === 'unknownConfigValue');
    expect(warnings.map((w) => w.path)).toContain('pageTemplates[0].decoration.elements[0].to.anchor');
  });
});

