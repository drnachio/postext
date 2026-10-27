// What the provider loads on mount: presets, drafts, projects and
// resources, and the book the page opens with (#1276: split out of
// SandboxContext.tsx).
import { useEffect } from 'react';
import { listPresetCovers } from '../../storage/presetCovers.js';
import { loadResources } from '../../storage/resources.js';
import { listPresets, pristineGuideFollowsViewer, BUILTIN_PRESET_ID, findDefaultPrivatePreset, type PresetApplyParts, type PresetSourceSpec, type PresetProvider } from '../../presets/index.js';
import { listProjects, toSummary, allEditionChapters } from '../../storage/projects.js';
import { listPresetDrafts, toDraftSummary, presetDraftKey, type PresetDraftSummary } from '../../storage/presetDrafts.js';
import { recordSharedConfig } from '../../editions/configLayers.js';
import { loadWorkingLayers, loadBook, loadPresetId, loadViewerLocale, saveViewerLocale, saveProjectId, loadConfig } from '../../storage/persistence.js';
import { pruneChapterLayoutStore } from '../../storage/layouts.js';
import { bookOf } from './reducer.js';
import { isPristineBook } from '../../book/chapterOps.js';
import { SAMPLE_DOCUMENTS } from './hooks.js';
import { EMPTY_VIEW_HASH, type ViewHashBook, writeViewHash, type ViewHash, type HashBundleRef } from '../../storage/viewHash.js';
import { choosePresetOpen, linkNamesBookOnScreen } from '../../presets/locale.js';
import type { HashBundleResolver } from '../../types/props.js';
import type { SandboxAction, SandboxState } from './state.js';
import type { Resource } from 'postext';
import type { SandboxProviderLate } from './providerState.js';

/** What useMountLoad takes from the sandbox provider. */
export interface UseMountLoadDeps {
  locale: string | undefined;
  presetSources: PresetSourceSpec[];
  defaultMd: string;
  migration: { ids: () => string; untitled: (n: number) => string; };
  initialHashRef: React.RefObject<ViewHash | null>;
  initialAsksRestoreRef: React.RefObject<boolean | null>;
  hashBundlesRef: React.RefObject<Record<string, HashBundleResolver> | undefined>;
  initialBundleRef: React.RefObject<HashBundleRef | null | undefined>;
  dispatch: React.Dispatch<SandboxAction>;
  prevResourcesRef: React.RefObject<Resource[]>;
  resourcesLoadedRef: React.RefObject<boolean>;
  presetProvidersRef: React.RefObject<PresetProvider[]>;
  builtinPresetRef: React.RefObject<PresetProvider>;
  projectsLoadedRef: React.RefObject<boolean>;
  liveDraftKeyRef: React.RefObject<string | null>;
  draftsRef: React.RefObject<PresetDraftSummary[]>;
  setDraftSummaries: (list: PresetDraftSummary[]) => void;
  runPresetRef: React.RefObject<(provider: PresetProvider, parts: PresetApplyParts, locale?: string, opts?: { leaveProject?: boolean; discardKey?: string; }) => Promise<boolean>>;
  openPresetRef: React.RefObject<(id: string, locale?: string) => Promise<boolean>>;
  restorePresetOriginalRef: React.RefObject<(presetId: string, locale?: string) => Promise<void>>;
  askBundleReplace: (payload: NonNullable<SandboxState["bundleReplacePrompt"]>) => Promise<boolean>;
  openLinkedBundleRef: React.RefObject<(ref: HashBundleRef, known?: readonly { id: string; name?: string; origin?: string; }[], keep?: string | null) => Promise<string | null>>;
  late: SandboxProviderLate;
}

