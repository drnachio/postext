'use client';

// The chapter style the Design panel edits (`config.chapterStyles`): the
// book's own settings, or a style a chapter names in its front matter
// (`chapterStyle:`). While a style is chosen, the panel shows it over the
// book and what changes is kept in the style. Its parts, laid out by the
// panel's scope bar (./DesignScopeBar.tsx): the menu that chooses the
// book or a style and makes a new one, and the row of the style being
// edited (its name, delete, back to the book).

import { useSyncExternalStore } from 'react';
import { BookOpen, Check, ChevronsUpDown, Plus, SwatchBook, Trash2 } from 'lucide-react';
import type { ChapterStyleConfig } from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxStore } from '../../context/SandboxContext.js';
import { scopedView } from '../../context/configScope.js';
import { Button, Menu, MenuItem, MenuSeparator, cn } from '../../ui/index.js';
import { newChapterStyle } from '../../editions/chapterStyleEdit.js';

const NONE: readonly ChapterStyleConfig[] = [];

export interface ChapterStyleEdit {
  styles: readonly ChapterStyleConfig[];
  /** The style being edited; undefined: the book. */
  style: ChapterStyleConfig | undefined;
  /** Edit a style, or the book (`null`). */
  edit: (id: string | null) => void;
  create: () => void;
  rename: (name: string) => void;
  remove: () => void;
}

/** The book's chapter styles and the one the panel edits. */
export function useChapterStyleEdit(): ChapterStyleEdit {
  const labels = useSandboxLabels();
  const store = useSandboxStore();
  // The panel's dispatch: in a book in several languages, the styles go to
  // the layer in scope (every language, or the edition on screen).
  const dispatch = useSandboxDispatch();
  // The settings in scope, not the panel's view of them (which is the
  // style merged over the book).
  const read = () => scopedView(store.getSnapshot()).config.chapterStyles ?? NONE;
  const styles = useSyncExternalStore(store.subscribe, read, read);
  const editing = useSyncExternalStore(store.subscribe, () => store.getSnapshot().editingChapterStyle, () => store.getSnapshot().editingChapterStyle);
  const style = editing ? styles.find((s) => s.id === editing) : undefined;

  const setStyles = (next: ChapterStyleConfig[]) => dispatch({ type: 'UPDATE_CONFIG', payload: { chapterStyles: next.length > 0 ? next : undefined } });
  const edit = (id: string | null) => store.dispatch({ type: 'SET_EDITING_CHAPTER_STYLE', payload: id });
  return {
    styles,
    style,
    edit,
    create: () => {
      const made = newChapterStyle(styles, labels.chapterStyleDefaultName.replace('__n__', String(styles.length + 1)));
      setStyles([...styles, made]);
      edit(made.id);
    },
    rename: (name) => { if (style) setStyles(styles.map((s) => (s.id === style.id ? { ...s, name } : s))); },
    remove: () => {
      if (!style) return;
      edit(null);
      setStyles(styles.filter((s) => s.id !== style.id));
    },
  };
}

/**
 * The menu that says which design the panel edits — the book's, or a
 * chapter style — and chooses another or makes a new style. `compact`:
 * beside the language switch, where it shows its symbol and, in a wide
 * panel, the name; otherwise the name always.
 */
export function ChapterStyleMenu({ state, compact }: { state: ChapterStyleEdit; compact: boolean }) {
  const labels = useSandboxLabels();
  const { styles, style, edit, create } = state;
  const current = style ? style.name || style.id : labels.chapterStyleBook;
  const mark = (on: boolean) => (on ? <Check size={12} aria-hidden="true" className="shrink-0 text-(--brand)" /> : undefined);
  return (
    <Menu
      align="end"
      trigger={(
        <button
          type="button"
          id="pt-chapter-style"
          aria-label={`${labels.chapterStyleBarLabel}: ${current}`}
          title={`${labels.chapterStyleBarLabel}: ${current}`}
          className={cn(
            'inline-flex h-7 pt-large:h-11 pt-large:min-w-11 cursor-pointer items-center rounded-md border text-xs transition-colors',
            'bg-(--surface) hover:border-(--slate) data-popup-open:border-(--brand) focus-visible:outline-2 focus-visible:outline-offset-0 outline-(--brand)',
            compact ? 'max-w-[45%] shrink-0 justify-center gap-1 px-1.5 @min-[30rem]:gap-1.5 @min-[30rem]:px-2' : 'min-w-0 flex-1 justify-between gap-1.5 px-2',
            style ? 'border-(--edition,var(--brand)) text-(--foreground)' : 'border-(--pt-control-border) text-(--slate)',
          )}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <SwatchBook size={13} aria-hidden="true" className={cn('shrink-0', style && 'text-(--edition,var(--brand))')} />
            <span className={cn('min-w-0 truncate', compact && 'hidden @min-[30rem]:inline')}>{current}</span>
          </span>
          <ChevronsUpDown size={11} aria-hidden="true" className="shrink-0 text-(--slate)" />
        </button>
      )}
    >
      <MenuItem icon={<BookOpen size={13} />} selected={!style} trailing={mark(!style)} onClick={() => edit(null)}>
        {labels.chapterStyleBook}
      </MenuItem>
      {styles.map((s) => (
        <MenuItem key={s.id} icon={<SwatchBook size={13} />} selected={s.id === style?.id} trailing={mark(s.id === style?.id)} onClick={() => edit(s.id)}>
          {s.name || s.id}
        </MenuItem>
      ))}
      <MenuSeparator />
      <MenuItem icon={<Plus size={13} />} onClick={create}>{labels.chapterStyleNew}</MenuItem>
    </Menu>
  );
}

/** The style being edited: what editing it means, its name, delete and
 *  back to the book. Nothing while the panel edits the book. */
export function ChapterStyleEditor({ state }: { state: ChapterStyleEdit }) {
  const labels = useSandboxLabels();
  const { style, edit, rename, remove } = state;
  if (!style) return null;
  return (
    <>
      <p className="text-[0.68rem] leading-[1.4] text-(--slate) [text-wrap:pretty]">
        {labels.chapterStyleEditing.replaceAll('__name__', style.name || style.id).replaceAll('__id__', style.id)}
      </p>
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          aria-label={labels.chapterStyleName}
          value={style.name ?? ''}
          placeholder={style.id}
          onChange={(e) => rename(e.target.value)}
          className={cn('min-w-0 flex-1 rounded border bg-transparent px-1.5 py-0.5 text-xs')}
          style={{ borderColor: 'var(--rule)', color: 'var(--foreground)' }}
        />
        <Button size="sm" variant="ghost" onClick={remove} title={labels.chapterStyleDelete} aria-label={labels.chapterStyleDelete}>
          <Trash2 size={12} aria-hidden="true" />
        </Button>
        <Button size="sm" variant="outline" onClick={() => edit(null)}>
          <span className="inline-flex items-center gap-1"><BookOpen size={11} aria-hidden="true" />{labels.chapterStyleBack}</span>
        </Button>
      </div>
    </>
  );
}
