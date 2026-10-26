import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build.js';
import { renderPageToCanvas } from '../../index.js';
import { createMeasurementCache } from '../../measure/index.js';
import { renderToHtmlIndexed } from '../../html-backend/html-backend.js';
import { sourceAt } from '../../composed/sourceMap.js';
import { frameMatrix } from '../../composed/paint.js';
import { figureLabelBounds, figureLabelMatrix, labelPlace, pictureToBody, resolveLabelLook } from '../../composed/labels.js';
import { formatWarning } from '../../pipeline/contentWarnings.js';
import { resolveAllConfig } from '../../pipeline/config.js';
import { stripLabelStylesDefaults } from '../../composed/templates.js';
import type { ContentWarning, PostextConfig, Resource, VDTBlock, VDTDocument, VDTFigureLabel } from '../../index.js';

// #860: the words of a map in the Markdown, their places in the resource.

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

const mm = (value: number) => ({ value, unit: 'mm' as const });
const px = (value: number) => ({ value, unit: 'px' as const });
const hex = (h: string) => ({ hex: h, model: 'hex' as const });
const PAGE: PostextConfig = {
  page: { width: mm(200), height: mm(260), margins: { top: mm(20), bottom: mm(20), left: mm(20), right: mm(20) } } as never,
  bodyText: { fontSize: px(20) } as never,
  labelStyles: [
    { id: 'mar', fontStyle: 'italic', textTransform: 'uppercase', color: hex('#2b6ca3'), fontSize: px(10) },
    { id: 'ciudad', fontSize: px(10), halo: { color: hex('#ffffff'), width: px(1) }, background: hex('#ffeecc'), padding: px(2) },
    { id: 'tight', fontSize: px(10), minScale: 0.5 },
  ],
};
const MAP: Resource = {
  id: 'mapa', typeId: 'figure', kind: 'bitmap', altText: 'A map of Europe', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: 'mapa.png', format: 'png', width: 400, height: 300 },
  anchors: [
    { id: 'atlantico', x: 0.1, y: 0.5, width: 0.1, style: 'mar' },
    { id: 'madrid', x: 0.25, y: 0.75, align: 'start', verticalAlign: 'bottom', style: 'ciudad' },
    { id: 'rio', x: 0.5, y: 0.5, rotate: 90 },
    { id: 'negro', x: 0.8, y: 0.4, style: 'mar' },
    { id: 'estrecho', x: 0.6, y: 0.2, width: 0.05, style: 'tight' },
    { id: 'speaker', x: 0.9, y: 0.9 },
  ],
};

const figure = (...labels: string[]) => [':::figure{resource="mapa"}', ...labels, ':::', ''].join('\n');
const build = (markdown: string, config: PostextConfig = {}, resources: Resource[] = [MAP]): VDTDocument =>
  buildDocument({ markdown, resources }, { ...PAGE, ...config }, createMeasurementCache());
