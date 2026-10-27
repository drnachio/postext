'use client';

/**
 * Two editions side by side (#867): the chapter on screen in its language
 * at the left, the same chapter of another edition at the right, the same
 * page in both and their scrolling kept together (the same composed page
 * in both, counted from it between them, see `compareSync.ts`). The
 * frames that do not fit, or whose text was shrunk, are marked in both
 * (`fitMarks.ts`). The other edition is laid out behind the reader from
 * its draft or its bundle (`editions/editionStore.ts`); it is read only
 * here: a click on one of its pages opens that edition at that page.
 *
 * With the canvas on the whole book (`canvasScope: 'book'`, #1010), both
 * columns hold the whole book, every chapter stitched after the one
 * before it, and the columns meet chapter by chapter, on the text.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { renderPageToCanvas, type VDTDocument } from 'postext';
import {
  useSandboxChapterDocsRef, useSandboxDocRef, useSandboxDocSourceRef, useSandboxLabels, useSandboxSelector,
} from '../../context/SandboxContext.js';
import { requestFrameJump } from '../../editions/frameJump.js';
import { useBookEditions } from '../../editions/useBookEditions.js';
import { stitchDocuments } from '../../book/stitch.js';
import { sameLocaleTag } from '../../presets/locale.js';
import { localeDisplayName } from '../../presets/localeNames.js';
import { readViewHash } from '../../storage/viewHash.js';
import { IconButton, Select, Switch, cn } from '../../ui/index.js';
import { createOverlaySvg } from '../canvas/CanvasPreview/dom.js';
import { drawPageFitMarks } from './fitMarks.js';
import { fitMarksViewOf, useFitMarksChoice } from './fitMarksView.js';
import { syncedScrollTop } from './compareSync.js';

const GAP = 16;
const PAD = 16;

interface ColumnHandle {
  el: HTMLDivElement | null;
  doc: VDTDocument | null;
  /** The chapter of every page, in the whole book. */
  chapters?: readonly number[];
  tops: number[];
  heights: number[];
}

/** A column's document: one chapter's, or the whole book's with the
 *  chapter of every page. */
interface ColumnDoc {
  doc: VDTDocument;
  chapters?: number[];
  /** The first content page of every chapter, by chapter position. */
  chapterFirstPages?: number[];
}

/** The chapters laid out, in book order, stitched into one document;
 *  null until every one of `expected` has its document. */
function stitchBook(parts: readonly { index: number; chapterId: string; doc: VDTDocument | null }[], expected: number): ColumnDoc | null {
  const present = parts.filter((p): p is { index: number; chapterId: string; doc: VDTDocument } => p.doc !== null);
  if (present.length === 0 || present.length < expected) return null;
  const stitched = stitchDocuments(present.map((p) => ({ chapterId: p.chapterId, doc: p.doc })));
  if (!stitched) return null;
  const chapterFirstPages: number[] = [];
  present.forEach((p, k) => { chapterFirstPages[p.index] = stitched.chapterFirstPages[k] ?? -1; });
  return { doc: stitched.doc, chapters: stitched.pageChapters.map((k) => present[k]!.index), chapterFirstPages };
}

