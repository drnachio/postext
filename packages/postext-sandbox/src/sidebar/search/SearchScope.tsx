'use client';

import { useMemo, type ReactNode } from 'react';
import { MatchScopeProvider, useScopeVisible } from './MatchScope';
import { useSettingsSearch } from './SearchContext';
import { normalizeText } from './normalize';
import { cn } from '../../ui/cn';

interface SearchScopeProps {
  /** Card title (matching it keeps the whole card visible). */
  title?: string;
  overridden?: boolean;
  className?: string;
  children: ReactNode;
}

/** Wraps a card that has no `CollapsibleSection` header (palette entry,
 *  paragraph/callout style card, header element editor) so the settings
 *  search can hide it when nothing inside matches. */
export function SearchScope({ title, overridden, className, children }: SearchScopeProps) {
  const search = useSettingsSearch();
  const normalized = useMemo(() => normalizeText(title ?? ''), [title]);
  const titleMatch = search.matcher.tokens.length > 0 && normalized.length > 0 && search.matcher.test(normalized);
  return (
    <MatchScopeProvider titleMatch={titleMatch} overridden={overridden}>
      <ScopeBody titleMatch={titleMatch} overridden={overridden} className={className}>{children}</ScopeBody>
    </MatchScopeProvider>
  );
}

function ScopeBody({ titleMatch, overridden, className, children }: { titleMatch: boolean; overridden?: boolean; className?: string; children: ReactNode }) {
  const visible = useScopeVisible(titleMatch, overridden);
  return (
    <div className={cn('contents', className)} style={visible ? undefined : { display: 'none' }}>
      {children}
    </div>
  );
}
