import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument } from 'postext';
import type { PostextConfig, Resource } from 'postext';
import { renderToPdf, type PdfFontFallbackWarning, type PdfWarning } from '../pdf-backend';
import { FontCache } from '../fontCache';
import { fontKey, parseFontString } from '../fontString';

/** Keeps the font fallbacks among the render warnings. */
function fallbacksInto(list: PdfFontFallbackWarning[], w: PdfWarning): void {
  if (w.kind === 'fontFallback') list.push(w);
}

// EF-20: the font provider is asked for the faces the pages actually paint
// — not the italic and bold-italic cut of every family a block could use —
// and a face it rejects falls back to one of the same family, with a
// warning, instead of failing the whole render.

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
const face = fontkit.create(fontBytes);

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const sizePx = parseFontString(this.font)?.sizePx ?? 16;
    return { width: (face.layout(s).advanceWidth / face.unitsPerEm) * sizePx };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const hex = (h: string) => ({ hex: h, model: 'hex' as const });

const base: PostextConfig = {
  page: { width: pt(300), height: pt(420), margins: { top: pt(30), bottom: pt(30), left: pt(24), right: pt(24) } },
  bodyText: { fontFamily: 'Lora' },
  headings: { fontFamily: 'Oswald', levels: [{ level: 1, breakBefore: { enabled: false } }] },
};

