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
import type { PostextConfig, VDTDocument, Resource } from 'postext';
import { defaultResourceTypes } from 'postext';
import type { PanelId, ViewportTab, SandboxLabels } from '../types';
import { DEFAULT_LABELS } from '../types';
import { loadConfig, loadMarkdown, loadViewport, loadSidebarPercent, loadPanel, loadPresetId, saveConfig, saveMarkdown, saveViewport, saveSidebarPercent, savePanel } from '../storage/persistence';
import { loadResources, saveResource, deleteResource } from '../storage/resources';
import { setCustomFonts } from '../controls/fontLoader';
import { pruneFontFiles } from '../storage/fontStorage';
import { DEFAULT_MARKDOWN_EN, DEFAULT_MARKDOWN_ES } from '../defaultMarkdown';
import { createDefaultConfig } from './defaultConfig';
import {
  BUILTIN_PRESET_ID,
  applyPreset,
  createPostextGuidePreset,
  findDefaultPrivatePreset,
  listPresets,
} from '../presets';
import type {
  PresetApplyParts,
  PresetProvider,
  PresetSourceSpec,
  PresetSummary,
} from '../presets';

export { createDefaultConfig } from './defaultConfig';

export interface EditorSelection {
  from: number;
  to: number;
  head: number;
}