const allBlocks = (doc: VDTDocument): VDTBlock[] => [...doc.blocks, ...doc.pages.flatMap((p) => p.floats ?? [])];
const figureBlock = (doc: VDTDocument): VDTBlock => allBlocks(doc).find((b) => b.resourceBlock?.resource.id === 'mapa')!;
const labels = (doc: VDTDocument): VDTFigureLabel[] => figureBlock(doc).resourceBlock!.labels!;
const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('anchors on the picture (#860)', () => {
  it('maps a point of the whole picture through its crop and its size', () => {
    const rb = { bodyRect: { x: 0, y: 0, width: 200, height: 100 }, bodySource: { x: 0.25, y: 0.5, width: 0.5, height: 0.5 } };
    expect(pictureToBody(rb, 0.25, 0.5)).toEqual({ x: 0, y: 0 });
    expect(pictureToBody(rb, 0.5, 0.75)).toEqual({ x: 100, y: 50 });
    // Uncropped: fractions of the body.
    expect(pictureToBody({ bodyRect: rb.bodyRect }, 0.5, 0.5)).toEqual({ x: 100, y: 50 });
  });

  it('places a label at its anchor, or at its percentages, and finds no place for an unknown anchor', () => {
    expect(labelPlace({ at: { anchor: 'madrid' } }, MAP)).toMatchObject({ x: 0.25, y: 0.75, anchor: { id: 'madrid' } });
    expect(labelPlace({ at: { x: 0.62, y: 0.48 } }, MAP)).toEqual({ x: 0.62, y: 0.48 });
    expect(labelPlace({ at: { anchor: 'nowhere' } }, MAP)).toBeUndefined();
  });

  it('sets each label at its anchor on the body as drawn, scaled with the picture', () => {
    // A column of 500 px sets the 400 px picture at its size; one of 200
    // px at half of it: the anchors follow.
    for (const width of [mm(200), mm(80)]) {
      const doc = build(figure('::label[Madrid]{at="madrid"}', '::label[Mar Negro]{at="62% 48%"}'), { page: { ...PAGE.page!, width } as never });
      const rb = figureBlock(doc).resourceBlock!;
      const [madrid, negro] = rb.labels!;
      close(madrid!.layout!.x, 0.25 * rb.bodyRect.width);
      close(madrid!.layout!.y, 0.75 * rb.bodyRect.height);
      close(negro!.layout!.x, 0.62 * rb.bodyRect.width);
      close(negro!.layout!.y, 0.48 * rb.bodyRect.height);
    }
  });
});

describe('label looks (#860)', () => {
  it('takes the label style the label names over its anchor’s, over the body text', () => {
    const resolved = resolveAllConfig(PAGE);
    expect(resolveLabelLook('mar', resolved)).toMatchObject({ styleId: 'mar', fontPx: 10, italic: true, uppercase: true, color: '#2b6ca3' });
    expect(resolveLabelLook(undefined, resolved)).toMatchObject({ fontPx: 20, italic: false, uppercase: false });
    expect(resolveLabelLook('nope', resolved).styleId).toBeUndefined();
    const doc = build(figure('::label[Madrid]{at="madrid" style="mar"}', '::label[Madrid]{at="madrid"}'));
    expect(labels(doc).map((l) => l.layout!.styleId)).toEqual(['mar', 'ciudad']);
    expect(labels(doc)[0]!.layout!.lines[0]!.text).toBe('MADRID');
  });

  it('borrows the type of a paragraph style', () => {
    const resolved = resolveAllConfig({
      ...PAGE,
      paragraphStyles: [{ id: 'leyenda', name: 'Leyenda', fontFamily: 'Open Sans', fontSize: px(12), italic: true } as never],
      labelStyles: [{ id: 'l', paragraphStyle: 'leyenda', fontWeight: 600 }],
    });
    expect(resolveLabelLook('l', resolved)).toMatchObject({ fontFamily: 'Open Sans', fontPx: 12, italic: true, weight: 600 });
  });

  it('switches off a borrowed paragraph style’s slant and capitals when it says normal / none (#955)', () => {
    const para = { id: 'leyenda', name: 'Leyenda', italic: true, textTransform: 'uppercase' } as never;
    const look = (labelStyle: Record<string, unknown>) =>
      resolveLabelLook('l', resolveAllConfig({ ...PAGE, paragraphStyles: [para], labelStyles: [{ id: 'l', paragraphStyle: 'leyenda', ...labelStyle }] }));
    // Not said: the paragraph style holds.
    expect(look({})).toMatchObject({ italic: true, uppercase: true });
    // Said: the label style wins, off or on.
    expect(look({ fontStyle: 'normal', textTransform: 'none' })).toMatchObject({ italic: false, uppercase: false });
    expect(look({ fontStyle: 'normal' })).toMatchObject({ italic: false, uppercase: true });
    expect(look({ textTransform: 'none' })).toMatchObject({ italic: true, uppercase: false });
    // Without a paragraph style, normal and none are the defaults.
    const bare = resolveLabelLook('l', resolveAllConfig({ ...PAGE, labelStyles: [{ id: 'l', fontStyle: 'normal', textTransform: 'none' }] }));
    expect(bare).toMatchObject({ italic: false, uppercase: false });
  });

  it('keeps normal / none in the stored styles only where they turn something off (#955)', () => {
    expect(stripLabelStylesDefaults([{ id: 'a', fontStyle: 'normal', textTransform: 'none' }])).toEqual([{ id: 'a' }]);
    expect(stripLabelStylesDefaults([{ id: 'b', paragraphStyle: 'p', fontStyle: 'normal', textTransform: 'none' }]))
      .toEqual([{ id: 'b', paragraphStyle: 'p', fontStyle: 'normal', textTransform: 'none' }]);
  });

  it('stores overlap: allow and drops the default check (#977)', () => {
    expect(stripLabelStylesDefaults([{ id: 'a', overlap: 'check' }, { id: 'b', overlap: 'allow' }])).toEqual([{ id: 'a' }, { id: 'b', overlap: 'allow' }]);
  });

  it('carries the halo, the plate and its padding', () => {
    const layout = labels(build(figure('::label[Madrid]{at="madrid"}')))[0]!.layout!;
    expect(layout.halo).toEqual({ color: '#ffffff', widthPx: 1 });
    expect(layout.background!.color).toBe('#ffeecc');
    expect(layout.background!.rect).toEqual({ x: layout.box.x - 2, y: layout.box.y - 2, width: layout.box.width + 4, height: layout.box.height + 4 });
  });
});

