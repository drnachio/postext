// Which content locale a preset opens in, and whether a saved draft of it
// (see storage/presetDrafts.ts) is what opens. Pure.

import { matchContentLocale, sameContentLocale } from 'postext';
import type { PresetDraftSummary } from '../storage/presetDrafts';
import { sameBook, type ViewHashBook } from '../storage/viewHash';
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
 *  in the same script before the other one), the only one it has, or null
 *  when the summary cannot tell (the bundle decides on load). */
export function resolvePresetLocale(summary: Pick<PresetSummary, 'locale' | 'locales'>, requested: string): string | null {
  const locales = presetLocales(summary);
  const match = matchContentLocale(locales, requested);
  if (match) return match;
  return locales.length === 1 ? locales[0]! : null;
}

/** The interface languages the showcase books are written for: a viewer in
 *  any other language (Catalan, Chinese, Arabic, Japanese, Portuguese) reads a book it
 *  has no edition for in another one, where the book has it. */
const EDITION_LANGUAGES = ['en', 'es'];

/** The language a viewer in `viewer` reads a preset in when nobody asks
 *  for one: `viewer` itself, unless it is a language other than English or
 *  Spanish that the book's locales lack: then its Spanish edition for a
 *  Catalan viewer, when there is one, else its English edition's tag. A
 *  book that lists no locales (the bundle decides on load) keeps `viewer`. */
export function presetReaderLocale(summary: Pick<PresetSummary, 'locale' | 'locales'>, viewer: string): string {
  if (EDITION_LANGUAGES.some((l) => sameContentLocale(l, viewer))) return viewer;
  const locales = presetLocales(summary);
  if (locales.length === 0 || matchContentLocale(locales, viewer)) return viewer;
  const spanish = sameContentLocale('ca', viewer) ? matchContentLocale(locales, 'es') : undefined;
  return spanish ?? matchContentLocale(locales, 'en') ?? viewer;
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

type LocaleSummary = Pick<PresetSummary, 'locale' | 'locales' | 'openLocale'>;

/** The locale a preset opens in when `requested` is asked for (a locale
 *  tag, a `lang=` link): the one of its locales serving it; for a language
 *  a book in several locales lacks, its `openLocale` when it names one;
 *  else the tag itself (the bundle decides on load). */
export function presetLocaleFor(summary: LocaleSummary, requested: string): string {
  const carried = presetLocales(summary).length > 1;
  return resolvePresetLocale(summary, requested) ?? (carried ? presetOpenLocale(summary) : null) ?? requested;
}

/** Whether a preset on screen in `current` is already the edition a
 *  request for `requested` opens (no request: whatever is open), so that
 *  opening it again changes nothing. A preset listing its locales names
 *  each edition by its own tag (`zh-TW` asks for its `zh-Hant`, and
 *  Simplified ↔ Traditional switch); one listing none, or unknown, is
 *  compared by content language. */
export function isEditionOnScreen(summary: LocaleSummary | undefined, requested: string | null | undefined, current: string | null): boolean {
  if (current === null) return false;
  if (!requested) return true;
  if (summary && presetLocales(summary).length > 0) return sameLocaleTag(presetLocaleFor(summary, requested), current);
  return sameContentLocale(requested, current);
}

/** Whether a permalink's book is the one on screen (see `sameBook`), a
 *  preset's `lang=` read as the edition it opens: `lang=zh-TW` names the
 *  `zh-Hant` edition on screen, a language the book lacks its
 *  `openLocale`. */
export function linkNamesBookOnScreen(
  link: ViewHashBook,
  book: ViewHashBook,
  summaries: readonly (LocaleSummary & Pick<PresetSummary, 'id'>)[],
): boolean {
  if (link.project !== null || link.preset === null || link.lang === null) return sameBook(link, book);
  if (book.project !== null || book.preset !== link.preset) return false;
  return isEditionOnScreen(summaries.find((p) => p.id === link.preset), link.lang, book.lang);
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
 *    the viewer's language), else the viewer's locale (a Chinese viewer
 *    of a book without Chinese: its English edition, see
 *    {@link presetReaderLocale}) — unless only other
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
    locale = presetLocaleFor(input.summary, input.requested);
  } else if (input.current) {
    locale = input.current;
  } else {
    const reader = presetReaderLocale(input.summary, input.viewer);
    const viewer = opening ?? resolvePresetLocale(input.summary, reader) ?? reader;
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
