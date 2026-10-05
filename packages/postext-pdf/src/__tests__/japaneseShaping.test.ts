import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRawStream, PDFRef, PDFStream, PDFString, decodePDFRawStream } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument } from 'postext';
import type { PostextConfig } from 'postext';
import { renderToPdf } from '../pdf-backend';
import { parseFontString } from '../fontString';
import { openTypeLanguageOf, shapingKey, shapingLanguage, withShapingLanguage } from '../shapingLanguage';

// Issue #427: Japanese text is shaped in the OpenType language system
// `JAN `, so the PDF prints the Japanese forms (`locl`) the canvas and the
// HTML print through `lang`; any other language keeps the font's default
// forms. Noto Serif JP sets “ ” of Japanese text in their `JAN ` forms
// (wider, set higher), which tells the two apart here.

const JP = new Uint8Array(fs.readFileSync(new URL('./fixtures/cjk/noto-serif-jp-vertical.ttf', import.meta.url)));
const face = fontkit.create(Buffer.from(JP));
const fontProvider = async () => JP;
/** fontkit's `layout` with a script and a language (its typings name only
 *  the text and the features). */
const layoutIn = (text: string, features: string[], script?: string, language?: string) =>
  (face.layout as unknown as (...args: unknown[]) => ReturnType<typeof face.layout>)(text, features, script, language);

