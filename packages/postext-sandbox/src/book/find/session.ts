// A search over the chapters of a book, as the find worker runs it
// (editor/find/find.worker.ts) and, where there is no worker, the page
// itself. A session keeps the chapters' texts it was sent, so a request
// carries only the texts that changed, and the matches of each chapter
// for the last query: while the reader types in one chapter, only that
// chapter is searched again.

import { compileFind, MAX_MATCHES, type FindMatch, type FindOptions, type FindStop } from './compile.js';

/** The soft time budget of one search (scanning, not one step of a
 *  regular expression: see compile.ts). */
export const FIND_BUDGET_MS = 100;

export interface FindRequest {
  query: string;
  options: FindOptions;
  /** Texts that changed since the last request (or all of them). */
  texts: readonly { id: string; text: string }[];
  /** The chapters to search, in book order; the session forgets others. */
  order: readonly string[];
  budgetMs?: number;
  maxMatches?: number;
}

export interface ChapterMatches {
  chapterId: string;
  matches: FindMatch[];
}

export type FindOutcome =
  | { error: string }
  | {
    /** Chapters with at least one match, in book order. */
    results: ChapterMatches[];
    /** The search stopped early: the match cap, the time budget, or
     *  (set by the client) a step that ran past the hard limit. */
    stopped: FindStop | 'timeout';
  };

export interface FindSession {
  run: (request: FindRequest, now?: () => number) => FindOutcome;
}

const clock = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function createFindSession(): FindSession {
  const texts = new Map<string, string>();
  /** The complete matches of a chapter for a query key and its text. */
  const cache = new Map<string, { key: string; text: string; matches: FindMatch[] }>();

  return {
    run(request, now = clock) {
      for (const t of request.texts) texts.set(t.id, t.text);
      const wanted = new Set(request.order);
      for (const id of [...texts.keys()]) {
        if (!wanted.has(id)) {
          texts.delete(id);
          cache.delete(id);
        }
      }
      const compiled = compileFind(request.query, request.options);
      if (compiled === null) return { results: [], stopped: null };
      if ('error' in compiled) return { error: compiled.error };
      const deadline = now() + (request.budgetMs ?? FIND_BUDGET_MS);
      const cap = request.maxMatches ?? MAX_MATCHES;
      const results: ChapterMatches[] = [];
      let total = 0;
      let stopped: FindStop = null;
      for (const id of request.order) {
        const text = texts.get(id);
        if (text === undefined) continue;
        const hit = cache.get(id);
        let matches: FindMatch[];
        if (hit && hit.key === compiled.key && hit.text === text) {
          matches = hit.matches.length > cap - total ? hit.matches.slice(0, cap - total) : hit.matches;
          if (matches.length < hit.matches.length) stopped = 'count';
        } else {
          const run = compiled.find(text, { limit: cap - total, deadline, now });
          matches = run.matches;
          if (run.stopped) stopped = run.stopped;
          else cache.set(id, { key: compiled.key, text, matches });
        }
        if (matches.length > 0) results.push({ chapterId: id, matches });
        total += matches.length;
        if (stopped) break;
        if (total >= cap) {
          stopped = 'count';
          break;
        }
      }
      return { results, stopped };
    },
  };
}
