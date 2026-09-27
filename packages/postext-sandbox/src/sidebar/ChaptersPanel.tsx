'use client';

import { Copy, Download, Pencil, RotateCcw } from 'lucide-react';
import { useRef, useState } from 'react';
import {
  useBookContent,
  useSandboxLabels,
  useSandboxPresets,
  useSandboxProjects,
} from '../context/SandboxContext';
import { MenuItem, MenuSeparator, PanelHeader, RowTag } from '../ui';
import { AddChapterButton, ChapterList } from './chapters/ChapterList';
import { RowActionsMenu } from './RowActionsMenu';

/** The Chapters panel: the book on screen — its name and kind (your book,
 *  or a sample book in a language, edited or not) and the actions on it —
 *  and its chapters with every chapter operation, scrolling on their own.
 *  The books themselves are listed in the Books panel. */
export function ChaptersPanel() {
  const labels = useSandboxLabels();
  const { presets, activePresetId, activeLocale, edited, reload } = useSandboxPresets();
  const { projects, activeProjectId, status, create, duplicate, rename, exportProject } = useSandboxProjects();
  const project = activeProjectId ? projects.find((p) => p.id === activeProjectId) : undefined;
  const preset = activeProjectId ? undefined : presets.find((p) => p.id === activePresetId);
  const name = project?.name ?? preset?.name ?? labels.projectUntitled;
  const locale = project ? project.locale : activeLocale;
  const busy = status === 'busy';
  const chapterCount = useBookContent().chapters.length;

  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(name);
  const settledRef = useRef(false);
  const startRename = () => {
    if (!project) return;
    setDraft(project.name);
    settledRef.current = false;
    setRenaming(true);
  };
  const finishRename = (commit: boolean) => {
    if (settledRef.current) return;
    settledRef.current = true;
    setRenaming(false);
    const next = draft.trim();
    if (commit && project && next && next !== project.name) void rename(project.id, next);
  };

  const makeCopy = () => {
    // The book as it is on screen: a project's copy, or the edited preset;
    // an untouched preset is copied from its source (cover included).
    if (project) void duplicate({ kind: 'project', id: project.id });
    else if (edited || !preset) void create({ from: 'current' });
    else void duplicate({ kind: 'preset', id: preset.id, locale: activeLocale ?? undefined });
  };
  const download = () => {
    if (project || edited || !preset) void exportProject();
    else void exportProject({ kind: 'preset', id: preset.id, locale: activeLocale ?? undefined });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader title={labels.navChapters} count={chapterCount} actions={<AddChapterButton />} />
      <div
        className="flex shrink-0 items-start gap-2 border-b px-3 py-2"
        style={{ borderColor: 'var(--rule)', backgroundColor: 'var(--background)' }}
      >
        <div className="min-w-0 flex-1">
          {renaming ? (
            <input
              type="text"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); finishRename(true); }
                else if (e.key === 'Escape') { e.preventDefault(); finishRename(false); }
              }}
              onBlur={() => finishRename(true)}
              aria-label={labels.projectNameLabel}
              className="w-full min-w-0 rounded border bg-transparent px-1.5 py-0.5 text-sm font-semibold"
              style={{ borderColor: 'var(--rule)', color: 'var(--foreground)' }}
            />
          ) : (
            <h2
              className="truncate text-sm font-semibold"
              style={{ color: 'var(--foreground)' }}
              title={name}
              onDoubleClick={project ? startRename : undefined}
            >
              {name}
            </h2>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <RowTag>{project ? labels.bookKindProject : labels.bookKindPreset}</RowTag>
            {locale && <RowTag>{locale}</RowTag>}
            {!project && edited && <RowTag accent label={labels.presetEditedHint}>{labels.presetEdited}</RowTag>}
          </div>
        </div>
        <RowActionsMenu
          label={labels.rowMoreActions.replace('__name__', name)}
          disabled={busy}
          confirmMessage={labels.presetRestoreConfirm.replace('__name__', name)}
          onConfirm={() => { void reload('all'); }}
        >
          {(askRestore) => (
            <>
              {project && <MenuItem icon={<Pencil size={13} />} disabled={renaming} onClick={startRename}>{labels.projectRename}</MenuItem>}
              <MenuItem icon={<Copy size={13} />} onClick={makeCopy}>{project ? labels.projectDuplicate : labels.presetDuplicate}</MenuItem>
              <MenuItem icon={<Download size={13} />} onClick={download}>{labels.projectExport}</MenuItem>
              {!project && edited && preset?.available !== false && (
                <>
                  <MenuSeparator />
                  <MenuItem icon={<RotateCcw size={13} />} onClick={askRestore}>{labels.presetReloadActive}</MenuItem>
                </>
              )}
            </>
          )}
        </RowActionsMenu>
      </div>
      <ChapterList />
    </div>
  );
}
