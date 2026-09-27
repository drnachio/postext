import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  decodePDFRawStream,
} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument } from 'postext';
import type { PostextConfig, VDTLine } from 'postext';
import { renderToPdf } from '../pdf-backend';
import { measuredTextOperator } from '../pdf-backend/primitives';
import { parseFontString } from '../fontString';

// EF-137: a ragged line with no styled run was painted with one show-text
// call of its whole text, so the PDF advanced by the embedded face's own
// widths. A character the face has no glyph for, which the browser had
// measured in a fallback font, got the width of the face's notdef glyph
// instead, and every word after it moved. Lines with a bold or italic run
// were already placed word by word at their measured positions.

const LORA = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
const face = fontkit.create(LORA) as unknown as {
  unitsPerEm: number;
  hasGlyphForCodePoint(cp: number): boolean;
  layout(s: string): { advanceWidth: number };
};

/** Measures like the browser: a character Lora lacks is set in a fallback
 *  font, 0.8 em wide (U+2192 here), while the PDF's notdef glyph advances a
 *  full em; the word joiner has no width and the em space is one em
 *  (HarfBuzz's fallback spaces). */
class ChromeLikeCtx {
  font = '';
  measureText(s: string): { width: number } {
    const size = parseFontString(this.font)?.sizePx ?? 16;
    let width = 0;
    let run = '';
    const flush = () => {
      if (run) width += (face.layout(run).advanceWidth / face.unitsPerEm) * size;
      run = '';
    };
    for (const ch of s) {
      const cp = ch.codePointAt(0)!;
      if (cp === 0x2060) { flush(); continue; }
      if (cp === 0x2003) { flush(); width += size; continue; }
      if (cp > 0x7f && cp !== 0xa0 && !face.hasGlyphForCodePoint(cp)) { flush(); width += size * 0.8; continue; }
      run += ch;
    }
    flush();
    return { width };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): ChromeLikeCtx {
    return new ChromeLikeCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config: PostextConfig = {
  // 72 dpi: a layout pixel is a PDF point.
  page: { width: pt(400), height: pt(200), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: 'Lora', fontSize: pt(10), lineHeight: pt(12), textAlign: 'left', firstLineIndent: pt(0) },
  header: { elements: [] },
  footer: { elements: [] },
};
const fontProvider = async () => new Uint8Array(LORA);

interface Glyph { cid: number; x: number }

/** The glyphs a viewer paints from the page's text objects, with the pen x
 *  each starts at: `Tm` sets the origin, a glyph advances by its `W` width
 *  (`DW`, 1000 by default, when `W` does not list it) plus `Tc`, and a `TJ`
 *  number moves the pen back by thousandths of the size. */
function paintedGlyphs(pdf: PDFDocument, pageIndex: number): Glyph[] {
  const page = pdf.getPage(pageIndex);
  const fonts = page.node.Resources()!.lookup(PDFName.of('Font'), PDFDict);
  const widthsOf = new Map<string, { w: Map<number, number>; dw: number }>();
  for (const [name, ref] of fonts.entries()) {
    const type0 = pdf.context.lookup(ref as PDFRef, PDFDict);
    const cid = pdf.context.lookup(type0.lookup(PDFName.of('DescendantFonts'), PDFArray).get(0), PDFDict);
    const w = cid.lookup(PDFName.of('W'), PDFArray).asArray();
    const map = new Map<number, number>();
    for (let i = 0; i < w.length; i += 2) {
      const first = (w[i] as PDFNumber).asNumber();
      const list = pdf.context.lookup(w[i + 1]!, PDFArray).asArray();
      list.forEach((n, k) => map.set(first + k, (n as PDFNumber).asNumber()));
    }
    const dw = cid.get(PDFName.of('DW'));
    widthsOf.set(name.decodeText(), { w: map, dw: dw instanceof PDFNumber ? dw.asNumber() : 1000 });
  }
  const contents = page.node.Contents()!;
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  let content = '';
  for (const ref of refs) content += new TextDecoder('latin1').decode(decodePDFRawStream(pdf.context.lookup(ref) as PDFRawStream).decode());
  const glyphs: Glyph[] = [];
  let widths = { w: new Map<number, number>(), dw: 1000 };
  let size = 0;
  let tc = 0;
  let x = 0;
  const show = (hex: string) => {
    for (let i = 0; i < hex.length; i += 4) {
      const cid = parseInt(hex.slice(i, i + 4), 16);
      glyphs.push({ cid, x });
      x += ((widths.w.get(cid) ?? widths.dw) / 1000) * size + tc;
    }
  };
  for (const line of content.split('\n')) {
    let m: RegExpExecArray | null;
    if ((m = /^\/(\S+) ([\d.]+) Tf$/.exec(line))) { widths = widthsOf.get(m[1]!)!; size = Number(m[2]); }
    else if ((m = /^(-?[\d.]+) Tc$/.exec(line))) tc = Number(m[1]);
    else if ((m = /^1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm$/.exec(line))) x = Number(m[1]);
    else if ((m = /^<([0-9A-Fa-f]*)> Tj$/.exec(line))) show(m[1]!);
    else if ((m = /^\[ (.*) \] TJ$/.exec(line))) {
      for (const part of m[1]!.split(' ')) {
        if (part.startsWith('<')) show(part.slice(1, -1));
        else x -= (Number(part) / 1000) * size;
      }
    }
  }
  return glyphs;
}

/** Where each text segment of `line` starts, as the layout measured it. */
function measuredStarts(line: VDTLine): Array<{ text: string; x: number; index: number }> {
  const out: Array<{ text: string; x: number; index: number }> = [];
  let x = line.bbox.x;
  let index = 0;
  for (const seg of line.segments ?? []) {
    if (seg.kind === 'text') out.push({ text: seg.text, x, index });
    x += seg.width;
    index += [...seg.text].length;
  }
  return out;
}

async function render(markdown: string, accessible: boolean) {
  const doc = buildDocument({ markdown }, config);
  const line = doc.pages[0]!.columns[0]!.blocks[0]!.lines[0]!;
  const pdf = await PDFDocument.load(await renderToPdf(doc, { fontProvider, accessible }));
  return { line, glyphs: paintedGlyphs(pdf, 0) };
}

describe('a plain ragged line keeps its measured word positions (EF-137)', () => {
  for (const accessible of [false, true]) {
    it(`starts every word where the layout put it after a glyph the face lacks (tagged: ${accessible})`, async () => {
      const { line, glyphs } = await render('From A → B via the long road home', accessible);
      expect(line.segments!.every((s) => !s.bold && !s.italic && s.fontString === undefined)).toBe(true);
      // One glyph per character, spaces included (text extraction reads them).
      expect(glyphs).toHaveLength([...line.segments!.map((s) => s.text).join('')].length);
      for (const start of measuredStarts(line)) {
        expect(glyphs[start.index]!.x, start.text).toBeCloseTo(start.x, 2);
      }
    });
  }

  it('still paints the space that ends a ragged line, as one run of the whole text did', async () => {
    const markdown = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ');
    // The line-by-line breaker keeps the space in the line's text. A ragged
    // paragraph set by Knuth–Plass (`optimalRagged`, the default since
    // rules 7) ends its lines without one, as justified lines always did.
    const doc = buildDocument({ markdown }, { ...config, bodyText: { ...config.bodyText, optimalRagged: false } });
    const lines = doc.pages[0]!.columns[0]!.blocks[0]!.lines;
    expect(lines.length).toBeGreaterThan(1);
    // The segments leave the line-end space out; the line's text keeps it.
    expect(lines[0]!.text.endsWith(' ')).toBe(true);
    expect(lines[0]!.segments!.map((s) => s.text).join('').endsWith(' ')).toBe(false);
    const pdf = await PDFDocument.load(await renderToPdf(doc, { fontProvider, accessible: true }));
    const glyphs = paintedGlyphs(pdf, 0);
    expect(glyphs).toHaveLength(lines.reduce((n, l) => n + [...l.text].length, 0));
    // And every word still starts where the layout put it.
    let offset = 0;
    for (const line of lines) {
      for (const start of measuredStarts(line)) expect(glyphs[offset + start.index]!.x, start.text).toBeCloseTo(start.x, 2);
      offset += [...line.text].length;
    }
  });

  it('indents a line opened by a word joiner and an em space by one em (the original report)', async () => {
    // Fixed by EF-66 already (spaces the face lacks, invisible characters);
    // kept here as the report's own case.
    const { line, glyphs } = await render('\u2060\u2003prompts in, 173', false);
    const prompts = measuredStarts(line).find((s) => s.text === 'prompts')!;
    expect(prompts.x).toBeCloseTo(line.bbox.x + 10, 2);
    // The word joiner paints nothing; the em space is the face's space
    // glyph at the line's start, and `prompts` begins one em in.
    expect(glyphs[0]!.x).toBeCloseTo(line.bbox.x, 2);
    expect(glyphs[1]!.x).toBeCloseTo(prompts.x, 2);
    expect(glyphs).toHaveLength(1 + 'prompts in, 173'.length);
    expect(glyphs.some((g) => g.cid === 0)).toBe(false);
  });
});

describe('a line with right-to-left letters', () => {
  it('stays one run, which the shaper sets right to left', async () => {
    // Lora has no Hebrew: the browser measured the letters in another font
    // (0.8 em each), the PDF paints notdef glyphs. Word by word, the pieces
    // would be set left to right in logical order, reversing the words.
    const doc = buildDocument({ markdown: 'שלום עולם' }, config);
    const line = doc.pages[0]!.columns[0]!.blocks[0]!.lines[0]!;
    expect(line.segments!.length).toBeGreaterThan(1);
    const pdf = await PDFDocument.load(await renderToPdf(doc, { fontProvider, accessible: false }));
    const page = pdf.getPage(0);
    const contents = page.node.Contents()!;
    const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
    let content = '';
    for (const ref of refs) content += new TextDecoder('latin1').decode(decodePDFRawStream(pdf.context.lookup(ref) as PDFRawStream).decode());
    const shows = content.split('\n').filter((l) => /T[jJ]$/.test(l));
    expect(shows).toHaveLength(1);
    // One run of glyphs, no pen adjustments between the words.
    expect(shows[0]).toMatch(/^<[0-9A-Fa-f]+> Tj$/);
  });
});

describe('measuredTextOperator', () => {
  it('lands each piece on its measured start, with character spacing counted', async () => {
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    const font = await pdf.embedFont(LORA, { subset: true });
    const pieces = [
      { text: 'Two', width: 30 },
      { text: ' ', width: 5 },
      { text: 'words', width: 40 },
    ];
    const size = 10;
    const tracking = 0.5;
    const op = measuredTextOperator(font, pieces, size, tracking)!;
    const arg = (op as unknown as { args: [PDFArray] }).args[0];
    // Walk the array as a viewer does, with the glyphs' own widths.
    const lora = fontkit.create(LORA) as unknown as { unitsPerEm: number; layout(s: string): { glyphs: Array<{ advanceWidth: number }> } };
    const widths = [...'Two words'].map((ch) => (lora.layout(ch).glyphs[0]!.advanceWidth * 1000) / lora.unitsPerEm);
    let x = 0;
    let g = 0;
    const starts: number[] = [];
    for (const item of arg.asArray()) {
      if (item instanceof PDFNumber) { x -= (item.asNumber() / 1000) * size; continue; }
      const hex = (item as PDFHexString).asString();
      for (let i = 0; i < hex.length; i += 4) {
        starts.push(x);
        x += (widths[g++]! / 1000) * size + tracking;
      }
    }
    expect(starts).toHaveLength(9);
    expect(starts[0]).toBeCloseTo(0, 2);
    expect(starts[3]).toBeCloseTo(30, 2); // the space
    expect(starts[4]).toBeCloseTo(35, 2); // "words"
  });
});
