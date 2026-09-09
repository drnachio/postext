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
import { stripConfigDefaults } from 'postext';
import type { PanelId, ViewportTab, SandboxLabels } from '../types';
import { DEFAULT_LABELS } from '../types';
import { loadConfig, loadMarkdown, loadViewport, loadSidebarPercent, loadPanel, loadPresetApplied, loadPresetId, loadProjectId, saveConfig, saveMarkdown, saveViewport, saveSidebarPercent, savePanel, savePresetApplied, saveProjectId } from '../storage/persistence';
import { loadResources, saveResource, deleteResource } from '../storage/resources';
import { setCustomFonts } from '../controls/fontLoader';
import { pruneFontFiles } from '../storage/fontStorage';
import { pruneBlobs } from '../storage/blobStore';
import { collectProjectFileIds, listProjects, referencedFileIds, toSummary, updateProject } from '../storage/projects';
import type { ProjectSummary } from '../storage/projects';
import { DEFAULT_MARKDOWN_EN, DEFAULT_MARKDOWN_ES } from '../defaultMarkdown';
import { createDefaultConfig, withDefaultResourceTypes } from './defaultConfig';
import { createProjectActions } from './projectActions';
import type { ProjectActions } from './projectActions';
import {
  BUILTIN_PRESET_ID,
  applyPreset,
  createPostextGuidePreset,
  decidePresetUpdate,
  findDefaultPrivatePreset,
  isDocumentUntouched,
  listPresets,
} from '../presets';
import type {
  AppliedPresetSnapshot,
  PresetApplyParts,
  PresetProvider,
  PresetSourceSpec,
  PresetSummary,
} from '../presets';

export { createDefaultConfig } from './defaultConfig';
export type { ProjectSummary } from '../storage/projects';
export type { DuplicateSource } from './projectActions';

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
  /** Fingerprint and content hashes recorded when the active preset was last
   *  applied (null until then). Persisted so the next visit can tell an
   *  untouched document from an edited one. */
  presetApplied: AppliedPresetSnapshot | null;
  /** The active preset changed on its source while the document has local
   *  edits: they are kept and the Presets panel offers a reload. */
  presetStale: boolean;
  /** Set (to a timestamp) right after the active preset was re-applied
   *  automatically because its bundle changed; cleared a few seconds later.
   *  Drives the brief "updated from disk" notice in the Presets panel. */
  presetUpdatedAt: number | null;
  /** Local project the working document is mirrored into; null while a
   *  read-only preset is active (edits then live only in the working state). */
  activeProjectId: string | null;
  /** Every stored project, oldest first. */
  projects: ProjectSummary[];
  projectStatus: 'idle' | 'busy' | 'error';
  projectError?: string;
  /** Transient message from the last project operation (export warnings). */
  projectNotice: string | null;
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
  | { type: 'SET_PRESET_LIST'; payload: PresetSummary[] }
  | { type: 'SET_PRESET_APPLIED'; payload: AppliedPresetSnapshot | null }
  | { type: 'SET_PRESET_STALE'; payload: boolean }
  | { type: 'SET_PRESET_UPDATED_AT'; payload: number | null }
  | { type: 'SET_ACTIVE_PROJECT'; payload: { id: string | null; sourcePresetId?: string } }
  | { type: 'SET_PROJECT_LIST'; payload: ProjectSummary[] }
  | { type: 'UPSERT_PROJECT_SUMMARY'; payload: ProjectSummary }
  | { type: 'REMOVE_PROJECT_SUMMARY'; payload: string }
  | { type: 'SET_PROJECT_STATUS'; payload: { status: SandboxState['projectStatus']; error?: string } }
  | { type: 'SET_PROJECT_NOTICE'; payload: string | null };

