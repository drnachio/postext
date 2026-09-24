'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, ChevronRight, CircleHelp, Download, RotateCcw, Search, SlidersHorizontal, Upload, X } from 'lucide-react';
import { isDefaultColorPalette, stripConfigDefaults } from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxPresets, useSandboxProjects, useSandboxSelector } from '../context/SandboxContext';
import {
  exportConfigToJson,
  importConfigFromJson,
  loadSettingsGroup,
  loadSettingsHelpMode,
  saveSettingsGroup,
  saveSettingsHelpMode,
} from '../storage/persistence';
import { ConfirmPopover, EmptyState, IconButton, PanelBody, PanelHeader, cn } from '../ui';
import { HelpModeContext } from '../controls/fieldContext';
import { SettingsSearchContext, useSettingsSearch, type SettingsSearchState } from './search/SearchContext';
import { MatchScopeProvider, useScopeCounts } from './search/MatchScope';
import { compileMatcher } from './search/normalize';
import {
  SETTINGS_GROUPS,
  isSettingsGroupId,
  sectionsInGroup,
  type SettingsGroupId,
  type SettingsSectionId,
} from './sections/registry';
import { groupOverrideCounts } from './sections/sectionOverrides';
import { GROUP_ICONS } from './settings/groupIcons';
import { DesignSummary } from './settings/DesignSummary';
import { PageGroupPreview } from './settings/PageGroupPreview';
import { PreviewHighlightProvider } from './settings/previewHighlight';
import { ColorPaletteSection } from './sections/ColorPaletteSection';
import { PageSection } from './sections/PageSection';
import { LayoutSection } from './sections/LayoutSection';
import { HeaderFooterSection } from './sections/HeaderFooterSection';
import { BodyTextSection } from './sections/BodyTextSection';
import { HeadingsSection } from './sections/HeadingsSection';
import { HeadingStylesSection } from './sections/HeadingStylesSection';
import { TocSection } from './sections/TocSection';
import { PartsSection } from './sections/PartsSection';
import { UnorderedListsSection } from './sections/UnorderedListsSection';
import { OrderedListsSection } from './sections/OrderedListsSection';
import { MathSection } from './sections/MathSection';
import { TableStyleSection } from './sections/TableStyleSection';
import { TableStylesSection } from './sections/TableStylesSection';
import { CaptionStyleSection } from './sections/CaptionStyleSection';
import { ParagraphStylesSection } from './sections/ParagraphStylesSection';
import { CalloutStylesSection } from './sections/CalloutStylesSection';
import { ChipStylesSection } from './sections/ChipStylesSection';
import { DiagramStyleSection } from './sections/DiagramStyleSection';
import { ResourceTypesSection } from './sections/ResourceTypesSection';
import { HtmlViewerSection } from './sections/HtmlViewerSection';
import { PdfGenerationSection } from './sections/PdfGenerationSection';
import { DebugSection } from './sections/DebugSection';
import { WarningsConfigSection } from './sections/WarningsConfigSection';

/** Section id → component. Kept here (not in the registry) so the registry
 *  stays a pure, testable data module. */
const SECTION_COMPONENTS: Record<SettingsSectionId, ComponentType> = {
  'page': PageSection,
  'layout': LayoutSection,
  'color-palette': ColorPaletteSection,
  'headerFooter': HeaderFooterSection,
  'parts': PartsSection,
  'bodyText': BodyTextSection,
  'headings': HeadingsSection,
  'headingStyles': HeadingStylesSection,
  'toc': TocSection,
  'paragraphStyles': ParagraphStylesSection,
  'unordered-lists': UnorderedListsSection,
  'ordered-lists': OrderedListsSection,
  'math': MathSection,
  'resource-types': ResourceTypesSection,
  'captionStyle': CaptionStyleSection,
  'tableStyle': TableStyleSection,
  'tableStyles': TableStylesSection,
  'diagramStyle': DiagramStyleSection,
  'calloutStyles': CalloutStylesSection,
  'chipStyles': ChipStylesSection,
  'htmlViewer': HtmlViewerSection,
  'pdfGeneration': PdfGenerationSection,
  'debug': DebugSection,
  'warnings': WarningsConfigSection,
};

/** The Design panel. Three views share one header and search box:
 *  - overview: a summary of the book and the list of setting groups;
 *  - a group page: only that group's sections are mounted;
 *  - search results (a query or "Changed only"): every section is mounted
 *    and filtered in place, under its group's name. */
