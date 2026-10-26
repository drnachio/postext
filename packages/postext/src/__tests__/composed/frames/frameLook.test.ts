import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { resolvePageTemplate } from '../../../composed/templates.js';
import { validatePageTemplates } from '../../../composed/validate.js';
import type { FrameConfig, PageTemplate } from '../../../composed/types.js';
import type { PostextConfig, VDTBlock, VDTDesignBlock, VDTDesignBoxBlock, VDTDesignTextBlock, VDTDocument, VDTFrame } from '../../../index.js';

// #976: a frame sets the colours of its callout style (and the tracking of
// its body) for itself; a template or a page fence recolours a
// palette-linked fill.

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
const hex = (h: string, extra: Record<string, unknown> = {}) => ({ hex: h, model: 'hex' as const, ...extra });

const CONFIG: PostextConfig = {
  page: { width: mm(200), height: mm(260), dpi: 300, margins: { top: mm(20), bottom: mm(20), left: mm(20), right: mm(20) } } as never,
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] } as never,
  bodyText: { fontSize: pt(11), lineHeight: pt(16), firstLineIndent: pt(0) } as never,
  colorPalette: [{ id: 'tint', name: 'Tint', value: hex('#ffeb99') }] as never,
  calloutStyles: [{
    id: 'caja', backgroundEnabled: true, background: hex('#ffeb99', { paletteId: 'tint' }),
    border: { enabled: true, color: hex('#222222') }, padding: { top: mm(3), right: mm(5), bottom: mm(3), left: mm(5) },
    label: { color: hex('#ffffff'), background: hex('#333333'), height: mm(6), paddingX: mm(3) },
    body: { color: hex('#111111') },
  }] as never,
};
const at: FrameConfig['placement'] = { anchor: { to: 'container', edge: 'top-left' } };
const caja = (extra: Partial<FrameConfig> = {}): FrameConfig => ({ name: 'caja', style: 'caja', placement: at, width: mm(100), ...extra });
const MD = (fence = 'template="ficha"') => `::::page{${fence}}\n\n:::frame{slot="caja" label="Money"}\n\nThe text of the box.\n\n:::\n\n::::`;
const build = (frames: FrameConfig[], extra: Partial<PageTemplate> = {}, fence?: string, config: Partial<PostextConfig> = {}): VDTDocument =>
  buildDocument({ markdown: MD(fence) }, { ...CONFIG, ...config, pageTemplates: [{ id: 'ficha', frames, ...extra } as PageTemplate] }, createMeasurementCache());
const page = (doc: VDTDocument) => doc.pages.find((p) => p.composed)!;
const frame = (doc: VDTDocument, name = 'caja'): VDTFrame => page(doc).composed!.frames.find((f) => f.name === name)!;
const callout = (doc: VDTDocument): VDTBlock => page(doc).floats!.find((b) => b.id === frame(doc).blockIds[0])!;
const overlay = (doc: VDTDocument): VDTDesignBlock[] => callout(doc).designOverlay?.blocks ?? [];
const boxes = (doc: VDTDocument) => overlay(doc).filter((b): b is VDTDesignBoxBlock => b.kind === 'box');
const labelText = (doc: VDTDocument) => overlay(doc).find((b): b is VDTDesignTextBlock => b.kind === 'text' && b.lines[0]?.text === 'Money')!;
const bodyText = (doc: VDTDocument): VDTBlock => page(doc).floats!.find((b) => b.type === 'paragraph')!;

