import type { PostextConfig } from 'postext';
import { createDefaultConfig } from '../context/defaultConfig';
import { buildDefaultResources } from '../defaultResources';
import { DEFAULT_MARKDOWN_EN, DEFAULT_MARKDOWN_ES } from '../defaultMarkdown';
import type { PresetProvider } from './types';

export const BUILTIN_PRESET_ID = 'postext-guide';

export interface BuiltinPresetOptions {
  /** Markdown to use instead of the locale's default sample (the host app
   *  passes its own localised copy via `initialMarkdown`). */
  markdownOverride?: string;
  /** Config to use instead of `createDefaultConfig(locale)`. */
  configOverride?: PostextConfig;
  name: string;
  description?: string;
}

/** The built-in preset: today's default sample document, example resources
 *  and a pristine configuration. `buildDefaultResources` already writes its
 *  SVG blobs under deterministic ids, so the loaded preset carries no blobs. */
export function createPostextGuidePreset(opts: BuiltinPresetOptions): PresetProvider {
  const summary = {
    id: BUILTIN_PRESET_ID,
    name: opts.name,
    description: opts.description,
    source: 'builtin' as const,
    available: true,
  };
  return {
    summary,
    async load(locale: string) {
      const markdown = opts.markdownOverride
        ?? (locale.toLowerCase().startsWith('es') ? DEFAULT_MARKDOWN_ES : DEFAULT_MARKDOWN_EN);
      const config = opts.configOverride ?? createDefaultConfig(locale);
      const resources = await buildDefaultResources(locale);
      return { summary, markdown, config, resources, blobs: [], fonts: [] };
    },
  };
}
