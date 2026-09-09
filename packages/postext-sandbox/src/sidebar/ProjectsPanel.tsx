'use client';

import { Check, Copy, Download, FilePlus, Pencil, Plus, RotateCcw, Trash2, Upload, X } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import {
  useSandboxLabels,
  useSandboxPresets,
  useSandboxProjects,
  type ProjectSummary,
} from '../context/SandboxContext';
import { ConfirmPopover } from '../panels/ConfirmPopover';
import { Tooltip } from '../panels/Tooltip';
import type { PresetSummary } from '../presets';

const TAG_STYLE: React.CSSProperties = {
  display: 'inline-block',
  padding: '0 5px',
  borderRadius: 3,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: 'var(--rule)',
  color: 'var(--slate)',
  fontSize: 10,
  lineHeight: '16px',
  whiteSpace: 'nowrap',
};

function Tag({ children }: { children: React.ReactNode }) {
  return <span style={TAG_STYLE}>{children}</span>;
}

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
      {({ open }) => children(open)}
    </ConfirmPopover>
  );
}

/** 24 px icon button used in the header and on rows. */
function IconButton({
  label,
  onClick,
  disabled,
  size = 13,
  children,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  size?: number;
  children: ReactNode;
}) {
  return (
    <Tooltip content={label} side="bottom">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors focus-visible:outline-1 focus-visible:outline-offset-1 disabled:opacity-40"
        style={{ color: 'var(--slate)', background: 'none', border: 'none', cursor: disabled ? 'default' : 'pointer', outlineColor: 'var(--gilt-hover)' }}
        onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.color = 'var(--foreground)'; }}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--slate)')}
      >
        <span style={{ display: 'flex', width: size, height: size }} aria-hidden="true">{children}</span>
      </button>
    </Tooltip>
  );
}

function GroupTitle({ children }: { children: ReactNode }) {
  return (
    <h3
      className="mt-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wide first:mt-0"
      style={{ color: 'var(--slate)' }}
    >
      {children}
    </h3>
  );
}

