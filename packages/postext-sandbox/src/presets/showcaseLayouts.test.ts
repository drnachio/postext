/* Every edition of every public showcase bundle (apps/web/public/presets)
   ships its pagination: the Sandbox opens it with every chapter's page
   count known, nothing laid out first. The records hold for one engine,
   configuration and set of resources; when this fails, raise `postext` to
   the version the next release publishes (if it is not there yet) and run
   `node scripts/presets/layouts.mjs` against the web app serving this
   checkout. */
import { describe, expect, it } from 'vitest';
import { bitmapSize } from 'postext/bundle';
import { ENGINE_KEY } from '../book/layoutKeys';
import { localeLayoutsFile, parseBundle, type BundleLayoutsFile } from './bundle';
import type { PresetIndexEntry, PresetSummary } from './types';

// node:fs through a dynamic import: the package has no Node typings.
const fs = (await import(/* @vite-ignore */ 'node:fs/promises' as string)) as {
  readFile(path: URL): Promise<Uint8Array>;
};
const ROOT = new URL('../../../../apps/web/public/presets/', import.meta.url);
const readJson = async <T,>(url: URL): Promise<T> => JSON.parse(new TextDecoder().decode(await fs.readFile(url))) as T;

// The Sandbox reads a bitmap's size with createImageBitmap and an SVG's
// from its root element through DOMParser, which Node lacks: the bitmap's
// header and the root tag's attributes give the same numbers.
(globalThis as { createImageBitmap?: unknown }).createImageBitmap ??= async (blob: Blob) => {
  const size = bitmapSize(new Uint8Array(await blob.arrayBuffer())) ?? { width: 0, height: 0 };
  return { ...size, close() {} };
};
(globalThis as { DOMParser?: unknown }).DOMParser ??= class {
  parseFromString(text: string) {
    const tag = /<svg\b([^>]*)>/i.exec(text.replace(/<!--[\s\S]*?-->/g, ''));
    const attrs = new Map<string, string>();
    for (const [, name, , value] of (tag?.[1] ?? '').matchAll(/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g)) attrs.set(name!, value!);
    return {
      getElementsByTagName: () => [],
      documentElement: tag ? { tagName: 'svg', getAttribute: (name: string) => attrs.get(name) ?? null } : null,
    };
  }
};

interface Manifest {
  id: string;
  locale?: string;
  chapters: { file: string }[] | Record<string, { file: string }[]>;
}

const index = await readJson<{ presets: PresetIndexEntry[] }>(new URL('index.json', ROOT));
const editions = await Promise.all(index.presets.map(async (entry) => {
  const dir = new URL(`${entry.dir}/`, ROOT);
  const manifest = await readJson<Manifest>(new URL('preset.json', dir));
  const byLang = Array.isArray(manifest.chapters) ? { [manifest.locale ?? entry.locale ?? 'en']: manifest.chapters } : manifest.chapters;
  return Object.entries(byLang).map(([lang, chapters]) => ({ entry, dir, manifest, lang, files: chapters.map((c) => c.file) }));
})).then((all) => all.flat());

describe('showcase bundles ship their pagination', () => {
  it.each(editions.map((e) => [`${e.entry.id}:${e.lang}`, e] as const))('%s', async (_name, { entry, dir, manifest, lang, files }) => {
    const shipped = await readJson<BundleLayoutsFile>(new URL(localeLayoutsFile(lang), dir)).catch(() => null);
    expect(shipped, `${localeLayoutsFile(lang)} is missing`).not.toBeNull();
    expect(shipped!.engine).toBe(ENGINE_KEY);
    expect(Object.keys(shipped!.chapters).sort()).toEqual([...files].sort());

    // Opened as the Sandbox opens it, every chapter takes its record: the
    // configuration and the resources are the ones it was laid out with.
    const summary: PresetSummary = { id: entry.id, name: entry.name, source: 'public', available: true };
    const loaded = await parseBundle(manifest, (file) => fs.readFile(new URL(file, dir)).then((b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer), { locale: lang, summary });
    expect(loaded.locale).toBe(lang);
    expect(Object.keys(loaded.layouts ?? {}), 'stale configKey/resourcesKey: lay the edition out again').toHaveLength(files.length);
  }, 120_000);
});
