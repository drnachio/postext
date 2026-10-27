// The custom-font registry, the garbage collection of stored payloads and
// the host's change callbacks (#1276: split out of SandboxContext.tsx).
import { customFontsSignature, setCustomFonts } from '../../controls/fonts/fontLoader.js';
import { referencedFileIds, collectProjectFileIds } from '../../storage/projects.js';
import { listPresetDrafts } from '../../storage/presetDrafts.js';
import { keepMigrationSnapshots } from '../../migrate/textMigration.js';
import { pruneFontFiles } from '../../storage/fontStorage.js';
import { pruneBlobs } from '../../storage/blobStore.js';
import { useRef, useEffect } from 'react';
import { GC_DEBOUNCE_MS } from './timings.js';
import type { PostextConfig } from 'postext';
import type { SandboxState } from './state.js';
import type { SandboxProviderLate } from './providerState.js';

/** What useFontsAndGc takes from the sandbox provider. */
export interface UseFontsAndGcDeps {
  onConfigChange: ((config: PostextConfig) => void) | undefined;
  onMarkdownChange: ((markdown: string) => void) | undefined;
  state: SandboxState;
  hydratedRef: React.RefObject<boolean>;
  resourcesLoadedRef: React.RefObject<boolean>;
  projectsLoadedRef: React.RefObject<boolean>;
  gcSuspendedRef: React.RefObject<number>;
  gcTimerRef: React.RefObject<number | undefined>;
  late: SandboxProviderLate;
}

export function useFontsAndGc(deps: UseFontsAndGcDeps) {
  const {
    onConfigChange, onMarkdownChange, state, hydratedRef, resourcesLoadedRef, projectsLoadedRef,
    gcSuspendedRef, gcTimerRef, late
  } = deps;
  // Keep the fontLoader's custom-font registry in sync with the config so
  // that FontPicker, loadFont(), and the worker payload collector can all
  // resolve custom families by name. This runs during render rather than in
  // an effect: child effects fire before the provider's, so a viewport's
  // first build would otherwise start against an empty registry and measure
  // custom families with fallback glyphs (the PDF viewport never rebuilds on
  // its own, so it would keep that layout). Comparing signatures instead of
  // array identity also re-seeds after a hot reload empties the registry.
  if (customFontsSignature() !== customFontsSignature(state.config.customFonts)) {
    setCustomFonts(state.config.customFonts);
  }

  // Reference-based garbage collection for IndexedDB payloads: a blob or
  // font file survives while the working state or any stored project points
  // at it. Debounced, and paused while an operation is copying files whose
  // records have not landed yet.
  const runGc = async (): Promise<void> => {
    if (gcSuspendedRef.current > 0) return;
    if (!resourcesLoadedRef.current || !projectsLoadedRef.current) return;
    const s = late.stateRef.current;
    const live = referencedFileIds({ resources: s.resources, config: s.config });
    const stored = await collectProjectFileIds();
    for (const id of stored.blobIds) live.blobIds.add(id);
    for (const id of stored.fontIds) live.fontIds.add(id);
    // Edited presets keep their payloads too (they point at the preset's
    // own files, or at copies of their own).
    for (const draft of await listPresetDrafts()) {
      const refs = referencedFileIds(draft);
      for (const id of refs.blobIds) live.blobIds.add(id);
      for (const id of refs.fontIds) live.fontIds.add(id);
    }
    // The book as it was before a move of its text to the Markdown (#874).
    await keepMigrationSnapshots(live.blobIds);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.config.customFonts, state.resources, state.activeProjectId, state.projects]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => clearTimeout(gcTimerRef.current), []);

  // Notify parent of changes
  useEffect(() => {
    onConfigChange?.(state.config);
  }, [state.config, onConfigChange]);

  useEffect(() => {
    onMarkdownChange?.(state.markdown);
  }, [state.markdown, onMarkdownChange]);
  return {
    scheduleGc, scheduleGcRef
  };
}