describe('fitting a label (#860)', () => {
  it('wraps within the anchor’s width, then sets a word too wide for it smaller', () => {
    // 0.1 × 400 px = 40 px; "ATLÁNTICO" is 45 px at 10 px: set at 0.888.
    const layout = labels(build(figure('::label[Océano Atlántico]{at="atlantico"}')))[0]!.layout!;
    expect(layout.lines.map((l) => l.text)).toEqual(['OCÉANO', 'ATLÁNTICO']);
    expect(layout.scale).toBeGreaterThan(0.85);
    expect(layout.scale).toBeLessThan(0.9);
    expect(layout.box.width).toBeLessThanOrEqual(40 + 1e-6);
    expect(layout.overflow).toBeUndefined();
  });

  it('stops at minScale and says so', () => {
    // 0.05 × 400 = 20 px for "Gibraltar" (45 px): 0.5 is not enough.
    const layout = labels(build(figure('::label[Gibraltar]{at="estrecho"}')))[0]!.layout!;
    expect(layout.scale).toBe(0.5);
    expect(layout.overflow).toBe(true);
  });

  it('keeps a multi-word name in one label whatever its order in the language', () => {
    for (const text of ['OCÉANO ATLÁNTICO', 'ATLANTIC OCEAN']) {
      const layout = labels(build(figure(`::label[${text}]{at="atlantico"}`)))[0]!.layout!;
      expect(layout.lines.map((l) => l.text).join(' ')).toBe(text);
    }
  });

  it('honours a forced break and the anchor’s alignment', () => {
    const layout = labels(build(figure('::label[Ma\\\\ drid]{at="madrid"}')))[0]!.layout!;
    expect(layout.lines.map((l) => l.text)).toEqual(['Ma', 'drid']);
    // `start`, `bottom`: the box’s left edge and foot at the point.
    expect(layout.box.x).toBe(0);
    close(layout.box.y + layout.box.height, 0);
    for (const line of layout.lines) expect(line.bbox.x).toBe(0);
  });
});