export function sandboxReducer(state: SandboxState, action: SandboxAction): SandboxState {
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
    case 'SET_PRESET_APPLIED':
      // A fresh apply is by definition up to date with its source.
      return { ...state, presetApplied: action.payload, presetStale: false };
    case 'SET_PRESET_STALE':
      if (state.presetStale === action.payload) return state;
      return { ...state, presetStale: action.payload };
    case 'SET_PRESET_UPDATED_AT':
      if (state.presetUpdatedAt === action.payload) return state;
      return { ...state, presetUpdatedAt: action.payload };
    case 'SET_ACTIVE_PROJECT': {
      if (action.payload.id === null) {
        return state.activeProjectId === null ? state : { ...state, activeProjectId: null };
      }
      // A project's baseline is the preset it came from (Reset restores it);
      // preset bookkeeping — applied snapshot, staleness, notices — is preset
      // mode only and starts clean.
      return {
        ...state,
        activeProjectId: action.payload.id,
        activePresetId: action.payload.sourcePresetId ?? BUILTIN_PRESET_ID,
        presetConfig: undefined,
        presetApplied: null,
        presetStale: false,
        presetUpdatedAt: null,
        presetStatus: 'idle',
        presetError: undefined,
      };
    }
    case 'SET_PROJECT_LIST':
      return { ...state, projects: action.payload };
    case 'UPSERT_PROJECT_SUMMARY': {
      const idx = state.projects.findIndex((p) => p.id === action.payload.id);
      const projects = idx === -1
        ? [...state.projects, action.payload]
        : state.projects.map((p) => (p.id === action.payload.id ? action.payload : p));
      return { ...state, projects };
    }
    case 'REMOVE_PROJECT_SUMMARY':
      return { ...state, projects: state.projects.filter((p) => p.id !== action.payload) };
    case 'SET_PROJECT_STATUS':
      return { ...state, projectStatus: action.payload.status, projectError: action.payload.error };
    case 'SET_PROJECT_NOTICE':
      if (state.projectNotice === action.payload) return state;
      return { ...state, projectNotice: action.payload };
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
  projectActions: ProjectActions;
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
  /** True while the document, configuration and resources still match what
   *  the active preset applied (reloading it is then a no-op worth no
   *  confirmation). */
  untouched: boolean;
  /** The active preset's bundle changed on its source while there are local
   *  edits; `reload('all')` picks the new version up and clears this. */
  stale: boolean;
  /** Non-null for a few seconds after the preset was re-applied automatically
   *  because its bundle changed. */
  updatedAt: number | null;
  load: (id: string) => Promise<void>;
  reload: (parts: PresetApplyParts) => Promise<void>;
}

/** Preset list plus load/reload actions. Re-renders on preset state changes
 *  only (`untouched` is a boolean projection, so document edits re-render
 *  consumers only when it flips). */
export function useSandboxPresets(): SandboxPresetsValue {
  const store = useStore();
  const presets = useSandboxSelector((s) => s.presetSummaries);
  const activePresetId = useSandboxSelector((s) => s.activePresetId);
  const status = useSandboxSelector((s) => s.presetStatus);
  const error = useSandboxSelector((s) => s.presetError);
  const untouched = useSandboxSelector((s) => isDocumentUntouched(s, s.presetApplied));
  const stale = useSandboxSelector((s) => s.presetStale);
  const updatedAt = useSandboxSelector((s) => s.presetUpdatedAt);
  return {
    presets,
    activePresetId,
    status,
    error,
    untouched,
    stale,
    updatedAt,
    load: store.loadPreset,
    reload: store.reloadPreset,
  };
}

/** Whether the active preset changed on its source while local edits exist
 *  (for the activity-bar badge). */
export function useSandboxPresetStale(): boolean {
  return useSandboxSelector((s) => s.presetStale);
}

export interface SandboxProjectsValue extends ProjectActions {
  projects: ProjectSummary[];
  activeProjectId: string | null;
  status: SandboxState['projectStatus'];
  error?: string;
  notice: string | null;
  /** True when the active document can be reset to a preset: preset mode, or
   *  a project whose source preset is still available. */
  hasResetBaseline: boolean;
  dismissNotice: () => void;
}

