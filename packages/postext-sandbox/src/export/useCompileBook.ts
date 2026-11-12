'use client';

import { useCallback } from 'react';
import { useSandboxDispatch, useSandboxStateGetter } from '../context/SandboxContext.js';
import { withDefaultResourceTypes } from '../context/defaultConfig.js';
import { setCustomFonts } from '../controls/fonts/fontLoader.js';
import { getProject } from '../storage/projects.js';
import { downloadBytes } from '../storage/persistence.js';
import { useLayoutWorker } from '../worker/useLayoutWorker.js';
import { compileBook, type CompiledFormat } from './compileBook.js';

/**
 * Compile one of the reader's books (`projectId`) to a PDF, HTML or EPUB 3
 * file and hand it over as a download. The panel shows the work as busy,
 * and an error as the panel's error. The book open is compiled from what
 * is on screen; another one from its stored record, its custom fonts
 * standing in for the open book's while it is laid out and written (the
 * font registry is the open book's), the open book's put back after.
 */
export function useCompileBook(): (projectId: string, format: CompiledFormat) => Promise<void> {
  const dispatch = useSandboxDispatch();
  const getState = useSandboxStateGetter();
  const { build } = useLayoutWorker('pdf');
  return useCallback(async (projectId, format) => {
    const s = getState();
    const setStatus = (status: 'busy' | 'idle' | 'error', error?: string) =>
      dispatch({ type: 'SET_PROJECT_STATUS', payload: { status, error } });
    setStatus('busy');
    const open = projectId === s.activeProjectId;
    let swapped = false;
    try {
      const record = open ? null : await getProject(projectId);
      if (!open && !record) throw new Error('Project not found');
      const config = open ? s.config : withDefaultResourceTypes(record!.config, s.locale);
      if (!open) {
        setCustomFonts(config.customFonts, { newBook: true });
        swapped = true;
      }
      const summary = s.projects.find((p) => p.id === projectId);
      const name = open ? (summary?.name ?? '') : record!.name;
      const thumbnail = open ? summary?.thumbnail : record!.thumbnail;
      const out = await compileBook(format, {
        chapters: open ? s.chapters : record!.chapters,
        config,
        resources: open ? s.resources : record!.resources,
        locale: s.locale,
        name,
        identity: { kind: 'project', id: projectId, name },
        ...(thumbnail ? { thumbnail } : {}),
        epubLayout: s.epubLayout,
        build,
      });
      downloadBytes(out.bytes, out.fileName, out.mime);
      setStatus('idle');
    } catch (err) {
      console.error('[compileBook]', err);
      setStatus('error', err instanceof Error ? err.message : String(err));
    } finally {
      if (swapped) setCustomFonts(getState().config.customFonts, { newBook: true });
    }
  }, [build, dispatch, getState]);
}
