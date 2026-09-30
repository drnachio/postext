'use client';

import { Check, ChevronDown, ChevronRight, Copy, Download, Eye, EyeOff, FilePlus, Files, ImagePlus, Pencil, Plus, RotateCcw, Trash2, Upload, X } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import {
  useSandboxDispatch,
  useSandboxLabels,
  useSandboxPresets,
  useSandboxProjects,
  useSandboxSelector,
  type ProjectSummary,
} from '../context/SandboxContext';
import { Button, Collapsible, ConfirmPopover, EmptyState, IconButton, ListRow, Menu, MenuItem, MenuSeparator, PanelBody, PanelHeader, RowTag } from '../ui';
import { isPresetHideable, partitionPresets } from '../presets/hidden';
import { activeLocaleTag, bundleContentLocales, choosePresetOpen, presetLocales } from '../presets/locale';
import { readBundleZipManifest } from '../presets/zip';
import { localeDisplayName, localeShortTag } from '../presets/localeNames';
import { useBlobObjectUrl } from '../panels/resources/ResourcePreview';
import type { PresetSummary } from '../presets';
import { presetCoverFor } from '../covers/autoCover';
import { openBookThenShowChapters } from './openBook';
import { RowActionsMenu } from './RowActionsMenu';
import { LocaleTag } from './LocaleTag';

function GroupTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mt-4 mb-1.5 flex items-center justify-between gap-2 first:mt-0">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--slate)' }}>
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

  const presetLoading = status === 'loading';
  const busy = presetLoading || projectStatus === 'busy';
  const inPresetMode = activeProjectId === null;
  const active = presets.find((p) => p.id === activePresetId);
  const canReload = !busy && (active?.available ?? false);
  const { visible: visiblePresets, hidden: hiddenPresets } = partitionPresets(presets, hiddenIds);

  const importBytes = async (bytes: Uint8Array, fileName: string, locale?: string) => {
    try {
      await importBundleBytes(bytes, fileName, locale ? { locale } : {});
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
    return (
      <PresetRow
        key={preset.id}
        preset={preset}
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
            <input
              ref={importRef}
              type="file"
              accept=".postext,application/zip"
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
                onShowChapters={showChapters}
                onRename={(name, description) => { void rename(project.id, name, description); }}
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
              className="flex cursor-pointer items-center gap-1 rounded border-0 bg-transparent px-1 py-1 text-[11px] text-(--slate) hover:text-(--foreground) focus-visible:outline-1 focus-visible:outline-offset-1 outline-(--brand-hover)"
            >
              <ChevronRight size={12} aria-hidden="true" style={{ transform: hiddenOpen ? 'rotate(90deg)' : undefined, transition: 'transform 200ms ease' }} />
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

interface ProjectRowProps {
  project: ProjectSummary;
  isActive: boolean;
  disabled: boolean;
  onActivate: () => void;
  /** A click on the open book: the Chapters panel. */
  onShowChapters: () => void;
  onRename: (name: string, description: string) => void;
  onDuplicate: () => void;
  onExport: () => void;
  /** Set the cover picture from a file, or drop it with null. */
  onSetThumbnail: (file: File | null) => void;
  onDelete: () => void;
}

function ProjectRow({
  project,
  isActive,
  disabled,
  onActivate,
  onShowChapters,
  onRename,
  onDuplicate,
  onExport,
  onSetThumbnail,
  onDelete,
}: ProjectRowProps) {
  const labels = useSandboxLabels();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.name);
  const [descriptionDraft, setDescriptionDraft] = useState(project.description ?? '');
  const nameRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const coverUrl = useBlobObjectUrl(project.thumbnail?.fileId);
  // Set once the edit is committed or cancelled, so the blur of the field
  // being unmounted does not commit a second time.
  const settledRef = useRef(false);

  const startRename = () => {
    setDraft(project.name);
    setDescriptionDraft(project.description ?? '');
    settledRef.current = false;
    setEditing(true);
  };
  const cancelRename = () => {
    settledRef.current = true;
    setEditing(false);
  };
  // Name and description are one edit: committed together on Enter in
  // either field, or when focus leaves both.
  const commitRename = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    setEditing(false);
    const name = draft.trim() || project.name;
    const description = descriptionDraft.trim();
    if (name !== project.name || description !== (project.description ?? '')) onRename(name, description);
  };
  const fieldProps = {
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancelRename(); }
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
      if (e.relatedTarget === nameRef.current || e.relatedTarget === descriptionRef.current) return;
      commitRename();
    },
    style: { borderColor: 'var(--rule)', color: 'var(--foreground)' },
  };

  const title = editing ? (
    <input
      ref={nameRef}
      type="text"
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      aria-label={labels.projectNameLabel}
      className="min-w-0 w-full rounded border bg-transparent px-1.5 py-0.5 text-xs font-medium"
      {...fieldProps}
    />
  ) : (
    project.name
  );
  const subtitle = editing ? (
    <input
      ref={descriptionRef}
      type="text"
      value={descriptionDraft}
      onChange={(e) => setDescriptionDraft(e.target.value)}
      aria-label={labels.projectDescriptionLabel}
      placeholder={labels.projectDescriptionLabel}
      className="min-w-0 w-full rounded border bg-transparent px-1.5 py-0.5 text-[11px] font-normal"
      {...fieldProps}
    />
  ) : (
    project.description
  );

  const tags = (
    <>
      {project.locale && <LocaleTag locale={project.locale} />}
      {project.chapterCount > 1 && <RowTag>{labels.chapterCountTag.replace('__n__', String(project.chapterCount))}</RowTag>}
      {isActive && <RowTag accent>{labels.presetActive}</RowTag>}
    </>
  );

  // The cover picture, as in a showcase preset's row: the check mark of the
  // open project sits over it.
  const coverImage = coverUrl ? <img src={coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" /> : null;
  const leading = coverImage ? (
    <span
      className="relative flex h-12 w-9 shrink-0 items-center justify-center overflow-hidden rounded-sm border"
      style={{ borderColor: 'var(--rule)', background: 'var(--surface)' }}
    >
      {coverImage}
      {isActive && (
        <span className="absolute inset-0 flex items-center justify-center" style={{ color: 'var(--brand)', background: 'color-mix(in srgb, var(--background) 60%, transparent)' }}>
          <Check size={13} aria-hidden="true" />
        </span>
      )}
    </span>
  ) : (
    <span className="flex h-4 w-4 items-center justify-center" style={{ color: 'var(--brand)' }}>
      {isActive && <Check size={13} aria-hidden="true" />}
    </span>
  );
  // While the row is being edited the cover becomes the control that sets
  // it, in the handle slot — the leading cell is hidden from assistive
  // technology, and buttons do not belong there. A click must not blur the
  // fields: the row would commit and unmount these controls before it lands.
  const keepFocus = (e: React.MouseEvent) => { e.preventDefault(); };
  const coverEditor = (
    <span className="flex items-center gap-0.5">
      <button
        type="button"
        aria-label={labels.projectThumbnailChange}
        title={labels.projectThumbnailChange}
        onMouseDown={keepFocus}
        onClick={() => coverInputRef.current?.click()}
        className="flex h-12 w-9 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-sm border bg-transparent p-0 text-(--slate) hover:text-(--foreground) focus-visible:outline-1 focus-visible:outline-offset-1 outline-(--brand-hover)"
        style={{ borderColor: 'var(--rule)' }}
      >
        {coverImage ?? <ImagePlus size={14} aria-hidden="true" />}
      </button>
      {project.thumbnail && (
        <IconButton
          size={18}
          label={labels.projectThumbnailRemove}
          icon={<X size={11} />}
          onMouseDown={keepFocus}
          onClick={() => onSetThumbnail(null)}
        />
      )}
    </span>
  );
  // Always mounted: the file dialog takes the focus out of the row, and a
  // picker that unmounted with the edit would never report its file.
  const coverInput = (
    <input
      ref={coverInputRef}
      type="file"
      accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
      className="hidden"
      aria-hidden="true"
      onChange={(e) => {
        const file = e.target.files?.[0] ?? null;
        e.target.value = '';
        if (file) onSetThumbnail(file);
      }}
    />
  );

  const row = (
    <ListRow
      selected={isActive}
      disabled={disabled}
      onSelect={editing || disabled ? undefined : isActive ? onShowChapters : onActivate}
      ariaLabel={isActive ? `${project.name} (${labels.presetActive})` : `${labels.projectActivate}: ${project.name}`}
      handle={editing ? coverEditor : undefined}
      leading={editing ? undefined : leading}
      title={title}
      subtitle={subtitle}
      tags={tags}
      alignTop={editing || !!project.description}
      actions={
        <RowActionsMenu
          label={labels.rowMoreActions.replace('__name__', project.name)}
          disabled={disabled}
          confirmMessage={labels.projectDeleteConfirm.replace('__name__', project.name)}
          onConfirm={onDelete}
        >
          {(askDelete) => (
            <>
              <MenuItem icon={<Pencil size={13} />} disabled={editing} onClick={startRename}>{labels.projectRename}</MenuItem>
              <MenuItem icon={<Copy size={13} />} onClick={onDuplicate}>{labels.projectDuplicate}</MenuItem>
              <MenuItem icon={<Download size={13} />} onClick={onExport}>{labels.projectExport}</MenuItem>
              <MenuSeparator />
              <MenuItem icon={<Trash2 size={13} />} destructive onClick={askDelete}>{labels.projectDelete}</MenuItem>
            </>
          )}
        </RowActionsMenu>
      }
    />
  );

  return (
    <li className="mb-0.5">
      {coverInput}
      {row}
    </li>
  );
}

