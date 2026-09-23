'use client';

import { useEffect, useRef } from 'react';
import { useSandboxBookActions, useSandboxDispatch, useSandboxSelector } from '../context/SandboxContext';
import { readViewHash, sameBook, writeViewHash, type ViewHash, type ViewHashBook } from '../storage/viewHash';

/**
 * Keep the book on screen, the viewer tab and the active chapter in step
 * with the URL fragment — the `preset=` / `project=` / `lang=`, `view=` and
 * `chapter=` parts of the permalink (see {@link readViewHash}); the page
 * part is the viewers' job ({@link usePageHashSync}).
 *
 * The book and the tab are written whenever they change, once the store is
 * ready (before that the state is the saved one, which the mount seeding
 * may replace — by the book the fragment names, among others). A fragment
 * changed by hand, a pasted link or a back/forward step that names another
 * book opens it (a preset in the locale asked for, or a local project this
 * browser holds), and another tab switches to it.
 *
 * The initial state already picks the chapter the fragment names (see the
 * provider), but the mount seeding may replace the whole book (first entry,
 * a locale switch, a private default preset, the permalink's book), so the
 * chapter is applied again to the book the fragment names — when that book
 * replaces the saved one, or once the store is ready — unless the reader
 * has picked one in the meantime. Every other change of the active chapter (the
 * chapter list, the switcher, a project switch) is written back without a
 * page: switching chapters always lands on the chapter's first content
 * page. Switches driven by the fragment itself leave it alone, so the page
 * it names is still there for the viewer to restore. A replacement of the
 * whole book (`bookVersion`) writes the new book's chapter — unless it was
 * opened for a fragment, whose chapter and page are applied to it. While
 * the canvas or the HTML preview shows the whole book, a switch changes no
 * document: the viewer keeps the fragment itself (it jumps to the chapter,
 * or stays where the reader clicked), so nothing is written here.
 */
