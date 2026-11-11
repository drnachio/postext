import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/index.js';
import { paletteTintHex, tintedEntryValue, colorsEqual, resolveColorValue } from '../../defaults/shared.js';
import { authoredCmykColors, authoredSpotColors, overprintColors } from '../../color/authored.js';
import { separatePrintColors } from '../../color/inks.js';
import { partColor } from '../../word/semantic/design/partColor.js';
import type { ColorValue, PostextConfig, Resource } from '../../types.js';
import type { VDTDocument } from '../../vdt.js';

// Tints keep their entry's model and mix over the page colour; colours
// that overprint keep their own hex and survive a part's palette (#1471).

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas ??= class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const BRAND: ColorValue = { hex: '#1f3f99', model: 'cmyk', cmyk: { c: 100, m: 60, y: 0, k: 10 } };
const INK: ColorValue = { hex: '#1f3f99', model: 'spot', spot: { name: 'PANTONE 286 C', cmyk: { c: 100, m: 66, y: 0, k: 2 } } };

const base = (extra: PostextConfig): PostextConfig => ({
  page: { dpi: 72, width: pt(400), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  ...extra,
});

const grounds = (doc: VDTDocument): string[] =>
  doc.blocks.filter((b) => b.type === 'callout').map((frame) =>
    (frame.designOverlay?.blocks ?? []).flatMap((b) => (b.kind === 'box' ? [b.box.backgroundColor] : []))[0]!);

describe('a tint keeps the model of its entry', () => {
  it('scales a CMYK entry\'s inks and a spot entry\'s tint', () => {
    expect(tintedEntryValue(BRAND, 20)).toEqual({ hex: paletteTintHex(BRAND.hex, 20), model: 'cmyk', cmyk: { c: 20, m: 12, y: 0, k: 2 } });
    const spot = tintedEntryValue(INK, 40);
    expect(spot.model).toBe('spot');
    expect(spot.spot).toEqual({ ...INK.spot, tint: 40 });
    expect(tintedEntryValue({ hex: '#295aa3', model: 'hex' }, 8)).toEqual({ hex: '#eef2f8', model: 'hex' });
  });

  it('carries the entry\'s overprint', () => {
    expect(tintedEntryValue({ ...BRAND, overprint: true }, 50).overprint).toBe(true);
  });

  it('mixes over the page colour, and adds the page\'s inks when the page colour is CMYK', () => {
    expect(paletteTintHex('#000000', 50, '#f8f0e0')).toBe('#7c7870');
    const over = tintedEntryValue(BRAND, 50, '#f8f0e0', { c: 0, m: 4, y: 10, k: 0 });
    expect(over.cmyk).toEqual({ c: 50, m: 32, y: 5, k: 5 });
  });

  it('a callout ground at a tint of a CMYK entry prints that entry\'s inks scaled', () => {
    const config = base({
      colorPalette: [{ id: 'main-color', name: 'Main', value: BRAND }],
      calloutStyles: [{ id: 'eq', background: { hex: '#eeeeee', model: 'hex', paletteId: 'main-color', tint: 10 } }],
    });
    const doc = buildDocument({ markdown: ':::callout{type="eq"}\nBox.\n:::' }, config);
    const hex = paletteTintHex(BRAND.hex, 10);
    expect(grounds(doc)).toEqual([hex]);
    expect(authoredCmykColors(doc.config).get(hex)).toEqual({ c: 10, m: 6, y: 0, k: 1 });
  });

  it('a callout ground at a tint of a spot entry stays on its ink', () => {
    const config = base({
      colorPalette: [{ id: 'main-color', name: 'Main', value: INK }],
      calloutStyles: [{ id: 'eq', background: { hex: '#eeeeee', model: 'hex', paletteId: 'main-color', tint: 25 } }],
    });
    const doc = buildDocument({ markdown: ':::callout{type="eq"}\nBox.\n:::' }, config);
    const spot = authoredSpotColors(doc.config).get(grounds(doc)[0]!);
    expect(spot?.name).toBe('PANTONE 286 C');
    expect(spot?.tint).toBe(25);
  });

  it('a ground mixes over a cream page', () => {
    const config = base({
      page: { dpi: 72, width: pt(400), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) }, backgroundColor: { hex: '#f8f0e0', model: 'hex' } },
      colorPalette: [{ id: 'main-color', name: 'Main', value: { hex: '#000000', model: 'hex' } }],
      calloutStyles: [{ id: 'eq', background: { hex: '#eeeeee', model: 'hex', paletteId: 'main-color', tint: 50 } }],
    });
    const doc = buildDocument({ markdown: ':::callout{type="eq"}\nBox.\n:::' }, config);
    expect(grounds(doc)).toEqual(['#7c7870']);
  });
});

