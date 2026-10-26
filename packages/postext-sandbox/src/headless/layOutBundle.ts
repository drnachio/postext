// A `.postext` bundle laid out as the Sandbox lays it out, without the
// interface (#736): the bundle is opened and read with the functions the
// project import uses, its fonts are loaded and sent to the layout worker
// by the font loader, and every chapter is built through the layout
// service, each continuing the one before as the paginator chains them.
// `pnpm cookbook sandbox` runs it in a page, on the working tree, against
// every recipe bundle: four defects of 1.25 and 1.26 sat between a pen and
// its bundle in the Sandbox with every capture check green.
//
// It composes shared functions and has no logic of its own to drift from
// the provider's: where the provider does more (IndexedDB projects, layout
// records in state, viewers), nothing here stands in for it. Not exported
// from the package index.

import type { PostextConfig, PostextContent, VDTDocument } from 'postext';
import { createLayoutWorker, type LayoutWorkerHandle } from 'postext/worker';
import { composeBookMemo } from '../book/compose.js';
import { layoutCacheKey } from '../book/layoutKeys.js';
import { chapterLayoutFromDoc, createBookPlanner, sameChapterLayout } from '../book/pagination.js';
import type { ChapterLayout } from '../book/types.js';
import { withDefaultResourceTypes } from '../context/defaultConfig.js';
import {
  declareStandIns, ensureConfigFontsLoaded, fontLoaderState, getConfigFontFamilies, loadVerticalTwins, preloadConfigFonts, setCustomFonts,
  unansweredFontRequests,
} from '../controls/fonts/fontLoader.js';
import { withHyphenationLocale } from '../controls/language/hyphenation.js';
import { parseBundle } from '../presets/bundle.js';
import { openBundleZip } from '../presets/zip.js';
import { putFontFile } from '../storage/fontStorage.js';
import { projectFileId, projectFontFileId } from '../storage/projectFiles.js';
import { generateChapterId, generateProjectId } from '../storage/projects.js';
import { createLayoutService } from '../worker/LayoutService.js';
import { planContent } from '../book/jumps.js';

export interface LayOutBundleOptions {
  /** The interface language the Sandbox would open the bundle in: the
   *  bundle's edition, the resource types and the hyphenation patterns of
   *  a document that names no language follow it. */
  locale: string;
  /** The layout worker (`worker/layout.worker.ts`, built by the host). */
  worker?: Worker;
  /** A worker handle, in place of `worker` (a test's stub). */
  handle?: LayoutWorkerHandle;
  /** What identifies a chapter's layout, by the host's own measure. */
  layoutHash?: (doc: VDTDocument) => string;
  /** What identifies a chapter's lines whatever their boxes measure: the
   *  host compares it where the faces are another build of the family than
   *  the ones its own hash was taken with (#736). */
  linesHash?: (doc: VDTDocument) => string;
  /** A document's warnings as the host keys them; without it, their kinds. */
  warningsOf?: (doc: VDTDocument) => string[];
}

export interface LaidOutChapter {
  title: string;
  pages: number;
  hash?: string;
  lines?: string;
  warnings: string[];
}

/** The faces of one family: those the page's font set holds and those the
 *  worker was sent, each as "400 normal ×3" (files of one weight and
 *  slant, as a family cut by `unicode-range` has them). */
export interface FamilyFaces {
  page: string[];
  worker: string[];
}

export interface LaidOutBundle {
  /** The language the bundle was read in (`LoadedPreset.locale`). */
  locale: string;
  chapters: LaidOutChapter[];
  /** False when the plan did not settle (a chapter kept being asked for). */
  settled: boolean;
  /** How many builds the layout service ran. */
  builds: number;
  fonts: Record<string, FamilyFaces>;
  /** The font requests the network did not answer (an error, a request
   *  given up): the layout is then one without those files, not the
   *  book's. */
  unanswered: string[];
}

/** "400 normal ×3", in the order first seen. */
function counted(faces: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const face of faces) counts.set(face, (counts.get(face) ?? 0) + 1);
  return [...counts].map(([face, n]) => (n > 1 ? `${face} ×${n}` : face));
}

