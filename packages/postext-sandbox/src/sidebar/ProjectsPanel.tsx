'use client';

import { Plus, ChevronDown, Copy, FilePlus, Upload, X, Files, ChevronRight } from 'lucide-react';
import { type ReactNode, useRef, useState } from 'react';
import { pickBundleMeta } from 'postext/bundle';
import { sameContentLocale } from 'postext';
import { useSandboxLabels, useSandboxPresets, useSandboxProjects, useSandboxSelector, useSandboxDispatch, type ProjectSummary } from '../context/SandboxContext.js';
import { PanelHeader, Menu, Button, MenuItem, MenuSeparator, ConfirmPopover, PanelBody, Select, IconButton, EmptyState, Collapsible } from '../ui/index.js';
import { DOCUMENT_LOCALE_OPTIONS } from './sections/text/BodyTextSection/constants.js';
import { partitionPresets, isPresetHideable } from '../presets/hidden.js';
import { bundleContentLocales, choosePresetOpen } from '../presets/locale.js';
import { readBundleZipManifest } from '../presets/zip.js';
import { localeDisplayName } from '../presets/localeNames.js';
import type { PresetSummary } from '../presets/index.js';
import { presetCoverFor } from '../covers/autoCover.js';
import { openBookThenShowChapters } from './openBook.js';
import { openTextMigration } from '../migrate/migrationRequest.js';
import { PresetRow, ProjectRow } from './ProjectsPanel/rows.js';

function GroupTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mt-4 mb-1.5 flex items-center justify-between gap-2 first:mt-0">
      <h3 className="text-[13px] font-semibold pt-caps tracking-wide" style={{ color: 'var(--slate)' }}>
        {children}
      </h3>
      {actions}
    </div>
  );
}

/** The Books panel: your books and the sample books, with the New /
 *  Import menu and the status of the last operation. A row click opens the
 *  book and moves to the Chapters panel, where the open book is managed;
 *  the open one stays marked here. */
