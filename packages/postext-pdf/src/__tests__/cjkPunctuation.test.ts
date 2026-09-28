import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { buildDocument, columnClipRect } from 'postext';
import type { PostextConfig, VDTDocument } from 'postext';
import { renderToPdf } from '../pdf-backend';

// Punctuation widths, hanging marks and the Han–Latin space (#185, #186) in
// the PDF: a compressed mark is painted where its ink belongs, a hung mark
// is not clipped, and a line set in pieces reads as written.

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
const fontProvider = async () => new Uint8Array(fontBytes);

// CJK characters 16 px, a space 4 px, anything else 8 px.
class StubCtx {
  font = '';
  letterSpacing = '0px';
  measureText(s: string): { width: number } {
    let w = 0;
    for (const ch of s) w += ch === ' ' ? 4 : ch.codePointAt(0)! >= 0x2e80 ? 16 : 8;
    return { width: w };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
// 72 dpi: 1 pt = 1 px; an 80 px measure holds five characters.
const config = (cjk: PostextConfig['cjk'], textAlign: 'justify' | 'left' = 'justify'): PostextConfig => ({
  locale: 'zh-Hans',
  page: { width: pt(120), height: pt(400), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontFamily: 'Lora', fontSize: pt(16), lineHeight: pt(24), textAlign, firstLineIndent: pt(0), hyphenation: { enabled: false } },
  cjk,
});

async function contentOf(doc: VDTDocument, accessible = false): Promise<string> {
  const pdf = await PDFDocument.load(await renderToPdf(doc, { fontProvider, accessible }));
  const contents = pdf.getPage(0).node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  return refs
    .map((ref) => {
      const s = pdf.context.lookup(ref);
      return s instanceof PDFRawStream ? new TextDecoder('latin1').decode(decodePDFRawStream(s).decode()) : '';
    })
    .join('\n');
}

/** The strings of the `/ActualText` spans of a content stream. */
function actualTexts(content: string): string[] {
  return [...content.matchAll(/\/ActualText\s*<FEFF([0-9A-Fa-f]*)>/g)].map((m) => {
    const units = m[1]!.match(/.{4}/g) ?? [];
    return String.fromCharCode(...units.map((h) => parseInt(h, 16)));
  });
}

describe('CJK punctuation in the PDF', () => {
  it('paints an opening bracket trimmed at a line start half an em before its box', async () => {
    const doc = buildDocument({ markdown: '此开卷第一「回也」作者' }, config({ punctuationWidth: 'fullwidth', trimLineStart: true }, 'left'));
    const line = doc.blocks.find((b) => b.type === 'paragraph')!.lines[1]!;
    expect(line.segments![0]).toMatchObject({ text: '「', width: 8, inkOffset: -8 });
    const content = await contentOf(doc);
    const xs = [...content.matchAll(/1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm/g)].map((m) => Number(m[1]));
    // The line's first text object starts 8 px left of the line.
    expect(xs).toContain(line.bbox.x - 8);
  }, 60_000);

  it('reads a line with Han–Latin spaces as written', async () => {
    for (const accessible of [false, true]) {
      const doc = buildDocument({ markdown: '我们用iPhone拍照，1999年的iPhone 15售价为¥5,999。' }, config({}));
      const lines = doc.blocks.find((b) => b.type === 'paragraph')!.lines;
      expect(lines.some((l) => l.segments!.some((s) => s.autospace))).toBe(true);
      const texts = actualTexts(await contentOf(doc, accessible));
      // Every line spread or spaced gets a span with its own text: no space
      // where the layout left a gap.
      for (const l of lines) {
        if (l.segments!.some((s) => s.autospace || s.tracking !== undefined)) expect(texts).toContain(l.text);
      }
      expect(texts.join('')).not.toMatch(/[一-鿿] [A-Za-z0-9]|[A-Za-z0-9] [一-鿿]/);
    }
  }, 60_000);

  it('reads a line with compressed marks as written, each mark advancing to its box end', async () => {
    // Kaiming, set solid (left aligned): no tracking, no Han–Latin space;
    // the half-width ：， and the trimmed 「 are what the line holds.
    for (const accessible of [false, true]) {
      const doc = buildDocument({ markdown: '他说：「你来了吗？」她笑道，来了' }, config({}, 'left'));
      const lines = doc.blocks.find((b) => b.type === 'paragraph')!.lines;
      const marked = lines.filter((l) => l.segments!.some((s) => s.inkOffset !== undefined));
      expect(marked.length).toBeGreaterThan(0);
      expect(marked.every((l) => l.segments!.every((s) => s.tracking === undefined && !s.autospace))).toBe(true);
      const content = await contentOf(doc, accessible);
      const texts = actualTexts(content);
      for (const l of marked) expect(texts).toContain(l.text);
      // The ： (8 px, painted at its box) is shown with -8 px of character
      // spacing: Lora has no ： and advances the missing glyph one em, so the
      // glyph's advance ends where its 8 px box does. The spacing is reset
      // after it.
      const colon = lines.flatMap((l) => l.segments!).find((s) => s.text === '：')!;
      expect(colon).toMatchObject({ width: 8, inkOffset: 0 });
      expect(content).toMatch(/-8 Tc[\s\S]*?TJ|-8 Tc[\s\S]*?Tj/);
      const ops = [...content.matchAll(/(-?[\d.]+) Tc/g)].map((m) => Number(m[1]));
      expect(ops).toContain(-8);
      expect(ops[ops.length - 1]).toBe(0);
    }
  }, 60_000);

  it('widens the column clip for a hung mark', async () => {
    const doc = buildDocument({ markdown: '此开卷第一，回也作者自云' }, config({ hangingPunctuation: 'allow' }));
    const page = doc.pages[0]!;
    const col = page.columns[0]!;
    const hung = col.blocks.flatMap((b) => b.lines).find((l) => l.segments!.some((s) => s.hangs))!;
    expect(hung).toBeDefined();
    const clip = columnClipRect(col, 72);
    const mark = hung.segments!.find((s) => s.hangs)!;
    // A Kaiming comma: half an em, past the 80 px measure.
    expect(mark.width).toBe(8);
    expect(hung.bbox.width).toBe(80);
    expect(clip.x + clip.width).toBeGreaterThanOrEqual(hung.bbox.x + hung.bbox.width + mark.width);
    const content = await contentOf(doc);
    // The clip rectangle the page paints the column in.
    const rects = [...content.matchAll(/(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) re\s+W\s+n/g)].map((m) => Number(m[1]) + Number(m[3]));
    expect(rects.some((right) => Math.abs(right - (clip.x + clip.width)) < 0.01)).toBe(true);
  }, 60_000);
});