export function useMountLoad(deps: UseMountLoadDeps) {
  const {
    locale, presetSources, defaultMd, migration, initialHashRef, initialAsksRestoreRef,
    hashBundlesRef, initialBundleRef, dispatch, prevResourcesRef, resourcesLoadedRef,
    presetProvidersRef, builtinPresetRef, projectsLoadedRef, liveDraftKeyRef, draftsRef,
    setDraftSummaries, runPresetRef, openPresetRef, restorePresetOriginalRef, askBundleReplace,
    openLinkedBundleRef, late
  } = deps;
  // The covers taken from the first page of presets that ship none.
  useEffect(() => {
    let cancelled = false;
    listPresetCovers().then((covers) => {
      if (!cancelled && Object.keys(covers).length > 0) dispatch({ type: 'SET_PRESET_COVERS', payload: covers });
    }, () => undefined);
    return () => { cancelled = true; };
  }, [dispatch]);

  useEffect(() => {
    let cancelled = false;
    const loc = locale ?? 'en';
    Promise.all([
      loadResources(),
      listPresets({ sources: presetSources, builtin: builtinPresetRef.current }).catch(
        () => [builtinPresetRef.current],
      ),
      listProjects(),
      listPresetDrafts(),
    ])
      .then(async ([loaded, providers, projects, drafts]) => {
        if (cancelled) return;
        presetProvidersRef.current = providers;
        dispatch({ type: 'SET_PROJECT_LIST', payload: projects.map(toSummary) });
        // The project the visit resumes, in several languages: its general
        // settings (#1209), which the working copy does not keep.
        const resumed = projects.find((p) => p.id === late.stateRef.current.activeProjectId);
        const resumedShared = resumed ? recordSharedConfig(resumed) : null;
        const resumedPreset = !resumed && !late.stateRef.current.activeProjectId && late.stateRef.current.presetApplied ? loadWorkingLayers(late.stateRef.current.presetApplied.presetId) : null;
        const resumedLayers = resumedShared ?? resumedPreset;
        if (resumedLayers && !late.stateRef.current.configLayers) dispatch({ type: 'SET_CONFIG_LAYERS', payload: { shared: resumedLayers, scope: 'all' } });
        setDraftSummaries(drafts.map(toDraftSummary));
        projectsLoadedRef.current = true;
        // Layout records of chapters no book holds any more are dropped.
        void pruneChapterLayoutStore(new Set([
          ...projects.flatMap((p) => allEditionChapters(p).map((c) => c.id)),
          ...drafts.flatMap((d) => d.chapters.map((c) => c.id)),
          ...late.stateRef.current.chapters.map((c) => c.id),
        ])).catch(() => undefined);

        const currentBook = bookOf(late.stateRef.current);
        const savedBook = loadBook(migration);
        const savedId = loadPresetId();
        // Pristine: the user has never edited the document (nothing saved, or
        // exactly one of the built-in samples as a single chapter). Any
        // markdown edit or added chapter opts out.
        const pristine = savedBook === null || isPristineBook(savedBook, SAMPLE_DOCUMENTS);
        // Storage is shared across locales, so a pristine default document
        // persisted in *another* language gets swapped to this locale's
        // default and its examples reseeded, so entering the Spanish sandbox
        // shows Spanish resources instead of whichever language seeded first.
        // A Chinese guide opened on purpose from an English or Spanish
        // interface stays Chinese (see `pristineGuideFollowsViewer`).
        const pristineOtherLocale = pristineGuideFollowsViewer(currentBook, defaultMd, loadViewerLocale());
        saveViewerLocale(loc);
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
        // The stored book's resources are the state's from now on: a branch
        // below that leaves the book as it is (a link to the book already on
        // screen) must not leave it without them, or the next save writes
        // the book back empty. A branch that opens another book sets its own.
        if (late.stateRef.current.activeProjectId === null) dispatch({ type: 'SET_RESOURCES', payload: loaded });

        const before = late.stateRef.current;
        // The stored book is a preset with a draft: it was opened from (or
        // saved to) that draft, so undoing every edit drops it.
        if (before.activeProjectId === null && before.presetApplied?.presetId === before.activePresetId) {
          const key = presetDraftKey(before.activePresetId, before.presetApplied.locale);
          if (drafts.some((d) => d.key === key)) liveDraftKeyRef.current = key;
        }
        // Leaving the stored book for the one a link names: write it to its
        // own record first — with the resources just read, as the state
        // does not hold them yet. (A project whose working resources are
        // gone keeps the ones its record has.)
        const saveOutgoing = () => late.persistWorkingRef.current(
          loaded.length > 0 || before.activeProjectId === null ? loaded : undefined,
        );

        // A host bundle link (`#recipe=…`): the project imported from it,
        // or a fresh import. A failure leaves the stored book open.
        const bundleRef = initialBundleRef.current;
        if (bundleRef && hashBundlesRef.current?.[bundleRef.key]) {
          await saveOutgoing();
          const opened = await openLinkedBundleRef.current(bundleRef, projects, before.activeProjectId);
          if (cancelled) return;
          // Another project is on screen now; when the link named the
          // stored one, the seeding below opens it as any visit would.
          if (opened !== null && opened !== before.activeProjectId) return;
        }

        // A permalink names the book to open (`#preset=P&lang=L` or
        // `#project=ID`, see `viewHash.ts`): it wins over the book last
        // open — unless it is that book already, in the locale asked for. A
        // book this browser does not have (another person's project, a
        // preset no source lists) is passed over. The chapter and page it
        // names are applied once the store is ready (`useChapterHashSync`).
        const wanted = initialHashRef.current ?? EMPTY_VIEW_HASH;
        const onScreen: ViewHashBook = {
          project: before.activeProjectId,
          preset: before.activeProjectId === null ? before.activePresetId : null,
          lang: before.activeProjectId === null
            ? before.presetApplied?.presetId === before.activePresetId ? before.presetApplied.locale ?? null : null
            // A project in several languages is on screen in one of them (#903).
            : (() => { const p = projects.find((x) => x.id === before.activeProjectId); return p?.editions ? p.locale ?? null : null; })(),
        };
        // A homepage link (`restore=ask`) to a preset the reader has edited
        // in the locale it opens in: they choose between their version and
        // the original, as a cookbook link asks for a book imported before.
        // Restoring drops that locale's draft (the original replaces it when
        // it is the book on screen); the fragment stops asking either way.
        if (!bundleRef && initialAsksRestoreRef.current && wanted.preset !== null && wanted.project === null) {
          initialAsksRestoreRef.current = false;
          writeViewHash({});
          const provider = providers.find((p) => p.summary.id === wanted.preset);
          const presetOnScreen = onScreen.preset === wanted.preset;
          const choice = provider
            ? choosePresetOpen({
                summary: provider.summary,
                requested: wanted.lang ?? undefined,
                current: presetOnScreen ? onScreen.lang : null,
                viewer: late.stateRef.current.locale,
                drafts: draftsRef.current,
              })
            : null;
          if (provider && choice?.draft) {
            const restore = await askBundleReplace({ kind: 'preset', id: provider.summary.id, name: provider.summary.name });
            if (cancelled) return;
            if (restore) {
              const draftLocale = choice.draft.locale;
              const reapplies = presetOnScreen && draftLocale === (onScreen.lang ?? '');
              if (!reapplies) await saveOutgoing();
              await restorePresetOriginalRef.current(provider.summary.id, draftLocale);
              if (reapplies || cancelled) return;
            }
          }
        }

        // `lang=zh-TW` names the `zh-Hant` edition on screen: it stays, and
        // is seeded below as any visit's book.
        if (!bundleRef && !linkNamesBookOnScreen(wanted, onScreen, summaries)) {
          if (wanted.project !== null && projects.some((p) => p.id === wanted.project)) {
            await saveOutgoing();
            await (wanted.lang ? late.projectActions.switchEdition(wanted.project, wanted.lang) : late.projectActions.activate(wanted.project)).catch(() => undefined);
            return;
          }
          const provider = wanted.preset === null ? undefined : providers.find((p) => p.summary.id === wanted.preset);
          if (provider) {
            await saveOutgoing();
            await openPresetRef.current(provider.summary.id, wanted.lang ?? undefined);
            return;
          }
        }

        // Project mode: the working state (localStorage + resources store) is
        // the project's live copy; the record only fills in when the store
        // was emptied. Preset-mode seeding below does not apply.
        const savedProjectId = late.stateRef.current.activeProjectId;
        const activeProject = savedProjectId ? projects.find((p) => p.id === savedProjectId) : undefined;
        if (activeProject) {
          dispatch({ type: 'SET_ACTIVE_PROJECT', payload: { id: activeProject.id, sourcePresetId: activeProject.sourcePresetId } });
          dispatch({ type: 'SET_RESOURCES', payload: loaded.length > 0 ? loaded : activeProject.resources });
          late.scheduleGc();
          return;
        }
        if (savedProjectId) {
          dispatch({ type: 'SET_ACTIVE_PROJECT', payload: { id: null } });
          saveProjectId(null);
        }

        // A pristine sandbox opens on the private default preset — unless
        // the permalink asked for the book on screen by name.
        const privateDefault = findDefaultPrivatePreset(providers, loc);
        if (pristine && onBuiltin && privateDefault && wanted.preset === null && wanted.project === null) {
          await saveOutgoing();
          await openPresetRef.current(privateDefault.summary.id);
          return;
        }
        if (pristineOtherLocale) {
          // The untouched guide in the other language: the guide in this
          // one (its draft, if it was edited here before).
          await saveOutgoing();
          await openPresetRef.current(BUILTIN_PRESET_ID, loc);
          return;
        }
        if (loaded.length === 0 && onBuiltin) {
          // First entry (empty store): seed the built-in preset. A pristine
          // document takes the sample markdown too (and a fresh config only
          // when none was ever saved); an edited document with an emptied
          // store just gets its example resources back. Another preset on
          // screen may simply have no resources (a novel without figures):
          // it stays what it is, not the guide's resources under its text.
          const parts: PresetApplyParts = !pristine
            ? 'resources'
            : loadConfig() === null ? 'all' : 'document';
          await runPresetRef.current(builtinPresetRef.current, parts);
          return;
        }
        dispatch({ type: 'SET_RESOURCES', payload: loaded });
        dispatch({ type: 'SET_PRESET', payload: { id: savedId ?? BUILTIN_PRESET_ID } });
        late.scheduleGc();
      })
      .catch(() => {
        if (cancelled) return;
        resourcesLoadedRef.current = true;
      })
      .then(() => {
        if (!cancelled) dispatch({ type: 'SET_STORE_READY' });
      });
    return () => {
      cancelled = true;
    };
    // Mount-only seed: `locale`/`presetSources` are read once to pick the
    // preset and must not re-trigger seeding if they change later.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return {
  };
}
