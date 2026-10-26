// What the Sandbox's tools work on, and the steps they share: wait for a
// change to land, find the chapter an agent names, lay a chapter out
// whatever tab is on screen. The tools themselves are in ./tools.

import type { PostextConfig, VDTDocument } from 'postext';
import type { SandboxAction, SandboxState, SandboxStore } from '../context/SandboxContext.js';
import type { BookPlan, Chapter } from '../book/types.js';
import { composeBookMemo } from '../book/compose.js';
import { layoutCacheKey } from '../book/layoutKeys.js';
import { chapterPageLabels } from '../book/pagination.js';
import { withHyphenationLocale } from '../controls/language/hyphenation.js';
import type { LayoutService } from '../worker/LayoutService.js';
import { ToolError } from './modelContext.js';
import { planContent } from '../book/jumps.js';

export interface SandboxToolHost {
  store: SandboxStore;
  layout: LayoutService;
  /** The 44 px targets switch (kept outside the sandbox state). */
  largeTargets: { get: () => boolean; set: (on: boolean) => void };
  /** How long a tool waits for the book to be laid out (see
   *  {@link SETTLE_TIMEOUT_MS}, the default). */
  settleTimeoutMs?: number;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** How long a tool waits for the book to be laid out before it answers
 *  with what there is. */
export const SETTLE_TIMEOUT_MS = 60_000;

/** Dispatch, then wait for the state to carry the change: the store's
 *  state is the last one rendered, a moment behind a dispatch. Resolves
 *  after `quietMs` when the action changed nothing. */
export async function dispatchAndWait(host: SandboxToolHost, actions: SandboxAction | readonly SandboxAction[], quietMs = 120): Promise<SandboxState> {
  const before = host.store.getSnapshot();
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      unsubscribe();
      clearTimeout(timer);
      resolve();
    };
    const unsubscribe = host.store.subscribe(() => {
      if (host.store.getSnapshot() !== before) finish();
    });
    const timer = setTimeout(finish, quietMs);
    for (const action of Array.isArray(actions) ? actions : [actions as SandboxAction]) host.store.dispatch(action);
  });
  return host.store.getSnapshot();
}

/** Whether nothing is on its way: the stored book loaded, no other book
 *  being opened, and every chapter paginated. */
export function isSettled(host: SandboxToolHost, state = host.store.getSnapshot()): boolean {
  if (!state.storeReady || state.booting || state.bookLoading) return false;
  if (state.projectStatus === 'busy' || state.presetStatus === 'loading') return false;
  return host.store.getPlan(state).pendingChapterId === null;
}

/** Resolves once {@link isSettled}, or after `timeoutMs` with false: the
 *  page counts of the chapters not laid out yet are then unknown. */
