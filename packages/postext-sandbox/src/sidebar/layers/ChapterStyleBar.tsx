'use client';

// The chapter style the Design panel edits (`config.chapterStyles`): the
// book's own settings, or a style a chapter names in its front matter
// (`chapterStyle:`). While a style is chosen, the panel shows it over the
// book and what changes is kept in the style; the bar names it, renames
// it, deletes it and goes back to the book.

import { useSyncExternalStore } from 'react';
import { BookOpen, Plus, Trash2 } from 'lucide-react';
import type { ChapterStyleConfig } from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxStore } from '../../context/SandboxContext.js';
import { scopedView } from '../../context/configScope.js';
import { Button, cn } from '../../ui/index.js';
import { newChapterStyle } from '../../editions/chapterStyleEdit.js';

const NONE: readonly ChapterStyleConfig[] = [];

export function ChapterStyleBar() {
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
  const create = () => {
    const made = newChapterStyle(styles, labels.chapterStyleDefaultName.replace('__n__', String(styles.length + 1)));
    setStyles([...styles, made]);
    edit(made.id);
  };

  return (
    <div
      className="flex shrink-0 flex-col gap-1.5 border-b border-(--rule) px-3 py-2"
      style={style ? { borderTop: '3px solid var(--edition, var(--brand))' } : undefined}
    >
      <div className="flex items-center gap-1.5">
        <label className="shrink-0 text-[0.68rem] text-(--slate)" htmlFor="pt-chapter-style">{labels.chapterStyleBarLabel}</label>
        <select
          id="pt-chapter-style"
          value={style ? style.id : ''}
          onChange={(e) => edit(e.target.value || null)}
          className="min-w-0 flex-1 rounded border bg-transparent px-1.5 py-0.5 text-xs"
          style={{ borderColor: 'var(--rule)', color: 'var(--foreground)' }}
        >
          <option value="">{labels.chapterStyleBook}</option>
          {styles.map((s) => (
            <option key={s.id} value={s.id}>{s.name ?? s.id}</option>
          ))}
        </select>
        <Button size="sm" variant="ghost" onClick={create} title={labels.chapterStyleNew} aria-label={labels.chapterStyleNew}>
          <Plus size={12} aria-hidden="true" />
        </Button>
      </div>
      {style && (
        <>
          <p className="text-[0.68rem] leading-[1.4] text-(--slate) [text-wrap:pretty]">
            {labels.chapterStyleEditing.replace('__name__', style.name ?? style.id).replace('__id__', style.id)}
          </p>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              aria-label={labels.chapterStyleName}
              value={style.name ?? ''}
              placeholder={style.id}
              onChange={(e) => setStyles(styles.map((s) => (s.id === style.id ? { ...s, name: e.target.value } : s)))}
              className={cn('min-w-0 flex-1 rounded border bg-transparent px-1.5 py-0.5 text-xs')}
              style={{ borderColor: 'var(--rule)', color: 'var(--foreground)' }}
            />
            <Button size="sm" variant="ghost" onClick={() => { edit(null); setStyles(styles.filter((s) => s.id !== style.id)); }} title={labels.chapterStyleDelete} aria-label={labels.chapterStyleDelete}>
              <Trash2 size={12} aria-hidden="true" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => edit(null)}>
              <span className="inline-flex items-center gap-1"><BookOpen size={11} aria-hidden="true" />{labels.chapterStyleBack}</span>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
