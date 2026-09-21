'use client';

import { Check, ChevronDown, ChevronRight, Copy, Download, Eye, EyeOff, FilePlus, Files, Pencil, Plus, RotateCcw, Trash2, Upload, X } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import {
  useSandboxLabels,
  useSandboxPresets,
  useSandboxProjects,
  type ProjectSummary,
} from '../context/SandboxContext';
import { Button, Collapsible, ConfirmPopover, EmptyState, IconButton, ListRow, Menu, MenuItem, MenuSeparator, PanelBody, PanelHeader, RowTag } from '../ui';
import { isPresetHideable, partitionPresets } from '../presets/hidden';
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
  const { presets, activePresetId, status, error, untouched, stale, updatedAt, hiddenIds, load, reload, hide, unhide } = useSandboxPresets();
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

  const presetRow = (preset: PresetSummary, hidden: boolean) => (
    <PresetRow
      key={preset.id}
      preset={preset}
      isActive={inPresetMode && preset.id === activePresetId}
      disabled={busy || !preset.available}
      confirmLoad={leavingLosesWork}
      untouched={untouched}
      onLoad={() => { void load(preset.id); }}
      onReload={reloadAll}
      onDuplicate={() => { void duplicate({ kind: 'preset', id: preset.id }); }}
      onExport={() => { void exportProject({ kind: 'preset', id: preset.id }); }}
      onHide={!hidden && isPresetHideable(preset.id) ? () => hide(preset.id) : undefined}
      onUnhide={hidden ? () => unhide(preset.id) : undefined}
    />
  );

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
            <IconButton label={labels.projectExportActive} icon={<Download size={14} />} disabled={busy} onClick={() => { void exportProject(); }} />
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
  onDelete,
}: ProjectRowProps) {
  const labels = useSandboxLabels();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.name);
  const [descriptionDraft, setDescriptionDraft] = useState(project.description ?? '');
  const nameRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);
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

  const row = (open?: () => void) => (
    <ListRow
      selected={isActive}
      disabled={disabled}
      className={isActive ? 'rounded-none border-0' : undefined}
      onSelect={editing || isActive ? undefined : open}
      onDoubleClick={isActive && !editing ? startRename : undefined}
      ariaLabel={isActive ? `${project.name} (${labels.presetActive})` : `${labels.projectActivate}: ${project.name}`}
      leading={
        <span className="flex h-4 w-4 items-center justify-center" style={{ color: 'var(--gilt)' }}>
          {isActive && <Check size={13} aria-hidden="true" />}
        </span>
      }
      title={title}
      subtitle={subtitle}
      tags={tags}
      alignTop={editing || !!project.description}
      actions={
        <>
          <IconButton label={labels.projectRename} icon={<Pencil size={13} />} disabled={disabled || editing} onClick={startRename} />
          <IconButton label={labels.projectDuplicate} icon={<Copy size={13} />} disabled={disabled} onClick={onDuplicate} />
          <IconButton label={labels.projectExport} icon={<Download size={13} />} disabled={disabled} onClick={onExport} />
          <ConfirmPopover message={labels.projectDeleteConfirm.replace('__name__', project.name)} onConfirm={onDelete}>
            {({ open: openConfirm }) => (
              <IconButton label={labels.projectDelete} icon={<Trash2 size={13} />} disabled={disabled} onClick={openConfirm} />
            )}
          </ConfirmPopover>
        </>
      }
    />
  );

  if (isActive) {
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
        <MaybeConfirm confirm={confirmSwitch} message={labels.projectSwitchConfirm.replace('__name__', project.name)} onConfirm={onActivate}>
          {(open) => row(open)}
        </MaybeConfirm>
      )}
    </li>
  );
}

interface PresetRowProps {
  preset: PresetSummary;
  isActive: boolean;
  disabled: boolean;
  /** Ask before loading: the active preset has unsaved edits. */
  confirmLoad: boolean;
  untouched: boolean;
  onLoad: () => void;
  onReload: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onHide?: () => void;
  onUnhide?: () => void;
}

function PresetRow({
  preset,
  isActive,
  disabled,
  confirmLoad,
  untouched,
  onLoad,
  onReload,
  onDuplicate,
  onExport,
  onHide,
  onUnhide,
}: PresetRowProps) {
  const labels = useSandboxLabels();
  const confirmMessage = labels.presetLoadConfirm.replace('__name__', preset.name);

  const tags = (
    <>
      {preset.locale && <RowTag>{preset.locale}</RowTag>}
      {preset.source === 'private' && <RowTag>{labels.presetPrivate}</RowTag>}
      {preset.default && <RowTag>{labels.presetDefault}</RowTag>}
      {isActive && <RowTag accent>{labels.presetActive}</RowTag>}
    </>
  );
  const subtitle = preset.available ? preset.description : labels.presetUnavailable;

  const row = (open?: () => void) => (
    <ListRow
      selected={isActive}
      disabled={disabled}
      className={isActive ? 'rounded-none border-0' : undefined}
      onSelect={isActive ? undefined : open}
      ariaLabel={isActive ? `${preset.name} (${labels.presetActive})` : `${labels.presetLoad}: ${preset.name}`}
      leading={
        <span className="flex h-4 w-4 items-center justify-center" style={{ color: 'var(--gilt)' }}>
          {isActive && <Check size={13} aria-hidden="true" />}
        </span>
      }
      title={preset.name}
      subtitle={subtitle}
      tags={tags}
      alignTop={!!subtitle}
      actions={
        <>
          {isActive && preset.available && (
            <MaybeConfirm confirm={!untouched} message={labels.presetReloadConfirm} onConfirm={onReload}>
              {(openReload) => (
                <IconButton label={labels.presetReloadActive} icon={<RotateCcw size={13} />} disabled={disabled} onClick={openReload} />
              )}
            </MaybeConfirm>
          )}
          <IconButton label={labels.presetDuplicate} icon={<Copy size={13} />} disabled={disabled} onClick={onDuplicate} />
          <IconButton label={labels.presetExport} icon={<Download size={13} />} disabled={disabled} onClick={onExport} />
          {onHide && <IconButton label={labels.presetHide} icon={<EyeOff size={13} />} onClick={onHide} />}
          {onUnhide && <IconButton label={labels.presetUnhide} icon={<Eye size={13} />} onClick={onUnhide} />}
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
