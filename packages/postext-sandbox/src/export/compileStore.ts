// The book being compiled from the Books panel (#1526): one at a time, its
// progress, and a way to stop it. A store of its own, not the panel's busy
// state: while a book compiles the other books can still be opened,
// renamed, exported or deleted (deleting it stops its compilation).

import { useSyncExternalStore } from 'react';
import { outputProfileBaseUrl } from '../print/printSetup.js';
import type { CompiledBook, CompiledFormat, CompileProgress, CompileRequest } from './compileBook.js';
import { compileCancelled, compileOnWorker } from './compileClient.js';

export interface CompileJob {
  projectId: string;
  /** The book's name as its row shows it. */
  name: string;
  format: CompiledFormat;
  locale?: string;
  progress: CompileProgress | null;
}

/** The last compilation that failed, until it is dismissed or another one
 *  starts. */
export interface CompileFailure {
  name: string;
  format: CompiledFormat;
  message: string;
}

interface CompileState {
  job: CompileJob | null;
  failure: CompileFailure | null;
}

let state: CompileState = { job: null, failure: null };
let controller: AbortController | null = null;
const listeners = new Set<() => void>();

const set = (next: Partial<CompileState>): void => {
  state = { ...state, ...next };
  for (const listener of [...listeners]) listener();
};

export function subscribeCompile(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function compileState(): CompileState {
  return state;
}

export function useCompileState(): CompileState {
  return useSyncExternalStore(subscribeCompile, compileState, compileState);
}

/** Whether `err` is a cancelled compilation. */
export const isCompileCancelled = (err: unknown): boolean => err instanceof DOMException && err.name === 'AbortError';

/** The runner the store compiles with: the worker by default, a stub in
 *  tests. */
type Runner = typeof compileOnWorker;
let runner: Runner = compileOnWorker;
export function setCompileRunner(next: Runner | null): void {
  runner = next ?? compileOnWorker;
}

/**
 * Compile a book. Resolves to the file, or rejects: with an AbortError
 * when cancelled (`cancelCompile`, `cancelCompileFor`), with an error
 * when another book is being compiled or the compilation failed (kept as
 * `failure` for the panel).
 */
export async function startCompile(
  request: Omit<CompileRequest, 'profileBaseUrl'>,
  name: string,
): Promise<CompiledBook> {
  if (state.job) throw new Error(`"${state.job.name}" is being compiled`);
  const own = new AbortController();
  controller = own;
  set({ job: { projectId: request.projectId, name, format: request.format, ...(request.locale ? { locale: request.locale } : {}), progress: null }, failure: null });
  try {
    // The worker has no host settings: the base it fetches catalogue
    // profiles from goes with the request, absolute.
    const profileBaseUrl = new URL(outputProfileBaseUrl(), globalThis.location?.href ?? 'http://localhost/').href;
    return await runner({ ...request, profileBaseUrl }, {
      signal: own.signal,
      onProgress: (progress) => { if (controller === own && state.job) set({ job: { ...state.job, progress } }); },
    });
  } catch (err) {
    if (!isCompileCancelled(err) && controller === own) set({ failure: { name, format: request.format, message: err instanceof Error ? err.message : String(err) } });
    throw err;
  } finally {
    if (controller === own) {
      controller = null;
      set({ job: null });
    }
  }
}

/** Stop the compilation under way. */
export function cancelCompile(): void {
  controller?.abort(compileCancelled());
}

/** Stop the compilation of `projectId`, if it is the one under way (the
 *  book is being deleted). */
export function cancelCompileFor(projectId: string): void {
  if (state.job?.projectId === projectId) cancelCompile();
}

export function dismissCompileFailure(): void {
  if (state.failure) set({ failure: null });
}
