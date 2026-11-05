import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import fontkit from '@pdf-lib/fontkit';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream, type PDFFont } from 'pdf-lib';
import { buildDocument, resolveParagraph } from 'postext';
import type { PostextConfig, VDTDocument, VDTLineSegment } from 'postext';
import { renderToPdf } from '../pdf-backend/index.js';
import { parseFontString } from '../fontString.js';
import { loadComplexShaper, shapeRun } from '../complexShaping.js';
import { fileRuns, registerFaceFiles } from '../faceFiles.js';
import { shapeInCurrentLanguage, shapingKey, shapingScript, withShapingScript } from '../shapingLanguage.js';
import { textAdvancePx } from '../pdf-backend/primitives.js';

// #725: a word with no letter (`46.`, `1367)`) is shaped in the script the
// layout measured it in (`VDTLineSegment.scriptContext`). fontkit reads no
// script from such a word and takes the font's default, which in Amiri is
// the Arabic forms of the full stop and the brackets: a Latin note set in
// Amiri printed them, wider than the places the layout held.

const fixture = (name: string) => new Uint8Array(fs.readFileSync(new URL(`./fixtures/arabic/${name}`, import.meta.url)));
const AMIRI = fixture('amiri-subset.ttf');
const LATIN_SLICE = fixture('amiri-latin-slice.ttf');
const ARABIC_SLICE = fixture('amiri-arabic-slice.ttf');
const fontProvider = async () => AMIRI;

/** Measures as a browser does once HarfBuzz is loaded: the text shaped in
 *  one run, in the direction of its first strong letter (or the one the
 *  context was set to) and the script HarfBuzz reads from its first
 *  character that has one. A word with no letter beside its mark is then
 *  shaped in the mark's script; alone, in the font's default forms. */
