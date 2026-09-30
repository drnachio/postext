'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useBookContent, useBookPlan, useSandboxDispatch, useSandboxLabels } from '../context/SandboxContext';
import { chapterPageLabels } from '../book/pagination';
import { CHAPTER_FILTER_MIN_CHAPTERS, chapterFilterKey, chapterMenuEntries, partLabel, type ChapterMenuSource } from '../book/chapterMenu';
import { IconButton, Menu, MenuItem, cn } from '../ui';

/** Header widget of the Markdown panel: previous/next chapter and a menu to
 *  jump to any chapter (with page ranges once its pagination is known).
 *
 *  A long book stays usable: the menu scrolls within the viewport and opens
 *  on the active chapter; a book with parts lists its chapters under
 *  their part headers (a click on a header opens the part's first
 *  chapter); a book of more than {@link CHAPTER_FILTER_MIN_CHAPTERS}
 *  chapters gets a filter field matching numbers and titles. */
export function ChapterSwitcher() {
  const labels = useSandboxLabels();
  const dispatch = useSandboxDispatch();
  const { chapters, activeChapterId } = useBookContent();
  const plan = useBookPlan();
  const index = Math.max(0, chapters.findIndex((c) => c.id === activeChapterId));
  const active = chapters[index];
  const total = chapters.length;
  const single = total <= 1;
  const filterable = total > CHAPTER_FILTER_MIN_CHAPTERS;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const popupRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);

  const go = (i: number) => {
    const target = chapters[i];
    if (target) dispatch({ type: 'SET_ACTIVE_CHAPTER', payload: target.id });
  };

  const pagesOf = (id: string): string | null => {
    const p = plan.bookPages[id];
    if (!p) return null;
    const { from, to } = chapterPageLabels(p);
    return labels.chapterPages.replace('__from__', from).replace('__to__', to);
  };

  const sources = useMemo<ChapterMenuSource[]>(
    () => chapters.map((c) => {
      const chapterPlan = plan.byId[c.id];
      return { id: c.id, title: c.title, number: chapterPlan?.number ?? null, ...(chapterPlan?.part ? { part: chapterPlan.part } : {}) };
    }),
    [chapters, plan],
  );
  // Only an open menu lists its entries: 120 items are not rendered for a
  // closed one.
  const entries = useMemo(
    () => (open ? chapterMenuEntries(sources, filterable ? query : '') : []),
    [open, sources, filterable, query],
  );

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setQuery('');
  };

  // Opening lands on the active chapter: scrolled to the middle of the
  // list and focused, so the arrow keys move on from it — or, with a
  // filter field, the field takes the focus and the chapter stays in view.
  useEffect(() => {
    if (!open) return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const item = popupRef.current?.querySelector<HTMLElement>('[aria-current="true"]');
        item?.scrollIntoView({ block: 'center' });
        if (filterable) filterRef.current?.focus({ preventScroll: true });
        else item?.focus({ preventScroll: true });
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, filterable]);

  const firstMatch = entries.find((e) => e.kind === 'chapter');
  const filter = filterable ? (
    <div className="px-1 pt-0.5 pb-1">
      <input
        ref={filterRef}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          // The arrows move into the list (from the active chapter while
          // nothing is typed) and Escape closes the menu; every other key
          // edits the field (the menu's type-ahead would take it). While an
          // IME composes, Enter and the arrows are its own.
          const action = chapterFilterKey(e.key, {
            composing: e.nativeEvent.isComposing || e.keyCode === 229,
            empty: query.trim() === '',
          });
          if (action === 'active') {
            const item = popupRef.current?.querySelector<HTMLElement>('[aria-current="true"]');
            if (item) {
              e.preventDefault();
              e.stopPropagation();
              item.focus();
            }
            return;
          }
          if (action === 'menu') return;
          e.stopPropagation();
          if (action === 'open' && firstMatch?.kind === 'chapter') {
            e.preventDefault();
            go(firstMatch.index);
            onOpenChange(false);
          }
        }}
        placeholder={labels.chapterFilter}
        aria-label={labels.chapterFilter}
        className="w-full min-w-0 rounded border bg-transparent px-2 py-1 text-xs outline-none focus-visible:border-(--brand-hover)"
        style={{ borderColor: 'var(--rule)', color: 'var(--foreground)' }}
      />
      {/* Beside the list, which is the menu and holds menu items only. */}
      <div aria-live="polite">
        {entries.length === 0 && open && (
          <p className="m-0 px-1 pt-1.5 text-xs" style={{ color: 'var(--slate)' }}>{labels.chapterFilterEmpty}</p>
        )}
      </div>
    </div>
  ) : undefined;

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
        open={open}
        onOpenChange={onOpenChange}
        header={filter}
        label={labels.chapters}
        highlightItemOnHover={filterable ? false : undefined}
        popupRef={popupRef}
        trigger={
          <button
            type="button"
            aria-label={labels.chapterPicker}
            title={active?.title}
            className={cn(
              'flex h-7 min-w-0 cursor-pointer items-center gap-1 rounded border-0 bg-transparent px-1.5 text-left',
              'hover:bg-(--surface) focus-visible:outline-1 focus-visible:outline-offset-1 outline-(--brand-hover)',
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
        {entries.map((entry) => {
          if (entry.kind === 'part') {
            const label = partLabel(entry.part);
            return (
              <MenuItem key={entry.key} heading title={labels.chapterPartGo.replace('__part__', label)} onClick={() => go(entry.firstIndex)}>
                {label}
              </MenuItem>
            );
          }
          const c = chapters[entry.index]!;
          const pages = pagesOf(c.id);
          // The chapter's number (a dash for the unnumbered front matter),
          // as in the chapter list; long titles (a 回目 couplet) are cut,
          // whole in the tooltip.
          const number = sources[entry.index]!.number;
          return (
            <MenuItem key={c.id} selected={c.id === activeChapterId} title={c.title} onClick={() => go(entry.index)}>
              <span className="flex min-w-0 max-w-[26rem] items-center gap-2">
                <span className="w-5 shrink-0 text-right text-[10px]" style={{ color: 'var(--slate)', fontVariantNumeric: 'tabular-nums' }}>{number === null ? '–' : number}</span>
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
    </div>
  );
}
