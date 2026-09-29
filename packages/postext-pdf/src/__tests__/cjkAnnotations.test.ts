import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { buildDocument } from 'postext';
import type { PostextConfig, VDTDocument } from 'postext';
import { renderToPdf } from '../pdf-backend';

// Emphasis dots and the name and title lines (#193), ruby (#194) and
// warichu notes (#195) in the PDF: the marks are vector artifacts, a
// reading sits in the RT of its base's Ruby, a note's rows in a Warichu,
// and the line reads as its base text.

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
const fontProvider = async () => new Uint8Array(fontBytes);

// CJK characters 1 em, Latin ½ em, a space ¼ em, at the size the font names.
class StubCtx {
  font = '10px Test';
  letterSpacing = '0px';
  measureText(s: string): { width: number } {
    const em = Number(/(\d*\.?\d+)px/.exec(this.font)?.[1] ?? 10);
    let w = 0;
    for (const ch of s) w += ch === ' ' ? em / 4 : ch.codePointAt(0)! >= 0x2e80 ? em : em / 2;
    return { width: w };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config = (): PostextConfig => ({
  locale: 'zh-Hant-TW',
  page: { width: pt(440), height: pt(400), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontFamily: 'Lora', fontSize: pt(20), lineHeight: pt(40), textAlign: 'justify', firstLineIndent: pt(0), hyphenation: { enabled: false } },
});

async function render(doc: VDTDocument): Promise<{ content: string; pdf: string }> {
  const bytes = await renderToPdf(doc, { fontProvider, accessible: true });
  const pdf = await PDFDocument.load(bytes);
  const contents = pdf.getPage(0).node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  const content = refs
    .map((ref) => {
      const s = pdf.context.lookup(ref);
      return s instanceof PDFRawStream ? new TextDecoder('latin1').decode(decodePDFRawStream(s).decode()) : '';
    })
    .join('\n');
  // Every object, uncompressed, for the structure elements.
  const objects = pdf.context.enumerateIndirectObjects().map(([, obj]) => obj.toString()).join('\n');
  return { content, pdf: objects };
}

function actualTexts(content: string): string[] {
  return [...content.matchAll(/\/ActualText\s*<FEFF([0-9A-Fa-f]*)>/g)].map((m) => {
    const units = m[1]!.match(/.{4}/g) ?? [];
    return String.fromCharCode(...units.map((h) => parseInt(h, 16)));
  });
}

describe('Chinese annotations in the PDF', () => {
  it('draws the marks as layout artifacts', async () => {
    const doc = buildDocument({ markdown: '此事:dots[不可]輕忽，:name[賈寶玉]讀:book[石頭記]。' }, config());
    const { content } = await render(doc);
    const artifacts = content.split('/Artifact').slice(1);
    const marks = artifacts.filter((a) => /\/Type \/Layout/.test(a.slice(0, 40)));
    expect(marks.length).toBeGreaterThan(0);
    const body = marks.join('\n');
    // Two dots (four curves each, filled), the name line and the wave
    // (stroked).
    expect(body.match(/ c\n/g)!.length).toBeGreaterThanOrEqual(8);
    expect(body.match(/\nf\n/g)!.length).toBe(2);
    expect(body.match(/\nS\n/g)!.length).toBe(2);
  }, 60_000);

  it('puts a reading in the RT of its base, a note in a Warichu, and reads the line as its base', async () => {
    const doc = buildDocument({ markdown: '{紅樓|hóng|lóu}夢寶玉:warichu[甲戌側批]道' }, config());
    const { content, pdf } = await render(doc);
    for (const type of ['Ruby', 'RB', 'RT', 'Warichu', 'WT']) expect(pdf).toContain(`/S /${type}`);
    const texts = actualTexts(content);
    expect(texts).toContain('紅樓夢寶玉甲戌側批道');
    expect(texts.some((t) => t.includes('hóng'))).toBe(false);
  }, 60_000);
});
