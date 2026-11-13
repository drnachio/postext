import { describe, expect, it } from 'vitest';
import { PDFName } from 'pdf-lib';
import type { ColorValue, ResolvedPrintInk, ResolvedSpotColor } from 'postext';
import { inspectPrintPdf } from '../print/inspectPdf.js';
import { screenVarnishHexes, spotFinishNotes, withInkFinishes } from '../print/finishes.js';
import { extGStates, fillOverprints, inkDocument, renderInk, separationOf, separations } from './inkFixture.js';

// Special inks (#1563, #1566): metallic, foil, fluorescent, white and
// varnish inks print on plates of their own, as the press runs them.

const gold: ColorValue = { hex: '#b8962e', model: 'spot', spot: { name: 'Gold', cmyk: { c: 0, m: 20, y: 60, k: 25 }, finish: { kind: 'metallic' } } };
const foil: ColorValue = { hex: '#c0c0c8', model: 'spot', spot: { name: 'Silver foil', cmyk: { c: 0, m: 0, y: 0, k: 30 }, finish: { kind: 'foil' } } };
const fluo: ColorValue = { hex: '#ff4fa0', model: 'spot', spot: { name: 'Fluo pink', cmyk: { c: 0, m: 80, y: 0, k: 0 }, finish: { kind: 'fluorescent' } } };
const white: ColorValue = { hex: '#fdfdfd', model: 'spot', spot: { name: 'Opaque white', cmyk: { c: 0, m: 0, y: 0, k: 0 }, finish: { kind: 'white' } } };
const varnish: ColorValue = { hex: '#f4f4ee', model: 'spot', spot: { name: 'Varnish', cmyk: { c: 0, m: 0, y: 10, k: 0 }, finish: { kind: 'varnish', sheen: 'gloss' } } };

describe('special inks in a print render', () => {
  it('prints every finish on its own Separation, in PDF/X-4 and PDF/X-1a', async () => {
    for (const standard of ['pdfx4', 'pdfx1a'] as const) {
      const { pdf } = await renderInk(inkDocument([gold, foil, fluo, varnish]), { standard });
      const inks = [...separations(pdf).values()].map((s) => s.ink).sort();
      expect(inks).toEqual(['Fluo pink', 'Gold', 'Silver foil', 'Varnish']);
      // The alternate a proof shows.
      expect(separations(pdf).get(separationOf(pdf, 'Gold')!)!.c1).toEqual([0, 0.2, 0.6, 0.25]);
    }
  });

  it('lists the special inks among the plates a printer sees, beside the output intent', async () => {
    const { bytes } = await renderInk(inkDocument([gold, white, varnish]), { standard: 'pdfx4' });
    const report = await inspectPrintPdf(bytes);
    expect(report.pdfx).toBe('PDF/X-4');
    expect(report.outputIntent?.profileEmbedded).toBe(true);
    expect(report.color.spots).toEqual(['Gold', 'Opaque white', 'Varnish']);
    expect(report.overprint).toBe(true);
  });

  it('overprints a white ink and a varnish by default, and knocks out a metallic ink', async () => {
    const { pdf, content } = await renderInk(inkDocument([gold, white, varnish]), { standard: 'pdfx4' });
    expect(fillOverprints(pdf, content, separationOf(pdf, 'Varnish')!)).toBe(true);
    expect(fillOverprints(pdf, content, separationOf(pdf, 'Opaque white')!)).toBe(true);
    expect(fillOverprints(pdf, content, separationOf(pdf, 'Gold')!)).toBe(false);
    // Overprinting with OPM 1, so a varnish leaves the plates under it.
    const over = [...extGStates(pdf).values()].filter((d) => d.lookup(PDFName.of('op'))?.toString() === 'true');
    expect(over.length).toBeGreaterThan(0);
    for (const d of over) expect(d.lookup(PDFName.of('OPM'))?.toString()).toBe('1');
  });

  it('knocks out a white ink or a varnish the colour or the ink table sets overprint: false on', async () => {
    const whiteOff: ColorValue = { ...white, spot: { ...white.spot!, overprint: false } };
    const a = await renderInk(inkDocument([whiteOff, varnish]), { standard: 'pdfx4', inks: [{ name: 'Varnish', overprint: false }] });
    expect(fillOverprints(a.pdf, a.content, separationOf(a.pdf, 'Opaque white')!)).toBe(false);
    expect(fillOverprints(a.pdf, a.content, separationOf(a.pdf, 'Varnish')!)).toBe(false);
  });

  it('takes the finish from the ink table: an ink it makes a varnish overprints, under its plate name', async () => {
    const plain: ColorValue = { hex: '#eeeee4', model: 'spot', spot: { name: 'Spot UV', cmyk: { c: 0, m: 0, y: 15, k: 0 } } };
    const { pdf, content } = await renderInk(inkDocument([plain]), { standard: 'pdfx4', inks: [{ name: 'Spot UV', pdfName: 'Varnish UV', finish: { kind: 'varnish' } }] });
    const space = separationOf(pdf, 'Varnish UV');
    expect(space).toBeDefined();
    expect(fillOverprints(pdf, content, space!)).toBe(true);
  });

  it('prints a special ink in process only when the ink table says output: process', async () => {
    const { pdf } = await renderInk(inkDocument([gold, varnish]), { standard: 'pdfx4', inks: [{ name: 'Gold', output: 'process' }] });
    expect([...separations(pdf).values()].map((s) => s.ink)).toEqual(['Varnish']);
  });
});

