'use client';

import { BookOpen, FileText } from 'lucide-react';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext';
import { Tooltip, cn } from '../../ui';

/** Whole book / this chapter: what the layout engine receives. Shown only
 *  when the book has more than one chapter. */
export function LayoutScopeToggle({ compact }: { compact?: boolean }) {
  const labels = useSandboxLabels();
  const dispatch = useSandboxDispatch();
  const layoutScope = useSandboxSelector((s) => s.layoutScope);
  const chapterCount = useSandboxSelector((s) => s.chapters.length);
  if (chapterCount <= 1) return null;
  const chapterMode = layoutScope === 'chapter';
  return (
    <Tooltip content={chapterMode ? labels.layoutScopeChapterHint : labels.layoutScopeBook} side="bottom">
      <button
        type="button"
        aria-pressed={chapterMode}
        aria-label={labels.layoutScope}
        onClick={() => dispatch({ type: 'SET_LAYOUT_SCOPE', payload: chapterMode ? 'book' : 'chapter' })}
        className={cn(
          'inline-flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-full border px-2 text-[10px] font-medium whitespace-nowrap transition-colors',
          'focus-visible:outline-1 focus-visible:outline-offset-1 outline-(--gilt-hover)',
          chapterMode
            ? 'border-(--gilt) text-(--gilt) bg-(--surface)'
            : 'border-(--rule) text-(--slate) hover:text-(--foreground)',
          compact && 'ml-1',
        )}
      >
        {chapterMode ? <FileText size={11} aria-hidden="true" /> : <BookOpen size={11} aria-hidden="true" />}
        {chapterMode ? labels.layoutScopeChapter : labels.layoutScopeBook}
      </button>
    </Tooltip>
  );
}
