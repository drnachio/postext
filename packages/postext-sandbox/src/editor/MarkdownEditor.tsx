'use client';

import { useEffect } from 'react';
import { useCodeMirror } from './useCodeMirror';
import { EditorToolbar } from './EditorToolbar';
import { useSandbox } from '../context/SandboxContext';

interface MarkdownEditorProps {
  isDark?: boolean;
}

export function MarkdownEditor({ isDark = true }: MarkdownEditorProps) {
  const { state, dispatch } = useSandbox();

  const { containerRef, viewRef } = useCodeMirror({
    initialValue: state.markdown,
    externalValue: state.markdown,
    onChange: (value) => dispatch({ type: 'SET_MARKDOWN', payload: value }),
    onSelectionChange: (selection) => dispatch({ type: 'SET_SELECTION', payload: selection }),
    onFocusChange: (focused) => dispatch({ type: 'SET_EDITOR_FOCUSED', payload: focused }),
    isDark,
  });

  // If this editor unmounts (e.g. user switches to another viewport tab),
  // force focused=false so the canvas overlay stops rendering the caret.
  useEffect(() => {
    return () => {
      dispatch({ type: 'SET_EDITOR_FOCUSED', payload: false });
    };
  }, [dispatch]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, flex: '1 1 0%', minHeight: 0 }}>
      <EditorToolbar viewRef={viewRef} />
      <div style={{ flex: '1 1 0%', minHeight: 0, position: 'relative' }}>
        <div ref={containerRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }} />
      </div>
    </div>
  );
}
