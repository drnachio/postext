// The provider's preset and draft refs, the draft list, the book switch
// and the opening of a draft or a preset (#1276: split out of
// SandboxContext.tsx).
import { useRef } from 'react';
import { type PresetProvider, type PresetApplyParts, applyPreset } from '../../presets/index.js';
import { type PresetDraftSummary, type PresetDraftRecord, preserveDraftBlobs, listPresetDrafts, putPresetDraft } from '../../storage/presetDrafts.js';
import { loadPresetGeneral, saveProjectId, savePresetId, savePresetApplied, saveBook, saveConfig } from '../../storage/persistence.js';
import { withDefaultResourceTypes } from '../defaultConfig.js';
import { rebaseEdition } from '../../editions/configLayers.js';
import { setCustomFonts } from '../../controls/fonts/fontLoader.js';
import type { BookContent } from '../../book/types.js';
import { clearMeasurementCache } from 'postext';
import { presetReaderLocale } from '../../presets/locale.js';
import { getBlob, putBlobAt } from '../../storage/blobStore.js';
import type { SandboxAction } from './state.js';
import type { SandboxProviderLate } from './providerState.js';

/** What useBookSwitch takes from the sandbox provider. */
export interface UseBookSwitchDeps {
  builtinPreset: PresetProvider;
  dispatch: React.Dispatch<SandboxAction>;
  late: SandboxProviderLate;
}

