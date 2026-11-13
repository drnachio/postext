// `postext pdf --die-line page|none` (#1566): the flag sets
// `print.dieLine.output` over the book's settings.
import { describe, expect, it } from 'bun:test';
import { Options, UsageError } from '../args';
import { PDF_OPTIONS } from '../commands';
import type { FontSet } from '../fonts';
import type { Book } from '../input';
import type { Reporter } from '../log';
import { pdfOptions } from '../outputs/pdf';

const book = (print?: object): Book => ({ kind: 'markdown', name: 'b', id: 'b', locale: 'en', chapters: [], config: print ? { print } : {}, resources: [], fonts: [], files: new Map() }) as unknown as Book;
const fonts = { provider: () => async () => new Uint8Array() } as unknown as FontSet;
const reporter = { warn: () => {}, detail: () => {} } as unknown as Reporter;

describe('--die-line', () => {
  it('is listed among the pdf options', () => {
    const spec = PDF_OPTIONS.find((o) => o.name === 'die-line');
    expect(spec?.arg).toBe('page|none');
  });

  it('sets print.dieLine.output, keeping the book\'s other die line settings', async () => {
    const none = await pdfOptions(book({ dieLine: { ink: 'CutContour' }, standard: 'pdfx4' }), fonts, new Options({ 'die-line': 'none' }), reporter);
    expect(none.print?.dieLine).toEqual({ ink: 'CutContour', output: 'none' });
    expect(none.print?.standard).toBe('pdfx4');
    const page = await pdfOptions(book(), fonts, new Options({ 'die-line': 'page' }), reporter);
    expect(page.print?.dieLine).toEqual({ output: 'page' });
  });

  it('leaves the book\'s settings alone without it', async () => {
    const out = await pdfOptions(book({ dieLine: { output: 'none' } }), fonts, new Options({}), reporter);
    expect(out.print).toBeUndefined();
  });

  it('refuses another value', async () => {
    await expect(pdfOptions(book(), fonts, new Options({ 'die-line': 'maybe' }), reporter)).rejects.toBeInstanceOf(UsageError);
  });
});
