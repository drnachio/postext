'use client';

import { useEffect } from 'react';
import { useCodeMirror } from './useCodeMirror';
import { EditorToolbar } from './EditorToolbar';
import { useSandbox } from '../context/SandboxContext';

interface MarkdownEditorProps {
  isDark?: boolean;
}

export function MarkdownEditor({ isDark = true }: MarkdownEditorProps) {
  const { state, dispatch, editorStateRef } = useSandbox();

  const { containerRef, viewRef } = useCodeMirror({
    initialValue: state.markdown,
    externalValue: state.markdown,
    onChange: (value) => dispatch({ type: 'SET_MARKDOWN', payload: value }),
    onSelectionChange: (selection) => dispatch({ type: 'SET_SELECTION', payload: selection }),
    onFocusChange: (focused) => dispatch({ type: 'SET_EDITOR_FOCUSED', payload: focused }),
    isDark,
    persistedStateRef: editorStateRef,
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
  useEffect(() => {
    if (pendingEditorFocus === null) return;
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
  }, [pendingEditorFocus, dispatch, viewRef]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, flex: '1 1 0%', minHeight: 0 }}>
      <EditorToolbar viewRef={viewRef} />
      <div style={{ flex: '1 1 0%', minHeight: 0, position: 'relative' }}>
        <div ref={containerRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }} />
      </div>
    </div>
  );
}
