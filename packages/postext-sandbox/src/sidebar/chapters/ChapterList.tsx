'use client';

import { useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Check, MoreHorizontal, Pencil, Plus, Scissors, Trash2, Merge } from 'lucide-react';
import { useBookContent, useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext';
import { h1Count, newChapter, wordCount } from '../../book/chapterOps';
import type { Chapter } from '../../book/types';
import { generateChapterId } from '../../storage/projects';
import { ConfirmPopover, IconButton, ListRow, Menu, MenuItem, MenuSeparator } from '../../ui';
import { LayoutScopeToggle } from './LayoutScopeToggle';

/** The book's chapters: order, active one, page ranges, and the chapter
 *  operations (add, rename, move, split, merge, delete). Rendered inside
 *  the card of the active project/preset row, so it reads as *its*
 *  structure. */
export function ChapterList({ title }: { title: ReactNode }) {
  const labels = useSandboxLabels();
  const dispatch = useSandboxDispatch();
  const { chapters, activeChapterId } = useBookContent();
  const bookPages = useSandboxSelector((s) => s.bookPages);

  const add = () => {
    const chapter = newChapter(generateChapterId(), labels.chapterUntitled.replace('__n__', String(chapters.length + 1)));
    dispatch({ type: 'ADD_CHAPTER', payload: { chapter } });
  };

  return (
    <section
      aria-label={labels.chapters}
      className="border-t px-2 pt-1.5 pb-2"
      style={{ borderColor: 'var(--rule)', backgroundColor: 'var(--background)' }}
    >
      <div className="mb-1 flex h-7 items-center justify-between gap-2 pl-1">
        <h4 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--slate)' }}>
          {title}
          <span className="normal-case tracking-normal" style={{ fontVariantNumeric: 'tabular-nums' }}>{chapters.length}</span>
        </h4>
        <div className="flex items-center gap-1">
          <LayoutScopeToggle />
          <IconButton label={labels.chapterAdd} icon={<Plus size={14} />} onClick={add} />
        </div>
      </div>
      <ul className="m-0 list-none p-0" aria-label={labels.chapters}>
        {chapters.map((c, i) => (
          <ChapterRow
            key={c.id}
            chapter={c}
            index={i}
            total={chapters.length}
            isActive={c.id === activeChapterId}
            pages={bookPages?.[c.id] ?? null}
          />
        ))}
      </ul>
    </section>
  );
}

interface ChapterRowProps {
  chapter: Chapter;
  index: number;
  total: number;
  isActive: boolean;
  pages: { pageNumberValue: number; pageCount: number } | null;
}

function ChapterRow({ chapter, index, total, isActive, pages }: ChapterRowProps) {
  const labels = useSandboxLabels();
  const dispatch = useSandboxDispatch();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(chapter.title);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const openConfirmRef = useRef<((el?: Element | null) => void) | null>(null);
  const [confirm, setConfirm] = useState<{ message: string; action: () => void } | null>(null);

  const startRename = () => {
    setDraft(chapter.title);
    setEditing(true);
  };
  const commitRename = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== chapter.title) dispatch({ type: 'RENAME_CHAPTER', payload: { id: chapter.id, title: next } });
  };

  const headings = h1Count(chapter.markdown);
  const words = wordCount(chapter.markdown);
  const pagesText = pages
    ? labels.chapterPages
        .replace('__from__', String(pages.pageNumberValue))
        .replace('__to__', String(pages.pageCount > 0 ? pages.pageNumberValue + pages.pageCount - 1 : pages.pageNumberValue))
    : labels.chapterPagesUnknown;
  const subtitle = `${pagesText} · ${labels.chapterWords.replace('__n__', words.toLocaleString())}`;

  const ask = (message: string, action: () => void) => {
    setConfirm({ message, action });
    // The menu has closed by now; anchor the confirmation to its button.
    openConfirmRef.current?.(menuButtonRef.current);
  };

  const title = editing ? (
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
      aria-label={labels.chapterTitleLabel}
      className="min-w-0 w-full rounded border bg-transparent px-1.5 py-0.5 text-xs font-medium"
      style={{ borderColor: 'var(--rule)', color: 'var(--foreground)' }}
    />
  ) : (
    chapter.title
  );

  return (
    <li className="mb-0.5">
      <ListRow
        selected={isActive}
        onSelect={editing ? undefined : () => dispatch({ type: 'SET_ACTIVE_CHAPTER', payload: chapter.id })}
        onDoubleClick={editing ? undefined : startRename}
        ariaLabel={`${index + 1}. ${chapter.title}`}
        leading={
          <span className="flex h-4 w-5 items-center justify-end text-[10px]" style={{ color: isActive ? 'var(--gilt)' : 'var(--slate)', fontVariantNumeric: 'tabular-nums' }}>
            {isActive ? <Check size={13} aria-hidden="true" /> : index + 1}
          </span>
        }
        title={title}
        subtitle={subtitle}
        actions={
          <ConfirmPopover message={confirm?.message ?? ''} onConfirm={() => confirm?.action()}>
            {({ open }) => {
              openConfirmRef.current = open;
              return (
                <Menu
                  trigger={<IconButton ref={menuButtonRef} label={labels.chapterRename} icon={<MoreHorizontal size={13} />} tooltip={false} />}
                >
                  <MenuItem icon={<Pencil size={13} />} onClick={startRename}>{labels.chapterRename}</MenuItem>
                  <MenuItem icon={<ArrowUp size={13} />} disabled={index === 0} onClick={() => dispatch({ type: 'MOVE_CHAPTER', payload: { id: chapter.id, to: index - 1 } })}>
                    {labels.chapterMoveUp}
                  </MenuItem>
                  <MenuItem icon={<ArrowDown size={13} />} disabled={index >= total - 1} onClick={() => dispatch({ type: 'MOVE_CHAPTER', payload: { id: chapter.id, to: index + 1 } })}>
                    {labels.chapterMoveDown}
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem
                    icon={<Scissors size={13} />}
                    disabled={headings < 2}
                    onClick={() => ask(
                      labels.chapterSplitAtHeadingsConfirm.replace('__n__', String(headings)),
                      () => dispatch({ type: 'SPLIT_CHAPTER_AT_HEADINGS', payload: { id: chapter.id, newIds: Array.from({ length: headings - 1 }, () => generateChapterId()) } }),
                    )}
                  >
                    {labels.chapterSplitAtHeadings}
                  </MenuItem>
                  <MenuItem
                    icon={<Merge size={13} />}
                    disabled={index === 0}
                    onClick={() => ask(labels.chapterMergePreviousConfirm, () => dispatch({ type: 'MERGE_CHAPTER_WITH_PREVIOUS', payload: chapter.id }))}
                  >
                    {labels.chapterMergePrevious}
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem
                    icon={<Trash2 size={13} />}
                    destructive
                    disabled={total <= 1}
                    onClick={() => ask(labels.chapterDeleteConfirm.replace('__name__', chapter.title), () => dispatch({ type: 'REMOVE_CHAPTER', payload: chapter.id }))}
                  >
                    {total <= 1 ? labels.chapterDeleteLast : labels.chapterDelete}
                  </MenuItem>
                </Menu>
              );
            }}
          </ConfirmPopover>
        }
      />
    </li>
  );
}
