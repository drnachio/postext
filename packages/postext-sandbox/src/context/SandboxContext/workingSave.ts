// The working copy's debounced save, its flush and discard (#1276: split
// out of SandboxContext.tsx).
import { type Resource, stripConfigDefaults } from 'postext';
import { saveBook, saveConfig, saveWorkingLayers, savePresetGeneral, saveHiddenPresetIds } from '../../storage/persistence.js';
import { bookOf } from './reducer.js';
import { updateProject, type ProjectPatch } from '../../storage/projects.js';
import { recordSharedConfig, rebaseEditions } from '../../editions/configLayers.js';
import { decideDraftSave, type PresetDraftRecord, putPresetDraft, toDraftSummary, deletePresetDraft, type PresetDraftSummary } from '../../storage/presetDrafts.js';
import { PROJECT_RECORD_VERSION } from '../../storage/projectMigration.js';
import { useRef, useEffect } from 'react';
import { type SaveScheduler, createSaveScheduler } from '../../storage/saveScheduler.js';
import { WORKING_SAVE_MS } from './timings.js';
import type { SandboxState } from './state.js';
import type { SandboxProviderLate } from './providerState.js';

/** What useWorkingSave takes from the sandbox provider. */
export interface UseWorkingSaveDeps {
  state: SandboxState;
  hydratedRef: React.RefObject<boolean>;
  switchingRef: React.RefObject<number>;
  liveDraftKeyRef: React.RefObject<string | null>;
  upsertDraftSummary: (summary: PresetDraftSummary) => void;
  removeDraftSummary: (key: string) => void;
  late: SandboxProviderLate;
}

export function useWorkingSave(deps: UseWorkingSaveDeps) {
  const {
    state, hydratedRef, switchingRef, liveDraftKeyRef, upsertDraftSummary, removeDraftSummary, late
  } = deps;
  // Auto-save the working state (debounced, skip until hydrated): the book
  // and config to localStorage always (the working copy the next visit
  // starts from), and into the book's own record — the active project, or
  // the draft of an edited preset. Reads the live state, so a flush before
  // a switch writes exactly what is on screen. `resourcesOverride` stands
  // in for the resource set while the state does not hold it yet (the
  // mount, before the store has loaded): without either, only the working
  // copy is written.
  const persistWorking = async (resourcesOverride?: Resource[]): Promise<void> => {
    // A book is being swapped in: the state is neither the old book nor
    // the new one. The switch flushed the old one before it started.
    if (switchingRef.current > 0) return;
    const s = late.stateRef.current;
    saveBook(bookOf(s));
    saveConfig(s.config);
    saveWorkingLayers(s.activeProjectId ? null : s.presetApplied?.presetId ?? null, s.activeProjectId ? null : s.configLayers?.shared ?? null);
    const resources = resourcesOverride ?? (s.storeReady ? s.resources : null);
    if (!resources) return;
    if (s.activeProjectId) {
      const layers = s.configLayers;
      await updateProject(s.activeProjectId, (existing) => {
        const patch: ProjectPatch = {
          chapters: s.chapters,
          activeChapterId: s.activeChapterId,
          canvasScope: s.canvasScope,
          // `undefined` clears a start the record held for another book.
          start: s.bookStart,
          config: stripConfigDefaults(s.config),
          resources,
        };
        // General settings changed (#1209): the editions kept aside read
        // them too, each keeping the fields it sets itself.
        const before = recordSharedConfig(existing);
        if (layers && before && existing.editions) {
          const editions = rebaseEditions(before, layers.shared, existing.editions);
          patch.sharedConfig = layers.shared;
          if (editions !== existing.editions) {
            patch.editions = editions;
            patch.editionsRev = Date.now();
          }
        }
        return patch;
      }).catch(() => undefined);
      return;
    }
    // The general settings of a preset in several languages: every edition
    // opens on them (#1209).
    if (s.configLayers && s.presetApplied) savePresetGeneral(s.presetApplied.presetId, s.configLayers.shared);
    const decision = decideDraftSave({
      activeProjectId: s.activeProjectId,
      activePresetId: s.activePresetId,
      snapshot: s.presetApplied,
      content: { chapters: s.chapters, config: s.config, resources },
      liveDraftKey: liveDraftKeyRef.current,
    });
    if (decision.action === 'put' && s.presetApplied) {
      const record: PresetDraftRecord = {
        version: PROJECT_RECORD_VERSION,
        key: decision.key,
        presetId: s.presetApplied.presetId,
        locale: s.presetApplied.locale ?? '',
        snapshot: s.presetApplied,
        ...(s.presetConfig ? { baseConfig: s.presetConfig } : {}),
        ...(s.configLayers ? { sharedConfig: s.configLayers.shared } : {}),
        chapters: s.chapters,
        activeChapterId: s.activeChapterId,
        ...(s.canvasScope === 'book' ? { canvasScope: s.canvasScope } : {}),
        ...(s.bookStart ? { start: s.bookStart } : {}),
        config: s.config,
        resources,
        updatedAt: Date.now(),
      };
      liveDraftKeyRef.current = decision.key;
      await putPresetDraft(record).then(() => upsertDraftSummary(toDraftSummary(record)), () => undefined);
    } else if (decision.action === 'delete') {
      liveDraftKeyRef.current = null;
      await deletePresetDraft(decision.key).then(() => removeDraftSummary(decision.key), () => undefined);
    }
  };
  const persistWorkingRef = useRef(persistWorking);
  persistWorkingRef.current = persistWorking;
  const saverRef = useRef<SaveScheduler | null>(null);
  if (saverRef.current === null) {
    saverRef.current = createSaveScheduler(() => persistWorkingRef.current(), WORKING_SAVE_MS);
  }
  const flushWorkingSave = (): Promise<void> => saverRef.current!.flush();
  const discardWorkingSave = (): void => saverRef.current!.discard();
  const flushWorkingSaveRef = useRef(flushWorkingSave);
  flushWorkingSaveRef.current = flushWorkingSave;
  const discardWorkingSaveRef = useRef(discardWorkingSave);
  discardWorkingSaveRef.current = discardWorkingSave;

  useEffect(() => {
    if (!hydratedRef.current) return;
    saverRef.current!.schedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.chapters, state.activeChapterId, state.canvasScope, state.bookStart, state.config, state.resources, state.activeProjectId, state.presetApplied, state.storeReady]);

  // Leaving the page — closing the tab, following a link out (the logo),
  // switching apps on a phone — writes the pending edits at once instead
  // of dropping the last second of them; so does the sandbox unmounting
  // (a client-side navigation away).
  useEffect(() => {
    const flush = () => { void saverRef.current!.flush(); };
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
      flush();
    };
  }, []);

  // Hidden presets are a UI preference: saved immediately.
  useEffect(() => {
    if (!hydratedRef.current) return;
    saveHiddenPresetIds(state.hiddenPresetIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.hiddenPresetIds]);
  return {
    persistWorkingRef, saverRef, flushWorkingSaveRef, discardWorkingSaveRef
  };
}
