import type { PdfFontProvider } from 'postext-pdf';
import type { CustomFontFamily, CustomFontVariant } from 'postext';
import { decompressWoff2 } from 'postext-pdf';
import { getCustomFontFamily, loadFont } from '../controls/fontLoader';
import { getFontFile } from '../storage/fontStorage';

const bytesCache = new Map<string, Promise<Uint8Array>>();
const weightsCache = new Map<string, Promise<number[] | null>>();

function fontsourceId(family: string): string {
  return family.toLowerCase().replace(/\s+/g, '-');
}

function cacheKey(family: string, weight: number, style: 'normal' | 'italic'): string {
  return `${family}|${weight}|${style}`;
}

async function fetchAvailableWeights(family: string): Promise<number[] | null> {
  const cached = weightsCache.get(family);
  if (cached) return cached;
  const promise = (async (): Promise<number[] | null> => {
    try {
      const res = await fetch(`https://api.fontsource.org/v1/fonts/${fontsourceId(family)}`);
      if (!res.ok) return null;
      const data = (await res.json()) as { weights?: number[] };
      const weights = (data.weights ?? []).filter((w): w is number => typeof w === 'number');
      return weights.length > 0 ? weights : null;
    } catch {
      return null;
    }
  })();
  weightsCache.set(family, promise);
  return promise;
}

function nearestWeight(target: number, available: number[]): number {
  return available.reduce((best, w) => (Math.abs(w - target) < Math.abs(best - target) ? w : best), available[0]!);
}

function fontsourceWoff2Url(
  family: string,
  weight: number,
  style: 'normal' | 'italic',
): string {
  const id = fontsourceId(family);
  return `https://cdn.jsdelivr.net/npm/@fontsource/${id}@latest/files/${id}-latin-${weight}-${style}.woff2`;
}

async function fetchAndDecompress(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`font fetch failed: ${res.status} ${url}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  return decompressWoff2(buf);
}

/** Pick the best uploaded variant for a requested (weight, style):
 *  prefer an exact style match by nearest weight; if no same-style variant
 *  exists, fall back to the nearest-weight variant of the other style. */
function pickCustomVariant(
  family: CustomFontFamily,
  weight: number,
  style: 'normal' | 'italic',
): CustomFontVariant | null {
  if (family.variants.length === 0) return null;
  const sameStyle = family.variants.filter((v) => v.style === style);
  const pool = sameStyle.length > 0 ? sameStyle : family.variants;
  return pool.reduce((best, v) =>
    Math.abs(v.weight - weight) < Math.abs(best.weight - weight) ? v : best,
  pool[0]!);
}

async function loadCustomFontBytes(
  family: CustomFontFamily,
  weight: number,
  style: 'normal' | 'italic',
): Promise<Uint8Array> {
  const variant = pickCustomVariant(family, weight, style);
  if (!variant) {
    throw new Error(`custom font "${family.name}" has no uploaded variants`);
  }
  const file = await getFontFile(variant.fileId);
  if (!file) {
    throw new Error(`custom font "${family.name}" is missing its uploaded file`);
  }
  const bytes = new Uint8Array(file.buffer);
  switch (variant.format) {
    case 'woff2':
      return decompressWoff2(bytes);
    case 'ttf':
    case 'otf':
      return bytes;
    case 'woff':
      throw new Error(
        `.woff is not supported for PDF rendering; re-upload "${variant.fileName ?? family.name}" as .woff2, .ttf, or .otf`,
      );
  }
}

/**
 * Factory for a `PdfFontProvider` backed by Fontsource's jsdelivr CDN. Google
 * Fonts serves a single variable WOFF2 per family, so pdf-lib would embed
 * only the default instance and bold text would render at regular weight.
 * Fontsource exposes per-weight static WOFF2 files, which pdf-lib can embed
 * directly at the correct weight.
 */
export function createPdfFontProvider(): PdfFontProvider {
  return async (family, weight, style) => {
    // Custom families bypass the Google/Fontsource path entirely: resolve
    // bytes from IndexedDB and only decompress when the uploaded file was
    // .woff2. Skip the shared `bytesCache` because the user can re-upload
    // or delete variants at any time, and the fileId captures identity.
    const custom = getCustomFontFamily(family);
    if (custom) {
      return await loadCustomFontBytes(custom, weight, style);
    }

    const key = cacheKey(family, weight, style);
    const cached = bytesCache.get(key);
    if (cached) return cached;

    const promise = (async (): Promise<Uint8Array> => {
      await loadFont(family);

      const available = await fetchAvailableWeights(family);
      const targetWeight = available ? nearestWeight(weight, available) : weight;

      try {
        return await fetchAndDecompress(fontsourceWoff2Url(family, targetWeight, style));
      } catch (err) {
        if (style === 'italic') {
          return await fetchAndDecompress(fontsourceWoff2Url(family, targetWeight, 'normal'));
        }
        throw err;
      }
    })();

    bytesCache.set(key, promise);
    try {
      return await promise;
    } catch (err) {
      bytesCache.delete(key);
      throw err;
    }
  };
}
