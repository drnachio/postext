import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/index.js';
import { resolveAllConfig } from '../../pipeline/config.js';
import { stripCalloutStylesDefaults } from '../../defaults/index.js';
import { collectConfigWarnings } from '../../checks/configWarnings.js';
import { iconShapeBlock } from '../../design/iconShape.js';
import { renderToHtml } from '../../html-backend/html-backend.js';
import type { CalloutStyleConfig, PostextConfig, Resource, VDTBlock, VDTDesignBlock, VDTDesignImageBlock, VDTDesignPathBlock, VDTDesignTextBlock, VDTDocument } from '../../index.js';

// #1120: a picture icon painted in a colour of its own (or the icon's),
// and a ring or a dot the engine draws, on a box's icon, its marker and a
// label tab.

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

const pt = (value: number) => ({ value, unit: 'pt' as const });
const hex = (h: string, paletteId?: string) => ({ hex: h, model: 'hex' as const, ...(paletteId ? { paletteId } : {}) });
const RING: Resource = { id: 'ring', typeId: 'figure', kind: 'svg', altText: '', createdAt: 0, updatedAt: 0, svg: { fileId: 'ring.svg', width: 10, height: 10 } };

const config = (style: Partial<CalloutStyleConfig>, extra: Partial<PostextConfig> = {}): PostextConfig => ({
  page: { width: pt(500), height: pt(700), dpi: 72, margins: { top: pt(30), bottom: pt(20), left: pt(30), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontSize: pt(10), lineHeight: pt(14) },
  calloutStyles: [{ id: 'b', title: '', padding: { top: pt(6), right: pt(6), bottom: pt(6), left: pt(6) }, ...style }],
  ...extra,
});
const build = (style: Partial<CalloutStyleConfig>, extra?: Partial<PostextConfig>, label = ''): VDTDocument =>
  buildDocument({ markdown: `:::callout{type="b"${label ? ` label="${label}"` : ''}}\nBody of the box.\n:::`, resources: [RING] }, config(style, extra));
const overlay = (doc: VDTDocument): VDTDesignBlock[] => doc.blocks.find((b): b is VDTBlock => b.type === 'callout')!.designOverlay?.blocks ?? [];
const drawn = (blocks: VDTDesignBlock[]) => blocks.filter((b): b is VDTDesignPathBlock => b.kind === 'path' && b.drawnIcon === true);
const image = (blocks: VDTDesignBlock[]) => blocks.find((b): b is VDTDesignImageBlock => b.kind === 'image');

describe('a drawn icon (#1120)', () => {
  it('draws a ring as a band between two circles, a dot as one', () => {
    const ring = iconShapeBlock('ring', 10, 20, 16, '#ff0000', 2);
    expect(ring.subpaths).toHaveLength(2);
    expect(ring.fillRule).toBe('evenodd');
    expect(ring.fill).toBe('#ff0000');
    expect(ring.bbox).toEqual({ x: 2, y: 12, width: 16, height: 16 });
    // The inner circle starts at its own right-hand point.
    expect(ring.subpaths[1]![0]).toEqual({ op: 'M', x: 16, y: 20 });
    const dot = iconShapeBlock('dot', 10, 20, 16, '#ff0000');
    expect(dot.subpaths).toHaveLength(1);
    expect(dot.fillRule).toBeUndefined();
    // A line as wide as the radius fills the ring.
    expect(iconShapeBlock('ring', 0, 0, 10, '#000000', 9).subpaths).toHaveLength(1);
  });

  it('resolves and strips the shape fields, only for a shape', () => {
    const [a, b] = resolveAllConfig({ calloutStyles: [{ id: 'a', icon: { kind: 'glyph', glyph: '!' } }, { id: 'b', icon: { kind: 'shape' } }] }).calloutStyles;
    expect(a!.icon.shape).toBeUndefined();
    expect(b!.icon.shape).toBe('ring');
    expect(stripCalloutStylesDefaults([{ id: 'x', icon: { kind: 'shape', shape: 'dot', strokeWidth: pt(1) } }]))
      .toEqual([{ id: 'x', icon: { kind: 'shape', shape: 'dot', strokeWidth: pt(1) } }]);
  });

  it('sets a ring as a box icon in the icon colour and size', () => {
    const doc = build({ icon: { kind: 'shape', size: pt(12), color: hex('#0099cc'), strokeWidth: pt(2) } });
    const [ring] = drawn(overlay(doc));
    expect(ring).toBeDefined();
    expect(ring!.fill).toBe('#0099cc');
    expect(ring!.bbox.width).toBeCloseTo(12, 6);
    expect(ring!.subpaths).toHaveLength(2);
    // The HTML viewer draws it as an SVG path, even-odd.
    expect(renderToHtml(doc)).toMatch(/fill="#0099cc"[^>]*fill-rule="evenodd"|fill-rule="evenodd"[^>]*fill="#0099cc"/);
    // The text starts past the icon column, as a glyph's would.
    const glyph = build({ icon: { kind: 'glyph', glyph: '!', size: pt(12) } });
    const text = (d: VDTDocument) => d.blocks.find((b) => b.lines[0]?.text.startsWith('Body'))!.bbox.x;
    expect(text(doc)).toBeCloseTo(text(glyph), 6);
  });

  it('sets a dot as the marker', () => {
    const doc = build({ marker: { kind: 'shape', shape: 'dot', size: pt(8), color: hex('#cc0000') } });
    const [dot] = drawn(overlay(doc));
    expect(dot?.fill).toBe('#cc0000');
    expect(dot?.subpaths).toHaveLength(1);
  });

  it('sets a ring inside a label tab before the words', () => {
    const doc = build({
      label: { fontSize: pt(10), height: pt(14), paddingX: pt(6), position: 'top-left', color: hex('#000000'), background: hex('#ffffff'), icon: { kind: 'shape', placement: 'inside', gap: pt(3), color: hex('#0099cc') } },
    }, undefined, 'Money');
    const blocks = overlay(doc);
    const [ring] = drawn(blocks);
    expect(ring!.fill).toBe('#0099cc');
    // As large as a glyph at the words' size, at the tab's start.
    expect(ring!.bbox.width).toBeCloseTo(10, 6);
    const tab = blocks.find((b) => b.kind === 'box' && Math.abs(b.bbox.height - 14) < 1e-6)!;
    expect(ring!.bbox.x).toBeCloseTo(tab.bbox.x + 6, 6);
    expect(tab.bbox.width).toBeCloseTo(6 + 10 + 3 + 5 * 7 + 6, 6);
    const words = blocks.find((b): b is VDTDesignTextBlock => b.kind === 'text' && b.lines[0]?.text === 'Money')!;
    expect(words.color).toBe('#000000');
  });

  it('reports a shape the engine does not draw', () => {
    const warnings = collectConfigWarnings({ calloutStyles: [{ id: 'x', label: { icon: { kind: 'shape', shape: 'star' as never } } }] });
    expect(warnings.some((w) => w.kind === 'unknownConfigValue' && w.path === 'calloutStyles[0].label.icon.shape')).toBe(true);
  });
});

describe('icon tints (#1120)', () => {
  it('paints a box\'s picture icon in its colour with tint: true, as it is without', () => {
    expect(image(overlay(build({ icon: { kind: 'resource', resourceId: 'ring' } })))!.tint).toBeUndefined();
    expect(image(overlay(build({ icon: { kind: 'resource', resourceId: 'ring', color: hex('#118844'), tint: true } })))!.tint).toBe('#118844');
  });

  it('paints a picture in a colour of its own, on the box and on a label tab', () => {
    expect(image(overlay(build({ icon: { kind: 'resource', resourceId: 'ring', tint: hex('#aa00aa') } })))!.tint).toBe('#aa00aa');
    const label = (tint: unknown) => image(overlay(build({
      label: { color: hex('#000000'), icon: { resourceId: 'ring', tint: tint as never } },
    }, undefined, 'Money')))!;
    expect(label(true).tint).toBe('#000000');
    expect(label(hex('#0099cc')).tint).toBe('#0099cc');
    expect(label(false).tint).toBeUndefined();
  });

  it('follows the palette', () => {
    const palette: Partial<PostextConfig> = { colorPalette: [{ id: 'accent', name: 'Accent', value: hex('#123456') }] };
    const doc = build({ icon: { kind: 'resource', resourceId: 'ring', tint: hex('#000000', 'accent') } }, palette);
    expect(image(overlay(doc))!.tint).toBe('#123456');
  });

  it('resolves only a set tint and strips false', () => {
    const [a, b] = resolveAllConfig({ calloutStyles: [{ id: 'a' }, { id: 'b', icon: { tint: true } }] }).calloutStyles;
    expect(a!.icon.tint).toBeUndefined();
    expect(b!.icon.tint).toBe(true);
    expect(stripCalloutStylesDefaults([{ id: 'x', icon: { tint: false } }])).toEqual([{ id: 'x' }]);
  });
});