export function ConfigPanel() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const config = useSandboxSelector((s) => s.config);
  const presetConfig = useSandboxSelector((s) => s.presetConfig);
  const { reload } = useSandboxPresets();
  const { hasResetBaseline } = useSandboxProjects();
  const importRef = useRef<HTMLInputElement>(null);
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
    const saved = loadSettingsGroup();
    return isSettingsGroupId(saved) ? saved : null;
  });
  const [helpMode, setHelpMode] = useState(loadSettingsHelpMode);

  const openGroup = (id: SettingsGroupId | null) => {
    pendingFocus.current = id === null ? group : 'heading';
    setGroup(id);
    saveSettingsGroup(id);
    bodyRef.current?.scrollTo({ top: 0 });
  };

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

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await importConfigFromJson(file);
      dispatch({ type: 'SET_CONFIG', payload: data.config });
    } catch {
      // Silently ignore invalid files
    }
    e.target.value = '';
  };

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

  const view: 'search' | 'group' | 'home' = search.active ? 'search' : group ? 'group' : 'home';

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
            <IconButton label={labels.exportFile} icon={<Download size={14} />} onClick={() => exportConfigToJson(config)} />
            <IconButton label={labels.importFile} icon={<Upload size={14} />} onClick={() => importRef.current?.click()} />
            <input
              ref={importRef}
              type="file"
              accept=".json"
              onChange={handleImport}
              className="hidden"
              aria-hidden="true"
              tabIndex={-1}
            />
          </>
        }
      />

      <div className="flex shrink-0 items-center gap-2 border-b border-(--rule) px-3 py-2">
        <SearchInput value={query} onChange={setQuery} />
        <button
          type="button"
          aria-pressed={overriddenOnly}
          onClick={() => setOverriddenOnly((v) => !v)}
          title={labels.settingsOverriddenOnlyHint}
          className={cn(
            'inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md border px-2 text-[0.68rem] whitespace-nowrap transition-colors',
            'focus-visible:outline-2 focus-visible:outline-offset-1 outline-(--brand)',
            overriddenOnly
              ? 'border-(--brand) bg-(--brand-soft,var(--surface)) text-(--foreground)'
              : 'border-(--rule) text-(--slate) hover:text-(--foreground)',
          )}
        >
          <SlidersHorizontal size={12} aria-hidden="true" />
          {labels.settingsOverriddenOnly}
        </button>
      </div>

      {view === 'group' && group && (
        <nav aria-label={labels.settingsBreadcrumb} className="flex h-9 shrink-0 items-center gap-1 border-b border-(--rule) px-1.5">
          <button
            type="button"
            onClick={() => openGroup(null)}
            className={cn(
              'inline-flex h-7 cursor-pointer items-center gap-1 rounded-md px-1.5 text-xs text-(--slate) transition-colors',
              'hover:bg-(--surface) hover:text-(--foreground) focus-visible:outline-2 focus-visible:outline-offset-0 outline-(--brand)',
            )}
          >
            <ArrowLeft size={13} aria-hidden="true" />
            {labels.settingsBack}
          </button>
          <ChevronRight size={12} aria-hidden="true" className="text-(--slate) opacity-60" />
          <span aria-current="page" className="min-w-0 truncate text-xs font-medium text-(--foreground)">
            {String(labels[SETTINGS_GROUPS.find((g) => g.id === group)!.labelKey])}
          </span>
        </nav>
      )}

      <HelpModeContext value={helpMode}>
        <SettingsSearchContext value={search}>
          <MatchScopeProvider id="root">
            <PanelBody ref={bodyRef}>
              {view === 'home' && (
                <SettingsHome counts={overrideCounts} onOpen={openGroup} buttonRefs={groupButtons.current} />
              )}
              {view === 'group' && group && (
                <GroupPage id={group} headingRef={groupHeadingRef} onOpen={openGroup} />
              )}
              {view === 'search' && (
                <>
                  {SETTINGS_GROUPS.map((g) => (
                    <SearchGroup key={g.id} id={g.id} title={String(labels[g.labelKey])}>
                      {sectionsInGroup(g.id).map((s) => {
                        const Section = SECTION_COMPONENTS[s.id];
                        return <Section key={s.id} />;
                      })}
                    </SearchGroup>
                  ))}
                  <NoResults query={deferredQuery} />
                </>
              )}
            </PanelBody>
          </MatchScopeProvider>
        </SettingsSearchContext>
      </HelpModeContext>
    </div>
  );
}

