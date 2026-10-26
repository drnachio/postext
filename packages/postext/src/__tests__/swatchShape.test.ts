import { describe, it, expect } from 'vitest';
import { buildDocument, renderPageToCanvas, renderToHtml } from '../index.js';
import { createMeasurementCache } from '../measure/index.js';
import { parseInlineFormatting, extractInlineSwatches, injectSwatchSpans, swatchShapeFromAttrs } from '../parse/inlineFormatting.js';
import { swatchGeometry } from '../paint/swatchShape.js';
import type { PostextConfig, VDTDocument, VDTLineSegment } from '../index.js';

// #1104: a legend's swatches set at a size of their own, with an outline
// and rounded corners, and room after them for their label.

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const m = /(\d*\.?\d+)px/.exec(this.font);
    return { width: s.length * (m ? Number(m[1]) : 16) * 0.5 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
// At 72 dpi a point is a pixel; the text is 10 px.
const config: PostextConfig = {
  page: { width: pt(300), height: pt(400), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  bodyText: { fontSize: pt(10), lineHeight: pt(14), textAlign: 'left', hyphenation: { enabled: false } },
  colorPalette: [{ id: 'edge', name: 'Edge', value: { hex: '#334455', model: 'hex' } }],
};
const swatches = (doc: VDTDocument): VDTLineSegment[] =>
  doc.blocks.flatMap((b) => b.lines.flatMap((l) => l.segments ?? [])).filter((s) => s.kind === 'swatch');
const build = (markdown: string, cache = createMeasurementCache()) => buildDocument({ markdown }, config, cache);

describe(':swatch size, border, radius and gap (#1104)', () => {
  it('reads the attributes', () => {
    expect(swatchShapeFromAttrs({ size: '12pt', border: '1pt edge', radius: '0.2em', gap: '4' })).toEqual({
      size: pt(12), borderWidth: pt(1), borderColor: 'edge', radius: { value: 0.2, unit: 'em' }, gap: pt(4),
    });
    expect(swatchShapeFromAttrs({ border: 'none' })).toEqual({ borderWidth: pt(0) });
    // The single attributes win over the shorthand; junk lengths are left out.
    expect(swatchShapeFromAttrs({ border: '2pt #000', borderWidth: '0.5pt', borderColor: '#f00', size: 'big' })).toEqual({ borderWidth: pt(0.5), borderColor: '#f00' });
    expect(swatchShapeFromAttrs({})).toBeUndefined();
    const { cleaned, swatches: metas } = extractInlineSwatches('A :swatch{color="#f00" size=8pt} b', 0);
    const spans = injectSwatchSpans(parseInlineFormatting(cleaned), metas);
    expect(spans.find((s) => s.swatch)?.swatch).toEqual({ color: '#f00', shape: { size: pt(8) } });
  });

  it('keeps a plain swatch as it was', () => {
    const [seg] = swatches(build('Key :swatch{color="#ff0000"} red.'));
    expect(seg!.swatch).toEqual({ color: '#ff0000' });
    // 0.75 em of 10 px.
    expect(seg!.width).toBeCloseTo(7.5, 6);
  });

  it('measures the size and the gap, and carries the outline and corners', () => {
    const [seg] = swatches(build('Key :swatch{color="#ff0000" size=12pt border="1.5pt edge" radius=3pt gap=4pt} red.'));
    expect(seg!.width).toBeCloseTo(16, 6);
    expect(seg!.swatch).toEqual({ color: '#ff0000', side: 12, borderWidth: 1.5, borderColor: '#334455', radius: 3 });
    // Em lengths are read against the text; the radius is clamped to half the side.
    const [em] = swatches(build('Key :swatch{color="#00ff00" size=1em radius=2em border=none} green.'));
    expect(em!.width).toBeCloseTo(10, 6);
    expect(em!.swatch).toEqual({ color: '#00ff00', side: 10, borderWidth: 0, radius: 5 });
  });

  it('places the square at the start of its advance, at the end right to left', () => {
    const swatch = { side: 12 };
    expect(swatchGeometry(swatch, 100, 50, 16, false)).toMatchObject({ x: 100, y: 38, side: 12 });
    expect(swatchGeometry(swatch, 100, 50, 16, true)).toMatchObject({ x: 104, y: 38, side: 12 });
  });

  it('paints the same square in HTML and on the canvas', () => {
    const doc = build('Key :swatch{color="#ff0000" size=12pt border="1.5pt edge" radius=3pt gap=4pt} red.');
    const html = renderToHtml(doc);
    expect(html).toMatch(/width:12\.000px;height:12\.000px;box-sizing:border-box;border:1\.50px solid #334455;border-radius:3\.000px;background:#ff0000;/);
    const calls: string[] = [];
    const state: Record<string | symbol, unknown> = {};
    const ctx = new Proxy(state, {
      get(target, key) {
        if (key === 'arcTo' || key === 'fill' || key === 'stroke' || key === 'fillRect' || key === 'strokeRect') return () => { calls.push(`${String(key)}:${String(key === 'stroke' || key === 'strokeRect' ? target.strokeStyle : target.fillStyle)}`); };
        if (key === 'measureText') return (s: string) => ({ width: s.length * 5 });
        if (key in target) return target[key];
        return () => undefined;
      },
      set(target, key, value) {
        target[key] = value;
        return true;
      },
    });
    const canvas = { getContext: () => ctx, width: 300, height: 400 } as unknown as HTMLCanvasElement;
    renderPageToCanvas(doc.pages[0]!, doc, canvas);
    expect(calls).toContain('fill:#ff0000');
    expect(calls).toContain('stroke:#334455');
    expect(calls.filter((c) => c.startsWith('arcTo')).length).toBe(8);
    expect(calls).not.toContain('strokeRect:#334455');
  });

  it('keeps swatches that differ only in their shape apart in the measure cache', () => {
    const cache = createMeasurementCache();
    const small = swatches(build('Key :swatch{color="#ff0000" size=6pt} red.', cache));
    const large = swatches(build('Key :swatch{color="#ff0000" size=14pt} red.', cache));
    expect(small[0]!.width).toBeCloseTo(6, 6);
    expect(large[0]!.width).toBeCloseTo(14, 6);
  });
});
