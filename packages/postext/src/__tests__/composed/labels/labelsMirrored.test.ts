import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { renderPageToCanvas } from '../../../index.js';
import { renderToHtmlIndexed } from '../../../html-backend/html-backend.js';
import { labelLayoutOnSheet } from '../../../composed/labels.js';
import type { PostextConfig, Resource, VDTDocument } from '../../../index.js';

// #955: a vertical label on the mirrored page of a right-to-left book.

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

const mm = (value: number) => ({ value, unit: 'mm' as const });
const px = (value: number) => ({ value, unit: 'px' as const });
const PAGE: PostextConfig = {
  page: { width: mm(200), height: mm(260), margins: { top: mm(20), bottom: mm(20), left: mm(20), right: mm(20) } } as never,
  bodyText: { fontSize: px(20) } as never,
  labelStyles: [{ id: 'small', fontSize: px(10) }],
};
const MAP: Resource = {
  id: 'tate', typeId: 'figure', kind: 'bitmap', altText: 'A map', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: 'mapa.png', format: 'png', width: 400, height: 300 },
  anchors: [
    { id: 'v', x: 0.3, y: 0.3, writingMode: 'vertical-rl', style: 'small' },
    { id: 'h', x: 0.3, y: 0.7, style: 'small' },
  ],
};
const fig = (...l: string[]) => [':::figure{resource="tate"}', ...l, ':::', ''].join('\n');
const build = (markdown: string, config: PostextConfig = {}): VDTDocument =>
  buildDocument({ markdown, resources: [MAP] }, { ...PAGE, ...config }, createMeasurementCache());

type M = [number, number, number, number, number, number];
const mul = (a: M, b: M): M => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
];

/** Paint a page; every `fillText` is recorded with the sheet position of
 *  its origin and the linear part of the matrix it was drawn under. */
function paint(doc: VDTDocument): { text: string; x: number; y: number; cx: number; m: M }[] {
  const shown: { text: string; x: number; y: number; cx: number; m: M }[] = [];
  let ctm: M = [1, 0, 0, 1, 0, 0];
  const stack: M[] = [];
  const target: Record<string | symbol, unknown> = {};
  const ctx: Record<string | symbol, unknown> = new Proxy(target, {
    get(t, key) {
      switch (key) {
        case 'measureText': return (s: string) => ({ width: [...s].length * 5 });
        case 'save': return () => { stack.push([...ctm] as M); };
        case 'restore': return () => { ctm = stack.pop() ?? ctm; };
        case 'translate': return (x: number, y: number) => { ctm = mul(ctm, [1, 0, 0, 1, x, y]); };
        case 'scale': return (x: number, y: number) => { ctm = mul(ctm, [x, 0, 0, y, 0, 0]); };
        case 'rotate': return (a: number) => { ctm = mul(ctm, [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]); };
        case 'transform': return (a: number, b: number, c: number, d: number, e: number, f: number) => { ctm = mul(ctm, [a, b, c, d, e, f]); };
        case 'setTransform': return (a: number, b: number, c: number, d: number, e: number, f: number) => { ctm = [a, b, c, d, e, f]; };
        case 'resetTransform': return () => { ctm = [1, 0, 0, 1, 0, 0]; };
        case 'fillText': {
          if (typeof t.fillText === 'function') return t.fillText;
          return (text: string, x: number, y: number) => {
            const mid = x + ([...text].length * 5) / 2;
            shown.push({ text, x: ctm[0] * x + ctm[2] * y + ctm[4], y: ctm[1] * x + ctm[3] * y + ctm[5], cx: ctm[0] * mid + ctm[2] * y + ctm[4], m: [...ctm] as M });
          };
        }
        default:
          if (key in t) return t[key];
          return () => undefined;
      }
    },
    set(t, key, value) { t[key] = value; return true; },
  });
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  renderPageToCanvas(doc.pages[0]!, doc, canvas);
  return shown;
}