describe('frame look (#976)', () => {
  it('without a look the frame wears its style', () => {
    const doc = build([caja()]);
    expect(boxes(doc)[0]!.box.backgroundColor).toBe('#ffeb99');
    expect(boxes(doc).find((b) => b.bbox.height < 100)!.box.backgroundColor).toBe('#333333');
    expect(labelText(doc).color).toBe('#ffffff');
    expect(bodyText(doc).color).toBe('#111111');
  });

  it('sets the fill, the border, the tab and the text colours for this frame only', () => {
    const doc = build([
      caja({ look: { background: hex('#f6c3d0'), border: { color: hex('#aa0000') }, label: { background: hex('#ffffff'), color: hex('#aa0000') }, body: { color: hex('#003366') } } }),
    ]);
    const all = boxes(doc);
    expect(all[0]!.box.backgroundColor).toBe('#f6c3d0');
    expect(all[0]!.box.borderColor).toBe('#aa0000');
    expect(all.some((b) => b.box.backgroundColor === '#ffffff')).toBe(true);
    expect(labelText(doc).color).toBe('#aa0000');
    expect(bodyText(doc).color).toBe('#003366');
    // The style is untouched: another frame of the same style keeps it.
    const plain = build([caja()]);
    expect(boxes(plain)[0]!.box.backgroundColor).toBe('#ffeb99');
  });

  it('a look fill turns the fill on', () => {
    const doc = build([caja({ look: { background: hex('#abcdef') } })], {}, undefined, {
      calloutStyles: [{ id: 'caja', backgroundEnabled: false, padding: { top: mm(3), right: mm(5), bottom: mm(3), left: mm(5) } }] as never,
    });
    expect(boxes(doc)[0]!.box.backgroundColor).toBe('#abcdef');
  });

  it('tracks the body of this frame', () => {
    const doc = build([caja({ look: { body: { letterSpacing: { value: -0.05, unit: 'em' } } } })]);
    expect(bodyText(doc).letterSpacing).toBeCloseTo(-0.05 * 11 * (300 / 72), 3);
    expect(bodyText(build([caja()])).letterSpacing).toBeUndefined();
    // Zero takes off the style's own tracking.
    const tight = build([caja({ look: { body: { letterSpacing: { value: 0, unit: 'em' } } } })], {}, undefined, {
      calloutStyles: [{ ...(CONFIG.calloutStyles![0] as object), body: { letterSpacing: { value: -0.05, unit: 'em' } } }] as never,
    });
    expect(bodyText(tight).letterSpacing).toBeUndefined();
  });

  it('merges key by key over an inherited frame, and drops what the engine cannot use', () => {
    const parent: PageTemplate = { id: 'a', frames: [caja({ look: { background: hex('#111111'), label: { color: hex('#222222'), background: hex('#333333') } } })] };
    const child: PageTemplate = { id: 'b', extends: 'a', frames: [{ name: 'caja', look: { label: { color: hex('#444444') }, body: { letterSpacing: { value: 1, unit: 'furlong' as never } } } }] };
    const t = resolvePageTemplate({ pageTemplates: [parent, child] }, 'b')!;
    expect(t.frames[0]!.look).toEqual({ background: hex('#111111'), label: { color: hex('#444444'), background: hex('#333333') } });
    expect(t.frames[0]!.fieldPaths.look).toBe('/pageTemplates/1/frames/0/look');
  });

  it('warns of a key a look does not have, at any depth', () => {
    const w = validatePageTemplates({ calloutStyles: CONFIG.calloutStyles, pageTemplates: [{ id: 'a', frames: [caja({ look: { backgrnd: hex('#000000'), label: { colour: hex('#000000') }, body: { rule: 1 } } as never })] }] });
    expect(w.map((x) => `${x.kind} ${x.path}${x.suggestion ? ` → ${x.suggestion}` : ''}`).sort()).toEqual([
      'unknownConfigKey /pageTemplates/0/frames/0/look/backgrnd → background',
      'unknownConfigKey /pageTemplates/0/frames/0/look/body/rule',
      'unknownConfigKey /pageTemplates/0/frames/0/look/label/colour → color',
    ]);
  });
});

describe('palette of a composed page (#976)', () => {
  it('a template palette recolours the palette-linked fill of its frames', () => {
    const doc = build([caja()], { palette: 'tint=#f6c3d0' });
    expect(boxes(doc)[0]!.box.backgroundColor).toBe('#f6c3d0');
  });

  it('a page fence palette wins over the template’s, page by page', () => {
    const two = buildDocument(
      { markdown: `${MD('template="ficha" palette="tint=#c3e0f6"')}\n\n${MD('template="ficha"')}` },
      { ...CONFIG, pageTemplates: [{ id: 'ficha', palette: 'tint=#f6c3d0', frames: [caja()] } as PageTemplate] },
      createMeasurementCache(),
    );
    const [a, b] = two.pages.filter((p) => p.composed);
    const fill = (p: typeof a) => {
      const f = p!.composed!.frames.find((x) => x.name === 'caja')!;
      return (p!.floats!.find((x) => x.id === f.blockIds[0])!.designOverlay!.blocks.find((x): x is VDTDesignBoxBlock => x.kind === 'box')!).box.backgroundColor;
    };
    expect(fill(a)).toBe('#c3e0f6');
    expect(fill(b)).toBe('#f6c3d0');
  });

  it('leaves a fill the palette does not link alone', () => {
    const doc = build([caja({ look: { background: hex('#abcdef') } })], { palette: 'tint=#f6c3d0' });
    expect(boxes(doc)[0]!.box.backgroundColor).toBe('#abcdef');
  });
});