export function ProjectsPanel() {
  const labels = useSandboxLabels();
  const { presets, activePresetId, status, error, stale, updatedAt, hiddenIds, activeLocale, edited, drafts, covers, load, reload, restoreOriginal, hide, unhide } = useSandboxPresets();
  const projectsValue = useSandboxProjects();
  const {
    projects,
    activeProjectId,
    status: projectStatus,
    error: projectError,
    notice,
    dismissNotice,
    activate,
    create,
    duplicate,
    rename,
    remove,
    importBundleBytes,
    switchEdition,
    addEdition,
    exportProject,
    setThumbnail,
  } = projectsValue;
  const viewerLocale = useSandboxSelector((s) => s.locale);
  const dispatch = useSandboxDispatch();
  const activePanel = useSandboxSelector((s) => s.activePanel);
  const activePanelRef = useRef(activePanel);
  activePanelRef.current = activePanel;
  const showChapters = () => dispatch({ type: 'SET_PANEL', payload: 'chapters' });
  // A book picked here opens, then the sidebar shows its chapters.
  const openThenShow = (open: () => Promise<unknown>) => {
    void openBookThenShowChapters(open, { getPanel: () => activePanelRef.current, showChapters });
  };
  const importRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [hiddenOpen, setHiddenOpen] = useState(false);
  const [pendingImport, setPendingImport] = useState<{ bytes: Uint8Array; fileName: string; locales: string[]; own: string } | null>(null);
  // The book a language is being added to (#989), with the languages it has.
  const [adding, setAdding] = useState<{ id: string; name: string; taken: string[]; value: string } | null>(null);
  const languagesLeft = (taken: readonly string[]) => DOCUMENT_LOCALE_OPTIONS.filter((o) => !taken.some((t) => sameContentLocale(t, o.value)));
  // A book that names no language is read as the interface's (as the action does).
  const takenOf = (project: ProjectSummary): string[] => project.locales ?? [project.locale || viewerLocale];
  const startAddLanguage = (project: ProjectSummary) => {
    const taken = takenOf(project);
    const left = languagesLeft(taken);
    const preferred = left.find((o) => sameContentLocale(o.value, viewerLocale)) ?? left[0];
    if (preferred) setAdding({ id: project.id, name: project.name, taken, value: preferred.value });
  };

  const presetLoading = status === 'loading';
  const busy = presetLoading || projectStatus === 'busy';
  const inPresetMode = activeProjectId === null;
  const active = presets.find((p) => p.id === activePresetId);
  const canReload = !busy && (active?.available ?? false);
  const { visible: visiblePresets, hidden: hiddenPresets } = partitionPresets(presets, hiddenIds);

  const importBytes = async (bytes: Uint8Array, fileName: string, locale?: string) => {
    try {
      await importBundleBytes(bytes, fileName, locale ? { locale } : {});
      // A book that keeps its text in its styles (#874): offer to move it
      // (the dialog reads the book once it is on screen, and stays shut
      // when there is nothing to move).
      openTextMigration('import');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setImportError(/preset\.json|zip/i.test(message) ? labels.projectImportInvalid : `${labels.projectImportError} (${message})`);
    }
  };
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportError(null);
    setPendingImport(null);
    const bytes = new Uint8Array(await file.arrayBuffer());
    // A bundle in several languages asks which one to open, starting from
    // the one it is written in; any other opens as it is. Only its
    // manifest is inflated here: the import opens the archive once.
    let choice: ReturnType<typeof bundleContentLocales> = { locales: [], own: null };
    try {
      choice = bundleContentLocales(readBundleZipManifest(bytes));
    } catch {
      // Not a zip: the import reports it.
    }
    if (choice.locales.length > 1) {
      setPendingImport({ bytes, fileName: file.name, locales: choice.locales, own: choice.own ?? choice.locales[0]! });
      return;
    }
    await importBytes(bytes, file.name, choice.own ?? undefined);
  };

  const presetRow = (preset: PresetSummary, hidden: boolean) => {
    const isActive = inPresetMode && preset.id === activePresetId;
    const presetDrafts = drafts.filter((d) => d.presetId === preset.id);
    // What a click opens is what a copy copies: the active book as it is
    // on screen, else the preset's draft that would open, else the
    // original (in the language it is shown in, or the viewer's).
    const choice = choosePresetOpen({ summary: preset, current: isActive ? activeLocale : null, viewer: viewerLocale, drafts: presetDrafts });
    const locale = isActive && activeLocale ? activeLocale : undefined;
    // The title of the edition the row opens (#891).
    const names = preset.localized ? pickBundleMeta(preset, locale ?? choice.locale) : null;
    return (
      <PresetRow
        key={preset.id}
        preset={names ? { ...preset, name: names.name, description: names.description } : preset}
        isActive={isActive}
        activeLocale={isActive ? activeLocale : null}
        uiLocale={viewerLocale}
        editedLocales={presetDrafts.map((d) => d.locale)}
        disabled={busy || !preset.available}
        coverUrl={preset.thumbnailUrl ?? presetCoverFor(covers, preset.id, isActive && activeLocale ? activeLocale : choice.locale)}
        onLoad={() => openThenShow(() => load(preset.id))}
        onLoadLocale={(l) => openThenShow(() => load(preset.id, l))}
        onShowChapters={showChapters}
        onRestore={() => { void restoreOriginal(preset.id); }}
        onDuplicate={() => {
          if (isActive && edited) void create({ from: 'current' });
          else void duplicate({ kind: 'preset', id: preset.id, locale: choice.draft?.locale || locale, draftKey: choice.draft?.key });
        }}
        onExport={() => { void exportProject({ kind: 'preset', id: preset.id, locale }); }}
        onHide={!hidden && isPresetHideable(preset.id) ? () => hide(preset.id) : undefined}
        onUnhide={hidden ? () => unhide(preset.id) : undefined}
      />
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader
        title={labels.navBooks}
        actions={
          <>
            <Menu
              trigger={
                <Button variant="outline" size="xs" icon={<Plus size={12} />} trailingIcon={<ChevronDown size={12} />} disabled={busy}>
                  {labels.projectNew}
                </Button>
              }
            >
              <MenuItem icon={<Copy size={13} />} onClick={() => { void create({ from: 'current' }); }}>{labels.projectNewFromCurrentShort}</MenuItem>
              <MenuItem icon={<FilePlus size={13} />} onClick={() => { void create({ from: 'blank' }); }}>{labels.projectNewBlankShort}</MenuItem>
              <MenuSeparator />
              <MenuItem icon={<Upload size={13} />} onClick={() => importRef.current?.click()}>{labels.projectImportShort}</MenuItem>
            </Menu>
            {/* No `accept` filter (#1183): macOS gives `.postext` only a
                dynamic type, and the picker greys the files out now and
                then. The import reads the archive and reports a file that
                is not a book. */}
            <input
              ref={importRef}
              type="file"
              onChange={handleImport}
              className="hidden"
              aria-hidden="true"
            />
          </>
        }
      />
      {stale && inPresetMode && (
        <div
          role="status"
          className="flex shrink-0 items-start gap-2 border-b px-3 py-2 text-xs"
          style={{ borderColor: 'var(--rule)', backgroundColor: 'var(--surface)', color: 'var(--foreground)' }}
        >
          <span className="min-w-0 flex-1">{labels.presetStaleBanner}</span>
          {/* The new version replaces the edits: asked first. */}
          <ConfirmPopover message={labels.presetStaleReloadConfirm} onConfirm={() => { void reload('all'); }}>
            {({ open }) => (
              <Button variant="primary" size="xs" onClick={open} disabled={!canReload}>
                {labels.presetStaleReload}
              </Button>
            )}
          </ConfirmPopover>
        </div>
      )}
      <PanelBody padded>
        {busy && (
          <p className="mb-2 text-xs" style={{ color: 'var(--slate)' }} role="status">
            {presetLoading ? labels.presetLoading : labels.projectBusy}
          </p>
        )}
        {!busy && updatedAt !== null && (
          <p className="mb-2 text-xs" style={{ color: 'var(--brand)' }} role="status" aria-live="polite">
            {labels.presetUpdatedFromDisk}
          </p>
        )}
        {status === 'error' && (
          <p className="mb-2 text-xs" style={{ color: 'var(--destructive)' }} role="alert">
            {labels.presetLoadError}
            {error ? ` (${error})` : ''}
          </p>
        )}
        {projectStatus === 'error' && projectError && !importError && (
          <p className="mb-2 text-xs" style={{ color: 'var(--destructive)' }} role="alert">
            {projectError}
          </p>
        )}
        {importError && (
          <p className="mb-2 text-xs" style={{ color: 'var(--destructive)' }} role="alert">
            {importError}
          </p>
        )}
        {pendingImport && (
          <div
            role="group"
            aria-labelledby="postext-import-locale"
            className="mb-2 rounded border px-2 py-1.5 text-xs"
            style={{ borderColor: 'var(--rule)', color: 'var(--foreground)' }}
          >
            <p id="postext-import-locale" className="mb-1.5 break-words">
              {labels.projectImportLocale.replace('__name__', pendingImport.fileName)}
            </p>
            <div className="flex flex-wrap gap-1">
              {[pendingImport.own, ...pendingImport.locales.filter((l) => l !== pendingImport.own)].map((l) => (
                <Button
                  key={l}
                  variant={l === pendingImport.own ? 'primary' : 'outline'}
                  size="xs"
                  autoFocus={l === pendingImport.own}
                  disabled={busy}
                  onClick={() => {
                    const { bytes, fileName } = pendingImport;
                    setPendingImport(null);
                    void importBytes(bytes, fileName, l);
                  }}
                >
                  {localeDisplayName(l, viewerLocale)}
                </Button>
              ))}
              <Button variant="ghost" size="xs" onClick={() => setPendingImport(null)}>
                {labels.cancel}
              </Button>
            </div>
          </div>
        )}
        {adding && (
          <div
            role="group"
            aria-labelledby="postext-add-language"
            className="mb-2 rounded border px-2 py-1.5 text-xs"
            style={{ borderColor: 'var(--rule)', color: 'var(--foreground)' }}
          >
            <p id="postext-add-language" className="mb-1 break-words font-medium">
              {labels.projectAddLanguageTitle.replace('__name__', adding.name)}
            </p>
            <p className="mb-1.5 break-words" style={{ color: 'var(--slate)' }}>{labels.projectAddLanguageHint}</p>
            <div className="flex flex-wrap items-center gap-1">
              <Select
                size="sm"
                ariaLabel={labels.projectAddLanguagePick}
                value={adding.value}
                onValueChange={(value) => setAdding({ ...adding, value })}
                options={languagesLeft(adding.taken)}
                className="min-w-40"
              />
              <Button
                variant="primary"
                size="xs"
                disabled={busy}
                onClick={() => {
                  const { id, value } = adding;
                  setAdding(null);
                  void addEdition(id, value).catch(() => undefined);
                }}
              >
                {labels.projectAddLanguageConfirm}
              </Button>
              <Button variant="ghost" size="xs" onClick={() => setAdding(null)}>
                {labels.cancel}
              </Button>
            </div>
          </div>
        )}
        {notice && (
          <div
            role="status"
            className="mb-2 flex items-start gap-2 rounded border px-2 py-1.5 text-xs"
            style={{ borderColor: 'var(--rule)', color: 'var(--foreground)' }}
          >
            <span className="min-w-0 flex-1 break-words">{notice}</span>
            <IconButton size={18} label={labels.projectNoticeDismiss} icon={<X size={11} />} tooltip={false} onClick={dismissNotice} />
          </div>
        )}

        <GroupTitle>{labels.projectsGroupMine}</GroupTitle>
        {projects.length === 0 ? (
          <EmptyState
            icon={<Files size={28} />}
            title={labels.projectsEmptyTitle}
            description={labels.projectsEmptyDescription}
            action={
              <Button variant="outline" size="xs" icon={<Plus size={12} />} disabled={busy} onClick={() => { void create({ from: 'current' }); }}>
                {labels.projectNewFromCurrentShort}
              </Button>
            }
          />
        ) : (
          <ul className="m-0 list-none p-0" aria-label={labels.projectsGroupMine}>
            {projects.map((project) => (
              <ProjectRow
                key={project.id}
                project={project}
                isActive={project.id === activeProjectId}
                disabled={busy}
                onActivate={() => openThenShow(() => activate(project.id))}
                onActivateEdition={(locale) => openThenShow(() => switchEdition(project.id, locale))}
                uiLocale={viewerLocale}
                onShowChapters={showChapters}
                onRename={(name, description, opts) => { void rename(project.id, name, description, opts); }}
                onAddLanguage={() => startAddLanguage(project)}
                canAddLanguage={languagesLeft(takenOf(project)).length > 0}
                onDuplicate={() => { void duplicate({ kind: 'project', id: project.id }); }}
                onExport={() => { void exportProject({ kind: 'project', id: project.id }); }}
                onSetThumbnail={(file) => { void setThumbnail(project.id, file); }}
                onDelete={() => { void remove(project.id); }}
              />
            ))}
          </ul>
        )}

        <GroupTitle>{labels.presetsGroup}</GroupTitle>
        <ul className="m-0 list-none p-0" aria-label={labels.presetsGroup}>
          {visiblePresets.map((preset) => presetRow(preset, false))}
        </ul>
        {hiddenPresets.length > 0 && (
          <Collapsible.Root open={hiddenOpen} onOpenChange={setHiddenOpen} className="mt-1">
            <Collapsible.Trigger
              className="flex cursor-pointer items-center gap-1 rounded border-0 bg-transparent px-1 py-1 text-[11px] text-(--slate) hover:text-(--foreground) focus-visible:outline-2 focus-visible:outline-offset-1 outline-(--brand-hover)"
            >
              <ChevronRight size={12} aria-hidden="true" className="rtl:-scale-x-100" style={{ transform: hiddenOpen ? 'rotate(90deg)' : undefined, transition: 'transform 200ms ease' }} />
              {labels.presetsHidden.replace('__count__', String(hiddenPresets.length))}
            </Collapsible.Trigger>
            <Collapsible.Panel data-postext-collapsible="">
              <ul className="m-0 list-none p-0 pt-1" aria-label={labels.presetsHidden.replace('__count__', String(hiddenPresets.length))}>
                {hiddenPresets.map((preset) => presetRow(preset, true))}
              </ul>
            </Collapsible.Panel>
          </Collapsible.Root>
        )}
      </PanelBody>
    </div>
  );
}
