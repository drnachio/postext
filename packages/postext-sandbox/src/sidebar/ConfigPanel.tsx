'use client';

import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, ChevronRight, CircleHelp, Download, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react';
import { isDefaultColorPalette, stripConfigDefaults } from 'postext';
import {
  useSandboxDispatch,
  useSandboxLabels,
  useSandboxPresets,
  useSandboxProjects,
  useSandboxResources,
  useSandboxSelector,
} from '../context/SandboxContext.js';
import {
  loadSettingsGroup,
  loadSettingsHelpMode,
  saveSettingsGroup,
  saveSettingsHelpMode,
} from '../storage/persistence.js';
import { ConfirmPopover, EmptyState, IconButton, PanelBody, PanelHeader, cn } from '../ui/index.js';
import { HelpModeContext } from '../controls/fieldContext.js';
import { SettingsSearchContext, useSettingsSearch, type SettingsSearchState } from './search/SearchContext.js';
import { MatchScopeProvider, useScopeCounts } from './search/MatchScope.js';
import { compileMatcher } from './search/normalize.js';
import { buildSectionSearchIndex, planSettingsSearch, type SearchPlanGroup } from './search/sectionIndex.js';
import {
  SETTINGS_GROUPS,
  isSettingsGroupId,
  sectionsInGroup,
  type SettingsGroupId,
  type SettingsSectionId,
} from './sections/registry.js';
import { groupOverrideCounts } from './sections/sectionOverrides.js';
import { GROUP_ICONS } from './settings/groupIcons.js';
import { SettingsHome } from './settings/SettingsHome.js';
import { DesignsPage } from './designs/DesignsPage.js';
import { DesignImportButton } from './designs/DesignImportButton.js';
import { PageGroupPreview } from './settings/PageGroupPreview.js';
import { PreviewHighlightProvider } from './settings/previewHighlight.js';
import { OpenSettingsGroupContext, onSettingsGroupRequest, onSettingsSectionRequest, onSettingsSwitchesRequest, pendingSettingsGroup, reportSettingsChangedOnly, takeSettingsFocus, takeSettingsSection } from '../context/settingsNavigation.js';
import { focusSettingsEntry } from './settingsFocus.js';
import { SECTION_COMPONENTS } from './sections/components.js';
import { ConfigScopeProvider } from './layers/ConfigScopeProvider.js';
import { ChapterStyleBar } from './layers/ChapterStyleBar.js';
import { ConfigScopeBar } from './layers/ConfigScopeBar.js';

/** The Design panel. Three views share one header and search box:
 *  - overview: a summary of the book and the list of setting groups;
 *  - a group page: only that group's sections are mounted;
 *  - search results (a query or "Changed only"): the sections that can hold
 *    a hit (see `search/sectionIndex.ts`) mount one after the other, best
 *    group first, and filter their rows in place under the group's name. */
export function ConfigPanel() {
  // A book in several languages: the sections read and write the layer in
  // scope (#1209).
  return (
    <ConfigScopeProvider>
      <ConfigPanelBody />
    </ConfigScopeProvider>
  );
}

