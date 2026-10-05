import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRawStream, PDFRef, PDFStream, decodePDFRawStream } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument } from 'postext';
import type { PostextConfig } from 'postext';
import { renderToPdf } from '../pdf-backend';
import { parseFontString } from '../fontString';

// Issue #419: Japanese vertical text in the PDF. Small kana and ー are shown
// in the font's vertical forms (`vert` through the Identity-V twin), “ ” as
// the vertical quotes 〝 〟, ：in its turned form, ！？ upright as they are,
// and a pair of !? marks side by side in one cell. Noto Serif JP, cut down
// (fixtures/cjk/make_japanese_fixtures.py).

const JP = new Uint8Array(fs.readFileSync(new URL('./fixtures/cjk/noto-serif-jp-vertical.ttf', import.meta.url)));
const face = fontkit.create(Buffer.from(JP));
const fontProvider = async () => JP;

class StubCtx {
  font = '';
  letterSpacing = '0px';
  measureText(s: string) {
    const f = parseFontString(this.font);
    const run = face.layout(s);
    const k = (f?.sizePx ?? 16) / face.unitsPerEm;
    let w = 0;
    for (const p of run.positions) w += p.xAdvance;
    const b = run.glyphs[0]?.bbox;
    return {
      width: w * k,
      actualBoundingBoxAscent: b ? b.maxY * k : 0,
      actualBoundingBoxDescent: b ? -b.minY * k : 0,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: w * k,
    };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config = (locale = 'ja'): PostextConfig => ({
  locale,
  page: { width: pt(300), height: pt(420), dpi: 72, margins: { top: pt(40), bottom: pt(40), left: pt(30), right: pt(30) } },
  layout: { writingMode: 'vertical-rl', layoutType: 'single' },
  bodyText: { fontFamily: 'Noto Serif JP', fontSize: pt(16), lineHeight: pt(24), firstLineIndent: pt(0), textAlign: 'left', hyphenation: { enabled: false } },
  headings: { fontFamily: 'Noto Serif JP' },
  header: { elements: [] },
  footer: { elements: [] },
  cjk: { punctuationWidth: 'fullwidth', compressAdjacent: false, trimLineStart: false, latinSpacing: { value: 0, unit: 'em' } },
});

async function render(markdown: string, cfg = config()) {
  const doc = buildDocument({ markdown }, cfg);
  const bytes = await renderToPdf(doc, { fontProvider });
  return { doc, pdf: await PDFDocument.load(bytes), bytes };
}

function pageOps(pdf: PDFDocument): string {
  const contents = pdf.getPage(0).node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  return refs.map((ref) => {
    const s = pdf.context.lookup(ref);
    return s instanceof PDFRawStream ? new TextDecoder('latin1').decode(decodePDFRawStream(s).decode()) : '';
  }).join('\n');
}

function pageFonts(pdf: PDFDocument): Map<string, PDFDict> {
  const fonts = pdf.getPage(0).node.Resources()!.lookup(PDFName.of('Font'), PDFDict);
  const out = new Map<string, PDFDict>();
  for (const [name, ref] of fonts.entries()) out.set(name.asString().replace(/^\//, ''), pdf.context.lookup(ref as PDFRef, PDFDict));
  return out;
}

function embeddedFace(pdf: PDFDocument, type0: PDFDict) {
  const cid = type0.lookup(PDFName.of('DescendantFonts'), PDFArray).lookup(0, PDFDict);
  const descriptor = cid.lookup(PDFName.of('FontDescriptor'), PDFDict);
  const file = descriptor.lookup(PDFName.of('FontFile2')) as PDFStream;
  return fontkit.create(Buffer.from(decodePDFRawStream(file as PDFRawStream).decode()));
}

/** The glyphs shown through the vertical twin, in order, as their outlines'
 *  boxes in the embedded subset. */
function uprightGlyphs(pdf: PDFDocument) {
  const fonts = pageFonts(pdf);
  const out: Array<{ minX: number; minY: number; maxX: number; maxY: number }> = [];
  let font = '';
  for (const line of pageOps(pdf).split('\n')) {
    const tf = /^\/(\S+) [\d.]+ Tf$/.exec(line);
    if (tf) font = tf[1]!;
    if (!/ (Tj|TJ)$/.test(line)) continue;
    const dict = fonts.get(font);
    if (dict?.get(PDFName.of('Encoding')) !== PDFName.of('Identity-V')) continue;
    const embedded = embeddedFace(pdf, dict);
    const hex = [...line.matchAll(/<([0-9a-fA-F]+)>/g)].map((h) => h[1]!).join('');
    for (let i = 0; i < hex.length; i += 4) out.push(embedded.getGlyph(parseInt(hex.slice(i, i + 4), 16)).bbox);
  }
  return out;
}

const boxOf = (ch: string, features: string[] = []) => face.layout(ch, features).glyphs[0]!.bbox;
const sameBox = (a: { minX: number; minY: number }, b: { minX: number; minY: number }) => a.minX === b.minX && a.minY === b.minY;

describe('Japanese vertical text in the PDF (#419)', () => {
  it('shows small kana and ー in their vertical forms', async () => {
    const { pdf } = await render('しょっちゅうコーヒー');
    const glyphs = uprightGlyphs(pdf);
    expect(glyphs).toHaveLength(10);
    const chars = [...'しょっちゅうコーヒー'];
    chars.forEach((ch, i) => {
      const vertical = ['ょ', 'っ', 'ゅ', 'ー'].includes(ch);
      expect(sameBox(glyphs[i]!, boxOf(ch, vertical ? ['vert'] : [])), ch).toBe(true);
    });
    // The small kana's vertical form sits up and to the right of the
    // horizontal one; ー's runs down the column.
    expect(boxOf('っ', ['vert']).minX).toBeGreaterThan(boxOf('っ').minX);
    expect(boxOf('っ', ['vert']).minY).toBeGreaterThan(boxOf('っ').minY);
    const bar = glyphs[7]!;
    expect(bar.maxY - bar.minY).toBeGreaterThan(bar.maxX - bar.minX);
  });

  it('shows “ ” as 〝 〟 in their vertical forms and reads them as written', async () => {
    const { pdf } = await render('彼は“本当”と言った。');
    const glyphs = uprightGlyphs(pdf);
    expect(sameBox(glyphs[2]!, boxOf('〝', ['vert']))).toBe(true);
    expect(sameBox(glyphs[5]!, boxOf('〟', ['vert']))).toBe(true);
    const texts = [...pageOps(pdf).matchAll(/\/ActualText <([0-9A-Fa-f]+)>/g)].map((m) => PDFHexString.of(m[1]!).decodeText());
    expect(texts.join('')).toContain('彼は“本当”と言った。');
  });

  it('turns ：, stands ！？ as they are and sets a pair of marks in one upright cell', async () => {
    const { pdf } = await render('本当：何！見る？えっ!?と');
    const glyphs = uprightGlyphs(pdf);
    expect(sameBox(glyphs[2]!, boxOf('：', ['vert']))).toBe(true);
    expect(sameBox(glyphs[4]!, boxOf('！'))).toBe(true);
    expect(sameBox(glyphs[7]!, boxOf('？'))).toBe(true);
    // !? is shown with the horizontal font under a turned text matrix, one
    // cell: 11 upright glyphs and no sideways run.
    expect(glyphs).toHaveLength(11);
    const ops = pageOps(pdf);
    expect(ops).toMatch(/0 1 -1 0 [-\d.]+ [-\d.]+ Tm\s+(<[0-9a-fA-F]+> Tj|\[[^\]]*\] TJ)/);
    expect(ops).not.toMatch(/\n1 0 0 1 [-\d.]+ [-\d.]+ Tm\s+(<[0-9a-fA-F]+> Tj|\[[^\]]*\] TJ)/);
  });

  it('sets the same text the Chinese way in a Chinese document', async () => {
    const { pdf } = await render('しょっちゅう', config('zh-Hans'));
    const glyphs = uprightGlyphs(pdf);
    // Upright as they are: the horizontal small kana.
    expect(sameBox(glyphs[1]!, boxOf('ょ'))).toBe(true);
  });
});