export function useBookSwitch(deps: UseBookSwitchDeps) {
  const {
    builtinPreset, dispatch, late
  } = deps;
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
  // Open book switches in flight: the working-copy save stands still while
  // the state is being swapped (see `persistWorking`).
  const switchingRef = useRef(0);
  // The draft the book on screen was opened from or last saved to (see
  // `decideDraftSave`): only that one may be dropped by an undo.
  const liveDraftKeyRef = useRef<string | null>(null);
  // The drafts as listed, readable before a dispatch has rendered (the
  // mount seeding opens books right after listing them).
  const draftsRef = useRef<PresetDraftSummary[]>([]);
  const setDraftSummaries = (list: PresetDraftSummary[]): void => {
    draftsRef.current = list;
    dispatch({ type: 'SET_PRESET_DRAFTS', payload: list });
  };
  const upsertDraftSummary = (summary: PresetDraftSummary): void => {
    draftsRef.current = [...draftsRef.current.filter((d) => d.key !== summary.key), summary];
    dispatch({ type: 'UPSERT_PRESET_DRAFT', payload: summary });
  };
  const removeDraftSummary = (key: string): void => {
    draftsRef.current = draftsRef.current.filter((d) => d.key !== key);
    dispatch({ type: 'REMOVE_PRESET_DRAFT', payload: key });
  };

  /** Open another book: the one on screen is written to its own record
   *  first, the viewport shows the loading state while `fn` runs, and the
   *  working-copy save waits until the new book is in. */
  const switchBook = async <T,>(fn: () => Promise<T>): Promise<T> => {
    await late.saverRef.current!.flush();
    switchingRef.current++;
    if (switchingRef.current === 1) dispatch({ type: 'SET_BOOK_LOADING', payload: true });
    try {
      return await fn();
    } finally {
      switchingRef.current--;
      if (switchingRef.current === 0) dispatch({ type: 'SET_BOOK_LOADING', payload: false });
    }
  };
  const switchBookRef = useRef(switchBook);
  switchBookRef.current = switchBook;

  /** Put a preset's saved draft on screen, in one synchronous batch. */
  const applyDraft = (draft: PresetDraftRecord): void => {
    // Any preset still loading would land over it.
    presetLoadSeqRef.current++;
    const loc = late.stateRef.current.locale;
    // A preset in several languages: the draft opens on the general
    // settings in force now, keeping what it sets of its own (#1209).
    const general = draft.sharedConfig ? loadPresetGeneral(draft.presetId) ?? draft.sharedConfig : null;
    const scope = late.stateRef.current.configLayers?.scope ?? 'all';
    const config = withDefaultResourceTypes(general && draft.sharedConfig ? rebaseEdition(draft.sharedConfig, general, draft.config) : draft.config, loc);
    setCustomFonts(config.customFonts, { newBook: true });
    const book: BookContent = {
      chapters: draft.chapters,
      activeChapterId: draft.activeChapterId,
      ...(draft.canvasScope ? { canvasScope: draft.canvasScope } : {}),
      ...(draft.start ? { start: draft.start } : {}),
    };
    dispatch({ type: 'SET_ACTIVE_PROJECT', payload: { id: null } });
    dispatch({ type: 'SET_PRESET', payload: { id: draft.presetId, config: draft.baseConfig ? withDefaultResourceTypes(draft.baseConfig, loc) : undefined } });
    dispatch({ type: 'SET_CONFIG', payload: config });
    dispatch({ type: 'SET_CONFIG_LAYERS', payload: general ? { shared: general, scope } : null });
    dispatch({ type: 'SET_RESOURCES', payload: draft.resources });
    dispatch({ type: 'SET_BOOK', payload: book });
    dispatch({ type: 'SET_PRESET_APPLIED', payload: draft.snapshot });
    clearMeasurementCache();
    saveProjectId(null);
    savePresetId(draft.presetId);
    savePresetApplied(draft.snapshot);
    saveBook(book);
    saveConfig(config);
    liveDraftKeyRef.current = draft.key;
  };

  /** Resolves to whether the preset was applied (false: superseded by a
   *  newer load, or failed). `leaveProject` switches out of project mode in
   *  the same commit as the preset lands; `discardKey` names the draft this
   *  apply replaces (its payloads need no preserving). */
  const runPreset = async (
    provider: PresetProvider,
    parts: PresetApplyParts,
    locale?: string,
    opts: { leaveProject?: boolean; discardKey?: string } = {},
  ): Promise<boolean> => {
    const seq = ++presetLoadSeqRef.current;
    dispatch({ type: 'SET_PRESET_STATUS', payload: { status: 'loading' } });
    try {
      // Fingerprint first: a bundle edit that lands while `load()` is running
      // then still differs from the snapshot and gets picked up by the watch.
      const fingerprint = provider.fingerprint ? await provider.fingerprint() : null;
      if (seq !== presetLoadSeqRef.current) return false;
      // The content locale: the one asked for, else the one this preset is
      // already loaded in (a reload keeps the language the user picked),
      // else the viewer's (or, for a Chinese viewer of a book without
      // Chinese, its English edition).
      const applied = late.stateRef.current.presetApplied;
      const keep = applied?.presetId === provider.summary.id ? applied.locale : undefined;
      const loaded = await provider.load(locale ?? keep ?? presetReaderLocale(provider.summary, late.stateRef.current.locale));
      if (seq !== presetLoadSeqRef.current) return false;
      // Drafts of this preset (another locale, an older version) keep the
      // payloads they were edited with when this apply brings other bytes.
      if (parts !== 'config') {
        await preserveDraftBlobs(loaded.blobs, {
          listDrafts: listPresetDrafts,
          getBlob,
          putBlobAt,
          putDraft: putPresetDraft,
        }, opts.discardKey).catch(() => []);
        if (seq !== presetLoadSeqRef.current) return false;
      }
      const { chapters, config, resources } = late.stateRef.current;
      await applyPreset(loaded, dispatch, {
        parts,
        fingerprint,
        scope: late.stateRef.current.configLayers?.scope ?? 'all',
        current: { chapters, config, resources },
        before: () => {
          if (opts.leaveProject && late.stateRef.current.activeProjectId !== null) {
            dispatch({ type: 'SET_ACTIVE_PROJECT', payload: { id: null } });
            saveProjectId(null);
          }
        },
      });
      // The original is on screen: no draft is live until it is edited.
      if (parts === 'all') liveDraftKeyRef.current = null;
      return true;
    } catch (err) {
      if (seq !== presetLoadSeqRef.current) return false;
      const message = err instanceof Error ? err.message : String(err);
      dispatch({ type: 'SET_PRESET_STATUS', payload: { status: 'error', error: message } });
      return false;
    }
  };
  const runPresetRef = useRef(runPreset);
  runPresetRef.current = runPreset;
  return {
    presetProvidersRef, builtinPresetRef, presetLoadSeqRef, projectsLoadedRef, gcSuspendedRef,
    gcTimerRef, switchingRef, liveDraftKeyRef, draftsRef, setDraftSummaries, upsertDraftSummary,
    removeDraftSummary, switchBookRef, applyDraft, runPresetRef
  };
}
