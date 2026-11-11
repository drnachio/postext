import { describe, expect, it } from 'vitest';
import { inkEntry, inkNameProblem, printableInkName, printedSpot, processCmykOfSpot, separatePrintColors, similarInkNames } from '../../color/inks.js';
import { resolvePrintConfig, resolvePrintInks, stripPrintDefaults } from '../../defaults/output/print.js';
import { resolveAllConfig } from '../../pipeline/config.js';
import { authoredCmykColors, authoredSpotColors } from '../../color/authored.js';
import type { ColorValue, PostextConfig } from '../../types.js';

const spot = (hex: string, name: string, tint?: number): ColorValue => ({ hex, model: 'spot', spot: { name, cmyk: { c: 100, m: 66, y: 0, k: 2 }, ...(tint !== undefined ? { tint } : {}) } });

describe('separatePrintColors', () => {
  it('gives two inks painted with one screen hex a hex each, a step apart', () => {
    const config: PostextConfig = {
      colorPalette: [
        { id: 'a', name: 'A', value: spot('#1f3f99', 'PANTONE 286 C') },
        { id: 'b', name: 'B', value: spot('#1f3f99', 'Azul') },
      ],
    };
    const out = separatePrintColors(config);
    expect(out).not.toBe(config);
    expect(config.colorPalette![1]!.value.hex).toBe('#1f3f99');
    expect(out!.colorPalette![0]!.value.hex).toBe('#1f3f99');
    expect(out!.colorPalette![1]!.value.hex).toBe('#1f3f9a');
    expect([...authoredSpotColors(out).values()].map((s) => s.name)).toEqual(['PANTONE 286 C', 'Azul']);
  });

  it('moves a CMYK colour off a spot colour’s hex, and leaves a plain screen colour on it', () => {
    const config: PostextConfig = {
      colorPalette: [{ id: 'brand', name: 'Brand', value: spot('#1f3f99', 'PANTONE 286 C') }],
      bodyText: { color: { hex: '#1F3F99', model: 'cmyk', cmyk: { c: 90, m: 70, y: 0, k: 0 } } },
      headings: { color: { hex: '#1f3f99', model: 'hex' } },
    };
    const out = separatePrintColors(config)!;
    expect(out.bodyText!.color!.hex).toBe('#1f3f9a');
    expect(out.headings!.color!.hex).toBe('#1f3f99');
    expect(authoredCmykColors(out).get('#1f3f9a')).toEqual({ c: 90, m: 70, y: 0, k: 0 });
  });

  it('skips a hex the configuration already uses, keeps the alpha, and moves every copy of one paint alike', () => {
    const tint = spot('#1f3f99cc', 'Azul', 40);
    const config: PostextConfig = {
      colorPalette: [{ id: 'a', name: 'A', value: spot('#1f3f99', 'PANTONE 286 C') }],
      bodyText: { color: tint },
      headings: { color: { ...tint } },
      page: { backgroundColor: { hex: '#1f3f9a', model: 'hex' } },
    };
    const out = separatePrintColors(config)!;
    expect(out.bodyText!.color!.hex).toBe('#1f3f98cc');
    expect(out.headings!.color!.hex).toBe('#1f3f98cc');
  });

  it('leaves a palette-linked colour to its entry, and returns the configuration itself when nothing collides', () => {
    const config: PostextConfig = {
      colorPalette: [{ id: 'a', name: 'A', value: spot('#1f3f99', 'PANTONE 286 C') }],
      bodyText: { color: { ...spot('#1f3f99', 'PANTONE 286 C'), paletteId: 'a' } },
      headings: { color: spot('#1f3f99', 'PANTONE 286 C') },
    };
    expect(separatePrintColors(config)).toBe(config);
  });

  it('leaves two CMYK colours that share a hex where they are, so a book without spot colours keeps its colours', () => {
    const config: PostextConfig = {
      bodyText: { color: { hex: '#1f3f99', model: 'cmyk', cmyk: { c: 90, m: 70, y: 0, k: 0 } } },
      headings: { color: { hex: '#1f3f99', model: 'cmyk', cmyk: { c: 100, m: 66, y: 0, k: 2 } } },
    };
    expect(separatePrintColors(config)).toBe(config);
  });

  it('moves a colour that overprints off a hex another colour prints differently, and leaves a book without overprint or spot colours as it is', () => {
    const cmyk = (hex: string, overprint?: boolean): ColorValue => ({ hex, model: 'cmyk', cmyk: { c: 0, m: 100, y: 80, k: 10 }, ...(overprint ? { overprint } : {}) });
    const config: PostextConfig = { bodyText: { color: cmyk('#c00020') }, headings: { color: cmyk('#c00020', true) } };
    const out = separatePrintColors(config);
    expect(out.bodyText!.color!.hex).toBe('#c00020');
    expect(out.headings!.color!.hex).not.toBe('#c00020');
    const plain: PostextConfig = { bodyText: { color: cmyk('#c00020') }, headings: { color: cmyk('#c00020') } };
    expect(separatePrintColors(plain)).toBe(plain);
  });

  it('runs inside the configuration resolver, so the layout paints the separated hex', () => {
    const resolved = resolveAllConfig({
      colorPalette: [
        { id: 'a', name: 'A', value: spot('#1f3f99', 'PANTONE 286 C') },
        { id: 'b', name: 'B', value: spot('#1f3f99', 'Azul') },
      ],
      bodyText: { color: { hex: '#000000', model: 'hex', paletteId: 'b' } },
    });
    expect(resolved.bodyText.color.hex).toBe('#1f3f9a');
  });
});

