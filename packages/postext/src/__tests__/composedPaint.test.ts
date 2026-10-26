import { describe, it, expect } from 'vitest';
import { buildDocument, renderPageToCanvas } from '../index.js';
import { renderToHtmlIndexed } from '../html-backend/html-backend.js';
import { frameMatrix } from '../composed/paint.js';
import type { VDTDocument, VDTFrame, VDTPage } from '../vdt.js';

// #855: the canvas and the HTML paint a composed page's frames in layer
// order (the decoration at layer 0), each turned by its matrix and clipped
// to its box when its content overflows, and never as plain floats too.

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

const markdown = [
  'Intro paragraph.',
  '',
  ':::callout{placement="top"}',
  'Alpha one.',
  ':::',
  '',
  ':::callout{placement="top"}',
  'Bravo one.',
  '',
  'Bravo two.',
  ':::',
  '',
  ':::callout{placement="bottom"}',
  'Charlie one.',
  '',
  'Charlie two.',
  '',
  'Charlie three.',
  ':::',
  '',
  'Outro.',
].join('\n');

/** A laid-out page whose three floated boxes are made the frames of a
 *  composed page by hand: alpha turned 15° at layer 2, bravo clipped
 *  (overflowing) at layer 1, charlie at layer −1, under a decoration
 *  reading DECO (the page's running head, moved). */
function composedDoc(): { doc: VDTDocument; page: VDTPage; frames: Record<'alpha' | 'bravo' | 'charlie', VDTFrame> } {
  const doc = buildDocument({ markdown }, {
    header: { elements: [{ kind: 'text', id: 'deco', content: 'DECO', fontFamily: 'Decofont', fontSize: { value: 10, unit: 'pt' }, placement: { anchor: { to: 'container', edge: 'top-left' } } }] },
    footer: { elements: [] },
  });
  const page = doc.pages[0]!;
  const floats = page.floats ?? [];
  const boxes = floats.filter((f) => f.type === 'callout');
  expect(boxes).toHaveLength(3);
  const frame = (name: string, i: number, layer: number, rotate: number, overflowPx: number): VDTFrame => {
    const box = boxes[i]!;
    return {
      id: `cp0:${name}`,
      name,
      rect: { ...box.bbox },
      rotate,
      layer,
      scale: 1,
      overflowPx,
      blockIds: floats.filter((f) => f.containerId === box.containerId).map((f) => f.id),
      configPath: `/pageTemplates/0/frames/${i}`,
    };
  };
  const frames = {
    alpha: frame('alpha', 0, 2, 15, 0),
    bravo: frame('bravo', 1, 1, 0, 24),
    charlie: frame('charlie', 2, -1, 0, 0),
  };
  expect(page.header).toBeDefined();
  page.composed = {
    template: 't',
    fenceIndex: 0,
    role: 'composed',
    attrs: {},
    attrSources: {},
    frames: [frames.alpha, frames.bravo, frames.charlie],
    decoration: page.header!,
    log: [],
    configPath: '/pageTemplates/0',
    sourceStart: 0,
    sourceEnd: 0,
  };
  delete page.header;
  return { doc, page, frames };
}

type Op = { op: string; args: unknown[] };

