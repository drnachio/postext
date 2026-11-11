import { describe, expect, it } from 'vitest';
import { resolvePrintConfig } from 'postext';
import type { PrintPdfReport } from 'postext-pdf/worker';
import { DEFAULT_LABELS } from '../types/defaultLabels.js';
import { pdfCheckItems, pdfCheckVerdict, worstSeverity, type PdfCheckInput } from './pdfCheck.js';

const NONE = { vector: false, images: false };
const color = (over: Partial<PrintPdfReport['color']> = {}): PrintPdfReport['color'] => ({
  cmyk: true, rgb: false, deviceRgb: NONE, iccRgb: NONE, gray: false, spots: ['PANTONE 286 C'], registration: true, ...over,
});

const report = (over: Partial<PrintPdfReport> = {}): PrintPdfReport => ({
  version: '1.6',
  pageCount: 64,
  size: 2_400_000,
  pdfx: 'PDF/X-4',
  outputIntent: { identifier: 'FOGRA39', condition: 'Coated FOGRA39', registry: 'http://www.color.org', profileEmbedded: true },
  trimMm: { width: 170, height: 240 },
  mixedTrimPages: 0,
  pagesWithoutTrimBox: 0,
  malformedBoxPages: 0,
  bleedMm: 3,
  fonts: [{ name: 'Lora-Regular', embedded: true, type: 'TrueType' }],
  color: color(),
  transparency: false,
  overprint: true,
  annotations: 0,
  form: false,
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
    expect(sev(input({ report: report({ fonts: [{ name: 'Foo', embedded: false, type: 'Type 1' }] }) }), 'font-Foo-Type 1')).toBe('critical');
    expect(sev(input({ report: report({ pdfx: undefined }) }), 'pdfxMissing')).toBe('critical');
    expect(sev(input({ report: report({ outputIntent: { identifier: 'x', condition: 'x', profileEmbedded: false } }) }), 'profileNotEmbedded')).toBe('critical');
    expect(sev(input({ print: resolvePrintConfig({ standard: 'pdfx1a' }), report: report({ color: color({ rgb: true, iccRgb: { vector: false, images: true }, spots: [] }) }) }), 'rgbIcc')).toBe('critical');
    expect(sev(input({ report: report({ malformedBoxPages: 2 }) }), 'malformedBoxes')).toBe('critical');
    expect(sev(input({ report: report({ bleedMm: 0 }) }), 'bleed')).toBe('warning');
  });

  it('warns about an RGB file meant for print and spot inks it does not separate', () => {
    const rgb = input({
      print: resolvePrintConfig({}),
      report: report({ pdfx: undefined, outputIntent: undefined, color: color({ cmyk: false, rgb: true, deviceRgb: { vector: true, images: false }, spots: [], registration: false }) }),
    });
    expect(sev(rgb, 'noPdfx')).toBe('warning');
    expect(sev(rgb, 'rgb')).toBe('warning');
    expect(sev(rgb, 'spotsLost')).toBe('warning');
  });

  it('tells RGB without a profile from RGB with one, and where it is painted', () => {
    const rgb = (over: Partial<PrintPdfReport['color']>) => report({ color: color({ rgb: true, ...over }) });
    const device = ids(input({ report: rgb({ deviceRgb: { vector: true, images: true } }) })).find((i) => i.id === 'rgbDevice')!;
    expect(device.severity).toBe('critical');
    expect(device.title).toBe('RGB with no profile (DeviceRGB) in vector paint and pictures');
    // Tagged RGB in a PDF/X-4 file: the RIP converts it.
    expect(sev(input({ report: rgb({ iccRgb: { vector: false, images: true } }) }), 'rgbIcc')).toBe('info');
    // DeviceRGB in a CMYK PDF that is not PDF/X: a warning.
    expect(sev(input({ print: resolvePrintConfig({}), colorSpace: 'cmyk', report: rgb({ deviceRgb: { vector: false, images: true } }) }), 'rgbDevice')).toBe('warning');
  });

  it('never passes a file it could not read, or one out of date', () => {
    const unread = ids(input({ report: undefined }));
    expect(unread.map((i) => i.id)).toEqual(['unreadable']);
    expect(pdfCheckVerdict(unread, [])).toBe('critical');
    expect(pdfCheckVerdict(ids(input({ stale: true })), [])).toBe('warning');
    // A clean file is "no problems in what was checked": info folds into ok.
    expect(pdfCheckVerdict(ids(input()), [])).toBe('ok');
  });

  it('lists a face twice when it is used both embedded and not', () => {
    const items = ids(input({ report: report({ fonts: [{ name: 'Lora', embedded: true, type: 'TrueType' }, { name: 'Lora', embedded: false, type: 'TrueType' }] }) }));
    expect(items.find((i) => i.id === 'font-Lora-TrueType')?.severity).toBe('critical');
    expect(items.some((i) => i.id === 'fontsEmbedded')).toBe(false);
  });

  it('notes a stale PDF, a chapter-only PDF and a page count off the signature', () => {
    expect(sev(input({ stale: true }), 'stale')).toBe('warning');
    expect(sev(input({ chapterOnly: true }), 'chapterOnly')).toBe('info');
    expect(sev(input({ report: report({ pageCount: 63 }) }), 'signatures')).toBe('info');
    expect(sev(input(), 'signatures')).toBeUndefined();
  });
});
