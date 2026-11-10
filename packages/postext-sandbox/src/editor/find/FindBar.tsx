'use client';

// Find and replace over the active chapter or the whole book, above the
// Markdown editor. The matches are searched in the Markdown source (marks
// included), so a replacement edits exactly what the editor shows. Going to
// a match selects it in the editor (switching chapters when it is in
// another one) while the focus stays in the bar; the previews follow the
// selection as they do while typing. Replacements go through
// `applyViewerEdits`: Cmd/Ctrl+Z in the editor, or over the previews,
// takes them back, a replace-all over the book at once.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { CaseSensitive, ChevronDown, ChevronRight, ChevronUp, List, Regex, Replace, ReplaceAll, WholeWord, X } from 'lucide-react';
import { useSandbox } from '../context/SandboxContext.js';
import { compileFind, matchSnippets, replaceChanges, MAX_MATCHES, type FindMatch, type FindOptions } from '../book/findReplace.js';
import { applyViewerEdit, applyViewerEdits } from './viewerEdits.js';
import { closeFind, findCommands, setFind, setFindHighlights, useFindState, type FindScope } from './findStore.js';
import { ConfirmPopover, IconButton, SegmentedControl, announce } from '../ui/index.js';

/** Rows the results list draws at most; the count still says them all. */
const LIST_LIMIT = 300;

interface Hit {
  chapterId: string;
  /** Book order of the chapter. */
  chapterIndex: number;
  match: FindMatch;
  /** Index among the chapter's matches. */
  local: number;
}

interface ChapterResult {
  chapterId: string;
  chapterIndex: number;
  title: string;
  text: string;
  matches: FindMatch[];
}

export function FindBar() {
  const find = useFindState();
  return find.open ? <FindBarOpen /> : null;
}

function fill(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce((s, [k, v]) => s.split(`__${k}__`).join(String(v)), template);
}