/** A 2D context recording the calls that matter here. */
function recordingCanvas(): { canvas: HTMLCanvasElement; ops: Op[] } {
  const ops: Op[] = [];
  const recorded = new Set(['save', 'restore', 'transform', 'rect', 'clip', 'fillText']);
  const ctx: Record<string | symbol, unknown> = new Proxy({}, {
    get(target: Record<string | symbol, unknown>, key) {
      if (key === 'measureText') return (s: string) => ({ width: s.length * 7 });
      if (typeof key === 'string' && recorded.has(key)) return (...args: unknown[]) => { ops.push({ op: key, args }); };
      if (key in target) return target[key];
      return () => undefined;
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  return { canvas, ops };
}

const firstText = (ops: Op[], word: string) => ops.findIndex((o) => o.op === 'fillText' && String(o.args[0]).includes(word));

describe('a composed page on the canvas (#855)', () => {
  it('paints the frames in layer order, the decoration at layer 0', () => {
    const { doc, page } = composedDoc();
    const { canvas, ops } = recordingCanvas();
    renderPageToCanvas(page, doc, canvas);
    const at = ['Charlie', 'DECO', 'Bravo', 'Alpha'].map((w) => firstText(ops, w));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('paints each frame block once', () => {
    const { doc, page } = composedDoc();
    const { canvas, ops } = recordingCanvas();
    renderPageToCanvas(page, doc, canvas);
    expect(ops.filter((o) => o.op === 'fillText' && String(o.args[0]).includes('Alpha'))).toHaveLength(1);
    expect(ops.filter((o) => o.op === 'fillText' && String(o.args[0]).includes('three'))).toHaveLength(1);
  });

  it('turns the rotated frame by its matrix and clips the overflowing one to its box', () => {
    const { doc, page, frames } = composedDoc();
    const { canvas, ops } = recordingCanvas();
    renderPageToCanvas(page, doc, canvas);
    const m = frameMatrix(frames.alpha)!;
    const turn = ops.findIndex((o) => o.op === 'transform' && (o.args as number[]).every((v, i) => Math.abs(v - m[i]!) < 1e-9));
    expect(turn).toBeGreaterThan(firstText(ops, 'Bravo'));
    expect(turn).toBeLessThan(firstText(ops, 'Alpha'));
    const r = frames.bravo.rect;
    const box = ops.findIndex((o) => o.op === 'rect' && (o.args as number[]).join() === [r.x, r.y, r.width, r.height].join());
    expect(box).toBeGreaterThan(firstText(ops, 'DECO'));
    expect(ops[box + 1]?.op).toBe('clip');
    expect(box).toBeLessThan(firstText(ops, 'Bravo'));
    // Neither upright nor fitting frame is clipped or turned.
    const c = frames.charlie.rect;
    expect(ops.some((o) => o.op === 'rect' && (o.args as number[]).join() === [c.x, c.y, c.width, c.height].join())).toBe(false);
    // The states balance.
    expect(ops.filter((o) => o.op === 'save').length).toBe(ops.filter((o) => o.op === 'restore').length);
  });
});

describe('a composed page in the HTML (#855)', () => {
  it('writes each frame in a box of its own in reading order, painted in layer order by z-index, the decoration at layer 0 (#862)', () => {
    const { doc } = composedDoc();
    const out = renderToHtmlIndexed(doc);
    const html = out.pages[0]!.innerHtml;
    // The markup reads the decoration, then alpha, bravo, charlie: the
    // Markdown order a screen reader (and a fixed-layout EPUB) follows.
    const at = ['DECO', 'data-frame-id="cp0:alpha"', 'data-frame-id="cp0:bravo"', 'data-frame-id="cp0:charlie"'].map((s) => html.indexOf(s));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(html.split('DECO').length - 1).toBe(1);
    // Painted charlie (layer −1), the decoration (0), bravo (1), alpha (2),
    // inside one stacking context.
    const z = (id: string) => Number(new RegExp(`data-frame-id="${id}"[^>]*z-index:(\\d+)`).exec(html)?.[1]);
    const decoZ = Number(/class="pt-frame-decoration"[^>]*z-index:(\d+)/.exec(html)?.[1]);
    expect([z('cp0:charlie'), decoZ, z('cp0:bravo'), z('cp0:alpha')]).toEqual([1, 2, 3, 4]);
    expect(html).toContain('<div class="pt-composed" style="position:absolute;left:0;top:0;width:0;height:0;z-index:0;">');
  });

  it('turns the rotated frame and clips the overflowing one', () => {
    const { doc, frames } = composedDoc();
    const html = renderToHtmlIndexed(doc).pages[0]!.innerHtml;
    const open = (id: string) => html.match(new RegExp(`<div class="pt-frame" data-frame-id="${id}"[^>]*>`))?.[0] ?? '';
    const alpha = open('cp0:alpha');
    expect(alpha).toContain('data-layer="2"');
    expect(alpha).toContain('transform-origin:0 0');
    expect(alpha).toMatch(/transform:matrix\(0\.9659,0\.2588,-0\.2588,0\.9659,[-\d.]+,[-\d.]+\)/);
    expect(alpha).not.toContain('clip-path');
    const bravo = open('cp0:bravo');
    const r = frames.bravo.rect;
    const n = (v: number) => String(Math.round(v * 1e4) / 1e4);
    expect(bravo).toContain(`clip-path:polygon(${n(r.x)}px ${n(r.y)}px,${n(r.x + r.width)}px ${n(r.y)}px`);
    expect(bravo).not.toContain('transform');
    expect(open('cp0:charlie')).not.toMatch(/transform|clip-path/);
  });

  it('keeps every frame block once, inside its frame, and in the patchable block list', () => {
    const { doc, frames } = composedDoc();
    const page = renderToHtmlIndexed(doc).pages[0]!;
    const html = page.innerHtml;
    for (const f of Object.values(frames)) {
      for (const id of f.blockIds) {
        expect(html.split(`data-block-id="${id}"`).length - 1).toBe(1);
        expect(page.blocks.some((b) => b.id === id)).toBe(true);
      }
    }
    // A child of alpha sits inside alpha's box.
    const start = html.indexOf('data-frame-id="cp0:alpha"');
    expect(html.indexOf(`data-block-id="${frames.alpha.blockIds[1]}"`)).toBeGreaterThan(start);
    // The frames' boxes are part of what a patcher compares.
    expect(page.decorationHtml).toContain('data-frame-id="cp0:alpha"');
    expect(page.decorationHtml).toContain('DECO');
  });
});
