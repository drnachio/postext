'use client';

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useRef,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
  type Dispatch,
  type MutableRefObject,
} from 'react';
import type { PostextConfig, VDTDocument } from 'postext';
import { cloneDefaultColorPalette } from 'postext';
import type { PanelId, ViewportTab, SandboxLabels } from '../types';
import { DEFAULT_LABELS } from '../types';
import { loadConfig, loadMarkdown, loadViewport, loadSidebarPercent, loadPanel, saveConfig, saveMarkdown, saveViewport, saveSidebarPercent, savePanel } from '../storage/persistence';
import { DEFAULT_MARKDOWN_EN } from '../defaultMarkdown';

export interface EditorSelection {
  from: number;
  to: number;
  head: number;
}

export interface SandboxState {
  markdown: string;
  defaultMarkdown: string;
  config: PostextConfig;
  activePanel: PanelId | null;
  sidebarPercent: number;
  sidebarDragging: boolean;
  activeViewport: ViewportTab;
  labels: SandboxLabels;
  locale: string;
  selection: EditorSelection;
  editorFocused: boolean;
  pendingEditorFocus: { anchor: number; head: number; selectWord: boolean } | null;
  /** Incremented whenever a viewport publishes a new built VDTDocument to
   *  `docRef`. Consumers (e.g. WarningsPanel) listen to this counter to
   *  recompute derived data. */
  docVersion: number;
}

export type SandboxAction =
  | { type: 'SET_MARKDOWN'; payload: string }
  | { type: 'SET_CONFIG'; payload: PostextConfig }
  | { type: 'UPDATE_CONFIG'; payload: Partial<PostextConfig> }
  | { type: 'TOGGLE_PANEL'; payload: PanelId }
  | { type: 'SET_PANEL'; payload: PanelId | null }
  | { type: 'SET_SIDEBAR_PERCENT'; payload: number }
  | { type: 'SET_SIDEBAR_DRAGGING'; payload: boolean }
  | { type: 'SET_VIEWPORT'; payload: ViewportTab }
  | { type: 'SET_SELECTION'; payload: EditorSelection }
  | { type: 'SET_EDITOR_FOCUSED'; payload: boolean }
  | { type: 'SET_PENDING_EDITOR_FOCUS'; payload: { anchor: number; head: number; selectWord: boolean } | null }
  | { type: 'BUMP_DOC_VERSION' };

function sandboxReducer(state: SandboxState, action: SandboxAction): SandboxState {
  switch (action.type) {
    case 'SET_MARKDOWN':
      return { ...state, markdown: action.payload };
    case 'SET_CONFIG':
      return { ...state, config: action.payload };
    case 'UPDATE_CONFIG':
      return { ...state, config: { ...state.config, ...action.payload } };
    case 'TOGGLE_PANEL':
      return {
        ...state,
        activePanel: state.activePanel === action.payload ? null : action.payload,
      };
    case 'SET_PANEL':
      return { ...state, activePanel: action.payload };
    case 'SET_SIDEBAR_PERCENT':
      return { ...state, sidebarPercent: action.payload };
    case 'SET_SIDEBAR_DRAGGING':
      return { ...state, sidebarDragging: action.payload };
    case 'SET_VIEWPORT':
      return { ...state, activeViewport: action.payload };
    case 'SET_SELECTION':
      if (
        state.selection.from === action.payload.from &&
        state.selection.to === action.payload.to &&
        state.selection.head === action.payload.head
      ) {
        return state;
      }
      return { ...state, selection: action.payload };
    case 'SET_EDITOR_FOCUSED':
      if (state.editorFocused === action.payload) return state;
      return { ...state, editorFocused: action.payload };
    case 'SET_PENDING_EDITOR_FOCUS':
      if (state.pendingEditorFocus === action.payload) return state;
      if (
        state.pendingEditorFocus &&
        action.payload &&
        state.pendingEditorFocus.anchor === action.payload.anchor &&
        state.pendingEditorFocus.head === action.payload.head &&
        state.pendingEditorFocus.selectWord === action.payload.selectWord
      ) return state;
      return { ...state, pendingEditorFocus: action.payload };
    case 'BUMP_DOC_VERSION':
      return { ...state, docVersion: state.docVersion + 1 };
    default:
      return state;
  }
}

interface SandboxStore {
  getSnapshot: () => SandboxState;
  subscribe: (cb: () => void) => () => void;
  dispatch: Dispatch<SandboxAction>;
  editorStateRef: MutableRefObject<unknown | null>;
  /** Ref to the most recently built VDT document from whichever viewport
   *  last rendered. Null until the first successful build. Updated together
   *  with a `BUMP_DOC_VERSION` dispatch so consumers can react. */
  docRef: MutableRefObject<VDTDocument | null>;
}

export interface SandboxContextValue {
  state: SandboxState;
  dispatch: Dispatch<SandboxAction>;
  editorStateRef: MutableRefObject<unknown | null>;
  docRef: MutableRefObject<VDTDocument | null>;
}

const SandboxStoreContext = createContext<SandboxStore | null>(null);

function useStore(): SandboxStore {
  const store = useContext(SandboxStoreContext);
  if (!store) throw new Error('useSandbox must be used within <SandboxProvider>');
  return store;
}

export function useSandbox(): SandboxContextValue {
  const store = useStore();
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { state, dispatch: store.dispatch, editorStateRef: store.editorStateRef, docRef: store.docRef };
}

/** Stable dispatch reference — never triggers a re-render on state changes. */
export function useSandboxDispatch(): Dispatch<SandboxAction> {
  return useStore().dispatch;
}

