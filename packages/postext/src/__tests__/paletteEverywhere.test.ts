import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline';
import { resolveAllConfig } from '../pipeline/config';
import { applyHtmlViewerOverrides, applyPaletteToConfig, applyPaletteToResolvedConfig } from '../defaults';
import type { ColorValue, DesignElement, PostextConfig } from '../types';
import type { VDTBlock, VDTDesignTextBlock } from '../vdt';

// EF-71: every colour linked to a palette entry (`paletteId`) follows the
// palette, not only the ones the palette pass listed by hand — the design
// slots (running heads, heading openers, heading styles, parts, contents
// rows), `bodyText.referenceColor`, and the callout label / body colours.

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
/** A colour linked to `id`, stored with a stale hex (the palette's value when
 *  it was linked). */
const linked = (id: string, staleHex = '#111111'): ColorValue => ({ hex: staleHex, model: 'hex', paletteId: id });
const palette = [
  { id: 'main-color', name: 'Main', value: { hex: '#cc0000', model: 'hex' as const } },
  { id: 'accent', name: 'Accent', value: { hex: '#00aa00', model: 'hex' as const } },
];

const text = (id: string, color: ColorValue, extra: Partial<DesignElement> = {}): DesignElement => ({
  kind: 'text', id, content: '{pageNumber}', fontSize: pt(8), overflow: 'clip', color,
  placement: { anchor: { to: 'container', edge: 'bottom' }, size: { width: 'auto', height: 'auto' } },
  ...extra,
} as DesignElement);
const rule = (id: string, color: ColorValue): DesignElement => ({
  kind: 'rule', id, direction: 'horizontal', color, thickness: pt(0.5),
  placement: { anchor: { to: 'container', edge: 'top' }, size: { width: 'fill' } },
});
const box = (id: string, backgroundColor: ColorValue, borderColor: ColorValue): DesignElement => ({
  kind: 'box', id, style: { backgroundColor, borderColor, borderWidth: pt(1) },
  placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(20), height: pt(10) } },
});

