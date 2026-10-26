import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/index.js';
import { createMeasurementCache } from '../../measure/index.js';
import { collectConfigWarnings } from '../../checks/configWarnings.js';
import { styleWithLook } from '../../pipeline/composedPages/composedLayout.js';
import { resolveCalloutStylesConfig } from '../../defaults/boxes/calloutStyles.js';
import { resolveBodyTextConfig } from '../../defaults/text/bodyText.js';
import { resolveHeadingsConfig } from '../../defaults/structure/headings.js';
import { resolveUnorderedListsConfig } from '../../defaults/text/unorderedLists.js';
import type { CalloutStyleConfig, PostextConfig, VDTBlock, VDTDesignBlock, VDTDesignBoxBlock, VDTDesignPathBlock, VDTDocument } from '../../index.js';

// #1059: box styles with a radius per corner, a border per side, and a
// card joined to its label tab.

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const size = Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? 10);
    return { width: [...s].length * size * 0.6 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const hex = (h: string) => ({ hex: h, model: 'hex' as const });

const config = (style: Partial<CalloutStyleConfig>): PostextConfig => ({
  page: { width: pt(500), height: pt(700), dpi: 72, margins: { top: pt(40), bottom: pt(20), left: pt(30), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontSize: pt(10), lineHeight: pt(14) },
  calloutStyles: [{ id: 'card', title: '', background: hex('#fafafa'), padding: { top: pt(6), right: pt(6), bottom: pt(6), left: pt(6) }, ...style }],
});
const build = (style: Partial<CalloutStyleConfig>, markdown = ':::callout{type="card" label="Words"}\nBody of the box.\n:::'): VDTDocument =>
  buildDocument({ markdown }, config(style), createMeasurementCache());
const callout = (doc: VDTDocument) => doc.blocks.find((b): b is VDTBlock => b.type === 'callout')!;
const overlay = (doc: VDTDocument): VDTDesignBlock[] => callout(doc).designOverlay?.blocks ?? [];
const frameBox = (doc: VDTDocument) => overlay(doc).find((b): b is VDTDesignBoxBlock => b.kind === 'box')!;
const paths = (doc: VDTDocument) => overlay(doc).filter((b): b is VDTDesignPathBlock => b.kind === 'path');
const label = (extra: Record<string, unknown> = {}) => ({
  fontSize: pt(10), height: pt(14), paddingX: pt(5), color: hex('#ffffff'), background: hex('#336699'), ...extra,
}) as CalloutStyleConfig['label'];

describe('callout box shapes (#1059)', () => {
  it('paints a style with one radius and a whole border as before', () => {
    const doc = build({ borderRadius: pt(4), border: { enabled: true, color: hex('#000000'), width: pt(1) } });
    expect(frameBox(doc).box).toEqual({ backgroundColor: '#fafafa', borderColor: '#000000', borderWidthPx: 1, borderRadiusPx: 4 });
  });

  it('rounds only the corners a style names', () => {
    const doc = build({ borderRadius: { topLeft: pt(8), bottomRight: pt(8) } });
    const box = frameBox(doc).box;
    expect(box.borderRadiiPx).toEqual([8, 0, 8, 0]);
    expect(box.borderRadiusPx).toBe(8);
  });

  it('draws a border on the top side only', () => {
    const doc = build({ border: { enabled: false, color: hex('#cc0000'), width: pt(2), sides: { top: { enabled: true } } } });
    const box = frameBox(doc).box;
    expect(box.borderSides).toEqual({ top: { color: '#cc0000', widthPx: 2 }, right: null, bottom: null, left: null });
    expect(box.borderColor).toBe('#cc0000');
  });

  it('folds sides set alike back to the whole border', () => {
    const side = { enabled: true };
    const doc = build({ border: { enabled: true, color: hex('#000000'), width: pt(1), sides: { top: side, right: side, bottom: side, left: side } } });
    const box = frameBox(doc).box;
    expect(box.borderSides).toBeUndefined();
    expect(box.borderWidthPx).toBe(1);
  });

  it('clips the stripe to the corners a style rounds', () => {
    const doc = build({ borderRadius: { topLeft: pt(6), bottomLeft: pt(6) }, stripe: { enabled: true, side: 'left', width: pt(4) } });
    const stripe = overlay(doc).find((b): b is VDTDesignBoxBlock => b.kind === 'box' && b.bbox.width === 4)!;
    expect(stripe.clip?.radii).toEqual([6, 0, 0, 6]);
  });
});

describe('a card joined to its tab (#1059)', () => {
  const joined = (position: string, extra: Partial<CalloutStyleConfig> = {}) => build({
    borderRadius: pt(6),
    border: { enabled: true, color: hex('#336699'), width: pt(1) },
    label: label({ position, joined: true, inset: pt(12) }),
    ...extra,
  });

  it('draws the box and its tab as one outline, filled once, with the border round it', () => {
    const doc = joined('top-left');
    expect(overlay(doc).some((b) => b.kind === 'box' && b.bbox.height === 14)).toBe(false);
    const [fill, border] = paths(doc);
    expect(fill!.boxPart).toBe('fill');
    expect(fill!.fill).toBe('#fafafa');
    expect(fill!.subpaths).toHaveLength(1);
    expect(border!.boxPart).toBe('border');
    expect(border!.fillRule).toBe('evenodd');
    expect(border!.borderWidthPx).toBe(1);
  });

  it('stands the tab on the box: the block grows by the tab height above the box', () => {
    const plain = build({ borderRadius: pt(6) });
    const doc = joined('top-left');
    expect(callout(doc).bbox.height).toBeCloseTo(callout(plain).bbox.height + 14, 6);
    const fill = paths(doc)[0]!;
    // The outline reaches the block's top (the tab) and the box's foot.
    const top = callout(doc).bbox.y;
    expect(fill.bbox.y).toBeCloseTo(top, 6);
    expect(fill.bbox.y + fill.bbox.height).toBeCloseTo(top + callout(doc).bbox.height, 6);
    const words = overlay(doc).find((b) => b.kind === 'text' && b.lines[0]?.text === 'Words')!;
    expect(words.bbox.y).toBeCloseTo(top, 6);
  });

  it('hugs the right corner, and hangs from the foot', () => {
    const right = paths(joined('top-right'))[0]!;
    const left = paths(joined('top-left'))[0]!;
    expect(right.bbox).toEqual(left.bbox);
    const foot = joined('bottom-left');
    const words = overlay(foot).find((b) => b.kind === 'text' && b.lines[0]?.text === 'Words')!;
    // The tab hangs under the box: its words sit in the block's last 14 px.
    const { y, height } = callout(foot).bbox;
    expect(words.bbox.y + words.bbox.height).toBeCloseTo(y + height, 6);
  });

  it('keeps the tab glyph icon on a joined tab', () => {
    const doc = build({
      borderRadius: pt(6),
      label: label({ position: 'top-left', joined: true, icon: { kind: 'glyph', glyph: '◉', placement: 'inside' } }),
    });
    expect(overlay(doc).some((b) => b.kind === 'text' && b.lines[0]?.text === '◉' && b.artifact === true)).toBe(true);
  });

  it('squares the stripe where the tab goes on up the side', () => {
    const doc = build({
      borderRadius: pt(6),
      stripe: { enabled: true, side: 'left', width: pt(4) },
      label: label({ position: 'top-left', joined: true }),
    });
    const stripe = overlay(doc).find((b): b is VDTDesignBoxBlock => b.kind === 'box' && b.bbox.width === 4)!;
    expect(stripe.clip?.radii).toEqual([0, 6, 6, 6]);
  });

  it('runs a border per side round the tab with the side it stands on', () => {
    const doc = joined('top-left', {
      border: { enabled: false, color: hex('#336699'), width: pt(1), sides: { top: { enabled: true, width: pt(2) }, left: { enabled: true, color: hex('#999999') } } },
    });
    const borders = paths(doc).filter((p) => p.boxPart === 'border');
    expect(borders.map((b) => [b.fill, b.borderWidthPx])).toEqual([['#336699', 2], ['#999999', 1]]);
  });

  it('reports an offset on a joined tab, and positions and keys a box does not have', () => {
    const warnings = collectConfigWarnings({
      calloutStyles: [{
        id: 'card',
        borderRadius: { topLeft: pt(2), topRigth: pt(2) } as never,
        border: { sides: { top: { enabled: true, colour: hex('#000') } as never, middle: {} } as never },
        label: { joined: true, offset: pt(3), position: 'top-centre' as never },
      }],
    });
    const at = (path: string) => warnings.find((w) => w.path === path);
    expect(at('calloutStyles[0].borderRadius.topRigth')?.suggestion).toBe('topRight');
    expect(at('calloutStyles[0].border.sides.middle')?.kind).toBe('unknownConfigKey');
    expect(at('calloutStyles[0].border.sides.top.colour')?.suggestion).toBe('color');
    expect(at('calloutStyles[0].label.offset')).toMatchObject({ kind: 'unknownConfigValue', used: '0' });
    expect(at('calloutStyles[0].label.position')?.kind).toBe('unknownConfigValue');
  });

  it('recolours every side with a frame look', () => {
    const body = resolveBodyTextConfig(undefined);
    const [style] = resolveCalloutStylesConfig(
      [{ id: 'card', border: { enabled: true, sides: { top: { color: hex('#111111') } } } }],
      body, resolveHeadingsConfig(undefined), resolveUnorderedListsConfig(undefined, body),
    );
    const looked = styleWithLook(style!, { border: { color: hex('#ee0000') } });
    expect(looked.border.color.hex).toBe('#ee0000');
    expect(Object.values(looked.border.sides!).map((s) => s.color.hex)).toEqual(['#ee0000', '#ee0000', '#ee0000', '#ee0000']);
  });
});