/** A provider that serves any face (the Lora file) and records the asks. */
function recordingProvider(reject?: (family: string, weight: number, style: string) => boolean) {
  const asked: string[] = [];
  const provider = async (family: string, weight: number, style: 'normal' | 'italic') => {
    asked.push(fontKey(family, weight, style));
    if (reject?.(family, weight, style)) throw new Error(`no ${family} ${weight} ${style}`);
    return new Uint8Array(fontBytes);
  };
  return { asked, provider };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('renderToPdf — faces requested from the font provider (EF-20)', () => {
  it('never asks for an italic cut the document does not set', async () => {
    const doc = buildDocument({ markdown: '# Title\n\nPlain body text, nothing emphasised.' }, base);
    const { asked, provider } = recordingProvider();
    await renderToPdf(doc, { fontProvider: provider });
    expect(asked.some((k) => k.endsWith('|italic'))).toBe(false);
    // The heading face is asked for; its unused italic is not.
    expect(asked.some((k) => k.startsWith('Oswald|'))).toBe(true);
    expect(asked).not.toContain('Oswald|700|italic');
    // Body bold is not used either.
    expect(asked).not.toContain('Lora|700|normal');
  });

  it('asks for the italic and bold faces once the text sets them', async () => {
    const doc = buildDocument({ markdown: 'Some *italic*, **bold** and ***both*** words.' }, base);
    const { asked, provider } = recordingProvider();
    await renderToPdf(doc, { fontProvider: provider });
    expect(asked).toEqual(expect.arrayContaining(['Lora|400|normal', 'Lora|400|italic', 'Lora|700|normal', 'Lora|700|italic']));
  });

  it('asks for every face the pages draw, and only those (resources, lists, chips, callouts, slots)', async () => {
    const resources: Resource[] = [{
      id: 'tab',
      typeId: 'table',
      kind: 'table',
      caption: 'A table with an *italic* word.',
      note: 'Source: **bold** note.',
      createdAt: 0,
      updatedAt: 0,
      table: { model: { headerRowCount: 1, rows: [[{ content: 'Head', isHeader: true }, { content: '**B**', isHeader: true }], [{ content: '*i* cell' }, { content: ':chip[tag]' }]] } },
      placement: { position: 'here' },
    }];
    const config: PostextConfig = {
      ...base,
      chipStyles: [{ id: 'chip', background: hex('#eeeeee'), bold: true }],
      header: { elements: [{ kind: 'text', id: 'rh', content: 'Running head', fontSize: pt(8), overflow: 'clip', placement: { anchor: { to: 'container', edge: 'top-left' } } }] },
    };
    const markdown = [
      '# Chapter',
      '',
      'Body with *italic*.',
      '',
      '- item one',
      '- item **two**',
      '',
      '1. first',
      '2. second',
      '',
      ':::callout{title="Note"}',
      'Inside a box, ***bold italic***.',
      ':::',
      '',
      '::resource{id="tab"}',
    ].join('\n');
    const doc = buildDocument({ markdown, resources }, config);
    const { asked, provider } = recordingProvider();
    const lookups: string[] = [];
    const get = FontCache.prototype.get;
    vi.spyOn(FontCache.prototype, 'get').mockImplementation(function (this: FontCache, fontString: string) {
      const parsed = parseFontString(fontString);
      if (parsed) lookups.push(fontKey(parsed.family, parsed.weight, parsed.style));
      return get.call(this, fontString);
    });
    await renderToPdf(doc, { fontProvider: provider });
    const requested = new Set(asked);
    // Nothing the pages draw was left out of the plan.
    for (const key of new Set(lookups)) expect(requested, key).toContain(key);
    // And nothing was fetched that no page draws.
    for (const key of requested) expect(lookups, key).toContain(key);
  });
});

describe('renderToPdf — per-face fallback (EF-20)', () => {
  it('sets a rejected italic in the upright cut of the same family and warns', async () => {
    // A family without italics (a display face, a naive Fontsource provider).
    const doc = buildDocument({ markdown: '# Title\n\nA *slanted* word.' }, base);
    const { asked, provider } = recordingProvider((family, _w, style) => family === 'Lora' && style === 'italic');
    const warnings: PdfFontFallbackWarning[] = [];
    const bytes = await renderToPdf(doc, { fontProvider: provider, onWarning: (w) => fallbacksInto(warnings, w) });
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(asked).toContain('Lora|400|italic');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      kind: 'fontFallback',
      family: 'Lora',
      weight: 400,
      style: 'italic',
      fallback: { weight: 400, style: 'normal' },
      reason: 'no Lora 400 italic',
    });
    expect(warnings[0]!.message).toContain('"Lora" 400 italic');
  });

  it('snaps a rejected weight to the regular or bold cut', async () => {
    const config: PostextConfig = { ...base, headings: { ...base.headings, fontWeight: 600 } };
    const doc = buildDocument({ markdown: '# Semibold title\n\nBody.' }, config);
    const { provider } = recordingProvider((family, weight) => family === 'Oswald' && weight === 600);
    const warnings: PdfFontFallbackWarning[] = [];
    await renderToPdf(doc, { fontProvider: provider, onWarning: (w) => fallbacksInto(warnings, w) });
    expect(warnings[0]).toMatchObject({ family: 'Oswald', weight: 600, fallback: { weight: 700, style: 'normal' } });
  });

  it('takes any cut of the family the provider has, heavier or lighter, upright or italic', async () => {
    // A provider that serves Oswald at 700 only: a 400 heading takes it.
    const doc = buildDocument({ markdown: '# Regular title\n\nBody.' }, { ...base, headings: { ...base.headings, fontWeight: 400 } });
    const only700 = recordingProvider((family, weight, style) => family === 'Oswald' && !(weight === 700 && style === 'normal'));
    const warnings: PdfFontFallbackWarning[] = [];
    await renderToPdf(doc, { fontProvider: only700.provider, onWarning: (w) => fallbacksInto(warnings, w) });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ family: 'Oswald', weight: 400, style: 'normal', fallback: { weight: 700, style: 'normal' } });

    // A family shipped as italics only sets its upright text in them.
    const italicsOnly = recordingProvider((family, _w, style) => family === 'Lora' && style === 'normal');
    const italicWarnings: PdfFontFallbackWarning[] = [];
    await renderToPdf(buildDocument({ markdown: 'Plain body.' }, base), { fontProvider: italicsOnly.provider, onWarning: (w) => fallbacksInto(italicWarnings, w) });
    expect(italicWarnings[0]).toMatchObject({ family: 'Lora', weight: 400, style: 'normal', fallback: { weight: 400, style: 'italic' } });
  });

  it('tries the other weights in the order CSS font matching does', async () => {
    const heading = (fontWeight: number) => buildDocument({ markdown: '# Title\n\nBody.' }, { ...base, headings: { ...base.headings, fontWeight } });
    const serves = (weights: number[]) => recordingProvider((family, weight) => family === 'Oswald' && !weights.includes(weight));
    const fallbackFor = async (fontWeight: number, weights: number[]) => {
      const warnings: PdfFontFallbackWarning[] = [];
      await renderToPdf(heading(fontWeight), { fontProvider: serves(weights).provider, onWarning: (w) => fallbacksInto(warnings, w) });
      return warnings[0]?.fallback.weight;
    };
    // 400 → 500 first, then lighter; 300 → lighter first; 600 → heavier first.
    expect(await fallbackFor(400, [300, 500])).toBe(500);
    expect(await fallbackFor(300, [200, 400])).toBe(200);
    expect(await fallbackFor(600, [500, 800])).toBe(800);
  });

  it('warns on the console when no onWarning is given', async () => {
    const doc = buildDocument({ markdown: 'A *slanted* word.' }, base);
    const { provider } = recordingProvider((family, _w, style) => family === 'Lora' && style === 'italic');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await renderToPdf(doc, { fontProvider: provider });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain('Lora');
  });

  it('still fails when no face of the family can be had', async () => {
    const doc = buildDocument({ markdown: '# Title\n\nBody.' }, base);
    const { provider } = recordingProvider((family) => family === 'Oswald');
    await expect(renderToPdf(doc, { fontProvider: provider, onWarning: () => undefined })).rejects.toThrow(/failed to load font\(s\): Oswald 700/);
  });
});
