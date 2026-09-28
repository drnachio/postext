import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef, PDFStream, decodePDFRawStream } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument } from 'postext';
import type { PostextConfig } from 'postext';
import { renderToPdf, type PdfWarning } from '../pdf-backend';
import { FontCache, type FontFileIssue, type PdfFontRequest } from '../fontCache';
import { parseFontString } from '../fontString';

// Issue #196: a face made of several files (Fontsource's unicode-range
// slices of Noto Serif TC), picked per character, each embedded as a subset
// of the glyphs drawn from it; characters no file has are reported.

const FIXTURES = new URL('./fixtures/cjk/', import.meta.url);
const read = (name: string) => new Uint8Array(fs.readFileSync(new URL(name, FIXTURES)));

/** Slice file → unicode-range, in the order the Fontsource CSS declares them. */
const SLICES = JSON.parse(fs.readFileSync(new URL('slices.json', FIXTURES), 'utf-8')) as Record<string, string>;

function inRange(range: string, cp: number): boolean {
  return range.split(',').some((part) => {
    const [lo, hi] = part.trim().slice(2).split('-');
    return cp >= parseInt(lo!, 16) && cp <= parseInt(hi ?? lo!, 16);
  });
}

/** The slices a provider hands over for `codePoints`: those whose range
 *  holds one of them, the last declared first (CSS font matching). */
function slicesFor(codePoints: Iterable<number>): string[] {
  const names = Object.keys(SLICES).reverse();
  const out = new Set<string>();
  for (const cp of codePoints) {
    const hit = names.find((name) => inRange(SLICES[name]!, cp));
    if (hit) out.add(hit);
  }
  return names.filter((name) => out.has(name));
}

const faces = new Map<string, ReturnType<typeof fontkit.create>>();
const faceOf = (name: string) => {
  let face = faces.get(name);
  if (!face) faces.set(name, (face = fontkit.create(Buffer.from(read(name)))));
  return face;
};
const latin = fontkit.create(fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url)));

/** Measures with the slice that has each character (the way the browser
 *  sets a unicode-range face), Latin with Lora. */
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const sizePx = parseFontString(this.font)?.sizePx ?? 16;
    let units = 0;
    for (const ch of s) {
      const cp = ch.codePointAt(0)!;
      const name = cp < 0x2e80 ? undefined : slicesFor([cp])[0];
      const face = name ? faceOf(name) : latin;
      units += (face.glyphForCodePoint(cp).advanceWidth / face.unitsPerEm) * 1000;
    }
    return { width: (units / 1000) * sizePx };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config: PostextConfig = {
  page: { width: pt(260), height: pt(360), margins: { top: pt(24), bottom: pt(24), left: pt(24), right: pt(24) } },
  bodyText: { fontFamily: 'Noto Serif TC', fontSize: pt(11), hyphenation: { enabled: false } },
  headings: { fontFamily: 'Noto Serif TC', levels: [{ level: 1, breakBefore: { enabled: false } }] },
  header: { elements: [] },
  footer: { elements: [] },
};

const TITLE = '紅樓夢第一回';
const PARAGRAPH = '此開卷第一回也。作者自云：因曾歷過一番夢幻之後，故將真事隱去，而借「通靈」之說，撰此《石頭記》一書也。';
const MARKDOWN = `# ${TITLE}\n\n${PARAGRAPH}\n`;

/** Every text the pages show, font by font: the glyph ids of each `Tj` /
 *  `TJ` string mapped back to characters through its font's ToUnicode. */
async function shownText(bytes: Uint8Array): Promise<{ text: string; notdef: number; fonts: Set<string> }> {
  const pdf = await PDFDocument.load(bytes);
  let text = '';
  let notdef = 0;
  const fonts = new Set<string>();
  for (const page of pdf.getPages()) {
    const resources = page.node.Resources()!.lookup(PDFName.of('Font'), PDFDict);
    const cmaps = new Map<string, Map<string, string>>();
    for (const [name, ref] of resources.entries()) {
      const font = pdf.context.lookup(ref, PDFDict);
      const stream = pdf.context.lookup(font.get(PDFName.of('ToUnicode')));
      const map = new Map<string, string>();
      if (stream instanceof PDFRawStream) {
        const cmap = new TextDecoder('latin1').decode(decodePDFRawStream(stream).decode());
        for (const m of cmap.matchAll(/<([0-9a-f]{4})> <([0-9a-f]+)>/gi)) {
          const units = m[2]!.match(/.{4}/g)!.map((h) => parseInt(h, 16));
          map.set(m[1]!.toLowerCase(), String.fromCharCode(...units));
        }
      }
      cmaps.set(name.asString(), map);
    }
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray ? contents.asArray() : [contents];
    let content = '';
    for (const ref of streams) {
      const stream = ref instanceof PDFRef ? pdf.context.lookup(ref) : ref;
      if (stream instanceof PDFRawStream) content += new TextDecoder('latin1').decode(decodePDFRawStream(stream).decode());
      else if (stream instanceof PDFStream) content += new TextDecoder('latin1').decode(stream.getContents());
    }
    let current = '';
    for (const m of content.matchAll(/(\/[^\s/]+)\s+[\d.]+\s+Tf|<([0-9A-Fa-f]*)>|\]\s*TJ/g)) {
      if (m[1]) {
        current = m[1];
        fonts.add(current);
        continue;
      }
      if (m[2] === undefined) continue;
      for (const cid of m[2].toLowerCase().match(/.{4}/g) ?? []) {
        if (cid === '0000') notdef++;
        text += cmaps.get(current)?.get(cid) ?? '�';
      }
    }
  }
  return { text, notdef, fonts };
}

