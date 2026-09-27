"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import type { Catalog, Locale } from "@/lib/cookbook/types";
import { unpackCatalog, type PackedCatalog } from "@/lib/cookbook/wire";
import {
  EMPTY_STATE,
  computeModel,
  indexCatalog,
  isFiltered,
  parseState,
  sanitizeState,
  serializeState,
  type GalleryModel,
  type GalleryState,
  type ListKey,
  type LoadedCatalog,
  type SortId,
} from "./model";

// ─── catalog.json, fetched on demand and cached in module scope ────────────

export type CatalogSnapshot =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: LoadedCatalog }
  | { status: "error" };

const IDLE: CatalogSnapshot = { status: "idle" };
const snapshots = new Map<Locale, CatalogSnapshot>();
const listeners = new Set<() => void>();

function publish(locale: Locale, snapshot: CatalogSnapshot) {
  snapshots.set(locale, snapshot);
  for (const listener of listeners) listener();
}

/** Starts the fetch once per locale; later calls are no-ops (an error can
 *  be retried by calling it again). */
export function loadCatalog(locale: Locale): void {
  const current = snapshots.get(locale)?.status;
  if (current === "loading" || current === "ready") return;
  publish(locale, { status: "loading" });
  fetch(`/${locale}/cookbook/catalog.json`)
    .then((res) => {
      if (!res.ok) throw new Error(`catalog.json: ${res.status}`);
      return res.json() as Promise<Catalog | PackedCatalog>;
    })
    .then((catalog) => publish(locale, { status: "ready", data: indexCatalog(unpackCatalog(catalog), locale) }))
    .catch(() => publish(locale, { status: "error" }));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useCatalog(locale: Locale): CatalogSnapshot {
  return useSyncExternalStore(
    subscribe,
    () => snapshots.get(locale) ?? IDLE,
    () => IDLE,
  );
}

/** Loads the catalogue now when the page opens filtered, otherwise when the
 *  browser is idle. */
export function useCatalogPrefetch(locale: Locale, now: boolean, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    if (now) {
      loadCatalog(locale);
      return;
    }
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(() => loadCatalog(locale), { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(() => loadCatalog(locale), 2000);
    return () => window.clearTimeout(id);
  }, [locale, now, enabled]);
}

// ─── State in the URL ───────────────────────────────────────────────────────

/** Rewrites the query string with `history.replaceState` (Next syncs
 *  `useSearchParams`); Back leaves the page rather than stepping filters. */
export function updateGallery(locale: Locale, change: Partial<GalleryState> | ((state: GalleryState) => GalleryState)) {
  const current = parseState(new URLSearchParams(window.location.search));
  let next = typeof change === "function" ? change(current) : { ...current, ...change };
  const snapshot = snapshots.get(locale);
  if (snapshot?.status === "ready") next = sanitizeState(next, snapshot.data.catalog);
  const query = serializeState(next);
  const url = `${window.location.pathname}${query ? `?${query}` : ""}`;
  if (url !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, "", url);
}

// ─── The model, shared by the islands ───────────────────────────────────────

let memo: { data: LoadedCatalog; key: string; model: GalleryModel } | null = null;

function modelFor(data: LoadedCatalog, key: string, state: GalleryState, locale: Locale): GalleryModel {
  if (memo && memo.data === data && memo.key === key) return memo.model;
  const model = computeModel(data, state, locale);
  memo = { data, key, model };
  return model;
}

export interface Gallery {
  /** Parsed from the URL (not yet checked against the catalogue). */
  state: GalleryState;
  filtered: boolean;
  catalog: CatalogSnapshot;
  /** Null until the catalogue has loaded. */
  model: GalleryModel | null;
}

export function useGallery(locale: Locale): Gallery {
  const params = useSearchParams();
  const catalog = useCatalog(locale);
  const key = `${locale}?${params.toString()}`;
  const state = parseState(new URLSearchParams(params.toString()));
  const model = catalog.status === "ready" ? modelFor(catalog.data, key, state, locale) : null;
  return { state: model?.state ?? state, filtered: isFiltered(state), catalog, model };
}

// ─── Actions ────────────────────────────────────────────────────────────────

export function toggleValue(locale: Locale, key: ListKey, id: string) {
  loadCatalog(locale);
  updateGallery(locale, (s) => ({ ...s, [key]: s[key].includes(id) ? s[key].filter((v) => v !== id) : [...s[key], id] }));
}

export function setChapter(locale: Locale, id: string | null) {
  loadCatalog(locale);
  updateGallery(locale, { cat: id });
}

export function removeSelection(locale: Locale, key: "cat" | ListKey, id: string) {
  if (key === "cat") setChapter(locale, null);
  else updateGallery(locale, (s) => ({ ...s, [key]: s[key].filter((v) => v !== id) }));
}

/** Clears the facets; the query, the view and the sort stay. */
export function clearFilters(locale: Locale) {
  updateGallery(locale, (s) => ({ ...EMPTY_STATE, q: s.q, view: s.view, sort: s.sort }));
}

/** Back to the unfiltered book view. */
export function resetGallery(locale: Locale) {
  updateGallery(locale, EMPTY_STATE);
}

/** Default sort: Relevance with a query, Contents without. */
export function defaultSort(q: string): SortId {
  return q.trim() ? "relevance" : "contents";
}

/** The default sort is left out of the URL. */
export function setSort(locale: Locale, sort: SortId) {
  updateGallery(locale, (s) => ({ ...s, sort: sort === defaultSort(s.q) ? null : sort }));
}
