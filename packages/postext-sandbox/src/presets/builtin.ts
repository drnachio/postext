import type { PostextConfig } from 'postext';
import { createPostextGuideConfig } from '../context/guideConfig';
import { buildDefaultResources, defaultResourcesSignature } from '../defaultResources';
import { coverThumbnailSvg } from '../defaultResources/cover';
import { DEFAULT_MARKDOWN_EN, DEFAULT_MARKDOWN_ES } from '../defaultMarkdown';
import type { PresetProvider } from './types';
import { sampleBook } from '../book/chapterOps';
import { generateId } from '../storage/ids';

export const BUILTIN_PRESET_ID = 'postext-guide';

export interface BuiltinPresetOptions {
  /** Markdown to use instead of the locale's default sample (the host app
   *  passes its own localised copy via `initialMarkdown`). */
  markdownOverride?: string;
  /** Config to use instead of `createPostextGuideConfig(locale)`. */
  configOverride?: PostextConfig;
  name: string;
  description?: string;
}

/** The built-in preset: the Postext guide — the sample document cut into one
 *  chapter per level-1 heading (cover, contents, chapters), its example
 *  resources and the guide's own design (`guideConfig.ts`). `buildDefaultResources` already writes its
 *  SVG blobs under deterministic ids, so the loaded preset carries no blobs. */
export function createPostextGuidePreset(opts: BuiltinPresetOptions): PresetProvider {
  const summary = {
    id: BUILTIN_PRESET_ID,
    name: opts.name,
    description: opts.description,
    source: 'builtin' as const,
    available: true,
    // Bilingual, like the showcase presets: the row offers both versions.
    locales: ['es', 'en'],
    license: 'MIT',
    thumbnailUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(coverThumbnailSvg())}`,
  };
  // The guide ships with the code: its fingerprint is a hash of everything
  // it loads (both languages), so the live-preset watcher reloads an
  // untouched copy — or offers a reload over an edited one — whenever a new
  // version of the guide is deployed.
  let fingerprintValue: string | null = null;
  const fingerprint = async (): Promise<string | null> => {
    if (fingerprintValue === null) {
      const source = JSON.stringify([
        opts.markdownOverride ?? null, DEFAULT_MARKDOWN_EN, DEFAULT_MARKDOWN_ES,
        opts.configOverride ?? null, createPostextGuideConfig('en'), createPostextGuideConfig('es'),
        defaultResourcesSignature(),
      ]);
      fingerprintValue = `builtin-${hashString(source)}`;
    }
    return fingerprintValue;
  };
  return {
    summary,
    fingerprint,
    async load(locale: string) {
      const isSpanish = locale.toLowerCase().startsWith('es');
      // A host override that is just one of the built-in samples (the web app
      // passes its locale's copy) still follows the locale asked for, so the
      // ES / EN buttons switch the language; any other text is used as is.
      const custom = opts.markdownOverride !== undefined
        && opts.markdownOverride !== DEFAULT_MARKDOWN_EN && opts.markdownOverride !== DEFAULT_MARKDOWN_ES;
      const markdown = custom ? opts.markdownOverride! : isSpanish ? DEFAULT_MARKDOWN_ES : DEFAULT_MARKDOWN_EN;
      const config = opts.configOverride ?? createPostextGuideConfig(locale);
      const resources = await buildDefaultResources(locale);
      const { chapters } = sampleBook(markdown, () => generateId('chapter'), opts.name);
      return { summary, locale: isSpanish ? 'es' : 'en', chapters, config, resources, blobs: [], fonts: [], canvasScope: 'book' };
    },
  };
}

/** FNV-1a over UTF-16 code units, as 8 hex digits: a cheap content hash. */
function hashString(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
