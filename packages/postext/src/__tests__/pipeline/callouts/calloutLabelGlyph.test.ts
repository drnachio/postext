import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/index.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { resolveCalloutStylesConfig } from '../../../defaults/boxes/calloutStyles.js';
import { resolveBodyTextConfig } from '../../../defaults/text/bodyText.js';
import { resolveHeadingsConfig } from '../../../defaults/structure/headings.js';
import { resolveUnorderedListsConfig } from '../../../defaults/text/unorderedLists.js';
import { collectConfigWarnings } from '../../../checks/configWarnings.js';
import { configFontFamilies } from '../../../fonts/usage.js';
import type { FrameConfig, PageTemplate } from '../../../composed/types.js';
import type { PostextConfig, Resource, VDTBlock, VDTDesignBlock, VDTDesignBoxBlock, VDTDesignTextBlock, VDTDocument } from '../../../index.js';

// #1054: a label tab's icon can be a glyph of a font (a ◉) in the tab's
// colour, beside the tab or inside it, as a picture icon is.

/** Every character 0.7 of the font's size wide, so a larger glyph is
 *  wider. */
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const size = Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? 10);
    return { width: [...s].length * size * 0.7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const hex = (h: string) => ({ hex: h, model: 'hex' as const });
const RING: Resource = { id: 'ring', typeId: 'figure', kind: 'svg', altText: '', createdAt: 0, updatedAt: 0, svg: { fileId: 'ring.svg', width: 20, height: 10 } };

// The words "Money": 5 × 7 = 35 px at 10 px. The glyph: 7 px at scale 1.
const WORDS_W = 35;
const PAD = 6;
const GAP = 3;

const config = (icon: Record<string, unknown> | undefined, extra: Record<string, unknown> = {}): PostextConfig => ({
  page: { width: pt(500), height: pt(700), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(30), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontSize: pt(10), lineHeight: pt(14) },
  calloutStyles: [{
    id: 'tab', title: '', padding: { top: pt(6), right: pt(6), bottom: pt(6), left: pt(6) },
    label: {
      fontFamily: 'Lora', fontSize: pt(10), fontWeight: 400, position: 'top-left', height: pt(14), paddingX: pt(PAD), offset: pt(7),
      color: hex('#fefefe'),
      ...(icon ? { icon: { gap: pt(GAP), ...icon } } : {}),
      ...extra,
    },
  }] as never,
});
const build = (icon: Record<string, unknown> | undefined, extra?: Record<string, unknown>, markdown = ':::callout{type="tab" label="Money"}\nBody of the box.\n:::', base?: Partial<PostextConfig>): VDTDocument =>
  buildDocument({ markdown, resources: [RING] }, { ...config(icon, extra), ...base }, createMeasurementCache());
const overlay = (doc: VDTDocument): VDTDesignBlock[] => (doc.blocks.find((b): b is VDTBlock => b.type === 'callout')!.designOverlay?.blocks ?? []);
const tab = (blocks: VDTDesignBlock[]) => blocks.find((b): b is VDTDesignBoxBlock => b.kind === 'box' && Math.abs(b.bbox.height - 14) < 1e-6)!;
const words = (blocks: VDTDesignBlock[]) => blocks.find((b): b is VDTDesignTextBlock => b.kind === 'text' && b.lines[0]?.text === 'Money')!;
const glyph = (blocks: VDTDesignBlock[]) => blocks.find((b): b is VDTDesignTextBlock => b.kind === 'text' && b.lines[0]?.text === '◉');

describe('label.icon glyph: resolution (#1054)', () => {
  const resolve = (icons: Record<string, unknown>[], label: Record<string, unknown> = {}) => {
    const body = resolveBodyTextConfig();
    return resolveCalloutStylesConfig(
      icons.map((icon, i) => ({ id: `s${i}`, label: { ...label, icon } })) as never,
      body, resolveHeadingsConfig({ fontFamily: 'Heads' } as never), resolveUnorderedListsConfig(undefined, body),
    ).map((s) => s.label!.icon);
  };

  it('reads the kind from what the icon sets, unless it names one', () => {
    const [a, b, c, d, e] = resolve([{}, { resourceId: 'ring' }, { glyph: '◉' }, { resourceId: 'ring', glyph: '◉' }, { kind: 'glyph', resourceId: 'ring', glyph: '◉' }]);
    expect(a!.kind).toBe('resource');
    expect(b!.kind).toBe('resource');
    expect(c!.kind).toBe('glyph');
    expect(d!.kind).toBe('resource');
    expect(e!.kind).toBe('glyph');
    expect(resolve([{ kind: 'ring' as never, glyph: '◉' }])[0]!.kind).toBe('glyph');
  });

  it('sets the glyph in the label\'s face and weight at its size, in its colour, unless told otherwise', () => {
    const [a] = resolve([{ glyph: '◉' }], { fontFamily: 'Tabs', fontWeight: 700 });
    expect(a).toMatchObject({ fontFamily: 'Tabs', fontWeight: 700, scale: 1 });
    expect(a!.color).toBeUndefined();
    const [b] = resolve([{ glyph: '◉', fontFamily: 'Symbols', fontWeight: 400, scale: 1.4, color: hex('#ff0000') }]);
    expect(b).toMatchObject({ fontFamily: 'Symbols', fontWeight: 400, scale: 1.4, color: { hex: '#ff0000' } });
    // A label without a face of its own: the headings'.
    expect(resolve([{ glyph: '◉' }])[0]!.fontFamily).toBe('Heads');
    for (const scale of [0, -1, Number.NaN, '2' as never]) expect(resolve([{ glyph: '◉', scale }])[0]!.scale).toBe(1);
  });
});

describe('label.icon glyph: layout (#1054)', () => {
  it('inside: the tab grows by the glyph\'s advance and the gap, the glyph at its start, the words after it', () => {
    const plain = tab(overlay(build(undefined)));
    expect(plain.bbox.width).toBeCloseTo(WORDS_W + 2 * PAD, 3);
    const blocks = overlay(build({ glyph: '◉', placement: 'inside' }));
    const t = tab(blocks);
    const g = glyph(blocks)!;
    expect(g.lines[0]!.width).toBeCloseTo(7, 3);
    expect(t.bbox.width - plain.bbox.width).toBeCloseTo(g.lines[0]!.width + GAP, 3);
    expect(g.bbox.x + g.lines[0]!.xOffset).toBeCloseTo(t.bbox.x + PAD, 3);
    expect(words(blocks).lines[0]!.xOffset).toBeCloseTo(PAD + 7 + GAP, 3);
    // On the words' baseline at their size, in their colour, in the label's face.
    expect(g.lines[0]!.baselineY).toBeCloseTo(words(blocks).lines[0]!.baselineY, 3);
    expect(g.color).toBe('#fefefe');
    expect(g.fontString).toBe(words(blocks).fontString);
  });

  it('is pagination furniture: an artifact to a reader, so the tab reads only its words', () => {
    const blocks = overlay(build({ glyph: '◉', placement: 'inside' }));
    expect(glyph(blocks)!.artifact).toBe(true);
    expect(words(blocks).artifact).toBeUndefined();
  });

  it('beside: the glyph past the tab\'s edge, the tab as wide as its words, the rule up to the glyph', () => {
    const blocks = overlay(build({ glyph: '◉' }, { rule: { enabled: true, width: pt(1) } }));
    const t = tab(blocks);
    const g = glyph(blocks)!;
    expect(t.bbox.width).toBeCloseTo(WORDS_W + 2 * PAD, 3);
    expect(g.bbox.x).toBeCloseTo(t.bbox.x + t.bbox.width + GAP, 3);
    const rule = blocks.find((b) => b.kind === 'rule')!;
    expect(rule.bbox.x).toBeCloseTo(g.bbox.x + 7, 3);
    // At the right corner it stands on the tab's left.
    const right = overlay(build({ glyph: '◉' }, { position: 'top-right' }));
    expect(glyph(right)!.bbox.x + 7).toBeCloseTo(tab(right).bbox.x - GAP, 3);
  });

  it('scale sizes the glyph against the words; color and font set it apart', () => {
    const blocks = overlay(build({ glyph: '◉', placement: 'inside', scale: 1.5, color: hex('#cc0000'), fontFamily: 'Symbols', fontWeight: 700 }));
    const g = glyph(blocks)!;
    expect(g.lines[0]!.width).toBeCloseTo(7 * 1.5, 3);
    expect(g.fontString).toContain('15px');
    expect(g.fontString).toContain('Symbols');
    expect(g.fontString).toContain('700');
    expect(g.color).toBe('#cc0000');
    // Centred on the tab's middle as the words are: a larger glyph sits lower.
    const t = tab(blocks);
    expect(g.lines[0]!.baselineY).toBeCloseTo(t.bbox.y + t.bbox.height / 2 + 15 * 0.36, 3);
    expect(tab(blocks).bbox.width).toBeCloseTo(WORDS_W + 2 * PAD + 7 * 1.5 + GAP, 3);
  });

  it('a right-to-left box starts at its right end: the glyph there, the words before it', () => {
    const doc = build({ glyph: '◉', placement: 'inside' }, { position: 'top-start' }, ':::callout{type="tab" label="Money" dir="rtl"}\nBody.\n:::');
    const blocks = overlay(doc);
    const t = tab(blocks);
    const g = glyph(blocks)!;
    expect(g.bbox.x + 7).toBeCloseTo(t.bbox.x + t.bbox.width - PAD, 3);
    expect(words(blocks).lines[0]!.xOffset).toBeCloseTo(PAD, 3);
  });

  it('a glyph wins over a picture only when the kind says so', () => {
    const both = overlay(build({ glyph: '◉', resourceId: 'ring', width: pt(8), placement: 'inside' }));
    expect(glyph(both)).toBeUndefined();
    expect(both.some((b) => b.kind === 'image')).toBe(true);
    const glyphKind = overlay(build({ kind: 'glyph', glyph: '◉', resourceId: 'ring', width: pt(8), placement: 'inside' }));
    expect(glyph(glyphKind)).toBeDefined();
    expect(glyphKind.some((b) => b.kind === 'image')).toBe(false);
  });

  it('an empty glyph draws nothing and leaves the tab as it was', () => {
    const blocks = overlay(build({ kind: 'glyph', glyph: '', placement: 'inside' }));
    expect(tab(blocks).bbox.width).toBeCloseTo(WORDS_W + 2 * PAD, 3);
    expect(blocks.filter((b) => b.kind === 'text')).toHaveLength(1);
  });
});

describe('label.icon glyph: composed frames (#1054)', () => {
  const mm = (value: number) => ({ value, unit: 'mm' as const });
  const CONFIG: PostextConfig = {
    page: { width: mm(200), height: mm(260), dpi: 72, margins: { top: mm(20), bottom: mm(20), left: mm(20), right: mm(20) } } as never,
    bodyText: { fontSize: pt(10), lineHeight: pt(14), firstLineIndent: pt(0) } as never,
    calloutStyles: [{
      id: 'caja', backgroundEnabled: true, background: hex('#ffeb99'), padding: { top: mm(3), right: mm(5), bottom: mm(3), left: mm(5) },
      label: { fontSize: pt(10), color: hex('#ffffff'), background: hex('#333333'), height: pt(14), paddingX: pt(PAD), icon: { glyph: '◉', placement: 'inside', gap: pt(GAP) } },
    }] as never,
  };
  const frame = (extra: Partial<FrameConfig> = {}): FrameConfig => ({ name: 'caja', style: 'caja', placement: { anchor: { to: 'container', edge: 'top-left' } }, width: mm(100), ...extra });
  const buildFrame = (f: FrameConfig): VDTDocument => buildDocument(
    { markdown: '::::page{template="ficha"}\n\n:::frame{slot="caja" label="Money"}\n\nThe text of the box.\n\n:::\n\n::::' },
    { ...CONFIG, pageTemplates: [{ id: 'ficha', frames: [f] } as PageTemplate] },
    createMeasurementCache(),
  );
  const frameOverlay = (doc: VDTDocument): VDTDesignBlock[] => {
    const page = doc.pages.find((p) => p.composed)!;
    const id = page.composed!.frames.find((f) => f.name === 'caja')!.blockIds[0];
    return page.floats!.find((b) => b.id === id)!.designOverlay?.blocks ?? [];
  };

  it('a frame\'s tab carries the glyph, its tab grown by the glyph and the gap', () => {
    const blocks = frameOverlay(buildFrame(frame()));
    const g = glyph(blocks)!;
    expect(g).toBeDefined();
    expect(g.artifact).toBe(true);
    expect(g.color).toBe('#ffffff');
    expect(tab(blocks).bbox.width).toBeCloseTo(WORDS_W + 2 * PAD + 7 + GAP, 3);
  });

  it('a frame\'s look that recolours the words recolours the glyph that follows them', () => {
    const blocks = frameOverlay(buildFrame(frame({ look: { label: { color: hex('#aa0000') } } })));
    expect(glyph(blocks)!.color).toBe('#aa0000');
    expect(words(blocks).color).toBe('#aa0000');
  });
});

describe('label.icon glyph: checks (#1054)', () => {
  const warnings = (icon: Record<string, unknown>) => collectConfigWarnings({ calloutStyles: [{ id: 'a', label: { icon } }] } as never)
    .filter((w) => w.path.startsWith('calloutStyles[0].label.icon'));

  it('reports a kind, a placement or a scale it does not read, with what it reads instead', () => {
    expect(warnings({ kind: 'glph', glyph: '◉' })).toEqual([{ kind: 'unknownConfigValue', path: 'calloutStyles[0].label.icon.kind', value: 'glph', used: 'glyph', suggestion: 'glyph' }]);
    expect(warnings({ glyph: '◉', placement: 'inner' })[0]).toMatchObject({ kind: 'unknownConfigValue', path: 'calloutStyles[0].label.icon.placement', used: 'beside' });
    expect(warnings({ glyph: '◉', scale: -2 })[0]).toMatchObject({ kind: 'unknownConfigValue', path: 'calloutStyles[0].label.icon.scale', value: '-2', used: '1' });
  });

  it('reports a key the icon does not have', () => {
    expect(warnings({ glyph: '◉', colour: '#000' })[0]).toMatchObject({ kind: 'unknownConfigKey', path: 'calloutStyles[0].label.icon.colour', suggestion: 'color' });
  });

  it('is quiet about a well-formed icon', () => {
    expect(warnings({ kind: 'glyph', glyph: '◉', fontFamily: 'Lora', fontWeight: 700, scale: 1.2, color: hex('#000000'), placement: 'inside', gap: pt(2) })).toEqual([]);
    expect(warnings({ resourceId: 'ring', width: pt(8), tint: true, placement: 'beside' })).toEqual([]);
  });

  it('loads the glyph\'s face with the book\'s fonts', () => {
    expect(configFontFamilies({ calloutStyles: [{ id: 'a', label: { icon: { glyph: '◉', fontFamily: 'Symbols' } } }] } as never)).toContain('Symbols');
  });
});