function PageColumn({
  column, handle, onScroll, onPageClick, uiLocale, labels, emptyText,
}: {
  column: ColumnDoc | null;
  handle: React.MutableRefObject<ColumnHandle>;
  onScroll: () => void;
  onPageClick?: (pageIndex: number) => void;
  uiLocale: string;
  labels: ReturnType<typeof useSandboxLabels>;
  emptyText: string | null;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const doc = column?.doc ?? null;
  const pageChapters = column?.chapters;
  // The fit marks the reader chose to see, as on the canvas (#1160).
  const [fitChoice] = useFitMarksChoice();
  const debug = useSandboxSelector((s) => s.config.debug);
  const fitView = useMemo(() => fitMarksViewOf(debug, fitChoice), [debug, fitChoice]);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const pageWidth = Math.max(80, width - PAD * 2);
  const sizes = useMemo(() => (doc ? doc.pages.map((p) => ({ w: pageWidth, h: (pageWidth * p.height) / p.width })) : []), [doc, pageWidth]);

  // The page tops in the column, for the scroll sync.
  useLayoutEffect(() => {
    const tops: number[] = [];
    let y = PAD;
    for (const s of sizes) {
      tops.push(y);
      y += s.h + GAP;
    }
    handle.current = { el: ref.current, doc, ...(pageChapters ? { chapters: pageChapters } : {}), tops, heights: sizes.map((s) => s.h) };
  }, [doc, pageChapters, sizes, handle]);

  // Paint the pages near the view; again when the document changes.
  useEffect(() => {
    const el = ref.current;
    if (!el || !doc || width === 0) return;
    const painted = new Set<number>();
    const dpr = window.devicePixelRatio || 1;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const slot = e.target as HTMLElement;
        const i = Number(slot.dataset.comparePage);
        if (painted.has(i)) continue;
        const page = doc.pages[i];
        const canvas = slot.querySelector('canvas');
        const svg = slot.querySelector('svg');
        if (!page || !canvas) continue;
        painted.add(i);
        renderPageToCanvas(page, doc, canvas, { scale: Math.min(1, (pageWidth * dpr) / page.width) });
        canvas.style.width = `${pageWidth}px`;
        canvas.style.height = `${(pageWidth * page.height) / page.width}px`;
        if (svg) drawPageFitMarks(svg as SVGSVGElement, doc, i, labels, uiLocale, fitView);
      }
    }, { root: el, rootMargin: '600px 0px' });
    el.querySelectorAll('[data-compare-page]').forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [doc, width, pageWidth, labels, uiLocale, fitView]);

  // Each slot's overlay, sized with the page.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !doc) return;
    el.querySelectorAll<HTMLElement>('[data-compare-page]').forEach((slot) => {
      const i = Number(slot.dataset.comparePage);
      const page = doc.pages[i];
      if (!page) return;
      slot.querySelector('svg')?.remove();
      const svg = createOverlaySvg(pageWidth, (pageWidth * page.height) / page.width, page.width, page.height);
      svg.setAttribute('aria-hidden', 'true');
      slot.appendChild(svg);
    });
  }, [doc, pageWidth]);

  return (
    <div ref={ref} className="relative h-full min-w-0 flex-1 overflow-auto" onScroll={onScroll} style={{ background: 'var(--surface)' }}>
      {emptyText !== null && (
        <p className="m-0 flex items-center gap-1.5 p-4 text-xs text-(--slate)">{emptyText}</p>
      )}
      <div style={{ padding: PAD }}>
        {doc?.pages.map((p, i) => (
          <div
            key={i}
            data-compare-page={i}
            className={cn('relative mx-auto', onPageClick && 'cursor-pointer')}
            style={{ width: pageWidth, height: sizes[i]?.h ?? 0, marginBottom: GAP }}
            onClick={onPageClick ? () => onPageClick(i) : undefined}
          >
            <canvas className="block rounded-[2px] bg-white shadow-sm" style={{ width: pageWidth, height: sizes[i]?.h ?? 0 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** `pageIndex` is the page the canvas shows as the view opens: its document
 *  is the left column's (the chapter's, or the same chapters stitched in
 *  the same order). */
export function EditionCompare({ onClose, pageIndex }: { onClose: () => void; pageIndex?: number }) {
  const openedAt = useRef(pageIndex ?? null);
  const labels = useSandboxLabels();
  const uiLocale = useSandboxSelector((s) => s.locale);
  const chapters = useSandboxSelector((s) => s.chapters);
  const activeChapterId = useSandboxSelector((s) => s.activeChapterId);
  const docVersion = useSandboxSelector((s) => s.docVersion);
  const docRef = useSandboxDocRef();
  const docSourceRef = useSandboxDocSourceRef();
  const chapterDocsRef = useSandboxChapterDocsRef();
  const wholeBook = useSandboxSelector((s) => s.canvasScope === 'book');
  const base = useBookEditions(false);
  const others = base.locales.filter((l) => !sameLocaleTag(l, base.activeLocale));
  const [chosen, setChosen] = useState<string | null>(null);
  const other = chosen && others.includes(chosen) ? chosen : others[0] ?? '';
  const activeIndex = chapters.findIndex((c) => c.id === activeChapterId);
  // The chapter on screen is laid out in the other edition even when the
  // checks would skip it (no composed page, #1007); every chapter in the
  // whole book (#1010).
  const asked = wholeBook ? chapters.map((_, i) => i) : activeIndex >= 0 ? [activeIndex] : [];
  const editions = useBookEditions(other !== '', other ? [other] : [], { chapters: asked });
  const [sync, setSync] = useState(true);

  const leftColumn = useMemo((): ColumnDoc | null => {
    if (wholeBook) {
      const parts = chapters.map((c, index) => ({ index, chapterId: c.id, doc: chapterDocsRef.current.get(c.id)?.doc ?? null }));
      return stitchBook(parts, chapters.length);
    }
    const doc = chapterDoc();
    return doc ? { doc } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the refs hold the documents of `docVersion`
  }, [wholeBook, chapters, activeChapterId, docVersion]);
  const leftDoc = leftColumn?.doc ?? null;
  function chapterDoc(): VDTDocument | null {
    const held = chapterDocsRef.current.get(activeChapterId);
    if (held) return held.doc;
    const src = docSourceRef.current;
    return src && src.scope !== 'book' && src.scope.only === activeChapterId ? docRef.current : null;
  }
  const entry = other ? editions.entries[other] : undefined;
  const rightLayout = entry?.layout;
  const rightColumn = useMemo((): ColumnDoc | null => {
    if (!rightLayout) return null;
    if (wholeBook) {
      // Every chapter while the layout is under way (an older one lacks
      // most); once it is done, the chapters it has.
      return stitchBook(rightLayout.chapters, entry?.status === 'ready' ? 1 : rightLayout.chapters.length);
    }
    const doc = rightLayout.chapters[activeIndex]?.doc ?? null;
    return doc ? { doc } : null;
  }, [rightLayout, wholeBook, activeIndex, entry]);
  const rightDoc = rightColumn?.doc ?? null;
  // Laid out, and still without the chapter: the edition has none there.
  const rightMissing = !rightDoc && entry?.status === 'ready' && (wholeBook || entry.chapters.has(activeIndex));
  const rightLoading = other !== '' && !rightDoc && !rightMissing && entry?.status !== 'error';

  const left = useRef<ColumnHandle>({ el: null, doc: null, tops: [], heights: [] });
  const right = useRef<ColumnHandle>({ el: null, doc: null, tops: [], heights: [] });
  const muted = useRef<HTMLDivElement | null>(null);

  const follow = (from: ColumnHandle, to: ColumnHandle) => {
    if (!sync || !from.el || !to.el || !from.doc || !to.doc) return;
    // The column moved by the sync does not move the other back.
    if (muted.current === from.el) {
      muted.current = null;
      return;
    }
    const top = syncedScrollTop(
      { doc: from.doc, ...(from.chapters ? { chapters: from.chapters } : {}), tops: from.tops, heights: from.heights, scrollTop: from.el.scrollTop + PAD },
      { doc: to.doc, ...(to.chapters ? { chapters: to.chapters } : {}), tops: to.tops, heights: to.heights },
    );
    if (top === null) return;
    // Both columns read at the same line: a page gap under their top.
    const next = Math.max(0, top - PAD);
    if (Math.abs(to.el.scrollTop - next) < 1) return;
    muted.current = to.el;
    to.el.scrollTop = next;
  };

  // Open on the page the canvas shows; the other column follows.
  const placedRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    const l = left.current;
    if (!leftDoc || !l.el) return;
    const key = `${wholeBook ? 'book' : activeChapterId}|${other}|${rightDoc ? 1 : 0}`;
    if (placedRef.current === key) return;
    placedRef.current = key;
    // The page the canvas showed; else the fragment's page number, in the
    // whole book in the chapter on screen (its first content page when the
    // fragment names none).
    const shown = openedAt.current;
    let i = shown !== null && shown < leftDoc.pages.length ? shown : -1;
    if (i < 0) {
      const wanted = readViewHash().page;
      const pageChapters = leftColumn?.chapters;
      const inChapter = (k: number) => !pageChapters || pageChapters[k] === activeIndex;
      i = wanted !== null ? leftDoc.pages.findIndex((p, k) => inChapter(k) && p.pageNumberValue === wanted) : -1;
      if (i < 0 && pageChapters) i = leftColumn?.chapterFirstPages?.[activeIndex] ?? -1;
    }
    if (i >= 0 && l.tops[i] !== undefined) l.el.scrollTop = l.tops[i]! - PAD;
    follow(l, right.current);
  });

  const name = (l: string) => (l ? localeDisplayName(l, uiLocale) : '?');
  const status = !other
    ? labels.composedChecksOneEdition
    : entry?.status === 'error'
      ? labels.composedChecksEditionError.replace('__locale__', name(other)).replace('__error__', entry.error ?? '')
      : rightMissing
        ? labels.editionCompareNoChapter.replace('__locale__', name(other))
        : !rightDoc
          ? labels.editionCompareLoading.replace('__locale__', name(other))
          : null;

  const openOther = (pageIndex: number) => {
    const page = rightDoc?.pages[pageIndex];
    if (!page || !other) return;
    const chapterIndex = rightColumn?.chapters ? rightColumn.chapters[pageIndex] ?? -1 : activeIndex;
    requestFrameJump({
      presetId: base.presetId,
      projectId: base.projectId,
      linked: base.linked,
      locale: other,
      chapterIndex: chapterIndex >= 0 ? chapterIndex : null,
      page: page.pageNumberValue,
      fenceIndex: page.composed?.fenceIndex ?? null,
      frame: null,
      panel: 'markdown',
      keepEditor: true,
    });
    onClose();
  };

  return (
    <div className="absolute inset-0 z-30 flex flex-col" style={{ background: 'var(--background)' }} data-edition-compare="" role="region" aria-label={labels.editionCompare}>
      <div className="flex shrink-0 items-center gap-2 border-b px-2 py-1" style={{ borderColor: 'var(--rule)' }}>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-(--foreground)">{name(base.activeLocale)}</span>
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="shrink-0 text-[0.66rem] text-(--slate)">{labels.editionCompareWith}</span>
          {others.length > 1 ? (
            <Select<string> size="sm" value={other} onValueChange={setChosen} ariaLabel={labels.editionCompareWith} options={others.map((l) => ({ value: l, label: name(l) }))} />
          ) : (
            <span className="truncate text-xs font-semibold text-(--foreground)">{other ? name(other) : ''}</span>
          )}
          {rightLoading && <Loader2 size={12} aria-hidden="true" className="shrink-0 animate-spin text-(--slate)" />}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-[0.66rem] text-(--slate)">
          <Switch checked={sync} onCheckedChange={setSync} ariaLabelledBy="postext-compare-sync" />
          <span id="postext-compare-sync">{labels.editionCompareSync}</span>
        </span>
        <IconButton label={labels.editionCompareClose} onClick={onClose} icon={<X size={14} aria-hidden="true" />} />
      </div>
      <div className="flex min-h-0 flex-1 gap-px" style={{ background: 'var(--rule)' }}>
        <PageColumn column={leftColumn} handle={left} onScroll={() => follow(left.current, right.current)} uiLocale={uiLocale} labels={labels} emptyText={leftDoc ? null : labels.editionCompareLoading.replace('__locale__', name(base.activeLocale))} />
        <PageColumn column={rightColumn} handle={right} onScroll={() => follow(right.current, left.current)} onPageClick={openOther} uiLocale={uiLocale} labels={labels} emptyText={status} />
      </div>
    </div>
  );
}
