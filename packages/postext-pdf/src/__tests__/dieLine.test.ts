import { describe, expect, it } from 'vitest';
import { PDFArray, PDFDict, PDFName } from 'pdf-lib';
import type { ColorValue, PrintConfig, VDTDieCut, VDTDocument, VDTPathCommand } from 'postext';
import { inspectPrintPdf } from '../print/inspectPdf.js';
import { dieLinePaths } from '../pdf-backend/page/dieLine.js';
import { extGStates, inkDocument, renderInk, separationOf, separations } from './inkFixture.js';

// The die line (#1566): the holes and the outline a die cuts, stroked on a
// plate of their own that overprints, as an artifact, in an optional
// content group "Die line" (none in PDF/X-1a).

const rect = (x: number, y: number, w: number, h: number): VDTPathCommand[] => [
  { op: 'M', x, y }, { op: 'L', x: x + w, y }, { op: 'L', x: x + w, y: y + h }, { op: 'L', x, y: y + h }, { op: 'Z' },
];
/** A rounded fore-edge corner: the outline of a shaped leaf. */
const outline: VDTPathCommand[] = [
  { op: 'M', x: 50, y: 50 }, { op: 'L', x: 500, y: 50 }, { op: 'C', x1: 530, y1: 50, x2: 550, y2: 70, x: 550, y: 100 },
  { op: 'L', x: 550, y: 550 }, { op: 'L', x: 50, y: 550 }, { op: 'Z' },
];
const cut: VDTDieCut = { holes: [rect(200, 200, 120, 80)], outline: [outline], sources: ['window'], wrapGapPx: [0] };

const varnish: ColorValue = { hex: '#f4f4ee', model: 'spot', spot: { name: 'Varnish', cmyk: { c: 0, m: 0, y: 10, k: 0 }, finish: { kind: 'varnish' } } };
const gold: ColorValue = { hex: '#b8962e', model: 'spot', spot: { name: 'Gold', cmyk: { c: 0, m: 20, y: 60, k: 25 }, finish: { kind: 'metallic' } } };

function withCut(doc: VDTDocument, c: VDTDieCut = cut): VDTDocument {
  doc.pages[0]!.dieCut = c;
  return doc;
}

/** The content of the die line: from its plate's colour space to the end. */
function dieOps(content: string, space: string): string {
  const at = content.indexOf(`/${space} CS`);
  return at < 0 ? '' : content.slice(content.lastIndexOf('\nq\n', at));
}

