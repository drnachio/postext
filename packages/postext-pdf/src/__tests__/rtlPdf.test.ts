import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import fontkit from '@pdf-lib/fontkit';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFString, PDFHexString, decodePDFRawStream, type PDFFont } from 'pdf-lib';
import { buildDocument, resolveParagraph } from 'postext';
import type { PostextConfig, VDTDocument, VDTLine } from 'postext';
import { renderToPdf } from '../pdf-backend';
import { parseFontString } from '../fontString';
import { complexShaperReady, loadComplexShaper, shapeRun } from '../complexShaping';
import { fileRuns, registerFaceFiles } from '../faceFiles';
import { svgToVectorDrawing, type VectorFont, type VectorText } from '../pdf-backend/svgVector';

// Issue #380, part 2: the PDF renderer on the right-to-left VDT the engine
// produces — lines laid out in `order` and painted and tagged in logical
// order, opposite-direction blocks aligned in their `measure`, words in
// several styles shaped whole, exact advances on mirrored pages, joining
// controls kept with their letters, per-span `/Lang`, and Arabic in SVG
// figures.

const fixture = (name: string) => new Uint8Array(fs.readFileSync(new URL(`./fixtures/arabic/${name}`, import.meta.url)));
const AMIRI = fixture('amiri-subset.ttf');
const AMIRI_BOLD = fixture('amiri-bold-subset.ttf');
const LATIN_SLICE = fixture('amiri-latin-slice.ttf');
const ARABIC_SLICE = fixture('amiri-arabic-slice.ttf');
const fontProvider = async (_family: string, weight: number) => (weight >= 600 ? AMIRI_BOLD : AMIRI);

/** Measures like Chrome once HarfBuzz is loaded: each piece in the
 *  direction of its first strong letter, in the bold face for a bold font. */
class HarfBuzzCtx {
  font = '';
  letterSpacing = '0px';
  measureText(s: string): { width: number } {
    const parsed = parseFontString(this.font);
    const bytes = (parsed?.weight ?? 400) >= 600 ? AMIRI_BOLD : AMIRI;
    const run = shapeRun(bytes, s, { direction: resolveParagraph(s).paragraphLevel === 1 ? 'rtl' : 'ltr' });
    const advance = run ? run.glyphs.reduce((sum, g) => sum + g.xAdvance, 0) / run.upem : s.length * 0.5;
    return { width: advance * (parsed?.sizePx ?? 16) };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): HarfBuzzCtx {
    return new HarfBuzzCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });

function config(overrides: Partial<PostextConfig> = {}, bodyText: PostextConfig['bodyText'] = {}): PostextConfig {
  return {
    page: { width: pt(420), height: pt(300), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
    locale: 'ar',
    direction: 'ltr',
    layout: { layoutType: 'single' },
    header: { elements: [] },
    footer: { elements: [] },
    bodyText: { fontFamily: 'Amiri', fontSize: pt(18), lineHeight: pt(36), firstLineIndent: pt(0), textAlign: 'left', hyphenation: { enabled: false }, ...bodyText },
    ...overrides,
  };
}

function lines(doc: VDTDocument): VDTLine[] {
  return doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks.flatMap((b) => b.lines)));
}

function pageContent(pdf: PDFDocument, index = 0): string {
  const contents = pdf.getPage(index).node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  return refs
    .map((ref) => {
      const s = pdf.context.lookup(ref);
      return s instanceof PDFRawStream ? new TextDecoder('latin1').decode(decodePDFRawStream(s).decode()) : '';
    })
    .join('\n');
}

/** Every structure element of the file: its type and `/Lang`. */
function structElems(pdf: PDFDocument): Array<{ type: string; lang?: string }> {
  const out: Array<{ type: string; lang?: string }> = [];
  for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict) || obj.get(PDFName.of('Type')) !== PDFName.of('StructElem')) continue;
    const lang = obj.get(PDFName.of('Lang'));
    out.push({
      type: (obj.get(PDFName.of('S')) as PDFName).decodeText(),
      ...(lang instanceof PDFString || lang instanceof PDFHexString ? { lang: lang.decodeText() } : {}),
    });
  }
  return out;
}

