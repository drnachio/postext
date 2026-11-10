'use client';

// Find and replace over the active chapter or the whole book, above the
// Markdown editor. The matches are searched in the Markdown source (marks
// included), so a replacement edits exactly what the editor shows. Going to
// a match selects it in the editor (switching chapters when it is in
// another one) while the focus stays in the bar; the previews follow the
// selection as they do while typing. Replacements go through
// `applyViewerEdits`: one step of the Sandbox's history, a replace-all over
// the book included, which the bar's Undo (or Cmd/Ctrl+Z in its fields
// right after) takes back. In Design mode the text is read only and the
// bar only finds.

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { CaseSensitive, ChevronDown, ChevronRight, ChevronUp, List, Redo2, Regex, Replace, ReplaceAll, Undo2, WholeWord, X } from 'lucide-react';
import { useSandbox } from '../../context/SandboxContext.js';
import { applyTextChanges, type TextChange } from '../../book/textChanges.js';
import { replaceChanges } from '../../book/find/replace.js';
import type { FindOptions } from '../../book/find/compile.js';
import { applyViewerEdit, applyViewerEdits, redoViewerEdit, undoViewerEdit } from '../viewerEdits.js';
import { activeHistory } from '../../history/sandboxHistory.js';
import { isMacKeyboard, useEditMode } from '../../editing/editMode.js';
import { closeFind, findCommands, setFind, setFindHighlights, useFindState, type FindScope } from './findStore.js';
import { findFieldKey, isReplacementStep, type FindFieldAction } from './findKeys.js';
import { useFindResults } from './useFindResults.js';
import { ResultsList, fill, type Hit } from './ResultsList.js';
import { Button, ConfirmPopover, IconButton, SegmentedControl, announce } from '../../ui/index.js';

export function FindBar() {
  const find = useFindState();
  return find.open ? <FindBarOpen /> : null;
}

/** The bar's last replacement: the chapters it changed, their texts
 *  before and after, and whether it was taken back. */
interface LastReplace {
  count: number;
  texts: Map<string, { before: string; after: string }>;
  undone: boolean;
}

