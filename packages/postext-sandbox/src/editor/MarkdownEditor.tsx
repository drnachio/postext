'use client';

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
    onChange: (value) => dispatch({ type: 'SET_MARKDOWN', payload: value }),
    isDark,
  });

  return (
    <div className="flex h-full flex-col">
      <EditorToolbar viewRef={viewRef} />
      <div ref={containerRef} className="min-h-0 flex-1" />
    </div>
  );
}
