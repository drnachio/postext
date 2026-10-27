// The provider's warnings and plan sources and the live state its
// subscribers read (#1276: split out of SandboxContext.tsx).
import { useRef, useEffect } from 'react';
import type { VDTDocument } from 'postext';
import type { ComposedBook, BookPlan } from '../../book/types.js';
import type { ChapterDocument } from './hooks.js';
import type { Warning } from '../../warnings/types.js';
import type { SandboxState } from './state.js';
import { pdfFontChecks, pdfFontChecksFor, onPdfFontChecksChange } from '../../controls/fonts/pdfFontWarnings.js';
import { preflightInputsVersion, preflightInputs, onPreflightInputsChange } from '../../print/preflightInputs.js';
import { composeBookMemo } from '../../book/compose.js';
import { publishContrast } from '../../contrast/contrastStore.js';
import { computeWarnings } from '../../warnings/compute.js';
import { hasIndexedDB } from '../../storage/blobStore.js';
import { unavailableResourceImages, svgFontIssues, onUnavailableResourceImagesChange, onSvgFontReportsChange } from '../../controls/media/resourceImages.js';
import { createBookPlanner } from '../../book/pagination.js';
import { WARNINGS_DEBOUNCE_MS } from './timings.js';

/** What useWarningsSource takes from the sandbox provider. */
export interface UseWarningsSourceDeps {
  state: SandboxState;
}

