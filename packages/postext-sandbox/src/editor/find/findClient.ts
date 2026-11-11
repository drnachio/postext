// Searches handed to the find worker (./find.worker.ts). One search at a
// time: a request made while one runs waits, and replaces any request
// already waiting (which answers `superseded`). A search that has not
// answered within the hard limit is a regular expression stuck in
// backtracking: the worker is ended, the search answers `timeout`, and the
// next one starts a fresh worker. Where there is no Worker (tests, a
// server render) the session runs in the page, with the soft time budget
// only.

import { createFindSession, type FindOutcome, type FindRequest } from '../../book/find/session.js';
import type { FindOptions } from '../../book/find/compile.js';

/** How long a search may run before its worker is ended. */
export const FIND_HARD_LIMIT_MS = 1500;

/** What the client needs of a worker (a Web Worker has it). */
export interface FindWorkerLike {
  postMessage: (message: unknown) => void;
  terminate: () => void;
  onmessage: ((e: { data: unknown }) => void) | null;
  onerror: ((e: unknown) => void) | null;
}

export interface FindSearch {
  query: string;
  options: FindOptions;
  /** The chapters to search, in book order. */
  chapters: readonly { id: string; text: string }[];
  budgetMs?: number;
  maxMatches?: number;
}

export type FindAnswer = FindOutcome | { superseded: true };

export interface FindClient {
  search: (search: FindSearch) => Promise<FindAnswer>;
  dispose: () => void;
}

function defaultSpawn(): FindWorkerLike | null {
  if (typeof Worker === 'undefined') return null;
  return new Worker(new URL('./find.worker.js', import.meta.url), { type: 'module' }) as unknown as FindWorkerLike;
}

interface Job {
  search: FindSearch;
  resolve: (answer: FindAnswer) => void;
}

export function createFindClient(opts: { spawn?: () => FindWorkerLike | null; hardLimitMs?: number } = {}): FindClient {
  const spawn = opts.spawn ?? defaultSpawn;
  const hardLimitMs = opts.hardLimitMs ?? FIND_HARD_LIMIT_MS;
  let worker: FindWorkerLike | null = null;
  /** No worker can be had: the page searches. */
  let inPage: ReturnType<typeof createFindSession> | null = null;
  /** The texts the worker holds, by chapter id. */
  const sent = new Map<string, string>();
  let seq = 0;
  let running: { seq: number; job: Job; timer: ReturnType<typeof setTimeout> } | null = null;
  let waiting: Job | null = null;
  let disposed = false;

  const endWorker = () => {
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    }
    worker = null;
    sent.clear();
  };

  const finish = (answer: FindAnswer) => {
    if (!running) return;
    clearTimeout(running.timer);
    const { job } = running;
    running = null;
    job.resolve(answer);
    const next = waiting;
    waiting = null;
    if (next && !disposed) start(next);
  };

  const ensureWorker = (): FindWorkerLike | null => {
    if (worker || inPage) return worker;
    worker = spawn();
    if (!worker) {
      inPage = createFindSession();
      return null;
    }
    worker.onmessage = (e) => {
      const data = e.data as { seq: number; outcome: FindOutcome };
      if (running && data.seq === running.seq) finish(data.outcome);
    };
    worker.onerror = () => {
      // The worker could not load: search in the page from now on.
      endWorker();
      inPage = createFindSession();
      if (running) {
        const { job } = running;
        clearTimeout(running.timer);
        running = null;
        start(job);
      }
    };
    return worker;
  };

  const request = (search: FindSearch, known: Map<string, string> | null): FindRequest => ({
    query: search.query,
    options: search.options,
    texts: search.chapters.filter((c) => known?.get(c.id) !== c.text),
    order: search.chapters.map((c) => c.id),
    ...(search.budgetMs !== undefined ? { budgetMs: search.budgetMs } : {}),
    ...(search.maxMatches !== undefined ? { maxMatches: search.maxMatches } : {}),
  });

  function start(job: Job): void {
    const w = ensureWorker();
    if (!w) {
      job.resolve(inPage!.run(request(job.search, null)));
      const next = waiting;
      waiting = null;
      if (next) start(next);
      return;
    }
    const id = ++seq;
    const req = request(job.search, sent);
    sent.clear();
    for (const c of job.search.chapters) sent.set(c.id, c.text);
    const timer = setTimeout(() => {
      endWorker();
      finish({ results: [], stopped: 'timeout' });
    }, hardLimitMs);
    running = { seq: id, job, timer };
    w.postMessage({ seq: id, request: req });
  }

  return {
    search(search) {
      return new Promise<FindAnswer>((resolve) => {
        if (disposed) {
          resolve({ superseded: true });
          return;
        }
        const job = { search, resolve };
        if (running) {
          waiting?.resolve({ superseded: true });
          waiting = job;
        } else {
          start(job);
        }
      });
    },
    dispose() {
      disposed = true;
      waiting?.resolve({ superseded: true });
      waiting = null;
      if (running) finish({ superseded: true });
      endWorker();
    },
  };
}

let shared: FindClient | null = null;

/** The client the agents' tools search with (the find bar has its own). */
export function sharedFindClient(): FindClient {
  return (shared ??= createFindClient());
}
