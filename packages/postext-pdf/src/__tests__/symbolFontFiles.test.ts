import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PDFDocument, PDFDict, PDFName } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument } from 'postext';
import type { PostextConfig } from 'postext';
import { renderToPdf, type PdfWarning } from '../pdf-backend/index.js';
import { parseFontString } from '../fontString.js';
import { symbolFaceCandidates } from '../symbolRuns.js';

// #1460: a symbol font served in several files (Noto Sans Math from
// Google's style sheet comes in `unicode-range` slices) draws each
// character from the file that has it, not from its first file alone; it
// is asked for in its regular face only, a bounded number of times.

const font = (name: string) => fs.readFileSync(new URL(`../../../postext-cli/fonts/${name}`, import.meta.url));
const garamond = font('EBGaramond-400.ttf');
const garamondBold = font('EBGaramond-700.ttf');
const garamondItalic = font('EBGaramond-400i.ttf');
const openSans = font('OpenSans-400.ttf');
const face = fontkit.create(garamond);

class StubCtx {
  font = '';
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
const config = (symbolFont: string): PostextConfig => ({
  page: { width: pt(300), height: pt(400), dpi: 72, margins: { top: pt(40), bottom: pt(30), left: pt(30), right: pt(30) } },
  locale: 'es',
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontFamily: 'EB Garamond', fontSize: pt(10), lineHeight: pt(14) },
  symbolFont,
});

/** Whether every Type0 font of the PDF carries a ToUnicode map. */
function everyFontMapsUnicode(pdf: PDFDocument): boolean {
  let all = true;
  for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFDict && obj.get(PDFName.of('Type')) === PDFName.of('Font') && obj.get(PDFName.of('Subtype')) === PDFName.of('Type0')) {
      if (!obj.get(PDFName.of('ToUnicode'))) all = false;
    }
  }
  return all;
}

const hasVerapdf = process.env.VERAPDF === '1' && spawnSync('verapdf', ['--version']).status === 0;

function fontNames(pdf: PDFDocument): string[] {
  const out: string[] = [];
  for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFDict && obj.get(PDFName.of('Type')) === PDFName.of('Font') && obj.get(PDFName.of('Subtype')) === PDFName.of('Type0')) {
      out.push(String(obj.get(PDFName.of('BaseFont'))));
    }
  }
  return out;
}

const missing = (warnings: PdfWarning[]) => warnings.flatMap((w) => (w.kind === 'missingGlyph' ? w.characters : []));

interface Asked { family: string; weight: number; style: string; codePoints?: number[] }

async function render(markdown: string, symbols: (asked: Asked) => Uint8Array | Uint8Array[] | undefined) {
  const asked: Asked[] = [];
  const fontProvider = async (family: string, weight: number, style: 'normal' | 'italic', request?: { codePoints?: ReadonlySet<number> }) => {
    const a: Asked = { family, weight, style, ...(request?.codePoints ? { codePoints: [...request.codePoints] } : {}) };
    asked.push(a);
    if (family === 'EB Garamond') return new Uint8Array(weight >= 600 ? garamondBold : garamond);
    if (family === 'Simbolos') {
      const answer = symbols(a);
      if (answer) return answer as never;
    }
    throw new Error(`no ${family}`);
  };
  const doc = buildDocument({ markdown, metadata: { title: 'Símbolos' } }, config('Simbolos'));
  const warnings: PdfWarning[] = [];
  const bytes = await renderToPdf(doc, { fontProvider, onWarning: (w) => warnings.push(w) });
  const pdf = await PDFDocument.load(bytes);
  return { asked, warnings, fonts: fontNames(pdf), pdf, bytes };
}

describe('a symbol font of several files in the PDF', () => {
  it('draws a character from the file of the symbol face that has it', async () => {
    // The first file (EB Garamond Italic) has no alef; the second (Open
    // Sans) has it. Neither has the union sign.
    const { warnings, fonts } = await render('La alternativa incluye א; obsérvese que A ∪ א = U.', () => [
      new Uint8Array(garamondItalic),
      new Uint8Array(openSans),
    ]);
    expect(missing(warnings)).toEqual(['∪']);
    expect(fonts.some((f) => /OpenSans/.test(f))).toBe(true);
  });

  it('maps every font, the symbol runs\' too, to Unicode, and passes veraPDF when it is there', async () => {
    const files = () => [new Uint8Array(garamondItalic), new Uint8Array(openSans)];
    const { pdf, bytes } = await render('La alternativa incluye א, y la hipótesis nula no.', files);
    expect(everyFontMapsUnicode(pdf)).toBe(true);
    if (!hasVerapdf) return;
    const file = path.join(os.tmpdir(), `postext-symbolfont-ua-${process.pid}.pdf`);
    fs.writeFileSync(file, bytes);
    const out = spawnSync('verapdf', ['--flavour', 'ua1', '--format', 'text', file], { encoding: 'utf8' });
    fs.unlinkSync(file);
    expect(out.stdout).toMatch(/^PASS /m);
  }, 120_000);

  it('asks for the regular face, with only what the text face lacks, at most three times', async () => {
    const { asked } = await render('**Negrita con א** y texto con ∪.', () => undefined);
    const symbolAsks = asked.filter((a) => a.family === 'Simbolos');
    expect(symbolAsks.length).toBeLessThanOrEqual(symbolFaceCandidates('Simbolos').length);
    expect(symbolAsks.every((a) => a.style === 'normal')).toBe(true);
    expect(symbolAsks[0]!.weight).toBe(400);
    // Only the characters the text face lacks.
    for (const a of symbolAsks) expect((a.codePoints ?? []).every((cp) => cp === 0x5d0 || cp === 0x222a)).toBe(true);
  });

  it('is not asked for at all when the text face has every character', async () => {
    const { asked } = await render('Nada que no tenga la letra.', () => [new Uint8Array(openSans)]);
    expect(asked.some((a) => a.family === 'Simbolos')).toBe(false);
  });
});
