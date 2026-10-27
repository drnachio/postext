// Locale resolution for manifests: per-locale overrides, metadata, view,
// start state and chapter lists.
import { matchContentLocale, canonicalLocaleTag, sameContentLocale, presentTag } from '../../hyphenation/locale.js';
import type { HeadingCounters, PartState } from '../../types.js';
import type { BundleManifestV1, BundleManifest, BundleLocaleOverrides, BundleViewSpec, BundleStart, BundleChapterSpec } from '../types.js';
import { isRecord, isNonEmptyString } from './validation.js';

// ---------------------------------------------------------------------------
// Locale resolution

/** The key of a locale → value map that serves `locale`: the one
 *  `matchContentLocale` picks (exact tag, then the same language and
 *  script, so `zh-TW` finds `zh-Hant` before `zh-Hans`, then the language
 *  in another script: `zh-TW` reads a bare `zh` rather than the manifest's
 *  English), else the one serving the manifest's own locale, then the
 *  first key. */
function pickLocaleKey(keys: string[], locale: string, manifestLocale?: string): string {
  return matchContentLocale(keys, locale)
    ?? (manifestLocale ? matchContentLocale(keys, manifestLocale) : undefined)
    ?? keys[0]!;
}

/** Whether two tags are the same tag, case and `_` separators aside. */
function sameTag(a: string, b: string): boolean {
  const ca = canonicalLocaleTag(a) ?? a;
  const cb = canonicalLocaleTag(b) ?? b;
  return ca.toLowerCase() === cb.toLowerCase();
}

function pickByLocale<T>(map: Record<string, T>, locale: string, manifestLocale?: string): T {
  return map[pickLocaleKey(Object.keys(map), locale, manifestLocale)]!;
}

/** Which markdown file a version 1 manifest serves for `locale`. */
export function pickMarkdownFile(manifest: BundleManifestV1, locale: string): string {
  const md = manifest.markdown;
  if (typeof md === 'string') return md;
  return pickByLocale(md, locale, manifest.locale);
}

/** The key a bundle's content is served under for `locale`: the key of its
 *  chapter map when the chapters are a locale map; with shared chapters
 *  and `localized` wording, the manifest's own locale or one of the
 *  localized keys; null for a bundle in a single language. */
function contentLocaleKey(manifest: BundleManifest, locale: string): string | null {
  const chapterMap = manifest.version === 2 && !Array.isArray(manifest.chapters) ? manifest.chapters
    : manifest.version === 1 && typeof manifest.markdown !== 'string' ? manifest.markdown
      : null;
  if (chapterMap) return pickLocaleKey(Object.keys(chapterMap), locale, manifest.locale);
  const localized = Object.keys(manifest.localized ?? {});
  if (localized.length === 0) return null;
  // Shared chapters: the manifest's own locale is one of the candidates, so
  // reading it — or a locale the bundle does not carry — keeps the shared
  // wording instead of falling back to the first localized entry.
  return pickLocaleKey(manifest.locale ? [manifest.locale, ...localized] : localized, locale, manifest.locale);
}

/** The per-locale overrides that apply to `locale`, or null when the
 *  manifest has none: those of the locale the content is served under (see
 *  {@link resolveBundleLocale}), so text and wording never disagree. That
 *  is the entry of the exact tag; for any locale but the manifest's own,
 *  else the entry `matchContentLocale` picks: its bare base language (`pt`
 *  for `pt-BR`), else a regional variant of the same language, and for
 *  Chinese only an entry in the same script. The manifest's own locale is
 *  what the shared wording is written in: only an entry naming it exactly
 *  rewords it, never a sibling variant (`pt-BR` when the bundle is
 *  `pt-PT`). */
