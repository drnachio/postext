import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { renderToHtmlIndexed } from '../../../html-backend/html-backend.js';
import { renderPageToCanvas } from '../../../index.js';
import type { FrameConfig, PageTemplate } from '../../../composed/types.js';
import type { PostextConfig, VDTBlock, VDTDesignBlock, VDTDesignBoxBlock, VDTDesignTextBlock, VDTDocument, VDTFrame, VDTPage } from '../../../index.js';

// #1084: a `:::frame` fence with nothing in it, for a frame with a callout
// style, draws the style's box (fill, border, the tab with its `label`) at
// the frame's size: a labelled inset over a map, a ruled answer box.

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
const hex = (h: string) => ({ hex: h, model: 'hex' as const });
const CONFIG: PostextConfig = {
  page: { width: mm(200), height: mm(260), dpi: 300, margins: { top: mm(20), bottom: mm(20), left: mm(20), right: mm(20) } } as never,
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] } as never,
  bodyText: { fontSize: pt(11), lineHeight: pt(16), firstLineIndent: pt(0) } as never,
  calloutStyles: [{
    id: 'caja', backgroundEnabled: true, background: hex('#ffeb99'),
    border: { enabled: true, color: hex('#222222') }, padding: { top: mm(3), right: mm(5), bottom: mm(3), left: mm(5) },
    label: { color: hex('#ffffff'), background: hex('#333333'), height: mm(6), paddingX: mm(3) },
  }] as never,
};
const at: FrameConfig['placement'] = { anchor: { to: 'container', edge: 'top-left' } };
const below: FrameConfig['placement'] = { anchor: { to: 'container', edge: 'top-left' }, offset: { x: mm(0), y: mm(120) } };
const caja = (extra: Partial<FrameConfig> = {}): FrameConfig => ({ name: 'caja', style: 'caja', placement: at, width: mm(100), minHeight: mm(30), ...extra });
const texto: FrameConfig = { name: 'texto', placement: below, width: mm(100) };
const build = (md: string, frames: FrameConfig[] = [caja(), texto]): VDTDocument =>
  buildDocument({ markdown: md }, { ...CONFIG, pageTemplates: [{ id: 'ficha', frames } as PageTemplate] }, createMeasurementCache());
const pageMd = (...lines: string[]): string => ['::::page{template="ficha"}', '', ...lines, '', ':::frame{slot="texto"}', 'Words of the page.', ':::', '', '::::'].join('\n');
const EMPTY = pageMd(':::frame{slot="caja" label="Tab"}', ':::');
const page = (doc: VDTDocument): VDTPage => doc.pages.find((p) => p.composed)!;
const frame = (doc: VDTDocument, name = 'caja'): VDTFrame => page(doc).composed!.frames.find((f) => f.name === name)!;
const box = (doc: VDTDocument, name = 'caja'): VDTBlock | undefined => page(doc).floats?.find((b) => b.id === frame(doc, name).blockIds[0]);
const overlay = (doc: VDTDocument): VDTDesignBlock[] => box(doc)?.designOverlay?.blocks ?? [];
const boxes = (doc: VDTDocument) => overlay(doc).filter((b): b is VDTDesignBoxBlock => b.kind === 'box');
const texts = (doc: VDTDocument) => overlay(doc).filter((b): b is VDTDesignTextBlock => b.kind === 'text');

describe('an empty frame with a style draws its box (#1084)', () => {
  it('the fill and border at the frame’s size, the tab with its label', () => {
    const doc = build(EMPTY);
    const f = frame(doc);
    expect(f.blockIds).toHaveLength(1);
    const [fill, tab] = boxes(doc);
    expect(fill!.box.backgroundColor).toBe('#ffeb99');
    expect(fill!.box.borderColor).toBe('#222222');
    expect(fill!.bbox).toEqual(f.rect);
    expect(tab!.box.backgroundColor).toBe('#333333');
    const label = texts(doc);
    expect(label.map((t) => t.lines[0]!.text)).toEqual(['Tab']);
    expect(label[0]!.color).toBe('#ffffff');
    // The tab keeps the label's source: a click on it reaches the fence.
    expect(EMPTY.slice(label[0]!.sourceStart!, label[0]!.sourceEnd!)).toBe('Tab');
    // The box has no lines and overflows nothing.
    expect(f.overflowPx).toBe(0);
    expect((doc.contentWarnings ?? []).filter((w) => w.kind === 'frameOverflow' || w.kind === 'slotEmpty')).toEqual([]);
  });

  it('the same box and tab as a frame with words would draw', () => {
    const full = build(pageMd(':::frame{slot="caja" label="Tab"}', 'Word.', ':::'));
    const empty = build(EMPTY);
    expect(frame(empty).rect).toEqual(frame(full).rect);
    expect(boxes(empty)).toEqual(boxes(full));
    expect(texts(empty).map((t) => t.bbox)).toEqual(texts(full).filter((t) => t.lines[0]!.text === 'Tab').map((t) => t.bbox));
  });

  it('a fence without a label draws the box alone', () => {
    const doc = build(pageMd(':::frame{slot="caja"}', ':::'));
    expect(boxes(doc).map((b) => b.box.backgroundColor)).toEqual(['#ffeb99']);
    expect(texts(doc)).toEqual([]);
  });

  it('as before: no fence leaves the frame empty (slotEmpty); a frame with no style draws nothing', () => {
    const none = build(pageMd());
    expect(frame(none).blockIds).toEqual([]);
    expect((none.contentWarnings ?? []).filter((w) => w.kind === 'slotEmpty').map((w) => (w as { frame: string }).frame)).toEqual(['caja']);
    const plain = build(EMPTY, [caja({ style: undefined }), texto]);
    expect(frame(plain).blockIds).toEqual([]);
  });

  it('on the canvas: the fill, the tab and its word are painted', () => {
    const doc = build(EMPTY);
    const fills: string[] = [];
    const words: string[] = [];
    const ctx = new Proxy({ font: '', fillStyle: '#000000' } as Record<string | symbol, unknown>, {
      get(target, key) {
        if (key === 'fillText') return (text: string) => words.push(text);
        if (key === 'fill' || key === 'fillRect') return () => fills.push(String(target.fillStyle));
        if (key === 'measureText') return (s: string) => ({ width: [...s].length * 7 });
        if (key in target) return target[key];
        return () => undefined;
      },
      set(target, key, value) {
        target[key] = value;
        return true;
      },
    });
    renderPageToCanvas(page(doc), doc, { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement);
    expect(fills).toContain('#ffeb99');
    expect(fills).toContain('#333333');
    expect(words).toContain('Tab');
  });

  it('in HTML: the frame holds the box and the tab', () => {
    const doc = build(EMPTY);
    const html = renderToHtmlIndexed(doc).pages[page(doc).index]!.innerHtml;
    const start = html.indexOf('data-frame-id="cp0:caja"');
    expect(start).toBeGreaterThan(-1);
    const next = html.indexOf('data-frame-id="cp0:texto"');
    const own = html.slice(start, next > start ? next : undefined);
    expect(own.toLowerCase()).toContain('#ffeb99');
    expect(own.toLowerCase()).toContain('#333333');
    expect(own).toContain('>Tab<');
  });
});
