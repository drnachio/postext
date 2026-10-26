'use client';

import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import { EditorView, lineNumbers, highlightActiveLine, keymap, type KeyBinding, type ViewUpdate } from '@codemirror/view';
import { EditorState, Compartment, Transaction } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { defaultKeymap, history, historyField, isolateHistory, redo, redoSelection, undo, undoSelection } from '@codemirror/commands';
import { bracketMatching } from '@codemirror/language';
import { getEditorTheme } from './postextTheme.js';
import { frontmatterHighlight, frontmatterParser, frontmatterTheme } from './syntax/frontmatterHighlight.js';
import { mathHighlight, mathTheme } from './syntax/mathHighlight.js';
import { chipHighlight, chipTheme } from './syntax/chipSyntax.js';
import { markHighlight, markTheme } from './syntax/markSyntax.js';
import { smallCapsHighlight, smallCapsTheme } from './syntax/smallCapsSyntax.js';
import { orientationHighlight, orientationTheme } from './syntax/orientationSyntax.js';
import { verseHighlight, verseTheme } from './syntax/verseSyntax.js';
import { hardBreakHighlight, hardBreakTheme } from './syntax/hardBreakSyntax.js';
import { tabHighlight, tabTheme } from './syntax/tabSyntax.js';
import { comicHighlight, comicTheme } from './syntax/comicSyntax.js';
import { composedHighlight, composedTheme } from './syntax/composedSyntax.js';
import { annotationHighlight, annotationTheme } from './syntax/annotationSyntax.js';
import { indexHighlight, indexTheme } from './syntax/indexSyntax.js';
import { codeFenceHighlight, codeFenceTheme } from './syntax/codeFences.js';
import { bidiLines, rtlEditor } from './syntax/bidiLines.js';
import { refCompletion, type RefCompletionContext } from './completion/refCompletion.js';
import { minimalChange } from '../book/textChanges.js';
import { takeViewerChanges } from './viewerEdits.js';

interface UseCodeMirrorOptions {
  initialValue: string;
  externalValue?: string;
  onChange: (value: string) => void;
  onSelectionChange?: (selection: { from: number; to: number; head: number }) => void;
  onFocusChange?: (focused: boolean) => void;
  isDark?: boolean;
  persistedStateRef?: MutableRefObject<unknown | null>;
  /** Live resources/types for the `@` reference picker. Read on every
   *  keystroke, so pass a stable getter over a ref. */
  getRefContext?: () => RefCompletionContext;
  /** Accessible name of the text area (screen readers announce it). */
  ariaLabel?: string;
  /** id of a hint read after the name (keyboard use). */
  ariaDescribedBy?: string;
  /** The interface runs right to left: so does the editor (its gutter at
   *  the right), each line still set the way its own text reads. */
  rtl?: boolean;
  /** The document language, as the `lang` of the text: the browser then
   *  draws kanji in their Japanese or Chinese forms (直, 骨, 角 differ),
   *  whatever the interface language. */
  lang?: string;
  /** The text cannot be changed by typing (Design mode, #864): the caret
   *  still moves and the text can be selected and copied. Edits made on
   *  the previews still arrive. */
  readOnly?: boolean;
  /** What Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z (Ctrl+Y) do: the Sandbox's one
   *  history of text and configuration (#899). The editor's own history
   *  when left out. */
  historyCommands?: { undo: () => boolean; redo: () => boolean };
  /** Every update of the view (the history follows its transactions). */
  onUpdate?: (update: ViewUpdate) => void;
}

/** Undo and redo keys bound to `commands`; the selection-only history
 *  keys (Mod-u, Alt-u) stay the editor's. */
function historyKeys(commands: () => { undo: () => boolean; redo: () => boolean } | undefined): KeyBinding[] {
  const run = (dir: 'undo' | 'redo') => (view: EditorView) => {
    const c = commands();
    if (!c) return dir === 'undo' ? undo(view) : redo(view);
    c[dir]();
    // Nothing to take back is still no browser undo inside the text.
    return true;
  };
  return [
    { key: 'Mod-z', run: run('undo'), preventDefault: true },
    { key: 'Mod-Shift-z', run: run('redo'), preventDefault: true },
    { key: 'Mod-y', run: run('redo'), preventDefault: true },
    { key: 'Mod-u', run: undoSelection, preventDefault: true },
    { key: 'Alt-u', mac: 'Mod-Shift-u', run: redoSelection, preventDefault: true },
  ];
}

/** The read-only state of the editor, with the `aria-readonly` that says it. */
function readOnlyExtensions(readOnly: boolean) {
  return readOnly ? [EditorState.readOnly.of(true), EditorView.contentAttributes.of({ 'aria-readonly': 'true' })] : [];
}

/** The `lang` attribute of the editor's text, when there is one. */
function langAttributes(lang: string | undefined) {
  return EditorView.contentAttributes.of(lang ? { lang } : {});
}