function FindBarOpen() {
  const find = useFindState();
  const { state, dispatch } = useSandbox();
  const { labels, chapters, activeChapterId, markdown, selection } = state;
  const rootRef = useRef<HTMLDivElement>(null);
  const queryRef = useRef<HTMLInputElement>(null);
  const [editMode, setEditMode] = useEditMode();
  const readOnly = editMode === 'design';
  const readOnlyId = useId();

  useEffect(() => {
    queryRef.current?.focus();
    queryRef.current?.select();
  }, [find.focusRequest]);

  const { results, error, stopped, searched, pending } = useFindResults({
    query: find.query, options: find.options, scope: find.scope, chapters, activeChapterId, markdown,
  });
  const textOf = (id: string): string | undefined => (id === activeChapterId ? markdown : chapters.find((c) => c.id === id)?.markdown);
  // Matches found in a text the chapter no longer has: shown, but not
  // replaced until the search has caught up.
  const stale = pending || results.some((r) => textOf(r.chapterId) !== r.text);

  const hits = results.flatMap((r) => r.matches.map((match, local): Hit => ({ chapterId: r.chapterId, chapterIndex: r.chapterIndex, match, local })));
  const total = hits.length;
  const incomplete = stopped !== null;
  const activeIndex = Math.max(0, chapters.findIndex((c) => c.id === activeChapterId));
  // The current match is the one the editor has selected.
  const current = stale ? -1 : hits.findIndex((h) => h.chapterId === activeChapterId && h.match.from === selection.from && h.match.to === selection.to);
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

  // The matches of the open chapter, painted in its editor (only while
  // they are those of its text).
  const paintCurrent = current >= 0 ? hits[current]!.local : -1;
  useEffect(() => {
    const mine = results.find((r) => r.chapterId === activeChapterId);
    const ranges = mine && mine.text === markdown ? mine.matches : [];
    setFindHighlights({ chapterId: activeChapterId, ranges, current: paintCurrent });
  }, [results, markdown, paintCurrent, activeChapterId]);
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
  // search has run on the new text.
  const [afterReplace, setAfterReplace] = useState<{ chapterId: string; offset: number; textBefore: string } | null>(null);
  useEffect(() => {
    if (!afterReplace || pending) return;
    const text = searched.get(afterReplace.chapterId);
    if (text === undefined || text === afterReplace.textBefore) return;
    setAfterReplace(null);
    if (total === 0) return;
    const at = chapters.findIndex((c) => c.id === afterReplace.chapterId);
    goTo(hits.find((h) => !before(h, at, afterReplace.offset)) ?? hits[0]!);
    // Runs when a search answers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searched, pending, afterReplace]);

  const [lastReplace, setLastReplace] = useState<LastReplace | null>(null);
  // A change to those chapters made since by other means (typing, another
  // tool) ends the bar's hold on the undo.
  useEffect(() => {
    if (!lastReplace) return;
    for (const [id, t] of lastReplace.texts) {
      const now = textOf(id);
      if (now !== t.before && now !== t.after) {
        setLastReplace(null);
        return;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapters, markdown, lastReplace]);

  const regexMode = find.options.regex;
  const canReplace = !readOnly && !stale && total > 0;

  const remember = (edits: { chapterId: string; text: string; changes: TextChange[] }[], count: number) => {
    const texts = new Map(edits.map((e) => [e.chapterId, { before: e.text, after: applyTextChanges(e.text, e.changes) }]));
    setLastReplace({ count, texts, undone: false });
  };

  const replaceOne = () => {
    if (!canReplace) return;
    if (current < 0) return next();
    const hit = hits[current]!;
    const result = results.find((r) => r.chapterId === hit.chapterId)!;
    const [change] = replaceChanges(result.text, [hit.match], find.replace, regexMode);
    if (change!.insert === change!.expect) return next();
    applyViewerEdit(dispatch, hit.chapterId, [change!], result.text.length);
    remember([{ chapterId: hit.chapterId, text: result.text, changes: [change!] }], 1);
    // Where the replaced match ends now (the change may cover only part of it).
    const offset = hit.match.to + change!.insert.length - (change!.to - change!.from);
    setAfterReplace({ chapterId: hit.chapterId, offset, textBefore: result.text });
  };

  const replaceAll = () => {
    if (!canReplace || incomplete) return;
    const edits = results.map((r) => ({
      chapterId: r.chapterId,
      text: r.text,
      changes: replaceChanges(r.text, r.matches, find.replace, regexMode).filter((c) => c.insert !== c.expect),
      baseLength: r.text.length,
    })).filter((e) => e.changes.length > 0);
    const count = edits.reduce((n, e) => n + e.changes.length, 0);
    if (count === 0) return;
    applyViewerEdits(dispatch, edits, activeChapterId);
    remember(edits, count);
    announce(fill(edits.length > 1 ? labels.findReplacedAllBook : labels.findReplacedAll, { count, chapters: edits.length }));
  };

  const takeBack = (redo: boolean): boolean => {
    if (!lastReplace || lastReplace.undone !== redo) return false;
    const step = activeHistory()?.peek(redo) ?? null;
    if (!isReplacementStep(step, [...lastReplace.texts.keys()])) {
      setLastReplace(null);
      return false;
    }
    if (!(redo ? redoViewerEdit() : undoViewerEdit())) return false;
    setLastReplace({ ...lastReplace, undone: !redo });
    announce(redo ? labels.findRedone : labels.findUndone);
    return true;
  };

  const close = () => {
    closeFind();
    // Back to the text, the selection where the bar left it.
    const anchor = selection.head === selection.from ? selection.to : selection.from;
    dispatch({ type: 'SET_PENDING_EDITOR_FOCUS', payload: { anchor, head: selection.head, selectWord: false } });
  };

  const run = (action: FindFieldAction, e: KeyboardEvent<HTMLInputElement>) => {
    if (action === null) return;
    if (action === 'undo' || action === 'redo') {
      // The field's own undo, unless the bar has a replacement to take back.
      if (takeBack(action === 'redo')) e.preventDefault();
      return;
    }
    e.preventDefault();
    if (action === 'next') next();
    else if (action === 'previous') previous();
    else if (action === 'replace') replaceOne();
    else if (action === 'replaceAll') replaceAll();
    else if (action === 'close') close();
  };
  const keyOf = (e: KeyboardEvent<HTMLInputElement>) => ({
    key: e.key, shiftKey: e.shiftKey, altKey: e.altKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey,
    composing: e.nativeEvent.isComposing || e.keyCode === 229,
  });
  const onQueryKey = (e: KeyboardEvent<HTMLInputElement>) => run(findFieldKey(keyOf(e), 'query', isMacKeyboard()), e);
  const onReplaceKey = (e: KeyboardEvent<HTMLInputElement>) => run(findFieldKey(keyOf(e), 'replace', isMacKeyboard()), e);

  const edited = (partial: Parameters<typeof setFind>[0]) => {
    setFind(partial);
    if (lastReplace) setLastReplace(null);
  };
  const setOption = (key: keyof FindOptions) => setFind({ options: { ...find.options, [key]: !find.options[key] } });

  const countText = error
    ? fill(labels.findInvalid, { error })
    : find.query.length === 0
      ? ''
      : stopped === 'timeout'
        ? labels.findTimedOut
        : stopped === 'time'
          ? fill(labels.findStoppedTime, { total })
          : total === 0
            ? (pending ? '' : labels.findCountNone)
            : stopped === 'count'
              ? fill(labels.findTooMany, { total })
              : current >= 0
                ? fill(labels.findCount, { current: current + 1, total })
                : total === 1
                  ? labels.findCountOne
                  : fill(labels.findCountTotal, { total });
  const warn = error !== null || stopped === 'timeout' || stopped === 'time';
  const touchedChapters = results.length;
  const confirmAll = find.scope === 'book' && touchedChapters > 1;
  const replaceAllDisabled = !canReplace || incomplete;

  const fieldStyle = {
    color: 'var(--foreground)',
    backgroundColor: 'var(--surface)',
    border: '1px solid var(--pt-control-border)',
    outlineColor: 'var(--brand)',
  } as const;
  const fieldClass = 'h-7 min-w-0 rounded-md px-2 text-xs focus-visible:outline-2 focus-visible:-outline-offset-2 pt-large:h-11';

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
        <input
          ref={queryRef}
          type="text"
          dir="auto"
          value={find.query}
          onChange={(e) => edited({ query: e.currentTarget.value })}
          onKeyDown={onQueryKey}
          placeholder={labels.findQuery}
          aria-label={labels.findQuery}
          aria-invalid={error ? true : undefined}
          spellCheck={false}
          className={`${fieldClass} w-full flex-1`}
          style={fieldStyle}
        />
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
        <div className="flex flex-wrap items-center gap-1 ps-7">
          <input
            type="text"
            dir="auto"
            value={find.replace}
            onChange={(e) => edited({ replace: e.currentTarget.value })}
            onKeyDown={onReplaceKey}
            placeholder={labels.findReplace}
            aria-label={labels.findReplace}
            aria-describedby={readOnly ? readOnlyId : undefined}
            spellCheck={false}
            className={`${fieldClass} flex-1`}
            style={fieldStyle}
          />
          <IconButton label={labels.findReplaceOne} icon={<Replace size={14} />} onClick={replaceOne} disabled={!canReplace} />
          {confirmAll && !replaceAllDisabled ? (
            <ConfirmPopover
              message={fill(labels.findReplaceAllConfirm, { count: total, chapters: touchedChapters })}
              confirmLabel={labels.findReplaceAll}
              onConfirm={replaceAll}
            >
              {({ open }) => (
                <IconButton label={labels.findReplaceAll} icon={<ReplaceAll size={14} />} onClick={open} />
              )}
            </ConfirmPopover>
          ) : (
            <IconButton label={labels.findReplaceAll} icon={<ReplaceAll size={14} />} onClick={replaceAll} disabled={replaceAllDisabled} />
          )}
          {readOnly && (
            <p id={readOnlyId} role="note" className="flex w-full flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--slate)' }}>
              <span>{labels.findReadOnly}</span>
              <Button size="sm" variant="ghost" onClick={() => setEditMode('content')}>{labels.editorSwitchToContent}</Button>
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 ps-7">
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
        <span className="min-w-0 flex-1 truncate text-xs" role="status" aria-live="polite" title={countText} style={{ color: warn ? 'var(--pt-error, #ef4444)' : 'var(--slate)' }}>
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

      {lastReplace && (
        <div className="flex items-center gap-2 ps-7 text-xs" style={{ color: 'var(--slate)' }}>
          <span className="min-w-0 flex-1">
            {lastReplace.undone
              ? labels.findUndone
              : fill(lastReplace.texts.size > 1 ? labels.findReplacedAllBook : labels.findReplacedAll, { count: lastReplace.count, chapters: lastReplace.texts.size })}
          </span>
          {lastReplace.undone ? (
            <IconButton label={labels.findRedo} icon={<Redo2 size={13} />} onClick={() => takeBack(true)} />
          ) : (
            <IconButton label={labels.findUndo} icon={<Undo2 size={13} />} onClick={() => takeBack(false)} />
          )}
        </div>
      )}

      {find.listOpen && total > 0 && (
        <ResultsList
          results={results}
          total={total}
          currentHit={current >= 0 ? hits[current] : undefined}
          onPick={goTo}
          untitled={labels.findUntitledChapter}
          more={labels.findMoreResults}
          lineLabel={labels.findLine}
        />
      )}
    </div>
  );
}

function OptionToggle({ label, active, disabled, onClick, icon }: { label: string; active: boolean; disabled?: boolean; onClick: () => void; icon: ReactNode }) {
  return <IconButton label={label} icon={icon} active={active} disabled={disabled} onClick={onClick} />;
}
