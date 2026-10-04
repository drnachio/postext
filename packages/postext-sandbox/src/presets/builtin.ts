import type { PostextConfig } from 'postext';
import { createPostextGuideConfig } from '../context/guideConfig';
import { buildDefaultResources, defaultResourcesSignature } from '../defaultResources';
import { coverThumbnailSvg } from '../defaultResources/cover';
import { guideLang, type GuideLang } from '../defaultResources/lang';
import { DEFAULT_MARKDOWN_AR, DEFAULT_MARKDOWN_CA, DEFAULT_MARKDOWN_EN, DEFAULT_MARKDOWN_ES, DEFAULT_MARKDOWN_ZH_HANS } from '../defaultMarkdown';
import type { PresetProvider } from './types';
import { isPristineBook, sampleBook } from '../book/chapterOps';
import type { BookContent } from '../book/types';
import { generateId } from '../storage/ids';

export const BUILTIN_PRESET_ID = 'postext-guide';

/** The editions of the guide, as the tags its summary lists: the library
 *  row offers ES, CA, EN, ع and 简 (see `localeShortTag`), and a permalink
 *  names one with `lang=`. The Latin-script editions first, then the two
 *  set in a script and a direction of their own. */
export const BUILTIN_PRESET_LOCALES = ['es', 'ca', 'en', 'ar', 'zh-Hans'] as const;

/** The guide's text in each edition. */
export const GUIDE_MARKDOWN: Record<GuideLang, string> = {
  en: DEFAULT_MARKDOWN_EN,
  es: DEFAULT_MARKDOWN_ES,
  'zh-Hans': DEFAULT_MARKDOWN_ZH_HANS,
  ca: DEFAULT_MARKDOWN_CA,
  ar: DEFAULT_MARKDOWN_AR,
};

/** Every edition of the guide's text, for the pristine-book checks. */
export const GUIDE_SAMPLE_DOCUMENTS: readonly string[] = [DEFAULT_MARKDOWN_EN, DEFAULT_MARKDOWN_ES, DEFAULT_MARKDOWN_ZH_HANS, DEFAULT_MARKDOWN_CA, DEFAULT_MARKDOWN_AR];

/** Whether `book` is the untouched Chinese guide. In an English or Spanish
 *  interface the Chinese edition is opened on purpose (the 简 button, a
 *  `lang=zh-Hans` link), so an untouched copy stays Chinese there, where an
 *  untouched English or Spanish guide follows the interface. */
export function isPristineChineseGuide(book: BookContent): boolean {
  return isPristineBook(book, [DEFAULT_MARKDOWN_ZH_HANS]);
}

/** Whether `book` is the untouched Arabic guide: like the Chinese one, an
 *  edition in a script and a design of its own, opened on purpose (the ع
 *  button, a `lang=ar` link) from another interface. */
export function isPristineArabicGuide(book: BookContent): boolean {
  return isPristineBook(book, [DEFAULT_MARKDOWN_AR]);
}

/** The edition in a script of its own (Chinese, Arabic) `book` is an
 *  untouched copy of, or null. */
function pristineScriptEdition(book: BookContent): GuideLang | null {
  if (isPristineChineseGuide(book)) return 'zh-Hans';
  if (isPristineArabicGuide(book)) return 'ar';
  return null;
}

/** Whether the untouched guide on screen gives way to the interface's
 *  edition when the Sandbox opens: `viewerMarkdown` is the host's sample
 *  for its language, `previousViewer` the interface language of the last
 *  visit (null when unknown). Storage is shared across interface languages,
 *  so an untouched guide in another language follows the interface — save
 *  the Chinese or Arabic guide opened on purpose from another interface,
 *  which stays. The Chinese or Arabic interface's own guide (the last
 *  visit was in that language) follows the next interface like the others. */
export function pristineGuideFollowsViewer(book: BookContent, viewerMarkdown: string, previousViewer: string | null): boolean {
  // The viewer's own edition, whole or cut into its chapters, stays.
  if (!isPristineBook(book, GUIDE_SAMPLE_DOCUMENTS) || isPristineBook(book, [viewerMarkdown])) return false;
  const edition = pristineScriptEdition(book);
  return edition === null || (previousViewer !== null && guideLang(previousViewer) === edition);
}

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
    // Like the showcase presets, the row offers every edition: Spanish,
    // Catalan, English, Arabic and Simplified Chinese.
    locales: [...BUILTIN_PRESET_LOCALES],
    license: 'MIT',
    thumbnailUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(coverThumbnailSvg())}`,
  };
  // The guide ships with the code: its fingerprint is a hash of everything
  // it loads (every language), so the live-preset watcher reloads an
  // untouched copy — or offers a reload over an edited one — whenever a new
  // version of the guide is deployed.
  let fingerprintValue: string | null = null;
  const fingerprint = async (): Promise<string | null> => {
    if (fingerprintValue === null) {
      const source = JSON.stringify([
        opts.markdownOverride ?? null, DEFAULT_MARKDOWN_EN, DEFAULT_MARKDOWN_ES, DEFAULT_MARKDOWN_ZH_HANS, DEFAULT_MARKDOWN_CA,
        DEFAULT_MARKDOWN_AR,
        opts.configOverride ?? null, createPostextGuideConfig('en'), createPostextGuideConfig('es'), createPostextGuideConfig('zh-Hans'),
        createPostextGuideConfig('ca'), createPostextGuideConfig('ar'),
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
      const lang = guideLang(locale);
      // A host override that is just one of the built-in samples (the web app
      // passes its locale's copy) still follows the locale asked for, so the
      // ES / CA / EN / ع / 简 buttons switch the language; any other text is used as is.
      const custom = opts.markdownOverride !== undefined && !GUIDE_SAMPLE_DOCUMENTS.includes(opts.markdownOverride);
      const markdown = custom ? opts.markdownOverride! : GUIDE_MARKDOWN[lang];
      // A host config is the design of the host's own language: the Chinese
      // and Arabic editions keep their own, set for their script.
      const ownDesign = lang === 'zh-Hans' || lang === 'ar';
      const config = opts.configOverride && !ownDesign ? opts.configOverride : createPostextGuideConfig(lang);
      const resources = await buildDefaultResources(lang);
      const { chapters } = sampleBook(markdown, () => generateId('chapter'), opts.name);
      return { summary, locale: lang, chapters, config, resources, blobs: [], fonts: [], canvasScope: 'book' };
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
