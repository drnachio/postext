'use client';

import { createContext, useCallback, useContext, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSettingsSearch } from './SearchContext';

export interface ScopeEntry {
  /** The entry passes the current filter. */
  visible: boolean;
  /** The entry differs from its default. */
  overridden: boolean;
}

interface MatchScopeValue {
  report(id: string, entry: ScopeEntry | null): void;
  /** An ancestor's title matched: descendants stay visible regardless. */
  forceVisible: boolean;
}

export interface ScopeCounts {
  /** Descendants (fields or nested scopes) passing the filter. */
  matchCount: number;
  /** Descendants marked overridden. */
  overrideCount: number;
}

const ZERO: ScopeCounts = { matchCount: 0, overrideCount: 0 };
const MatchScopeContext = createContext<MatchScopeValue | null>(null);
const ScopeCountsContext = createContext<ScopeCounts>(ZERO);

interface MatchScopeProviderProps {
  id?: string;
  /** This scope's own title matched the query. */
  titleMatch?: boolean;
  /** This scope itself counts as overridden (section-level flag). */
  overridden?: boolean;
  children: ReactNode;
}

/** Collects match/override reports from descendant field rows and nested
 *  scopes, exposes the totals to its owner (via `useScopeCounts`) and
 *  reports itself upward as one entry. Recounts are batched per commit. */
export function MatchScopeProvider({ id, titleMatch = false, overridden = false, children }: MatchScopeProviderProps) {
  const parent = useContext(MatchScopeContext);
  const search = useSettingsSearch();
  const autoId = useId();
  const scopeId = id ?? autoId;
  const entriesRef = useRef(new Map<string, ScopeEntry>());
  const [counts, setCounts] = useState<ScopeCounts>(ZERO);
  const scheduledRef = useRef(false);

  const recount = useCallback(() => {
    if (scheduledRef.current) return;
    scheduledRef.current = true;
    queueMicrotask(() => {
      scheduledRef.current = false;
      let matchCount = 0;
      let overrideCount = 0;
      for (const e of entriesRef.current.values()) {
        if (e.visible) matchCount++;
        if (e.overridden) overrideCount++;
      }
      setCounts((prev) =>
        prev.matchCount === matchCount && prev.overrideCount === overrideCount ? prev : { matchCount, overrideCount },
      );
    });
  }, []);

  const report = useCallback((childId: string, entry: ScopeEntry | null) => {
    if (entry === null) entriesRef.current.delete(childId);
    else entriesRef.current.set(childId, entry);
    recount();
  }, [recount]);

  const forceVisible = (parent?.forceVisible ?? false) || (titleMatch && !search.overriddenOnly);
  const value = useMemo<MatchScopeValue>(() => ({ report, forceVisible }), [report, forceVisible]);

  const selfVisible = forceVisible || counts.matchCount > 0;
  const selfOverridden = overridden || counts.overrideCount > 0;
  useLayoutEffect(() => {
    if (!parent) return;
    parent.report(scopeId, { visible: selfVisible, overridden: selfOverridden });
  }, [parent, scopeId, selfVisible, selfOverridden]);
  useLayoutEffect(() => {
    if (!parent) return;
    return () => parent.report(scopeId, null);
  }, [parent, scopeId]);

  return (
    <MatchScopeContext value={value}>
      <ScopeCountsContext value={counts}>{children}</ScopeCountsContext>
    </MatchScopeContext>
  );
}

/** Totals of the nearest enclosing `MatchScopeProvider`. */
export function useScopeCounts(): ScopeCounts {
  return useContext(ScopeCountsContext);
}

/** Field-level hook: computes whether a row passes the filter, reports it
 *  to the enclosing scope and returns what the row needs to render. */
export function useFieldMatch(haystack: string, overridden: boolean): { visible: boolean; tokens: readonly string[] } {
  const search = useSettingsSearch();
  const scope = useContext(MatchScopeContext);
  const id = useId();
  const tokens = search.matcher.tokens;
  const matched = tokens.length === 0 || (scope?.forceVisible ?? false) || search.matcher.test(haystack);
  const visible = matched && (!search.overriddenOnly || overridden);
  useLayoutEffect(() => {
    if (!scope) return;
    scope.report(id, { visible, overridden });
  }, [scope, id, visible, overridden]);
  useLayoutEffect(() => {
    if (!scope) return;
    return () => scope.report(id, null);
  }, [scope, id]);
  return { visible, tokens };
}

/** Whether the nearest scope (or the root) should be shown for the current
 *  filter: something inside matched, or its own title did. */
export function useScopeVisible(titleMatch: boolean, overridden = false): boolean {
  const search = useSettingsSearch();
  const { matchCount } = useScopeCounts();
  if (!search.active) return true;
  if (matchCount > 0) return true;
  const tokens = search.matcher.tokens;
  // "Modified only": a scope flagged overridden as a whole (e.g. a palette
  // with custom entries, whose rows are not field rows) stays visible.
  if (search.overriddenOnly) return overridden && (tokens.length === 0 || titleMatch);
  return titleMatch;
}
