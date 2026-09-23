'use client';

import { Check, ChevronDown, ChevronRight, Copy, Download, Eye, EyeOff, FilePlus, Files, ImagePlus, Pencil, Plus, RotateCcw, Trash2, Upload, X } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import {
  useSandboxLabels,
  useSandboxPresets,
  useSandboxProjects,
  type ProjectSummary,
} from '../context/SandboxContext';
import { Button, Collapsible, ConfirmPopover, EmptyState, IconButton, ListRow, Menu, MenuItem, MenuSeparator, PanelBody, PanelHeader, RowTag } from '../ui';
import { isPresetHideable, partitionPresets } from '../presets/hidden';
import { useBlobObjectUrl } from '../panels/resources/ResourcePreview';
import type { PresetSummary } from '../presets';
import { ChapterList } from './chapters/ChapterList';

/** Wraps `children` in a confirm popover only when confirmation is wanted;
 *  otherwise the trigger fires `onConfirm` directly. */
function MaybeConfirm({
  confirm,
  message,
  onConfirm,
  children,
}: {
  confirm: boolean;
  message: ReactNode;
  onConfirm: () => void;
  children: (open: () => void) => ReactNode;
}) {
  if (!confirm) return <>{children(onConfirm)}</>;
  return (
    <ConfirmPopover message={message} onConfirm={onConfirm}>
      {({ open }) => children(() => open())}
    </ConfirmPopover>
  );
}

/** The active row becomes a card that also holds the book's chapters: the
 *  row on top (no border of its own), the chapter list below it. */
function ActiveCard({ row, children }: { row: ReactNode; children?: ReactNode }) {
  return (
    <div className="overflow-hidden rounded border" style={{ borderColor: 'var(--gilt)' }}>
      {row}
      {children}
    </div>
  );
}

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