export interface SandboxState {
  markdown: string;
  defaultMarkdown: string;
  config: PostextConfig;
  /** User-managed resources (images, SVGs, tables). Loaded asynchronously on
   *  init from IndexedDB (NOT localStorage) and persisted via an effect. */
  resources: Resource[];
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
  /** Id of the preset the current document came from (`BUILTIN_PRESET_ID`
   *  until a preset is loaded). Reset actions restore this preset. */
  activePresetId: string;
  presetStatus: 'idle' | 'loading' | 'error';
  presetError?: string;
  /** Config as last applied from the active preset, when known. Used to tell
   *  whether the current config has overrides worth resetting. */
  presetConfig?: PostextConfig;
  /** Every preset the sandbox knows about, in display order. */
  presetSummaries: PresetSummary[];
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
  | { type: 'BUMP_DOC_VERSION' }
  | { type: 'SET_RESOURCES'; payload: Resource[] }
  | { type: 'UPSERT_RESOURCE'; payload: Resource }
  | { type: 'DELETE_RESOURCE'; payload: string }
  | { type: 'SET_PRESET'; payload: { id: string; markdown?: string; config?: PostextConfig } }
  | { type: 'SET_PRESET_STATUS'; payload: { status: 'idle' | 'loading' | 'error'; error?: string } }
  | { type: 'SET_PRESET_LIST'; payload: PresetSummary[] };

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
    case 'SET_RESOURCES':
      return { ...state, resources: action.payload };
    case 'UPSERT_RESOURCE': {
      const idx = state.resources.findIndex((r) => r.id === action.payload.id);
      const resources =
        idx === -1
          ? [...state.resources, action.payload]
          : state.resources.map((r) => (r.id === action.payload.id ? action.payload : r));
      return { ...state, resources };
    }
    case 'DELETE_RESOURCE':
      return { ...state, resources: state.resources.filter((r) => r.id !== action.payload) };
    case 'SET_PRESET':
      return {
        ...state,
        activePresetId: action.payload.id,
        defaultMarkdown: action.payload.markdown ?? state.defaultMarkdown,
        presetConfig: action.payload.config ?? state.presetConfig,
        presetStatus: 'idle',
        presetError: undefined,
      };
    case 'SET_PRESET_STATUS':
      return { ...state, presetStatus: action.payload.status, presetError: action.payload.error };
    case 'SET_PRESET_LIST':
      return { ...state, presetSummaries: action.payload };
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
  /** Load a preset by id (all parts). No-op for unknown/unavailable ids. */
  loadPreset: (id: string) => Promise<void>;
  /** Re-fetch the active preset and re-apply the given parts. */
  reloadPreset: (parts: PresetApplyParts) => Promise<void>;
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

export function useSandboxResources(): Resource[] {
  return useSandboxSelector((s) => s.resources);
}

export interface SandboxPresetsValue {
  presets: PresetSummary[];
  activePresetId: string;
  status: SandboxState['presetStatus'];
  error?: string;
  load: (id: string) => Promise<void>;
  reload: (parts: PresetApplyParts) => Promise<void>;
}

/** Preset list plus load/reload actions. Re-renders on preset state changes
 *  only. */
export function useSandboxPresets(): SandboxPresetsValue {
  const store = useStore();
  const presets = useSandboxSelector((s) => s.presetSummaries);
  const activePresetId = useSandboxSelector((s) => s.activePresetId);
  const status = useSandboxSelector((s) => s.presetStatus);
  const error = useSandboxSelector((s) => s.presetError);
  return { presets, activePresetId, status, error, load: store.loadPreset, reload: store.reloadPreset };
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

/** Ensure `config.resourceTypes` is populated, falling back to the built-in
 *  defaults (localised to `locale`) when unset (e.g. configs persisted before
 *  the feature existed). Returns a new config object only when a change is
 *  needed. */
function withDefaultResourceTypes(config: PostextConfig, locale = 'en'): PostextConfig {
  if (config.resourceTypes && config.resourceTypes.length > 0) return config;
  return { ...config, resourceTypes: defaultResourceTypes(locale) };
}

export const DEFAULT_MARKDOWN = DEFAULT_MARKDOWN_EN;

interface SandboxProviderProps {
  children: ReactNode;
  initialMarkdown?: string;
  initialConfig?: PostextConfig;
  labels?: Partial<SandboxLabels>;
  locale?: string;
  /** Remote preset sources (index.json base URLs), tried in order after the
   *  built-in preset. Defaults to none. */
  presetSources?: PresetSourceSpec[];
  onConfigChange?: (config: PostextConfig) => void;
  onMarkdownChange?: (markdown: string) => void;
}

const NO_SOURCES: PresetSourceSpec[] = [];

export function SandboxProvider({
  children,
  initialMarkdown,
  initialConfig,
  labels,
  locale,
  presetSources = NO_SOURCES,
  onConfigChange,
  onMarkdownChange,
}: SandboxProviderProps) {
  const mergedLabels: SandboxLabels = { ...DEFAULT_LABELS, ...labels };

  const defaultMd = initialMarkdown ?? DEFAULT_MARKDOWN;

  // The built-in preset wraps the host's initial markdown/config so Reset
  // restores exactly what the host handed us. Built once per prop change;
  // the provider list below is refreshed on mount only.
  const builtinPreset = useMemo(
    () => createPostextGuidePreset({
      markdownOverride: initialMarkdown,
      configOverride: initialConfig,
      name: mergedLabels.presetPostextGuideName,
      description: mergedLabels.presetPostextGuideDescription,
    }),
    [initialMarkdown, initialConfig, mergedLabels.presetPostextGuideName, mergedLabels.presetPostextGuideDescription],
  );

  const [state, dispatch] = useReducer(sandboxReducer, undefined, () => {
    const savedMarkdown = loadMarkdown();
    const savedConfig = loadConfig();
    const savedViewport = loadViewport() as ViewportTab | null;
    const savedPercent = loadSidebarPercent();
    const savedPanel = loadPanel() as PanelId | null | undefined;

    return {
      markdown: savedMarkdown ?? defaultMd,
      defaultMarkdown: defaultMd,
      config: withDefaultResourceTypes(
        savedConfig ?? initialConfig ?? createDefaultConfig(locale ?? 'en'),
        locale ?? 'en',
      ),
      resources: [],
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
      activePresetId: loadPresetId() ?? BUILTIN_PRESET_ID,
      presetStatus: 'idle' as const,
      presetConfig: undefined,
      presetSummaries: [builtinPreset.summary],
    };
  });

  // Skip redundant initial save — state already contains localStorage values
  const hydratedRef = useRef(false);

  useEffect(() => {
    hydratedRef.current = true;
  }, []);

  // Load resources asynchronously from IndexedDB on mount. They are not part
  // of the synchronous localStorage-hydrated state. `prevResourcesRef` tracks
  // the last-persisted snapshot so the persistence effect can diff upserts
  // and deletes without re-saving everything.
  const prevResourcesRef = useRef<Resource[]>([]);
  const resourcesLoadedRef = useRef(false);

  // Preset providers, discovered on mount. Kept in a ref (not state): only
  // their summaries are rendered, and load/reload read the live list.
  const presetProvidersRef = useRef<PresetProvider[]>([builtinPreset]);
  const builtinPresetRef = useRef(builtinPreset);
  builtinPresetRef.current = builtinPreset;
  // Monotonic token so an older in-flight load never clobbers a newer one.
  const presetLoadSeqRef = useRef(0);

  const runPreset = async (provider: PresetProvider, parts: PresetApplyParts): Promise<void> => {
    const seq = ++presetLoadSeqRef.current;
    dispatch({ type: 'SET_PRESET_STATUS', payload: { status: 'loading' } });
    try {
      const loaded = await provider.load(stateRef.current.locale);
      if (seq !== presetLoadSeqRef.current) return;
      await applyPreset(loaded, dispatch, { parts });
    } catch (err) {
      if (seq !== presetLoadSeqRef.current) return;
      const message = err instanceof Error ? err.message : String(err);
      dispatch({ type: 'SET_PRESET_STATUS', payload: { status: 'error', error: message } });
    }
  };
  const runPresetRef = useRef(runPreset);
  runPresetRef.current = runPreset;

  useEffect(() => {
    let cancelled = false;
    const loc = locale ?? 'en';
    Promise.all([
      loadResources(),
      listPresets({ sources: presetSources, builtin: builtinPresetRef.current }).catch(
        () => [builtinPresetRef.current],
      ),
    ])
      .then(async ([loaded, providers]) => {
        if (cancelled) return;
        presetProvidersRef.current = providers;

        const md = stateRef.current.markdown;
        const savedMarkdown = loadMarkdown();
        const savedId = loadPresetId();
        // Pristine: the user has never edited the document (nothing saved, or
        // exactly one of the built-in samples). Any markdown edit opts out.
        const pristine =
          savedMarkdown === null || savedMarkdown === DEFAULT_MARKDOWN_EN || savedMarkdown === DEFAULT_MARKDOWN_ES;
        // Storage is shared across locales, so a pristine default document
        // persisted in *another* language gets swapped to this locale's
        // default and its examples reseeded, so entering the Spanish sandbox
        // shows Spanish resources instead of whichever language seeded first.
        const pristineOtherLocale =
          md !== defaultMd && (md === DEFAULT_MARKDOWN_EN || md === DEFAULT_MARKDOWN_ES);
        const onBuiltin = savedId === null || savedId === BUILTIN_PRESET_ID;

        // Summaries: every provider, plus a placeholder for a previously
        // active preset whose source is gone (content is kept; Reset falls
        // back to the built-in preset).
        const summaries = providers.map((p) => p.summary);
        if (savedId && !providers.some((p) => p.summary.id === savedId)) {
          summaries.push({ id: savedId, name: savedId, source: 'private', available: false });
        }
        dispatch({ type: 'SET_PRESET_LIST', payload: summaries });

        // The persistence effect diffs against this snapshot, so whatever a
        // preset applies below gets written (and stale records deleted).
        prevResourcesRef.current = loaded;
        resourcesLoadedRef.current = true;

        const privateDefault = findDefaultPrivatePreset(providers, loc);
        if (pristine && onBuiltin && privateDefault) {
          await runPresetRef.current(privateDefault, 'all');
          return;
        }
        if (loaded.length === 0 || pristineOtherLocale) {
          // First entry (empty store) or locale switch: seed the built-in
          // preset. A pristine document takes the sample markdown too (and a
          // fresh config only when none was ever saved); an edited document
          // with an emptied store just gets its example resources back.
          const parts: PresetApplyParts = !pristine
            ? 'resources'
            : loadConfig() === null ? 'all' : 'document';
          await runPresetRef.current(builtinPresetRef.current, parts);
          return;
        }
        dispatch({ type: 'SET_RESOURCES', payload: loaded });
        dispatch({ type: 'SET_PRESET', payload: { id: savedId ?? BUILTIN_PRESET_ID } });
      })
      .catch(() => {
        if (cancelled) return;
        resourcesLoadedRef.current = true;
      });
    return () => {
      cancelled = true;
    };
    // Mount-only seed: `locale`/`presetSources` are read once to pick the
    // preset and must not re-trigger seeding if they change later.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist resource changes to IndexedDB by diffing against the previous
  // snapshot. Skips until the initial async load completes so the load itself
  // doesn't trigger spurious writes.
  useEffect(() => {
    if (!resourcesLoadedRef.current) return;
    const prev = prevResourcesRef.current;
    const next = state.resources;
    if (prev === next) return;

    const prevById = new Map(prev.map((r) => [r.id, r]));
    const nextById = new Map(next.map((r) => [r.id, r]));

    for (const r of next) {
      const before = prevById.get(r.id);
      if (before !== r) {
        saveResource(r).catch(() => { /* ignore */ });
      }
    }
    for (const r of prev) {
      if (!nextById.has(r.id)) {
        deleteResource(r.id, true).catch(() => { /* ignore */ });
      }
    }

    prevResourcesRef.current = next;
  }, [state.resources]);

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

  // Keep the fontLoader's custom-font registry in sync with the config so
  // that FontPicker, loadFont(), and the worker payload collector can all
  // resolve custom families by name.
  useEffect(() => {
    setCustomFonts(state.config.customFonts);
  }, [state.config.customFonts]);

  // Drop IndexedDB font files that are no longer referenced by any variant.
  // Runs after hydration and any time the customFonts shape changes.
  useEffect(() => {
    if (!hydratedRef.current) return;
    const keep = new Set<string>();
    for (const family of state.config.customFonts ?? []) {
      for (const v of family.variants) keep.add(v.fileId);
    }
    pruneFontFiles(keep).catch(() => { /* ignore */ });
  }, [state.config.customFonts]);

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
    loadPreset: async (id) => {
      const provider = presetProvidersRef.current.find((p) => p.summary.id === id);
      if (!provider) return;
      await runPresetRef.current(provider, 'all');
    },
    reloadPreset: async (parts) => {
      const activeId = stateRef.current.activePresetId;
      const provider =
        presetProvidersRef.current.find((p) => p.summary.id === activeId) ?? builtinPresetRef.current;
      await runPresetRef.current(provider, parts);
    },
  }), [dispatch]);

  return (
    <SandboxStoreContext.Provider value={store}>
      {children}
    </SandboxStoreContext.Provider>
  );
}
