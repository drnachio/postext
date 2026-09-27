// Which content locale a preset opens in, and whether a saved draft of it
// (see storage/presetDrafts.ts) is what opens. Pure.

import type { PresetDraftSummary } from '../storage/presetDrafts';
import type { PresetSummary } from './types';

/** Same language, ignoring region and case (`es-ES` is `es`). */
export function sameLanguage(a: string, b: string): boolean {
  const base = (l: string) => l.toLowerCase().split(/[-_]/)[0]!;
  return base(a) === base(b);
}

/** The locales a preset's summary says it carries (none when unknown). */
export function presetLocales(summary: Pick<PresetSummary, 'locale' | 'locales'>): string[] {
  if (summary.locales && summary.locales.length > 0) return summary.locales;
  return summary.locale ? [summary.locale] : [];
}

/** The locale key a preset serves for `requested`: the one of its locales
 *  in the same language, the only one it has, or null when the summary
 *  cannot tell (the bundle decides on load). */
export function resolvePresetLocale(summary: Pick<PresetSummary, 'locale' | 'locales'>, requested: string): string | null {
  const locales = presetLocales(summary);
  const match = locales.find((l) => sameLanguage(l, requested));
  if (match) return match;
  return locales.length === 1 ? locales[0]! : null;
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
 *    locale — its draft when there is one, else the original;
 *  - the preset already on screen keeps its locale (`current`);
 *  - otherwise the viewer's locale, unless only other locales of it were
 *    edited: then the most recently edited one, so a row click brings the
 *    reader back to the book they were working on. */
export function choosePresetOpen(input: {
  summary: Pick<PresetSummary, 'id' | 'locale' | 'locales'>;
  requested?: string;
  current?: string | null;
  viewer: string;
  drafts: readonly PresetDraftSummary[];
}): PresetOpenChoice {
  const drafts = input.drafts.filter((d) => d.presetId === input.summary.id);
  const draftFor = (locale: string): PresetDraftSummary | null =>
    drafts.find((d) => d.locale === locale) ?? drafts.find((d) => d.locale !== '' && sameLanguage(d.locale, locale)) ?? null;
  let locale: string;
  if (input.requested) {
    locale = resolvePresetLocale(input.summary, input.requested) ?? input.requested;
  } else if (input.current) {
    locale = input.current;
  } else {
    const viewer = resolvePresetLocale(input.summary, input.viewer) ?? input.viewer;
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
