'use client';

// The find bar's list of matches, by chapter, each with its line number
// and the words around it. Snippets take their direction from their own
// text (`dir="auto"`): an Arabic line reads right to left in an English
// interface, and a Latin one left to right in an Arabic interface.

import { useEffect, useRef } from 'react';
import { matchSnippets } from '../../book/find/snippet.js';
import type { FindMatch } from '../../book/find/compile.js';
import type { ChapterResult } from './useFindResults.js';

/** Rows the results list draws at most; the count still says them all. */
const LIST_LIMIT = 300;

export interface Hit {
  chapterId: string;
  /** Book order of the chapter. */
  chapterIndex: number;
  match: FindMatch;
  /** Index among the chapter's matches. */
  local: number;
}

export function fill(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce((s, [k, v]) => s.split(`__${k}__`).join(String(v)), template);
}

export function ResultsList({ results, total, currentHit, onPick, untitled, more, lineLabel }: {
  results: readonly ChapterResult[];
  total: number;
  currentHit: Hit | undefined;
  onPick: (hit: Hit) => void;
  untitled: string;
  more: string;
  lineLabel: string;
}) {
  let budget = LIST_LIMIT;
  const groups = results.map((r) => {
    const shown = Math.max(0, Math.min(r.matches.length, budget));
    budget -= shown;
    return { r, snippets: shown > 0 ? matchSnippets(r.text, r.matches, shown) : [] };
  });
  const hidden = total - LIST_LIMIT;

  // Keep the current row in sight.
  const currentRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest' });
  }, [currentHit]);

  return (
    <div className="max-h-[40vh] overflow-y-auto rounded-md border" style={{ borderColor: 'var(--rule)' }}>
      {groups.map(({ r, snippets }) => snippets.length > 0 && (
        <div key={r.chapterId}>
          <div className="sticky top-0 flex items-baseline gap-2 px-2 py-1 text-xs font-semibold" style={{ backgroundColor: 'var(--background)', color: 'var(--foreground)' }}>
            <span dir="auto" className="min-w-0 flex-1 truncate text-start">{r.title || fill(untitled, { n: r.chapterIndex + 1 })}</span>
            <span className="shrink-0 font-normal" style={{ color: 'var(--slate)' }}>{r.matches.length}</span>
          </div>
          <ul>
            {snippets.map((s, k) => {
              const isCurrent = currentHit?.chapterId === r.chapterId && currentHit.local === k;
              return (
                <li key={k}>
                  <button
                    ref={isCurrent ? currentRef : undefined}
                    type="button"
                    onClick={() => onPick({ chapterId: r.chapterId, chapterIndex: r.chapterIndex, match: r.matches[k]!, local: k })}
                    aria-current={isCurrent || undefined}
                    aria-label={`${fill(lineLabel, { line: s.line })}: ${s.before}${s.match}${s.after}`}
                    className="flex min-h-6 w-full items-baseline gap-2 px-2 py-0.5 text-start text-xs focus-visible:outline-2 focus-visible:-outline-offset-2 pt-large:min-h-11"
                    style={{ backgroundColor: isCurrent ? 'var(--surface)' : 'transparent', color: 'var(--foreground)', outlineColor: 'var(--brand)' }}
                  >
                    <span className="w-8 shrink-0 text-end tabular-nums" style={{ color: 'var(--slate)' }}>{s.line}</span>
                    <span dir="auto" className="min-w-0 flex-1 truncate text-start">
                      {s.before}
                      <mark style={{ backgroundColor: 'color-mix(in srgb, var(--brand) 35%, transparent)', color: 'var(--foreground)', borderRadius: 2 }}>{s.match}</mark>
                      {s.after}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {hidden > 0 && (
        <p className="px-2 py-1 text-xs" style={{ color: 'var(--slate)' }}>{fill(more, { count: hidden })}</p>
      )}
    </div>
  );
}