describe('special inks in a job on a few plates', () => {
  it('prints a finish ink the job names on its plate, overprinting', async () => {
    const { pdf, content, warnings } = await renderInk(inkDocument([varnish]), { standard: 'pdfx4', plates: { inks: ['Black', 'Varnish'] } });
    const space = separationOf(pdf, 'Varnish');
    expect(space).toBeDefined();
    expect(fillOverprints(pdf, content, space!)).toBe(true);
    expect(warnings.map((w) => w.kind)).not.toContain('finishInkDropped');
  });

  it('leaves out a varnish or a white the job does not print, with a warning, and projects a metallic ink', async () => {
    const { pdf, content, warnings } = await renderInk(inkDocument([varnish, white, gold]), { standard: 'pdfx1a', plates: { inks: ['Black', 'PANTONE 286 C'] }, inks: [{ name: 'PANTONE 286 C', cmyk: { c: 100, m: 66, y: 0, k: 2 } }] });
    const inks = [...separations(pdf).values()].map((s) => s.ink);
    expect(inks).not.toContain('Varnish');
    expect(inks).not.toContain('Opaque white');
    expect(inks).not.toContain('Gold');
    const dropped = warnings.filter((w) => w.kind === 'finishInkDropped').map((w) => w.message);
    expect(dropped.some((m) => m?.includes('"Varnish"'))).toBe(true);
    expect(dropped.some((m) => m?.includes('"Opaque white"'))).toBe(true);
    expect(dropped.some((m) => m?.includes('"Gold"'))).toBe(false);
    // Left out as no ink at all: 0 0 0 0 under an overprinting state.
    expect(content).toMatch(/\b0 0 0 0 k\b/);
  });
});

describe('special inks on screen', () => {
  it('paints no varnish in an RGB render, and the other finishes in their screen colour', async () => {
    const { pdf, content } = await renderInk(inkDocument([gold, varnish]), undefined);
    expect(separations(pdf).size).toBe(0);
    // Gold #b8962e paints as itself; the varnish #f4f4ee nowhere.
    expect(content).toMatch(/0\.72156\d* 0\.58823\d* 0\.18039\d* rg/);
    expect(content).not.toMatch(/0\.95686\d* 0\.95686\d* 0\.93333\d* rg/);
    // Its band is set fully transparent.
    const clear = [...extGStates(pdf).values()].some((d) => d.lookup(PDFName.of('ca'))?.toString() === '0');
    expect(clear).toBe(true);
  });

  it('leaves an RGB render of a book without varnish as it was', async () => {
    const a = await renderInk(inkDocument([gold]), undefined);
    const b = await renderInk(inkDocument([{ ...gold, spot: { name: 'Gold', cmyk: gold.spot!.cmyk } }]), undefined);
    expect(a.bytes).toEqual(b.bytes);
  });
});

describe('finish helpers', () => {
  const spot = (name: string, overprint = false): ResolvedSpotColor => ({ name, cmyk: { c: 0, m: 0, y: 0, k: 0 }, tint: 100, overprint });
  const ink = (over: Partial<ResolvedPrintInk>): ResolvedPrintInk => ({ name: 'x', aliases: [], pdfName: over.name ?? 'x', output: 'spot', ...over });

  it('reads each colour\'s finish and its overprint only when it sets one', () => {
    const notes = spotFinishNotes({ a: varnish, b: { ...white, spot: { ...white.spot!, overprint: false } }, c: { hex: '#000001', model: 'spot', spot: { name: 'P', cmyk: { c: 0, m: 0, y: 0, k: 100 }, finish: { kind: 'nope' } } } });
    expect(notes.get('#f4f4ee')).toEqual({ name: 'Varnish', finish: { kind: 'varnish', sheen: 'gloss' } });
    expect(notes.get('#fdfdfd')).toEqual({ name: 'Opaque white', finish: { kind: 'white' }, overprint: false });
    expect(notes.get('#000001')).toEqual({ name: 'P' });
  });

  it('keeps an ordinary ink\'s spot colour as the same object', () => {
    const plain = spot('PANTONE 286 C');
    const out = withInkFinishes(new Map([['#1f3f99', plain]]), new Map([['#1f3f99', { name: 'PANTONE 286 C' }]]), []);
    expect(out.get('#1f3f99')).toBe(plain);
  });

  it('defaults a white and a varnish to overprint; the table, then the colour, decide otherwise', () => {
    const spots = new Map([['#1', spot('W')], ['#2', spot('V')], ['#3', spot('G')]]);
    const notes = new Map([['#1', { name: 'W', finish: { kind: 'white' as const } }], ['#2', { name: 'V', finish: { kind: 'varnish' as const }, overprint: false }], ['#3', { name: 'G' }]]);
    const out = withInkFinishes(spots, notes, [ink({ name: 'G', finish: { kind: 'varnish' } })]);
    expect(out.get('#1')).toMatchObject({ overprint: true, finish: { kind: 'white' } });
    expect(out.get('#2')).toMatchObject({ overprint: false, finish: { kind: 'varnish' } });
    expect(out.get('#3')).toMatchObject({ overprint: true, finish: { kind: 'varnish' } });
    const off = withInkFinishes(spots, notes, [ink({ name: 'W', overprint: false })]);
    expect(off.get('#1')!.overprint).toBe(false);
  });

  it('collects the varnish hexes a screen render skips, through the ink table too', () => {
    const plain: ColorValue = { hex: '#eeeee4', model: 'spot', spot: { name: 'Spot UV', cmyk: { c: 0, m: 0, y: 15, k: 0 } } };
    expect([...screenVarnishHexes([{ a: varnish, b: gold }], [])]).toEqual(['#f4f4ee']);
    expect([...screenVarnishHexes([{ a: plain }], [ink({ name: 'Spot UV', finish: { kind: 'varnish' } })])]).toEqual(['#eeeee4']);
    expect(screenVarnishHexes([{ a: gold }], []).size).toBe(0);
  });
});