describe('EF-71: the palette reaches every palette-linked colour', () => {
  it('bodyText.referenceColor (linked to the main colour by default) follows the palette', () => {
    const resolved = resolveAllConfig({ colorPalette: palette });
    expect(resolved.bodyText.referenceColor.hex).toBe('#cc0000');
    const own = resolveAllConfig({ colorPalette: palette, bodyText: { referenceColor: linked('accent') } });
    expect(own.bodyText.referenceColor.hex).toBe('#00aa00');
  });

  it('a :ref is painted in the palette colour', () => {
    const cfg: PostextConfig = { colorPalette: palette };
    const doc = buildDocument({
      markdown: 'See :ref{id="fig-a"} for the shape.\n\n::resource{id="fig-a"}',
      resources: [{ id: 'fig-a', typeId: 'figure', kind: 'svg', createdAt: 1, updatedAt: 1, svg: { fileId: 'a', width: 20, height: 10 } }],
    }, cfg);
    const colors = doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks))
      .filter((b) => b.type === 'paragraph')
      .map((b) => b.refColor);
    expect(colors).toContain('#cc0000');
    expect(colors).not.toContain('#295AA3');
  });

  it('header / footer design elements follow the palette and keep their link', () => {
    const cfg: PostextConfig = {
      colorPalette: palette,
      header: { elements: [
        text('t', linked('accent'), { stroke: { width: pt(0.2), color: linked('main-color') }, box: { backgroundColor: linked('accent'), borderColor: linked('main-color') } } as Partial<DesignElement>),
        rule('r', linked('main-color')),
      ] },
      footer: { elements: [box('b', linked('accent'), linked('main-color'))] },
    };
    const resolved = resolveAllConfig(cfg);
    const [t, r] = resolved.header.elements as [Extract<DesignElement, { kind: 'text' }>, Extract<DesignElement, { kind: 'rule' }>];
    expect(t.color).toEqual({ hex: '#00aa00', model: 'hex', paletteId: 'accent' });
    expect(t.stroke?.color?.hex).toBe('#cc0000');
    expect(t.box?.backgroundColor?.hex).toBe('#00aa00');
    expect(t.box?.borderColor?.hex).toBe('#cc0000');
    expect(r.color.hex).toBe('#cc0000');
    const b = resolved.footer.elements[0] as Extract<DesignElement, { kind: 'box' }>;
    expect(b.style.backgroundColor?.hex).toBe('#00aa00');
    expect(b.style.borderColor?.hex).toBe('#cc0000');

    const doc = buildDocument({ markdown: 'Some words on the page.' }, cfg);
    const head = doc.pages[0]!.header!;
    const textBlock = head.blocks.find((x) => x.kind === 'text') as VDTDesignTextBlock;
    expect(textBlock.color.toLowerCase()).toBe('#00aa00');
    const ruleBlock = head.blocks.find((x) => x.kind === 'rule') as { color: string };
    expect(ruleBlock.color.toLowerCase()).toBe('#cc0000');
  });

  it('heading opener designs, heading styles, parts and contents designs follow the palette', () => {
    const cfg: PostextConfig = {
      colorPalette: palette,
      headings: { levels: [{
        level: 1,
        span: 'page',
        breakBefore: { enabled: true, parity: 'any' },
        advancedDesign: { enabled: true, slot: { elements: [
          text('h', linked('accent'), { content: '{titleText}', dropCap: { color: linked('main-color') } } as Partial<DesignElement>),
        ] } },
      }] },
      headingStyles: [{
        id: 'annex',
        color: linked('accent'),
        advancedDesign: { enabled: true, slot: { elements: [rule('sr', linked('accent'))] } },
        header: { elements: [rule('sh', linked('main-color'))] },
        bodyStyle: { color: linked('accent') },
      }],
      parts: { design: { elements: [rule('p', linked('accent'))] }, versoDesign: { elements: [box('pv', linked('main-color'), linked('accent'))] } },
      toc: {
        levels: [{ level: 1, color: linked('accent'), numberColor: linked('main-color') }],
        pageNumber: { color: linked('accent') },
        subtitle: { color: linked('main-color') },
        parts: { design: { elements: [text('tp', linked('accent'))] } },
      },
    };
    const r = resolveAllConfig(cfg);
    const h1 = r.headings.levels.find((l) => l.level === 1)!;
    const hEl = h1.advancedDesign.slot.elements[0] as Extract<DesignElement, { kind: 'text' }>;
    expect(hEl.color?.hex).toBe('#00aa00');
    expect(hEl.dropCap?.color?.hex).toBe('#cc0000');
    const style = r.headingStyles.find((s) => s.id === 'annex')!;
    expect(style.overrides.color?.hex).toBe('#00aa00');
    expect((style.overrides.advancedDesign!.slot.elements[0] as { color: ColorValue }).color.hex).toBe('#00aa00');
    expect((style.header!.elements[0] as { color: ColorValue }).color.hex).toBe('#cc0000');
    expect(style.bodyStyle?.color.hex).toBe('#00aa00');
    expect((r.parts.design.elements[0] as { color: ColorValue }).color.hex).toBe('#00aa00');
    const verso = r.parts.versoDesign.elements[0] as Extract<DesignElement, { kind: 'box' }>;
    expect(verso.style.backgroundColor?.hex).toBe('#cc0000');
    expect(r.toc.levels[0]!.color.hex).toBe('#00aa00');
    expect(r.toc.levels[0]!.numberColor.hex).toBe('#cc0000');
    expect(r.toc.pageNumber.color.hex).toBe('#00aa00');
    expect(r.toc.subtitle.color.hex).toBe('#cc0000');
    expect((r.toc.parts.design.elements[0] as { color: ColorValue }).color.hex).toBe('#00aa00');
  });

  it('callout label colours and body bold / italic colours follow the palette', () => {
    const r = resolveAllConfig({
      colorPalette: palette,
      calloutStyles: [{
        id: 'note', title: 'Note',
        label: { color: linked('accent'), background: linked('main-color'), rule: { enabled: true, color: linked('accent') } },
        body: { boldColor: linked('accent'), italicColor: linked('main-color') },
      }],
    } as PostextConfig);
    const note = r.calloutStyles.find((s) => s.id === 'note')!;
    expect(note.label?.color.hex).toBe('#00aa00');
    expect(note.label?.background.hex).toBe('#cc0000');
    expect(note.label?.rule.color.hex).toBe('#00aa00');
    expect(note.body.boldColor?.hex).toBe('#00aa00');
    expect(note.body.italicColor?.hex).toBe('#cc0000');
  });

  it('bold, italic and references inside a box are painted like outside it (EF-130)', () => {
    // A box style copies `bodyText.boldColor` (the default linked to the main
    // colour when unset) into its body; 1.4.1 left that copy at #295AA3.
    const doc = buildDocument({
      markdown: [
        'Outside, **bold words** and *italic words* and :ref{id="fig-a"} in the text.',
        ':::callout\nInside, **bold words** and *italic words* and :ref{id="fig-a"} in the box.\n:::',
        '::resource{id="fig-a"}',
      ].join('\n\n'),
      resources: [{ id: 'fig-a', typeId: 'figure', kind: 'svg', createdAt: 1, updatedAt: 1, svg: { fileId: 'a', width: 20, height: 10 } }],
    }, {
      colorPalette: [{ id: 'main-color', name: 'Main', value: { hex: '#111315', model: 'hex' } }],
      layout: { layoutType: 'single' },
      header: { elements: [] },
      footer: { elements: [] },
    });
    const paras = doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks))
      .filter((b: VDTBlock) => b.type === 'paragraph' && b.lines.some((l) => l.text.includes('bold words')));
    expect(paras).toHaveLength(2);
    // The second one is the box's.
    expect(paras[0]!.containerId).toBeUndefined();
    expect(paras[1]!.containerId).toBeDefined();
    for (const p of paras) {
      expect(p.boldColor).toBe('#111315');
      expect(p.italicColor).toBe('#111315');
      expect(p.refColor).toBe('#111315');
    }
    expect(paras.map((p) => p.color)).toEqual(['#000000', '#000000']);
    const note = resolveAllConfig({ colorPalette: palette }).calloutStyles.find((s) => s.id === 'note')!;
    expect(note.body.boldColor).toEqual({ hex: '#cc0000', model: 'hex', paletteId: 'main-color' });
  });

  it('paragraph-style bold and italic colours (EF-68) follow the palette too', () => {
    const r = resolveAllConfig({
      colorPalette: palette,
      paragraphStyles: [{ id: 'lead', color: linked('main-color'), boldColor: linked('accent'), italicColor: linked('accent') }],
    } as PostextConfig);
    const lead = r.paragraphStyles.find((s) => s.id === 'lead')!;
    expect(lead.color.hex).toBe('#cc0000');
    expect(lead.boldColor?.hex).toBe('#00aa00');
    expect(lead.italicColor?.hex).toBe('#00aa00');
    expect(lead.italicColor?.paletteId).toBe('accent');
  });

  it('a part override still recolours a re-linked design colour on its pages', () => {
    const cfg: PostextConfig = {
      colorPalette: palette,
      headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }] },
      header: { elements: [box('tab', linked('accent'), linked('accent'))] },
    };
    const markdown = ['# Zero', '', 'Words.', '', ':::part{number="II" title="Two" palette="accent=#f6c297"}', ':::', '', '# One', '', 'Words.'].join('\n');
    const doc = buildDocument({ markdown }, cfg);
    const colors = doc.pages
      .map((p) => (p.header?.blocks[0] as { box?: { backgroundColor?: string } } | undefined)?.box?.backgroundColor?.toLowerCase())
      .filter((c): c is string => c !== undefined);
    expect(colors[0]).toBe('#00aa00');
    expect(colors[colors.length - 1]).toBe('#f6c297');
  });

  it('a link to a palette entry that does not exist keeps its stored colour', () => {
    const r = resolveAllConfig({ colorPalette: palette, header: { elements: [rule('r', linked('gone', '#123456'))] } });
    expect((r.header.elements[0] as { color: ColorValue }).color.hex).toBe('#123456');
  });

  it('retinting through htmlViewer overrides reaches the designs too', () => {
    const cfg: PostextConfig = {
      colorPalette: palette,
      header: { elements: [rule('r', linked('accent'))] },
      htmlViewer: { overrides: { colorPalette: [{ id: 'accent', name: 'Accent', value: { hex: '#ffffff', model: 'hex' } }] } },
    };
    const r = resolveAllConfig(applyHtmlViewerOverrides(cfg));
    expect((r.header.elements[0] as { color: ColorValue }).color.hex).toBe('#ffffff');
  });

  it('applyPaletteToConfig resolves the design colours of a raw config', () => {
    const out = applyPaletteToConfig({ colorPalette: palette, header: { elements: [rule('r', linked('accent'))] }, bodyText: { referenceColor: linked('accent') } })!;
    expect((out.header!.elements[0] as { color: ColorValue }).color.hex).toBe('#00aa00');
    expect(out.bodyText!.referenceColor!.hex).toBe('#00aa00');
  });

  it('leaves a config whose links already match untouched (same objects)', () => {
    const header = { elements: [rule('r', { hex: '#00aa00', model: 'hex', paletteId: 'accent' })] };
    const resolved = resolveAllConfig({ colorPalette: palette, header });
    const again = applyPaletteToResolvedConfig(resolved, palette);
    expect(again.header).toBe(resolved.header);
  });
});