export function ProjectsPanel() {
  const labels = useSandboxLabels();
  const { presets, activePresetId, status, error, untouched, stale, updatedAt, hiddenIds, activeLocale, load, reload, hide, unhide } = useSandboxPresets();
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
    importBundle,
    exportProject,
    setThumbnail,
  } = projectsValue;
  const importRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [hiddenOpen, setHiddenOpen] = useState(false);

  const presetLoading = status === 'loading';
  const busy = presetLoading || projectStatus === 'busy';
  const inPresetMode = activeProjectId === null;
  const active = presets.find((p) => p.id === activePresetId);
  const canReload = !busy && (active?.available ?? false);
  const reloadAll = () => { void reload('all'); };
  // Leaving a preset with edits loses them; leaving a project loses nothing
  // (its edits are saved as they happen).
  const leavingLosesWork = inPresetMode && !untouched;
  const { visible: visiblePresets, hidden: hiddenPresets } = partitionPresets(presets, hiddenIds);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportError(null);
    try {
      await importBundle(file);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setImportError(/preset\.json|zip/i.test(message) ? labels.projectImportInvalid : `${labels.projectImportError} (${message})`);
    }
  };

  const presetRow = (preset: PresetSummary, hidden: boolean) => {
    const isActive = inPresetMode && preset.id === activePresetId;
    // The active preset is cloned / exported in the language it is shown
    // in; any other one in the viewer's.
    const locale = isActive && activeLocale ? activeLocale : undefined;
    return (
      <PresetRow
        key={preset.id}
        preset={preset}
        isActive={isActive}
        activeLocale={isActive ? activeLocale : null}
        disabled={busy || !preset.available}
        confirmLoad={leavingLosesWork}
        untouched={untouched}
        onLoad={() => { void load(preset.id); }}
        onLoadLocale={(l) => { void load(preset.id, l); }}
        onReload={reloadAll}
        onDuplicate={() => { void duplicate({ kind: 'preset', id: preset.id, locale }); }}
        onExport={() => { void exportProject({ kind: 'preset', id: preset.id, locale }); }}
        onHide={!hidden && isPresetHideable(preset.id) ? () => hide(preset.id) : undefined}
        onUnhide={hidden ? () => unhide(preset.id) : undefined}
      />
    );
  };

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        title={labels.projects}
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
          <Button variant="primary" size="xs" onClick={reloadAll} disabled={!canReload}>
            {labels.presetStaleReload}
          </Button>
        </div>
      )}
      <PanelBody padded>
        {busy && (
          <p className="mb-2 text-xs" style={{ color: 'var(--slate)' }} role="status">
            {presetLoading ? labels.presetLoading : labels.projectBusy}
          </p>
        )}
        {!busy && updatedAt !== null && (
          <p className="mb-2 text-xs" style={{ color: 'var(--gilt)' }} role="status" aria-live="polite">
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

        <GroupTitle>{labels.projects}</GroupTitle>
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
          <ul className="m-0 list-none p-0" aria-label={labels.projects}>
            {projects.map((project) => (
              <ProjectRow
                key={project.id}
                project={project}
                isActive={project.id === activeProjectId}
                disabled={busy}
                confirmSwitch={leavingLosesWork}
                onActivate={() => { void activate(project.id); }}
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
              className="flex cursor-pointer items-center gap-1 rounded border-0 bg-transparent px-1 py-1 text-[11px] text-(--slate) hover:text-(--foreground) focus-visible:outline-1 focus-visible:outline-offset-1 outline-(--gilt-hover)"
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
  /** Ask before opening: the active preset has unsaved edits. */
  confirmSwitch: boolean;
  onActivate: () => void;
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
  confirmSwitch,
  onActivate,
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
      {project.locale && <RowTag>{project.locale}</RowTag>}
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
        <span className="absolute inset-0 flex items-center justify-center" style={{ color: 'var(--gilt)', background: 'color-mix(in srgb, var(--background) 60%, transparent)' }}>
          <Check size={13} aria-hidden="true" />
        </span>
      )}
    </span>
  ) : (
    <span className="flex h-4 w-4 items-center justify-center" style={{ color: 'var(--gilt)' }}>
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
        className="flex h-12 w-9 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-sm border bg-transparent p-0 text-(--slate) hover:text-(--foreground) focus-visible:outline-1 focus-visible:outline-offset-1 outline-(--gilt-hover)"
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

  const row = (open?: () => void) => (
    <ListRow
      selected={isActive}
      disabled={disabled}
      className={isActive ? 'rounded-none border-0' : undefined}
      onSelect={editing || isActive ? undefined : open}
      onDoubleClick={isActive && !editing ? startRename : undefined}
      ariaLabel={isActive ? `${project.name} (${labels.presetActive})` : `${labels.projectActivate}: ${project.name}`}
      handle={editing ? coverEditor : undefined}
      leading={editing ? undefined : leading}
      title={title}
      subtitle={subtitle}
      tags={tags}
      alignTop={editing || !!project.description}
      actions={
        <>
          <IconButton size={18} label={labels.projectRename} icon={<Pencil size={13} />} disabled={disabled || editing} onClick={startRename} />
          <IconButton size={18} label={labels.projectDuplicate} icon={<Copy size={13} />} disabled={disabled} onClick={onDuplicate} />
          <IconButton size={18} label={labels.projectExport} icon={<Download size={13} />} disabled={disabled} onClick={onExport} />
          <ConfirmPopover message={labels.projectDeleteConfirm.replace('__name__', project.name)} onConfirm={onDelete}>
            {({ open: openConfirm }) => (
              <IconButton size={18} label={labels.projectDelete} icon={<Trash2 size={13} />} disabled={disabled} onClick={openConfirm} />
            )}
          </ConfirmPopover>
        </>
      }
    />
  );

  if (isActive) {
    return (
      <li className="mb-1">
        {coverInput}
        <ActiveCard row={row()}>
          <ChapterList title={labels.chapters} />
        </ActiveCard>
      </li>
    );
  }
  return (
    <li className="mb-0.5">
      {coverInput}
      {disabled ? row() : (
        <MaybeConfirm confirm={confirmSwitch} message={labels.projectSwitchConfirm.replace('__name__', project.name)} onConfirm={onActivate}>
          {(open) => row(open)}
        </MaybeConfirm>
      )}
    </li>
  );
}

/** Same language, ignoring region and case (`es-ES` is `es`). */
function sameLanguage(a: string, b: string): boolean {
  const base = (l: string) => l.toLowerCase().split(/[-_]/)[0]!;
  return base(a) === base(b);
}

interface PresetRowProps {
  preset: PresetSummary;
  isActive: boolean;
  /** The content locale the active preset is loaded in; null otherwise. */
  activeLocale: string | null;
  disabled: boolean;
  /** Ask before loading: the active preset has unsaved edits. */
  confirmLoad: boolean;
  untouched: boolean;
  onLoad: () => void;
  /** Load (or reload) the preset in one of its locales. */
  onLoadLocale: (locale: string) => void;
  onReload: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onHide?: () => void;
  onUnhide?: () => void;
}

function PresetRow({
  preset,
  isActive,
  activeLocale,
  disabled,
  confirmLoad,
  untouched,
  onLoad,
  onLoadLocale,
  onReload,
  onDuplicate,
  onExport,
  onHide,
  onUnhide,
}: PresetRowProps) {
  const labels = useSandboxLabels();
  const confirmMessage = labels.presetLoadConfirm.replace('__name__', preset.name);

  // A bilingual bundle lists every locale it carries; the primary one
  // otherwise. With more than one, each tag loads the preset in that
  // language — the active one is marked, the others reload (asking first
  // when there are edits to lose).
  const locales = preset.locales && preset.locales.length > 0
    ? preset.locales
    : preset.locale ? [preset.locale] : [];
  const localeTag = (l: string) => {
    if (locales.length < 2) return <RowTag key={l}>{l}</RowTag>;
    const code = l.toUpperCase();
    const current = isActive && activeLocale !== null && sameLanguage(activeLocale, l);
    if (current || disabled) {
      return (
        <RowTag key={l} accent={current} label={(current ? labels.presetLocaleActive : labels.presetLocaleLoad).replace('__locale__', code)}>
          {l}
        </RowTag>
      );
    }
    const confirm = isActive ? !untouched : confirmLoad;
    return (
      <MaybeConfirm key={l} confirm={confirm} message={isActive ? labels.presetReloadConfirm : confirmMessage} onConfirm={() => onLoadLocale(l)}>
        {(open) => (
          <RowTag onClick={open} pressed={false} label={labels.presetLocaleLoad.replace('__locale__', code)}>
            {l}
          </RowTag>
        )}
      </MaybeConfirm>
    );
  };
  const tags = (
    <>
      {locales.map(localeTag)}
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
  // Showcase presets carry a page thumbnail; the check mark of the active
  // preset sits over it.
  const leading = preset.thumbnailUrl ? (
    <span
      className="relative flex h-12 w-9 shrink-0 items-center justify-center overflow-hidden rounded-sm border"
      style={{ borderColor: 'var(--rule)', background: 'var(--surface)' }}
    >
      <img src={preset.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
      {isActive && (
        <span className="absolute inset-0 flex items-center justify-center" style={{ color: 'var(--gilt)', background: 'color-mix(in srgb, var(--background) 60%, transparent)' }}>
          <Check size={13} aria-hidden="true" />
        </span>
      )}
    </span>
  ) : (
    <span className="flex h-4 w-4 items-center justify-center" style={{ color: 'var(--gilt)' }}>
      {isActive && <Check size={13} aria-hidden="true" />}
    </span>
  );

  const row = (open?: () => void) => (
    <ListRow
      selected={isActive}
      disabled={disabled}
      className={isActive ? 'rounded-none border-0' : undefined}
      onSelect={isActive ? undefined : open}
      ariaLabel={isActive ? `${preset.name} (${labels.presetActive})` : `${labels.presetLoad}: ${preset.name}`}
      leading={leading}
      title={preset.name}
      subtitle={subtitle}
      tags={tags}
      alignTop={!!subtitle}
      actions={
        <>
          {isActive && preset.available && (
            <MaybeConfirm confirm={!untouched} message={labels.presetReloadConfirm} onConfirm={onReload}>
              {(openReload) => (
                <IconButton size={18} label={labels.presetReloadActive} icon={<RotateCcw size={13} />} disabled={disabled} onClick={openReload} />
              )}
            </MaybeConfirm>
          )}
          <IconButton size={18} label={labels.presetDuplicate} icon={<Copy size={13} />} disabled={disabled} onClick={onDuplicate} />
          <IconButton size={18} label={labels.presetExport} icon={<Download size={13} />} disabled={disabled} onClick={onExport} />
          {onHide && <IconButton size={18} label={labels.presetHide} icon={<EyeOff size={13} />} onClick={onHide} />}
          {onUnhide && <IconButton size={18} label={labels.presetUnhide} icon={<Eye size={13} />} onClick={onUnhide} />}
        </>
      }
    />
  );

  if (isActive) {
    // Preset mode: the working book belongs to this preset until a project
    // is created from it, so its chapters show here.
    return (
      <li className="mb-1">
        <ActiveCard row={row()}>
          <ChapterList title={labels.chapters} />
        </ActiveCard>
      </li>
    );
  }
  return (
    <li className="mb-0.5">
      {disabled ? row() : (
        <MaybeConfirm confirm={confirmLoad} message={confirmMessage} onConfirm={onLoad}>
          {(open) => row(open)}
        </MaybeConfirm>
      )}
    </li>
  );
}
