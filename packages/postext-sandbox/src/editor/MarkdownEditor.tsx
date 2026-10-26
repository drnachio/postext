'use client';

import { useEffect, useId, useMemo, useRef } from 'react';
import { DEFAULT_CHIP_STYLES, DEFAULT_MARK_STYLES, canonicalLocaleTag, defaultResourceTypes } from 'postext';
import { documentLanguage } from '../context/documentDirection.js';
import { defaultDocumentLocale } from '../controls/language/hyphenation.js';
import { useCodeMirror } from './useCodeMirror.js';
import { EditorToolbar } from './toolbar/EditorToolbar.js';
import { useUiRtl } from '../ui/direction.js';
import { useSandbox, useSandboxEditorStateRef, useSandboxStore } from '../context/SandboxContext.js';
import { runHistoryFromUi } from '../history/historyKeys.js';
import { anchorsOf, referencesOf, type RefCompletionContext } from './completion/refCompletion.js';
import { indexTermsOf } from './syntax/indexSyntax.js';
import { useEditMode } from '../editing/editMode.js';
import { Button } from '../ui/index.js';

interface MarkdownEditorProps {
  isDark?: boolean;
}

export function MarkdownEditor({ isDark = true }: MarkdownEditorProps) {
  const { state, dispatch } = useSandbox();
  const store = useSandboxStore();
  const chapterId = state.activeChapterId;
  // Per-chapter persisted CodeMirror state: the panel remounts this editor
  // (keyed by chapter id) on every switch, so each chapter keeps its own
  // undo history and caret.
  const editorStateRef = useSandboxEditorStateRef(state.activeChapterId);

  // The `@` picker (and the chip style completion) reads resources through a ref so the CodeMirror extension
  // (created once on mount) always sees the latest list without reconfiguring.
  const types = useMemo(
    () => state.config.resourceTypes ?? defaultResourceTypes(state.locale),
    [state.config.resourceTypes, state.locale],
  );
  const refContextRef = useRef<RefCompletionContext>({ resources: [], types: [] });
  // The book's index terms, read when the completion opens: every
  // chapter's text, the active one as typed.
  const bookTextRef = useRef({ chapters: state.chapters, activeId: state.activeChapterId, markdown: state.markdown });
  bookTextRef.current = { chapters: state.chapters, activeId: state.activeChapterId, markdown: state.markdown };
  refContextRef.current = {
    resources: state.resources,
    types,
    chipStyles: state.config.chipStyles ?? DEFAULT_CHIP_STYLES,
    markStyles: state.config.markStyles ?? DEFAULT_MARK_STYLES,
    indexTerms: () => {
      const { chapters, activeId, markdown } = bookTextRef.current;
      return indexTermsOf(chapters.map((c) => (c.id === activeId ? markdown : c.markdown)));
    },
    // Headings with an id and anchors of every chapter (#262).
    anchors: () => {
      const { chapters, activeId, markdown } = bookTextRef.current;
      return anchorsOf(chapters.map((c) => (c.id === activeId ? markdown : c.markdown)));
    },
    anchorKinds: { heading: state.labels.refPickerHeading, anchor: state.labels.refPickerAnchor },
    // The book's references (#268): `@` cites one as `[@key]`.
    references: () => {
      const { chapters, activeId, markdown } = bookTextRef.current;
      return referencesOf(chapters.map((c) => (c.id === activeId ? markdown : c.markdown)));
    },
    referenceKind: state.labels.refPickerReference,
    // A figure's anchors in `::label[…]{at="…"}` and the label styles (#866).
    labelStyles: state.config.labelStyles ?? [],
    labelWords: { labelled: state.labels.labelCompletionLabelled, noStyle: state.labels.labelCompletionNoStyle, label: state.labels.labelCompletionLine },
  };

  const hintId = useId();
  // Design mode (#864): the text is read only.
  const [editMode, setEditMode] = useEditMode();
  const readOnly = editMode === 'design';
  const rtl = useUiRtl();
  // The text is in the document's language (the interface's when it
  // names none), not the interface's.
  const language = documentLanguage(state.config, defaultDocumentLocale(state.locale));
  const lang = canonicalLocaleTag(language) ?? language;
  const { containerRef, viewRef, runHistory } = useCodeMirror({
    initialValue: state.markdown,
    externalValue: state.markdown,
    onChange: (value) => dispatch({ type: 'SET_MARKDOWN', payload: value }),
    onSelectionChange: (selection) => dispatch({ type: 'SET_SELECTION', payload: selection }),
    onFocusChange: (focused) => dispatch({ type: 'SET_EDITOR_FOCUSED', payload: focused }),
    isDark,
    persistedStateRef: editorStateRef,
    getRefContext: () => refContextRef.current,
    ariaLabel: state.labels.markdownEditor,
    ariaDescribedBy: hintId,
    rtl,
    lang,
    readOnly,
    // One history for the text and the design (#899).
    historyCommands: {
      undo: () => runHistoryFromUi(store.history, 'undo', store.getSnapshot) !== null,
      redo: () => runHistoryFromUi(store.history, 'redo', store.getSnapshot) !== null,
    },
    onUpdate: (update) => store.history.editorUpdated(chapterId, update.state, update.transactions),
  });

  // The Sandbox's history (#899) drives this editor's own while it is
  // open: edits made on the previews and Cmd/Ctrl+Z go through it.
  useEffect(() => {
    const id = state.activeChapterId;
    const view = viewRef.current;
    if (view) store.history.attachEditor(id, { getState: () => view.state, run: runHistory });
    return () => store.history.attachEditor(id, null);
    // The editor is keyed by chapter: one id for its whole life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If this editor unmounts (e.g. user switches to another viewport tab),
  // force focused=false so the canvas overlay stops rendering the caret.
  useEffect(() => {
    return () => {
      dispatch({ type: 'SET_EDITOR_FOCUSED', payload: false });
    };
  }, [dispatch]);

  // Consume canvas-click caret requests: focus the editor and move the caret
  // to the requested source offset, then clear the pending flag.
  const pendingEditorFocus = state.pendingEditorFocus;
  const activeChapterId = state.activeChapterId;
  useEffect(() => {
    if (pendingEditorFocus === null) return;
    // The reducer already switched chapters; a request for another chapter
    // can only be seen by an editor that is about to unmount.
    if (pendingEditorFocus.chapterId && pendingEditorFocus.chapterId !== activeChapterId) return;
    const view = viewRef.current;
    if (!view) return;
    const docLen = view.state.doc.length;
    const clamp = (n: number): number => Math.max(0, Math.min(n, docLen));
    let anchor = clamp(pendingEditorFocus.anchor);
    let head = clamp(pendingEditorFocus.head);
    if (pendingEditorFocus.selectWord && anchor === head) {
      const word = view.state.wordAt(anchor);
      if (word) {
        anchor = word.from;
        head = word.to;
      }
    }
    view.focus();
    view.dispatch({
      selection: { anchor, head },
      scrollIntoView: true,
    });
    dispatch({ type: 'SET_PENDING_EDITOR_FOCUS', payload: null });
  }, [pendingEditorFocus, activeChapterId, dispatch, viewRef]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, flex: '1 1 0%', minHeight: 0 }}>
      <EditorToolbar viewRef={viewRef} lang={language} readOnly={readOnly} />
      {readOnly && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 border-b px-3 py-1.5 text-[0.7rem]"
          style={{ borderColor: 'var(--rule)', backgroundColor: 'var(--surface)', color: 'var(--slate)' }}
        >
          <span>{state.labels.editorDesignModeNotice}</span>
          <Button size="sm" variant="ghost" onClick={() => { setEditMode('content'); viewRef.current?.focus(); }}>
            {state.labels.editorSwitchToContent}
          </Button>
        </div>
      )}
      <p id={hintId} className="sr-only">{state.labels.editorKeyboardHint}</p>
      <div style={{ flex: '1 1 0%', minHeight: 0, position: 'relative' }}>
        <div ref={containerRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }} />
      </div>
    </div>
  );
}