export function pickLocaleOverrides(manifest: BundleManifest, locale: string): BundleLocaleOverrides | null {
  const localized = manifest.localized;
  if (!localized || Object.keys(localized).length === 0) return null;
  const key = contentLocaleKey(manifest, locale);
  if (key === null) return null;
  const keys = Object.keys(localized);
  const exact = keys.find((k) => sameTag(k, key));
  if (exact) return localized[exact]!;
  if (manifest.locale && sameTag(manifest.locale, key)) return null;
  // Wording in the script of the text served: Simplified labels never
  // reword a Traditional edition.
  const found = matchContentLocale(keys, key);
  return found && sameContentLocale(found, key) ? localized[found]! : null;
}

/** What {@link pickBundleMeta} reads: a manifest, or an index entry that
 *  carries its names (`name`, `description`, `locale`, `localized`). */
export type BundleNames = Pick<BundleManifest, 'name' | 'description' | 'locale'> & {
  localized?: Record<string, Pick<BundleLocaleOverrides, 'name' | 'description'>>;
};

/** The name and description of the edition served for `locale`: the
 *  manifest's, with that language's `localized[…].name` and
 *  `description` over them (#891). An empty localized name keeps the
 *  manifest's. Given an index entry rather than a manifest, the edition is
 *  picked among the manifest's locale and the localized keys. */
export function pickBundleMeta(manifest: BundleManifest | BundleNames, locale: string): { name: string; description?: string } {
  const own = pickLocaleOverrides(manifest as BundleManifest, locale);
  const name = own?.name?.trim() ? own.name : manifest.name;
  const description = own?.description !== undefined && own.description !== '' ? own.description : manifest.description;
  return { name, ...(description ? { description } : {}) };
}

/** How the edition served for `locale` opens: the manifest's `view` with
 *  that language's `localized[…].view` over it. */
export function pickBundleView(manifest: BundleManifest, locale: string): BundleViewSpec | undefined {
  const own = pickLocaleOverrides(manifest, locale)?.view;
  if (!own) return manifest.view;
  return { ...manifest.view, ...own };
}

const count = (v: unknown): number | undefined =>
  (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : undefined);

/** Heading counters with every level a whole number: a level left out
 *  (`{ h1: 3 }`) or ill-typed counts zero. */
function headingCounters(v: unknown): HeadingCounters | undefined {
  if (!isRecord(v)) return undefined;
  return { h1: count(v.h1) ?? 0, h2: count(v.h2) ?? 0, h3: count(v.h3) ?? 0, h4: count(v.h4) ?? 0, h5: count(v.h5) ?? 0, h6: count(v.h6) ?? 0 };
}

/** A map of counters (`{ figure: { counter, heading } }`), ill-typed
 *  entries left out; undefined when none is left. */
