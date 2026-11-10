import { describe, expect, it } from 'vitest';
import { resolvePrintConfig } from 'postext';
import type { PrintPdfReport } from 'postext-pdf/worker';
import { DEFAULT_LABELS } from '../types/defaultLabels.js';
import { pdfCheckItems, worstSeverity, type PdfCheckInput } from './pdfCheck.js';

const report = (over: Partial<PrintPdfReport> = {}): PrintPdfReport => ({
  version: '1.6',
  pageCount: 64,
  size: 2_400_000,
  pdfx: 'PDF/X-4',
  outputIntent: { identifier: 'FOGRA39', condition: 'Coated FOGRA39', registry: 'http://www.color.org', profileEmbedded: true },
  trimMm: { width: 170, height: 240 },
  mixedTrimPages: 0,
  pagesWithoutTrimBox: 0,
  bleedMm: 3,
  fonts: [{ name: 'Lora-Regular', embedded: true, subset: true, type: 'TrueType' }],
  color: { cmyk: true, rgb: false, gray: false, spots: ['PANTONE 286 C'], registration: true },
  transparency: false,
  overprint: true,
  annotations: 0,
  tagged: true,
  ...over,
});

const input = (over: Partial<PdfCheckInput> = {}): PdfCheckInput => ({
  report: report(),
  print: resolvePrintConfig({ standard: 'pdfx4' }),
  colorSpace: 'rgb',
  bookSpotInks: ['PANTONE 286 C'],
  cutLines: true,
  stale: false,
  chapterOnly: false,
  ...over,
});

const ids = (inp: PdfCheckInput) => pdfCheckItems(inp, DEFAULT_LABELS);
const sev = (inp: PdfCheckInput, id: string) => ids(inp).find((i) => i.id === id)?.severity;

describe('pdfCheckItems', () => {
  it('passes a well-made PDF/X-4 with its plates listed', () => {
    const items = ids(input());
    expect(worstSeverity(items.map((i) => i.severity))).toBe('info');
    const plates = items.find((i) => i.id === 'plates')!;
    expect(plates.title).toBe('5 plates');
    expect(plates.detail).toBe('CMYK + PANTONE 286 C');
  });

  it('flags what spoils a print file', () => {
    expect(sev(input({ report: report({ fonts: [{ name: 'Foo', embedded: false, subset: false, type: 'Type 1' }] }) }), 'font-Foo')).toBe('critical');
    expect(sev(input({ report: report({ pdfx: undefined }) }), 'pdfxMissing')).toBe('critical');
    expect(sev(input({ report: report({ outputIntent: { identifier: 'x', condition: 'x', profileEmbedded: false } }) }), 'profileNotEmbedded')).toBe('critical');
    expect(sev(input({ print: resolvePrintConfig({ standard: 'pdfx1a' }), report: report({ color: { cmyk: true, rgb: true, gray: false, spots: [], registration: false } }) }), 'rgb')).toBe('critical');
    expect(sev(input({ report: report({ bleedMm: 0 }) }), 'bleed')).toBe('warning');
  });

  it('warns about an RGB file meant for print and spot inks it does not separate', () => {
    const rgb = input({
      print: resolvePrintConfig({}),
      report: report({ pdfx: undefined, outputIntent: undefined, color: { cmyk: false, rgb: true, gray: false, spots: [], registration: false } }),
    });
    expect(sev(rgb, 'noPdfx')).toBe('warning');
    expect(sev(rgb, 'rgb')).toBe('warning');
    expect(sev(rgb, 'spotsLost')).toBe('warning');
  });

  it('notes a stale PDF, a chapter-only PDF and a page count off the signature', () => {
    expect(sev(input({ stale: true }), 'stale')).toBe('warning');
    expect(sev(input({ chapterOnly: true }), 'chapterOnly')).toBe('info');
    expect(sev(input({ report: report({ pageCount: 63 }) }), 'signatures')).toBe('info');
    expect(sev(input(), 'signatures')).toBeUndefined();
  });
});
