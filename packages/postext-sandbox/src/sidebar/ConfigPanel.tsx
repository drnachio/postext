'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { CircleHelp, Download, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { isDefaultColorPalette, stripConfigDefaults } from 'postext';
import {
  useSandboxLabels,
  useSandboxPresets,
  useSandboxProjects,
  useSandboxResources,
  useSandboxSelector,
} from '../context/SandboxContext.js';
import {
  loadSettingsGroup,
  loadSettingsHelpMode,
  loadSettingsSections,
  saveSettingsGroup,
  saveSettingsHelpMode,
  saveSettingsSections,
} from '../storage/persistence.js';
import { ConfirmPopover, IconButton, PanelBody, PanelHeader, cn } from '../ui/index.js';
import { HelpModeContext } from '../controls/fieldContext.js';
import { SettingsSearchContext, type SettingsSearchState } from './search/SearchContext.js';
import { MatchScopeProvider } from './search/MatchScope.js';
import { compileMatcher } from './search/normalize.js';
import { buildSectionSearchIndex, planSettingsSearch } from './search/sectionIndex.js';
import {
  SETTINGS_SECTIONS,
  isSettingsGroupId,
  sectionsInGroup,
  type SettingsGroupId,
  type SettingsSectionId,
} from './sections/registry.js';
import { groupOverrideCounts, sectionHasOverrides } from './sections/sectionOverrides.js';
import { DesignsPage } from './designs/DesignsPage.js';
import { DesignImportButton } from './designs/DesignImportButton.js';
import { OpenSettingsGroupContext, onSettingsGroupRequest, onSettingsSectionRequest, onSettingsSwitchesRequest, pendingSettingsGroup, reportSettingsChangedOnly, takeSettingsFocus, takeSettingsSection, type SettingsFocus } from '../context/settingsNavigation.js';
import { ConfigScopeProvider } from './layers/ConfigScopeProvider.js';
import { ChapterStyleBar } from './layers/ChapterStyleBar.js';
import { ConfigScopeBar } from './layers/ConfigScopeBar.js';
import { SettingsOverview } from './shell/SettingsOverview.js';
import { GroupBar } from './shell/GroupBar.js';
import { SectionTabs } from './shell/SectionTabs.js';
import { GroupPage } from './shell/GroupPage.js';
import { DesignsBar } from './shell/DesignsBar.js';
import { SearchInput, SearchResults, useSearchShortcut } from './shell/SettingsSearch.js';

/** The Design panel. Four views share one header and search box:
 *  - overview: a summary of the book and the groups of settings;
 *  - a group: its sections as tabs, the open one alone mounted;
 *  - the designs;
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

/** The section of `group` that `chosen` names, or the group's first. */
function sectionOf(group: SettingsGroupId, chosen: Readonly<Record<string, string>>): SettingsSectionId {
  const sections = sectionsInGroup(group);
  return sections.find((s) => s.id === chosen[group])?.id ?? sections[0]!.id;
}

function ConfigPanelBody() {
  const labels = useSandboxLabels();
  const config = useSandboxSelector((s) => s.config);
  const presetConfig = useSandboxSelector((s) => s.presetConfig);
  const resources = useSandboxResources();
  const { reload } = useSandboxPresets();
  const { hasResetBaseline } = useSandboxProjects();
  const bodyRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const groupButtons = useRef(new Map<SettingsGroupId, HTMLButtonElement>());
  const groupHeadingRef = useRef<HTMLButtonElement>(null);
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
  useSearchShortcut(searchRef);

  const [group, setGroup] = useState<SettingsGroupId | null>(() => {
    // A section asked for from the pages (#865) opens its group.
    const asked = pendingSettingsGroup();
    if (asked) return asked;
    const saved = loadSettingsGroup();
    return isSettingsGroupId(saved) ? saved : null;
  });
  // The section open in each group: a group opens where it was left.
  const [chosen, setChosen] = useState<Record<string, string>>(loadSettingsSections);
  // The entry of the open section to bring into view (#899).
  const [entry, setEntry] = useState<SettingsFocus | null>(null);
  const [helpMode, setHelpMode] = useState(loadSettingsHelpMode);
  // The designs (#1523), a page of the panel as a group is.
  const [designs, setDesigns] = useState(false);

  const openSection = useCallback((g: SettingsGroupId, id: SettingsSectionId) => {
    setChosen((prev) => {
      if (prev[g] === id) return prev;
      const next = { ...prev, [g]: id };
      saveSettingsSections(next);
      return next;
    });
    bodyRef.current?.scrollTo({ top: 0 });
  }, []);

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

  // A section asked for from the pages (#865): its group opens on that
  // section's tab, and the entry asked for (#899) is brought into view.
  // The request waits in `settingsNavigation` when the panel was closed:
  // taken here, once the group is on screen.
  const takeRequest = useCallback((g: SettingsGroupId) => {
    const focus = takeSettingsFocus(g);
    const asked = takeSettingsSection(g);
    const section = SETTINGS_SECTIONS.find((s) => s.id === asked && s.group === g);
    if (!section) return;
    openSection(g, section.id);
    setEntry(focus);
  }, [openSection]);
  useEffect(() => onSettingsSectionRequest(({ group: g }) => {
    openGroupFromSection(g);
    takeRequest(g);
  }), [openGroupFromSection, takeRequest]);
  useEffect(() => {
    if (group) takeRequest(group);
    // On mount only: later requests come through the listener above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const entryShown = useCallback(() => setEntry(null), []);

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
  const sections = useMemo(() => (group ? sectionsInGroup(group) : []), [group]);
  const changedSections = useMemo(
    () => new Set(sections.filter((s) => sectionHasOverrides(config, s.id)).map((s) => s.id)),
    [sections, config],
  );

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
  const section = group ? sectionOf(group, chosen) : null;

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

      <div className="@container flex shrink-0 items-center gap-2 border-b border-(--rule) px-3 py-2">
        <SearchInput value={query} onChange={setQuery} inputRef={searchRef} />
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

      {view === 'designs' && <DesignsBar onBack={() => setDesigns(false)} />}
      {view === 'group' && group && section && (
        <>
          <GroupBar group={group} counts={overrideCounts} onBack={() => openGroup(null)} onOpen={openGroup} headingRef={groupHeadingRef} />
          {sections.length > 1 && (
            <SectionTabs sections={sections} active={section} changed={changedSections} onSelect={(id) => openSection(group, id)} />
          )}
        </>
      )}

      <HelpModeContext value={helpMode}>
        <OpenSettingsGroupContext value={openGroupFromSection}>
        <SettingsSearchContext value={search}>
          <MatchScopeProvider id="root">
            <PanelBody ref={bodyRef}>
              {view === 'home' && (
                <SettingsOverview counts={overrideCounts} onOpen={openGroup} onOpenDesigns={openDesigns} buttonRefs={groupButtons.current} />
              )}
              {view === 'designs' && <DesignsPage />}
              {view === 'group' && group && section && (
                <GroupPage group={group} section={section} entry={entry} onEntryShown={entryShown} />
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
