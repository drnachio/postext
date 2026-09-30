// Automatic covers: a book without a cover picture gets one from its first
// page — the first page of its first chapter — once that page has been laid
// out and painted on screen. A project keeps it as its record's `thumbnail`
// (so an export carries it as the bundle's cover); a sample book without a
// shipped thumbnail keeps it locally, per preset and content locale (see
// storage/presetCovers.ts). A cover that exists — shipped with a preset,
// brought by a bundle, picked by the reader or captured earlier — is never
// replaced.
//
// This module holds the decisions (pure, tested); the capture itself is
// covers/useAutoCover.ts, the storage the two stores above.

import { sameContentLocale } from '../presets/locale';

/** The book a cover is for. */
export type CoverTarget =
  | { kind: 'project'; id: string }
  | { kind: 'preset'; id: string; locale: string };

/** Storage key of a preset's cover in a content locale. */
export function presetCoverKey(presetId: string, locale: string): string {
  return `${presetId}::${locale}`;
}

/** One key per book (a project, or a preset in one locale). */
export function coverTargetKey(target: CoverTarget): string {
  return target.kind === 'project' ? `project:${target.id}` : `preset:${presetCoverKey(target.id, target.locale)}`;
}

/** What the decisions read of the sandbox state. */
export interface CoverStateSlice {
  storeReady: boolean;
  booting: boolean;
  bookLoading: boolean;
  activeProjectId: string | null;
  activePresetId: string;
  presetApplied: { presetId: string; locale?: string } | null;
  projects: readonly { id: string; thumbnail?: unknown }[];
  presetSummaries: readonly { id: string; thumbnailUrl?: string }[];
  /** Generated preset covers by {@link presetCoverKey}. */
  presetCovers: Readonly<Record<string, string>>;
}

/** The book on screen, or null while none is settled (the store is not
 *  loaded yet, a book is being opened, or the preset on screen is not the
 *  one last applied). */
export function coverTargetOf(s: CoverStateSlice): CoverTarget | null {
  if (!s.storeReady || s.booting || s.bookLoading) return null;
  if (s.activeProjectId) return { kind: 'project', id: s.activeProjectId };
  if (!s.presetApplied || s.presetApplied.presetId !== s.activePresetId) return null;
  return { kind: 'preset', id: s.activePresetId, locale: s.presetApplied.locale ?? '' };
}

/** Whether the book already has a cover of any origin. An unknown project
 *  (just deleted) counts as covered: there is nothing to give one to. */
export function bookHasCover(s: CoverStateSlice, target: CoverTarget): boolean {
  if (target.kind === 'project') {
    const project = s.projects.find((p) => p.id === target.id);
    return !project || !!project.thumbnail;
  }
  const summary = s.presetSummaries.find((p) => p.id === target.id);
  if (!summary) return true;
  return !!summary.thumbnailUrl || s.presetCovers[presetCoverKey(target.id, target.locale)] !== undefined;
}

/** Books a cover was taken (or refused) for in this session, by
 *  {@link coverTargetKey}: a capture is not retried, and a cover the reader
 *  removes is not put back until a later visit. */
export const sessionCoverAttempts = new Set<string>();

/** The book whose cover should be taken now: the one on screen, when it
 *  has no cover and none was attempted for it in this session (a failed or
 *  refused capture is not retried until the next visit). */
export function coverToCapture(s: CoverStateSlice, attempted: ReadonlySet<string>): CoverTarget | null {
  const target = coverTargetOf(s);
  if (!target) return null;
  if (attempted.has(coverTargetKey(target))) return null;
  return bookHasCover(s, target) ? null : target;
}

/** A project's record patch that sets `thumbnail` only while the stored
 *  record has none — the reader may have picked one meanwhile. */
export function thumbnailIfMissing<T>(existing: { thumbnail?: unknown }, thumbnail: T): { thumbnail: T } | null {
  return existing.thumbnail ? null : { thumbnail };
}

/** The cover a preset row shows when the preset ships none: the generated
 *  one of `locale` (the language the row opens in), of the same language,
 *  or of any locale of the preset. */
export function presetCoverFor(covers: Readonly<Record<string, string>>, presetId: string, locale: string | null): string | undefined {
  if (locale !== null) {
    const exact = covers[presetCoverKey(presetId, locale)];
    if (exact) return exact;
  }
  const prefix = `${presetId}::`;
  let fallback: string | undefined;
  for (const [key, url] of Object.entries(covers)) {
    if (!key.startsWith(prefix)) continue;
    const l = key.slice(prefix.length);
    if (locale && l && sameContentLocale(l, locale)) return url;
    fallback ??= url;
  }
  return fallback;
}