class StubCtx {
  font = '';
  letterSpacing = '0px';
  measureText(s: string) {
    const f = parseFontString(this.font);
    const run = face.layout(s);
    const k = (f?.sizePx ?? 16) / face.unitsPerEm;
    let w = 0;
    for (const p of run.positions) w += p.xAdvance;
    return { width: w * k, actualBoundingBoxAscent: 0.88 * (f?.sizePx ?? 16), actualBoundingBoxDescent: 0.12 * (f?.sizePx ?? 16), actualBoundingBoxLeft: 0, actualBoundingBoxRight: w * k };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config = (locale: string, vertical = false): PostextConfig => ({
  locale,
  page: { width: pt(300), height: pt(420), dpi: 72, margins: { top: pt(40), bottom: pt(40), left: pt(30), right: pt(30) } },
  layout: { layoutType: 'single', ...(vertical ? { writingMode: 'vertical-rl' as const } : {}) },
  bodyText: { fontFamily: 'Noto Serif JP', fontSize: pt(16), lineHeight: pt(24), firstLineIndent: pt(0), textAlign: 'left', hyphenation: { enabled: false } },
  headings: { fontFamily: 'Noto Serif JP' },
  header: { elements: [] },
  footer: { elements: [] },
});

async function render(markdown: string, cfg: PostextConfig) {
  const doc = buildDocument({ markdown }, cfg);
  return PDFDocument.load(await renderToPdf(doc, { fontProvider }));
}

function pageOps(pdf: PDFDocument): string {
  const contents = pdf.getPage(0).node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  return refs.map((ref) => {
    const s = pdf.context.lookup(ref);
    return s instanceof PDFRawStream ? new TextDecoder('latin1').decode(decodePDFRawStream(s).decode()) : '';
  }).join('\n');
}

/** The outline boxes of every glyph the page shows, in either encoding. */
function shownBoxes(pdf: PDFDocument): string[] {
  const fonts = pdf.getPage(0).node.Resources()!.lookup(PDFName.of('Font'), PDFDict);
  const faces = new Map<string, ReturnType<typeof fontkit.create>>();
  for (const [name, ref] of fonts.entries()) {
    const type0 = pdf.context.lookup(ref as PDFRef, PDFDict);
    const cid = type0.lookup(PDFName.of('DescendantFonts'), PDFArray).lookup(0, PDFDict);
    const file = cid.lookup(PDFName.of('FontDescriptor'), PDFDict).lookup(PDFName.of('FontFile2')) as PDFStream;
    faces.set(name.asString().replace(/^\//, ''), fontkit.create(Buffer.from(decodePDFRawStream(file as PDFRawStream).decode())));
  }
  const out: string[] = [];
  let font = '';
  for (const line of pageOps(pdf).split('\n')) {
    const tf = /^\/(\S+) [\d.]+ Tf$/.exec(line);
    if (tf) font = tf[1]!;
    if (!/ (Tj|TJ)$/.test(line)) continue;
    const embedded = faces.get(font)!;
    const hex = [...line.matchAll(/<([0-9a-fA-F]+)>/g)].map((h) => h[1]!).join('');
    for (let i = 0; i < hex.length; i += 4) out.push(JSON.stringify(embedded.getGlyph(parseInt(hex.slice(i, i + 4), 16)).bbox));
  }
  return out;
}

/** The box of `ch` shaped inside Japanese text, in the default or the
 *  Japanese language system. */
const quote = (language?: string) => JSON.stringify(layoutIn('本“', [], undefined, language).glyphs[1]!.bbox);

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

describe('the shaping language (#427)', () => {
  it('is JAN for Japanese and the font’s default for every other language', () => {
    for (const tag of ['ja', 'ja-JP', 'ja-Jpan']) expect(openTypeLanguageOf(tag), tag).toBe('JAN');
    for (const tag of ['zh-Hans', 'zh-Hant-TW', 'ko', 'en', 'ar', undefined]) expect(openTypeLanguageOf(tag), String(tag)).toBeUndefined();
  });

  it('is in force inside withShapingLanguage only, also when it throws, and keys the caches', () => {
    expect(shapingLanguage()).toBeUndefined();
    expect(shapingKey('本')).toBe('本');
    withShapingLanguage('JAN', () => {
      expect(shapingLanguage()).toBe('JAN');
      expect(shapingKey('本')).not.toBe('本');
      withShapingLanguage(undefined, () => expect(shapingLanguage()).toBeUndefined());
      expect(shapingLanguage()).toBe('JAN');
    });
    expect(() => withShapingLanguage('JAN', () => {
      throw new Error('x');
    })).toThrow('x');
    expect(shapingLanguage()).toBeUndefined();
  });
});

describe('Japanese glyph forms in the PDF (#427)', () => {
  it('prints the JAN form of a Japanese document’s quotes, the default one in a Chinese document', async () => {
    expect(quote('JAN')).not.toBe(quote());
    const ja = shownBoxes(await render('私は“本当”と書く。', config('ja')));
    expect(ja).toContain(quote('JAN'));
    expect(ja).not.toContain(quote());
    const zh = shownBoxes(await render('私は“本当”と書く。', config('zh-Hans')));
    expect(zh).toContain(quote());
    expect(zh).not.toContain(quote('JAN'));
  });

  it('shapes a segment in its own language', async () => {
    // A Chinese quotation in a Japanese book takes the default forms; a
    // Japanese one in a Chinese book the Japanese forms.
    const ja = shownBoxes(await render('私は:ltr[“本当”]{lang=zh}と書く。', config('ja')));
    expect(ja).toContain(quote());
    expect(ja).not.toContain(quote('JAN'));
    const zh = shownBoxes(await render('私は:ltr[“本当”]{lang=ja}と書く。', config('zh-Hans')));
    expect(zh).toContain(quote('JAN'));
  });

  it('tags a run in another language in a Japanese line as a Span with its /Lang', async () => {
    const ja = await render('私は:ltr[the end]{lang=en}と書く。', config('ja'));
    expect(structElems(ja).filter((e) => e.type === 'Span' && e.lang)).toEqual([{ type: 'Span', lang: 'en' }]);
    // In a Chinese document the line keeps the structure it had.
    const zh = await render('私は:ltr[the end]{lang=en}と書く。', config('zh-Hans'));
    expect(structElems(zh).filter((e) => e.type === 'Span' && e.lang)).toEqual([]);
  });

  it('shapes the sideways runs of a vertical line in JAN too', async () => {
    // Noto Serif JP's ASCII quote has a JAN form in Latin text as well.
    const box = (language?: string) => JSON.stringify(layoutIn('"hi"', [], undefined, language).glyphs[0]!.bbox);
    expect(box('JAN')).not.toBe(box());
    const ja = shownBoxes(await render('彼は "hi" と', config('ja', true)));
    expect(ja).toContain(box('JAN'));
    expect(ja).not.toContain(box());
    const zh = shownBoxes(await render('彼は "hi" と', config('zh-Hans', true)));
    expect(zh).toContain(box());
  });
});