/** The Type0 fonts written to the file, with the size of each font program. */
async function embeddedFonts(bytes: Uint8Array): Promise<number[]> {
  const pdf = await PDFDocument.load(bytes);
  const sizes: number[] = [];
  for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict) || obj.get(PDFName.of('Subtype'))?.toString() !== '/Type0') continue;
    const cid = pdf.context.lookup((obj.lookup(PDFName.of('DescendantFonts'), PDFArray)).get(0), PDFDict);
    const descriptor = cid.lookup(PDFName.of('FontDescriptor'), PDFDict);
    const program = descriptor.lookup(PDFName.of('FontFile2')) as PDFRawStream;
    sizes.push(program.getContents().length);
  }
  return sizes;
}

function sliceProvider(asked: Array<{ weight: number; codePoints: number[] }>) {
  return async (_family: string, weight: number, _style: string, request?: PdfFontRequest) => {
    const codePoints = [...(request?.codePoints ?? [])];
    asked.push({ weight, codePoints });
    return slicesFor(codePoints.length > 0 ? codePoints : [0x20]).map(read);
  };
}

const HAN_AND_MARKS = new Set([...TITLE + PARAGRAPH]);

describe('faces made of several files (#196)', () => {
  it('draws every character of 紅樓夢第一回 from the slice that has it', async () => {
    const doc = buildDocument({ markdown: MARKDOWN }, config);
    const asked: Array<{ weight: number; codePoints: number[] }> = [];
    const warnings: PdfWarning[] = [];
    const bytes = await renderToPdf(doc, { fontProvider: sliceProvider(asked), onWarning: (w) => warnings.push(w), accessible: false });
    const shown = await shownText(bytes);
    expect(shown.notdef).toBe(0);
    expect(shown.text.replace(/\s/g, '')).toBe((TITLE + PARAGRAPH).replace(/\s/g, ''));
    // The provider heard of every character, per face (heading 700, body 400).
    for (const request of asked) {
      for (const cp of request.codePoints) expect(HAN_AND_MARKS.has(String.fromCodePoint(cp)) || cp === 0x20).toBe(true);
    }
    expect(warnings.filter((w) => w.kind === 'missingGlyph')).toEqual([]);
  });

  it('embeds only the slices drawn from, each as a subset', async () => {
    const doc = buildDocument({ markdown: `${PARAGRAPH}\n` }, config);
    // A provider handing over every slice it has, used or not.
    const all = Object.keys(SLICES).reverse();
    const bytes = await renderToPdf(doc, { fontProvider: async () => all.map(read), accessible: false });
    const used = slicesFor([...PARAGRAPH].map((c) => c.codePointAt(0)!));
    const sizes = await embeddedFonts(bytes);
    // The latin slice (first, the face's own font) and the unused one stay out.
    expect(sizes).toHaveLength(used.length);
    const largest = Math.max(...used.map((name) => read(name).length));
    for (const size of sizes) expect(size).toBeLessThanOrEqual(largest);
    const shown = await shownText(bytes);
    expect(shown.fonts.size).toBe(used.length);
    expect(shown.notdef).toBe(0);
  });

  it('reports the characters the named chinese-traditional subset lacks, and still builds', async () => {
    const doc = buildDocument({ markdown: `${PARAGRAPH}（甄士隱）！？\n` }, config);
    const warnings: PdfWarning[] = [];
    const bytes = await renderToPdf(doc, {
      fontProvider: async () => read('noto-serif-tc-chinese-traditional.ttf'),
      onWarning: (w) => warnings.push(w),
    });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    const missing = warnings.filter((w) => w.kind === 'missingGlyph');
    expect(missing).toHaveLength(1);
    const [m] = missing;
    if (m?.kind !== 'missingGlyph') throw new Error('no missingGlyph');
    expect(m).toMatchObject({ family: 'Noto Serif TC', weight: 400, style: 'normal' });
    for (const ch of ['，', '：', '（', '）', '！', '？']) expect(m.characters).toContain(ch);
    // Only the marks: every ideograph is in the named subset.
    expect(m.characters.every((ch) => !/\p{Script=Han}/u.test(ch))).toBe(true);
    expect(m.message).toContain('Noto Serif TC');
    expect(m.message).toContain('，');
  });

  it('asks a sliced face again only for the characters its files lack', async () => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    const asked: Array<{ weight: number; codePoints: number[] }> = [];
    const cache = new FontCache(pdfDoc, sliceProvider(asked));
    const fs = '400 16px "Noto Serif TC"';
    const cps = (s: string) => new Set([...s].map((c) => c.codePointAt(0)!));
    await cache.preloadFontStrings(new Map([[fs, cps('紅樓夢')]]));
    await cache.preloadFontStrings(new Map([[fs, cps('紅樓夢第一回')]]));
    await cache.preloadFontStrings(new Map([[fs, cps('第一回')]]));
    expect(asked.map((a) => a.codePoints.map((cp) => String.fromCodePoint(cp)).join(''))).toEqual(['紅樓夢', '第一回']);
    expect(cache.get(fs)).not.toBeNull();
  });

  it('asks a single-file face once, whatever the characters', async () => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    let calls = 0;
    const cache = new FontCache(pdfDoc, async () => {
      calls++;
      return read('noto-serif-tc-chinese-traditional.ttf');
    });
    const fs = '400 16px "Noto Serif TC"';
    await cache.preloadFontStrings(new Map([[fs, new Set([0x7d05])]]));
    await cache.preloadFontStrings(new Map([[fs, new Set([0x4e00, 0xff0c])]]));
    expect(calls).toBe(1);
  });
});

