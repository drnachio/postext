import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import type { FrameConfig, PageTemplate } from '../../../composed/types.js';
import type { PostextConfig, VDTDocument, VDTFrame } from '../../../index.js';

// #982: a frame of `width: 'auto'` is as wide as its longest line plus its
// padding, between `minWidth` and `maxWidth`, anchored at its start edge.

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
const DPI = 300;
const MM = DPI / 25.4;
const PAD = 5;

const CONFIG: PostextConfig = {
  page: { width: mm(200), height: mm(260), dpi: DPI, margins: { top: mm(20), bottom: mm(20), left: mm(20), right: mm(20) } } as never,
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] } as never,
  bodyText: { fontSize: pt(11), lineHeight: pt(16), firstLineIndent: pt(0) } as never,
  calloutStyles: [
    { id: 'tab', backgroundEnabled: true, background: { hex: '#ffffff', model: 'hex' }, padding: { top: mm(2), right: mm(PAD), bottom: mm(2), left: mm(PAD) }, body: { textAlign: 'center' } },
  ] as never,
};
const at: FrameConfig['placement'] = { anchor: { to: 'container', edge: 'top-left' } };
const titulo = (extra: Partial<FrameConfig> = {}): FrameConfig => ({ name: 'titulo', style: 'tab', width: 'auto', placement: at, ...extra });
const num: FrameConfig = { name: 'num', width: mm(10), height: mm(10), placement: { anchor: { to: '#titulo', edge: 'right-of' }, offset: { x: mm(3) } } };
const page = (title: string, frames: FrameConfig[], extra: Record<string, unknown> = {}): VDTDocument =>
  buildDocument(
    { markdown: `::::page{template="ficha"}\n\n:::frame{slot="titulo"}\n\n${title}\n\n:::\n\n::::` },
    { ...CONFIG, ...extra, pageTemplates: [{ id: 'ficha', frames } as PageTemplate] },
    createMeasurementCache(),
  );
const frame = (doc: VDTDocument, name: string): VDTFrame => doc.pages.find((p) => p.composed)!.composed!.frames.find((f) => f.name === name)!;
const wide = (n: number) => n * 7 + 2 * PAD * MM;

describe("frame width: 'auto' (#982)", () => {
  it('is the width of the longest line plus the padding, whatever the alignment', () => {
    for (const title of ['Money', 'Caring for the environment']) {
      const f = frame(page(title, [titulo()]), 'titulo');
      expect(f.rect.width).toBeCloseTo(wide(title.length), 0);
      expect(f.rect.x).toBeCloseTo(20 * MM, 3);
      expect(f.overflowPx).toBeLessThan(0.5);
    }
  });

  it('keeps a one-line title on one line and the tab at one line of height', () => {
    const doc = page('Caring for the environment', [titulo()]);
    const f = frame(doc, 'titulo');
    const lines = doc.pages.find((p) => p.composed)!.floats!.filter((b) => f.blockIds.includes(b.id) && b.type !== 'callout').flatMap((b) => b.lines);
    expect(lines).toHaveLength(1);
  });

  it('takes the longest of several paragraphs', () => {
    const doc = buildDocument(
      { markdown: '::::page{template="ficha"}\n\n:::frame{slot="titulo"}\n\nShort\n\nA much longer second line\n\n:::\n\n::::' },
      { ...CONFIG, pageTemplates: [{ id: 'ficha', frames: [titulo()] } as PageTemplate] },
      createMeasurementCache(),
    );
    expect(frame(doc, 'titulo').rect.width).toBeCloseTo(wide('A much longer second line'.length), 0);
  });

  it('stops at maxWidth, where the text wraps, and starts at minWidth', () => {
    const long = frame(page('Caring for the environment and everything in it, with the whole of the long title running on past the tab', [titulo({ maxWidth: mm(60) })]), 'titulo');
    expect(long.rect.width).toBeCloseTo(60 * MM, 2);
    const short = frame(page('Money', [titulo({ minWidth: mm(50) })]), 'titulo');
    expect(short.rect.width).toBeCloseTo(50 * MM, 2);
  });

  it('never runs past the room the anchor leaves', () => {
    const doc = page('x'.repeat(200), [titulo({ placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { x: mm(100) } } })]);
    const f = frame(doc, 'titulo');
    expect(f.rect.x + f.rect.width).toBeLessThanOrEqual((200 - 20) * MM + 0.5);
  });

  it('what is anchored to it follows its width', () => {
    const a = frame(page('Money', [titulo(), num]), 'num');
    const b = frame(page('Caring for the environment', [titulo(), num]), 'num');
    expect(a.rect.x).toBeCloseTo(20 * MM + wide('Money'.length) + 3 * MM, 0);
    expect(b.rect.x - a.rect.x).toBeCloseTo(wide('Caring for the environment'.length) - wide('Money'.length), 0);
  });

  it("is anchored at its end edge when the anchor says so", () => {
    const f = frame(page('Money', [titulo({ placement: { anchor: { to: 'container', edge: 'top-right' } } })]), 'titulo');
    expect(f.rect.x + f.rect.width).toBeCloseTo((200 - 20) * MM, 2);
    expect(f.rect.width).toBeCloseTo(wide('Money'.length), 0);
  });

  it('fixed and fill widths are what they were', () => {
    expect(frame(page('Money', [titulo({ width: mm(80) })]), 'titulo').rect.width).toBeCloseTo(80 * MM, 3);
    expect(frame(page('Money', [titulo({ width: 'fill' })]), 'titulo').rect.width).toBeCloseTo(160 * MM, 3);
  });
});