const unquoted = (family: string) => family.replace(/^['"]|['"]$/g, '');

/** The faces of `families` in the page's font set, with what did not load. */
function pageFaces(families: readonly string[]): Map<string, string[]> {
  const out = new Map<string, string[]>(families.map((f) => [f, []]));
  if (typeof document === 'undefined' || !document.fonts) return out;
  for (const face of document.fonts) {
    const list = out.get(unquoted(face.family));
    if (list) list.push(`${face.weight} ${face.style}${face.status === 'loaded' ? '' : ` (${face.status})`}`);
  }
  return out;
}

/**
 * Open `bytes` as the Sandbox opens a bundle and lay every chapter out
 * through the layout service. The steps, each the provider's own:
 *
 *  1. `openBundleZip` and `parseBundle`, with the ids a project import
 *     gives the files (`context/projectActions.ts` `importBundleBytes`);
 *  2. the bundle's font files stored, then `setCustomFonts` (`applyRecord`);
 *  3. `preloadConfigFonts`, `ensureConfigFontsLoaded`, `loadVerticalTwins`
 *     and `declareStandIns`, the font steps of a preview before its build;
 *  4. the book planned (`createBookPlanner`) and its pending chapter built
 *     with the configuration `withHyphenationLocale` gives, until none is
 *     pending (`viewport/ChapterPaginator.tsx`).
 *
 * The layout records a bundle ships (`layouts.json`) are not taken: every
 * chapter goes through the worker, which is what there is to check.
 */
/** Where the layout under way stands (#757): the step of this entry, the
 *  loader's requests, the layout service and the worker's messages. A
 *  check that waited in vain asks for it (`pnpm cookbook sandbox`). */
export function layOutState(): unknown {
  return { step: stepNow.step, sinceMs: Date.now() - stepNow.at, loader: fontLoaderState(), service: serviceNow?.state?.() ?? null, worker: { ...workerNow, lastAgoMs: workerNow.lastAt ? Date.now() - workerNow.lastAt : null } };
}

let stepNow = { step: 'not started', at: Date.now() };
let serviceNow: { state?(): unknown } | null = null;
const workerNow = { posted: 0, received: 0, last: '', lastAgoMs: null as number | null, errors: [] as string[], lastAt: 0 };
const step = (name: string): void => { stepNow = { step: name, at: Date.now() }; };

export async function layOutBundle(bytes: Uint8Array, options: LayOutBundleOptions): Promise<LaidOutBundle> {
  const { locale } = options;
  step('opening the bundle');
  // What the worker is told and what it says, counted.
  if (options.worker) {
    const raw = options.worker;
    const post = raw.postMessage.bind(raw) as (message: unknown, transfer?: Transferable[]) => void;
    raw.postMessage = ((message: unknown, transfer?: Transferable[]) => {
      workerNow.posted++;
      return transfer ? post(message, transfer) : post(message);
    }) as Worker['postMessage'];
    raw.addEventListener('message', (event: MessageEvent<{ kind?: string; id?: number }>) => {
      workerNow.received++;
      workerNow.last = `${event.data?.kind ?? '?'} #${event.data?.id ?? '?'}`;
      workerNow.lastAt = Date.now();
    });
    raw.addEventListener('error', (event) => { workerNow.errors.push(String(event.message ?? 'error')); });
    raw.addEventListener('messageerror', () => { workerNow.errors.push('messageerror'); });
  }
  const projectId = generateProjectId();
  const opened = openBundleZip(bytes);
  const manifestId = (opened.manifest as { id?: unknown } | null)?.id;
  const summaryId = typeof manifestId === 'string' ? manifestId : 'bundle';
  const loaded = await parseBundle(opened.manifest, opened.readFile, {
    locale,
    summary: { id: summaryId, name: summaryId, source: 'private', available: true },
    ids: { blob: (file) => projectFileId(projectId, file), font: (file) => projectFontFileId(projectId, file) },
    chapterIds: generateChapterId,
  });
  // The custom faces are read from the font store, by the page and for the worker.
  step('storing the bundle\'s font files');
  await Promise.all(loaded.fonts.map((file) => putFontFile(file)));
  const config: PostextConfig = withDefaultResourceTypes(loaded.config, locale);
  setCustomFonts(config.customFonts, { newBook: true });

  const { chapters, resources } = loaded;
  const texts = chapters.map((c) => c.markdown);
  const effective = withHyphenationLocale(config, locale);
  step('preloadConfigFonts');
  await preloadConfigFonts(config);
  step('ensureConfigFontsLoaded');
  await ensureConfigFontsLoaded(effective, texts);
  step('loadVerticalTwins');
  await loadVerticalTwins(effective, texts);
  step('declareStandIns');
  await declareStandIns(effective, texts);
  step('the layout service');

  // The worker's faces, read before they are handed over (the buffers are
  // transferred).
  const sent = new Map<string, string[]>();
  const inner = options.handle ?? createLayoutWorker(options.worker ? { worker: options.worker } : {});
  const handle: LayoutWorkerHandle = {
    ...inner,
    registerFonts: (faces) => {
      for (const face of faces) {
        const list = sent.get(face.family) ?? [];
        list.push(`${face.weight} ${face.style ?? 'normal'}`);
        sent.set(face.family, list);
      }
      return inner.registerFonts(faces);
    },
    unregisterFonts: (families) => inner.unregisterFonts(families),
    build: (content, cfg, opts) => inner.build(content, cfg, opts),
    warm: (content, cfg, opts) => inner.warm(content, cfg, opts),
    dispose: () => inner.dispose(),
  };
  // Nobody watches a first layout here: the one with every face is waited
  // for, as long as the requests themselves are (#757).
  const service = createLayoutService({ handle, fontCeilingMs: Infinity });
  serviceNow = service;
  const planner = createBookPlanner();
  const layouts: Record<string, ChapterLayout> = {};
  const docs = new Map<string, VDTDocument>();
  let builds = 0;
  let settled = false;
  try {
    // A chapter is built again when the ones before it change its start or
    // the book's outline: a few rounds per chapter at most.
    const limit = chapters.length * 6 + 4;
    for (let round = 0; round < limit; round++) {
      const plan = planner.plan(chapters, config, resources, layouts, loaded.start);
      const id = plan.pendingChapterId;
      if (id === null) {
        settled = true;
        break;
      }
      const chapterPlan = plan.byId[id];
      const target = chapters.find((c) => c.id === id);
      if (!chapterPlan || !target) break;
      const book = composeBookMemo(chapters, id);
      const content: PostextContent = {
        markdown: book.markdown, metadata: book.metadata, resources,
        continuation: chapterPlan.continuation, ...planContent(chapterPlan),
      };
      step(`build ${builds + 1}, chapter ${chapters.findIndex((c) => c.id === id) + 1} of ${chapters.length}`);
      const doc = await service.build({
        clientId: 'headless', priority: 'background', content, config: effective,
        cacheKey: layoutCacheKey({
          markdown: book.markdown, metadata: book.metadata, config: effective, resources,
          continuation: chapterPlan.continuation, continuationKey: chapterPlan.continuationKey, outlineKey: chapterPlan.outlineKey,
        }),
      });
      builds++;
      docs.set(id, doc);
      const layout = chapterLayoutFromDoc(doc, chapterPlan, { markdown: target.markdown, config, resources });
      // No record, or the record there already: the plan would ask again.
      if (!layout || (layouts[id] && sameChapterLayout(layouts[id], layout))) break;
      layouts[id] = layout;
    }
  } finally {
    service.dispose();
  }

  const families = getConfigFontFamilies(effective, texts);
  const onPage = pageFaces(families);
  const fonts: Record<string, FamilyFaces> = {};
  for (const family of families) fonts[family] = { page: counted(onPage.get(family) ?? []), worker: counted(sent.get(family) ?? []) };
  const kinds = (doc: VDTDocument) => [
    ...(doc.contentWarnings ?? []).map((w) => w.kind),
    ...(doc.warnings ?? []).map((w) => w.kind),
    ...(doc.configWarnings ?? []).map((w) => w.kind),
  ];
  return {
    locale: loaded.locale,
    settled: settled && chapters.every((c) => docs.has(c.id)),
    unanswered: unansweredFontRequests(),
    builds,
    fonts,
    chapters: chapters.filter((c) => docs.has(c.id)).map((c) => {
      const doc = docs.get(c.id)!;
      return {
        title: c.title,
        pages: doc.pages.length,
        ...(options.layoutHash ? { hash: options.layoutHash(doc) } : {}),
        ...(options.linesHash ? { lines: options.linesHash(doc) } : {}),
        warnings: options.warningsOf ? options.warningsOf(doc) : kinds(doc),
      };
    }),
  };
}