function SettingsHome({ counts, onOpen, buttonRefs }: {
  counts: Record<SettingsGroupId, number>;
  onOpen: (id: SettingsGroupId) => void;
  buttonRefs: Map<SettingsGroupId, HTMLButtonElement>;
}) {
  const labels = useSandboxLabels();
  return (
    <>
      <DesignSummary onOpenGroup={onOpen} />
      <h3 className="px-3 pt-4 pb-1.5 text-[0.6rem] font-semibold tracking-[0.12em] text-(--slate) uppercase">
        {labels.settingsGroupsHeading}
      </h3>
      <ul className="flex flex-col px-1.5 pb-3">
        {SETTINGS_GROUPS.map((g) => {
          const Icon = GROUP_ICONS[g.id];
          const count = counts[g.id];
          return (
            <li key={g.id}>
              <button
                type="button"
                ref={(el) => { if (el) buttonRefs.set(g.id, el); else buttonRefs.delete(g.id); }}
                onClick={() => onOpen(g.id)}
                className={cn(
                  'group/row flex w-full cursor-pointer items-center gap-3 rounded-lg px-1.5 py-2 text-left transition-colors',
                  'hover:bg-(--surface) focus-visible:outline-2 focus-visible:-outline-offset-2 outline-(--brand)',
                )}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-(--rule) bg-(--surface) text-(--brand)">
                  <Icon size={16} aria-hidden="true" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[0.8rem] leading-[1.35] font-medium text-(--foreground)">{String(labels[g.labelKey])}</span>
                  <span className="text-[0.68rem] leading-[1.35] text-(--slate) [text-wrap:pretty]">{String(labels[g.descriptionKey])}</span>
                </span>
                {count > 0 && (
                  <span className="inline-flex shrink-0 items-center gap-1 text-[0.66rem] text-(--brand) tabular-nums">
                    <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-(--brand)" />
                    <span aria-hidden="true">{count}</span>
                    <span className="sr-only">
                      {(count === 1 ? labels.settingsGroupModifiedOne : labels.settingsGroupModifiedMany).replace('__count__', String(count))}
                    </span>
                  </span>
                )}
                <ChevronRight size={14} aria-hidden="true" className="shrink-0 text-(--slate) transition-transform group-hover/row:translate-x-0.5" />
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function GroupPage({ id, headingRef, onOpen }: {
  id: SettingsGroupId;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onOpen: (id: SettingsGroupId | null) => void;
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
    if (!el) return;
    el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    el.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
  };

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
                  'inline-flex h-6 cursor-pointer items-center rounded-full border border-(--rule) px-2 text-[0.66rem] text-(--slate) transition-colors',
                  'hover:border-(--rule-strong,var(--slate)) hover:text-(--foreground) focus-visible:outline-2 focus-visible:outline-offset-1 outline-(--brand)',
                )}
              >
                {String(labels[s.labelKey])}
              </button>
            ))}
          </nav>
        )}
      </header>
      {id === 'page' && <PageGroupPreview />}
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
              'flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-(--rule) px-3 py-2 text-left transition-colors',
              'hover:bg-(--surface) focus-visible:outline-2 focus-visible:outline-offset-0 outline-(--brand)',
            )}
          >
            <span className="flex min-w-0 flex-col">
              <span className="text-[0.6rem] font-semibold tracking-[0.12em] text-(--slate) uppercase">{labels.settingsNextGroup}</span>
              <span className="truncate text-[0.8rem] font-medium text-(--foreground)">{String(labels[next.labelKey])}</span>
            </span>
            <ArrowRight size={14} aria-hidden="true" className="shrink-0 text-(--slate)" />
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
    <div className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-(--rule) bg-(--surface) px-2 transition-colors focus-within:border-(--brand)">
      <Search size={13} aria-hidden="true" className="shrink-0 text-(--slate)" />
      <input
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
        className="min-w-0 flex-1 bg-transparent text-xs text-(--foreground) outline-none placeholder:text-(--slate) [&::-webkit-search-cancel-button]:hidden"
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
      <h3 className="px-3 pt-3 pb-1 text-[0.6rem] font-semibold tracking-[0.12em] text-(--slate) uppercase">{title}</h3>
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
