// The watch on the open preset's source and the resources' persistence
// (#1276: split out of SandboxContext.tsx).
import { useEffect } from 'react';
import { savePresetApplied } from '../../storage/persistence.js';
import { isDocumentUntouched, decidePresetUpdate, type PresetProvider, type PresetApplyParts } from '../../presets/index.js';
import { PRESET_WATCH_INTERVAL_MS, PRESET_NOTICE_MS } from './timings.js';
import { saveResource, deleteResource } from '../../storage/resources.js';
import type { SandboxState, SandboxAction } from './state.js';
import type { Resource } from 'postext';
import type { SandboxProviderLate } from './providerState.js';

/** What usePresetWatch takes from the sandbox provider. */
export interface UsePresetWatchDeps {
  state: SandboxState;
  dispatch: React.Dispatch<SandboxAction>;
  prevResourcesRef: React.RefObject<Resource[]>;
  resourcesLoadedRef: React.RefObject<boolean>;
  presetProvidersRef: React.RefObject<PresetProvider[]>;
  runPresetRef: React.RefObject<(provider: PresetProvider, parts: PresetApplyParts, locale?: string, opts?: { leaveProject?: boolean; discardKey?: string; }) => Promise<boolean>>;
  late: SandboxProviderLate;
}

export function usePresetWatch(deps: UsePresetWatchDeps) {
  const {
    state, dispatch, prevResourcesRef, resourcesLoadedRef, presetProvidersRef, runPresetRef, late
  } = deps;
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
      const before = late.stateRef.current;
      // Projects own their content; bundle edits only matter in preset mode.
      if (before.activeProjectId !== null) return;
      if (before.presetStatus === 'loading') return;
      const provider = presetProvidersRef.current.find((p) => p.summary.id === before.activePresetId);
      if (!provider?.fingerprint) return;

      inFlight = true;
      try {
        const live = await provider.fingerprint();
        if (disposed) return;
        const s = late.stateRef.current;
        if (s.activePresetId !== provider.summary.id || s.presetStatus === 'loading') return;
        const snapshot = s.presetApplied?.presetId === provider.summary.id ? s.presetApplied : null;

        // A copy of the built-in guide applied before it had a fingerprint
        // is taken as out of date (it predates the version on screen).
        if (snapshot && snapshot.fingerprint === null && live !== null && provider.summary.source === 'builtin') {
          const legacy = { ...snapshot, fingerprint: 'builtin-legacy' };
          dispatch({ type: 'SET_PRESET_APPLIED', payload: legacy });
          savePresetApplied(legacy);
          return;
        }
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
          if (disposed || late.stateRef.current.presetStatus === 'error') return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activePresetId, state.presetSummaries, state.activeProjectId, dispatch]);

  // Auto-hide the "updated from disk" notice.
  useEffect(() => {
    if (state.presetUpdatedAt === null) return;
    const timer = window.setTimeout(
      () => dispatch({ type: 'SET_PRESET_UPDATED_AT', payload: null }),
      PRESET_NOTICE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [state.presetUpdatedAt, dispatch]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.resources]);
  return {
  };
}
