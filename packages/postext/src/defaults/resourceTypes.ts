import type { PostextConfig, ResourceType } from '../types';
import { presentTag, stringsFor } from '../locale';

/** Localised display strings for a built-in resource type. The numbering
 *  behaviour (template, reset, counter format) is language-independent and
 *  lives in {@link defaultResourceTypes}. */
interface ResourceTypeStrings {
  name: string;
  namePlural: string;
  shortLabel: string;
  captionPrefix: string;
}

/** Per-language strings for the three built-in types, one per bundled
 *  hyphenation language plus Chinese in each script, Japanese and Arabic
 *  (keyed by `stringsKeyOf`). English is the fallback for any locale not
 *  listed here. Add a language by adding a key. A language may also number
 *  its figures its own way (`numberingTemplate`, the house style being
 *  `{h1}.{n}`). */
const BUILTIN_TYPE_STRINGS: Record<string, { figure: ResourceTypeStrings; table: ResourceTypeStrings; video: ResourceTypeStrings; numberingTemplate?: string }> = {
  en: {
    figure: { name: 'Figure', namePlural: 'Figures', shortLabel: 'Fig.', captionPrefix: 'Figure' },
    table: { name: 'Table', namePlural: 'Tables', shortLabel: 'Tab.', captionPrefix: 'Table' },
    video: { name: 'Video', namePlural: 'Videos', shortLabel: 'Video', captionPrefix: 'Video' },
  },
  es: {
    figure: { name: 'Figura', namePlural: 'Figuras', shortLabel: 'Fig.', captionPrefix: 'Figura' },
    table: { name: 'Tabla', namePlural: 'Tablas', shortLabel: 'Tabla', captionPrefix: 'Tabla' },
    video: { name: 'Vídeo', namePlural: 'Vídeos', shortLabel: 'Vídeo', captionPrefix: 'Vídeo' },
  },
  fr: {
    figure: { name: 'Figure', namePlural: 'Figures', shortLabel: 'Fig.', captionPrefix: 'Figure' },
    table: { name: 'Tableau', namePlural: 'Tableaux', shortLabel: 'Tabl.', captionPrefix: 'Tableau' },
    video: { name: 'Vidéo', namePlural: 'Vidéos', shortLabel: 'Vidéo', captionPrefix: 'Vidéo' },
  },
  de: {
    figure: { name: 'Abbildung', namePlural: 'Abbildungen', shortLabel: 'Abb.', captionPrefix: 'Abbildung' },
    table: { name: 'Tabelle', namePlural: 'Tabellen', shortLabel: 'Tab.', captionPrefix: 'Tabelle' },
    video: { name: 'Video', namePlural: 'Videos', shortLabel: 'Video', captionPrefix: 'Video' },
  },
  it: {
    figure: { name: 'Figura', namePlural: 'Figure', shortLabel: 'Fig.', captionPrefix: 'Figura' },
    table: { name: 'Tabella', namePlural: 'Tabelle', shortLabel: 'Tab.', captionPrefix: 'Tabella' },
    video: { name: 'Video', namePlural: 'Video', shortLabel: 'Video', captionPrefix: 'Video' },
  },
  pt: {
    figure: { name: 'Figura', namePlural: 'Figuras', shortLabel: 'Fig.', captionPrefix: 'Figura' },
    table: { name: 'Tabela', namePlural: 'Tabelas', shortLabel: 'Tab.', captionPrefix: 'Tabela' },
    video: { name: 'Vídeo', namePlural: 'Vídeos', shortLabel: 'Vídeo', captionPrefix: 'Vídeo' },
  },
  ca: {
    figure: { name: 'Figura', namePlural: 'Figures', shortLabel: 'Fig.', captionPrefix: 'Figura' },
    table: { name: 'Taula', namePlural: 'Taules', shortLabel: 'Taula', captionPrefix: 'Taula' },
    video: { name: 'Vídeo', namePlural: 'Vídeos', shortLabel: 'Vídeo', captionPrefix: 'Vídeo' },
  },
  nl: {
    figure: { name: 'Figuur', namePlural: 'Figuren', shortLabel: 'Fig.', captionPrefix: 'Figuur' },
    table: { name: 'Tabel', namePlural: 'Tabellen', shortLabel: 'Tab.', captionPrefix: 'Tabel' },
    video: { name: 'Video', namePlural: "Video's", shortLabel: 'Video', captionPrefix: 'Video' },
  },
  // Chinese numbers figures by chapter with a hyphen: 图1-1, 表2-3.
  'zh-hans': {
    figure: { name: '图', namePlural: '图', shortLabel: '图', captionPrefix: '图' },
    table: { name: '表', namePlural: '表', shortLabel: '表', captionPrefix: '表' },
    video: { name: '视频', namePlural: '视频', shortLabel: '视频', captionPrefix: '视频' },
    numberingTemplate: '{h1}-{n}',
  },
  'zh-hant': {
    figure: { name: '圖', namePlural: '圖', shortLabel: '圖', captionPrefix: '圖' },
    table: { name: '表', namePlural: '表', shortLabel: '表', captionPrefix: '表' },
    video: { name: '影片', namePlural: '影片', shortLabel: '影片', captionPrefix: '影片' },
    numberingTemplate: '{h1}-{n}',
  },
  // Japanese books name them 図 and 表 and number them by chapter with a
  // hyphen too (図1-1, 表2-3; JLReq §4.3, ja-typography §12): a vertical
  // book's horizontal captions read the same.
  ja: {
    figure: { name: '図', namePlural: '図', shortLabel: '図', captionPrefix: '図' },
    table: { name: '表', namePlural: '表', shortLabel: '表', captionPrefix: '表' },
    video: { name: '動画', namePlural: '動画', shortLabel: '動画', captionPrefix: '動画' },
    numberingTemplate: '{h1}-{n}',
  },
  // Arabic numbers by chapter with a hyphen too (شكل ٢-٣, «الجدول ١-٢»):
  // a full stop between two Arabic-Indic digits reads as the decimal
  // separator ٫ at a glance.
  ar: {
    figure: { name: 'شكل', namePlural: 'أشكال', shortLabel: 'شكل', captionPrefix: 'شكل' },
    table: { name: 'جدول', namePlural: 'جداول', shortLabel: 'جدول', captionPrefix: 'جدول' },
    video: { name: 'فيديو', namePlural: 'مقاطع الفيديو', shortLabel: 'فيديو', captionPrefix: 'فيديو' },
    numberingTemplate: '{h1}-{n}',
  },
};