export async function whenSettled(host: SandboxToolHost, options: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<boolean> {
  const deadline = Date.now() + (options.timeoutMs ?? host.settleTimeoutMs ?? SETTLE_TIMEOUT_MS);
  // A change just dispatched may not have reached the state yet.
  await sleep(0);
  for (;;) {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (isSettled(host)) return true;
    if (Date.now() >= deadline) return false;
    await new Promise<void>((resolve) => {
      const unsubscribe = host.store.subscribe(() => { unsubscribe(); clearTimeout(timer); resolve(); });
      const timer = setTimeout(() => { unsubscribe(); resolve(); }, 250);
    });
  }
}

/** The chapter an agent names: its position in the book (from 1), its id
 *  or its title; the one on screen when none is named. */
export function chapterOf(state: SandboxState, ref: unknown): { chapter: Chapter; index: number } {
  const { chapters } = state;
  let index = -1;
  if (ref === undefined || ref === null || ref === '') index = chapters.findIndex((c) => c.id === state.activeChapterId);
  else if (typeof ref === 'number') index = Number.isInteger(ref) ? ref - 1 : -1;
  else if (typeof ref === 'string') {
    index = chapters.findIndex((c) => c.id === ref);
    if (index < 0 && /^\d+$/.test(ref.trim())) index = Number(ref) - 1;
    if (index < 0) {
      const wanted = ref.trim().toLowerCase();
      index = chapters.findIndex((c) => c.title.trim().toLowerCase() === wanted);
    }
  }
  const chapter = chapters[index];
  if (!chapter) {
    throw new ToolError(`No chapter ${JSON.stringify(ref)}. The book has ${chapters.length}: ${chapters.map((c, i) => `${i + 1}. ${c.title}`).join('; ')}.`);
  }
  return { chapter, index };
}

/** The configuration a layout runs with: the book's, with the interface
 *  language's hyphenation when the book names no language — what every
 *  viewer lays out with, so the worker's cache is shared. */
export function layoutConfig(state: SandboxState): PostextConfig {
  return withHyphenationLocale(state.config, state.locale);
}

let builds = 0;

export interface ChapterLayoutResult {
  doc: VDTDocument;
  /** The state the document was laid out from. */
  state: SandboxState;
  plan: BookPlan;
  /** False when the chapters before this one were not all paginated in
   *  time: its page numbers may then be off. */
  settled: boolean;
}

/** One chapter laid out for print, continued after the chapters before it
 *  — the document the Canvas shows for it, built here whatever tab is on
 *  screen (and at no cost when a viewer already built it: the worker
 *  keeps the last documents). */
export async function layOutChapter(host: SandboxToolHost, chapterId: string, signal?: AbortSignal): Promise<ChapterLayoutResult> {
  const settled = await whenSettled(host, { signal });
  const state = host.store.getSnapshot();
  const plan = host.store.getPlan(state);
  const chapterPlan = plan.byId[chapterId];
  if (!chapterPlan) throw new ToolError('That chapter is no longer in the book.');
  const config = layoutConfig(state);
  const book = composeBookMemo(state.chapters, chapterId);
  const clientId = `webmcp:${++builds}`;
  const cancel = () => host.layout.cancel(clientId);
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    const doc = await host.layout.build({
      clientId,
      priority: 'preview',
      content: {
        markdown: book.markdown,
        metadata: book.metadata,
        resources: state.resources,
        continuation: chapterPlan.continuation,
        ...planContent(chapterPlan),
      },
      config,
      cacheKey: layoutCacheKey({
        markdown: book.markdown,
        metadata: book.metadata,
        config,
        resources: state.resources,
        continuation: chapterPlan.continuation,
        continuationKey: chapterPlan.continuationKey,
        outlineKey: chapterPlan.outlineKey,
      }),
    });
    return { doc, state, plan, settled };
  } finally {
    signal?.removeEventListener('abort', cancel);
  }
}

/** The page of `doc` an agent names: `position` (from 1, in the chapter's
 *  pages) wins over `number` (the number the page carries). */
export function pageIndexOf(doc: VDTDocument, page: { position?: number; number?: number }, fallback = 0): number {
  if (page.position !== undefined) {
    if (page.position < 1 || page.position > doc.pages.length) {
      throw new ToolError(`The chapter has ${doc.pages.length} page(s); position ${page.position} is not one of them.`);
    }
    return page.position - 1;
  }
  if (page.number !== undefined) {
    const index = doc.pages.findIndex((p) => p.pageNumberValue === page.number);
    if (index < 0) {
      const first = doc.pages[0]!;
      const last = doc.pages[doc.pages.length - 1]!;
      throw new ToolError(`No page numbered ${page.number} in this chapter: its pages run from ${first.pageLabel} to ${last.pageLabel} (${doc.pages.length} page(s)). Name another chapter, or the page by its position.`);
    }
    return index;
  }
  return Math.max(0, Math.min(doc.pages.length - 1, fallback));
}

/** How the book stands, for the answer of a tool that changed it: the
 *  pages each chapter came to, so the effect of the change shows without
 *  another call. */
export function bookPagesSummary(host: SandboxToolHost, state = host.store.getSnapshot()): { pages: number | null; chapters: { chapter: number; title: string; pages: number | null; firstPage?: string; lastPage?: string }[] } {
  const plan = host.store.getPlan(state);
  let total: number | null = 0;
  const chapters = state.chapters.map((c, i) => {
    const layout = plan.byId[c.id]?.layout ?? null;
    const pages = plan.bookPages[c.id];
    if (!layout) total = null;
    else if (total !== null) total += layout.pageCount;
    return {
      chapter: i + 1,
      title: c.title,
      pages: layout?.pageCount ?? null,
      ...(pages ? { firstPage: chapterPageLabels(pages).from, lastPage: chapterPageLabels(pages).to } : {}),
    };
  });
  return { pages: total, chapters };
}
