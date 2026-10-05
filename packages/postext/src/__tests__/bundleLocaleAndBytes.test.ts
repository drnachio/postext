import { afterEach, describe, expect, it, vi } from 'vitest';
import { unzipSync, zipSync } from 'fflate';
import { createBundle, openBundle, readBundle, resolveBundleConfigLocale, zipBundle } from '../bundle';
import { defaultResourceTypes } from '../defaults';
import { buildDocument } from '../pipeline';
import type { Resource } from '../types';

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

const enc = new TextEncoder();
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>';
const figure: Resource = {
  id: 'f', typeId: 'figure', kind: 'svg', caption: 'Un dibujo.', createdAt: 0, updatedAt: 0,
  placement: { position: 'here' },
  svg: { fileId: 'f.svg', width: 10, height: 10 },
};
const prefixes = (types: { captionPrefix: string }[] | undefined) => (types ?? []).map((t) => t.captionPrefix);

// EF-150: the base configuration a bundle's `config` is laid over carries
// the built-in resource types, localised. They were localised to the
// locale the reader asked for, while the content came in the bundle's own
// language: a Spanish book opened by an English reader printed "Figure 1.1"
// under Spanish text.
describe('the base resource types follow the language a bundle serves (EF-150)', () => {
  const spanish = () => createBundle({
    name: 'x', locale: 'es', markdown: '# T\n\n::resource{id="f"}\n', config: {},
    resources: [figure], files: { 'f.svg': SVG },
  });

  it('reads a single-language bundle with the resource types of its own language', async () => {
    const { bytes } = await spanish();
    const bundle = await openBundle(bytes, { locale: 'en' });
    expect(bundle.locale).toBe('es');
    expect(prefixes(bundle.config.resourceTypes)).toEqual(['Figura', 'Tabla', 'Vídeo']);
    // The caption the chapter prints.
    const doc = buildDocument({ markdown: bundle.chapters[0]!.markdown, resources: bundle.resources }, bundle.config);
    const captions = doc.blocks.flatMap((b) => b.resourceBlock?.captionLines ?? []).map((l) => l.text).join(' ');
    expect(captions).toContain('Figura');
    expect(captions).not.toContain('Figure');
  });

  it('localises to the locale asked for when the bundle names none', async () => {
    const manifest = { version: 2, id: 'n', name: 'N', chapters: [{ title: '', file: 'a.md' }] };
    const zip = zipSync({ 'preset.json': enc.encode(JSON.stringify(manifest)), 'a.md': enc.encode('# A') });
    const es = await openBundle(zip, { locale: 'es' });
    expect(es.locale).toBe('es');
    expect(prefixes(es.config.resourceTypes)).toEqual(['Figura', 'Tabla', 'Vídeo']);
    const en = await openBundle(zip);
    expect(prefixes(en.config.resourceTypes)).toEqual(['Figure', 'Table', 'Video']);
  });

  it('localises to the language the config names when the manifest names none', async () => {
    const withConfig = (config: object) => zipSync({
      'preset.json': enc.encode(JSON.stringify({ version: 2, id: 'c', name: 'C', config, chapters: [{ title: '', file: 'a.md' }] })),
      'a.md': enc.encode('# T\n\n::resource{id="f"}\n'),
    });
    const byLocale = await openBundle(withConfig({ locale: 'es' }), { locale: 'en' });
    expect(prefixes(byLocale.config.resourceTypes)).toEqual(['Figura', 'Tabla', 'Vídeo']);
    // As the engine resolves the document language: `locale`, then the
    // hyphenation locale.
    const byHyphenation = await openBundle(withConfig({ bodyText: { hyphenation: { locale: 'es' } } }));
    expect(prefixes(byHyphenation.config.resourceTypes)).toEqual(['Figura', 'Tabla', 'Vídeo']);
    // The caption the chapter prints matches what the engine prints for
    // the same config without a bundle.
    const read = await openBundle(withConfig({ locale: 'es' }));
    const doc = buildDocument({ markdown: read.chapters[0]!.markdown, resources: [figure] }, read.config);
    const plain = buildDocument({ markdown: read.chapters[0]!.markdown, resources: [figure] }, { locale: 'es' });
    const caption = (d: typeof doc) => d.blocks.flatMap((b) => b.resourceBlock?.captionLines ?? []).map((l) => l.text).join(' ');
    expect(caption(doc)).toContain('Figura');
    expect(caption(doc)).toBe(caption(plain));
  });

  it('resolveBundleConfigLocale: the served locale, else the config\'s language, else the one asked for', () => {
    const base = { version: 2 as const, id: 'r', name: 'R', chapters: [{ title: '', file: 'a.md' }] };
    expect(resolveBundleConfigLocale({ ...base, locale: 'es', config: { locale: 'de' } }, 'en')).toBe('es');
    expect(resolveBundleConfigLocale({ ...base, config: { locale: 'de' } }, 'en')).toBe('de');
    expect(resolveBundleConfigLocale({ ...base, config: { locale: ' ', bodyText: { hyphenation: { locale: 'nl' } } } }, 'en')).toBe('nl');
    expect(resolveBundleConfigLocale(base, 'fr')).toBe('fr');
  });

  it('localises a bilingual bundle to the entry it serves', async () => {
    const manifest = {
      version: 2, id: 'bi', name: 'Bi', locale: 'en',
      chapters: { en: [{ title: 'One', file: 'en.md' }], es: [{ title: 'Uno', file: 'es.md' }] },
    };
    const zip = zipSync({ 'preset.json': enc.encode(JSON.stringify(manifest)), 'en.md': enc.encode('# One'), 'es.md': enc.encode('# Uno') });
    const es = await openBundle(zip, { locale: 'es-MX' });
    expect(es.locale).toBe('es');
    expect(prefixes(es.config.resourceTypes)).toEqual(['Figura', 'Tabla', 'Vídeo']);
    const other = await openBundle(zip, { locale: 'de' });
    expect(other.locale).toBe('en');
    expect(prefixes(other.config.resourceTypes)).toEqual(['Figure', 'Table', 'Video']);
  });

  it('keeps resource types the bundle writes, and a base the host passes', async () => {
    const { bytes } = await createBundle({
      name: 'x', locale: 'es', markdown: '# T', config: { resourceTypes: defaultResourceTypes('de') },
    });
    const bundle = await openBundle(bytes, { locale: 'en' });
    expect(prefixes(bundle.config.resourceTypes)).toEqual(['Abbildung', 'Tabelle', 'Video']);
    const opened = unzipSync(bytes);
    const read = await readBundle(
      JSON.parse(new TextDecoder().decode(opened['preset.json'])),
      async (path) => opened[path]!.slice().buffer,
      { locale: 'en', baseConfig: { resourceTypes: defaultResourceTypes('fr') } },
    );
    expect(prefixes(read.config.resourceTypes)).toEqual(['Abbildung', 'Tabelle', 'Video']);
  });
});