function ConfigPanelBody() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const config = useSandboxSelector((s) => s.config);
  const presetConfig = useSandboxSelector((s) => s.presetConfig);
  const resources = useSandboxResources();
  const { reload } = useSandboxPresets();
  const { hasResetBaseline } = useSandboxProjects();
  const bodyRef = useRef<HTMLDivElement>(null);
  const groupButtons = useRef(new Map<SettingsGroupId, HTMLButtonElement>());
  const groupHeadingRef = useRef<HTMLHeadingElement>(null);
  /** Where focus goes after the next render (after a view switch). */
  const pendingFocus = useRef<'heading' | SettingsGroupId | null>(null);

  // Search state: the query is immediate (for the input), the matcher is
  // deferred so 500+ rows re-filter without blocking typing.
  const [query, setQuery] = useState('');
  const [overriddenOnly, setOverriddenOnly] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const matcher = useMemo(() => compileMatcher(deferredQuery), [deferredQuery]);
  const search = useMemo<SettingsSearchState>(
    () => ({ query, matcher, overriddenOnly, active: matcher.tokens.length > 0 || overriddenOnly }),
    [query, matcher, overriddenOnly],
  );

  const [group, setGroup] = useState<SettingsGroupId | null>(() => {
    // A section asked for from the pages (#865) opens its group.
    const asked = pendingSettingsGroup();
    if (asked) return asked;
    const saved = loadSettingsGroup();
    return isSettingsGroupId(saved) ? saved : null;
  });
  const [helpMode, setHelpMode] = useState(loadSettingsHelpMode);
  // The designs (#1523), a page of the panel as a group is.
  const [designs, setDesigns] = useState(false);

  const openGroup = (id: SettingsGroupId | null) => {
    pendingFocus.current = id === null ? group : 'heading';
    setDesigns(false);
    setGroup(id);
    saveSettingsGroup(id);
    bodyRef.current?.scrollTo({ top: 0 });
  };

  // A section pointing at a setting kept elsewhere (Body text → Writing
  // system) opens that group, leaving any search.
  const openGroupFromSection = useCallback((id: SettingsGroupId) => {
    setQuery('');
    setOverriddenOnly(false);
    setDesigns(false);
    pendingFocus.current = 'heading';
    setGroup(id);
    saveSettingsGroup(id);
    bodyRef.current?.scrollTo({ top: 0 });
  }, []);

  // A group asked for from outside the panel (the WebMCP tools).
  useEffect(() => onSettingsGroupRequest(openGroupFromSection), [openGroupFromSection]);
  // A section asked for from the pages (#865): its group opens, the group
  // page brings the section into view.
  const [sectionAsk, setSectionAsk] = useState(0);
  useEffect(() => onSettingsSectionRequest(({ group: g }) => {
    openGroupFromSection(g);
    setSectionAsk((n) => n + 1);
  }), [openGroupFromSection]);

  // The header's switches set from outside the panel, as their buttons set
  // them; the filter is reported back, since only the panel holds it.
  useEffect(() => onSettingsSwitchesRequest(({ help, changedOnly }) => {
    if (help !== undefined) {
      setHelpMode(help);
      saveSettingsHelpMode(help);
    }
    if (changedOnly !== undefined) setOverriddenOnly(changedOnly);
  }), []);
  useEffect(() => {
    reportSettingsChangedOnly(overriddenOnly);
    return () => reportSettingsChangedOnly(false);
  }, [overriddenOnly]);

  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    pendingFocus.current = null;
    if (target === 'heading') groupHeadingRef.current?.focus({ preventScroll: true });
    else groupButtons.current.get(target)?.focus();
  }, [group]);

  // Jump to the top whenever a filter kicks in, so the first hit is visible.
  useEffect(() => {
    if (search.active) bodyRef.current?.scrollTo({ top: 0 });
  }, [search.active]);

  const overrideCounts = useMemo(() => groupOverrideCounts(config), [config]);

  // "Overrides" means the config differs from the active preset's. When the
  // preset config is unknown (hydrated from an earlier session), fall back
  // to comparing against the engine defaults.
  const otherKeys = Object.keys(config).filter((k) => k !== 'colorPalette');
  const hasAnyOverrides = presetConfig
    ? JSON.stringify(stripConfigDefaults(config)) !== JSON.stringify(stripConfigDefaults(presetConfig))
    : otherKeys.length > 0 || !isDefaultColorPalette(config.colorPalette);

  const toggleHelp = () => {
    const next = !helpMode;
    setHelpMode(next);
    saveSettingsHelpMode(next);
  };

  const openDesigns = () => {
    setQuery('');
    setOverriddenOnly(false);
    setDesigns(true);
    bodyRef.current?.scrollTo({ top: 0 });
  };

  const view: 'search' | 'designs' | 'group' | 'home' = search.active ? 'search' : designs ? 'designs' : group ? 'group' : 'home';

  // Built only while searching: labels resolved in the viewer's language
  // plus the words the book itself puts in the rows.
  const searching = view === 'search';
  const searchIndex = useMemo(
    () => (searching ? buildSectionSearchIndex(labels, config, resources) : null),
    [searching, labels, config, resources],
  );
  const plan = useMemo(
    () => (searchIndex ? planSettingsSearch(searchIndex, matcher.tokens, overriddenOnly, config) : []),
    [searchIndex, matcher, overriddenOnly, config],
  );

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        title={labels.configuration}
        actions={
          <>
            <IconButton
              label={helpMode ? labels.settingsHelpModeOff : labels.settingsHelpModeOn}
              icon={<CircleHelp size={14} />}
              active={helpMode}
              onClick={toggleHelp}
            />
            {hasAnyOverrides && hasResetBaseline && (
              <ConfirmPopover message={labels.resetConfigConfirm} onConfirm={() => { void reload('config'); }}>
                {({ open }) => (
                  <IconButton label={labels.reset} icon={<RotateCcw size={14} />} onClick={open} />
                )}
              </ConfirmPopover>
            )}
            {/* Design files (#1523): the book's design out, a design into the gallery. */}
            <IconButton label={labels.designsExport} icon={<Download size={14} />} onClick={openDesigns} />
            <DesignImportButton onImported={openDesigns} />
          </>
        }
      />

      <ConfigScopeBar />
      <ChapterStyleBar />

      <div className="flex shrink-0 items-center gap-2 border-b border-(--rule) px-3 py-2">
        <SearchInput value={query} onChange={setQuery} />
        <button
          type="button"
          aria-pressed={overriddenOnly}
          onClick={() => setOverriddenOnly((v) => !v)}
          title={labels.settingsOverriddenOnlyHint}
          className={cn(
            'inline-flex h-7 pt-large:h-11 shrink-0 cursor-pointer items-center gap-1 rounded-md border px-2 pt-large:px-2.5 text-[0.68rem] whitespace-nowrap transition-colors',
            'focus-visible:outline-2 focus-visible:outline-offset-1 outline-(--brand)',
            overriddenOnly
              ? 'border-(--brand) bg-(--brand-soft,var(--surface)) text-(--foreground)'
              : 'border-(--pt-control-border) text-(--slate) hover:text-(--foreground)',
          )}
        >
          <SlidersHorizontal size={12} aria-hidden="true" />
          {labels.settingsOverriddenOnly}
        </button>
      </div>

      {(view === 'designs' || (view === 'group' && group)) && (
        <nav aria-label={labels.settingsBreadcrumb} className="flex h-9 pt-large:min-h-12 shrink-0 items-center gap-1 border-b border-(--rule) px-1.5">
          <button
            type="button"
            onClick={() => (view === 'designs' ? setDesigns(false) : openGroup(null))}
            className={cn(
              'inline-flex h-7 pt-large:h-11 cursor-pointer items-center gap-1 rounded-md px-1.5 pt-large:px-2 text-xs text-(--slate) transition-colors',
              'hover:bg-(--surface) hover:text-(--foreground) focus-visible:outline-2 focus-visible:-outline-offset-2 outline-(--brand)',
            )}
          >
            <ArrowLeft size={13} aria-hidden="true" className="rtl:-scale-x-100" />
            {labels.settingsBack}
          </button>
          <ChevronRight size={12} aria-hidden="true" className="text-(--slate) opacity-60 rtl:-scale-x-100" />
          <span aria-current="page" className="min-w-0 truncate text-xs font-medium text-(--foreground)">
            {view === 'designs' ? labels.designsRow : String(labels[SETTINGS_GROUPS.find((g) => g.id === group)!.labelKey])}
          </span>
        </nav>
      )}

      <HelpModeContext value={helpMode}>
        <OpenSettingsGroupContext value={openGroupFromSection}>
        <SettingsSearchContext value={search}>
          <MatchScopeProvider id="root">
            <PanelBody ref={bodyRef}>
              {view === 'home' && (
                <SettingsHome counts={overrideCounts} onOpen={openGroup} onOpenDesigns={openDesigns} buttonRefs={groupButtons.current} />
              )}
              {view === 'designs' && <DesignsPage />}
              {view === 'group' && group && (
                <GroupPage id={group} headingRef={groupHeadingRef} onOpen={openGroup} sectionAsk={sectionAsk} />
              )}
              {view === 'search' && <SearchResults plan={plan} query={deferredQuery} />}
            </PanelBody>
          </MatchScopeProvider>
        </SettingsSearchContext>
        </OpenSettingsGroupContext>
      </HelpModeContext>
    </div>
  );
}

