import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/index.js';
import { createMeasurementCache } from '../../measure/index.js';
import { renderToHtmlIndexed } from '../../html-backend/html-backend.js';
import { renderHeaderFooterSlot } from '../../canvas-backend/headerFooter.js';
import { collectConfigWarnings } from '../../checks/configWarnings.js';
import { applyPaletteOverrides } from '../../design/layout.js';
import type { PostextConfig, VDTDesignBoxBlock, VDTDesignBoxStyle, VDTDesignSlot } from '../../index.js';

// #1059: decoration boxes with a radius per corner and a border per side,
// and how canvas and HTML paint box shapes.

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 6 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const hex = (h: string, paletteId?: string) => ({ hex: h, model: 'hex' as const, ...(paletteId ? { paletteId } : {}) });

const config = (style: Record<string, unknown>): PostextConfig => ({
  page: { width: pt(300), height: pt(300), dpi: 72, margins: { top: pt(40), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: {
    elements: [{
      kind: 'box', id: 'band',
      placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(100), height: pt(20) } },
      style: style as never,
    }],
  },
  footer: { elements: [] },
});
const headerBox = (style: Record<string, unknown>): VDTDesignBoxBlock => {
  const doc = buildDocument({ markdown: 'Body.' }, config(style), createMeasurementCache());
  return doc.pages[0]!.header!.blocks.find((b): b is VDTDesignBoxBlock => b.kind === 'box')!;
};

describe('decoration boxes (#1059)', () => {
  it('keeps a box with one radius and one border as it was', () => {
    const box = headerBox({ backgroundColor: hex('#eeeeee'), borderColor: hex('#000000'), borderWidth: pt(1), borderRadius: pt(3) });
    expect(box.box).toEqual({ backgroundColor: '#eeeeee', borderColor: '#000000', borderWidthPx: 1, borderRadiusPx: 3 });
  });

  it('rounds two corners and draws the top side only', () => {
    const box = headerBox({
      backgroundColor: hex('#eeeeee'), borderColor: hex('#aa0000'), borderWidth: pt(2),
      borderRadius: { topLeft: pt(5), topRight: pt(5) },
      borderSides: { right: { enabled: false }, bottom: { enabled: false }, left: { enabled: false } },
    });
    expect(box.box.borderRadiiPx).toEqual([5, 5, 0, 0]);
    expect(box.box.borderSides).toEqual({ top: { color: '#aa0000', widthPx: 2 }, right: null, bottom: null, left: null });
  });

  it('reports corner and side keys a box does not have', () => {
    const warnings = collectConfigWarnings(config({ borderRadius: { topleft: pt(2) }, borderSides: { up: {} } }));
    expect(warnings.map((w) => [w.kind, w.path, w.suggestion])).toEqual(expect.arrayContaining([
      ['unknownConfigKey', 'header.elements[0].style.borderRadius.topleft', 'topLeft'],
      ['unknownConfigKey', 'header.elements[0].style.borderSides.up', undefined],
    ]));
  });

  it('takes a part palette on each side colour', () => {
    const el = { kind: 'box', id: 'b', placement: { anchor: { to: 'container', edge: 'top-left' } }, style: { borderSides: { top: { color: hex('#000000', 'band') } } } };
    const out = applyPaletteOverrides(el as never, { band: '#00aa00' }) as unknown as { style: { borderSides: { top: { color: { hex: string } } } } };
    expect(out.style.borderSides.top.color.hex).toBe('#00aa00');
  });
});

type Call = { op: string; args: unknown[]; fill: string };

function recordingCtx() {
  const calls: Call[] = [];
  const state = { fillStyle: '', strokeStyle: '', lineWidth: 1 };
  const rec = (op: string) => function (this: typeof state, ...args: unknown[]) {
    calls.push({ op, args, fill: this.fillStyle });
  };
  const ctx = {
    ...state,
    save() {}, restore() {},
    beginPath: rec('beginPath'), moveTo: rec('moveTo'), lineTo: rec('lineTo'), arcTo: rec('arcTo'),
    bezierCurveTo: rec('bezierCurveTo'), quadraticCurveTo: rec('quadraticCurveTo'), closePath: rec('closePath'),
    fill: rec('fill'), stroke: rec('stroke'), fillRect: rec('fillRect'), strokeRect: rec('strokeRect'), rect: rec('rect'), clip: rec('clip'),
    setLineDash() {},
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}
const slot = (box: VDTDesignBoxStyle): VDTDesignSlot => ({
  bbox: { x: 0, y: 0, width: 400, height: 400 },
  blocks: [{ kind: 'box', bbox: { x: 10, y: 20, width: 100, height: 50 }, box }],
});

describe('box shapes on canvas (#1059)', () => {
  it('paints a uniform box as before: arcs, no curves', () => {
    const { ctx, calls } = recordingCtx();
    renderHeaderFooterSlot(ctx, slot({ backgroundColor: '#eeeeee', borderColor: '#000000', borderWidthPx: 2, borderRadiusPx: 6 }));
    expect(calls.some((c) => c.op === 'arcTo')).toBe(true);
    expect(calls.some((c) => c.op === 'bezierCurveTo')).toBe(false);
  });

  it('paints corners of their own and a border per side as vector paths', () => {
    const { ctx, calls } = recordingCtx();
    renderHeaderFooterSlot(ctx, slot({
      backgroundColor: '#eeeeee', borderColor: '#aa0000', borderWidthPx: 2, borderRadiusPx: 6,
      borderRadiiPx: [6, 0, 6, 0],
      borderSides: { top: { color: '#aa0000', widthPx: 2 }, right: null, bottom: null, left: { color: '#0000aa', widthPx: 1 } },
    }));
    expect(calls.some((c) => c.op === 'arcTo')).toBe(false);
    expect(calls.filter((c) => c.op === 'fill').map((c) => c.fill)).toEqual(['#eeeeee', '#aa0000', '#0000aa']);
    expect(calls.some((c) => c.op === 'bezierCurveTo')).toBe(true);
  });
});

describe('box shapes in HTML (#1059)', () => {
  it('writes a radius per corner and a border per side as CSS', () => {
    const doc = buildDocument({ markdown: 'Body.' }, config({
      backgroundColor: hex('#eeeeee'), borderColor: hex('#aa0000'), borderWidth: pt(2),
      borderRadius: { topLeft: pt(5), bottomRight: pt(5) },
      borderSides: { right: { enabled: false }, bottom: { enabled: false }, left: { enabled: false } },
    }), createMeasurementCache());
    const html = renderToHtmlIndexed(doc, { mode: 'single' }).pages[0]!.innerHtml;
    expect(html).toContain('border-top:2px solid #aa0000;box-sizing:border-box;border-radius:5px 0px 5px 0px;');
    expect(html).not.toContain('border:2px solid');
  });

  it('draws a card joined to its tab as an inline SVG', () => {
    const doc = buildDocument({ markdown: ':::callout{type="card" label="Words"}\nBody.\n:::' }, {
      ...config({}),
      calloutStyles: [{
        id: 'card', borderRadius: pt(6), background: hex('#fafafa'),
        border: { enabled: true, color: hex('#336699'), width: pt(1) },
        label: { joined: true, position: 'top-left', inset: pt(10), height: pt(14) },
      }],
    }, createMeasurementCache());
    const html = renderToHtmlIndexed(doc, { mode: 'single' }).pages[0]!.innerHtml;
    expect(html).toMatch(/<svg aria-hidden="true"[^>]*>.*fill="#fafafa"/);
    expect(html).toMatch(/fill="#336699" fill-rule="evenodd"/);
  });
});
