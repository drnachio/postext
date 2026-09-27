import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PDFArray, PDFDocument, PDFHexString, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument } from 'postext';
import type { PostextConfig, VDTLine } from 'postext';
import { renderToPdf } from '../pdf-backend';
import { parseFontString } from '../fontString';

// `bodyText.repeatHyphen` (Portuguese spelling) opens the line after a break
// at a compound's hyphen with a hyphen too: "vencer-" | "-se". The PDF paints
// that hyphen but reads the word once: the first word of the line sits in a
// `/Span` whose `/ActualText` leaves the hyphen out.

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

const PT = 'Emfim, a noite parecia vencer-se a si mesma; o viúvo, cansado, deixou-se ficar à janela e disse-lhe que a vida, como a guarda-chuva velha, havia de encontrar-se aberta outra vez pela manhã, quando o sol-posto já fosse lembrança.';

function config(width: number, bodyText: PostextConfig['bodyText']): PostextConfig {
  return {
    page: { width: pt(width), height: pt(900), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
    locale: 'pt',
    layout: { layoutType: 'single' },
    header: { elements: [] },
    footer: { elements: [] },
    bodyText: { firstLineIndent: pt(0), repeatHyphen: true, ...bodyText },
  };
}

function pageContent(pdf: PDFDocument): string {
  const contents = pdf.getPage(0).node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  return refs
    .map((ref) => {
      const s = pdf.context.lookup(ref);
      return s instanceof PDFRawStream ? new TextDecoder('latin1').decode(decodePDFRawStream(s).decode()) : '';
    })
    .join('\n');
}

/** The `/ActualText` strings of the page's marked-content spans. */
function actualTexts(content: string): string[] {
  return [...content.matchAll(/\/Span <<\n\/ActualText (<[0-9A-Fa-f]*>)\n>> BDC/g)]
    .map((m) => PDFHexString.of(m[1]!.slice(1, -1)).decodeText());
}

const hasPdftotext = (() => {
  try {
    execFileSync('pdftotext', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const modes: Array<{ name: string; bodyText: PostextConfig['bodyText']; markdown: string }> = [
  { name: 'justified', bodyText: {}, markdown: PT },
  { name: 'ragged', bodyText: { textAlign: 'left' }, markdown: PT },
  { name: 'ragged, formatted', bodyText: { textAlign: 'left' }, markdown: PT.replace('Emfim', '*Emfim*') },
];

describe('the repeated hyphen in the PDF (repeatHyphen)', () => {
  for (const mode of modes) {
    it(`paints it under an ActualText without it (${mode.name})`, async () => {
      let repeated = 0;
      for (const width of [150, 170, 190, 210, 230]) {
        const doc = buildDocument({ markdown: mode.markdown }, config(width, mode.bodyText));
        const lines = doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks.flatMap((b) => b.lines as VDTLine[])));
        const opening = lines.filter((l) => l.repeatedHyphen);
        const pdf = await PDFDocument.load(await renderToPdf(doc, { fontProvider }));
        const content = pageContent(pdf);
        const spans = actualTexts(content);
        expect(spans.length, `${width} pt`).toBe(opening.length);
        for (const [k, line] of opening.entries()) {
          const span = spans[k]!;
          expect(span.startsWith('-'), `${width} pt: ${span}`).toBe(false);
          // The span holds the line's first word (formatted and justified
          // lines) or the whole line (a plain ragged one), less the hyphen.
          expect(line.text.slice(1).startsWith(span) || span === line.text.slice(1), `${width} pt: ${span}`).toBe(true);
        }
        expect((content.match(/\b(BDC|BMC)\n/g) ?? []).length).toBe((content.match(/\bEMC\n/g) ?? []).length);
        repeated += opening.length;
      }
      expect(repeated).toBeGreaterThan(0);
    });
  }

  it('adds no span without the option', async () => {
    const doc = buildDocument({ markdown: PT }, config(170, { repeatHyphen: false }));
    const pdf = await PDFDocument.load(await renderToPdf(doc, { fontProvider }));
    expect(actualTexts(pageContent(pdf))).toEqual([]);
  });

  it.skipIf(!hasPdftotext)('reads each compound once in the extracted text', async () => {
    let checked = 0;
    for (const width of [150, 170, 190, 210, 230]) {
      const doc = buildDocument({ markdown: PT }, config(width, {}));
      const lines = doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks.flatMap((b) => b.lines as VDTLine[])));
      if (!lines.some((l) => l.repeatedHyphen)) continue;
      const file = path.join(os.tmpdir(), `postext-repeated-hyphen-${process.pid}-${width}.pdf`);
      fs.writeFileSync(file, await renderToPdf(doc, { fontProvider }));
      const text = execFileSync('pdftotext', ['-raw', file, '-'], { encoding: 'utf8' });
      fs.unlinkSync(file);
      // A line ends on the compound's hyphen and the next starts on the
      // rest of the word, never on a second hyphen.
      expect(text, `${width} pt`).not.toMatch(/-\s*\n\s*-/);
      for (const line of lines.filter((l) => l.repeatedHyphen)) {
        const word = line.text.slice(1).split(' ')[0]!;
        expect(text.split('\n').some((row) => row.startsWith(word)), `${width} pt: ${word}`).toBe(true);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
