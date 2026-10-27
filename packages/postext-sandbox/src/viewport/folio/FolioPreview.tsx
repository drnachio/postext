'use client';

import { forwardRef, useRef, useMemo, useState, useEffect, useDeferredValue, useImperativeHandle } from 'react';
import { type FolioInteraction, type FolioDocumentViewer, type FolioLabels, createFolioFromDocument } from 'postext-folio';
import { type PostextConfig, type VDTDocument, watchFonts, onFontsChanged, resolveDiagramStyleConfig, resolveColorValue, resolveDebugConfig } from 'postext';
import { useSandboxDispatch, useSandboxSelector, useSandboxDocRef, useSandboxDocSourceRef, useSandboxChapterDocsRef, useLayoutSource, useBookPlan } from '../../context/SandboxContext.js';
import { type HeldChapterDoc } from '../../book/buildBook.js';
import { leadingBlankPageCount } from '../../book/pagination.js';
import { type StitchedBook } from '../../book/stitch.js';
import { createFontGate } from '../../controls/fonts/fontLoader.js';
import { ensureResourceImages, ensureResourceVideoUrls, getResourceVideoUrl } from '../../controls/media/resourceImages.js';
import { getBlob } from '../../storage/blobStore.js';
import { usePrintSetup, printsGrayscale, previewFor } from '../../print/printSetup.js';
import { usePrintPreview } from '../../print/printPreviewToggle.js';
import { useLayoutWorker } from '../../worker/useLayoutWorker.js';
import { onLateFonts } from '../../worker/LayoutService.js';
import { useCompactLayout } from '../../hooks/useCompactLayout.js';
import { defaultDocumentLocale } from '../canvas/CanvasPreview/layoutUtils.js';
import type { BookPageMap } from '../usePageHashSync.js';
import { FolioLoading } from './FolioLoading.js';
import { useFolioSelection } from './useFolioSelection.js';
import { type PreviewVideo, type VideoPick, type PreviewVideoResult, pickVideo } from '../viewerVideos.js';
import { type ShownDoc, playableVideos, videoKey, PROOF_PAPER, fill, FOLIO_TEXTURES, samePage } from './FolioPreview/pages.js';
import { useFolioBuild } from './FolioPreview/useFolioBuild.js';

interface FolioPreviewProps {
  /** What the left button does on the book. */
  interaction?: FolioInteraction;
  onGeneratingChange?: (generating: boolean) => void;
  /** After every layout: the page count, the first page with content, the
   *  book page number of every page and, for the whole book, the chapter
   *  of every page. */
  onPageCountChange?: (count: number, firstContentPage: number, pageNumbers: readonly number[], book?: BookPageMap) => void;
  onCurrentPageChange?: (index: number) => void;
  /** The pages of the spread the book is sent to (as soon as it is sent,
   *  and again once its leaves have landed). */
  onSpreadChange?: (pages: readonly number[]) => void;
  /** Whether the book is bound on the right (its leaves turn leftward). */
  onBindingChange?: (rightToLeft: boolean) => void;
}

export interface FolioPreviewHandle {
  jumpToPage: (pageIndex: number) => void;
  /** Turns the book to the spread holding page `pageIndex`: leaf by leaf
   *  to a near one, the whole block of leaves in one move to a far one. */
  turnToPage: (pageIndex: number) => void;
  prev: () => void;
  next: () => void;
  /** Eases the view back to the one the settings give. */
  resetView: () => void;
  /** The view as it is seen now, in degrees; null without the 3D book. */
  getView: () => { tilt: number; yaw: number } | null;
  regenerate: () => void;
  /** Holds the magnifying glass over the middle of the open spread at
   *  `zoom` times (the viewer goes to its magnify mode, which the glass
   *  belongs to), or puts it away with null. */
  setMagnification: (zoom: number | null) => void;
  /** How many times the glass magnifies while it is held over the book;
   *  null while it is put away. */
  getMagnification: () => number | null;
  /** The self-hosted videos of the spread on show. */
  videos: () => PreviewVideo[];
  /** Plays a video of the spread on show, as a click on it does; one
   *  already playing is left to play. */
  playVideo: (pick: VideoPick) => PreviewVideoResult;
  stopVideo: () => void;
}

