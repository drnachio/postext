'use client';

import { startTransition, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Search, X } from 'lucide-react';
import { useSandboxLabels } from '../../context/SandboxContext.js';
import { EmptyState, IconButton } from '../../ui/index.js';
import { useSettingsSearch } from '../search/SearchContext.js';
import { MatchScopeProvider, useScopeCounts } from '../search/MatchScope.js';
import type { SearchPlanGroup } from '../search/sectionIndex.js';
import { settingsGroup, type SettingsGroupId, type SettingsSectionId } from '../sections/registry.js';
import { SECTION_COMPONENTS } from '../sections/components.js';

/** ⌘K on Apple systems, Ctrl+K elsewhere. */
export function searchShortcutKeys(): string {
  const apple = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '');
  return apple ? '⌘K' : 'Ctrl+K';
}

/** The settings search box. The shortcut that focuses it is drawn in the
 *  empty box and handled by the panel. */
export function SearchInput({ value, onChange, inputRef }: { value: string; onChange: (v: string) => void; inputRef: RefObject<HTMLInputElement | null> }) {
  const labels = useSandboxLabels();
  const [keys, setKeys] = useState('');
  // Read after mount: the server does not know the platform.
  useEffect(() => { setKeys(searchShortcutKeys()); }, []);
  return (
    <div className="flex h-7 pt-large:min-h-11 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-(--pt-control-border) bg-(--surface) px-2 pt-large:ps-2 transition-colors focus-within:border-(--brand) focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-(--brand)">
      <Search size={13} aria-hidden="true" className="shrink-0 text-(--slate)" />
      <input
        dir="auto"
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            if (value) onChange('');
            else e.currentTarget.blur();
          }
        }}
        placeholder={labels.settingsSearchPlaceholder}
        aria-label={labels.settingsSearchPlaceholder}
        aria-keyshortcuts="Meta+K Control+K"
        title={keys ? labels.settingsSearchShortcut.replace('__keys__', keys) : undefined}
        autoComplete="off"
        spellCheck={false}
        className="peer min-w-0 pt-large:min-h-11 flex-1 bg-transparent text-xs text-(--foreground) outline-none placeholder:text-(--slate) [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <IconButton
          size={18}
          label={labels.settingsSearchClear}
          icon={<X size={12} />}
          tooltip={false}
          onClick={() => {
            onChange('');
            inputRef.current?.focus();
          }}
        />
      ) : keys && (
        <kbd aria-hidden="true" className="hidden shrink-0 rounded border border-(--rule) px-1 font-[inherit] text-[0.62rem] leading-[1.5] text-(--slate) peer-focus:hidden @[280px]:inline">
          {keys}
        </kbd>
      )}
    </div>
  );
}

/** The search results. Mounting a section is the expensive part (a large
 *  book's heading styles alone render thousands of rows), so the first
 *  section of the plan mounts with the query and the rest follow one per
 *  transition: the best hits show at once, typing is never blocked, and
 *  sections already mounted stay mounted while the query changes. */
export function SearchResults({ plan, query }: { plan: SearchPlanGroup[]; query: string }) {
  const labels = useSandboxLabels();
  const order = plan.flatMap((g) => g.sections);
  const orderKey = order.join(' ');
  const [mounted, setMounted] = useState<ReadonlySet<SettingsSectionId>>(() => new Set());
  const shown = new Set(order.filter((id, i) => i === 0 || mounted.has(id)));
  const next = order.find((id) => !shown.has(id));

  useEffect(() => {
    if (next === undefined) return;
    const inPlan = new Set(orderKey.split(' '));
    startTransition(() => {
      setMounted((prev) => {
        const kept = new Set([...prev].filter((id) => inPlan.has(id)));
        if (order[0] !== undefined) kept.add(order[0]);
        kept.add(next);
        return kept;
      });
    });
    // `order` is captured through `orderKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next, orderKey]);

  const pending = next !== undefined;
  return (
    <div aria-busy={pending}>
      {plan.map((g) => {
        const sections = g.sections.filter((id) => shown.has(id));
        if (sections.length === 0) return null;
        return (
          <SearchGroup key={g.id} id={g.id} title={String(labels[settingsGroup(g.id).labelKey])}>
            {sections.map((id) => {
              const Section = SECTION_COMPONENTS[id];
              return <Section key={id} />;
            })}
          </SearchGroup>
        );
      })}
      {pending ? (
        <p role="status" className="px-3 py-3 text-[0.68rem] text-(--slate)">{labels.settingsSearchLoading}</p>
      ) : (
        <NoResults query={query} />
      )}
    </div>
  );
}

/** One group in the search results: its name as a divider, then its
 *  sections. Hidden as a whole when nothing inside matches. */
function SearchGroup({ id, title, children }: { id: SettingsGroupId; title: string; children: ReactNode }) {
  return (
    <MatchScopeProvider id={`group:${id}`}>
      <SearchGroupBody title={title}>{children}</SearchGroupBody>
    </MatchScopeProvider>
  );
}

function SearchGroupBody({ title, children }: { title: string; children: ReactNode }) {
  const { matchCount } = useScopeCounts();
  return (
    <div style={matchCount > 0 ? undefined : { display: 'none' }}>
      <h3 className="px-3 pt-3 pb-1 text-[0.72rem] font-semibold tracking-[0.12em] text-(--slate) pt-caps">{title}</h3>
      {children}
    </div>
  );
}

function NoResults({ query }: { query: string }) {
  const labels = useSandboxLabels();
  const search = useSettingsSearch();
  const { matchCount } = useScopeCounts();
  if (!search.active || matchCount > 0) return null;
  return (
    <EmptyState
      icon={<Search size={28} />}
      title={search.matcher.tokens.length > 0 ? labels.settingsSearchNoResults.replace('__query__', query) : labels.settingsOverriddenOnlyEmpty}
    />
  );
}

/** Focus the search box on ⌘K / Ctrl+K while the Design panel is open. */
export function useSearchShortcut(inputRef: RefObject<HTMLInputElement | null>): void {
  const ref = useRef(inputRef);
  ref.current = inputRef;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'k' || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      const input = ref.current.current;
      if (!input) return;
      e.preventDefault();
      input.focus();
      input.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
