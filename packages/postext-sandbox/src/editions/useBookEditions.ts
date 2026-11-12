'use client';

/**
 * The editions of the book on screen (#867): the locales a preset's bundle
 * carries, the one open, and their layouts behind the reader (see
 * `editionStore.ts`). A local project keeps every edition of the bundle
 * it was imported from (#903); a book a host links to in one language of
 * several (a Cookbook recipe) lists the others the host names, each read
 * from its own bundle (#1011, `linkedEditions.ts`).
 */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { onFontsChanged } from 'postext';
import { useSandboxLinkedBundles, useSandboxPresetProvider, useSandboxSelector } from '../context/SandboxContext.js';
import { parseHashBundleOrigin, type HashBundleRef } from '../storage/viewHash.js';
import { linkedEditionLocales, loadLinkedEdition } from './linkedEditions.js';
import { sameLocaleTag } from '../presets/locale.js';
import { activeEditionLocale, bookEditionLocales } from './bookLocales.js';
import { editionsOnDemand } from './onDemand.js';
import { useLayoutService } from '../worker/LayoutServiceContext.js';
import { onLateFonts } from '../worker/LayoutService.js';
import { askEditions, editionEntry, editionsAsked, editionsVersion, ensureEdition, loadPresetEdition, loadProjectEdition, subscribeEditions, type EditionEntry } from './editionStore.js';
import { hasWindow } from '../env/window.js';

export interface BookEditions {
  /** `preset:<id>` or `project:<id>`. */
  bookKey: string;
  /** The preset on screen, null for a local project. */
  presetId: string | null;
  /** The local project on screen, null for a preset. */
  projectId: string | null;
  /** The host link the project on screen was opened from, when the host
   *  publishes it in several languages (#1011): another edition is that
   *  link in its language. */
  linked: HashBundleRef | null;
  /** Every edition, in the bundle's order (a project keeps the ones it was
   *  imported with, #903). */
  locales: string[];
  /** The edition on screen (`''` when the book names no language). */
  activeLocale: string;
  /** Their layouts, by locale. */
  entries: Record<string, EditionEntry | undefined>;
  /** The book is big enough to wait for the reader's word before its
   *  editions are laid out (`onDemand`, #952): nothing is, yet. */
  waiting: boolean;
  /** Lay every edition out now (what the Checks panel's button does). */
  layOutNow: () => void;
}

/** How long the book on screen rests before its other chapters are laid
 *  out again for the checks. */
const ACTIVE_EDITION_DEBOUNCE_MS = 1500;

/** The editions of the book on screen; with `enabled`, laid out behind the
 *  reader (the Checks panel, the side-by-side view). `only` limits the
 *  layouts to some locales. With `onDemand`, a book too big to lay out
 *  unasked (see `editionsOnDemand`) waits until `layOutNow` is called, once
 *  per book for the session. `chapters` (by index) are laid out besides the
 *  ones with composed checks (the side-by-side view's, #1007). */