describe('the ink table', () => {
  const inks = resolvePrintInks([
    { name: 'Azul corporativo', aliases: ['Pantone 286C'], pdfName: 'PANTONE 286 C', overprint: true },
    { name: 'Oro', output: 'process', cmyk: { c: 20, m: 30, y: 70, k: 15 } },
    { name: '  ' },
  ]);

  it('resolves names, aliases and defaults, dropping an entry without a name', () => {
    expect(inks).toHaveLength(2);
    expect(inks[1]).toMatchObject({ name: 'Oro', pdfName: 'Oro', aliases: [], output: 'process' });
    expect(resolvePrintConfig({}).inks).toEqual([]);
  });

  it('matches a name or an alias ignoring case and runs of spaces', () => {
    expect(inkEntry('azul  CORPORATIVO', inks)?.name).toBe('Azul corporativo');
    expect(inkEntry('PANTONE 286c', inks)?.name).toBe('Azul corporativo');
    expect(inkEntry('PANTONE 286 C', inks)).toBeUndefined();
  });

  it('renames the plate, overrides its values, and sends an ink to process at its tint', () => {
    const s = { name: 'Pantone 286C', cmyk: { c: 100, m: 66, y: 0, k: 2 }, tint: 50, overprint: false };
    expect(printedSpot(s, inks)).toEqual({ ...s, name: 'PANTONE 286 C', overprint: true });
    const oro = { name: 'oro', cmyk: { c: 0, m: 0, y: 0, k: 100 }, tint: 50, overprint: false };
    expect(printedSpot(oro, inks)).toBeUndefined();
    expect(processCmykOfSpot(oro, inks)).toEqual({ c: 10, m: 15, y: 35, k: 7.5 });
    const other = { ...s, name: 'Varnish' };
    expect(printedSpot(other, inks)).toBe(other);
  });

  it('keeps the table when the defaults are stripped', () => {
    expect(stripPrintDefaults({ inks: [{ name: 'Oro', output: 'process' }] })).toEqual({ inks: [{ name: 'Oro', output: 'process' }] });
  });
});

describe('ink names', () => {
  it('flags the names a PDF reserves and names past 127 bytes', () => {
    expect(inkNameProblem('All')).toBe('reserved');
    expect(inkNameProblem(' none ')).toBe('reserved');
    expect(inkNameProblem('Allure')).toBeUndefined();
    expect(inkNameProblem('é'.repeat(64))).toBe('tooLong');
    expect(inkNameProblem('é'.repeat(63))).toBeUndefined();
    expect(inkNameProblem('Black')).toBe('process');
    expect(inkNameProblem('cyan')).toBe('process');
    expect(inkNameProblem('Black 2X')).toBeUndefined();
    expect(inkNameProblem('Gold\u0007')).toBe('control');
  });

  it('gives every ink a name a plate can carry', () => {
    expect(printableInkName('PANTONE 286 C')).toBe('PANTONE 286 C');
    expect(printableInkName('All')).toBe('All ink');
    expect(printableInkName('none')).toBe('none ink');
    expect(printableInkName('Black')).toBe('Black ink');
    expect(printableInkName('Gold\u0000\u001f')).toBe('Gold');
    expect(printableInkName('\u0001')).toBe('Spot');
    const long = 'é'.repeat(80);
    const a = printableInkName(`${long}a`);
    const b = printableInkName(`${long}b`);
    expect(new TextEncoder().encode(a).length).toBeLessThanOrEqual(127);
    expect(a).not.toBe(b);
    // No character is cut in half.
    expect(a).not.toContain('\ufffd');
  });

  it('groups names that differ only in case or spacing', () => {
    expect(similarInkNames(['PANTONE 185 C', 'Pantone  185 C', 'PANTONE 185C', 'Varnish'])).toEqual([['PANTONE 185 C', 'Pantone  185 C']]);
  });
});
