import type { PdfFontProvider } from 'postext-pdf';
import { decompressWoff2 } from 'postext-pdf';
import { loadFont } from '../controls/fontLoader';

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

/**
 * Factory for a `PdfFontProvider` backed by Fontsource's jsdelivr CDN. Google
 * Fonts serves a single variable WOFF2 per family, so pdf-lib would embed
 * only the default instance and bold text would render at regular weight.
 * Fontsource exposes per-weight static WOFF2 files, which pdf-lib can embed
 * directly at the correct weight.
 */
export function createPdfFontProvider(): PdfFontProvider {
  return async (family, weight, style) => {
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