function GroupPage({ id, headingRef, onOpen, sectionAsk }: {
  id: SettingsGroupId;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onOpen: (id: SettingsGroupId | null) => void;
  /** Bumped when a section of a group is asked for from the pages. */
  sectionAsk: number;
}) {
  const labels = useSandboxLabels();
  const entry = SETTINGS_GROUPS.find((g) => g.id === id)!;
  const Icon = GROUP_ICONS[id];
  const sections = sectionsInGroup(id);
  const index = SETTINGS_GROUPS.indexOf(entry);
  const next = SETTINGS_GROUPS[index + 1];
  const pageRef = useRef<HTMLDivElement>(null);

  const jumpTo = (sectionId: string) => {
    const el = pageRef.current?.querySelector<HTMLElement>(`[data-section-id="${sectionId}"]`);
    const scroller = pageRef.current?.parentElement;
    if (!el || !scroller) return;
    // Scroll only the panel body: scrollIntoView would also shift the
    // overflow-hidden frames around the sidebar.
    const top = scroller.scrollTop + el.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    scroller.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
    el.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
  };

  // A section asked for from the pages (#865): brought into view once the
  // group's sections are mounted.
  useEffect(() => {
    // Taken when shown, so an effect run twice (strict mode) still shows it.
    const raf = requestAnimationFrame(() => {
      const focus = takeSettingsFocus(id);
      const section = takeSettingsSection(id);
      if (!section) return;
      jumpTo(section);
      // The element or style asked for, inside the section (#899).
      const el = pageRef.current?.querySelector<HTMLElement>(`[data-section-id="${section}"]`);
      if (focus && el) focusSettingsEntry(el, pageRef.current?.parentElement ?? null, focus);
    });
    return () => cancelAnimationFrame(raf);
  }, [id, sectionAsk]);

  return (
    <PreviewHighlightProvider>
    <div ref={pageRef}>
      <header className="px-3 pt-3 pb-2">
        <h3
          ref={headingRef}
          tabIndex={-1}
          className="flex items-center gap-2 text-[0.9rem] leading-[1.35] font-semibold text-(--foreground) outline-none"
        >
          <Icon size={16} aria-hidden="true" className="text-(--brand)" />
          {String(labels[entry.labelKey])}
        </h3>
        <p className="mt-0.5 text-[0.72rem] leading-[1.4] text-(--slate) [text-wrap:pretty]">{String(labels[entry.descriptionKey])}</p>
        {sections.length > 1 && (
          <nav aria-label={labels.settingsJumpTo} className="mt-2.5 flex flex-wrap gap-1">
            {sections.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => jumpTo(s.id)}
                className={cn(
                  'inline-flex h-6 pt-large:h-11 cursor-pointer items-center rounded-full border border-(--pt-control-border) px-2 pt-large:px-3 text-[0.66rem] text-(--slate) transition-colors',
                  'hover:border-(--slate) hover:text-(--foreground) focus-visible:outline-2 focus-visible:outline-offset-1 outline-(--brand)',
                )}
              >
                {String(labels[s.labelKey])}
              </button>
            ))}
          </nav>
        )}
      </header>
      {(id === 'page' || id === 'writing') && <PageGroupPreview />}
      {sections.map((s) => {
        const Section = SECTION_COMPONENTS[s.id];
        return <Section key={s.id} />;
      })}
      {next && (
        <div className="px-3 py-4">
          <button
            type="button"
            onClick={() => onOpen(next.id)}
            className={cn(
              'flex pt-large:min-h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-(--pt-control-border) px-3 py-2 text-start transition-colors',
              'hover:bg-(--surface) focus-visible:outline-2 focus-visible:outline-offset-0 outline-(--brand)',
            )}
          >
            <span className="flex min-w-0 flex-col">
              <span className="text-[0.72rem] font-semibold tracking-[0.12em] text-(--slate) pt-caps">{labels.settingsNextGroup}</span>
              <span className="truncate text-[0.8rem] font-medium text-(--foreground)">{String(labels[next.labelKey])}</span>
            </span>
            <ArrowRight size={14} aria-hidden="true" className="shrink-0 text-(--slate) rtl:-scale-x-100" />
          </button>
        </div>
      )}
    </div>
    </PreviewHighlightProvider>
  );
}

function SearchInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const labels = useSandboxLabels();
  const inputRef = useRef<HTMLInputElement>(null);
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
        autoComplete="off"
        spellCheck={false}
        className="min-w-0 pt-large:min-h-11 flex-1 bg-transparent text-xs text-(--foreground) outline-none placeholder:text-(--slate) [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
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
      )}
    </div>
  );
}

/** The search results. Mounting a section is the expensive part (a large
 *  book's heading styles alone render thousands of rows), so the first
 *  section of the plan mounts with the query and the rest follow one per
 *  transition: the best hits show at once, typing is never blocked, and
 *  sections already mounted stay mounted while the query changes. */
function SearchResults({ plan, query }: { plan: SearchPlanGroup[]; query: string }) {
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
        const entry = SETTINGS_GROUPS.find((x) => x.id === g.id)!;
        return (
          <SearchGroup key={g.id} id={g.id} title={String(labels[entry.labelKey])}>
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
