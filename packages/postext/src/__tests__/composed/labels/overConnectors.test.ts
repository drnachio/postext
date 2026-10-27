/**
 * Connectors painted over the frames (#1076): a connector with an end at a
 * picture's anchor (a pointer into a map) is painted after every frame of
 * the page, in every backend and in the source map, while the rest of the
 * decoration stays one paint item under the frames. `over` overrides the
 * default either way. The fixture is the parts of a map of #1057, its map
 * frame at the default layer.
 */
import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { renderToHtmlIndexed } from '../../../html-backend/html-backend.js';
import { renderPageToCanvas } from '../../../index.js';
import { collectConfigWarnings } from '../../../checks/configWarnings.js';
import { sourceAt } from '../../../composed/sourceMap.js';
import { composedPaintOrder, composedReadingOrder, decorationOver, decorationUnder } from '../../../composed/paint.js';
import { flowRectToPage, type VDTDesignPathBlock, type VDTPathCommand } from '../../../vdt.js';
import type { PageTemplate } from '../../../composed/types.js';
import type { DesignConnectorElement, PostextConfig, VDTDocument, VDTPage } from '../../../index.js';
import { mapPartsFixture, type MapPartsLocale } from '../fixtures/mapParts.js';

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
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
const mm = (value: number) => ({ value, unit: 'mm' as const });
const CONNECTORS = ['a-titulo', 'a-leyenda', 'a-escala'] as const;

/** The map-parts book, its templates patched by `patch`. */
const build = (locale: MapPartsLocale, patch: (t: PageTemplate) => PageTemplate = (t) => t): VDTDocument => {
  const f = mapPartsFixture(locale);
  const config: PostextConfig = { ...f.config, pageTemplates: f.config.pageTemplates!.map((t) => patch(t as PageTemplate)) };
  return buildDocument({ markdown: f.markdown, resources: f.resources }, config, createMeasurementCache());
};
/** The map frame under the decoration, as #1057's fixture had it. */
const mapUnder = (t: PageTemplate): PageTemplate => ({ ...t, frames: (t.frames ?? []).map((f) => (f.name === 'mapa' ? { ...f, layer: -1 } : f)) });
/** Every connector of the template with `over` set. */
const withOver = (over: boolean) => (t: PageTemplate): PageTemplate => ({
  ...t,
  decoration: { elements: (t.decoration?.elements ?? []).map((e) => ('kind' in e && e.kind === 'connector' ? { ...e, over } : e)) },
});
const composedPage = (doc: VDTDocument): VDTPage => doc.pages.find((p) => p.composed)!;
const pathOf = (page: VDTPage, id: string): VDTDesignPathBlock =>
  page.composed!.decoration!.blocks.find((x) => x.elementId === id) as VDTDesignPathBlock;
const pointsOf = (b: VDTDesignPathBlock) =>
  b.subpaths.flat().filter((c): c is Extract<VDTPathCommand, { x: number }> => c.op !== 'Z').map((c) => ({ x: c.x, y: c.y }));
const order = (page: VDTPage): string[] => composedPaintOrder(page).map((i) => (i.kind === 'frame' ? i.frame.name : i.kind));
const configPath = (i: number) => `/pageTemplates/0/decoration/elements/${i}`;

