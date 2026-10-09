import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument } from 'postext';
import type { PostextConfig } from 'postext';
import { renderToPdf } from '../pdf-backend';
import { parseFontString } from '../fontString';

// #621: line numbers in the margin. They are painted beside their lines,
// marked as layout artifacts in a tagged PDF, and set under an empty
// `/ActualText`, so extracted and copied text runs from line to line
// without them.

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
  page: { width: pt(300), height: pt(480), margins: { top: pt(24), bottom: pt(24), left: pt(48), right: pt(48) } },
  locale: 'en-us',
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  lineNumbers: { enabled: true, interval: 5 },
};

const has = (cmd: string, arg: string) => spawnSync(cmd, [arg], { encoding: 'utf8' }).status === 0;
const hasPdftotext = (() => {
  try {
    execFileSync('pdftotext', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();
const hasVerapdf = process.env.VERAPDF === '1' && has('verapdf', '--version');

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

const POEM = [
  ':::verse{align=start}',
  'Yet once more, O ye laurels, and once more',
  'Ye myrtles brown, with ivy never sere,',
  'I come to pluck your berries harsh and crude,',
  'And with forced fingers rude',
  'Shatter your leaves before the mellowing year.',
  'Bitter constraint and sad occasion dear',
  'Compels me to disturb your season due;',
  'For Lycidas is dead, dead ere his prime,',
  'Young Lycidas, and hath not left his peer.',
  'Who would not sing for Lycidas? he knew',
  ':::',
].join('\n');

describe('line numbers in the PDF (#621)', () => {
  const doc = buildDocument({ markdown: POEM, metadata: { title: 'Lycidas' } }, config);

  it('paints the numbers as layout artifacts, each under an empty /ActualText', async () => {
    expect(doc.pages[0]!.lineNumberMarks!.map((m) => m.label)).toEqual(['5', '10']);
    const pdf = await PDFDocument.load(await renderToPdf(doc, { fontProvider }));
    const content = pageContent(pdf);
    // Two numbers: two empty spans, inside a layout artifact (no marked
    // content of the structure between them).
    expect(content.match(/\/Span\s*<<\s*\/ActualText\s*<FEFF>\s*>>\s*BDC/g) ?? []).toHaveLength(2);
    const before = content.slice(0, content.indexOf('<FEFF>'));
    expect(before.lastIndexOf('/Artifact')).toBeGreaterThan(before.lastIndexOf('/MCID'));
    expect(before.slice(before.lastIndexOf('/Artifact'))).toMatch(/^\/Artifact\s*<<[^>]*\/Layout/);
    const tail = content.slice(content.indexOf('<FEFF>'));
    expect(tail.slice(0, tail.lastIndexOf('<FEFF>'))).not.toContain('/MCID');
  });

  it.skipIf(!hasPdftotext)('leaves them out of the extracted text', async () => {
    const file = path.join(os.tmpdir(), `postext-linenumbers-${process.pid}.pdf`);
    fs.writeFileSync(file, await renderToPdf(doc, { fontProvider }));
    const text = execFileSync('pdftotext', ['-raw', file, '-'], { encoding: 'utf8' });
    fs.unlinkSync(file);
    expect(text).toContain('Shatter your leaves before the mellowing year.');
    expect(text).not.toMatch(/\b(5|10)\b/);
  });

  it.skipIf(!hasVerapdf)('passes veraPDF (PDF/UA-1)', async () => {
    const file = path.join(os.tmpdir(), `postext-linenumbers-ua-${process.pid}.pdf`);
    fs.writeFileSync(file, await renderToPdf(doc, { fontProvider }));
    const out = spawnSync('verapdf', ['--flavour', 'ua1', '--format', 'text', file], { encoding: 'utf8' });
    fs.unlinkSync(file);
    expect(out.stdout).toMatch(/^PASS /m);
  }, 120_000);
});