function FindBarOpen() {
  const find = useFindState();
  const { state, dispatch } = useSandbox();
  const { labels, chapters, activeChapterId, markdown, selection } = state;
  const rootRef = useRef<HTMLDivElement>(null);
  const queryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    queryRef.current?.focus();
    queryRef.current?.select();
  }, [find.focusRequest]);

  const compiled = useMemo(() => compileFind(find.query, find.options), [find.query, find.options]);
  const error = compiled && 'error' in compiled ? compiled.error : null;

  const results = useMemo((): ChapterResult[] => {
    if (!compiled || 'error' in compiled) return [];
    const out: ChapterResult[] = [];
    chapters.forEach((c, chapterIndex) => {
      if (find.scope === 'chapter' && c.id !== activeChapterId) return;
      const text = c.id === activeChapterId ? markdown : c.markdown;
      const matches = compiled.find(text);
      if (matches.length > 0) out.push({ chapterId: c.id, chapterIndex, title: c.title, text, matches });
    });
    return out;
  }, [compiled, chapters, activeChapterId, markdown, find.scope]);

  const hits = useMemo(
    () => results.flatMap((r) => r.matches.map((match, local): Hit => ({ chapterId: r.chapterId, chapterIndex: r.chapterIndex, match, local }))),
    [results],
  );
  const total = hits.length;
  const capped = results.some((r) => r.matches.length >= MAX_MATCHES);
  const activeIndex = Math.max(0, chapters.findIndex((c) => c.id === activeChapterId));
  // The current match is the one the editor has selected.
  const current = hits.findIndex((h) => h.chapterId === activeChapterId && h.match.from === selection.from && h.match.to === selection.to);
  // The match last asked for, until the editor reports it selected: a
  // second Enter pressed before then goes on from it, not from the old
  // selection.
  const requestedRef = useRef<Hit | null>(null);
  if (current >= 0) requestedRef.current = null;
  const startIndex = (): number => {
    if (current >= 0) return current;
    const r = requestedRef.current;
    return r ? hits.findIndex((h) => h.chapterId === r.chapterId && h.match.from === r.match.from && h.match.to === r.match.to) : -1;
  };

  // The matches of the open chapter, painted in its editor.
  useEffect(() => {
    const mine = results.find((r) => r.chapterId === activeChapterId);
    setFindHighlights({ chapterId: activeChapterId, ranges: mine?.matches ?? [], current: current >= 0 ? hits[current]!.local : -1 });
  }, [results, hits, current, activeChapterId]);
  useEffect(() => () => setFindHighlights({ chapterId: null, ranges: [], current: -1 }), []);

  // While the bar has the focus, the previews follow the editor selection
  // as they do while the editor has it — also after a chapter switch,
  // whose editor reports itself blurred as it unmounts.
  const barFocused = () => rootRef.current?.contains(document.activeElement) ?? false;
  useEffect(() => {
    if (barFocused()) dispatch({ type: 'SET_EDITOR_FOCUSED', payload: true });
  }, [activeChapterId, dispatch]);

  const goTo = (hit: Hit) => {
    requestedRef.current = hit;
    dispatch({
      type: 'SET_PENDING_EDITOR_FOCUS',
      payload: { chapterId: hit.chapterId, anchor: hit.match.from, head: hit.match.to, selectWord: false, keepFocus: true },
    });
  };

  const before = (h: Hit, chapterIndex: number, offset: number) => h.chapterIndex < chapterIndex || (h.chapterIndex === chapterIndex && h.match.from < offset);

  const next = () => {
    if (total === 0) return;
    const from = startIndex();
    if (from >= 0) return goTo(hits[(from + 1) % total]!);
    goTo(hits.find((h) => !before(h, activeIndex, selection.to)) ?? hits[0]!);
  };
  const previous = () => {
    if (total === 0) return;
    const from = startIndex();
    if (from >= 0) return goTo(hits[(from - 1 + total) % total]!);
    const back = [...hits].reverse().find((h) => before(h, activeIndex, selection.from));
    goTo(back ?? hits[total - 1]!);
  };

  // The editor's Mod-G / F3 call the latest of these.
  const commandsRef = useRef({ next, previous });
  commandsRef.current = { next, previous };
  useEffect(() => {
    findCommands.next = () => commandsRef.current.next();
    findCommands.previous = () => commandsRef.current.previous();
    return () => {
      findCommands.next = null;
      findCommands.previous = null;
    };
  }, []);

  // After a replacement, the next match from where it ended, once the
  // text has taken it.
  const [afterReplace, setAfterReplace] = useState<{ chapterId: string; offset: number; textBefore: string } | null>(null);
  useEffect(() => {
    if (!afterReplace) return;
    const chapter = chapters.find((c) => c.id === afterReplace.chapterId);
    const text = afterReplace.chapterId === activeChapterId ? markdown : chapter?.markdown;
    if (text === afterReplace.textBefore) return;
    setAfterReplace(null);
    if (total === 0) return;
    const at = chapters.findIndex((c) => c.id === afterReplace.chapterId);
    goTo(hits.find((h) => !before(h, at, afterReplace.offset)) ?? hits[0]!);
    // Runs when the text (and with it the matches) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hits, afterReplace]);

  const regexMode = compiled !== null && !('error' in compiled) && compiled.regex;

  const replaceOne = () => {
    if (total === 0) return;
    if (current < 0) return next();
    const hit = hits[current]!;
    const result = results.find((r) => r.chapterId === hit.chapterId)!;
    const [change] = replaceChanges(result.text, [hit.match], find.replace, regexMode);
    if (change!.insert === change!.expect) return next();
    applyViewerEdit(dispatch, hit.chapterId, [change!], result.text.length);
    // Where the replaced match ends now (the change may cover only part of it).
    const offset = hit.match.to + change!.insert.length - (change!.to - change!.from);
    setAfterReplace({ chapterId: hit.chapterId, offset, textBefore: result.text });
  };

  const replaceAll = () => {
    if (total === 0 || capped) return;
    const edits = results.map((r) => ({
      chapterId: r.chapterId,
      changes: replaceChanges(r.text, r.matches, find.replace, regexMode).filter((c) => c.insert !== c.expect),
      baseLength: r.text.length,
    }));
    const count = edits.reduce((n, e) => n + e.changes.length, 0);
    const touched = edits.filter((e) => e.changes.length > 0).length;
    applyViewerEdits(dispatch, edits, activeChapterId);
    announce(fill(touched > 1 ? labels.findReplacedAllBook : labels.findReplacedAll, { count, chapters: touched }));
  };

  const close = () => {
    closeFind();
    // Back to the text, the selection where the bar left it.
    const anchor = selection.head === selection.from ? selection.to : selection.from;
    dispatch({ type: 'SET_PENDING_EDITOR_FOCUS', payload: { anchor, head: selection.head, selectWord: false } });
  };

  const onQueryKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) previous();
      else next();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };
  const onReplaceKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      replaceOne();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };

  const setOption = (key: keyof FindOptions) => setFind({ options: { ...find.options, [key]: !find.options[key] } });

  const countText = error
    ? fill(labels.findInvalid, { error })
    : find.query.length === 0
      ? ''
      : total === 0
        ? labels.findCountNone
        : capped
          ? fill(labels.findTooMany, { total })
          : current >= 0
            ? fill(labels.findCount, { current: current + 1, total })
            : total === 1
              ? labels.findCountOne
              : fill(labels.findCountTotal, { total });
  const touchedChapters = results.length;
  const confirmAll = find.scope === 'book' && touchedChapters > 1;

  const fieldStyle = {
    color: 'var(--foreground)',
    backgroundColor: 'var(--surface)',
    border: '1px solid var(--pt-control-border)',
    outlineColor: 'var(--brand)',
  } as const;

  return (
    <div
      ref={rootRef}
      role="search"
      aria-label={labels.findBar}
      className="flex shrink-0 flex-col gap-1.5 border-b px-2 py-2"
      style={{ borderColor: 'var(--rule)' }}
      onFocus={() => dispatch({ type: 'SET_EDITOR_FOCUSED', payload: true })}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) dispatch({ type: 'SET_EDITOR_FOCUSED', payload: false });
      }}
    >
      <div className="flex items-center gap-1">
        <IconButton
          label={find.replaceOpen ? labels.findHideReplace : labels.findShowReplace}
          icon={find.replaceOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} className="rtl:-scale-x-100" />}
          onClick={() => setFind({ replaceOpen: !find.replaceOpen })}
          aria-expanded={find.replaceOpen}
        />
        <div className="relative flex min-w-0 flex-1 items-center">
          <input
            ref={queryRef}
            type="text"
            value={find.query}
            onChange={(e) => setFind({ query: e.currentTarget.value })}
            onKeyDown={onQueryKey}
            placeholder={labels.findQuery}
            aria-label={labels.findQuery}
            aria-invalid={error ? true : undefined}
            spellCheck={false}
            className="h-7 w-full min-w-0 rounded-md pe-1 ps-2 text-xs focus-visible:outline-2 focus-visible:-outline-offset-2"
            style={fieldStyle}
          />
        </div>
        <IconButton label={labels.findClose} icon={<X size={13} />} onClick={close} />
      </div>

      <div className="flex flex-wrap items-center gap-0.5 ps-7">
        <OptionToggle label={labels.findMatchCase} active={find.options.matchCase} onClick={() => setOption('matchCase')} icon={<CaseSensitive size={14} />} />
        <OptionToggle label={labels.findWholeWord} active={find.options.wholeWord} onClick={() => setOption('wholeWord')} icon={<WholeWord size={14} />} />
        <OptionToggle
          label={labels.findIgnoreAccents}
          active={find.options.ignoreAccents && !find.options.regex}
          disabled={find.options.regex}
          onClick={() => setOption('ignoreAccents')}
          icon={<span aria-hidden="true" style={{ fontSize: 12, fontWeight: 600, lineHeight: 1 }}>á</span>}
        />
        <OptionToggle label={labels.findRegex} active={find.options.regex} onClick={() => setOption('regex')} icon={<Regex size={14} />} />
        <span className="flex-1" />
        <IconButton label={labels.findPrevious} icon={<ChevronUp size={14} />} onClick={previous} disabled={total === 0} />
        <IconButton label={labels.findNext} icon={<ChevronDown size={14} />} onClick={next} disabled={total === 0} />
      </div>

      {find.replaceOpen && (
        <div className="flex items-center gap-1 ps-7">
          <input
            type="text"
            value={find.replace}
            onChange={(e) => setFind({ replace: e.currentTarget.value })}
            onKeyDown={onReplaceKey}
            placeholder={labels.findReplace}
            aria-label={labels.findReplace}
            spellCheck={false}
            className="h-7 min-w-0 flex-1 rounded-md px-2 text-xs focus-visible:outline-2 focus-visible:-outline-offset-2"
            style={fieldStyle}
          />
          <IconButton label={labels.findReplaceOne} icon={<Replace size={14} />} onClick={replaceOne} disabled={total === 0} />
          {confirmAll ? (
            <ConfirmPopover
              message={fill(labels.findReplaceAllConfirm, { count: total, chapters: touchedChapters })}
              confirmLabel={labels.findReplaceAll}
              onConfirm={replaceAll}
            >
              {({ open }) => (
                <IconButton label={labels.findReplaceAll} icon={<ReplaceAll size={14} />} onClick={open} disabled={total === 0 || capped} />
              )}
            </ConfirmPopover>
          ) : (
            <IconButton label={labels.findReplaceAll} icon={<ReplaceAll size={14} />} onClick={replaceAll} disabled={total === 0 || capped} />
          )}
        </div>
      )}

      <div className="flex items-center gap-2 ps-7">
        <SegmentedControl<FindScope>
          size="sm"
          value={find.scope}
          onValueChange={(scope) => setFind({ scope })}
          ariaLabel={labels.findScope}
          options={[
            { value: 'chapter', label: labels.findScopeChapter },
            { value: 'book', label: labels.findScopeBook },
          ]}
        />
        <span className="min-w-0 flex-1 truncate text-xs" role="status" aria-live="polite" style={{ color: error ? 'var(--pt-error, #ef4444)' : 'var(--slate)' }}>
          {countText}
        </span>
        {total > 0 && (
          <IconButton
            label={find.listOpen ? labels.findHideList : labels.findShowList}
            icon={<List size={13} />}
            active={find.listOpen}
            onClick={() => setFind({ listOpen: !find.listOpen })}
            aria-expanded={find.listOpen}
          />
        )}
      </div>

      {find.listOpen && total > 0 && (
        <ResultsList results={results} hits={hits} current={current} onPick={goTo} untitled={labels.findUntitledChapter} more={labels.findMoreResults} lineLabel={labels.findLine} />
      )}
    </div>
  );
}

