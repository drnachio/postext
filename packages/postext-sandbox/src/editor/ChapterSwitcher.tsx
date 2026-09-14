'use client';

import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useBookContent, useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../context/SandboxContext';
import { IconButton, Menu, MenuItem, cn } from '../ui';
import { LayoutScopeToggle } from '../sidebar/chapters/LayoutScopeToggle';

/** Header widget of the Markdown panel: previous/next chapter, a menu to
 *  jump to any chapter (with page ranges once a book layout landed) and the
 *  whole-book / this-chapter layout toggle. */
export function ChapterSwitcher() {
  const labels = useSandboxLabels();
  const dispatch = useSandboxDispatch();
  const { chapters, activeChapterId } = useBookContent();
  const bookPages = useSandboxSelector((s) => s.bookPages);
  const index = Math.max(0, chapters.findIndex((c) => c.id === activeChapterId));
  const active = chapters[index];
  const total = chapters.length;
  const single = total <= 1;

  const go = (i: number) => {
    const target = chapters[i];
    if (target) dispatch({ type: 'SET_ACTIVE_CHAPTER', payload: target.id });
  };

  const pagesOf = (id: string): string | null => {
    const p = bookPages?.[id];
    if (!p) return null;
    const from = p.pageNumberValue;
    const to = p.pageCount > 0 ? from + p.pageCount - 1 : from;
    return labels.chapterPages.replace('__from__', String(from)).replace('__to__', String(to));
  };

  return (
    <div className="flex min-w-0 items-center gap-0.5">
      {!single && (
        <IconButton
          label={labels.chapterPrev}
          icon={<ChevronLeft size={14} />}
          disabled={index <= 0}
          onClick={() => go(index - 1)}
        />
      )}
      <Menu
        align="start"
        trigger={
          <button
            type="button"
            aria-label={labels.chapterPicker}
            title={active?.title}
            className={cn(
              'flex h-7 min-w-0 cursor-pointer items-center gap-1 rounded border-0 bg-transparent px-1.5 text-left',
              'hover:bg-(--surface) focus-visible:outline-1 focus-visible:outline-offset-1 outline-(--gilt-hover)',
            )}
          >
            {!single && (
              <span className="shrink-0 text-[10px] font-medium" style={{ color: 'var(--slate)', fontVariantNumeric: 'tabular-nums' }}>
                {index + 1}/{total}
              </span>
            )}
            <span className="min-w-0 truncate text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
              {active?.title ?? labels.markdownEditor}
            </span>
            <ChevronDown size={12} aria-hidden="true" style={{ color: 'var(--slate)', flexShrink: 0 }} />
          </button>
        }
      >
        {chapters.map((c, i) => {
          const pages = pagesOf(c.id);
          return (
            <MenuItem key={c.id} selected={c.id === activeChapterId} onClick={() => go(i)}>
              <span className="flex min-w-0 items-center gap-2">
                <span className="w-5 shrink-0 text-right text-[10px]" style={{ color: 'var(--slate)', fontVariantNumeric: 'tabular-nums' }}>{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">{c.title}</span>
                {pages && <span className="shrink-0 text-[10px]" style={{ color: 'var(--slate)', fontVariantNumeric: 'tabular-nums' }}>{pages}</span>}
              </span>
            </MenuItem>
          );
        })}
      </Menu>
      {!single && (
        <IconButton
          label={labels.chapterNext}
          icon={<ChevronRight size={14} />}
          disabled={index >= total - 1}
          onClick={() => go(index + 1)}
        />
      )}
      <LayoutScopeToggle compact />
    </div>
  );
}