/** Subscribe to a slice of state; component re-renders only when the selected
 *  value changes (by `isEqual`, defaults to `Object.is`). */
export function useSandboxSelector<T>(
  selector: (s: SandboxState) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const store = useStore();
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const isEqualRef = useRef(isEqual);
  isEqualRef.current = isEqual;
  const lastStateRef = useRef<SandboxState | null>(null);
  const lastResultRef = useRef<T>(undefined as T);

  const getSnapshot = () => {
    const s = store.getSnapshot();
    if (s !== lastStateRef.current) {
      const next = selectorRef.current(s);
      if (lastStateRef.current === null || !isEqualRef.current(lastResultRef.current, next)) {
        lastResultRef.current = next;
      }
      lastStateRef.current = s;
    }
    return lastResultRef.current;
  };

  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

export function useSandboxConfig(): PostextConfig {
  return useSandboxSelector((s) => s.config);
}

export function useSandboxLabels() {
  return useSandboxSelector((s) => s.labels);
}

/** Stable ref to the most recently built VDT document. Does not subscribe
 *  to state changes — read inside effects/handlers via `.current`. */
export function useSandboxDocRef(): MutableRefObject<VDTDocument | null> {
  return useStore().docRef;
}

/** Stable ref for the editor state, mirroring useSandboxDocRef. */
export function useSandboxEditorStateRef(): MutableRefObject<unknown | null> {
  return useStore().editorStateRef;
}

export function createDefaultConfig(): PostextConfig {
  return { colorPalette: cloneDefaultColorPalette() };
}

export const DEFAULT_MARKDOWN = DEFAULT_MARKDOWN_EN;

interface SandboxProviderProps {
  children: ReactNode;
  initialMarkdown?: string;
  initialConfig?: PostextConfig;
  labels?: Partial<SandboxLabels>;
  locale?: string;
  onConfigChange?: (config: PostextConfig) => void;
  onMarkdownChange?: (markdown: string) => void;
}

export function SandboxProvider({
  children,
  initialMarkdown,
  initialConfig,
  labels,
  locale,
  onConfigChange,
  onMarkdownChange,
}: SandboxProviderProps) {
  const mergedLabels: SandboxLabels = { ...DEFAULT_LABELS, ...labels };

  const defaultMd = initialMarkdown ?? DEFAULT_MARKDOWN;

  const [state, dispatch] = useReducer(sandboxReducer, undefined, () => {
    const savedMarkdown = loadMarkdown();
    const savedConfig = loadConfig();
    const savedViewport = loadViewport() as ViewportTab | null;
    const savedPercent = loadSidebarPercent();
    const savedPanel = loadPanel() as PanelId | null | undefined;

    return {
      markdown: savedMarkdown ?? defaultMd,
      defaultMarkdown: defaultMd,
      config: savedConfig ?? initialConfig ?? createDefaultConfig(),
      activePanel: savedPanel !== undefined ? savedPanel : ('markdown' as PanelId),
      sidebarPercent: savedPercent ?? 25,
      sidebarDragging: false,
      activeViewport: (savedViewport as ViewportTab) ?? ('canvas' as ViewportTab),
      labels: mergedLabels,
      locale: locale ?? 'en',
      selection: { from: 0, to: 0, head: 0 },
      editorFocused: false,
      pendingEditorFocus: null,
      docVersion: 0,
    };
  });

  // Skip redundant initial save — state already contains localStorage values
  const hydratedRef = useRef(false);

  useEffect(() => {
    hydratedRef.current = true;
  }, []);

  // Auto-save to localStorage (debounced, skip until hydrated)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!hydratedRef.current) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveMarkdown(state.markdown);
      saveConfig(state.config);
    }, 1000);
    return () => clearTimeout(saveTimerRef.current);
  }, [state.markdown, state.config]);

  // Save viewport tab and active panel immediately (skip until hydrated)
  useEffect(() => {
    if (!hydratedRef.current) return;
    saveViewport(state.activeViewport);
  }, [state.activeViewport]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    savePanel(state.activePanel);
  }, [state.activePanel]);

  // Save sidebar percent when drag ends
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (!state.sidebarDragging) {
      saveSidebarPercent(state.sidebarPercent);
    }
  }, [state.sidebarDragging, state.sidebarPercent]);

  // Notify parent of changes
  useEffect(() => {
    onConfigChange?.(state.config);
  }, [state.config, onConfigChange]);

  useEffect(() => {
    onMarkdownChange?.(state.markdown);
  }, [state.markdown, onMarkdownChange]);

  const editorStateRef = useRef<unknown | null>(null);
  const docRef = useRef<VDTDocument | null>(null);

  // Subscription plumbing: hold the live state in a ref and notify
  // subscribers when it changes. Lets hooks below subscribe to specific
  // slices via useSyncExternalStore without re-rendering on unrelated
  // state changes.
  const stateRef = useRef(state);
  const listenersRef = useRef<Set<() => void>>(new Set());
  stateRef.current = state;

  useEffect(() => {
    // Fire after commit so subscribers see the committed state.
    for (const cb of listenersRef.current) cb();
  }, [state]);

  const store = useMemo<SandboxStore>(() => ({
    getSnapshot: () => stateRef.current,
    subscribe: (cb) => {
      listenersRef.current.add(cb);
      return () => { listenersRef.current.delete(cb); };
    },
    dispatch,
    editorStateRef,
    docRef,
  }), [dispatch]);

  return (
    <SandboxStoreContext.Provider value={store}>
      {children}
    </SandboxStoreContext.Provider>
  );
}