describe('font file reports (#196)', () => {
  it('warns when a variable font is asked for at a weight other than its default instance', async () => {
    // Cormorant Garamond's variable font defaults to weight 300.
    const cormorant = new Uint8Array(fs.readFileSync(new URL('../../../../apps/web/public/fonts/CormorantGaramond.ttf', import.meta.url)));
    const doc = buildDocument(
      { markdown: 'Light text with a **bold** word.' },
      { ...config, bodyText: { fontFamily: 'Cormorant Garamond', fontWeight: 300, boldFontWeight: 700 } },
    );
    const warnings: PdfWarning[] = [];
    await renderToPdf(doc, { fontProvider: async () => cormorant, onWarning: (w) => warnings.push(w) });
    const variable = warnings.filter((w) => w.kind === 'variableFontDefaultInstance');
    expect(variable).toEqual([
      expect.objectContaining({ kind: 'variableFontDefaultInstance', family: 'Cormorant Garamond', weight: 700, style: 'normal', defaultWeight: 300 }),
    ]);
  });

  it('reports a CFF face over the size limit, embedded whole', async () => {
    const cff = read('../tiny-cff.otf');
    expect(new TextDecoder().decode(cff.slice(0, 4))).toBe('OTTO');
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    const issues: FontFileIssue[] = [];
    const cache = new FontCache(pdfDoc, async () => cff, { onFileIssue: (i) => issues.push(i), cffWarnBytes: 1000 });
    await cache.preloadFontStrings(['400 16px "Tiny CFF"']);
    expect(issues).toEqual([{ kind: 'cffEmbeddedWhole', family: 'Tiny CFF', weight: 400, style: 'normal', bytes: cff.length }]);
  });

  it('stays quiet about a CFF face under the limit', async () => {
    const cff = read('../tiny-cff.otf');
    const doc = buildDocument({ markdown: 'Tiny CFF abc' }, { ...config, bodyText: { fontFamily: 'Tiny CFF' } });
    const warnings: PdfWarning[] = [];
    await renderToPdf(doc, { fontProvider: async () => cff, onWarning: (w) => warnings.push(w) });
    expect(warnings.filter((w) => w.kind === 'cffEmbeddedWhole')).toEqual([]);
  });

  it('keeps the one-file provider as it was: one font per face, no request needed', async () => {
    const lora = new Uint8Array(fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url)));
    const doc = buildDocument({ markdown: 'Plain Latin text.' }, { ...config, bodyText: { fontFamily: 'Lora' } });
    const requests: Array<PdfFontRequest | undefined> = [];
    const bytes = await renderToPdf(doc, {
      fontProvider: async (_f, _w, _s, request) => {
        requests.push(request);
        return lora;
      },
      accessible: false,
    });
    expect(await embeddedFonts(bytes)).toHaveLength(1);
    expect([...requests[0]!.codePoints].map((cp) => String.fromCodePoint(cp)).sort().join('')).toBe(' .LPaeilntx');
  });
});