/** A canvas that records the strokes' starts and the words it fills. */
function recordCanvas(): { ops: string[]; canvas: HTMLCanvasElement } {
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
  return { ops, canvas: { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement };
}

describe('connectors into a picture paint over the frames (#1076)', () => {
  it('a connector with an anchor end is marked over; the paint order ends with the over item', () => {
    const page = composedPage(build('en'));
    expect(page.composed!.frames.find((f) => f.name === 'mapa')!.layer).toBe(1);
    for (const id of CONNECTORS) expect(pathOf(page, id).over).toBe(true);
    const o = order(page);
    expect(o.at(-1)).toBe('over');
    // Every frame (the map among them) is painted before it.
    expect(o.indexOf('mapa')).toBeLessThan(o.indexOf('over'));
    expect(o.filter((k) => k === 'decoration')).toHaveLength(1);
    // The decoration item holds what is not over; the over item the rest.
    const deco = page.composed!.decoration!;
    expect(decorationUnder(deco).blocks.some((b) => b.kind === 'path' && b.over)).toBe(false);
    expect(decorationOver(deco)!.blocks.map((b) => b.elementId)).toEqual([...CONNECTORS]);
    // Read with the decoration, before the frames.
    expect(composedReadingOrder(composedPaintOrder(page)).slice(0, 2).map((i) => i.kind)).toEqual(['decoration', 'over']);
  });

  it('draws the same lines as the map frame under the decoration (layer -1) did', () => {
    const now = composedPage(build('en'));
    const before = composedPage(build('en', mapUnder));
    for (const id of CONNECTORS) expect(pathOf(now, id).subpaths).toEqual(pathOf(before, id).subpaths);
    // With the map under the decoration the connectors are still painted
    // after every frame.
    const o = order(before);
    expect(o.indexOf('mapa')).toBeLessThan(o.indexOf('decoration'));
    expect(o.at(-1)).toBe('over');
  });

  it('over: false keeps an anchored connector with the decoration, under the frames', () => {
    const page = composedPage(build('en', withOver(false)));
    for (const id of CONNECTORS) expect(pathOf(page, id).over).toBeUndefined();
    expect(order(page)).not.toContain('over');
    // Nothing is copied: the decoration paints as one slot.
    expect(decorationUnder(page.composed!.decoration)).toBe(page.composed!.decoration);
    expect(decorationOver(page.composed!.decoration)).toBeUndefined();
  });

  it('on the canvas: each pointer is stroked after the notes\' words and the map', () => {
    for (const locale of ['en', 'ar'] as const) {
      const doc = build(locale);
      const page = composedPage(doc);
      const { ops, canvas } = recordCanvas();
      renderPageToCanvas(page, doc, canvas);
      // The last word of the frames (the folio, painted after the page, aside).
      const lastWord = ops.reduce((at, o, i) => (o.startsWith('text:') && !/^text:[\d\u0660-\u0669]+$/.test(o) ? i : at), -1);
      for (const id of CONNECTORS) {
        const p = pointsOf(pathOf(page, id))[0]!;
        const at = ops.lastIndexOf(`move:${Math.round(p.x)},${Math.round(p.y)}`);
        expect(at, `${locale} ${id}`).toBeGreaterThan(lastWord);
      }
    }
    // Under the frames when over is false: before the notes' words.
    const doc = build('en', withOver(false));
    const page = composedPage(doc);
    const { ops, canvas } = recordCanvas();
    renderPageToCanvas(page, doc, canvas);
    const p = pointsOf(pathOf(page, 'a-titulo'))[0]!;
    const at = ops.indexOf(`move:${Math.round(p.x)},${Math.round(p.y)}`);
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(ops.findIndex((o) => o.startsWith('text:')));
  });

  it('in HTML: the over part in a box of its own above every frame; through a flow frame after the rest', () => {
    const htmlOf = (doc: VDTDocument): string => renderToHtmlIndexed(doc).pages[composedPage(doc).index]!.innerHtml;
    const html = htmlOf(build('en'));
    const over = /class="pt-frame-decoration pt-frame-decoration-over" style="[^"]*z-index:(\d+);/.exec(html);
    expect(over).not.toBeNull();
    const frames = [...html.matchAll(/class="pt-frame[^"]*" data-frame-id="[^"]*" data-layer="-?\d+"[^>]*z-index:(\d+)/g)].map((m) => Number(m[1]));
    expect(frames.length).toBeGreaterThan(0);
    expect(Number(over![1])).toBeGreaterThan(Math.max(...frames));
    // Every pointer is drawn in it, and none under the frames: the
    // fixture's decoration holds nothing else, so no box is written there.
    expect((html.slice(over!.index).match(/stroke="#2e4a5c"/g) ?? []).length).toBe(CONNECTORS.length);
    expect(html.indexOf('stroke="#2e4a5c"')).toBeGreaterThan(over!.index);
    expect(html).not.toMatch(/class="pt-frame-decoration" /);
    // With over: false they are in the decoration's box, under the frames.
    const under = htmlOf(build('en', withOver(false)));
    const deco = /class="pt-frame-decoration" style="[^"]*z-index:(\d+);">/.exec(under);
    expect(deco).not.toBeNull();
    expect(Number(deco![1])).toBe(1);
    expect(under).not.toContain('pt-frame-decoration-over');
    // Right to left: the frames are written in the mirrored flow, the
    // decoration on the sheet after it, the pointers last.
    const rtl = htmlOf(build('ar'));
    expect(rtl).not.toContain('pt-frame-decoration-over');
    const flowEnd = rtl.lastIndexOf('pt-frame');
    const strokes = [...rtl.matchAll(/stroke="#2e4a5c"/g)].map((m) => m.index!);
    expect(strokes.length).toBe(CONNECTORS.length);
    for (const s of strokes) expect(s).toBeGreaterThan(flowEnd);
  });

  it('the source map answers the connector on its ink inside the map frame', () => {
    const doc = build('en');
    const page = composedPage(doc);
    const path = pathOf(page, 'a-titulo');
    const end = pointsOf(path).at(-1)!;
    const map = flowRectToPage(page, page.composed!.frames.find((f) => f.name === 'mapa')!.rect);
    const p = { x: end.x - 3, y: end.y };
    expect(p.x).toBeGreaterThan(map.x);
    const hit = sourceAt(doc, page.index, p.x, p.y);
    expect(hit.some((e) => (e.source as { path?: string } | undefined)?.path === configPath(0))).toBe(true);
    // Under the frames, the map answers there.
    const under = build('en', withOver(false));
    const q = composedPage(under);
    const hitUnder = sourceAt(under, q.index, p.x, p.y);
    expect(hitUnder.some((e) => (e.source as { path?: string } | undefined)?.path === configPath(0))).toBe(false);
  });

  it('frameCovered does not read connectors: none for pointers over the map or a line over a note', () => {
    const doc = build('en');
    expect(doc.contentWarnings?.filter((w) => w.kind === 'frameCovered') ?? []).toEqual([]);
    // A straight line forced over, across the words of the notes.
    const across = build('en', (t) => ({
      ...t,
      decoration: { elements: [{ kind: 'connector', id: 'x', routing: 'straight', over: true, from: { to: '#n1', side: 'top' }, to: { to: '#n3', side: 'bottom' } } as DesignConnectorElement] },
    }));
    expect(pathOf(composedPage(across), 'x').over).toBe(true);
    expect(across.contentWarnings?.filter((w) => w.kind === 'frameCovered') ?? []).toEqual([]);
  });
});

