'use client';

import { useCallback } from 'react';
import { useSandboxDispatch, useSandboxLabels, useSandboxProjects, useSandboxStateGetter } from '../context/SandboxContext.js';
import { pdfFontChecksSource, setPdfFontChecks } from '../controls/fonts/pdfFontWarnings.js';
import { sameLocaleTag } from '../presets/locale.js';
import { downloadBytes } from '../storage/persistence.js';
import { announce } from '../ui/announcer.js';
import { noticeText } from '../viewport/epub/EpubToolbar.js';
import type { CompiledFormat } from './compileBook.js';
import { isCompileCancelled } from './compileStore.js';

/**
 * Compile one of the reader's books to a PDF, HTML or EPUB 3 file, in one
 * of its editions, and hand it over as a download (#1526). The work runs
 * apart from the book on screen (`compileBook.ts`); the Books panel shows
 * its progress and a Cancel button (`compileStore.ts`). The file's
 * warnings go to the panel's notice; a PDF's font checks also reach the
 * Checks panel when the book compiled is the one on screen, in the
 * language on screen, as the PDF tab's do.
 */
export function useCompileBook(): (projectId: string, format: CompiledFormat, locale?: string) => Promise<void> {
  const dispatch = useSandboxDispatch();
  const getState = useSandboxStateGetter();
  const labels = useSandboxLabels();
  const { compile } = useSandboxProjects();
  return useCallback(async (projectId, format, locale) => {
    let book;
    try {
      book = await compile(projectId, format, locale ? { locale } : {});
    } catch (err) {
      // A cancellation says nothing; a failure stays in the panel.
      if (!isCompileCancelled(err)) console.error('[compileBook]', err);
      return;
    }
    downloadBytes(book.bytes, book.fileName, book.mime);
    const notes = [...book.warnings, ...(book.epubNotices ?? []).map((n) => noticeText(n, labels))];
    const message = notes.length > 0
      ? labels.projectCompiledNotes.replace('__file__', book.fileName).replace('__count__', String(notes.length)).replace('__list__', () => notes.join('; '))
      : labels.projectCompiled.replace('__file__', book.fileName);
    dispatch({ type: 'SET_PROJECT_NOTICE', payload: message });
    announce(labels.projectCompiled.replace('__file__', book.fileName));
    const s = getState();
    const summary = s.projects.find((p) => p.id === projectId);
    if (book.fontChecks && s.activeProjectId === projectId && (!summary?.locale || sameLocaleTag(summary.locale, book.locale))) {
      setPdfFontChecks(book.fontChecks, pdfFontChecksSource({ ...s, pdfScope: 'book' }));
    }
  }, [compile, dispatch, getState, labels]);
}
