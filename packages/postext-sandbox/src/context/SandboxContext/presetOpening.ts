// Opening a preset, restoring its original and opening a linked bundle
// after asking whether it replaces the book (#1276: split out of
// SandboxContext.tsx).
import { isEditionOnScreen, choosePresetOpen } from '../../presets/locale.js';
import { getPresetDraft, presetDraftKey, deletePresetDraft, type PresetDraftSummary, type PresetDraftRecord } from '../../storage/presetDrafts.js';
import { presetSharedConfig } from '../../editions/configLayers.js';
import { useRef } from 'react';
import type { SandboxState, SandboxAction } from './state.js';
import { type HashBundleRef, hashBundleOrigin, writeViewHash } from '../../storage/viewHash.js';
import { openHashBundle, takeQuietLink, fetchBundleBytes } from '../hashBundle.js';
import type { HashBundleResolver } from '../../types/props.js';
import type { PresetProvider, PresetApplyParts } from '../../presets/index.js';
import type { SandboxProviderLate } from './providerState.js';

/** What usePresetOpening takes from the sandbox provider. */
export interface UsePresetOpeningDeps {
  hashBundlesRef: React.RefObject<Record<string, HashBundleResolver> | undefined>;
  dispatch: React.Dispatch<SandboxAction>;
  presetProvidersRef: React.RefObject<PresetProvider[]>;
  builtinPresetRef: React.RefObject<PresetProvider>;
  liveDraftKeyRef: React.RefObject<string | null>;
  draftsRef: React.RefObject<PresetDraftSummary[]>;
  removeDraftSummary: (key: string) => void;
  switchBookRef: React.RefObject<(<T>(fn: () => Promise<T>) => Promise<T>)>;
  applyDraft: (draft: PresetDraftRecord) => void;
  runPresetRef: React.RefObject<(provider: PresetProvider, parts: PresetApplyParts, locale?: string, opts?: { leaveProject?: boolean; discardKey?: string; }) => Promise<boolean>>;
  late: SandboxProviderLate;
}