export function useChapterHashSync(): void {
  const dispatch = useSandboxDispatch();
  const { loadPreset, activateProject } = useSandboxBookActions();
  const chapters = useSandboxSelector((s) => s.chapters);
  const activeChapterId = useSandboxSelector((s) => s.activeChapterId);
  const storeReady = useSandboxSelector((s) => s.storeReady);
  const bookVersion = useSandboxSelector((s) => s.bookVersion);
  const view = useSandboxSelector((s) => s.activeViewport);
  const book = useSandboxSelector(bookOnScreen, sameBookRecord);
  const wholeBookOnScreen = useSandboxSelector((s) => s.activeViewport !== 'pdf' && s.canvasScope === 'book');
  const wholeBookRef = useRef(wholeBookOnScreen);
  wholeBookRef.current = wholeBookOnScreen;
  const bookRef = useRef(book);
  bookRef.current = book;
  const viewRef = useRef(view);
  viewRef.current = view;
  const projectIds = useSandboxSelector((s) => s.projects.map((p) => p.id).join('\n'));
  const projectIdsRef = useRef(projectIds);
  projectIdsRef.current = projectIds;

  // The fragment as the page was opened: the seeding below may rewrite it.
  // Its chapter and page are applied once — to the book it names (or any
  // book, when it names none), whether that book is on screen from the
  // start, replaces the saved one during the mount seeding, or is what is
  // there when the store is ready.
  const initialRef = useRef<ViewHash | null>(null);
  if (initialRef.current === null) initialRef.current = readViewHash();
  const initialPendingRef = useRef(true);
  // The chapter and page a fragment named along with another book: applied
  // once that book has replaced the one on screen (null: none pending).
  const linkRef = useRef<Pick<ViewHash, 'chapter' | 'page'> | null>(null);
  // Set right before a fragment-driven switch; cleared when it lands.
  const hashDrivenRef = useRef<string | null>(null);
  const userNavigatedRef = useRef(false);
  const prevRef = useRef({ chapters, activeChapterId, bookVersion });

  const selectFromHash = (chapter: number | null, restore?: { page: number | null }) => {
    if (chapter === null) return;
    const target = chapters[chapter];
    if (!target || target.id === activeChapterId) return;
    hashDrivenRef.current = target.id;
    if (restore) writeViewHash({ chapter, page: restore.page });
    dispatch({ type: 'SET_ACTIVE_CHAPTER', payload: target.id });
  };
  const selectRef = useRef(selectFromHash);
  selectRef.current = selectFromHash;

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { chapters, activeChapterId, bookVersion };
    const chapter = chapters.findIndex((c) => c.id === activeChapterId);
    // Another book altogether (a preset applied, a project opened): a
    // fragment-driven switch of the old book is moot, and the page named
    // is the old book's — unless the book was opened for a fragment (a
    // pasted link, or the one the page was opened with), whose chapter and
    // page are for this one. The book and the store-ready flag may commit
    // together, so the initial fragment is claimed here by the book it
    // names, not by timing.
    if (prev.bookVersion !== bookVersion) {
      hashDrivenRef.current = null;
      let link = linkRef.current;
      linkRef.current = null;
      const initial = initialRef.current;
      if (!link && initialPendingRef.current && initial && sameBook(initial, bookRef.current)) {
        initialPendingRef.current = false;
        link = initial;
      }
      const target = link && link.chapter !== null ? chapters[link.chapter] : undefined;
      if (link && target) {
        if (target.id !== activeChapterId) selectRef.current(link.chapter, link);
        else writeViewHash({ chapter: link.chapter, page: link.page });
        return;
      }
      writeViewHash({ chapter: chapter < 0 ? null : chapter, page: null });
      return;
    }
    if (prev.activeChapterId === activeChapterId) return;
    if (hashDrivenRef.current === activeChapterId) {
      hashDrivenRef.current = null;
      return;
    }
    // Same chapter list, other chapter: the reader picked it.
    if (prev.chapters === chapters) userNavigatedRef.current = true;
    if (wholeBookRef.current) return;
    writeViewHash({ chapter: chapter < 0 ? null : chapter, page: null });
  }, [chapters, activeChapterId, bookVersion]);

  useEffect(() => {
    if (!storeReady || userNavigatedRef.current) return;
    const initial = initialRef.current;
    if (initial && initialPendingRef.current) {
      initialPendingRef.current = false;
      // A book the fragment named that could not be opened (passed over by
      // the seeding) keeps its chapter and page to itself.
      if (sameBook(initial, bookRef.current)) selectRef.current(initial.chapter, initial);
    }
    // No viewer keeping the fragment (the PDF tab): name the chapter anyway.
    if (readViewHash().chapter === null) {
      const chapter = chapters.findIndex((c) => c.id === activeChapterId);
      if (chapter >= 0) writeViewHash({ chapter, page: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on hydration
  }, [storeReady]);

  // The book and the tab, once the state is the real one.
  useEffect(() => {
    if (!storeReady) return;
    writeViewHash({ ...book, view });
  }, [storeReady, book, view]);

  // A fragment edited by hand, a pasted link or a back/forward step
  // (`history.replaceState` writes never fire this event).
  useEffect(() => {
    const onHashChange = () => {
      const hash = readViewHash();
      if (hash.view !== null && hash.view !== viewRef.current) dispatch({ type: 'SET_VIEWPORT', payload: hash.view });
      if (sameBook(hash, bookRef.current)) {
        selectRef.current(hash.chapter);
        return;
      }
      // Another book: the chapter and page named go with it, not with the
      // book on screen — kept for when it has landed. A book this browser
      // cannot open leaves the fragment naming the one on screen.
      const open = hash.project !== null
        ? projectIdsRef.current.split('\n').includes(hash.project)
          ? activateProject(hash.project)
          : null
        : hash.preset !== null
          ? loadPreset(hash.preset, hash.lang ?? undefined)
          : null;
      if (open === null) {
        writeViewHash({ ...bookRef.current });
        return;
      }
      linkRef.current = { chapter: hash.chapter, page: hash.page };
      userNavigatedRef.current = true;
      open.then((opened) => opened !== false, () => false).then((opened) => {
        // The book is not going to change (an unavailable preset, a lost
        // project, a failed load): the fragment goes back to naming the
        // one on screen. An opened book is applied by the effect above once
        // it is committed — which is after this promise settles.
        if (opened) return;
        linkRef.current = null;
        writeViewHash({ ...bookRef.current });
      });
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable store actions
  }, []);
}

/** The book on screen as the fragment names it: the active project, or
 *  the active preset in the locale it was applied in (unknown while it is
 *  still loading, or for a snapshot from before locale switching). */
function bookOnScreen(s: { activeProjectId: string | null; activePresetId: string; presetApplied: { presetId: string; locale?: string } | null }): ViewHashBook {
  if (s.activeProjectId !== null) return { preset: null, project: s.activeProjectId, lang: null };
  const lang = s.presetApplied?.presetId === s.activePresetId ? s.presetApplied.locale ?? null : null;
  return { preset: s.activePresetId, project: null, lang };
}

function sameBookRecord(a: ViewHashBook, b: ViewHashBook): boolean {
  return a.preset === b.preset && a.project === b.project && a.lang === b.lang;
}
