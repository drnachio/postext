import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import fontkit from '@pdf-lib/fontkit';
import { HARFBUZZ_VERSION, loadHarfBuzz, type HarfBuzz } from '../harfbuzz';

// Issue #380: HarfBuzz is bound straight to its WebAssembly binary, so it
// loads the same in Node, a page, a Worker and a bundle; and a PDF whose
// Arabic was drawn without it says so.

const AMIRI = new Uint8Array(readFileSync(new URL('./fixtures/arabic/amiri-subset.ttf', import.meta.url)));
const WASM_URL = new URL('../../node_modules/harfbuzzjs/dist/harfbuzz.wasm', import.meta.url);
const BASMALA = 'بِسْمِ ٱللَّهِ';

function glyphs(hb: HarfBuzz, text: string, direction: 'ltr' | 'rtl', features?: [string, number][]) {
  const font = hb.openFont(AMIRI, {});
  return hb.shape(font, text, { direction, ...(features ? { features } : {}) });
}

describe('HarfBuzz binding', () => {
  it('is written for the harfbuzzjs release installed', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../node_modules/harfbuzzjs/package.json', import.meta.url), 'utf8')) as { version: string };
    expect(pkg.version).toBe(HARFBUZZ_VERSION);
  });

  it('loads from its default place in Node and from bytes alike', async () => {
    const fromFile = await loadHarfBuzz();
    const fromBytes = await loadHarfBuzz(readFileSync(WASM_URL));
    const a = glyphs(fromFile, BASMALA, 'rtl');
    expect(a.length).toBeGreaterThan(5);
    expect(glyphs(fromBytes, BASMALA, 'rtl')).toEqual(a);
    // Right to left: the clusters come out descending, the marks offset.
    const clusters = a.map((g) => g.cluster);
    expect([...clusters].sort((x, y) => y - x)).toEqual(clusters);
    expect(a.some((g) => g.yOffset !== 0)).toBe(true);
  });

  it('loads from a URL string', async () => {
    const hb = await loadHarfBuzz(WASM_URL.href);
    expect(glyphs(hb, 'AB', 'ltr').map((g) => g.cluster)).toEqual([0, 1]);
  });

  it('applies features and agrees with fontkit on glyph ids', async () => {
    const hb = await loadHarfBuzz();
    const face = fontkit.create(Buffer.from(AMIRI));
    const run = glyphs(hb, 'AB', 'ltr');
    expect(run.map((g) => g.gid)).toEqual(face.layout('AB').glyphs.map((g) => g.id));
    // Turning kerning off cannot lengthen the run.
    expect(glyphs(hb, 'AB', 'ltr', [['kern', 0]]).length).toBe(run.length);
  });

  it('shapes long text and many fonts (the heap grows)', async () => {
    const hb = await loadHarfBuzz();
    const long = `${BASMALA} `.repeat(20_000);
    const run = glyphs(hb, long, 'rtl');
    expect(run.length).toBeGreaterThan(100_000);
    for (let i = 0; i < 50; i++) hb.openFont(AMIRI, {});
    expect(glyphs(hb, BASMALA, 'rtl')).toEqual(glyphs(hb, BASMALA, 'rtl'));
  });

  it('names every place it looked when the binary is nowhere', async () => {
    await expect(loadHarfBuzz('file:///nowhere/harfbuzz.wasm')).rejects.toThrow(/nowhere\/harfbuzz\.wasm/);
    // A file that is not WebAssembly (a server's error page) is refused
    // before it reaches the compiler.
    const font = new URL('./fixtures/arabic/amiri-subset.ttf', import.meta.url).href;
    await expect(loadHarfBuzz(font)).rejects.toThrow(/not a WebAssembly file/);
  });
});

describe('Arabic drawn without HarfBuzz', () => {
  afterEach(() => {
    vi.doUnmock('../harfbuzz');
    vi.resetModules();
  });

  it('is reported as a complexShapingUnavailable warning, and the PDF still builds', async () => {
    vi.resetModules();
    vi.doMock('../harfbuzz', async (importOriginal) => ({
      ...(await importOriginal<typeof import('../harfbuzz')>()),
      loadHarfBuzz: () => Promise.reject(new Error('https://example.test/harfbuzz.wasm: HTTP 404')),
    }));
    const face = fontkit.create(Buffer.from(AMIRI));
    (globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
      getContext() {
        return { font: '', measureText: (s: string) => ({ width: (face.layout(s).advanceWidth / face.unitsPerEm) * 16 }) };
      }
    };
    const { buildDocument } = await import('postext');
    const { renderToPdf } = await import('../pdf-backend');
    const { complexShaperReady } = await import('../complexShaping');
    const pt = (value: number) => ({ value, unit: 'pt' as const });
    const doc = buildDocument({ markdown: `${BASMALA} Latin 2024` }, {
      page: { width: pt(300), height: pt(200), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
      locale: 'ar',
      layout: { layoutType: 'single' },
      header: { elements: [] },
      footer: { elements: [] },
      bodyText: { fontFamily: 'Amiri', fontSize: pt(16), lineHeight: pt(30) },
    });
    const warnings: { kind: string; message?: string; reason?: string }[] = [];
    const bytes = await renderToPdf(doc, { fontProvider: async () => AMIRI, onWarning: (w) => warnings.push(w) });
    expect(bytes.length).toBeGreaterThan(1000);
    expect(complexShaperReady()).toBe(false);
    const shaping = warnings.filter((w) => w.kind === 'complexShapingUnavailable');
    expect(shaping).toHaveLength(1);
    expect(shaping[0]!.reason).toContain('HTTP 404');
    expect(shaping[0]!.message).toMatch(/^postext-pdf: HarfBuzz did not load/);

    // A Latin document never looks for HarfBuzz, so it never warns.
    warnings.length = 0;
    await renderToPdf(buildDocument({ markdown: 'Latin only, 2024.' }, doc.config), { fontProvider: async () => AMIRI, onWarning: (w) => warnings.push(w) });
    expect(warnings.filter((w) => w.kind === 'complexShapingUnavailable')).toHaveLength(0);
  }, 60_000);
});