export function usePresetOpening(deps: UsePresetOpeningDeps) {
  const {
    hashBundlesRef, dispatch, presetProvidersRef, builtinPresetRef, liveDraftKeyRef, draftsRef,
    removeDraftSummary, switchBookRef, applyDraft, runPresetRef, late
  } = deps;
  /** Open a preset: its saved draft when there is one for the locale it
   *  opens in (see `choosePresetOpen`), else its original. The book on
   *  screen is written to its own record first. */
  const openPreset = async (id: string, locale?: string): Promise<boolean> => {
    const provider = presetProvidersRef.current.find((p) => p.summary.id === id);
    if (!provider) return false;
    const s = late.stateRef.current;
    const onScreen = s.activeProjectId === null && s.activePresetId === id;
    const current = onScreen && s.presetApplied?.presetId === id ? s.presetApplied.locale ?? null : null;
    // Already open in that edition (Simplified ↔ Traditional Chinese, one
    // language in two editions, switch; `zh-TW` asks for the `zh-Hant` on
    // screen). The hash sync asks the same question before it calls here.
    if (isEditionOnScreen(provider.summary, locale, current) && s.presetStatus !== 'loading') return true;
    const choice = choosePresetOpen({ summary: provider.summary, requested: locale, current, viewer: s.locale, drafts: draftsRef.current });
    return switchBookRef.current(async () => {
      if (choice.draft) {
        let draft = await getPresetDraft(choice.draft.key);
        if (draft) {
          // A draft saved before general settings existed (#1209): it was
          // based on the preset's own, which its edition reads.
          if (!draft.sharedConfig && (provider.summary.locales?.length ?? 0) > 1) {
            const original = await provider.load(draft.locale || choice.locale || s.locale).then(presetSharedConfig).catch(() => null);
            if (original) draft = { ...draft, sharedConfig: original };
          }
          applyDraft(draft);
          return true;
        }
        removeDraftSummary(choice.draft.key);
      }
      return runPresetRef.current(provider, 'all', choice.locale, { leaveProject: true });
    });
  };
  const openPresetRef = useRef(openPreset);
  openPresetRef.current = openPreset;

  /** Drop the drafts of a preset (of one locale, or all of them); when the
   *  preset is on screen in a dropped locale, its original replaces it. */
  const restorePresetOriginal = async (presetId: string, locale?: string): Promise<void> => {
    const s = late.stateRef.current;
    const onScreen = s.activeProjectId === null && s.activePresetId === presetId;
    const screenLocale = onScreen && s.presetApplied?.presetId === presetId ? s.presetApplied.locale : undefined;
    const keys = draftsRef.current
      .filter((d) => d.presetId === presetId && (locale === undefined || d.locale === locale))
      .map((d) => d.key);
    const screenKey = onScreen ? presetDraftKey(presetId, screenLocale) : null;
    const reapply = onScreen && (locale === undefined || locale === (screenLocale ?? ''));
    if (reapply) {
      // The pending edits go with the draft.
      late.saverRef.current!.discard();
      liveDraftKeyRef.current = null;
      if (screenKey && !keys.includes(screenKey)) keys.push(screenKey);
    }
    await Promise.all(keys.map((k) => deletePresetDraft(k).catch(() => undefined)));
    for (const k of keys) removeDraftSummary(k);
    if (!reapply) return;
    const provider = presetProvidersRef.current.find((p) => p.summary.id === presetId) ?? builtinPresetRef.current;
    await switchBookRef.current(() => runPresetRef.current(provider, 'all', screenLocale, { discardKey: screenKey ?? undefined }));
  };
  const restorePresetOriginalRef = useRef(restorePresetOriginal);
  restorePresetOriginalRef.current = restorePresetOriginal;

  // Settles the pending `bundleReplacePrompt` (see `answerBundleReplace`).
  const bundleReplaceAnswerRef = useRef<((replace: boolean) => void) | null>(null);
  /** Ask the keep-or-replace question; resolves to true for replace. A
   *  question still open is answered "keep" first. */
  const askBundleReplace = (payload: NonNullable<SandboxState['bundleReplacePrompt']>): Promise<boolean> =>
    new Promise<boolean>((resolve) => {
      bundleReplaceAnswerRef.current?.(false);
      bundleReplaceAnswerRef.current = resolve;
      dispatch({ type: 'SET_BUNDLE_REPLACE_PROMPT', payload });
    });

  /** Open the book a host bundle link names (`hashBundles`): the project
   *  imported from it before, else a fresh import; then the fragment names
   *  the project. `known` lists the projects when the state does not hold
   *  them yet (the mount); `keep` is a project already on screen. */
  const openLinkedBundle = async (
    ref: HashBundleRef,
    known?: readonly { id: string; name?: string; origin?: string }[],
    keep?: string | null,
  ): Promise<string | null> => {
    const resolver = hashBundlesRef.current?.[ref.key];
    if (!resolver || typeof window === 'undefined') return null;
    const labels = late.stateRef.current.labels;
    try {
      const list = known ?? late.stateRef.current.projects;
      const opened = await openHashBundle(ref, {
        resolve: resolver,
        findProject: (origin) => list.find((p) => p.origin === origin)?.id ?? null,
        activate: (id) => (id === keep ? Promise.resolve() : late.projectActions.activate(id)),
        // The published book may have been corrected since the reader
        // imported it: they choose between their copy and a fresh one.
        confirmReplace: (id) => (takeQuietLink(hashBundleOrigin(ref)) ? Promise.resolve(false) : askBundleReplace({
          kind: 'bundle',
          id,
          name: list.find((p) => p.id === id)?.name ?? late.stateRef.current.projects.find((p) => p.id === id)?.name ?? id,
        })),
        removeProject: (id) => late.projectActions.remove(id, { offScreen: true }),
        fetchBytes: fetchBundleBytes,
        // A recipe published in several languages opens in the link's.
        importBytes: (bytes, name, origin, lang) => late.projectActions.importBundleBytes(bytes, name, { origin, ...(lang ? { locale: lang } : {}) }),
        pageOrigin: window.location.origin,
      });
      writeViewHash({ project: opened.projectId });
      return opened.projectId;
    } catch (err) {
      const reason = (err as { reason?: string } | null)?.reason;
      const message = reason === 'unknown' || reason === 'not-found'
        ? labels.hashBundleNotFound
        : labels.hashBundleError.replace('__error__', err instanceof Error ? err.message : String(err));
      dispatch({ type: 'SET_PROJECT_STATUS', payload: { status: 'idle' } });
      dispatch({ type: 'SET_PROJECT_NOTICE', payload: message });
      dispatch({ type: 'SET_PANEL', payload: 'projects' });
      // The fragment goes back to naming the book on screen.
      writeViewHash({});
      return null;
    }
  };
  const openLinkedBundleRef = useRef(openLinkedBundle);
  openLinkedBundleRef.current = openLinkedBundle;
  return {
    openPresetRef, restorePresetOriginalRef, bundleReplaceAnswerRef, askBundleReplace,
    openLinkedBundleRef
  };
}