describe('the die line', () => {
  it('strokes the holes and the outline on a Die Separation in PDF/X-4, inside an optional content group', async () => {
    const { pdf, content } = await renderInk(withCut(inkDocument([gold])), { standard: 'pdfx4' });
    const space = separationOf(pdf, 'Die');
    expect(space).toBeDefined();
    // Its alternate, 100 % magenta by default.
    expect(separations(pdf).get(space!)!.c1).toEqual([0, 1, 0, 0]);
    expect(content).toContain(`/${space} CS\n1 SCN`);
    // After the crop marks.
    expect(content.lastIndexOf('/CSAll')).toBeLessThan(content.indexOf(`/${space} CS`));
    // A rectangle hole and the curved outline, each closed, one stroke.
    const ops = dieOps(content, space!);
    expect(ops.match(/ m\n/g)!.length).toBe(2);
    expect(ops).toMatch(/ c\n/);
    expect(ops.match(/\nS\n/g)!.length).toBe(1);
    // The optional content group.
    const oc = pdf.catalog.lookup(PDFName.of('OCProperties'), PDFDict);
    const ocgs = oc.lookup(PDFName.of('OCGs'), PDFArray);
    expect(ocgs.size()).toBe(1);
    const group = ocgs.lookup(0, PDFDict);
    expect(group.lookup(PDFName.of('Type'))?.toString()).toBe('/OCG');
    const d = oc.lookup(PDFName.of('D'), PDFDict);
    expect(d.lookup(PDFName.of('Name'))).toBeDefined();
    expect(d.lookup(PDFName.of('ON'), PDFArray).size()).toBe(1);
    const props = pdf.getPage(0).node.Resources()!.lookup(PDFName.of('Properties'), PDFDict);
    const [[layerName, layerRef]] = props.entries();
    expect(pdf.context.lookup(layerRef)).toBe(group);
    expect(content).toContain(`/OC ${layerName!.toString()} BDC`);
    const report = await inspectPrintPdf((await renderInk(withCut(inkDocument([gold])), { standard: 'pdfx4' })).bytes);
    expect(report.layers).toEqual(['Die line']);
  });

  it('overprints, on its own state with OPM 1', async () => {
    const { pdf, content } = await renderInk(withCut(inkDocument([])), { standard: 'pdfx4' });
    const ops = dieOps(content, separationOf(pdf, 'Die')!);
    const gs = /\/(\S+) gs/.exec(ops)![1]!;
    const state = extGStates(pdf).get(gs)!;
    expect(state.lookup(PDFName.of('OP'))?.toString()).toBe('true');
    expect(state.lookup(PDFName.of('op'))?.toString()).toBe('true');
    expect(state.lookup(PDFName.of('OPM'))?.toString()).toBe('1');
    // Nothing the print pass adds switches it off before the stroke.
    expect(ops.match(/ gs\n/g)!.length).toBe(1);
  });

  it('writes the plate but no optional content in PDF/X-1a', async () => {
    const { pdf, content } = await renderInk(withCut(inkDocument([gold])), { standard: 'pdfx1a' });
    expect(separationOf(pdf, 'Die')).toBeDefined();
    expect(pdf.catalog.get(PDFName.of('OCProperties'))).toBeUndefined();
    expect(content).not.toMatch(/\/OC \S+ BDC/);
  });

  it('is an artifact in a tagged PDF', async () => {
    const { pdf, content } = await renderInk(withCut(inkDocument([])), { standard: 'pdfx4' }, { accessible: true });
    const ops = dieOps(content, separationOf(pdf, 'Die')!);
    const before = content.slice(0, content.length - ops.length);
    expect(before).toMatch(/\/Artifact <<\s*\/Type \/Layout\s*>> BDC\n\/OC \S+ BDC$/);
    expect(ops.trimEnd()).toMatch(/Q\nEMC\nEMC$/);
  });

  it('takes its plate name, alternate and width from print.dieLine, a name a plate can carry', async () => {
    const print: PrintConfig = { standard: 'pdfx4', dieLine: { ink: 'CutContour', cmyk: { c: 0, m: 0, y: 100, k: 0 }, width: { value: 0.5, unit: 'pt' } } };
    const { pdf, content } = await renderInk(withCut(inkDocument([])), print);
    const space = separationOf(pdf, 'CutContour')!;
    expect(separations(pdf).get(space)!.c1).toEqual([0, 0, 1, 0]);
    expect(dieOps(content, space)).toContain('\n0.5 w\n');
    const all = await renderInk(withCut(inkDocument([])), { standard: 'pdfx4', dieLine: { ink: 'All' } });
    expect(separationOf(all.pdf, 'All ink')).toBeDefined();
  });

  it('is left out with output: none, and on pages without a die-cut', async () => {
    const none = await renderInk(withCut(inkDocument([])), { standard: 'pdfx4', dieLine: { output: 'none' } });
    expect(separationOf(none.pdf, 'Die')).toBeUndefined();
    expect(none.pdf.catalog.get(PDFName.of('OCProperties'))).toBeUndefined();
    const plain = await renderInk(inkDocument([]), { standard: 'pdfx4' });
    expect(plain.pdf.catalog.get(PDFName.of('OCProperties'))).toBeUndefined();
    expect(plain.bytes).toEqual(none.bytes);
  });

  it('adds its operators after the page and changes nothing before them', async () => {
    for (const print of [{ standard: 'pdfx4' }, { standard: 'pdfx1a' }, undefined] as const) {
      const plain = await renderInk(inkDocument([gold, varnish]), print);
      const cutDoc = await renderInk(withCut(inkDocument([gold, varnish])), print);
      expect(cutDoc.content.startsWith(plain.content)).toBe(true);
      expect(cutDoc.content.length).toBeGreaterThan(plain.content.length);
    }
  });

  it('is never projected in a job on a few plates: the die plate stays its own', async () => {
    const { pdf, warnings } = await renderInk(withCut(inkDocument([gold])), { standard: 'pdfx4', plates: { inks: ['Black'] } });
    expect([...separations(pdf).values()].map((s) => s.ink)).toEqual(['Die']);
    expect(warnings.map((w) => w.kind)).not.toContain('finishInkDropped');
  });

  it('lists the die plate among the inks a printer sees', async () => {
    const { bytes } = await renderInk(withCut(inkDocument([gold, varnish])), { standard: 'pdfx4' });
    const report = await inspectPrintPdf(bytes);
    expect(report.color.spots).toEqual(['Die', 'Gold', 'Varnish']);
  });
});

describe('die line paths', () => {
  it('takes every hole, then the outline, and skips empty ones', () => {
    expect(dieLinePaths(undefined)).toEqual([]);
    expect(dieLinePaths({ holes: [rect(0, 0, 1, 1), []], sources: ['a', 'b'], wrapGapPx: [0, 0] })).toHaveLength(1);
    expect(dieLinePaths(cut)).toEqual([cut.holes[0], outline]);
  });
});