class HarfBuzzCtx {
  font = '';
  direction = 'ltr';
  letterSpacing = '0px';
  measureText(s: string): { width: number } {
    const size = parseFontString(this.font)?.sizePx ?? 16;
    const direction = this.direction === 'rtl' || resolveParagraph(s).paragraphLevel === 1 ? 'rtl' : 'ltr';
    const run = shapeRun(AMIRI, s, { direction });
    const advance = run ? run.glyphs.reduce((sum, g) => sum + g.xAdvance, 0) / run.upem : s.length * 0.5;
    return { width: advance * size };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): HarfBuzzCtx {
    return new HarfBuzzCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const SIZE = 20;
function config(overrides: Partial<PostextConfig> = {}): PostextConfig {
  return {
    page: { width: pt(560), height: pt(300), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
    locale: 'en',
    layout: { layoutType: 'single' },
    header: { elements: [] },
    footer: { elements: [] },
    bodyText: { fontFamily: 'Amiri', fontSize: pt(SIZE), lineHeight: pt(36), firstLineIndent: pt(0), textAlign: 'left', hyphenation: { enabled: false } },
    ...overrides,
  };
}
const segmentsOf = (doc: VDTDocument): VDTLineSegment[] =>
  doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks.flatMap((b) => b.lines.flatMap((l) => l.segments ?? []))));

const hasPdftotext = (() => {
  try {
    execFileSync('pdftotext', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();
/** The words of the PDF's first page with their boxes, px at 72 dpi. */
function wordBoxes(bytes: Uint8Array): { text: string; left: number; right: number }[] {
  const file = path.join(os.tmpdir(), `postext-script-context-${process.pid}-${Math.random().toString(36).slice(2)}.pdf`);
  fs.writeFileSync(file, bytes);
  const xml = execFileSync('pdftotext', ['-bbox', '-l', '1', file, '-'], { encoding: 'utf8' });
  fs.unlinkSync(file);
  return [...xml.matchAll(/<word xMin="([\d.]+)" yMin="[\d.]+" xMax="([\d.]+)" yMax="[\d.]+">([^<]*)<\/word>/g)]
    .map((m) => ({ text: m[3]!.replace(/&amp;/g, '&'), left: Number(m[1]), right: Number(m[2]) }));
}

let whole: PDFFont;
let arabic: PDFFont;
let latin: PDFFont;
beforeAll(async () => {
  await loadComplexShaper();
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  whole = await pdf.embedFont(AMIRI, { subset: true });
  arabic = await pdf.embedFont(ARABIC_SLICE, { subset: true });
  latin = await pdf.embedFont(LATIN_SLICE, { subset: true });
  for (const font of [whole, arabic, latin]) shapeInCurrentLanguage(font);
  // The Cookbook kit's order: the `arabic` file first.
  registerFaceFiles(arabic, [latin]);
});
const advance = (font: PDFFont, text: string, script?: string): number => withShapingScript(script, () => Math.round(textAdvancePx(font, text, 1000).advance));
const files = (text: string, script?: string, rtl = false): [string, string][] =>
  withShapingScript(script, () => fileRuns(arabic, text, rtl).map((r) => [r.font === latin ? 'latin' : 'arabic', r.text] as [string, string]));

describe('the script in force (#725)', () => {
  it('is set for one call and put back, and is no script the engine does not act on', () => {
    expect(shapingScript()).toBeUndefined();
    expect(withShapingScript('Latn', () => shapingScript())).toBe('Latn');
    expect(withShapingScript('Latn', () => withShapingScript('Arab', () => shapingScript()))).toBe('Arab');
    expect(withShapingScript('Thai', () => shapingScript())).toBeUndefined();
    expect(() => withShapingScript('Latn', () => { throw new Error('x'); })).toThrow();
    expect(shapingScript()).toBeUndefined();
    // Text shaped in a script is another entry of every cache.
    expect(shapingKey('46.')).toBe('46.');
    expect(withShapingScript('Latn', () => shapingKey('46.'))).not.toBe('46.');
    expect(withShapingScript('Latn', () => shapingKey('46.'))).not.toBe(withShapingScript('Arab', () => shapingKey('46.')));
  });

  it('shapes a word with no letter in it: Latin forms under Latin, the default ones otherwise', () => {
    // The widths Chrome measures beside each mark, in thousandths of an em.
    for (const [text, latn, dflt] of [['46.', 1266, 1381], ['1367)', 2383, 2586], ['2016).', 2585, 2903], ['(1367)', 2638, 3044], ['3.14', 1798, 1913]] as const) {
      expect(advance(whole, text), text).toBe(dflt);
      expect(advance(whole, text, 'Latn'), text).toBe(latn);
      expect(advance(whole, text, 'Arab'), text).toBe(dflt);
      // A script the face has no forms for: its default ones.
      expect(advance(whole, text, 'Grek'), text).toBe(dflt);
      expect(advance(whole, text, 'Hebr'), text).toBe(dflt);
      // HarfBuzz agrees, script by script.
      const hb = (script: string): number => {
        const run = shapeRun(AMIRI, text, { direction: 'ltr', script })!;
        return Math.round((run.glyphs.reduce((sum, g) => sum + g.xAdvance, 0) * 1000) / run.upem);
      };
      expect(hb('Latn')).toBe(latn);
      expect(hb('Arab')).toBe(dflt);
    }
    // The digits are the same under every script.
    expect(advance(whole, '1367', 'Latn')).toBe(advance(whole, '1367', 'Arab'));
  });

  it('keeps a number in its order under a right-to-left script', () => {
    // fontkit takes the direction from the script unless it is told.
    const face = (whole as unknown as { embedder: { font: { layout: (text: string) => { glyphs: { id: number }[] } } } }).embedder.font;
    const ids = (script?: string): string => withShapingScript(script, () => face.layout('1367').glyphs.map((g) => g.id).join(','));
    expect(ids('Arab')).toBe(ids());
    expect(ids('Hebr')).toBe(ids());
    expect(new Set(ids().split(',')).size).toBe(4);
  });
});

describe('a word with no letter in a face of several files (#725)', () => {
  it('is set whole in the file that holds a letter of its script', () => {
    // With no script each character goes to the first file that has it:
    // the `arabic` one holds `(`.
    expect(files('(')).toEqual([['arabic', '(']]);
    expect(files('(', 'Latn')).toEqual([['latin', '(']]);
    expect(files('1367)', 'Latn')).toEqual([['latin', '1367)']]);
    expect(files('46.', 'Latn')).toEqual([['latin', '46.']]);
    expect(advance(arabic, '(')).toBe(458);
    expect(advance(arabic, '(', 'Latn')).toBe(255);
    expect(advance(arabic, '1367)', 'Latn')).toBe(2383);
    expect(advance(arabic, '2016).', 'Latn')).toBe(2585);
  });

  it('a word the file cannot set whole is cut as any other text', () => {
    // The `arabic` file has no European digits.
    expect(files('1367', 'Arab')).toEqual(files('1367'));
    expect(advance(arabic, '3.14', 'Arab')).toBe(1913);
    // A bracket of a right-to-left run goes by the glyph the run shows
    // (#401): `(` shows as `)`, which only the `latin` file has.
    expect(files('(', 'Arab', true)).toEqual([['latin', '(']]);
    expect(files(')', 'Arab', true)).toEqual([['arabic', ')']]);
  });
});

describe('a Latin note set in Amiri (#725)', () => {
  const NOTE = 'He died (d. 1367) and the work (Brill, 2016). It ends in 46. Then more.';

  it('the layout measures each word with no letter in its Latin forms, and the PDF sets it that wide', () => {
    const doc = buildDocument({ markdown: NOTE }, config());
    const marked = segmentsOf(doc).filter((s) => s.scriptContext);
    expect(marked.map((s) => [s.text, s.scriptContext])).toEqual([['1367)', 'Latn'], ['2016).', 'Latn'], ['46.', 'Latn']]);
    const em = SIZE / 1000;
    expect(marked.map((s) => +(s.width / em).toFixed(0))).toEqual([2383, 2585, 1266]);
    for (const seg of marked) {
      // Shaped in the segment's script the PDF's advance is the measured
      // width; left to fontkit's own choice it was the Arabic forms'.
      expect(withShapingScript(seg.scriptContext, () => textAdvancePx(whole, seg.text, SIZE).advance)).toBeCloseTo(seg.width, 3);
      expect(textAdvancePx(whole, seg.text, SIZE).advance).toBeGreaterThan(seg.width + 2);
    }
  });

  it.skipIf(!hasPdftotext)('the PDF prints them in their places: each ends where its segment ends', async () => {
    const doc = buildDocument({ markdown: NOTE }, config());
    const off = buildDocument({ markdown: NOTE }, config({ bodyText: { ...config().bodyText, scriptContext: false } }));
    const boxes = wordBoxes(await renderToPdf(doc, { fontProvider, accessible: false }));
    const line = doc.pages[0]!.columns[0]!.blocks[0]!.lines[0]!;
    let x = line.bbox.x;
    const places = new Map<string, { left: number; right: number }>();
    for (const seg of line.segments!) {
      if (seg.kind !== 'space') places.set(seg.text, { left: x, right: x + seg.width });
      x += seg.width;
    }
    for (const text of ['1367)', '2016).']) {
      // The fixture lacks the note's letters: Poppler 26 joins the full stop
      // of `(d.` to the next word (`.1367)`), at the same left edge.
      const box = boxes.find((b) => b.text.endsWith(text))!;
      const place = places.get(text)!;
      expect(box, text).toBeDefined();
      expect(box.left).toBeCloseTo(place.left, 0);
      expect(box.right).toBeCloseTo(place.right, 0);
    }
    // With the rule off the layout holds the width its measurer gave the
    // word alone (the default forms), 4 px more for `1367)`.
    const wide = segmentsOf(off).find((s) => s.text === '1367)')!;
    expect(wide.scriptContext).toBeUndefined();
    expect(wide.width - segmentsOf(doc).find((s) => s.text === '1367)')!.width).toBeGreaterThan(3);
  }, 60_000);
});

describe('an Arabic sentence (#725)', () => {
  const AR = '\u062A\u0648\u0641\u064A';

  it('(1367) keeps its Arabic brackets, at the measured widths', async () => {
    const doc = buildDocument({ markdown: `${AR} (1367) ${AR}` }, config({ locale: 'ar', direction: 'rtl' }));
    const marked = segmentsOf(doc).filter((s) => s.scriptContext);
    expect(marked.map((s) => [s.text, s.scriptContext, s.rtl ?? false])).toEqual([['(', 'Arab', true], ['1367', 'Arab', false], [')', 'Arab', true]]);
    const em = SIZE / 1000;
    expect(marked.map((s) => +(s.width / em).toFixed(0))).toEqual([458, 2128, 458]);
    // A right-to-left bracket is HarfBuzz's, in the Arabic script: the
    // mirrored glyph, as wide.
    for (const seg of [marked[0]!, marked[2]!]) {
      const run = shapeRun(AMIRI, seg.text, { direction: 'rtl', script: 'Arab' })!;
      expect((run.glyphs.reduce((sum, g) => sum + g.xAdvance, 0) / run.upem) * SIZE).toBeCloseTo(seg.width, 3);
    }
    const open = shapeRun(AMIRI, '(', { direction: 'rtl', script: 'Arab' })!.glyphs[0]!.gid;
    expect(open).toBe(shapeRun(AMIRI, ')', { direction: 'ltr', script: 'Arab' })!.glyphs[0]!.gid);
    expect(open).not.toBe(shapeRun(AMIRI, ')', { direction: 'ltr', script: 'Latn' })!.glyphs[0]!.gid);
    const bytes = await renderToPdf(doc, { fontProvider, accessible: false });
    expect(bytes.length).toBeGreaterThan(1000);
    if (hasPdftotext) {
      const read = (pdf: Uint8Array): string => wordBoxes(pdf).map((b) => b.text).join(' ').replace(/[\s\u200E\u200F\u202A-\u202E]/g, '');
      // The sentence reads as it did before the rule.
      const off = buildDocument({ markdown: `${AR} (1367) ${AR}` }, config({ locale: 'ar', direction: 'rtl', bodyText: { ...config().bodyText, scriptContext: false } }));
      expect(read(bytes)).toContain('1367');
      expect(read(bytes)).toBe(read(await renderToPdf(off, { fontProvider, accessible: false })));
    }
  }, 60_000);
});

describe('a word with no letter on a tracked line (#725)', () => {
  const AR = '\u062A\u0648\u0641\u064A';
  const tracked = (overrides: Partial<PostextConfig> = {}): PostextConfig => config({ headings: { fontFamily: 'Amiri', levels: [{ level: 2, letterSpacing: pt(2), fontSize: pt(SIZE) }] }, ...overrides });
  async function spacings(doc: VDTDocument): Promise<number[]> {
    const pdf = await PDFDocument.load(await renderToPdf(doc, { fontProvider, accessible: false }));
    const contents = pdf.getPage(0).node.Contents();
    const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
    const content = refs.map((ref) => {
      const stream = pdf.context.lookup(ref);
      return stream instanceof PDFRawStream ? new TextDecoder('latin1').decode(decodePDFRawStream(stream).decode()) : '';
    }).join('\n');
    return [...content.matchAll(/(-?[\d.]+) Tc/g)].map((m) => Number(m[1]));
  }

  it('in a Latin context it is spaced with its line', async () => {
    const doc = buildDocument({ markdown: '## It ends in 46.' }, tracked());
    const seg = segmentsOf(doc).find((s) => s.text === '46.')!;
    expect(seg.scriptContext).toBe('Latn');
    expect(seg.width).toBeCloseTo(1266 * (SIZE / 1000) + 3 * 2, 3);
    expect(await spacings(doc)).toEqual([2, 0]);
  }, 60_000);

  it('in the Arabic script it takes none: the spacing is lifted for it', async () => {
    const doc = buildDocument({ markdown: `## ${AR} (1367) ${AR}` }, tracked({ locale: 'ar', direction: 'rtl' }));
    const number = segmentsOf(doc).find((s) => s.text === '1367')!;
    expect(number.scriptContext).toBe('Arab');
    expect(number.width).toBeCloseTo(2128 * (SIZE / 1000), 3);
    const all = await spacings(doc);
    // The line's spacing, lifted and put back around the number (the
    // brackets and the Arabic words are HarfBuzz's, which lifts it itself).
    expect(all[0]).toBe(2);
    expect(all[all.length - 1]).toBe(0);
    expect(all.filter((v) => v === 0).length).toBeGreaterThan(1);
    const at = all.indexOf(0);
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(all.length - 1);
  }, 60_000);
});
