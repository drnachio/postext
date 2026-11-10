import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { buildDocument } from 'postext';
import type { PostextConfig } from 'postext';
import { renderToPdf } from '../pdf-backend/index.js';

// An underlined link (`:underline[[text](url)]`) under a link style that underlines
// links: the PDF draws one line under the link, the link's, when the style
// lists the PDF, and the whole underline when it does not.

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

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
const fontProvider = async () => new Uint8Array(fontBytes);

const pt = (value: number) => ({ value, unit: 'pt' as const });

async function strokeWidths(outputs: ('pdf' | 'html')[]): Promise<string[]> {
  const config: PostextConfig = {
    page: { width: pt(400), height: pt(300), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
    bodyText: { textAlign: 'left' },
    links: { style: { underline: 'solid', outputs } },
  };
  const doc = buildDocument({ markdown: 'Please :underline[sign [here](https://example.org) now].' }, config);
  const pdf = await PDFDocument.load(await renderToPdf(doc, { fontProvider }));
  const contents = pdf.getPage(0).node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  const text = refs.map((ref) => {
    const s = pdf.context.lookup(ref);
    return s instanceof PDFRawStream ? new TextDecoder('latin1').decode(decodePDFRawStream(s).decode()) : '';
  }).join('\n');
  // The width of each straight line stroked: `w`, then `m`, `l`, `S`.
  const ops = text.split('\n');
  const out: string[] = [];
  let width = '';
  for (let i = 0; i < ops.length; i++) {
    const w = / (\S+) w$/.exec(` ${ops[i]}`);
    if (w) width = w[1]!;
    if (ops[i]!.endsWith(' m') && ops[i + 1]?.endsWith(' l') && ops[i + 2] === 'S') out.push(width);
  }
  return out;
}

describe('an underlined link in the PDF', () => {
  it('draws the link’s line under the link and the underline around it', async () => {
    const own = await strokeWidths(['pdf']);
    const other = await strokeWidths(['html']);
    // Three lines either way: the link's and two pieces of the underline,
    // or the underline's three pieces.
    expect(own).toHaveLength(3);
    expect(other).toHaveLength(3);
    expect(new Set(own).size).toBe(2);
    expect(new Set(other).size).toBe(1);
  });
});