// EF-156: `createBundle` zipped every file with the time of the call, so two
// calls with the same input gave different bytes. `mtime` fixes the date.
describe('byte-stable bundles (EF-156)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** The DOS date and time of each local file header. */
  const entryDates = (bytes: Uint8Array): Array<[number, number]> => {
    const out: Array<[number, number]> = [];
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = 0; i + 30 <= bytes.length; i++) {
      if (view.getUint32(i, true) !== 0x04034b50) continue;
      out.push([view.getUint16(i + 12, true), view.getUint16(i + 10, true)]);
      i += 29;
    }
    return out;
  };
  const input = { name: 'Lantern', locale: 'en', markdown: '# Dusk\n\nText.', resources: [figure], files: { 'f.svg': SVG } };

  it('gives the same bytes for the same input and date, at any time', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 26, 10, 0, 0));
    const a = await createBundle({ ...input, mtime: new Date(1980, 0, 1) });
    const drift = await createBundle(input);
    vi.setSystemTime(new Date(2027, 2, 3, 17, 45, 12));
    const b = await createBundle({ ...input, mtime: new Date(1980, 0, 1) });
    const later = await createBundle(input);
    expect(b.bytes).toEqual(a.bytes);
    // Without a date the archive still carries the time of the call.
    expect(later.bytes).not.toEqual(drift.bytes);
    // 1980-01-01 00:00: date word (year 0, month 1, day 1), time 0.
    const dates = entryDates(a.bytes);
    expect(dates.length).toBe(Object.keys(a.files).length);
    for (const d of dates) expect(d).toEqual([(1 << 5) | 1, 0]);
    expect(entryDates(later.bytes)[0]![0] >> 9).toBe(2027 - 1980);
    // And it opens as before.
    expect((await openBundle(a.bytes)).chapters[0]!.markdown).toBe('# Dusk\n\nText.');
  });

  it('gives the same bytes in every time zone for a date built from local fields', () => {
    // Node reads `TZ` again whenever it is set.
    const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
    const tz = env.TZ;
    const files = { 'a.md': enc.encode('x') };
    try {
      const bytes: Uint8Array[] = [];
      const fromTimestamp: Uint8Array[] = [];
      for (const zone of ['UTC', 'America/New_York', 'Asia/Tokyo']) {
        env.TZ = zone;
        bytes.push(zipBundle(files, { mtime: new Date(1980, 0, 1) }));
        fromTimestamp.push(zipBundle(files, { mtime: Date.UTC(2001, 1, 3, 12) }));
      }
      expect(bytes[1]).toEqual(bytes[0]);
      expect(bytes[2]).toEqual(bytes[0]);
      // A timestamp is an instant: its local time, and so the bytes,
      // depend on the zone.
      expect(fromTimestamp[1]).not.toEqual(fromTimestamp[0]);
    } finally {
      if (tz === undefined) delete env.TZ;
      else env.TZ = tz;
    }
  });

  it('refuses a date a zip cannot hold', () => {
    expect(() => zipBundle({ 'a.md': enc.encode('x') }, { mtime: new Date(1970, 0, 1) })).toThrow(/1980 to 2099/);
    expect(() => zipBundle({ 'a.md': enc.encode('x') }, { mtime: 'not a date' })).toThrow(/1980 to 2099/);
    expect(zipBundle({ 'a.md': enc.encode('x') }, { mtime: '2001-02-03T04:05:06' })).toBeInstanceOf(Uint8Array);
  });
});
