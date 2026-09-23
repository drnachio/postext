'use client';

import { useEffect, useMemo, useRef } from 'react';
import { DEFAULT_CHIP_STYLES, defaultResourceTypes } from 'postext';
import { useCodeMirror } from './useCodeMirror';
import { EditorToolbar } from './EditorToolbar';
import { useSandbox, useSandboxEditorStateRef } from '../context/SandboxContext';
import type { RefCompletionContext } from './refCompletion';

interface MarkdownEditorProps {
  isDark?: boolean;
}

export function MarkdownEditor({ isDark = true }: MarkdownEditorProps) {
  const { state, dispatch } = useSandbox();
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
  refContextRef.current = {
    resources: state.resources,
    types,
    chipStyles: state.config.chipStyles ?? DEFAULT_CHIP_STYLES,
  };

  const { containerRef, viewRef } = useCodeMirror({
    initialValue: state.markdown,
    externalValue: state.markdown,
    onChange: (value) => dispatch({ type: 'SET_MARKDOWN', payload: value }),
    onSelectionChange: (selection) => dispatch({ type: 'SET_SELECTION', payload: selection }),
    onFocusChange: (focused) => dispatch({ type: 'SET_EDITOR_FOCUSED', payload: focused }),
    isDark,
    persistedStateRef: editorStateRef,
    getRefContext: () => refContextRef.current,
  });

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
      <EditorToolbar viewRef={viewRef} />
      <div style={{ flex: '1 1 0%', minHeight: 0, position: 'relative' }}>
        <div ref={containerRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }} />
      </div>
    </div>
  );
}