describe('turned and right-to-left labels (#860)', () => {
  it('turns a label about its anchor point', () => {
    const doc = build(figure('::label[Rin]{at="rio"}'));
    const block = figureBlock(doc);
    const label = labels(doc)[0]!;
    const layout = label.layout!;
    expect(layout.rotate).toBe(90);
    const m = figureLabelMatrix(layout, 10, 20);
    [0, 1, -1, 0, 10 + layout.x, 20 + layout.y].forEach((v, i) => close(m[i]!, v));
    // The stamped rect is the upright box of the turned label: as tall as
    // the label is wide.
    const bx = block.bbox.x + block.resourceBlock!.bodyRect.x;
    const by = block.bbox.y + block.resourceBlock!.bodyRect.y;
    expect(label.rect).toEqual(figureLabelBounds(layout, bx, by));
    close(label.rect!.height, layout.box.width);
    close(label.rect!.width, layout.box.height);
  });

  it('sets an Arabic label right to left: its start is its right edge', () => {
    const layout = labels(build(figure('::label[مدريد]{at="madrid"}')))[0]!.layout!;
    expect(layout.direction).toBe('rtl');
    close(layout.box.x + layout.box.width, 0);
  });

  it('sets a Chinese or Japanese label in its own words', () => {
    const layout = labels(build(figure('::label[大西洋]{at="rio"}')))[0]!.layout!;
    expect(layout.lines.map((l) => l.text).join('')).toBe('大西洋');
    expect(layout.direction).toBeUndefined();
  });

  it('reflects a label about the body on a right-to-left page, so the page’s mirror puts it back', () => {
    const ltr = labels(build(figure('::label[Madrid]{at="madrid"}')))[0]!.layout!;
    const doc = build(figure('::label[Madrid]{at="madrid"}'), { direction: 'rtl', locale: 'ar' } as PostextConfig);
    const rb = figureBlock(doc).resourceBlock!;
    const layout = rb.labels![0]!.layout!;
    close(layout.x, rb.bodyRect.width - ltr.x);
    close(layout.box.x, -(ltr.box.x + ltr.box.width));
  });
});

describe('labels in the source map (#860)', () => {
  it('answers a point on a label’s glyph with that character of the Markdown', () => {
    const md = figure('::label[Madrid]{at="madrid"}');
    const doc = build(md);
    const label = labels(doc)[0]!;
    const r = label.rect!;
    // The first glyph sits at the left of the box, past its padding.
    const hit = sourceAt(doc, 0, r.x + 2 + 2, r.y + r.height / 2);
    const text = hit.find((e) => e.level === 'text')!;
    expect(text.source).toMatchObject({ kind: 'markdown' });
    expect(md.slice((text.source as { start: number }).start, (text.source as { end: number }).end)).toBe('M');
    const el = hit.find((e) => e.level === 'label')!;
    expect(el.source).toEqual({ kind: 'resource', resourceId: 'mapa', anchor: 'madrid' });
    const last = sourceAt(doc, 0, r.x + r.width - 4, r.y + r.height / 2).find((e) => e.level === 'text')!;
    expect(md.slice((last.source as { start: number }).start, (last.source as { end: number }).end)).toBe('d');
  });

  it('stamps the rect of a label in a composed page’s frame, and answers it through the frame’s turn', () => {
    const md = ['::::page{template="t"}', ':::figure{resource="mapa" slot="map"}', '::label[Madrid]{at="madrid"}', ':::', '::::', ''].join('\n');
    const doc = build(md, { pageTemplates: [{ id: 't', frames: [{ name: 'map', x: mm(30), y: mm(40), width: mm(120), height: mm(120), rotate: 30 } as never] }] });
    const page = doc.pages[0]!;
    const frame = page.composed!.frames.find((f) => f.name === 'map')!;
    const label = labels(doc)[0]!;
    expect(label.id).toBe('cp0:map:label:madrid');
    const r = label.rect!;
    const m = frameMatrix(frame)!;
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;
    const hit = sourceAt(doc, 0, m[0] * cx + m[2] * cy + m[4], m[1] * cx + m[3] * cy + m[5]);
    expect(hit.find((e) => e.level === 'label')?.id).toBe('cp0:map:label:madrid');
  });

  it('leaves a label it does not draw without a rect', () => {
    const doc = build(figure('::label[Nowhere]{at="nowhere"}', '::label[Madrid]{at="madrid"}'));
    expect(labels(doc).map((l) => [!!l.layout, !!l.rect])).toEqual([[false, false], [true, true]]);
  });
});

