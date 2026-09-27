import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFString } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument } from 'postext';
import type { PostextConfig } from 'postext';
import { renderToPdf } from '../pdf-backend';
import { parseFontString } from '../fontString';

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

// EF-26: a structural heading prints nothing but still structures the book.
const config: PostextConfig = {
  page: { width: pt(300), height: pt(240), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  locale: 'en-us',
  headings: { levels: [{ level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' } }] },
  headingStyles: [{ id: 'silent', hidden: true, numbered: false }],
  // No running heads: they would print the chapter title.
  header: { elements: [] },
  footer: { elements: [] },
};
const markdown = '# Opening\n\nFirst chapter text.\n\n# Dedication {style="silent"}\n\nTo the lantern keepers.';

// The same inside a callout box.
const calloutMarkdown = ':::callout{type="note"}\n## Secret {hidden="true"}\n\nInside the box.\n:::\n\nAfter the box.';

let bytes: Uint8Array;
let calloutBytes: Uint8Array;
let pdf: PDFDocument;

beforeAll(async () => {
  const doc = buildDocument({ markdown, metadata: { title: 'Hidden headings' } }, config);
  bytes = await renderToPdf(doc, { fontProvider });
  pdf = await PDFDocument.load(bytes);
  const boxed = buildDocument(
    { markdown: calloutMarkdown, metadata: { title: 'Hidden headings' } },
    { ...config, calloutStyles: [{ id: 'note', span: 'column' }] },
  );
  calloutBytes = await renderToPdf(boxed, { fontProvider });
}, 60_000);

function outlineTitles(): string[] {
  const outlines = pdf.catalog.lookup(PDFName.of('Outlines'), PDFDict);
  const titles: string[] = [];
  let item = outlines.lookupMaybe(PDFName.of('First'), PDFDict);
  while (item) {
    const title = item.get(PDFName.of('Title'));
    if (title instanceof PDFHexString || title instanceof PDFString) titles.push(title.decodeText());
    item = item.lookupMaybe(PDFName.of('Next'), PDFDict);
  }
  return titles;
}

function pdfText(data: Uint8Array): string {
  const file = path.join(os.tmpdir(), `postext-hidden-${process.pid}.pdf`);
  fs.writeFileSync(file, data);
  const text = execFileSync('pdftotext', ['-raw', file, '-'], { encoding: 'utf8' });
  fs.unlinkSync(file);
  return text;
}

const hasPdftotext = (() => {
  try {
    execFileSync('pdftotext', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe('hidden headings in the PDF', () => {
  it('keep their bookmark', () => {
    expect(outlineTitles()).toEqual(['Opening', 'Dedication']);
  });

  it.skipIf(!hasPdftotext)('print no text of their own', () => {
    const text = pdfText(bytes);
    expect(text).toContain('Opening');
    expect(text).toContain('To the lantern keepers.');
    expect(text).not.toContain('Dedication');
  });

  it.skipIf(!hasPdftotext)('print no text inside a callout either', () => {
    const text = pdfText(calloutBytes);
    expect(text).toContain('Inside the box.');
    expect(text).toContain('After the box.');
    expect(text).not.toContain('Secret');
  });
});
