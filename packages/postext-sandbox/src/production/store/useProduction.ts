'use client';

// The book's production as the Cover panel and the cover designer both use
// it: the stored record, kept current and saved on change; the user's
// profiles; and what the active version makes (its sheets), worked out
// from the book's pages, paper and binding.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MirrorPicture, ProductionVersion, Resource, VersionSheets } from 'postext';
import { useBookPlan, useSandboxSelector } from '../../context/SandboxContext.js';
import { bookMetadata } from '../../book/compose.js';
import { WORKING_BOOK, emptyProduction, planPageCount, sheetsOf, type BookProduction } from '../model/bookProduction.js';
import { getBookProduction, getCoverGallery, listCollections, listLogos, listProfiles, listTemplates, onProductionChange, putBookProduction, putCoverGallery, type StoredProfile } from './productionStore.js';
import { emptyGallery, type CoverGallery } from '../library/coverGallery.js';
import type { CollectionRecord } from '../library/collections.js';
import type { CoverTemplate } from '../model/coverTemplates.js';
import type { LogoRecord } from '../library/logoLibrary.js';
import { loadMirrorPictures } from '../library/coverImages.js';
import type { CoverDesignSettings } from '../model/bookProduction.js';

/** The book's production record, kept current and saved on change. A
 *  record another view saved is read again, unless this one has a change
 *  of its own waiting to be saved. */
export function useBookProduction(projectId: string): [BookProduction | null, (next: BookProduction) => void] {
  const [record, setRecord] = useState<BookProduction | null>(null);
  // Texts are saved a moment after typing stops; the rest at once.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    let alive = true;
    setRecord(null);
    const load = () => {
      if (timer.current) return;
      getBookProduction(projectId).then(
        (r) => { if (alive && !timer.current) setRecord(r ?? emptyProduction(projectId)); },
        () => { if (alive && !timer.current) setRecord((prev) => prev ?? emptyProduction(projectId)); },
      );
    };
    load();
    const off = onProductionChange(load);
    return () => { alive = false; off(); };
  }, [projectId]);
  const update = useCallback((next: BookProduction) => {
    setRecord(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void putBookProduction(next).catch(() => undefined);
    }, 400);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return [record, update];
}

export function useProfiles(): StoredProfile[] {
  const [list, setList] = useState<StoredProfile[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () => { listProfiles().then((l) => { if (alive) setList(l); }, () => undefined); };
    load();
    const off = onProductionChange(load);
    return () => { alive = false; off(); };
  }, []);
  return list;
}

/** The user's cover templates, kept current. */
export function useCoverTemplates(): CoverTemplate[] {
  const [list, setList] = useState<CoverTemplate[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () => { listTemplates().then((l) => { if (alive) setList(l); }, () => undefined); };
    load();
    const off = onProductionChange(load);
    return () => { alive = false; off(); };
  }, []);
  return list;
}

/** The user's collections, kept current. */
export function useCollections(): CollectionRecord[] {
  const [list, setList] = useState<CollectionRecord[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () => { listCollections().then((l) => { if (alive) setList(l); }, () => undefined); };
    load();
    const off = onProductionChange(load);
    return () => { alive = false; off(); };
  }, []);
  return list;
}

/** The user's logo library, kept current. */
export function useLogos(): LogoRecord[] {
  const [list, setList] = useState<LogoRecord[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () => { listLogos().then((l) => { if (alive) setList(l); }, () => undefined); };
    load();
    const off = onProductionChange(load);
    return () => { alive = false; off(); };
  }, []);
  return list;
}

/** The active book's cover gallery, kept current, and how to change it. */
export function useCoverGallery(): [CoverGallery, (next: CoverGallery) => void] {
  const activeProjectId = useSandboxSelector((s) => s.activeProjectId);
  const projectId = activeProjectId ?? WORKING_BOOK;
  const [gallery, setGallery] = useState<CoverGallery>(() => emptyGallery(projectId));
  useEffect(() => {
    let alive = true;
    const load = () => { getCoverGallery(projectId).then((g) => { if (alive) setGallery(g ?? emptyGallery(projectId)); }, () => undefined); };
    load();
    const off = onProductionChange(load);
    return () => { alive = false; off(); };
  }, [projectId]);
  const update = useCallback((next: CoverGallery) => {
    setGallery(next);
    void putCoverGallery(next);
  }, []);
  return [gallery, update];
}

/** The mirror bleed of a cover: its design margin (the version's, from
 *  its sheets' measures) and the pictures it draws, loaded once per set
 *  of pictures. Undefined without a margin. */
export function useMirror(
  design: CoverDesignSettings | undefined,
  resources: readonly Resource[],
  margin: number | undefined,
  gallery?: CoverGallery,
): { margin: number; pictures: Readonly<Record<string, MirrorPicture>> } | undefined {
  const [pictures, setPictures] = useState<Record<string, MirrorPicture>>({});
  const key = [design?.image?.resourceId, ...(design?.elements ?? []).map((e) => e.resourceId), ...(design?.effects ?? []).filter((e) => e.clip).map((e) => e.resourceId)].join('|');
  const latest = useRef(design);
  latest.current = design;
  useEffect(() => {
    let alive = true;
    loadMirrorPictures(latest.current, resources, gallery).then((p) => { if (alive) setPictures(p); }, () => undefined);
    return () => { alive = false; };
  }, [key, resources, gallery]);
  return useMemo(() => (margin !== undefined ? { margin, pictures } : undefined), [margin, pictures]);
}

const isSheets = (s: ReturnType<typeof sheetsOf>): s is VersionSheets => 'cover' in s;

/** The active version of the book's production and its sheets, null until
 *  the book is laid out whole and has a version on a profile that exists. */
export function useCoverWorkspace(): {
  record: BookProduction | null;
  update: (next: BookProduction) => void;
  version: ProductionVersion | undefined;
  sheets: VersionSheets | null;
  title: string;
} {
  const config = useSandboxSelector((s) => s.config);
  const activeProjectId = useSandboxSelector((s) => s.activeProjectId);
  const projects = useSandboxSelector((s) => s.projects);
  const chapters = useSandboxSelector((s) => s.chapters);
  const plan = useBookPlan();
  const [record, update] = useBookProduction(activeProjectId ?? WORKING_BOOK);
  const stored = useProfiles();
  const bindings = useMemo(() => stored.flatMap((p) => (p.kind === 'binding' ? [p.profile] : [])), [stored]);
  const papers = useMemo(() => stored.flatMap((p) => (p.kind === 'paper' ? [p.profile] : [])), [stored]);
  const complete = plan.chapters.length > 0 && plan.chapters.every((c) => plan.bookPages[c.chapterId]);
  const pages = planPageCount(plan.bookPages);
  const versions = record?.versions ?? [];
  const version = versions.find((v) => v.id === record?.activeVersionId) ?? versions[0];
  const sheets = useMemo(() => {
    if (!version || pages <= 0 || !complete) return null;
    const s = sheetsOf(version, config, pages, bindings, { setting: record?.paper, library: papers });
    return isSheets(s) ? s : null;
  }, [version, config, pages, bindings, complete, record?.paper, papers]);
  const metadata = useMemo(() => bookMetadata(chapters) as Record<string, unknown>, [chapters]);
  const metaTitle = typeof metadata.title === 'string' ? metadata.title.trim() : '';
  const title = projects.find((p) => p.id === activeProjectId)?.name ?? (metaTitle || 'book');
  return { record, update, version, sheets, title };
}