describe('labels on continued pages and scaled frames (#860 with #858, #859)', () => {
  const para = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.';
  const frameOf = (overrides: Record<string, unknown>) => ({ name: 'texto', placement: { anchor: { to: 'page', edge: 'top-left' }, offset: { x: mm(20), y: mm(20) } }, width: mm(120), ...overrides });
  const fenced = (body: string) => ['::::page{template="t"}', ':::frame{slot="texto"}', body, ':::', '::::', ''].join('\n');
  const labelled = ':::figure{resource="mapa"}\n::label[Madrid]{at="madrid"}\n::label[Mar Negro]{at="62% 48%"}\n:::';

  it('draws and answers the labels of a figure its frame continues on an added page', () => {
    const body = [...Array.from({ length: 40 }, () => para), labelled].join('\n\n');
    const doc = build(fenced(body), { pageTemplates: [{ id: 't', frames: [frameOf({ height: mm(60), overflow: { continueIn: 'next-page' } })] }] as never });
    const block = figureBlock(doc);
    expect(block.pageIndex).toBeGreaterThan(0);
    const [madrid, negro] = block.resourceBlock!.labels!;
    for (const l of [madrid!, negro!]) {
      expect(l.layout).toBeDefined();
      const r = l.rect!;
      const hit = sourceAt(doc, block.pageIndex, r.x + r.width / 2, r.y + r.height / 2);
      expect(hit.find((e) => e.level === 'label')?.content).toEqual({ start: l.sourceStart, end: l.sourceEnd });
    }
  });

  it('sets the labels on the picture the ladder made smaller, at their anchors', () => {
    const body = [para, para, labelled].join('\n\n');
    const doc = build(fenced(body), { pageTemplates: [{ id: 't', frames: [frameOf({ height: mm(28), fit: { shrinkText: false, scaleImages: true, imageMinScale: 0.5 } })] }] as never });
    const rb = figureBlock(doc).resourceBlock!;
    const madrid = rb.labels![0]!;
    close(madrid.layout!.x, 0.25 * rb.bodyRect.width);
    close(madrid.layout!.y, 0.75 * rb.bodyRect.height);
    const frame = doc.pages[0]!.composed!.frames.find((f) => f.name === 'texto')!;
    const log = JSON.stringify(doc.pages[0]!.composed!.log);
    // The ladder did scale the pictures (or the test proves nothing).
    expect(log).toContain('imageScaled');
    expect(frame).toBeDefined();
    const r = madrid.rect!;
    const hit = sourceAt(doc, 0, r.x + r.width / 2, r.y + r.height / 2);
    expect(hit.find((e) => e.level === 'label')?.id).toBe('cp0:texto:label:madrid');
  });
});

describe('label warnings (#860)', () => {
  const md = figure('::label[Mar]{at="mediterraneo"}', '::label[Madrid]{at="madrid"}', '::label[Océano]{at="atlantico"}');
  const warnings = (doc: VDTDocument) => (doc.contentWarnings ?? []).filter((w) => w.kind === 'labelAnchorUnknown' || w.kind === 'anchorUnlabelled');

  it('reports a label at an anchor its resource lacks, at the label’s text, on its page', () => {
    const doc = build(md, { locale: 'es' } as PostextConfig);
    const w = warnings(doc).find((x) => x.kind === 'labelAnchorUnknown') as Extract<ContentWarning, { kind: 'labelAnchorUnknown' }>;
    expect(w).toMatchObject({ resourceId: 'mapa', anchor: 'mediterraneo', locale: 'es', pageIndex: 0 });
    expect(w.known).toContain('madrid');
    expect(md.slice(w.sourceStart, w.sourceEnd)).toBe('Mar');
    expect(formatWarning(w)).toContain('"mediterraneo"');
  });

  it('notes an anchor with a label style that no label of the figure stands at', () => {
    const doc = build(md);
    const notes = warnings(doc).filter((x) => x.kind === 'anchorUnlabelled') as Extract<ContentWarning, { kind: 'anchorUnlabelled' }>[];
    // `negro` and `estrecho` have styles and no label; `rio` and `speaker`
    // have no style (a comic speaker's anchor is no map's word).
    expect(notes.map((n) => n.anchor).sort()).toEqual(['estrecho', 'negro']);
    expect(notes[0]!.pageIndex).toBe(0);
    expect(md.slice(notes[0]!.sourceStart, notes[0]!.sourceEnd)).toContain(':::figure');
    expect(formatWarning(notes[0]!)).toContain('::label');
  });

  it('says nothing of a resource set with ::resource', () => {
    const doc = build('::resource{id="mapa"}\n');
    expect(warnings(doc)).toEqual([]);
  });
});