/**
 * The book in 3D (`postext-folio`): the print layout the canvas shows —
 * the active chapter after the chapters before it, or under `canvasScope:
 * 'book'` every chapter stitched into one document — laid on a desk in
 * spreads, its leaves turned by hand. Pages are painted at the size they
 * are shown, only around the open spread.
 */
export const FolioPreview = forwardRef<FolioPreviewHandle, FolioPreviewProps>(function FolioPreview({ interaction = 'hand', onGeneratingChange, onPageCountChange, onCurrentPageChange, onSpreadChange, onBindingChange }, ref) {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxSelector((s) => s.labels);
  const sharedDocRef = useSandboxDocRef();
  const sharedDocSourceRef = useSandboxDocSourceRef();
  const chapterDocsRef = useSandboxChapterDocsRef();
  const layoutSource = useLayoutSource();
  const config = useSandboxSelector((s) => s.config);
  // How the book is presented (paper, binding, desk, light): handed to the
  // viewer as it changes, never laid out.
  const folioConfig = config.folio;
  const folioConfigRef = useRef(folioConfig);
  const resources = useSandboxSelector((s) => s.resources);
  // The picture on the spine (none on a saddle stitch or a folded
  // newspaper): its stored image, handed to the viewer as an object URL.
  const bindingType = folioConfig?.binding?.type;
  const spineId = bindingType === 'saddleStitch' || bindingType === 'folded' ? undefined : folioConfig?.binding?.spineImage;
  const spineFileId = useMemo(() => {
    const r = spineId ? resources.find((x) => x.id === spineId) : undefined;
    return r?.bitmap?.fileId ?? r?.svg?.fileId;
  }, [resources, spineId]);
  const [spine, setSpine] = useState<{ fileId: string; url?: string } | null>(null);
  const spineUrl = spine?.fileId === spineFileId ? spine?.url : undefined;
  const spineUrlRef = useRef(spineUrl);
  spineUrlRef.current = spineUrl;
  // The picture of the spine is read (or found missing): a new viewer
  // waits for it rather than binding the book without it.
  const spineReady = !spineFileId || spine?.fileId === spineFileId;
  useEffect(() => {
    if (!spineFileId) {
      setSpine(null);
      return;
    }
    let live = true;
    let url: string | undefined;
    void getBlob(spineFileId).then((rec) => {
      if (!live) return;
      if (rec) url = URL.createObjectURL(new Blob([rec.bytes], { type: rec.contentType }));
      setSpine({ fileId: spineFileId, url });
    }, () => {
      if (live) setSpine({ fileId: spineFileId });
    });
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [spineFileId]);
  const locale = useSandboxSelector((s) => s.locale);
  const canvasScope = useSandboxSelector((s) => s.canvasScope);
  const chapters = useSandboxSelector((s) => s.chapters);
  const chaptersRef = useRef(chapters);
  chaptersRef.current = chapters;
  // The book open in the sandbox: bumped when another one is opened (a
  // whole new book), with its settings in the same commit.
  const bookVersion = useSandboxSelector((s) => s.bookVersion);
  const bookVersionRef = useRef(bookVersion);
  bookVersionRef.current = bookVersion;
  const deferredBookVersion = useDeferredValue(bookVersion);
  const compact = useCompactLayout();
  const plan = useBookPlan();
  const planRef = useRef(plan);
  planRef.current = plan;
  const planKey = useMemo(
    () => plan.chapters.map((p) => `${p.chapterId}|${p.paginated ? 1 : 0}|${p.continuationKey}|${p.outlineKey}|${p.continuation?.pageIndexOffset ?? ''}|${p.continuation?.pageNumbering?.startAt ?? ''}|${p.continuation?.bookPageCount ?? ''}`).join('\n'),
    [plan],
  );
  const bookSource = useMemo(() => (canvasScope === 'book' ? { chapters, planKey } : null), [canvasScope, chapters, planKey]);
  const deferredBookSource = useDeferredValue(bookSource);
  const deferredSource = useDeferredValue(layoutSource);
  const deferredResources = useDeferredValue(resources);
  const rawDeferredConfig = useDeferredValue(config);
  // The document's language when it names none: the app's (as on the canvas).
  const deferredConfig = useMemo((): PostextConfig => {
    if (rawDeferredConfig.bodyText?.hyphenation?.locale || rawDeferredConfig.locale) return rawDeferredConfig;
    return {
      ...rawDeferredConfig,
      bodyText: {
        ...rawDeferredConfig.bodyText,
        hyphenation: { ...rawDeferredConfig.bodyText?.hyphenation, locale: defaultDocumentLocale(locale) },
      },
    };
  }, [rawDeferredConfig, locale]);
  const layoutWorker = useLayoutWorker('preview');
  const [rebuildKey, setRebuildKey] = useState(0);
  const [fontGate] = useState(createFontGate);
  const [shownDoc, setDoc] = useState<ShownDoc | null>(null);
  const viewerDocRef = useRef<ShownDoc | null>(null);
  const [paintKey, setPaintKey] = useState(0);
  const heldDocsRef = useRef<Map<string, HeldChapterDoc>>(new Map());
  const stitchedRef = useRef<StitchedBook | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<FolioDocumentViewer | null>(null);
  const pendingJumpRef = useRef<number | null>(null);
  const paintedKeyRef = useRef(paintKey);
  const [opened, setOpened] = useState(false);
  const interactionRef = useRef(interaction);
  interactionRef.current = interaction;
  // The document the viewer shows, for the page interaction.
  const viewerVdtRef = useRef<VDTDocument | null>(null);
  viewerVdtRef.current = shownDoc?.doc ?? null;
  const selection = useFolioSelection({
    viewerRef,
    docRef: viewerVdtRef,
    stitchedRef,
    chapterDocsRef,
    sourceRef: sharedDocSourceRef,
    interactionRef,
    docKey: shownDoc,
  });
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  // The videos playing or paused on the pages, as the viewer reports them.
  const videoStatesRef = useRef(new Map<string, 'playing' | 'paused'>());
  const callbacksRef = useRef({ onGeneratingChange, onPageCountChange, onCurrentPageChange, onSpreadChange, onBindingChange });
  callbacksRef.current = { onGeneratingChange, onPageCountChange, onCurrentPageChange, onSpreadChange, onBindingChange };

  useImperativeHandle(ref, () => ({
    jumpToPage: (pageIndex) => {
      // A restored or linked position opens there; the reader turns pages.
      if (viewerRef.current) viewerRef.current.goToPage(pageIndex, { instant: true });
      else pendingJumpRef.current = pageIndex;
    },
    turnToPage: (pageIndex) => {
      const viewer = viewerRef.current;
      if (!viewer) {
        pendingJumpRef.current = pageIndex;
        return;
      }
      viewer.goToPage(pageIndex);
    },
    prev: () => viewerRef.current?.prev(),
    next: () => viewerRef.current?.next(),
    resetView: () => viewerRef.current?.resetView(),
    getView: () => viewerRef.current?.getView() ?? null,
    regenerate: () => setRebuildKey((k) => k + 1),
    setMagnification: (zoom) => {
      const viewer = viewerRef.current;
      if (!viewer) return;
      if (zoom === null) {
        viewer.holdMagnifier(false);
        return;
      }
      // The tab's own mode follows (its effect then finds the viewer there).
      viewer.setInteraction('magnify');
      viewer.setMagnification(zoom);
      viewer.holdMagnifier(true);
    },
    getMagnification: () => {
      const glass = viewerRef.current?.getMagnifier();
      return glass?.held ? glass.zoom : null;
    },
    videos: () => {
      const viewer = viewerRef.current;
      const doc = viewerVdtRef.current;
      if (!viewer || !doc) return [];
      return viewer.state.pages.flatMap((i) => playableVideos(doc, i)).map((v) => ({
        resource: v.resource,
        pageIndex: v.pageIndex,
        state: videoStatesRef.current.get(videoKey(v.pageIndex, v.resource)) ?? 'stopped',
      }));
    },
    playVideo: (pick) => {
      const viewer = viewerRef.current;
      const doc = viewerVdtRef.current;
      if (!viewer || !doc) return { played: false, reason: 'none' };
      const onShow = viewer.state.pages;
      const picked = pickVideo(onShow.flatMap((i) => playableVideos(doc, i)), pick);
      if (!picked) {
        // A video plays only on the spread the book is open at.
        const elsewhere = pick.resource === undefined && pick.pageIndex === undefined
          ? []
          : doc.pages.map((_, i) => i).filter((i) => !onShow.includes(i) && pickVideo(playableVideos(doc, i), pick) !== null);
        return elsewhere.length > 0 ? { played: false, reason: 'elsewhere', pageIndexes: elsewhere } : { played: false, reason: 'none' };
      }
      const found = { resource: picked.resource, pageIndex: picked.pageIndex };
      // A click on a video that plays pauses it.
      if (videoStatesRef.current.get(videoKey(picked.pageIndex, picked.resource)) === 'playing') return { played: true, already: true, ...found };
      const spot = picked.item;
      const point = pick.x !== undefined && pick.y !== undefined
        ? { x: pick.x, y: pick.y }
        : { x: spot.origin.x + (spot.across.x + spot.down.x) / 2, y: spot.origin.y + (spot.across.y + spot.down.y) / 2 };
      return viewer.toggleVideoAt({ page: picked.pageIndex, ...point }) ? { played: true, ...found } : { played: false, reason: 'refused', ...found };
    },
    stopVideo: () => viewerRef.current?.stopVideo(),
  }), []);

  // A face that lands after the first measurement: the engine's watch
  // (#629) drops its family's measurements; lay out again.
  useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts) return;
    const stop = watchFonts(document.fonts);
    const off = onFontsChanged(() => setRebuildKey((k) => k + 1));
    // And the faces the layout worker got after a build that could not
    // wait for their files (#757).
    const offLate = onLateFonts(() => setRebuildKey((k) => k + 1));
    return () => {
      offLate();
      off();
      stop();
    };
  }, []);

  useFolioBuild({
    dispatch, sharedDocRef, sharedDocSourceRef, chapterDocsRef, chaptersRef, deferredBookVersion,
    planRef, deferredBookSource, deferredSource, deferredResources, rawDeferredConfig,
    deferredConfig, layoutWorker, rebuildKey, setRebuildKey, fontGate, setDoc, heldDocsRef,
    stitchedRef, callbacksRef
  });

  // Resource images decoded after the pages were painted: paint them again.
  const diagramInkHex = useMemo((): string | null => {
    const ds = resolveDiagramStyleConfig(deferredConfig.diagramStyle);
    if (!ds.singleInk) return null;
    return resolveColorValue(ds.inkColor, deferredConfig.colorPalette, ds.inkColor).hex;
  }, [deferredConfig]);
  // SVG text in the book's fonts (#630) unless diagramStyle.inlineFonts is off.
  const inlineSvgFonts = deferredConfig.diagramStyle?.inlineFonts !== false;
  // The resources whose pictures are decoded: a new viewer opens with them
  // painted, not with placeholders.
  const [imagesFor, setImagesFor] = useState<readonly unknown[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    ensureResourceImages(deferredResources, diagramInkHex, { inlineFonts: inlineSvgFonts })
      .then((changed) => {
        if (!cancelled && changed) setPaintKey((k) => k + 1);
      })
      .catch(() => { /* leave placeholders */ })
      .finally(() => {
        if (!cancelled) setImagesFor(deferredResources);
      });
    // Uploaded videos, played on the pages from their object URLs (#477).
    void ensureResourceVideoUrls(deferredResources).catch(() => false);
    return () => {
      cancelled = true;
    };
  }, [deferredResources, diagramInkHex, inlineSvgFonts]);

  const pageNegative = useMemo(() => resolveDebugConfig(deferredConfig.debug).pageNegative.enabled, [deferredConfig]);
  // The print preview (#606): the Canvas's proof (#799) — the output
  // profile on the paper's own white, the print alone (#802) — so the
  // book's paper is shown neutral meanwhile instead of tinting the proofed
  // paper a second time.
  const [printPreviewOn] = usePrintPreview();
  const printSetup = usePrintSetup(deferredConfig.print, printPreviewOn);
  // A PDF forced to grayscale prints in black alone (#800).
  const printGray = printsGrayscale(deferredConfig.pdfGeneration, printSetup);
  const printPreviewKey = printPreviewOn && printSetup.transform ? `${printGray}|${JSON.stringify(printSetup.print)}` : 'off';
  const printPreview = useMemo(
    () => (printPreviewOn ? previewFor(printSetup, (deferredConfig.page?.dpi as number | undefined) ?? 300, true, printGray) : undefined),
    // The key names the setup; the object is new on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [printPreviewKey, deferredConfig.page?.dpi],
  );
  const proofing = printPreview !== undefined;
  const shownFolio = useMemo(
    () => (proofing ? { ...folioConfig, paper: { ...folioConfig?.paper, shade: PROOF_PAPER } } : folioConfig),
    [proofing, folioConfig],
  );
  folioConfigRef.current = shownFolio;
  const folioLabels = useMemo((): FolioLabels => ({
    region: labels.folioRegion,
    prev: labels.folioPrev,
    next: labels.folioNext,
    count: (pages) => {
      const numbers = sharedDocRef.current?.pages;
      const n = (i: number) => numbers?.[i]?.pageNumberValue ?? i + 1;
      return pages.length > 1
        ? fill(labels.folioPages, { from: n(pages[0]!), to: n(pages[pages.length - 1]!) })
        : fill(labels.folioPage, { page: n(pages[0] ?? 0) });
    },
  }), [labels.folioRegion, labels.folioPrev, labels.folioNext, labels.folioPages, labels.folioPage, sharedDocRef]);
  const folioLabelsRef = useRef(folioLabels);
  folioLabelsRef.current = folioLabels;
  const pageAltRef = useRef(labels.folioPageAlt);
  pageAltRef.current = labels.folioPageAlt;

  const mode = compact ? 'single' : 'auto';
  const imagesReady = imagesFor === deferredResources;

  // Another book opened: the one being left is put away, and the cover
  // stays up until the new one is ready (its first layout, its pictures,
  // its spine), when a new viewer opens with its settings. The new book's
  // paper, binding and desk never dress the old book's pages.
  const viewerBookRef = useRef(bookVersion);
  useEffect(() => {
    if (viewerBookRef.current === bookVersion) return;
    viewerBookRef.current = bookVersion;
    viewerRef.current?.dispose();
    viewerRef.current = null;
    viewerDocRef.current = null;
    setOpened(false);
  }, [bookVersion]);

  // The viewer: made with the first document (and again when the reading
  // mode or the page negative changes), fed every later one.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !shownDoc) return;
    // A layout of the book being left, still on its way when another
    // book was opened, is never shown.
    if (shownDoc.book !== bookVersionRef.current) return;
    let viewer = viewerRef.current;
    if (!viewer && !(spineReady && imagesReady)) return;
    const doc = shownDoc.doc;
    const before = viewerDocRef.current;
    if (viewer && before === shownDoc && paintedKeyRef.current === paintKey) return;
    viewerDocRef.current = shownDoc;
    callbacksRef.current.onBindingChange?.(doc.binding === 'right');
    if (!viewer) {
      const at = pendingJumpRef.current ?? leadingBlankPageCount(doc);
      pendingJumpRef.current = null;
      viewer = createFolioFromDocument(host, doc, {
        at,
        mode,
        pageNegative,
        ...(printPreview ? { printPreview } : {}),
        // The page is in the URL; the count is only announced.
        showCount: false,
        // The tab's own bar turns the pages (and takes a page number).
        controls: false,
        labels: folioLabelsRef.current,
        interaction: interactionRef.current,
        appearance: { folio: folioConfigRef.current, textureBaseUrl: FOLIO_TEXTURES, spineImage: spineUrlRef.current, extraPages: shownDoc.extraPages },
        alt: (i) => fill(pageAltRef.current, { page: viewerDocRef.current?.doc.pages[i]?.pageNumberValue ?? i + 1 }),
        decorate: (index, ctx) => selectionRef.current.decorate(index, ctx),
        // Videos play on the pages (#477): an uploaded file from its object
        // URL, else from its address.
        videoUrl: getResourceVideoUrl,
        onVideo: ({ resourceId, page, state }) => {
          if (state === 'playing' || state === 'paused') videoStatesRef.current.set(videoKey(page, resourceId), state);
          else videoStatesRef.current.delete(videoKey(page, resourceId));
        },
        onTarget: (state) => {
          callbacksRef.current.onSpreadChange?.(state.pages);
          selectionRef.current.onSpread();
        },
        onChange: (state) => {
          callbacksRef.current.onSpreadChange?.(state.pages);
          selectionRef.current.onSpread();
          const page = state.pages[state.pages.length - 1];
          if (page !== undefined) callbacksRef.current.onCurrentPageChange?.(page);
        },
      });
      viewerRef.current = viewer;
      selectionRef.current.attach(viewer);
      callbacksRef.current.onSpreadChange?.(viewer.state.pages);
      paintedKeyRef.current = paintKey;
      setOpened(true);
      return;
    }
    // Images decoded since the pages were painted: paint them all again.
    // Otherwise a page that reads as before keeps its painting.
    const repaint = paintedKeyRef.current !== paintKey;
    paintedKeyRef.current = paintKey;
    // The same page in the new layout (another scope, or an edit that
    // moved the pages), else the same position.
    // Either page of the open spread will do (the whole book's spread may
    // straddle two chapters, a chapter's document holds one of them).
    let same = -1;
    if (before && before !== shownDoc) {
      for (const open of viewer.state.pages) {
        same = samePage(before, open, shownDoc);
        if (same >= 0) break;
      }
    }
    viewer.setDocument(doc, { ...(same >= 0 ? { at: same } : {}), repaint, appearance: { extraPages: shownDoc.extraPages } });
    if (pendingJumpRef.current !== null) {
      viewer.goToPage(pendingJumpRef.current, { instant: true });
      pendingJumpRef.current = null;
    }
    // The page on show, in the new document's numbering, to the URL.
    callbacksRef.current.onSpreadChange?.(viewer.state.pages);
    const shown = viewer.state.pages[viewer.state.pages.length - 1];
    if (shown !== undefined) callbacksRef.current.onCurrentPageChange?.(shown);
  }, [shownDoc, paintKey, mode, pageNegative, printPreview, spineReady, imagesReady]);

  // A new reading mode, page negative or print preview: a new viewer, on
  // the same page.
  const modeKey = `${mode}|${pageNegative}|${printPreviewKey}`;
  const modeKeyRef = useRef(modeKey);
  useEffect(() => {
    if (modeKeyRef.current === modeKey) return;
    modeKeyRef.current = modeKey;
    const viewer = viewerRef.current;
    if (!viewer) return;
    pendingJumpRef.current = viewer.state.pages[0] ?? 0;
    viewer.dispose();
    viewerRef.current = null;
    setPaintKey((k) => k + 1);
  }, [modeKey]);

  useEffect(() => {
    viewerRef.current?.setInteraction(interaction);
  }, [interaction]);

  useEffect(() => {
    viewerRef.current?.setLabels(folioLabels);
  }, [folioLabels]);

  useEffect(() => {
    viewerRef.current?.setAppearance({ folio: shownFolio, spineImage: spineUrl });
  }, [shownFolio, spineUrl]);

  useEffect(() => () => {
    viewerRef.current?.dispose();
    viewerRef.current = null;
  }, []);

  return (
    <>
      <div
        ref={hostRef}
        // The 3D book is physical: a right-to-left book turns its own
        // leaves leftward, the interface's direction does not mirror it.
        dir="ltr"
        className="h-full w-full overflow-hidden text-(--foreground)"
        style={{ backgroundColor: 'var(--surface)', '--postext-folio-accent': 'var(--brand)' } as React.CSSProperties}
      />
      {!opened && <FolioLoading />}
    </>
  );
});