describe('a vertical label on a mirrored page (#955)', () => {
  const md = fig('::label[東京都]{at="v"}', '::label[Oslo]{at="h"}');

  it('reads down the column, upright, on a left-to-right page', () => {
    const cells = paint(build(md)).filter((c) => c.text !== '' && '東京都'.includes(c.text));
    expect(cells.map((c) => c.text)).toEqual(['東', '京', '都']);
    expect(cells[0]!.y).toBeLessThan(cells[1]!.y);
    expect(cells[1]!.y).toBeLessThan(cells[2]!.y);
  });

  it('reads down the column, upright and unmirrored, on the page of a right-to-left book', () => {
    const ltr = paint(build(md)).filter((c) => c.text !== '' && '東京都'.includes(c.text));
    const rtl = paint(build(md, { direction: 'rtl', locale: 'ar' } as PostextConfig)).filter((c) => c.text !== '' && '東京都'.includes(c.text));
    expect(rtl.map((c) => c.text)).toEqual(['東', '京', '都']);
    expect(rtl[0]!.y).toBeLessThan(rtl[1]!.y);
    expect(rtl[1]!.y).toBeLessThan(rtl[2]!.y);
    // Every cell stands upright, not reflected: a positive determinant and
    // the axes of the sheet.
    for (const c of rtl) {
      const [a, b, cc, d] = c.m;
      expect(a * d - b * cc).toBeGreaterThan(0);
      expect(Math.abs(b)).toBeLessThan(1e-9);
      expect(Math.abs(cc)).toBeLessThan(1e-9);
    }
    // The column stands at the same place of the picture as on the other
    // page: its offset from the horizontal label at the same anchor x.
    const oslo = (cells: { text: string; cx: number }[]) => cells.find((c) => c.text === 'Oslo')!.cx;
    const rtlAll = paint(build(md, { direction: 'rtl', locale: 'ar' } as PostextConfig));
    const ltrAll = paint(build(md));
    const offset = (all: { text: string; cx: number }[]) => all.find((c) => c.text === '東')!.cx - oslo(all);
    expect(offset(rtlAll)).toBeCloseTo(offset(ltrAll), 6);
    // One column, as on the other page.
    expect(Math.abs(rtl[0]!.x - rtl[2]!.x)).toBeLessThan(1e-6);
    expect(Math.abs((rtl[2]!.y - rtl[0]!.y) - (ltr[2]!.y - ltr[0]!.y))).toBeLessThan(1e-6);
  });
});

describe('the same label in the HTML (#955)', () => {
  const md = fig('::label[東京都]{at="v"}', '::label[Oslo]{at="h"}');
  const html = (config: PostextConfig = {}) => renderToHtmlIndexed(build(md, config), { resourceImageUrl: (id) => `https://example.org/${id}` }).pages[0]!.innerHtml;

  it('stands in a box that reflects the mirrored flow back, on the page of a right-to-left book only', () => {
    const rtl = html({ direction: 'rtl', locale: 'ar' } as PostextConfig);
    // Only the vertical label is wrapped; the horizontal one is turned back
    // run by run like any other text of the flow.
    expect(rtl.match(/class="pt-unmirrored"/g)).toHaveLength(1);
    expect(rtl).toMatch(/class="pt-unmirrored"[^>]*transform:matrix\(-1,0,0,1,[\d.]+,0\)[^>]*><div class="pt-figure-label"[^>]*transform:matrix\(0,1,-1,0,/);
    expect(rtl).toContain('.pt-flow-mirrored .pt-unmirrored');
    expect(html()).not.toContain('pt-unmirrored');
  });
});

describe('a horizontal label of a mirrored page, back on the sheet (#969)', () => {
  const labelsOf = (doc: VDTDocument) => {
    const block = [...doc.blocks, ...doc.pages.flatMap((p) => p.floats ?? [])].find((b) => b.resourceBlock?.resource.id === 'tate')!;
    return { rb: block.resourceBlock!, layouts: block.resourceBlock!.labels!.map((l) => l.layout!) };
  };
  const text = [
    '::label[المحيط الأطلسي]{at="h"}',
    '::label[Madrid المحيط 42]{at="h"}',
    '::label[Madrid Toledo]{at="h"}',
  ];

  it('gives the layout the same label has on a left-to-right page: point, boxes and the order of the words', () => {
    const ltr = labelsOf(build(fig(...text)));
    const rtl = labelsOf(build(fig(...text), { locale: 'ar' }));
    expect(rtl.layouts).toHaveLength(3);
    rtl.layouts.forEach((layout, i) => {
      const sheet = labelLayoutOnSheet(layout, rtl.rb.bodyRect.width);
      const want = ltr.layouts[i]!;
      expect(sheet.x).toBeCloseTo(want.x, 6);
      expect(sheet.y).toBeCloseTo(want.y, 6);
      expect(sheet.box.x).toBeCloseTo(want.box.x, 6);
      expect(sheet.lines.map((l) => [Math.round(l.bbox.x * 1e6) / 1e6, l.order ?? null])).toEqual(want.lines.map((l) => [Math.round(l.bbox.x * 1e6) / 1e6, l.order ?? null]));
      expect(sheet.lines.map((l) => l.segments?.map((g) => g.text).join('|'))).toEqual(want.lines.map((l) => l.segments?.map((g) => g.text).join('|')));
    });
  });

  it('turns the rotation back too, and leaves a vertical label to unmirrorLabelLayout', () => {
    const rotated: Resource = { ...MAP, anchors: [{ id: 'h', x: 0.3, y: 0.7, rotate: 30, style: 'small' }] };
    const doc = buildDocument({ markdown: fig('::label[Madrid]{at="h"}'), resources: [rotated] }, { ...PAGE, locale: 'ar' }, createMeasurementCache());
    const { rb, layouts } = labelsOf(doc);
    expect(layouts[0]!.rotate).toBe(-30);
    expect(labelLayoutOnSheet(layouts[0]!, rb.bodyRect.width).rotate).toBe(30);
  });
});
