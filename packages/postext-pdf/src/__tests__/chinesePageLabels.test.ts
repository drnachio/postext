import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFString } from 'pdf-lib';
import { buildDocument } from 'postext';
import type { PostextConfig } from 'postext';
import { renderToPdf } from '../pdf-backend';

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
const fontProvider = async () => new Uint8Array(fontBytes);

// Deterministic text measurement stub (no DOM in the node test env).
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

/** Each page's label as a PDF reader shows it, from the `/PageLabels`
 *  number tree: a `/P` prefix, or a `/S` style from `/St`. */
async function pageLabels(config: PostextConfig, markdown: string): Promise<string[]> {
  const doc = buildDocument({ markdown }, config);
  const pdf = await PDFDocument.load(await renderToPdf(doc, { fontProvider, accessible: false }));
  const tree = pdf.catalog.lookup(PDFName.of('PageLabels'), PDFDict);
  const nums = tree.lookup(PDFName.of('Nums'), PDFArray);
  const starts: { at: number; dict: PDFDict }[] = [];
  for (let i = 0; i < nums.size(); i += 2) {
    starts.push({ at: (nums.lookup(i, PDFNumber)).asNumber(), dict: nums.lookup(i + 1, PDFDict) });
  }
  const out: string[] = [];
  for (let p = 0; p < pdf.getPageCount(); p++) {
    const run = [...starts].reverse().find((r) => r.at <= p)!;
    const prefix = run.dict.lookup(PDFName.of('P'));
    const style = run.dict.lookup(PDFName.of('S'));
    const st = (run.dict.lookup(PDFName.of('St')) as PDFNumber | undefined)?.asNumber() ?? 1;
    const text = prefix instanceof PDFString || prefix instanceof PDFHexString ? prefix.decodeText() : '';
    out.push(style instanceof PDFName && style.asString() === '/D' ? `${text}${st + p - run.at}` : text);
  }
  return out;
}

const config = (format: string): PostextConfig => ({
  bodyText: { fontFamily: 'Lora' },
  page: { width: pt(200), height: pt(160), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) }, pageNumbering: { format: format as never } },
  headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }] },
});
const THREE_PAGES = '# 一\n\nA.\n\n# 二\n\nB.\n\n# 三\n\nC.';

describe('PDF page labels in East Asian styles', () => {
  it('writes each page\'s label, which a reader decodes to 一, 二, 三', async () => {
    expect(await pageLabels(config('trad-chinese-informal'), THREE_PAGES)).toEqual(['一', '二', '三']);
    expect(await pageLabels(config('circled-decimal'), THREE_PAGES)).toEqual(['①', '②', '③']);
  });

  it('keeps the /D code for decimal pages', async () => {
    expect(await pageLabels(config('decimal'), THREE_PAGES)).toEqual(['1', '2', '3']);
  });
});
