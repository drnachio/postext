import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import { PDFDocument, PDFHexString, PDFName, PDFString } from 'pdf-lib';
import { buildDocument } from 'postext';
import type { PostextConfig } from 'postext';
import { renderToPdf } from '../pdf-backend';

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
const fontProvider = async () => new Uint8Array(fontBytes);

// Deterministic text measurement stub (no DOM in the node test env).
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const textOf = (obj: unknown): string | undefined =>
  obj instanceof PDFString || obj instanceof PDFHexString ? obj.decodeText() : undefined;

/** The `/Lang` an accessible (or, with `accessible: false`, untagged) PDF
 *  of a one-line document declares. */
async function lang(config: PostextConfig, accessible = true): Promise<string | undefined> {
  const doc = buildDocument({ markdown: '# Title\n\nText.' }, { bodyText: { fontFamily: 'Lora' }, ...config });
  const pdf = await PDFDocument.load(await renderToPdf(doc, { fontProvider, accessible }));
  return textOf(pdf.catalog.get(PDFName.of('Lang')));
}

afterEach(() => vi.restoreAllMocks());

describe('document language (/Lang)', () => {
  it('declares a bundled locale in canonical case', async () => {
    expect(await lang({})).toBe('en-US');
    expect(await lang({ locale: 'es' })).toBe('es');
  });

  it('keeps the region of a region-tagged locale that hyphenates with its language', async () => {
    expect(await lang({ locale: 'es-ES' })).toBe('es-ES');
    expect(await lang({ bodyText: { fontFamily: 'Lora', hyphenation: { locale: 'pt_br' } } })).toBe('pt-BR');
    expect(await lang({ locale: 'ca-ES-valencia' })).toBe('ca-ES-valencia');
  });

  it('declares a language without bundled patterns as given, not the en-us fallback', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await lang({ locale: 'sv' })).toBe('sv');
    expect(await lang({ locale: 'zh-Hant-TW' })).toBe('zh-Hant-TW');
  });

  it('takes the document locale first, script and region kept, in canonical case', async () => {
    expect(await lang({ locale: 'zh-hant-tw' })).toBe('zh-Hant-TW');
    expect(await lang({ locale: 'zh-Hans', bodyText: { fontFamily: 'Lora', hyphenation: { locale: 'en-us' } } })).toBe('zh-Hans');
    expect(await lang({ locale: 'zh_HK' })).toBe('zh-HK');
  });

  it('declares it in untagged output too', async () => {
    expect(await lang({ locale: 'zh-Hant-TW' }, false)).toBe('zh-Hant-TW');
    expect(await lang({ locale: 'es' }, false)).toBe('es');
  });
});