const hasPdftotext = (() => {
  try {
    execFileSync('pdftotext', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

/** The text pdftotext reads, without white space and the embedding
 *  controls Poppler adds; with `raw`, in content stream order. */
function extract(bytes: Uint8Array, name: string, raw = false): string {
  const file = path.join(os.tmpdir(), `postext-rtl-${process.pid}-${name}.pdf`);
  fs.writeFileSync(file, bytes);
  const text = execFileSync('pdftotext', [...(raw ? ['-raw'] : []), '-enc', 'UTF-8', file, '-'], { encoding: 'utf8' });
  fs.unlinkSync(file);
  return text.replace(/[\s\f‪-‮]/g, '');
}

beforeAll(async () => {
  expect(await loadComplexShaper()).toBe(true);
});

describe('words in several styles', () => {
  it('shapes the word whole and paints the bold letter in its face, scaled into its box', async () => {
    const doc = buildDocument({ markdown: 'كتا**ب** بيت' }, config({}, { boldColor: { hex: '#c00000', model: 'hex' } }));
    const word = lines(doc)[0]!.segments!.find((s) => s.runs)!;
    expect(word.text).toBe('كتاب');
    expect(word.runs!.map((r) => [r.text, !!r.bold])).toEqual([['كتا', false], ['ب', true]]);
    const bytes = await renderToPdf(doc, { fontProvider });
    const content = pageContent(await PDFDocument.load(bytes));
    // One text object: the bold ب (leftmost glyph in visual order) in the
    // bold face and colour (scaled to its box when its width differs),
    // then the rest in the text face and colour, placed with `Td`.
    const object = content.split('BT\n').find((o) => /^0\.75\d* 0 0 rg$/m.test(o))!;
    expect(object).toBeDefined();
    expect(object.split('\n').filter((l) => / rg$/.test(l))).toEqual(['0 0 0 rg', expect.stringMatching(/^0\.75\d* 0 0 rg$/), '0 0 0 rg']);
    expect(object).toMatch(/^[\d.]+ 0 Td$/m);
    const scale = /^([\d.]+) Tz$/m.exec(object);
    if (scale) expect(Math.abs(Number(scale[1]) - 100)).toBeLessThan(30);
    const faces = [...object.matchAll(/^\/(\S+) [\d.]+ Tf$/gm)].map((m) => m[1]!);
    expect(faces).toHaveLength(2);
    expect(faces[0]).toMatch(/Bold/);
    expect(faces[1]).toMatch(/Regular/);
    if (hasPdftotext) expect(extract(bytes, 'styled')).toBe('كتاببيت');
  });

  it('colours a vowel sign apart from its letter', async () => {
    // A bold fatha: no advance of its own, so it keeps the word's face and
    // takes the bold colour alone.
    const doc = buildDocument({ markdown: 'كتاب**َ** بيت' }, config({}, { boldColor: { hex: '#c00000', model: 'hex' } }));
    const word = lines(doc)[0]!.segments!.find((s) => s.runs)!;
    expect(word.runs!.map((r) => r.text)).toEqual(['كتاب', 'َ']);
    const content = pageContent(await PDFDocument.load(await renderToPdf(doc, { fontProvider })));
    const object = content.split('BT\n').find((o) => /^0\.75\d* 0 0 rg$/m.test(o))!;
    expect(object).toBeDefined();
    expect(object).not.toMatch(/ Tz$/m);
    expect(new Set([...object.matchAll(/^\/(\S+) [\d.]+ Tf$/gm)].map((m) => m[1])).size).toBe(1);
  });
});

describe('a block against its frame (`measure`)', () => {
  it('sets the lines of a right-to-left block in an English page flush right, as the canvas does', async () => {
    const AR = 'السلام عليكم ورحمة الله وبركاته';
    const doc = buildDocument({ markdown: `:::paragraphs{dir=rtl}\n${AR} ${AR} ${AR}\n:::` }, config({ locale: 'en' }, { textAlign: 'justify', firstLineIndent: pt(30) }));
    const ls = lines(doc);
    expect(ls.length).toBeGreaterThan(1);
    expect(ls.every((l) => l.measure)).toBe(true);
    const content = pageContent(await PDFDocument.load(await renderToPdf(doc, { fontProvider, accessible: false })));
    const xsOn = (line: VDTLine) => [...content.matchAll(/^1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm$/gm)]
      .filter((m) => Math.abs(Number(m[2]) - (300 - line.baseline)) < 0.01)
      .map((m) => Number(m[1]));
    const words = (line: VDTLine) => line.segments!.filter((s) => s.kind !== 'space');
    for (const line of ls) {
      const { x, width } = line.measure!;
      const xs = xsOn(line);
      expect(xs).toHaveLength(words(line).length);
      // The first word written ends at the right edge of the measure (the
      // indent is on the left of a line set from the right only on the
      // last line).
      const first = words(line)[0]!;
      expect(Math.max(...xs) + first.width).toBeCloseTo(x + width, 1);
      if (!line.isLastLine) expect(Math.min(...xs)).toBeCloseTo(x, 1);
    }
    // The first line is short by the indent, on its left: its measure.
    expect(ls[0]!.measure!.width).toBeCloseTo(ls[1]!.measure!.width - 30, 1);
  });
});

describe('a right-to-left (mirrored) page', () => {
  it('turns each shaped run back about the box of its HarfBuzz advance', async () => {
    const doc = buildDocument({ markdown: 'السلام عليكم ورحمة الله' }, config({ direction: 'rtl' }));
    const line = lines(doc)[0]!;
    const content = pageContent(await PDFDocument.load(await renderToPdf(doc, { fontProvider, accessible: false })));
    const xs = [...content.matchAll(/^-1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm$/gm)].map((m) => Number(m[1]));
    // Each word's text matrix sits at the right end of its box in the flow:
    // its x plus the width HarfBuzz gives it, to the hundredth of a point.
    const order = line.order ?? line.segments!.map((_, i) => i);
    let x = line.bbox.x;
    const ends: number[] = [];
    for (const i of order) {
      const seg = line.segments![i]!;
      if (seg.kind !== 'space') ends.push(x + seg.width);
      x += seg.width;
    }
    expect(xs).toHaveLength(ends.length);
    for (const end of ends) expect(xs.some((v) => Math.abs(v - end) < 0.006)).toBe(true);
  });
});

describe('tagging', () => {
  it('declares an Arabic document in Arabic and tags no Span for its own script', async () => {
    const doc = buildDocument({ markdown: 'السلام عليكم ورحمة الله' }, config());
    const pdf = await PDFDocument.load(await renderToPdf(doc, { fontProvider }));
    expect(pdf.catalog.get(PDFName.of('Lang'))?.toString()).toBe('(ar)');
    expect(structElems(pdf).filter((e) => e.type === 'Span')).toEqual([]);
  });

  it('tags an Arabic quotation in an English book as a Span in Arabic, in logical order', async () => {
    // (The test face has A, Z and the letters of "Latin" only.)
    const doc = buildDocument({ markdown: 'AAA Latin السلام عليكم ١٤٤٥ ورحمة Latin ZZZ' }, config({ locale: 'en' }));
    const line = lines(doc)[0]!;
    expect(line.order).toBeDefined();
    const bytes = await renderToPdf(doc, { fontProvider });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.catalog.get(PDFName.of('Lang'))?.toString()).toBe('(en)');
    const spans = structElems(pdf).filter((e) => e.type === 'Span');
    // One Span for the quotation, the digits and the spaces inside it too.
    expect(spans).toEqual([{ type: 'Span', lang: 'ar' }]);
    // The marked content follows the text as written: the Span's sequence
    // opens after the first Latin's and closes before the second's.
    const content = pageContent(pdf);
    const tags = [...content.matchAll(/^\/(P|Span) <<\n\/MCID (\d+)\n>> BDC$/gm)].map((m) => m[1]);
    expect(tags).toEqual(['P', 'Span', 'P']);
    // The content stream holds the line as written. (Read by position,
    // Poppler cuts the quotation's right-to-left run at the number in a
    // left-to-right line and reads its two halves the wrong way round.)
    if (hasPdftotext) expect(extract(bytes, 'quote', true)).toBe('AAALatinالسلامعليكم١٤٤٥ورحمةLatinZZZ');
  });
});

describe('face slices', () => {
  it('keeps a joining control with the Arabic letters around it', async () => {
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    const latin: PDFFont = await pdf.embedFont(LATIN_SLICE, { subset: true });
    const arabic: PDFFont = await pdf.embedFont(AMIRI, { subset: true });
    registerFaceFiles(latin, [arabic]);
    const runs = (text: string) => fileRuns(latin, text).map((r) => [r.font === latin ? 'latin' : 'arabic', r.text]);
    // After a letter: with it, even though the Latin file covers it.
    expect(runs('كتا‌ب')).toEqual([['arabic', 'كتا‌ب']]);
    // Opening the text or after a space: with the letter after it.
    expect(runs('‍ب')).toEqual([['arabic', '‍ب']]);
    expect(runs('AB ‍ب')).toEqual([['latin', 'AB '], ['arabic', '‍ب']]);
    // Latin text keeps its joiners.
    expect(runs('A‍B')).toEqual([['latin', 'A‍B']]);
    // The joiner shapes: ب after a ZWJ takes its final form.
    const alone = shapeRun(AMIRI, 'ب', { direction: 'rtl' })!.glyphs.map((g) => g.gid);
    const joined = shapeRun(AMIRI, '‍ب', { direction: 'rtl' })!.glyphs.map((g) => g.gid);
    expect(joined).not.toEqual(alone);
  });
});

describe('brackets in a right-to-left run of a sliced face (#401)', () => {
  // Fontsource's `arabic` file of Amiri has `(` and no `)`. HarfBuzz mirrors
  // a bracket of a right-to-left run only when the file it shapes in has
  // the mirror, so an opening bracket cut into that file printed as `(`:
  // «(١)» came out «(١(».
  async function slices() {
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    const arabic: PDFFont = await pdf.embedFont(ARABIC_SLICE, { subset: true });
    const latin: PDFFont = await pdf.embedFont(LATIN_SLICE, { subset: true });
    registerFaceFiles(arabic, [latin]);
    return (text: string, rtl: boolean) => fileRuns(arabic, text, rtl).map((r) => [r.font === latin ? 'latin' : 'arabic', r.text]);
  }

  it('sets a mirrored character in a file that has the glyph the run shows', async () => {
    const runs = await slices();
    // Right to left: `(` shows as `)`, which only the Latin file has; `)`
    // shows as `(`, which the Arabic file has.
    expect(runs('(١)', true)).toEqual([['latin', '('], ['arabic', '١)']]);
    expect(runs('(', true)).toEqual([['latin', '(']]);
    expect(runs(')', true)).toEqual([['arabic', ')']]);
    expect(runs('(قوس', true)).toEqual([['latin', '('], ['arabic', 'قوس']]);
    // Left to right, and characters with no mirror, as before.
    expect(runs('(١)', false)).toEqual([['arabic', '(١'], ['latin', ')']]);
    expect(runs('كتاب ١٤٤٥', true)).toEqual([['arabic', 'كتاب ١٤٤٥']]);
  });

  it('so the bracket is shaped mirrored', async () => {
    const mirrored = shapeRun(LATIN_SLICE, '(', { direction: 'rtl' })!.glyphs[0]!.gid;
    expect(mirrored).toBe(shapeRun(LATIN_SLICE, ')', { direction: 'ltr' })!.glyphs[0]!.gid);
    // In the Arabic file the same run keeps the unmirrored glyph: the bug.
    expect(shapeRun(ARABIC_SLICE, '(', { direction: 'rtl' })!.glyphs[0]!.gid).toBe(shapeRun(ARABIC_SLICE, '(', { direction: 'ltr' })!.glyphs[0]!.gid);
  });
});

describe('Arabic in an SVG figure', () => {
  async function amiriFont(): Promise<VectorFont> {
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    const pdfFont = await pdf.embedFont(AMIRI, { subset: true });
    return { pdfFont, widthOf: (text, size) => pdfFont.widthOfTextAtSize(text, size) };
  }

  it('lays an Arabic label out with HarfBuzz, anchored by its direction', async () => {
    const font = await amiriFont();
    const runOf = (svg: string) => (svgToVectorDrawing(svg, { fonts: () => font })!.shapes[0] as VectorText).runs[0]!;
    const label = 'السلام عليكم';
    const width = shapeRun(AMIRI, label, { direction: 'rtl' })!.glyphs.reduce((s, g) => s + g.xAdvance, 0) / 1000 * 20;
    const ltr = runOf(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 50"><text x="100" y="30" font-family="Amiri" font-size="20">${label}</text></svg>`);
    expect(ltr.base).toBe('ltr');
    expect(ltr.x).toBe(100);
    const rtl = runOf(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 50"><text x="100" y="30" direction="rtl" font-family="Amiri" font-size="20">${label}</text></svg>`);
    expect(rtl.base).toBe('rtl');
    // `start` is the right end of a right-to-left text.
    expect(rtl.x).toBeCloseTo(100 - width, 3);
    const middle = runOf(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 50"><text x="100" y="30" text-anchor="middle" font-family="Amiri" font-size="20">${label}</text></svg>`);
    expect(middle.x).toBeCloseTo(100 - width / 2, 3);
    // Latin text is laid out as before.
    expect(runOf(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 50"><text x="10" y="30" font-family="Amiri" font-size="20">AAA</text></svg>`).base).toBeUndefined();
  });

  it('paints it shaped in the figure, and reads back in logical order', async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60"><rect width="200" height="60" fill="#eeeeee"/><text x="100" y="40" text-anchor="middle" font-family="Amiri" font-size="24">السلام عليكم</text></svg>');
    const doc = buildDocument({
      markdown: 'AAA\n\n::resource{id="fig"}',
      resources: [{ id: 'fig', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0, svg: { fileId: 'fig.svg', width: 200, height: 60 } }],
    } as Parameters<typeof buildDocument>[0], config({ locale: 'en' }));
    const bytes = await renderToPdf(doc, { fontProvider, resourceBytes: (id) => (id === 'fig.svg' ? svg : undefined) });
    expect(complexShaperReady()).toBe(true);
    if (hasPdftotext) expect(extract(bytes, 'svg')).toContain('السلامعليكم');
  });
});
