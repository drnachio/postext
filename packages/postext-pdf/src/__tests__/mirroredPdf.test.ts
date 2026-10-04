import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { buildDocument } from 'postext';
import type { PostextConfig, VDTDocument } from 'postext';
import fontkit from '@pdf-lib/fontkit';
import { renderToPdf } from '../pdf-backend';
import { parseFontString } from '../fontString';

// Issue #370: a right-to-left page paints its flow through the mirror of
// its frame, each text object turned back about its own box, so the text
// reads (and extracts) as written where the mirrored layout put it.

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
const fontProvider = async () => new Uint8Array(fontBytes);

const face = fontkit.create(Buffer.from(fontBytes));

/** Measures with the face the PDF embeds, so pdftotext sees the words
 *  where the layout set them. */
class StubCtx {
  font = '';
  letterSpacing = '0px';
  measureText(s: string): { width: number } {
    const sizePx = parseFontString(this.font)?.sizePx ?? 16;
    return { width: (face.layout(s).advanceWidth / face.unitsPerEm) * sizePx };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
// No full stops: in a right-to-left paragraph a final stop after Latin
// words is a neutral at the paragraph's level and stands at the line's
// left end (UAX #9); these tests look at the frame.
const MD = ['# Heading', 'First paragraph alpha beta gamma delta epsilon zeta eta theta', 'Second paragraph iota kappa lambda mu nu xi omicron pi rho sigma'].join('\n\n');

function config(direction: 'ltr' | 'rtl'): PostextConfig {
  return {
    direction,
    locale: 'en',
    page: {
      width: pt(300), height: pt(420), dpi: 72,
      margins: { top: pt(40), bottom: pt(40), left: pt(40), right: pt(20), mirror: true },
      ...(direction === 'ltr' ? { binding: 'left' as const } : {}),
    },
    header: { elements: [] },
    footer: { elements: [] },
    bodyText: { fontFamily: 'Lora', fontSize: pt(12), lineHeight: pt(18), textAlign: 'left', hyphenation: { enabled: false } },
  };
}

async function content(doc: VDTDocument): Promise<{ bytes: Uint8Array; ops: string }> {
  const bytes = await renderToPdf(doc, { fontProvider });
  const pdf = await PDFDocument.load(bytes);
  const contents = pdf.getPage(0).node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  const ops = refs.map((ref) => {
    const s = pdf.context.lookup(ref);
    return s instanceof PDFRawStream ? new TextDecoder('latin1').decode(decodePDFRawStream(s).decode()) : '';
  }).join('\n');
  return { bytes, ops };
}

const textMatrices = (ops: string, a: string) =>
  [...ops.matchAll(new RegExp(`^${a} 0 0 1 (-?[\\d.]+) (-?[\\d.]+) Tm$`, 'gm'))].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));

const hasPdftotext = (() => {
  try {
    execFileSync('pdftotext', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe('a right-to-left page in the PDF', () => {
  it('paints the flow through the mirror, text objects turned back', async () => {
    const ltr = await content(buildDocument({ markdown: MD }, config('ltr')));
    const rtl = await content(buildDocument({ markdown: MD }, config('rtl')));
    expect(ltr.ops).not.toMatch(/^-1 0 0 1 300 0 cm$/m);
    expect(rtl.ops).toMatch(/^-1 0 0 1 300 0 cm$/m);
    const a = textMatrices(ltr.ops, '1');
    const b = textMatrices(rtl.ops, '-1');
    expect(a.length).toBeGreaterThan(2);
    expect(b.length).toBeGreaterThanOrEqual(a.length);
    expect(textMatrices(rtl.ops, '1')).toEqual([]);
    // The same baselines, and every text object inside the flow's width.
    expect(new Set(b.map((m) => Math.round(m.y)))).toEqual(new Set(a.map((m) => Math.round(m.y))));
    for (const m of b) expect(m.x).toBeGreaterThan(0);
  });

  it.skipIf(!hasPdftotext)('reads back as written (pdftotext)', async () => {
    const read = async (direction: 'ltr' | 'rtl') => {
      const { bytes } = await content(buildDocument({ markdown: MD }, config(direction)));
      const file = path.join(os.tmpdir(), `postext-mirrored-${process.pid}-${direction}.pdf`);
      fs.writeFileSync(file, bytes);
      const text = execFileSync('pdftotext', ['-enc', 'UTF-8', file, '-'], { encoding: 'utf8' });
      fs.unlinkSync(file);
      return text.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
    };
    const ltr = await read('ltr');
    expect(ltr.join(' ')).toContain('First paragraph alpha');
    // Every line reads as written. (Poppler takes the sheet's left column
    // first: the second one of a right-to-left page.)
    expect([...await read('rtl')].sort()).toEqual([...ltr].sort());
  });
});