type Op = { op: string; args: unknown[] };

/** A 2D context recording the calls that matter here. */
function recordingCanvas(): { canvas: HTMLCanvasElement; ops: Op[] } {
  const ops: Op[] = [];
  const recorded = new Set(['save', 'restore', 'transform', 'fillRect', 'fillText', 'strokeText']);
  const ctx: Record<string | symbol, unknown> = new Proxy({}, {
    get(target: Record<string | symbol, unknown>, key) {
      if (key === 'measureText') return (s: string) => ({ width: s.length * 5 });
      if (typeof key === 'string' && recorded.has(key)) return (...args: unknown[]) => { ops.push({ op: key, args: [...args, target.fillStyle, target.strokeStyle] }); };
      if (key in target) return target[key];
      return () => undefined;
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  return { canvas, ops };
}

describe('labels on the canvas and in the HTML (#860)', () => {
  it('paints each label through its matrix: the plate, the halo stroked, then the text', () => {
    const doc = build(figure('::label[Madrid]{at="madrid"}'));
    const block = figureBlock(doc);
    const layout = labels(doc)[0]!.layout!;
    const { canvas, ops } = recordingCanvas();
    renderPageToCanvas(doc.pages[0]!, doc, canvas);
    const m = figureLabelMatrix(layout, block.bbox.x + block.resourceBlock!.bodyRect.x, block.bbox.y + block.resourceBlock!.bodyRect.y);
    const turn = ops.findIndex((o) => o.op === 'transform' && (o.args.slice(0, 6) as number[]).every((v, i) => Math.abs(v - m[i]!) < 1e-9));
    expect(turn).toBeGreaterThan(-1);
    const plate = ops.findIndex((o, i) => i > turn && o.op === 'fillRect' && o.args[4] === '#ffeecc');
    const halo = ops.findIndex((o) => o.op === 'strokeText' && o.args[0] === 'Madrid');
    const text = ops.findIndex((o) => o.op === 'fillText' && o.args[0] === 'Madrid');
    expect(plate).toBeGreaterThan(turn);
    expect(halo).toBeGreaterThan(plate);
    expect(text).toBeGreaterThan(halo);
    expect(ops[halo]!.args[4]).toBe('#ffffff');
    expect(ops.filter((o) => o.op === 'fillText' && o.args[0] === 'Madrid')).toHaveLength(1);
  });

  it('writes the labels after the picture as text, and keeps only the undrawn ones in its alt', () => {
    const doc = build(figure('::label[Nowhere]{at="nowhere"}', '::label[**Madrid**]{at="madrid"}', '::label[Rin]{at="rio"}'));
    const html = renderToHtmlIndexed(doc, { resourceImageUrl: (id) => `https://example.org/${id}` }).pages[0]!.innerHtml;
    expect(html).toContain('alt="A map of Europe (Nowhere)"');
    const img = html.indexOf('<img');
    const madrid = html.indexOf('>Madrid<');
    const rin = html.indexOf('>Rin<');
    expect(img).toBeGreaterThan(-1);
    expect(madrid).toBeGreaterThan(img);
    expect(rin).toBeGreaterThan(madrid);
    expect(html).toContain('class="pt-figure-label"');
    expect(html).toContain('-webkit-text-stroke:2px #ffffff');
    // The turned label: a quarter-turn matrix.
    expect(html).toMatch(/transform:matrix\(0,1,-1,0,/);
  });
});
