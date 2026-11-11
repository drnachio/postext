'use client';

// The find bar's matches: searched a moment after the query, the options
// or the text last changed (not on every key), in the find worker, which
// searches again only the chapters whose text changed. The answer keeps
// the texts it was found in: a replacement is worked out on them, and is
// refused if the chapter changed since.

import { useEffect, useMemo, useState } from 'react';
import type { FindMatch, FindOptions } from '../../book/find/compile.js';
import type { FindOutcome } from '../../book/find/session.js';
import type { Chapter } from '../../book/types.js';
import { createFindClient, type FindClient } from './findClient.js';
import type { FindScope } from './findStore.js';

/** The pause after the last key before a search starts. */
export const FIND_DEBOUNCE_MS = 180;

export interface ChapterResult {
  chapterId: string;
  /** Book order of the chapter. */
  chapterIndex: number;
  title: string;
  /** The text the matches were found in. */
  text: string;
  matches: FindMatch[];
}

export interface FindResults {
  results: ChapterResult[];
  error: string | null;
  stopped: 'count' | 'time' | 'timeout' | null;
  /** The text each searched chapter had, by id. */
  searched: ReadonlyMap<string, string>;
  /** A search is waiting or running for newer input. */
  pending: boolean;
}

const EMPTY: FindResults = { results: [], error: null, stopped: null, searched: new Map(), pending: false };

export function useFindResults(input: {
  query: string;
  options: FindOptions;
  scope: FindScope;
  chapters: readonly Chapter[];
  activeChapterId: string;
  markdown: string;
}): FindResults {
  const { query, options, scope, chapters, activeChapterId, markdown } = input;
  const [client, setClient] = useState<FindClient | null>(null);
  useEffect(() => {
    const c = createFindClient();
    setClient(c);
    return () => c.dispose();
  }, []);

  const inScope = useMemo(
    () => chapters
      .map((c, index) => ({ id: c.id, index, title: c.title, text: c.id === activeChapterId ? markdown : c.markdown }))
      .filter((c) => scope === 'book' || c.id === activeChapterId),
    [chapters, activeChapterId, markdown, scope],
  );

  const [state, setState] = useState<FindResults>(EMPTY);
  useEffect(() => {
    if (!client) return;
    if (query.length === 0) {
      setState(EMPTY);
      return;
    }
    let live = true;
    setState((s) => (s.pending ? s : { ...s, pending: true }));
    const timer = setTimeout(() => {
      void client.search({ query, options, chapters: inScope }).then((answer) => {
        if (!live || 'superseded' in answer) return;
        setState(toResults(answer, inScope));
      });
    }, FIND_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [client, query, options, inScope]);

  return query.length === 0 ? EMPTY : state;
}

function toResults(outcome: FindOutcome, chapters: readonly { id: string; index: number; title: string; text: string }[]): FindResults {
  const searched = new Map(chapters.map((c) => [c.id, c.text]));
  if ('error' in outcome) return { ...EMPTY, error: outcome.error, searched };
  const byId = new Map(chapters.map((c) => [c.id, c]));
  const results = outcome.results.flatMap((r): ChapterResult[] => {
    const c = byId.get(r.chapterId);
    return c ? [{ chapterId: c.id, chapterIndex: c.index, title: c.title, text: c.text, matches: r.matches }] : [];
  });
  return { results, error: null, stopped: outcome.stopped, searched, pending: false };
}