/** Resolve a (possibly regional) locale tag like `es-ES` or `pt_BR` to a
 *  strings entry, falling back to English. */
function stringsForLocale(locale: string): { figure: ResourceTypeStrings; table: ResourceTypeStrings; video: ResourceTypeStrings; numberingTemplate?: string } {
  return stringsFor(BUILTIN_TYPE_STRINGS, locale);
}

/** The document language the built-in strings follow: `config.locale`, else
 *  the hyphenation locale, else English — the resolution the table
 *  continuation strings use too. A blank tag counts as unset. */
export function documentLocale(config: PostextConfig | undefined): string {
  return presentTag(config?.locale) ?? presentTag(config?.bodyText?.hyphenation?.locale) ?? 'en';
}

/** Built-in resource types provided when a config does not define its own,
 *  localised to `locale` (defaults to English): figures, tables and videos
 *  (#454), each numbered on its own. All reset their counter on
 *  every `h1` and number as `{h1}.{n}` (e.g. "Figure 2.3"), or `{h1}-{n}` in
 *  Chinese ("图 2-3"), Japanese ("図 2-3") and Arabic ("شكل 2-3"), using
 *  decimal counters. New objects are returned on every call so callers may
 *  freely mutate the result. */
export function defaultResourceTypes(locale = 'en'): ResourceType[] {
  const s = stringsForLocale(locale);
  const numberingTemplate = s.numberingTemplate ?? '{h1}.{n}';
  return [
    {
      id: 'figure',
      ...s.figure,
      numberingTemplate,
      resetOn: 'h1',
      counterFormat: 'decimal',
    },
    {
      id: 'table',
      ...s.table,
      numberingTemplate,
      resetOn: 'h1',
      counterFormat: 'decimal',
    },
    defaultVideoResourceType(locale),
  ];
}

/** The built-in `video` type (#454) in `locale`: numbered like figures and
 *  tables, in a sequence of its own (Video 1.1, Vídeo 1.1, 视频1-1). */
export function defaultVideoResourceType(locale = 'en'): ResourceType {
  const s = stringsForLocale(locale);
  return {
    id: 'video',
    ...s.video,
    numberingTemplate: s.numberingTemplate ?? '{h1}.{n}',
    resetOn: 'h1',
    counterFormat: 'decimal',
  };
}

/** The resource types a build numbers with: the document's
 *  `resourceTypes`, else the built-in ones. A list saved before videos
 *  existed (#454) has no `video` type: the built-in one is added when a
 *  video resource is typed `video`, so such a book numbers its videos
 *  without editing its types. */
export function effectiveResourceTypes(
  config: PostextConfig | undefined,
  resources: ReadonlyArray<{ typeId: string }> = [],
): ResourceType[] {
  const locale = documentLocale(config);
  const types = config?.resourceTypes ?? defaultResourceTypes(locale);
  if (types.some((t) => t.id === 'video') || !resources.some((r) => r.typeId === 'video')) return types;
  return [...types, defaultVideoResourceType(locale)];
}