export function useBookEditions(
  enabledAsked: boolean,
  only?: readonly string[],
  options: { onDemand?: boolean; chapters?: readonly number[] } = {},
): BookEditions {
  const activeProjectId = useSandboxSelector((s) => s.activeProjectId);
  const activePresetId = useSandboxSelector((s) => s.activePresetId);
  const appliedLocale = useSandboxSelector((s) => (s.presetApplied?.presetId === s.activePresetId ? s.presetApplied.locale ?? null : null));
  const summary = useSandboxSelector((s) => s.presetSummaries.find((p) => p.id === s.activePresetId));
  const project = useSandboxSelector((s) => (s.activeProjectId === null ? undefined : s.projects.find((p) => p.id === s.activeProjectId)));
  const drafts = useSandboxSelector((s) => s.presetDrafts);
  const chapters = useSandboxSelector((s) => s.chapters);
  const config = useSandboxSelector((s) => s.config);
  const resources = useSandboxSelector((s) => s.resources);
  const chapterLayouts = useSandboxSelector((s) => s.chapterLayouts);
  const bookStart = useSandboxSelector((s) => s.bookStart);
  const presetProvider = useSandboxPresetProvider();
  const service = useLayoutService();
  const version = useSyncExternalStore(subscribeEditions, editionsVersion, editionsVersion);

  const presetId = activeProjectId === null ? activePresetId : null;
  const bookKey = presetId !== null ? `preset:${presetId}` : `project:${activeProjectId}`;
  const activeLocale = activeEditionLocale({ presetId, appliedLocale, projectLocale: project?.locale, configLocale: config.locale });
  const projectLocales = project?.locales;
  // A project in one language opened from a host link: the languages the
  // host publishes it in.
  const linkedBundles = useSandboxLinkedBundles();
  const origin = project && !projectLocales ? project.origin : undefined;
  const linkRef = useMemo(() => parseHashBundleOrigin(origin), [origin]);
  const [published, setPublished] = useState<{ origin: string; locales: string[] | null } | null>(null);
  useEffect(() => {
    if (!linkRef || !origin) return;
    let cancelled = false;
    void linkedBundles.editions(linkRef.key, linkRef.id).then((list) => {
      if (cancelled) return;
      setPublished((prev) => (prev && prev.origin === origin && prev.locales === list ? prev : { origin, locales: list }));
    });
    return () => { cancelled = true; };
  }, [linkRef, origin, linkedBundles]);
  const linkedLocales = useMemo(
    () => (linkRef && published && published.origin === origin ? linkedEditionLocales(published.locales, activeLocale) : null),
    [linkRef, published, origin, activeLocale],
  );
  const linked = linkedLocales ? linkRef : null;
  const locales = useMemo(
    () => linkedLocales ?? bookEditionLocales({ presetId, summary, projectLocales, activeLocale }),
    [linkedLocales, presetId, summary, projectLocales, activeLocale],
  );
  const waiting = enabledAsked && options.onDemand === true && editionsOnDemand(chapters.length, locales.length) && !editionsAsked(bookKey);
  // A book waiting for the reader's word lays nothing out.
  const enabled = enabledAsked && !waiting;
  const layOutNow = useCallback(() => askEditions(bookKey), [bookKey]);
  const editionsRev = project?.editionsRev;
  const onlyKey = only?.join('|') ?? '';
  const chaptersKey = options.chapters?.join('|') ?? '';
  const chapterIndices = useMemo(() => (chaptersKey === '' ? [] : chaptersKey.split('|').map(Number)), [chaptersKey]);
  // Faces that land after a layout measured it without them: the editions
  // are laid out again, as the previews are.
  const [fontsEpoch, setFontsEpoch] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const bump = () => setFontsEpoch((e) => e + 1);
    const off = onFontsChanged(bump);
    const offLate = onLateFonts(bump);
    return () => {
      off();
      offLate();
    };
  }, [enabled]);

  // The book on screen: its live chapters, laid out a moment after the
  // last edit.
  useEffect(() => {
    if (!enabled) return;
    if (only && !only.some((l) => sameLocaleTag(l, activeLocale))) return;
    const timer = setTimeout(() => {
      ensureEdition({
        bookKey,
        locale: activeLocale,
        identity: [chapters, config, resources, chapterLayouts, bookStart, fontsEpoch],
        other: false,
        service,
        chapters: chapterIndices,
        load: async () => ({
          source: {
            locale: activeLocale,
            chapters,
            config,
            resources,
            layouts: chapterLayouts,
            ...(bookStart ? { start: bookStart } : {}),
          },
        }),
      });
    }, ACTIVE_EDITION_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `only` is read through its key
  }, [enabled, bookKey, activeLocale, chapters, config, resources, chapterLayouts, bookStart, service, onlyKey, chapterIndices, fontsEpoch]);

  // The other editions of a local project: the content its record keeps
  // aside for them (#903).
  useEffect(() => {
    if (!enabled || presetId !== null || activeProjectId === null || linked !== null || locales.length < 2) return;
    const timer = setTimeout(() => {
      for (const locale of locales) {
        if (sameLocaleTag(locale, activeLocale)) continue;
        if (only && !only.some((l) => sameLocaleTag(l, locale))) continue;
        ensureEdition({
          bookKey,
          locale,
          // Moves when the editions swap places (an import, a switch), not
          // with every autosave of the edition on screen.
          identity: [editionsRev ?? 'original', fontsEpoch],
          other: true,
          service,
          chapters: chapterIndices,
          load: () => loadProjectEdition(activeProjectId, locale),
        });
      }
    }, fontsEpoch === 0 ? 0 : ACTIVE_EDITION_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `only` is read through its key
  }, [enabled, presetId, activeProjectId, linked, bookKey, locales, activeLocale, editionsRev, service, onlyKey, chapterIndices, fontsEpoch]);

  // The other editions of a linked book: each from its own bundle (#1011).
  useEffect(() => {
    if (!enabled || linked === null) return;
    const resolve = linkedBundles.resolver(linked.key);
    if (!resolve || !hasWindow()) return;
    const pageOrigin = window.location.origin;
    const timer = setTimeout(() => {
      for (const locale of locales) {
        if (sameLocaleTag(locale, activeLocale)) continue;
        if (only && !only.some((l) => sameLocaleTag(l, locale))) continue;
        ensureEdition({
          bookKey,
          locale,
          identity: [linked.key, linked.id, fontsEpoch],
          other: true,
          service,
          chapters: chapterIndices,
          load: () => loadLinkedEdition(linked, locale, resolve, pageOrigin),
        });
      }
    }, fontsEpoch === 0 ? 0 : ACTIVE_EDITION_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `only` is read through its key
  }, [enabled, linked, linkedBundles, bookKey, locales, activeLocale, service, onlyKey, chapterIndices, fontsEpoch]);

  // The other editions of a preset: their draft, else the bundle's text.
  useEffect(() => {
    if (!enabled || presetId === null) return;
    const provider = presetProvider(presetId);
    if (!provider) return;
    // A moment after the faces settle (they land in bursts on a first visit).
    const timer = setTimeout(() => {
      for (const locale of locales) {
        if (sameLocaleTag(locale, activeLocale)) continue;
        if (only && !only.some((l) => sameLocaleTag(l, locale))) continue;
        const draft = drafts.find((d) => d.presetId === presetId && sameLocaleTag(d.locale, locale));
        ensureEdition({
          bookKey,
          locale,
          identity: [draft?.updatedAt ?? 'original', fontsEpoch],
          other: true,
          service,
          chapters: chapterIndices,
          load: () => loadPresetEdition(provider, locale, drafts),
        });
      }
    }, fontsEpoch === 0 ? 0 : ACTIVE_EDITION_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `only` is read through its key
  }, [enabled, presetId, bookKey, locales, activeLocale, drafts, presetProvider, service, onlyKey, chapterIndices, fontsEpoch]);

  const entries = useMemo(() => {
    const out: Record<string, EditionEntry | undefined> = {};
    for (const l of locales) out[l] = editionEntry(bookKey, l);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` changes with every entry
  }, [bookKey, locales, version]);

  return { bookKey, presetId, projectId: activeProjectId, linked, locales, activeLocale, entries, waiting, layOutNow };
}