function counterMap(v: unknown): Record<string, { counter: number; heading: HeadingCounters }> | undefined {
  if (!isRecord(v)) return undefined;
  const out: Record<string, { counter: number; heading: HeadingCounters }> = {};
  for (const [key, entry] of Object.entries(v)) {
    const counter = isRecord(entry) ? count(entry.counter) : undefined;
    if (counter !== undefined) out[key] = { counter, heading: headingCounters((entry as Record<string, unknown>).heading) ?? headingCounters({})! };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Where a book starts ({@link BundleStart}), as a manifest or a caller
 * gives it, in the shape the engine takes as a `continuation`: the fields
 * it knows, each of the right type, the heading counters complete. A field
 * of another type is left out rather than failing the bundle, and so is
 * `bookPageCount`. Undefined when nothing is left: a book that starts at
 * its own beginning.
 */
export function bundleStart(value: unknown): BundleStart | undefined {
  if (!isRecord(value)) return undefined;
  const out: BundleStart = {};
  const pageIndexOffset = count(value.pageIndexOffset);
  if (pageIndexOffset !== undefined) out.pageIndexOffset = pageIndexOffset;
  if (isRecord(value.pageNumbering)) {
    const { format, startAt } = value.pageNumbering;
    const numbering: NonNullable<BundleStart['pageNumbering']> = {
      ...(isNonEmptyString(format) ? { format: format as NonNullable<BundleStart['pageNumbering']>['format'] } : {}),
      ...(typeof startAt === 'number' && Number.isFinite(startAt) ? { startAt: Math.floor(startAt) } : {}),
    };
    if (Object.keys(numbering).length > 0) out.pageNumbering = numbering;
  }
  const headings = headingCounters(value.headings);
  if (headings) out.headings = headings;
  const resourceCounters = counterMap(value.resourceCounters);
  if (resourceCounters) out.resourceCounters = resourceCounters;
  if (isRecord(value.resourceNumbers)) {
    const numbers: NonNullable<BundleStart['resourceNumbers']> = {};
    for (const [id, entry] of Object.entries(value.resourceNumbers)) {
      if (isRecord(entry) && typeof entry.number === 'string' && isNonEmptyString(entry.typeId)) {
        numbers[id] = { number: entry.number, typeId: entry.typeId, heading: headingCounters(entry.heading) ?? headingCounters({})! };
      }
    }
    if (Object.keys(numbers).length > 0) out.resourceNumbers = numbers;
  }
  const statementCounters = counterMap(value.statementCounters);
  if (statementCounters) out.statementCounters = statementCounters;
  const footnoteNumber = count(value.footnoteNumber);
  if (footnoteNumber !== undefined) out.footnoteNumber = footnoteNumber;
  const lineNumber = count(value.lineNumber);
  if (lineNumber !== undefined) out.lineNumber = lineNumber;
  if (isRecord(value.part) && typeof value.part.number === 'string' && typeof value.part.title === 'string') {
    const part: PartState = { number: value.part.number, title: value.part.title };
    if (isRecord(value.part.palette)) {
      const palette = Object.fromEntries(Object.entries(value.part.palette).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
      if (Object.keys(palette).length > 0) part.palette = palette;
    }
    out.part = part;
  }
  if (value.afterPartPage === true) out.afterPartPage = true;
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Where the edition served for `locale` starts: that language's
 *  `localized[…].start`, else the manifest's `start`; undefined for a book
 *  that starts at its own beginning. */
export function pickBundleStart(manifest: BundleManifest, locale: string): BundleStart | undefined {
  const own = pickLocaleOverrides(manifest, locale)?.start;
  return bundleStart(own !== undefined ? own : manifest.start);
}

/** The locale a bundle actually serves for `locale`: the key of its
 *  chapter map when the content is a locale map, the key whose wording it
 *  reads when shared chapters carry `localized` wording, else the
 *  manifest's own locale, else `locale` itself. */
export function resolveBundleLocale(manifest: BundleManifest, locale: string): string {
  return contentLocaleKey(manifest, locale) ?? manifest.locale ?? locale;
}

/** The language a bundle's default configuration is localised to (the
 *  names of the built-in resource types: "Figure", "Figura"), read for
 *  `locale`. When the manifest names its languages, the one its content is
 *  served in ({@link resolveBundleLocale}); when it names none, the
 *  document language of its own `config` (`locale`, then
 *  `bodyText.hyphenation.locale`), as the engine resolves it; else
 *  `locale`. */
export function resolveBundleConfigLocale(manifest: BundleManifest, locale: string): string {
  if (presentTag(manifest.locale) || contentLocaleKey(manifest, locale) !== null) return resolveBundleLocale(manifest, locale);
  return presentTag(manifest.config?.locale) ?? presentTag(manifest.config?.bodyText?.hyphenation?.locale) ?? locale;
}

/** The chapter files to read for `locale`: a version 1 manifest yields a
 *  single untitled chapter. */
export function pickChapterSpecs(manifest: BundleManifest, locale: string): BundleChapterSpec[] {
  if (manifest.version === 1) return [{ title: '', file: pickMarkdownFile(manifest, locale) }];
  const ch = manifest.chapters;
  return Array.isArray(ch) ? ch : pickByLocale(ch, locale, manifest.locale);
}
