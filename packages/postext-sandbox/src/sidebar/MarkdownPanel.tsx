'use client';

import { useRef } from 'react';
import { Download, Upload, RotateCcw } from 'lucide-react';
import { MarkdownEditor } from '../editor/MarkdownEditor';
import { ChapterSwitcher } from '../editor/ChapterSwitcher';
import { useSandbox, useSandboxPresets, useSandboxProjects } from '../context/SandboxContext';
import { exportMarkdownFile, importMarkdownFile } from '../storage/persistence';
import { slugify } from '../panels/resources/slugify';
import { ConfirmPopover, IconButton, PanelHeader } from '../ui';

interface MarkdownPanelProps {
  isDark?: boolean;
}

export function MarkdownPanel({ isDark }: MarkdownPanelProps) {
  const { state, dispatch } = useSandbox();
  const { reload } = useSandboxPresets();
  const { hasResetBaseline, projects, activeProjectId } = useSandboxProjects();
  const importRef = useRef<HTMLInputElement>(null);
  const activeName = projects.find((p) => p.id === activeProjectId)?.name ?? '';
  const chapterIndex = Math.max(0, state.chapters.findIndex((c) => c.id === state.activeChapterId));
  const chapter = state.chapters[chapterIndex];
  const multiChapter = state.chapters.length > 1;

  // Import/export act on the active chapter; the whole book travels as a
  // `.postext` bundle from the Projects panel.
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const markdown = await importMarkdownFile(file);
      dispatch({ type: 'SET_MARKDOWN', payload: markdown });
    } catch {
      // Silently ignore invalid files
    }
    e.target.value = '';
  };

  const exportName = () => {
    const base = slugify(activeName) || 'document';
    if (!multiChapter || !chapter) return `${base}.md`;
    const nn = String(chapterIndex + 1).padStart(2, '0');
    return `${base}-${nn}-${slugify(chapter.title) || 'chapter'}.md`;
  };

  // Reset restores the active preset's document (every chapter) and
  // replaces the whole resource set with the resources it references.
  const handleReset = () => {
    void reload('document');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, height: '100%', minHeight: 0, overflow: 'hidden' }}>
      <PanelHeader
        title={<ChapterSwitcher />}
        actions={
          <>
            {hasResetBaseline && (
              <ConfirmPopover message={state.labels.resetMarkdownConfirm} onConfirm={handleReset}>
                {({ open }) => (
                  <IconButton label={state.labels.reset} icon={<RotateCcw size={14} />} onClick={open} />
                )}
              </ConfirmPopover>
            )}
            <IconButton
              label={multiChapter ? state.labels.exportFileChapter : state.labels.exportFile}
              icon={<Download size={14} />}
              onClick={() => exportMarkdownFile(state.markdown, exportName())}
            />
            <IconButton
              label={multiChapter ? state.labels.importFileChapter : state.labels.importFile}
              icon={<Upload size={14} />}
              onClick={() => importRef.current?.click()}
            />
            <input
              ref={importRef}
              type="file"
              accept=".md,.markdown,text/markdown"
              onChange={handleImport}
              className="hidden"
              aria-hidden="true"
            />
          </>
        }
      />
      <div style={{ flex: '1 1 0%', minHeight: 0, display: 'flex', flexDirection: 'column' as const }}>
        {/* Keyed by chapter: each chapter gets its own CodeMirror instance,
            undo history and caret (persisted per id in the store). */}
        <MarkdownEditor key={state.activeChapterId} isDark={isDark} />
      </div>
    </div>
  );
}
