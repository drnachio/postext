import type { PostextConfig } from 'postext';
import { resolveBodyTextConfig, resolveHeadingsConfig, resolveUnorderedListsConfig, resolveOrderedListsConfig } from 'postext';

const FONT_LOAD_TIMEOUT_MS = 3000;

const loadedFonts = new Set<string>();
const loadingPromises = new Map<string, Promise<void>>();

interface FontMetadata {
  variable: boolean;
  weights: number[];
  hasItalic: boolean;
}

const metadataCache = new Map<string, FontMetadata | null>();
const metadataInFlight = new Map<string, Promise<FontMetadata | null>>();

function toFontsourceId(family: string): string {
  return family.toLowerCase().replace(/\s+/g, '-');
}

async function fetchFontMetadata(family: string): Promise<FontMetadata | null> {
  if (metadataCache.has(family)) return metadataCache.get(family)!;
  const existing = metadataInFlight.get(family);
  if (existing) return existing;

  const promise = (async (): Promise<FontMetadata | null> => {
    try {
      const res = await fetch(`https://api.fontsource.org/v1/fonts/${toFontsourceId(family)}`);
      if (!res.ok) return null;
      const data = await res.json() as {
        variable?: boolean;
        weights?: number[];
        styles?: string[];
      };
      const weights = (data.weights ?? []).filter((w) => typeof w === 'number');
      if (weights.length === 0) return null;
      return {
        variable: data.variable === true,
        weights,
        hasItalic: (data.styles ?? []).includes('italic'),
      };
    } catch {
      return null;
    }
  })();

  metadataInFlight.set(family, promise);
  const meta = await promise;
  metadataCache.set(family, meta);
  metadataInFlight.delete(family);
  return meta;
}

/**
 * Build a Google Fonts CSS2 URL that exposes the full weight axis of a
 * variable font, so canvas text can interpolate across intermediate weights
 * instead of snapping between discrete static instances.
 *
 * - Variable fonts: use `wght@{min}..{max}`, which makes Google Fonts emit a
 *   single `@font-face` with `font-weight: {min} {max}` pointing to the VF.
 *   This is the only shape the browser will interpolate across on canvas.
 * - Static fonts: request each supported weight explicitly.
 * - Unknown fonts (metadata fetch failed): fall back to the historical
 *   regular/bold pair so the font still renders.
 */
function buildFontUrl(family: string, meta: FontMetadata | null): string {
  const name = encodeURIComponent(family);
  if (!meta) {
    return `https://fonts.googleapis.com/css2?family=${name}:ital,wght@0,400;0,700;1,400;1,700&display=swap`;
  }
  const min = Math.min(...meta.weights);
  const max = Math.max(...meta.weights);
  if (meta.variable && min < max) {
    if (meta.hasItalic) {
      return `https://fonts.googleapis.com/css2?family=${name}:ital,wght@0,${min}..${max};1,${min}..${max}&display=swap`;
    }
    return `https://fonts.googleapis.com/css2?family=${name}:wght@${min}..${max}&display=swap`;
  }
  const sorted = [...new Set(meta.weights)].sort((a, b) => a - b);
  if (meta.hasItalic) {
    const parts = sorted.flatMap((w) => [`0,${w}`, `1,${w}`]).join(';');
    return `https://fonts.googleapis.com/css2?family=${name}:ital,wght@${parts}&display=swap`;
  }
  const parts = sorted.join(';');
  return `https://fonts.googleapis.com/css2?family=${name}:wght@${parts}&display=swap`;
}

export function loadFont(font: string): Promise<void> {
  if (loadedFonts.has(font)) return Promise.resolve();

  const existing = loadingPromises.get(font);
  if (existing) return existing;

  const promise = (async () => {
    const meta = await fetchFontMetadata(font);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = buildFontUrl(font, meta);
    document.head.appendChild(link);

    // Wait for the font to actually be usable, with a timeout
    await Promise.race([
      document.fonts.ready,
      new Promise<void>((resolve) => setTimeout(resolve, FONT_LOAD_TIMEOUT_MS)),
    ]);

    loadedFonts.add(font);
    loadingPromises.delete(font);
  })();

  loadingPromises.set(font, promise);
  return promise;
}

export function getConfigFontFamilies(config: PostextConfig): string[] {
  const body = resolveBodyTextConfig(config.bodyText);
  const headings = resolveHeadingsConfig(config.headings);
  const lists = resolveUnorderedListsConfig(config.unorderedLists, body);
  const ordered = resolveOrderedListsConfig(config.orderedLists, body);
  const families = new Set<string>();
  families.add(body.fontFamily);
  families.add(headings.fontFamily);
  for (const level of headings.levels) families.add(level.fontFamily);
  families.add(lists.fontFamily);
  for (const level of lists.levels) families.add(level.fontFamily);
  families.add(ordered.fontFamily);
  for (const level of ordered.levels) families.add(level.fontFamily);
  return Array.from(families);
}

export function preloadConfigFonts(config: PostextConfig): Promise<void> {
  const promises = getConfigFontFamilies(config).map((family) => loadFont(family));
  return Promise.all(promises).then(() => {});
}