describe('tints under a part\'s or a section\'s palette', () => {
  const LAKE = '#2d6a7d';
  const RUST = '#9a5a2e';
  const config = (extra: PostextConfig): PostextConfig => base({
    colorPalette: [{ id: 'main-color', name: 'Main', value: { hex: LAKE, model: 'hex' } }],
    headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }] },
    headingStyles: [{ id: 'guide', palette: { 'main-color': RUST } }],
    ...extra,
  });
  const markdown = '# Plain\n\nText.\n\n# Guided {style="guide"}\n\nText.';

  it('a page colour at a tint takes the section\'s colour at the same strength', () => {
    const doc = buildDocument({ markdown }, config({
      page: { dpi: 72, width: pt(400), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) }, backgroundColor: { hex: '#ffffff', model: 'hex', paletteId: 'main-color', tint: 5 } },
    }));
    expect(doc.pages.at(-1)!.background).toBe(paletteTintHex(RUST, 5));
  });

  it('a table cell ground at a tint follows the section at its strength', () => {
    const resources: Resource[] = [{
      id: 't', typeId: 'table', kind: 'table', createdAt: 0, updatedAt: 0, placement: { position: 'here' },
      table: { model: { headerRowCount: 0, rows: [[{ content: 'A', background: { hex: '#eeeeee', model: 'hex', paletteId: 'main-color', tint: 20 } }, { content: 'B' }]] } },
    } as Resource];
    const doc = buildDocument({ markdown: '# Plain\n\n::resource{id="t"}\n\n# Guided {style="guide"}\n\n::resource{id="t"}', resources }, config({}));
    const fills = doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks))
      .flatMap((b) => b.resourceBlock?.table?.cells ?? []).flatMap((c) => (c.background ? [c.background.toLowerCase()] : []));
    expect(fills).toContain(paletteTintHex(LAKE, 20));
    expect(fills).toContain(paletteTintHex(RUST, 20));
  });

  it('Word gives a tinted link the part\'s colour at its strength', () => {
    const ctx = { resolved: { colorPalette: [{ id: 'main-color', name: 'Main', value: { hex: LAKE, model: 'hex' } }], page: { backgroundColor: { hex: '#ffffff', model: 'hex' } } }, config: {} } as unknown as Parameters<typeof partColor>[0];
    const link: ColorValue = { hex: paletteTintHex(LAKE, 30), model: 'hex', paletteId: 'main-color', tint: 30 };
    expect(partColor(ctx, link, { 'main-color': RUST })?.hex).toBe(paletteTintHex(RUST, 30));
  });

  it('resolveColorValue keeps the link and the tint', () => {
    const v = resolveColorValue({ hex: '#000000', model: 'hex', paletteId: 'main-color', tint: 30 }, [{ id: 'main-color', name: 'Main', value: { hex: LAKE, model: 'hex' } }], { hex: '#000000', model: 'hex' });
    expect(v).toEqual({ hex: paletteTintHex(LAKE, 30), model: 'hex', paletteId: 'main-color', tint: 30 });
  });
});

describe('colours that overprint keep a hex of their own', () => {
  it('a colour that overprints moves off a plain colour\'s hex; the plain one stays', () => {
    const config: PostextConfig = {
      bodyText: { color: { hex: '#c00020', model: 'hex' } },
      headings: { color: { hex: '#c00020', model: 'hex', overprint: true } },
    };
    const out = separatePrintColors(config)!;
    expect(out.bodyText!.color!.hex).toBe('#c00020');
    expect(out.headings!.color!.hex).not.toBe('#c00020');
    expect(overprintColors(out).has('#c00020')).toBe(false);
  });

  it('a book without overprint keeps every colour', () => {
    const config: PostextConfig = { bodyText: { color: { hex: '#c00020', model: 'hex' } }, headings: { color: { hex: '#c00020', model: 'cmyk', cmyk: { c: 0, m: 100, y: 80, k: 10 } } } };
    expect(separatePrintColors(config)).toBe(config);
  });

  it('colorsEqual tells overprint and tint apart', () => {
    expect(colorsEqual({ hex: '#000000', model: 'hex' }, { hex: '#000000', model: 'hex', overprint: true })).toBe(false);
    expect(colorsEqual({ hex: '#000000', model: 'hex', paletteId: 'a' }, { hex: '#000000', model: 'hex', paletteId: 'a', tint: 50 })).toBe(false);
  });

  it('an entry that overprints keeps overprinting in a section\'s colour, off any hex that knocks out', () => {
    const config = base({
      colorPalette: [{ id: 'title', name: 'Title', value: { hex: '#2d6a7d', model: 'hex', overprint: true } }],
      bodyText: { color: { hex: '#9a5a2e', model: 'hex' } },
      headings: { color: { hex: '#2d6a7d', model: 'hex', paletteId: 'title' }, levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }] },
      // The section's title colour is the body text's: it moves one step.
      headingStyles: [{ id: 'guide', palette: { title: '#9a5a2e' } }],
    });
    const doc = buildDocument({ markdown: '# Plain\n\nText.\n\n# Guided {style="guide"}\n\n## Crosshead\n\nText.' }, config);
    const over = overprintColors([doc.config, doc.printColors]);
    expect(over.has('#2d6a7d')).toBe(true);
    expect(over.has('#9a5a2e')).toBe(false);
    const moved = [...over].find((h) => h !== '#2d6a7d')!;
    expect(moved).toBe('#9a5a2f');
    // The section's crosshead is painted in it.
    const crosshead = doc.blocks.find((b) => b.type === 'heading' && b.lines.some((l) => l.text.includes('Crosshead')))!;
    expect(crosshead.color).toBe(moved);
  });

  it('a document without such entries has no printColors', () => {
    const doc = buildDocument({ markdown: '# A\n\nText.' }, base({ colorPalette: [{ id: 'main-color', name: 'Main', value: BRAND }] }));
    expect(doc.printColors).toBeUndefined();
  });
});