function OptionToggle({ label, active, disabled, onClick, icon }: { label: string; active: boolean; disabled?: boolean; onClick: () => void; icon: ReactNode }) {
  return <IconButton label={label} icon={icon} active={active} disabled={disabled} onClick={onClick} />;
}

function ResultsList({ results, hits, current, onPick, untitled, more, lineLabel }: {
  results: readonly ChapterResult[];
  hits: readonly Hit[];
  current: number;
  onPick: (hit: Hit) => void;
  untitled: string;
  more: string;
  lineLabel: string;
}) {
  const currentHit = current >= 0 ? hits[current] : undefined;
  let budget = LIST_LIMIT;
  const groups = results.map((r) => {
    const shown = Math.max(0, Math.min(r.matches.length, budget));
    budget -= shown;
    return { r, snippets: shown > 0 ? matchSnippets(r.text, r.matches, shown) : [] };
  });
  const hidden = hits.length - LIST_LIMIT;

  // Keep the current row in sight.
  const currentRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  return (
    <div className="max-h-[40vh] overflow-y-auto rounded-md border" style={{ borderColor: 'var(--rule)' }}>
      {groups.map(({ r, snippets }) => snippets.length > 0 && (
        <div key={r.chapterId}>
          <div className="sticky top-0 flex items-baseline gap-2 px-2 py-1 text-xs font-semibold" style={{ backgroundColor: 'var(--background)', color: 'var(--foreground)' }}>
            <span className="min-w-0 flex-1 truncate">{r.title || fill(untitled, { n: r.chapterIndex + 1 })}</span>
            <span className="shrink-0 font-normal" style={{ color: 'var(--slate)' }}>{r.matches.length}</span>
          </div>
          <ul>
            {snippets.map((s, k) => {
              const isCurrent = currentHit?.chapterId === r.chapterId && currentHit.local === k;
              return (
                <li key={k}>
                  <button
                    ref={isCurrent ? currentRef : undefined}
                    type="button"
                    onClick={() => onPick({ chapterId: r.chapterId, chapterIndex: r.chapterIndex, match: r.matches[k]!, local: k })}
                    aria-current={isCurrent || undefined}
                    aria-label={`${fill(lineLabel, { line: s.line })}: ${s.before}${s.match}${s.after}`}
                    className="flex w-full items-baseline gap-2 px-2 py-0.5 text-start text-xs focus-visible:outline-2 focus-visible:-outline-offset-2"
                    style={{ backgroundColor: isCurrent ? 'var(--surface)' : 'transparent', color: 'var(--foreground)', outlineColor: 'var(--brand)' }}
                  >
                    <span className="w-8 shrink-0 text-end tabular-nums" style={{ color: 'var(--slate)' }}>{s.line}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {s.before}
                      <mark style={{ backgroundColor: 'color-mix(in srgb, var(--brand) 35%, transparent)', color: 'var(--foreground)', borderRadius: 2 }}>{s.match}</mark>
                      {s.after}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {hidden > 0 && (
        <p className="px-2 py-1 text-xs" style={{ color: 'var(--slate)' }}>{fill(more, { count: hidden })}</p>
      )}
    </div>
  );
}