describe('plain connectors stay under the frames (#1076)', () => {
  const two: PageTemplate = {
    id: 'dos',
    header: false,
    frames: [
      { name: 'izq', width: mm(40), height: mm(20), placement: { anchor: { to: 'container', edge: 'top-left' } } },
      { name: 'der', width: mm(40), height: mm(20), placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { x: mm(100), y: mm(60) } } },
    ],
    decoration: { elements: [{ kind: 'box', id: 'band', style: { backgroundColor: { hex: '#eeeeee', model: 'hex' } }, placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: mm(20), height: mm(20) } } }] },
  };
  const md = '::::page{template="dos"}\n:::frame{slot="izq"}\nLeft\n:::\n:::frame{slot="der"}\nRight\n:::\n::::\n';
  const page = (c: Partial<DesignConnectorElement>): VDTPage => {
    const t: PageTemplate = { ...two, decoration: { elements: [...two.decoration!.elements, { kind: 'connector', id: 'c', from: { to: '#izq' }, to: { to: '#der' }, ...c } as DesignConnectorElement] } };
    return composedPage(buildDocument({ markdown: md }, { pageTemplates: [t] } as PostextConfig, createMeasurementCache()));
  };

  it('frame to frame: no over mark, no over item', () => {
    const p = page({});
    expect(pathOf(p, 'c').over).toBeUndefined();
    expect(order(p)).toEqual(['decoration', 'izq', 'der']);
  });

  it('over: true paints a plain connector after the frames; the box stays under them', () => {
    const p = page({ over: true });
    expect(order(p)).toEqual(['decoration', 'izq', 'der', 'over']);
    expect(decorationUnder(p.composed!.decoration)!.blocks.map((b) => b.elementId)).toEqual(['band']);
    expect(decorationOver(p.composed!.decoration)!.blocks.map((b) => b.elementId)).toEqual(['c']);
    const pts = pointsOf(pathOf(p, 'c'));
    expect(pts.length).toBeGreaterThan(1);
    expect(Math.abs(pts[0]!.x - pts[1]!.x) + Math.abs(pts[0]!.y - pts[1]!.y)).toBeGreaterThan(MM);
  });

  it('a non-boolean over is unknownConfigValue, read as its default', () => {
    const config = { pageTemplates: [{ ...two, decoration: { elements: [
      { kind: 'connector', id: 'c', from: { to: '#izq' }, to: { to: '#der' }, over: 'yes' },
      { kind: 'connector', id: 'd', from: { to: '#izq' }, to: { to: '#der', anchor: 'x' }, over: 1 },
    ] } }] } as unknown as PostextConfig;
    const w = collectConfigWarnings(config).filter((x) => x.kind === 'unknownConfigValue' && x.path.endsWith('.over'));
    expect(w).toEqual([
      expect.objectContaining({ path: 'pageTemplates[0].decoration.elements[0].over', value: 'yes', used: 'false' }),
      expect.objectContaining({ path: 'pageTemplates[0].decoration.elements[1].over', value: '1', used: 'true' }),
    ]);
  });
});