/** Local projects plus their operations. */
export function useSandboxProjects(): SandboxProjectsValue {
  const store = useStore();
  const projects = useSandboxSelector((s) => s.projects);
  const activeProjectId = useSandboxSelector((s) => s.activeProjectId);
  const status = useSandboxSelector((s) => s.projectStatus);
  const error = useSandboxSelector((s) => s.projectError);
  const notice = useSandboxSelector((s) => s.projectNotice);
  const hasResetBaseline = useSandboxSelector((s) => {
    if (s.activeProjectId === null) return true;
    const active = s.projects.find((p) => p.id === s.activeProjectId);
    const source = active?.sourcePresetId;
    return source !== undefined && s.presetSummaries.some((p) => p.id === source && p.available);
  });
  return {
    ...store.projectActions,
    projects,
    activeProjectId,
    status,
    error,
    notice,
    hasResetBaseline,
    dismissNotice: () => store.dispatch({ type: 'SET_PROJECT_NOTICE', payload: null }),
  };
}

export function useSandboxActiveProjectId(): string | null {
  return useSandboxSelector((s) => s.activeProjectId);
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

/** How often the active remote preset's fingerprint is polled while the
 *  page is visible. */
const PRESET_WATCH_INTERVAL_MS = 3000;
/** How long the "preset updated from disk" notice stays up. */
const PRESET_NOTICE_MS = 4000;
/** Debounce for the working-state save (localStorage + active project). */
const WORKING_SAVE_MS = 1000;
/** Debounce for the blob/font garbage collection sweep. */
const GC_DEBOUNCE_MS = 2000;

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
      presetApplied: loadPresetApplied(),
      presetStale: false,
      presetUpdatedAt: null,
      activeProjectId: loadProjectId(),
      projects: [],
      projectStatus: 'idle' as const,
      projectNotice: null,
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
  // Projects are listed on mount; GC waits for both loads so it never sweeps
  // against an empty keep-set.
  const projectsLoadedRef = useRef(false);
  const gcSuspendedRef = useRef(0);
  const gcTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const runPreset = async (provider: PresetProvider, parts: PresetApplyParts): Promise<void> => {
    const seq = ++presetLoadSeqRef.current;
    dispatch({ type: 'SET_PRESET_STATUS', payload: { status: 'loading' } });
    try {
      // Fingerprint first: a bundle edit that lands while `load()` is running
      // then still differs from the snapshot and gets picked up by the watch.
      const fingerprint = provider.fingerprint ? await provider.fingerprint() : null;
      if (seq !== presetLoadSeqRef.current) return;
      const loaded = await provider.load(stateRef.current.locale);
      if (seq !== presetLoadSeqRef.current) return;
      const { markdown, config, resources } = stateRef.current;
      await applyPreset(loaded, dispatch, { parts, fingerprint, current: { markdown, config, resources } });
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
      listProjects(),
    ])
      .then(async ([loaded, providers, projects]) => {
        if (cancelled) return;
        presetProvidersRef.current = providers;
        dispatch({ type: 'SET_PROJECT_LIST', payload: projects.map(toSummary) });
        projectsLoadedRef.current = true;

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

        // Project mode: the working state (localStorage + resources store) is
        // the project's live copy; the record only fills in when the store
        // was emptied. Preset-mode seeding below does not apply.
        const savedProjectId = stateRef.current.activeProjectId;
        const activeProject = savedProjectId ? projects.find((p) => p.id === savedProjectId) : undefined;
        if (activeProject) {
          dispatch({ type: 'SET_ACTIVE_PROJECT', payload: { id: activeProject.id, sourcePresetId: activeProject.sourcePresetId } });
          dispatch({ type: 'SET_RESOURCES', payload: loaded.length > 0 ? loaded : activeProject.resources });
          scheduleGc();
          return;
        }
        if (savedProjectId) {
          dispatch({ type: 'SET_ACTIVE_PROJECT', payload: { id: null } });
          saveProjectId(null);
        }

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
        scheduleGc();
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

  // Live presets: while the page is visible, poll the active preset's source
  // fingerprint and follow bundle edits — re-apply when the document is
  // untouched, otherwise flag it stale and keep the user's work. Restarts
  // (with an immediate check) when the active preset or the provider list
  // changes, which also covers "edited the bundle, then opened the sandbox".
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    let disposed = false;
    let inFlight = false;

    const tick = async (): Promise<void> => {
      if (disposed || inFlight) return;
      if (document.visibilityState !== 'visible') return;
      if (!resourcesLoadedRef.current) return;
      const before = stateRef.current;
      // Projects own their content; bundle edits only matter in preset mode.
      if (before.activeProjectId !== null) return;
      if (before.presetStatus === 'loading') return;
      const provider = presetProvidersRef.current.find((p) => p.summary.id === before.activePresetId);
      if (!provider?.fingerprint) return;

      inFlight = true;
      try {
        const live = await provider.fingerprint();
        if (disposed) return;
        const s = stateRef.current;
        if (s.activePresetId !== provider.summary.id || s.presetStatus === 'loading') return;
        const snapshot = s.presetApplied?.presetId === provider.summary.id ? s.presetApplied : null;

        if (snapshot && snapshot.fingerprint === null && live !== null) {
          // The apply could not read a fingerprint (source briefly down):
          // adopt the live one as the baseline rather than re-applying.
          const adopted = { ...snapshot, fingerprint: live };
          dispatch({ type: 'SET_PRESET_APPLIED', payload: adopted });
          savePresetApplied(adopted);
          return;
        }

        const differs = live !== null && snapshot?.fingerprint != null && live !== snapshot.fingerprint;
        const untouched = differs ? isDocumentUntouched(s, snapshot) : true;
        const decision = decidePresetUpdate({ liveFingerprint: live, snapshot, untouched });
        if (decision === 'apply') {
          await runPresetRef.current(provider, 'all');
          if (disposed || stateRef.current.presetStatus === 'error') return;
          dispatch({ type: 'SET_PRESET_UPDATED_AT', payload: Date.now() });
        } else if (decision === 'stale') {
          dispatch({ type: 'SET_PRESET_STALE', payload: true });
        } else if (s.presetStale && live !== null && snapshot?.fingerprint === live) {
          // The source went back to what was applied (e.g. an undone edit).
          dispatch({ type: 'SET_PRESET_STALE', payload: false });
        }
      } finally {
        inFlight = false;
      }
    };

    const onVisible = () => { if (document.visibilityState === 'visible') void tick(); };
    const interval = window.setInterval(() => { void tick(); }, PRESET_WATCH_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    void tick();
    return () => {
      disposed = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [state.activePresetId, state.presetSummaries, state.activeProjectId]);

  // Auto-hide the "updated from disk" notice.
  useEffect(() => {
    if (state.presetUpdatedAt === null) return;
    const timer = window.setTimeout(
      () => dispatch({ type: 'SET_PRESET_UPDATED_AT', payload: null }),
      PRESET_NOTICE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [state.presetUpdatedAt]);

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
    // Records only: blobs may still be referenced by a project (a switch
    // replaces the whole set) and are swept by the reference-based GC.
    for (const r of prev) {
      if (!nextById.has(r.id)) {
        deleteResource(r.id, false).catch(() => { /* ignore */ });
      }
    }

    prevResourcesRef.current = next;
  }, [state.resources]);

  // Auto-save the working state (debounced, skip until hydrated): markdown and
  // config to localStorage always, and the three slices into the active
  // project when there is one. Reads the live state so a flush before a
  // switch writes exactly what is on screen.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const persistWorking = (): Promise<void> => {
    const s = stateRef.current;
    saveMarkdown(s.markdown);
    saveConfig(s.config);
    if (!s.activeProjectId) return Promise.resolve();
    return updateProject(s.activeProjectId, {
      markdown: s.markdown,
      config: stripConfigDefaults(s.config),
      resources: s.resources,
    }).then(() => undefined, () => undefined);
  };
  const flushWorkingSave = (): Promise<void> => {
    if (saveTimerRef.current === undefined) return Promise.resolve();
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = undefined;
    return persistWorking();
  };
  const discardWorkingSave = (): void => {
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = undefined;
  };
  const flushWorkingSaveRef = useRef(flushWorkingSave);
  flushWorkingSaveRef.current = flushWorkingSave;
  const discardWorkingSaveRef = useRef(discardWorkingSave);
  discardWorkingSaveRef.current = discardWorkingSave;

  useEffect(() => {
    if (!hydratedRef.current) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = undefined;
      void persistWorking();
    }, WORKING_SAVE_MS);
    return () => clearTimeout(saveTimerRef.current);
  }, [state.markdown, state.config, state.resources, state.activeProjectId]);

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

  // Reference-based garbage collection for IndexedDB payloads: a blob or
  // font file survives while the working state or any stored project points
  // at it. Debounced, and paused while an operation is copying files whose
  // records have not landed yet.
  const runGc = async (): Promise<void> => {
    if (gcSuspendedRef.current > 0) return;
    if (!resourcesLoadedRef.current || !projectsLoadedRef.current) return;
    const s = stateRef.current;
    const live = referencedFileIds({ resources: s.resources, config: s.config });
    const stored = await collectProjectFileIds();
    for (const id of stored.blobIds) live.blobIds.add(id);
    for (const id of stored.fontIds) live.fontIds.add(id);
    if (gcSuspendedRef.current > 0) return;
    await Promise.all([pruneFontFiles(live.fontIds), pruneBlobs(live.blobIds)]);
  };
  const runGcRef = useRef(runGc);
  runGcRef.current = runGc;
  const scheduleGc = (): void => {
    clearTimeout(gcTimerRef.current);
    gcTimerRef.current = setTimeout(() => {
      runGcRef.current().catch(() => { /* ignore */ });
    }, GC_DEBOUNCE_MS);
  };
  const scheduleGcRef = useRef(scheduleGc);
  scheduleGcRef.current = scheduleGc;

  useEffect(() => {
    if (!hydratedRef.current) return;
    scheduleGcRef.current();
  }, [state.config.customFonts, state.resources, state.activeProjectId, state.projects]);

  useEffect(() => () => clearTimeout(gcTimerRef.current), []);

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

  const projectActions = useMemo<ProjectActions>(() => createProjectActions({
    dispatch,
    getState: () => stateRef.current,
    getProviders: () => presetProvidersRef.current,
    getBuiltin: () => builtinPresetRef.current,
    runPreset: (provider, parts) => runPresetRef.current(provider, parts),
    cancelPresetLoads: () => { presetLoadSeqRef.current++; },
    flushWorkingSave: () => flushWorkingSaveRef.current(),
    discardWorkingSave: () => discardWorkingSaveRef.current(),
    withGcSuspended: async (fn) => {
      gcSuspendedRef.current++;
      try {
        return await fn();
      } finally {
        gcSuspendedRef.current--;
        scheduleGcRef.current();
      }
    },
    labels: () => stateRef.current.labels,
  }), [dispatch]);

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
      // Leaving a project: its last edits are written first, then the
      // working state stops mirroring anything.
      if (stateRef.current.activeProjectId !== null) {
        await flushWorkingSaveRef.current();
        dispatch({ type: 'SET_ACTIVE_PROJECT', payload: { id: null } });
        saveProjectId(null);
      }
      await runPresetRef.current(provider, 'all');
    },
    reloadPreset: async (parts) => {
      if (stateRef.current.activeProjectId !== null) {
        await projectActions.resetToSource(parts);
        return;
      }
      const activeId = stateRef.current.activePresetId;
      const provider =
        presetProvidersRef.current.find((p) => p.summary.id === activeId) ?? builtinPresetRef.current;
      await runPresetRef.current(provider, parts);
    },
    projectActions,
  }), [dispatch, projectActions]);

  return (
    <SandboxStoreContext.Provider value={store}>
      {children}
    </SandboxStoreContext.Provider>
  );
}
