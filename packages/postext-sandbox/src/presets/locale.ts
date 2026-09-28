// Which content locale a preset opens in, and whether a saved draft of it
// (see storage/presetDrafts.ts) is what opens. Pure.

import { matchContentLocale, sameContentLocale } from 'postext';
import type { PresetDraftSummary } from '../storage/presetDrafts';
import type { PresetSummary } from './types';

/** Same content language (see `postext`'s `sameContentLocale`): region and
 *  case aside (`es-ES` is `es`), and for Chinese the same script (`zh-TW`
 *  is `zh-Hant`, never `zh-Hans`). */
export { sameContentLocale };

/** The same tag, case aside. */
export function sameLocaleTag(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** The locales a preset's summary says it carries (none when unknown). */
export function presetLocales(summary: Pick<PresetSummary, 'locale' | 'locales'>): string[] {
  if (summary.locales && summary.locales.length > 0) return summary.locales;
  return summary.locale ? [summary.locale] : [];
}

/** The locale key a preset serves for `requested`: the one of its locales
 *  that serves that language (exact tag first; for Chinese, the edition
 *  in the same script), the only one it has, or null when the summary
 *  cannot tell (the bundle decides on load). */
export function resolvePresetLocale(summary: Pick<PresetSummary, 'locale' | 'locales'>, requested: string): string | null {
  const locales = presetLocales(summary);
  const match = matchContentLocale(locales, requested);
  if (match) return match;
  return locales.length === 1 ? locales[0]! : null;
}

/** The locale a preset opens in when nobody asks for one (its
 *  `openLocale`, as one of its locales), or null when it names none. */
export function presetOpenLocale(summary: Pick<PresetSummary, 'locale' | 'locales' | 'openLocale'>): string | null {
  if (!summary.openLocale) return null;
  const locales = presetLocales(summary);
  if (locales.length === 0) return summary.openLocale;
  return matchContentLocale(locales, summary.openLocale) ?? null;
}

/** The one of `locales` the locale `active` is served as (the tag of a
 *  library row to mark), or null. */
export function activeLocaleTag(locales: readonly string[], active: string | null): string | null {
  if (active === null) return null;
  return matchContentLocale(locales, active) ?? null;
}

export interface PresetOpenChoice {
  /** The locale to open (a draft's own when one opens). */
  locale: string;
  /** The draft that opens instead of the original, if any. */
  draft: PresetDraftSummary | null;
}

/** What opening `summary` shows:
 *
 *  - a locale asked for (a locale tag, a `lang=` link) opens in that
 *    locale — its draft when there is one, else the original; a locale the
 *    preset does not carry opens its `openLocale`, when it names one;
 *  - the preset already on screen keeps its locale (`current`);
 *  - otherwise the preset's `openLocale` (a book whose original is not in
 *    the viewer's language), else the viewer's locale — unless only other
 *    locales of it were edited: then the most recently edited one, so a
 *    row click brings the reader back to the book they were working on. */
export function choosePresetOpen(input: {
  summary: Pick<PresetSummary, 'id' | 'locale' | 'locales' | 'openLocale'>;
  requested?: string;
  current?: string | null;
  viewer: string;
  drafts: readonly PresetDraftSummary[];
}): PresetOpenChoice {
  const drafts = input.drafts.filter((d) => d.presetId === input.summary.id);
  const draftFor = (locale: string): PresetDraftSummary | null =>
    drafts.find((d) => sameLocaleTag(d.locale, locale))
    ?? drafts.find((d) => d.locale !== '' && sameContentLocale(d.locale, locale))
    ?? null;
  const opening = presetOpenLocale(input.summary);
  let locale: string;
  if (input.requested) {
    const carried = presetLocales(input.summary).length > 1;
    locale = resolvePresetLocale(input.summary, input.requested) ?? (carried ? opening : null) ?? input.requested;
  } else if (input.current) {
    locale = input.current;
  } else {
    const viewer = opening ?? resolvePresetLocale(input.summary, input.viewer) ?? input.viewer;
    if (draftFor(viewer) || drafts.length === 0) {
      locale = viewer;
    } else {
      const latest = [...drafts].sort((a, b) => b.updatedAt - a.updatedAt)[0]!;
      locale = latest.locale || viewer;
      return { locale, draft: latest };
    }
  }
  return { locale, draft: draftFor(locale) };
}

/** The content locales a bundle manifest carries, in the order its
 *  `locales` lists them (then its chapter-map keys, then its `localized`
 *  keys), and the one it is written in (`own`: its `locale`, else the
 *  first). Empty for a manifest in one language or an unreadable one. */
export function bundleContentLocales(manifest: unknown): { locales: string[]; own: string | null } {
  if (typeof manifest !== 'object' || manifest === null) return { locales: [], own: null };
  const m = manifest as { locale?: unknown; locales?: unknown; chapters?: unknown; markdown?: unknown; localized?: unknown };
  const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x !== '') : []);
  const keysOf = (v: unknown): string[] => (typeof v === 'object' && v !== null && !Array.isArray(v) ? Object.keys(v) : []);
  const own = typeof m.locale === 'string' && m.locale !== '' ? m.locale : null;
  const mapped = [...keysOf(m.chapters), ...(typeof m.markdown === 'object' ? keysOf(m.markdown) : [])];
  const localized = keysOf(m.localized);
  // Shared chapters with per-locale wording: the primary locale is one.
  const shared = mapped.length === 0 && localized.length > 0 && own ? [own] : [];
  const out: string[] = [];
  for (const l of [...strings(m.locales), ...mapped, ...shared, ...localized]) {
    if (!out.some((o) => sameLocaleTag(o, l))) out.push(l);
  }
  if (out.length < 2) return { locales: [], own };
  return { locales: out, own: (own && out.find((l) => sameLocaleTag(l, own))) ?? out[0]! };
}
