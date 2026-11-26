import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument } from 'postext';
import type { PostextConfig, VDTDocument } from 'postext';
import { renderToPdf } from '../pdf-backend/index.js';
import { parseFontString } from '../fontString.js';

// The page negative (#1722): a white fill in Difference over the page. The
// page carries a transparency group and an opaque white ground under its
// art, so every renderer blends the fill with the paper as well as the ink
// and shows the page dark.

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
const fontProvider = async () => new Uint8Array(fontBytes);
const face = fontkit.create(fontBytes);

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const sizePx = parseFontString(this.font)?.sizePx ?? 16;
    const run = face.layout(s);
    return { width: (run.advanceWidth / face.unitsPerEm) * sizePx };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config: PostextConfig = {
  page: { width: pt(200), height: pt(260), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] },
};

let doc: VDTDocument;
const out: Record<string, Uint8Array> = {};

beforeAll(async () => {
  doc = buildDocument({ markdown: 'A short paragraph of body text on a page shown in negative.', metadata: { title: 'Negative' } }, config);
  out.rgb = await renderToPdf(doc, { fontProvider, pageNegative: true });
  out.grey = await renderToPdf(doc, { fontProvider, pageNegative: true, colorSpace: 'grayscale' });
  out.plain = await renderToPdf(doc, { fontProvider });
}, 60_000);

const hasPdftoppm = (() => {
  try {
    execFileSync('pdftoppm', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

/** The mean lightness of page 1 rendered by Poppler, 0 (black) to 255. */
function meanLightness(bytes: Uint8Array): number {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'postext-negative-'));
  try {
    const file = path.join(dir, 'page.pdf');
    fs.writeFileSync(file, bytes);
    execFileSync('pdftoppm', ['-r', '24', '-gray', '-f', '1', '-l', '1', file, path.join(dir, 'p')]);
    const pgm = fs.readFileSync(path.join(dir, fs.readdirSync(dir).find((f) => f.endsWith('.pgm'))!));
    // P5 header: magic, width, height, maxval, each followed by whitespace.
    let at = 0;
    for (let fields = 0; fields < 4; at++) if (/\s/.test(String.fromCharCode(pgm[at]!)) && !/\s/.test(String.fromCharCode(pgm[at - 1] ?? 32))) fields++;
    const px = pgm.subarray(at);
    let sum = 0;
    for (const v of px) sum += v;
    return sum / px.length;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('the page negative', () => {
  it('gives a negative page a transparency group', async () => {
    for (const key of ['rgb', 'grey'] as const) {
      const pdf = await PDFDocument.load(out[key]!);
      const group = pdf.getPage(0).node.lookup(PDFName.of('Group'));
      expect(group).toBeInstanceOf(PDFDict);
      expect((group as PDFDict).get(PDFName.of('S'))).toBe(PDFName.of('Transparency'));
    }
    const plain = await PDFDocument.load(out.plain!);
    expect(plain.getPage(0).node.get(PDFName.of('Group'))).toBeUndefined();
  });

  it.skipIf(!hasPdftoppm)('shows the page dark in Poppler', () => {
    expect(meanLightness(out.plain!)).toBeGreaterThan(200);
    expect(meanLightness(out.rgb!)).toBeLessThan(60);
    expect(meanLightness(out.grey!)).toBeLessThan(60);
  });
});
