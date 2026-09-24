'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { Download, Upload, RotateCcw, Search, X, SlidersHorizontal } from 'lucide-react';
import { isDefaultColorPalette, stripConfigDefaults } from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxPresets, useSandboxProjects, useSandboxSelector } from '../context/SandboxContext';
import { exportConfigToJson, importConfigFromJson, loadSettingsCategory, saveSettingsCategory } from '../storage/persistence';
import { ChipTab, ChipTabs, ConfirmPopover, EmptyState, IconButton, PanelBody, PanelHeader, cn } from '../ui';
import { SettingsSearchContext, useSettingsSearch, type SettingsSearchState } from './search/SearchContext';
import { MatchScopeProvider, useScopeCounts } from './search/MatchScope';
import { compileMatcher } from './search/normalize';
import {
  SETTINGS_CATEGORIES,
  isSettingsCategoryFilter,
  sectionsInCategory,
  type SettingsCategoryFilter,
  type SettingsCategoryId,
  type SettingsSectionId,
} from './sections/registry';
import { categoryOverrideCounts } from './sections/sectionOverrides';
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

export function ConfigPanel() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const config = useSandboxSelector((s) => s.config);
  const presetConfig = useSandboxSelector((s) => s.presetConfig);
  const { reload } = useSandboxPresets();
  const { hasResetBaseline } = useSandboxProjects();
  const importRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

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

  const [category, setCategory] = useState<SettingsCategoryFilter>(() => {
    const saved = loadSettingsCategory();
    return isSettingsCategoryFilter(saved) ? saved : 'all';
  });
  const pickCategory = (next: SettingsCategoryFilter) => {
    setCategory(next);
    saveSettingsCategory(next);
  };

  // Jump to the top whenever a filter kicks in, so the first hit is visible.
  useEffect(() => {
    if (search.active) bodyRef.current?.scrollTo({ top: 0 });
  }, [search.active]);

  const overrideCounts = useMemo(() => categoryOverrideCounts(config), [config]);

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

  // A text query spans every category; "Modified only" respects the chip.
  const querying = search.matcher.tokens.length > 0;
  const showCategory = (id: SettingsCategoryId) => querying || category === 'all' || category === id;

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        title={labels.configuration}
        actions={
          <>
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
            />
          </>
        }
      />

      <div className="flex shrink-0 flex-col gap-2 border-b px-3 py-2" style={{ borderColor: 'var(--rule)' }}>
        <SearchInput value={query} onChange={setQuery} />
        <div className="flex flex-wrap items-center gap-1">
          <ChipTabs
            value={category}
            onValueChange={pickCategory}
            ariaLabel={labels.settingsCategories}
            className={cn(querying && 'opacity-50')}
          >
            <ChipTab value="all">{labels.settingsCategoryAll}</ChipTab>
            {SETTINGS_CATEGORIES.map((c) => (
              <ChipTab key={c.id} value={c.id} dot={overrideCounts[c.id] > 0}>
                {String(labels[c.labelKey])}
              </ChipTab>
            ))}
          </ChipTabs>
          <button
            type="button"
            aria-pressed={overriddenOnly}
            onClick={() => setOverriddenOnly((v) => !v)}
            className={cn(
              'ml-auto inline-flex h-6 cursor-pointer items-center gap-1 rounded-full border px-2 text-[11px] whitespace-nowrap transition-colors',
              'focus-visible:outline-1 focus-visible:outline-offset-1 outline-(--brand-hover)',
              overriddenOnly
                ? 'border-(--brand) bg-(--surface) text-(--brand)'
                : 'border-transparent text-(--slate) hover:text-(--foreground)',
            )}
          >
            <SlidersHorizontal size={11} aria-hidden="true" />
            {labels.settingsOverriddenOnly}
          </button>
        </div>
      </div>

      <SettingsSearchContext value={search}>
        <MatchScopeProvider id="root">
          <PanelBody ref={bodyRef}>
            {SETTINGS_CATEGORIES.map((c) => (
              <CategoryGroup
                key={c.id}
                id={c.id}
                title={String(labels[c.labelKey])}
                shown={showCategory(c.id)}
                showTitle={!querying && category === 'all'}
              >
                {sectionsInCategory(c.id).map((s) => {
                  const Section = SECTION_COMPONENTS[s.id];
                  return <Section key={s.id} />;
                })}
              </CategoryGroup>
            ))}
            <NoResults query={deferredQuery} />
          </PanelBody>
        </MatchScopeProvider>
      </SettingsSearchContext>
    </div>
  );
}

function SearchInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const labels = useSandboxLabels();
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div
      className="flex h-7 items-center gap-1.5 rounded border px-2 focus-within:border-(--brand)"
      style={{ borderColor: 'var(--rule)', backgroundColor: 'var(--surface)' }}
    >
      <Search size={13} aria-hidden="true" style={{ color: 'var(--slate)', flexShrink: 0 }} />
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
        className="min-w-0 flex-1 bg-transparent text-xs outline-none [&::-webkit-search-cancel-button]:hidden"
        style={{ color: 'var(--foreground)' }}
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

/** One category: a divider label (in the "All" view) plus its sections.
 *  Hidden as a whole while searching when nothing inside matches. */
function CategoryGroup({ id, title, shown, showTitle, children }: { id: SettingsCategoryId; title: string; shown: boolean; showTitle: boolean; children: ReactNode }) {
  return (
    <MatchScopeProvider id={`category:${id}`}>
      <CategoryGroupBody title={title} shown={shown} showTitle={showTitle}>{children}</CategoryGroupBody>
    </MatchScopeProvider>
  );
}

function CategoryGroupBody({ title, shown, showTitle, children }: { title: string; shown: boolean; showTitle: boolean; children: ReactNode }) {
  const search = useSettingsSearch();
  const { matchCount } = useScopeCounts();
  const visible = shown && (!search.active || matchCount > 0);
  return (
    <div style={visible ? undefined : { display: 'none' }}>
      {showTitle && (
        <div
          className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: 'var(--slate)' }}
        >
          {title}
        </div>
      )}
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