export function useCodeMirror({ initialValue, externalValue, onChange, onSelectionChange, onFocusChange, isDark = true, persistedStateRef, getRefContext, ariaLabel, ariaDescribedBy, rtl = false, lang, readOnly = false, historyCommands, onUpdate }: UseCodeMirrorOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const langCompartment = useRef(new Compartment());
  const readOnlyCompartment = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;
  const onFocusChangeRef = useRef(onFocusChange);
  onFocusChangeRef.current = onFocusChange;
  const getRefContextRef = useRef(getRefContext);
  getRefContextRef.current = getRefContext;
  const historyCommandsRef = useRef(historyCommands);
  historyCommandsRef.current = historyCommands;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  /** The first sync of the external value happens on mount. */
  const syncedRef = useRef(false);

  // Initialize editor
  useEffect(() => {
    if (!containerRef.current) return;

    const updateListener = EditorView.updateListener.of((update) => {
      onUpdateRef.current?.(update);
      if (update.docChanged) {
        onChangeRef.current(update.state.doc.toString());
      }
      if (update.docChanged || update.selectionSet) {
        const sel = update.state.selection.main;
        onSelectionChangeRef.current?.({ from: sel.from, to: sel.to, head: sel.head });
      }
      if (update.focusChanged) {
        onFocusChangeRef.current?.(update.view.hasFocus);
      }
    });

    const extensions = [
      ...(ariaLabel ? [EditorView.contentAttributes.of({ 'aria-label': ariaLabel, 'aria-multiline': 'true', tabindex: '0', ...(ariaDescribedBy ? { 'aria-describedby': ariaDescribedBy } : {}) })] : []),
      langCompartment.current.of(langAttributes(lang)),
      readOnlyCompartment.current.of(readOnlyExtensions(readOnly)),
      lineNumbers(),
      highlightActiveLine(),
      history(),
      bracketMatching(),
      markdown({ extensions: [frontmatterParser] }),
      frontmatterTheme,
      frontmatterHighlight,
      mathTheme,
      mathHighlight,
      chipTheme,
      chipHighlight,
      markTheme,
      markHighlight,
      smallCapsTheme,
      smallCapsHighlight,
      orientationTheme,
      orientationHighlight,
      verseTheme,
      verseHighlight,
      hardBreakTheme,
      hardBreakHighlight,
      tabTheme,
      tabHighlight,
      comicTheme,
      comicHighlight,
      composedTheme,
      composedHighlight,
      annotationTheme,
      annotationHighlight,
      indexTheme,
      indexHighlight,
      codeFenceTheme,
      codeFenceHighlight,
      bidiLines,
      rtlEditor.of(rtl),
      refCompletion(() => getRefContextRef.current?.() ?? { resources: [], types: [] }),
      keymap.of([...historyKeys(() => historyCommandsRef.current), ...defaultKeymap]),
      themeCompartment.current.of(getEditorTheme(isDark)),
      updateListener,
      EditorView.lineWrapping,
    ];

    const persisted = persistedStateRef?.current as
      | { doc: string; selection: unknown; history: unknown }
      | null
      | undefined;

    const state = persisted
      ? EditorState.fromJSON(
          persisted,
          { extensions },
          { history: historyField },
        )
      : EditorState.create({ doc: initialValue, extensions });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      if (persistedStateRef) {
        persistedStateRef.current = view.state.toJSON({ history: historyField });
      }
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

  // Follow the document language.
  useEffect(() => {
    if (!viewRef.current) return;
    viewRef.current.dispatch({ effects: langCompartment.current.reconfigure(langAttributes(lang)) });
  }, [lang]);

  // Design mode makes the text read only (#864).
  useEffect(() => {
    if (!viewRef.current) return;
    viewRef.current.dispatch({ effects: readOnlyCompartment.current.reconfigure(readOnlyExtensions(readOnly)) });
  }, [readOnly]);

  // Sync external value (after hydration or reset, or an edit made on the
  // previews: a comic splitter dragged, #568). Only the part that differs
  // is replaced, as its own undo step, so the caret stays where it was and
  // Cmd/Ctrl+Z takes back just that edit.
  useEffect(() => {
    const first = !syncedRef.current;
    syncedRef.current = true;
    const view = viewRef.current;
    if (!view || externalValue === undefined) return;
    const current = view.state.doc.toString();
    if (current === externalValue) return;
    const exact = takeViewerChanges(current, externalValue);
    const changes = (exact ?? [minimalChange(current, externalValue)!]).map(({ from, to, insert }) => ({ from, to, insert }));
    // On mount, the text the saved state left was changed by other means
    // while the editor was closed (the edits made on the previews are in
    // the saved history already, #899): the history is mapped over it.
    view.dispatch({
      changes,
      annotations: first
        ? [Transaction.addToHistory.of(false), Transaction.userEvent.of('input.external')]
        : [isolateHistory.of('full'), Transaction.userEvent.of('input.external')],
    });
  }, [externalValue]);

  /** One step of the editor's own history taken back or put back, also
   *  in Design mode, where the text is read only to typing (#899). */
  const runHistory = useCallback((dir: 'undo' | 'redo'): boolean => {
    const view = viewRef.current;
    if (!view) return false;
    const command = dir === 'undo' ? undo : redo;
    if (!view.state.readOnly) return command(view);
    view.dispatch({ effects: readOnlyCompartment.current.reconfigure([]) });
    try {
      return command(view);
    } finally {
      view.dispatch({ effects: readOnlyCompartment.current.reconfigure(readOnlyExtensions(readOnlyRef.current)) });
    }
  }, []);

  return { containerRef, viewRef, runHistory };
}