interface PresetRowProps {
  preset: PresetSummary;
  isActive: boolean;
  /** The content locale the active preset is loaded in; null otherwise. */
  activeLocale: string | null;
  /** The interface language, which names the locales in the tooltips. */
  uiLocale: string;
  /** Locales of this preset with a saved draft (the reader's edits). */
  editedLocales: string[];
  /** The cover: the one the preset ships, else the one taken from its
   *  first page. */
  coverUrl: string | undefined;
  disabled: boolean;
  onLoad: () => void;
  /** A click on the open book: the Chapters panel. */
  onShowChapters: () => void;
  /** Open the preset in one of its locales (its draft there, if any). */
  onLoadLocale: (locale: string) => void;
  /** Drop every draft of the preset (asked first). */
  onRestore: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onHide?: () => void;
  onUnhide?: () => void;
}

function PresetRow({
  preset,
  isActive,
  activeLocale,
  uiLocale,
  editedLocales,
  coverUrl,
  disabled,
  onLoad,
  onShowChapters,
  onLoadLocale,
  onRestore,
  onDuplicate,
  onExport,
  onHide,
  onUnhide,
}: PresetRowProps) {
  const labels = useSandboxLabels();
  const edited = editedLocales.length > 0;

  // A bilingual bundle lists every locale it carries; the primary one
  // otherwise. With more than one, each tag opens the preset in that
  // language (the reader's edits there, if any); the active one is marked.
  // The tags are short (繁 / 简 for the two Chinese editions, EN, ES) and
  // named in full in the interface language by their tooltips.
  const locales = presetLocales(preset);
  const activeTag = isActive ? activeLocaleTag(locales, activeLocale) : null;
  const localeTag = (l: string) => {
    const short = localeShortTag(l, locales);
    const text = short.lang ? <span lang={short.lang}>{short.text}</span> : short.text;
    const name = localeDisplayName(l, uiLocale);
    if (locales.length < 2) return <RowTag key={l} label={name}>{text}</RowTag>;
    const current = activeTag === l;
    const label = (current ? labels.presetLocaleActive : labels.presetLocaleLoad).replace('__locale__', name);
    if (current || disabled) {
      return (
        <RowTag key={l} accent={current} label={label}>
          {text}
        </RowTag>
      );
    }
    return (
      <RowTag key={l} onClick={() => onLoadLocale(l)} pressed={false} label={label}>
        {text}
      </RowTag>
    );
  };
  const editedHint = locales.length > 1 && edited
    ? `${labels.presetEditedHint} (${editedLocales.map((l) => (l ? localeDisplayName(l, uiLocale) : '?')).join(', ')})`
    : labels.presetEditedHint;
  const tags = (
    <>
      {locales.map(localeTag)}
      {edited && <RowTag label={editedHint}>{labels.presetEdited}</RowTag>}
      {preset.license && <RowTag>{preset.license}</RowTag>}
      {preset.source === 'private' && <RowTag>{labels.presetPrivate}</RowTag>}
      {preset.default && <RowTag>{labels.presetDefault}</RowTag>}
      {isActive && <RowTag accent>{labels.presetActive}</RowTag>}
    </>
  );
  const subtitle = !preset.available
    ? labels.presetUnavailable
    : preset.credits
      ? (
        <>
          {preset.description && <span>{preset.description}</span>}
          <span className="mt-0.5 block italic">{preset.credits}</span>
        </>
      )
      : preset.description;
  // Showcase presets carry a page thumbnail (the others get one from their
  // first page once opened); the check mark of the active preset sits over it.
  const leading = coverUrl ? (
    <span
      className="relative flex h-12 w-9 shrink-0 items-center justify-center overflow-hidden rounded-sm border"
      style={{ borderColor: 'var(--rule)', background: 'var(--surface)' }}
    >
      <img src={coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
      {isActive && (
        <span className="absolute inset-0 flex items-center justify-center" style={{ color: 'var(--brand)', background: 'color-mix(in srgb, var(--background) 60%, transparent)' }}>
          <Check size={13} aria-hidden="true" />
        </span>
      )}
    </span>
  ) : (
    <span className="flex h-4 w-4 items-center justify-center" style={{ color: 'var(--brand)' }}>
      {isActive && <Check size={13} aria-hidden="true" />}
    </span>
  );

  return (
    <li className="mb-0.5">
      <ListRow
        selected={isActive}
        disabled={disabled}
        onSelect={disabled ? undefined : isActive ? onShowChapters : onLoad}
        ariaLabel={isActive ? `${preset.name} (${labels.presetActive})` : `${labels.presetLoad}: ${preset.name}`}
        leading={leading}
        title={preset.name}
        subtitle={subtitle}
        tags={tags}
        alignTop={!!subtitle}
        actions={
          <RowActionsMenu
            label={labels.rowMoreActions.replace('__name__', preset.name)}
            disabled={disabled && !onHide && !onUnhide}
            confirmMessage={labels.presetRestoreConfirm.replace('__name__', preset.name)}
            onConfirm={onRestore}
          >
            {(askRestore) => (
              <>
                <MenuItem icon={<Copy size={13} />} disabled={disabled} onClick={onDuplicate}>{labels.presetDuplicate}</MenuItem>
                <MenuItem icon={<Download size={13} />} disabled={disabled} onClick={onExport}>{labels.presetExport}</MenuItem>
                {edited && (
                  <MenuItem icon={<RotateCcw size={13} />} disabled={disabled} onClick={askRestore}>
                    {labels.presetReloadActive}
                  </MenuItem>
                )}
                {(onHide || onUnhide) && <MenuSeparator />}
                {onHide && <MenuItem icon={<EyeOff size={13} />} onClick={onHide}>{labels.presetHide}</MenuItem>}
                {onUnhide && <MenuItem icon={<Eye size={13} />} onClick={onUnhide}>{labels.presetUnhide}</MenuItem>}
              </>
            )}
          </RowActionsMenu>
        }
      />
    </li>
  );
}