export function useWarningsSource(deps: UseWarningsSourceDeps) {
  const {
    state
  } = deps;
  const editorStatesRef = useRef<Map<string, unknown>>(new Map());
  const docRef = useRef<VDTDocument | null>(null);
  const docSourceRef = useRef<ComposedBook | null>(null);
  const chapterDocsRef = useRef<Map<string, ChapterDocument>>(new Map());
  const warningsCacheRef = useRef<{ key: unknown[]; value: Warning[] } | null>(null);
  /** Bumped whenever the set of unreadable image payloads changes (the
   *  previews decode them after the layout), or a PDF generation brings
   *  its font warnings: part of the warnings key. */
  const imageStatusRef = useRef(0);
  const getWarnings = (s: SandboxState): Warning[] => {
    const key = [s.chapters, s.activeChapterId, s.config, s.resources, s.docVersion, s.canvasScope, s.activeViewport, imageStatusRef.current, pdfFontChecks(), s.bookVersion, s.pdfScope, preflightInputsVersion()];
    const cached = warningsCacheRef.current;
    if (cached && cached.key.every((k, i) => k === key[i])) return cached.value;
    const chapterBook = composeBookMemo(s.chapters, s.activeChapterId);
    // Warnings are the active chapter's. With the canvas (or the folio)
    // showing the whole book, the stitched document in `docRef` spans
    // every chapter; the chapter's own document (chapter offsets, like
    // `book`) is read instead — or none, while it has not been laid out.
    // The HTML preview lays the whole book out as one document with book
    // offsets: its own composition is read then, and the other chapters'
    // warnings dropped. The EPUB tab reads like the PDF tab: both build the
    // book's print chain on request and publish no preview document, so
    // the warnings stay the active chapter's, from the last preview built.
    const stitched = s.canvasScope === 'book' && (s.activeViewport === 'canvas' || s.activeViewport === 'folio');
    const wholeSource = s.canvasScope === 'book' && s.activeViewport === 'html' ? docSourceRef.current : null;
    const whole = wholeSource !== null && wholeSource.scope === 'book' ? wholeSource : null;
    const book = whole ?? chapterBook;
    const doc = stitched ? chapterDocsRef.current.get(s.activeChapterId)?.doc ?? null : docRef.current;
    const fontChecks = pdfFontChecksFor(s);
    const preflight = preflightInputs(s.config.print, s.resources);
    // The colour fields show their contrast against every page laid out
    // so far, not the active chapter's alone (#748).
    const laidOut = new Set<VDTDocument>([...(doc ? [doc] : []), ...[...chapterDocsRef.current.values()].map((c) => c.doc)]);
    publishContrast([...laidOut], s.config, preflight.transform);
    const all = computeWarnings({
      markdown: book.markdown,
      config: s.config,
      doc: wholeSource !== null && whole === null ? null : doc,
      resources: s.resources,
      storageUnavailable: !hasIndexedDB(),
      unavailableImages: unavailableResourceImages(),
      svgFontIssues: svgFontIssues(),
      book,
      chapterTitles: new Map(s.chapters.map((c) => [c.id, c.title])),
      // Another book's are dropped; after an edit they are marked stale.
      pdfFontChecks: fontChecks.checks,
      pdfFontChecksStale: fontChecks.stale,
      preflight,
    });
    const value = whole ? all.filter((w) => w.chapterId === undefined || w.chapterId === s.activeChapterId) : all;
    warningsCacheRef.current = { key, value };
    return value;
  };
  const getWarningsRef = useRef(getWarnings);
  getWarningsRef.current = getWarnings;
  const plannerRef = useRef(createBookPlanner());
  const planCacheRef = useRef<{ key: unknown[]; value: BookPlan } | null>(null);
  const getPlan = (s: SandboxState): BookPlan => {
    const key = [s.chapters, s.config, s.resources, s.chapterLayouts, s.bookStart];
    const cached = planCacheRef.current;
    if (cached && cached.key.every((k, i) => k === key[i])) return cached.value;
    const value = plannerRef.current.plan(s.chapters, s.config, s.resources, s.chapterLayouts, s.bookStart);
    planCacheRef.current = { key, value };
    return value;
  };
  const getPlanRef = useRef(getPlan);
  getPlanRef.current = getPlan;

  // Subscription plumbing: hold the live state in a ref and notify
  // subscribers when it changes. Lets hooks below subscribe to specific
  // slices via useSyncExternalStore without re-rendering on unrelated
  // state changes.
  const stateRef = useRef(state);
  const listenersRef = useRef<Set<() => void>>(new Set());
  stateRef.current = state;

  useEffect(() => {
    // Fire after commit so subscribers see the committed state.
    for (const cb of listenersRef.current) cb();
  }, [state]);

  // Warnings parse the active chapter and walk the built document: not
  // on every keystroke, but once the inputs have settled.
  const warningsRef = useRef<Warning[]>([]);
  const { chapters: warnChapters, activeChapterId: warnChapterId, config: warnConfig, resources: warnResources, docVersion: warnDocVersion, bookVersion: warnBookVersion, pdfScope: warnPdfScope } = state;
  useEffect(() => {
    const timer = setTimeout(() => {
      warningsRef.current = getWarningsRef.current(stateRef.current);
      for (const cb of listenersRef.current) cb();
    }, WARNINGS_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [warnChapters, warnChapterId, warnConfig, warnResources, warnDocVersion, warnBookVersion, warnPdfScope]);

  // An image payload found missing or undecodable (or readable again) after
  // the previews decoded it: list the change without waiting for an edit.
  // A PDF generated with characters its fonts lack (and the like) lists
  // them the same way.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      imageStatusRef.current++;
      clearTimeout(timer);
      timer = setTimeout(() => {
        warningsRef.current = getWarningsRef.current(stateRef.current);
        for (const cb of listenersRef.current) cb();
      }, WARNINGS_DEBOUNCE_MS);
    };
    const offImages = onUnavailableResourceImagesChange(refresh);
    const offSvgFonts = onSvgFontReportsChange(refresh);
    const offPdf = onPdfFontChecksChange(refresh);
    const offPreflight = onPreflightInputsChange(refresh);
    return () => {
      offImages();
      offSvgFonts();
      offPdf();
      offPreflight();
      clearTimeout(timer);
    };
  }, []);
  return {
    editorStatesRef, docRef, docSourceRef, chapterDocsRef, getWarningsRef, getPlan, getPlanRef,
    stateRef, listenersRef, warningsRef
  };
}