export function ProjectsPanel() {
  const labels = useSandboxLabels();
  const { presets, activePresetId, status, error, untouched, stale, updatedAt, load, reload } = useSandboxPresets();
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

  const presetLoading = status === 'loading';
  const busy = presetLoading || projectStatus === 'busy';
  const inPresetMode = activeProjectId === null;
  const active = presets.find((p) => p.id === activePresetId);
  const canReload = !busy && (active?.available ?? false);
  const reloadAll = () => { void reload('all'); };
  // Leaving a preset with edits loses them; leaving a project loses nothing
  // (its edits are saved as they happen).
  const leavingLosesWork = inPresetMode && !untouched;

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

  return (
    <div className="flex h-full flex-col">
      <div
        className="flex shrink-0 items-center justify-between border-b px-3 py-2"
        style={{ borderColor: 'var(--rule)', backgroundColor: 'var(--background)' }}
      >
        <h2 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
          {labels.projects}
        </h2>
        <div className="flex items-center gap-1">
          <IconButton label={labels.projectNewFromCurrent} disabled={busy} onClick={() => { void create({ from: 'current' }); }}>
            <Plus size={13} />
          </IconButton>
          <IconButton label={labels.projectNewBlank} disabled={busy} onClick={() => { void create({ from: 'blank' }); }}>
            <FilePlus size={13} />
          </IconButton>
          <IconButton label={labels.projectImport} disabled={busy} onClick={() => importRef.current?.click()}>
            <Upload size={13} />
          </IconButton>
          <IconButton label={labels.projectExportActive} disabled={busy} onClick={() => { void exportProject(); }}>
            <Download size={13} />
          </IconButton>
          <input
            ref={importRef}
            type="file"
            accept=".postext,application/zip"
            onChange={handleImport}
            className="hidden"
            aria-hidden="true"
          />
        </div>
      </div>
      {stale && inPresetMode && (
        <div
          role="status"
          className="flex shrink-0 items-start gap-2 border-b px-3 py-2 text-xs"
          style={{ borderColor: 'var(--rule)', backgroundColor: 'var(--surface)', color: 'var(--foreground)' }}
        >
          <span className="min-w-0 flex-1">{labels.presetStaleBanner}</span>
          <button
            type="button"
            onClick={reloadAll}
            disabled={!canReload}
            className="shrink-0 rounded border px-2 py-0.5 text-xs font-medium transition-colors focus-visible:outline-1 focus-visible:outline-offset-1 disabled:opacity-40"
            style={{ borderColor: 'var(--gilt)', color: 'var(--gilt)', background: 'none', outlineColor: 'var(--gilt-hover)' }}
            onMouseEnter={(e) => { if (canReload) e.currentTarget.style.backgroundColor = 'var(--background)'; }}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            {labels.presetStaleReload}
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
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
            <button
              type="button"
              onClick={dismissNotice}
              aria-label={labels.projectNoticeDismiss}
              className="flex h-4 w-4 shrink-0 items-center justify-center"
              style={{ color: 'var(--slate)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <X size={11} aria-hidden="true" />
            </button>
          </div>
        )}

        <GroupTitle>{labels.projects}</GroupTitle>
        {projects.length === 0 ? (
          <p className="mb-2 text-xs" style={{ color: 'var(--slate)' }}>
            {labels.projectsEmpty}
          </p>
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
                onRename={(name) => { void rename(project.id, name); }}
                onDuplicate={() => { void duplicate({ kind: 'project', id: project.id }); }}
                onExport={() => { void exportProject({ kind: 'project', id: project.id }); }}
                onDelete={() => { void remove(project.id); }}
              />
            ))}
          </ul>
        )}

        <GroupTitle>{labels.presetsGroup}</GroupTitle>
        <ul className="m-0 list-none p-0" aria-label={labels.presetsGroup}>
          {presets.map((preset) => (
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
            />
          ))}
        </ul>
      </div>
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
  onRename: (name: string) => void;
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

  const startRename = () => {
    setDraft(project.name);
    setEditing(true);
  };
  const commitRename = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== project.name) onRename(next);
  };

  const nameBlock = editing ? (
    <input
      type="text"
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
        else if (e.key === 'Escape') { e.preventDefault(); setEditing(false); }
      }}
      onBlur={commitRename}
      aria-label={labels.projectNameLabel}
      className="min-w-0 flex-1 rounded border bg-transparent px-1.5 py-0.5 text-xs"
      style={{ borderColor: 'var(--rule)', color: 'var(--foreground)' }}
    />
  ) : (
    <span className="min-w-0 flex-1">
      <span className="flex flex-wrap items-center gap-1">
        <span className="truncate text-xs font-medium" style={{ color: 'var(--foreground)' }} title={project.name}>
          {project.name}
        </span>
        {project.locale && <Tag>{project.locale}</Tag>}
        {isActive && <Tag>{labels.presetActive}</Tag>}
      </span>
      {project.description && (
        <span className="mt-0.5 block text-xs" style={{ color: 'var(--slate)' }}>
          {project.description}
        </span>
      )}
    </span>
  );

  const body = (open?: () => void) => {
    const inner = (
      <>
        <span
          className="flex h-4 w-4 shrink-0 items-center justify-center"
          style={{ color: 'var(--gilt)', marginTop: 1 }}
          aria-hidden="true"
        >
          {isActive && <Check size={13} />}
        </span>
        {nameBlock}
      </>
    );
    if (editing) {
      return <div className="flex min-w-0 flex-1 items-start gap-2 px-2 py-1.5">{inner}</div>;
    }
    return (
      <button
        type="button"
        onClick={open}
        onDoubleClick={isActive ? startRename : undefined}
        disabled={disabled || isActive}
        aria-current={isActive ? 'true' : undefined}
        aria-label={isActive ? `${project.name} (${labels.presetActive})` : `${labels.projectActivate}: ${project.name}`}
        className="flex min-w-0 flex-1 items-start gap-2 rounded px-2 py-1.5 text-left transition-colors focus-visible:outline-1 focus-visible:outline-offset-1"
        style={{
          background: 'none',
          border: 'none',
          cursor: disabled || isActive ? 'default' : 'pointer',
          outlineColor: 'var(--gilt-hover)',
        }}
        onMouseEnter={(e) => { if (!disabled && !isActive) e.currentTarget.style.backgroundColor = 'var(--surface)'; }}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
      >
        {inner}
      </button>
    );
  };

  const content = isActive || disabled || editing ? (
    body()
  ) : (
    <MaybeConfirm
      confirm={confirmSwitch}
      message={labels.projectSwitchConfirm.replace('__name__', project.name)}
      onConfirm={onActivate}
    >
      {(open) => body(open)}
    </MaybeConfirm>
  );

  return (
    <li className="mb-1 rounded border" style={{ borderColor: isActive ? 'var(--gilt)' : 'var(--rule)' }}>
      <div className="flex items-start">
        {content}
        <div className="flex shrink-0 items-center gap-0.5 px-1 py-1">
          <IconButton label={labels.projectRename} disabled={disabled || editing} onClick={startRename} size={11}>
            <Pencil size={11} />
          </IconButton>
          <IconButton label={labels.projectDuplicate} disabled={disabled} onClick={onDuplicate} size={11}>
            <Copy size={11} />
          </IconButton>
          <IconButton label={labels.projectExport} disabled={disabled} onClick={onExport} size={11}>
            <Download size={11} />
          </IconButton>
          <ConfirmPopover
            message={labels.projectDeleteConfirm.replace('__name__', project.name)}
            onConfirm={onDelete}
          >
            {({ open }) => (
              <IconButton label={labels.projectDelete} disabled={disabled} onClick={open} size={11}>
                <Trash2 size={11} />
              </IconButton>
            )}
          </ConfirmPopover>
        </div>
      </div>
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
}: PresetRowProps) {
  const labels = useSandboxLabels();
  const confirmMessage = labels.presetLoadConfirm.replace('__name__', preset.name);

  const body = (open?: () => void) => (
    <button
      type="button"
      onClick={open}
      disabled={disabled || isActive}
      aria-current={isActive ? 'true' : undefined}
      aria-label={isActive ? `${preset.name} (${labels.presetActive})` : `${labels.presetLoad}: ${preset.name}`}
      className="flex min-w-0 flex-1 items-start gap-2 rounded px-2 py-1.5 text-left transition-colors focus-visible:outline-1 focus-visible:outline-offset-1"
      style={{
        background: 'none',
        border: 'none',
        cursor: disabled || isActive ? 'default' : 'pointer',
        opacity: preset.available ? 1 : 0.5,
        outlineColor: 'var(--gilt-hover)',
      }}
      onMouseEnter={(e) => {
        if (!disabled && !isActive) e.currentTarget.style.backgroundColor = 'var(--surface)';
      }}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
    >
      <span
        className="flex h-4 w-4 shrink-0 items-center justify-center"
        style={{ color: 'var(--gilt)', marginTop: 1 }}
        aria-hidden="true"
      >
        {isActive && <Check size={13} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1">
          <span
            className="truncate text-xs font-medium"
            style={{ color: 'var(--foreground)' }}
            title={preset.name}
          >
            {preset.name}
          </span>
          {preset.locale && <Tag>{preset.locale}</Tag>}
          {preset.source === 'private' && <Tag>{labels.presetPrivate}</Tag>}
          {preset.default && <Tag>{labels.presetDefault}</Tag>}
        </span>
        {preset.description && (
          <span className="mt-0.5 block text-xs" style={{ color: 'var(--slate)' }}>
            {preset.description}
          </span>
        )}
        {!preset.available && (
          <span className="mt-0.5 block text-xs" style={{ color: 'var(--slate)' }}>
            {labels.presetUnavailable}
          </span>
        )}
      </span>
    </button>
  );

  const content = isActive || disabled ? (
    body()
  ) : (
    <MaybeConfirm confirm={confirmLoad} message={confirmMessage} onConfirm={onLoad}>
      {(open) => body(open)}
    </MaybeConfirm>
  );

  return (
    <li className="mb-1 rounded border" style={{ borderColor: isActive ? 'var(--gilt)' : 'var(--rule)' }}>
      <div className="flex items-start">
        {content}
        <div className="flex shrink-0 items-center gap-0.5 px-1 py-1">
          <IconButton label={labels.presetDuplicate} disabled={disabled} onClick={onDuplicate} size={11}>
            <Copy size={11} />
          </IconButton>
          <IconButton label={labels.presetExport} disabled={disabled} onClick={onExport} size={11}>
            <Download size={11} />
          </IconButton>
        </div>
      </div>
      {isActive && preset.available && (
        <div className="flex justify-end px-2 pb-1.5">
          <MaybeConfirm confirm={!untouched} message={labels.presetReloadConfirm} onConfirm={onReload}>
            {(open) => (
              <button
                type="button"
                onClick={open}
                disabled={disabled}
                aria-label={`${labels.presetReloadActive}: ${preset.name}`}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors focus-visible:outline-1 focus-visible:outline-offset-1 disabled:opacity-40"
                style={{ color: 'var(--slate)', background: 'none', border: 'none', outlineColor: 'var(--gilt-hover)' }}
                onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.color = 'var(--foreground)'; }}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--slate)')}
              >
                <RotateCcw size={11} aria-hidden="true" />
                {labels.presetReloadActive}
              </button>
            )}
          </MaybeConfirm>
        </div>
      )}
    </li>
  );
}
