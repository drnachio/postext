'use client';

import { useEffect, useRef } from 'react';
import { EditorView, lineNumbers, highlightActiveLine, keymap } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { bracketMatching } from '@codemirror/language';
import { getEditorTheme } from './postextTheme';
import { frontmatterHighlight, frontmatterParser, frontmatterTheme } from './frontmatterHighlight';

interface UseCodeMirrorOptions {
  initialValue: string;
  externalValue?: string;
  onChange: (value: string) => void;
  onSelectionChange?: (selection: { from: number; to: number }) => void;
  onFocusChange?: (focused: boolean) => void;
  isDark?: boolean;
}

export function useCodeMirror({ initialValue, externalValue, onChange, onSelectionChange, onFocusChange, isDark = true }: UseCodeMirrorOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;
  const onFocusChangeRef = useRef(onFocusChange);
  onFocusChangeRef.current = onFocusChange;

  // Initialize editor
  useEffect(() => {
    if (!containerRef.current) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current(update.state.doc.toString());
      }
      if (update.docChanged || update.selectionSet) {
        const sel = update.state.selection.main;
        onSelectionChangeRef.current?.({ from: sel.from, to: sel.to });
      }
      if (update.focusChanged) {
        onFocusChangeRef.current?.(update.view.hasFocus);
      }
    });

    const state = EditorState.create({
      doc: initialValue,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        history(),
        bracketMatching(),
        markdown({ extensions: [frontmatterParser] }),
        frontmatterTheme,
        frontmatterHighlight,
        keymap.of([...defaultKeymap, ...historyKeymap]),
        themeCompartment.current.of(getEditorTheme(isDark)),
        updateListener,
        EditorView.lineWrapping,
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync theme changes
  useEffect(() => {
    if (!viewRef.current) return;
    viewRef.current.dispatch({
      effects: themeCompartment.current.reconfigure(getEditorTheme(isDark ?? true)),
    });
  }, [isDark]);

  // Sync external value (e.g. after hydration or reset)
  useEffect(() => {
    const view = viewRef.current;
    if (!view || externalValue === undefined) return;
    const current = view.state.doc.toString();
    if (current !== externalValue) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: externalValue },
      });
    }
  }, [externalValue]);

  return { containerRef, viewRef };
}
