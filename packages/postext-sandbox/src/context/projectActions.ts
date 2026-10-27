// Local project operations, kept out of the provider so the state plumbing
// stays readable. Everything here runs against the live state through the
// `deps` accessors; the provider owns the refs and hands them in.

import { clearMeasurementCache, type PostextConfig } from 'postext';
import { isBundleManifest, pickBundleMeta } from 'postext/bundle';
import { setCustomFonts } from '../controls/fonts/fontLoader.js';
import { invalidateResourceImage } from '../controls/media/resourceImages.js';
import { slugify } from '../panels/resources/slugify.js';
import type { BundleContent } from '../presets/bundle.js';
import { type PresetApplyParts, openBundleZip, type LoadedPreset, parseBundle, buildBundleFiles, zipBundle, POSTEXT_EXTENSION, POSTEXT_MIME } from '../presets/index.js';
import { mimeForFile, extensionForImageMime } from '../presets/manifest.js';
import { putBlobAt, getBlob } from '../storage/blobStore.js';
import { putFontFile, getFontFile } from '../storage/fontStorage.js';
import { saveProjectId, savePresetId, clearPresetApplied, saveBook, saveConfig, readFileBytes, downloadBytes } from '../storage/persistence.js';
import { singleChapterBook, cloneBook } from '../book/chapterOps.js';
import type { BookContent } from '../book/types.js';
import { cloneEditionsForProject, cloneContentForProject, projectFileId, projectFontFileId } from '../storage/projectFiles.js';
import { projectEditionFields, editionTitlesOf, withNewEdition, recordLocaleOf } from '../storage/projectEditions.js';
import { localeDisplayName } from '../presets/localeNames.js';
import { type ProjectRecord, getProject, putProject, toSummary, generateProjectId, type ProjectContent, generateChapterId, updateProject, renameEditionPatch, renamePatch, deleteProject, allEditionChapters, type ProjectThumbnail, withActiveEdition } from '../storage/projects.js';
import { renameFrameInEdition } from '../templates/slotRename.js';
import { withDefaultResourceTypes, createBlankBookConfig } from './defaultConfig.js';
import type { SandboxState } from './SandboxContext.js';
import { deleteChapterLayouts, putChapterLayouts } from '../storage/layouts.js';
import { bundleContentLocales, sameLocaleTag } from '../presets/locale.js';
import { getPresetDraft } from '../storage/presetDrafts.js';
import { sessionCoverAttempts, coverTargetKey, thumbnailIfMissing } from '../covers/autoCover.js';
import { recordSharedConfig, initialSharedConfig } from '../editions/configLayers.js';
import { bundleCoverImage } from '../covers/renderCover.js';
import { bookOfState, newRecord, ownEditions, copyThumbnail, adoptPresetThumbnail, withEditionsOf, ownContent, adoptLoadedPreset, storeThumbnail, bookFromLoaded, presetThumbnailBytes, PRESET_THUMBNAIL_ID, storedCurrentLayouts, localizedOf, BUNDLE_COVER_ID } from './projectActions/copies.js';
import type { ProjectActionDeps, ProjectActions } from './projectActions/types.js';

export type { ProjectActionDeps, DuplicateSource, ProjectActions } from './projectActions/types.js';

export function createProjectActions(deps: ProjectActionDeps): ProjectActions {
  const { dispatch } = deps;

  const setStatus = (status: SandboxState['projectStatus'], error?: string) =>
    dispatch({ type: 'SET_PROJECT_STATUS', payload: { status, error } });

  /** Wrap an operation with busy/idle/error bookkeeping. */
  const run = async <T>(op: () => Promise<T>): Promise<T> => {
    setStatus('busy');
    try {
      const out = await deps.withGcSuspended(op);
      setStatus('idle');
      return out;
    } catch (err) {
      setStatus('error', err instanceof Error ? err.message : String(err));
      throw err;
    }
  };

  /** Swap the working state to `record` in one synchronous batch. */
  const applyRecord = (record: ProjectRecord, parts: PresetApplyParts = 'all'): void => {
    const locale = deps.getState().locale;
    const config = withDefaultResourceTypes(record.config, locale);
    const wantsConfig = parts === 'all' || parts === 'config';
    const wantsMarkdown = parts === 'all' || parts === 'document';
    const wantsResources = parts !== 'config';
    const fontsChange = wantsConfig || (parts === 'document' && config.customFonts !== undefined);
    // Register fonts before any state change: viewport builds run before the
    // provider's font effect and would otherwise measure with fallbacks.
    // They are the record's, not an edit of the last book's.
    if (fontsChange) setCustomFonts(config.customFonts, { newBook: true });
    const before = deps.getState();
    dispatch({ type: 'SET_ACTIVE_PROJECT', payload: { id: record.id, sourcePresetId: record.sourcePresetId } });
    if (wantsConfig) {
      dispatch({ type: 'SET_CONFIG', payload: config });
      // A book in several languages: its general settings, and the scope
      // the reader was editing in when they only switched editions.
      const shared = recordSharedConfig(record);
      const scope = before.activeProjectId === record.id && before.configLayers ? before.configLayers.scope : 'all';
      dispatch({ type: 'SET_CONFIG_LAYERS', payload: shared ? { shared, scope } : null });
    }
    else if (parts === 'document' && config.customFonts !== undefined) {
      dispatch({ type: 'UPDATE_CONFIG', payload: { customFonts: config.customFonts } });
    }
    if (wantsResources) dispatch({ type: 'SET_RESOURCES', payload: record.resources });
    const book: BookContent = { chapters: record.chapters, activeChapterId: record.activeChapterId, ...(record.canvasScope ? { canvasScope: record.canvasScope } : {}), ...(record.start ? { start: record.start } : {}) };
    if (wantsMarkdown) dispatch({ type: 'SET_BOOK', payload: book });
    clearMeasurementCache();
    saveProjectId(record.id);
    savePresetId(record.sourcePresetId ?? deps.getBuiltin().summary.id);
    clearPresetApplied();
    const s = deps.getState();
    saveBook(wantsMarkdown ? book : bookOfState(s));
    saveConfig(wantsConfig ? config : s.config);
  };

  const activateRecord = (record: ProjectRecord): Promise<void> =>
    deps.switchBook(async () => {
      deps.cancelPresetLoads();
      applyRecord(record);
    });

  const activate = (id: string): Promise<void> =>
    run(async () => {
      if (deps.getState().activeProjectId === id) return;
      await deps.switchBook(async () => {
        const record = await getProject(id);
        if (!record) {
          dispatch({ type: 'REMOVE_PROJECT_SUMMARY', payload: id });
          throw new Error('Project not found');
        }
        await activateRecord(record);
      });
    });

  const persistNew = async (record: ProjectRecord): Promise<string> => {
    await putProject(record);
    dispatch({ type: 'UPSERT_PROJECT_SUMMARY', payload: toSummary(record) });
    await activateRecord(record);
    return record.id;
  };

  const activeName = (): string => {
    const s = deps.getState();
    if (s.activeProjectId) {
      const p = s.projects.find((x) => x.id === s.activeProjectId);
      if (p) return p.name;
    }
    return s.presetSummaries.find((p) => p.id === s.activePresetId)?.name ?? deps.labels().projectUntitled;
  };

  const copyName = (name: string): string => deps.labels().projectCopySuffix.replace('__name__', name);

  const create: ProjectActions['create'] = ({ from, name }) =>
    run(async () => {
      const s = deps.getState();
      const id = generateProjectId();
      if (from === 'blank') {
        const content: ProjectContent = {
          ...singleChapterBook('', generateChapterId(), deps.labels().chapterUntitled.replace('__n__', '1')),
          config: withDefaultResourceTypes(createBlankBookConfig(s.locale), s.locale),
          resources: [],
        };
        return persistNew(newRecord(content, { name: name ?? deps.labels().projectUntitled, locale: s.locale }, id));
      }
      await deps.flushWorkingSave();
      const cur = deps.getState();
      // The other editions of a book in several languages come along.
      const source = cur.activeProjectId ? await getProject(cur.activeProjectId).catch(() => null) : null;
      const { content, editions } = await cloneEditionsForProject(
        { ...cloneBook(bookOfState(cur), generateChapterId), config: cur.config, resources: cur.resources },
        ownEditions(source?.editions),
        id,
      );
      const active = cur.activeProjectId ? cur.projects.find((p) => p.id === cur.activeProjectId) : undefined;
      const preset = cur.presetSummaries.find((p) => p.id === cur.activePresetId);
      // The cover picture follows the book: the active project's own, or the
      // showcase preset's when the working book is still a preset.
      const thumbnail = active
        ? await copyThumbnail(active.thumbnail, id)
        : preset ? await adoptPresetThumbnail(preset, id, cur.presetApplied?.presetId === preset.id ? cur.presetApplied.locale : undefined) : undefined;
      return persistNew(withEditionsOf(newRecord(content, {
        name: name ?? (active ? copyName(active.name) : preset ? copyName(preset.name) : deps.labels().projectUntitled),
        description: active?.description ?? preset?.description,
        locale: active?.locale ?? preset?.locale ?? cur.locale,
        bundleId: active?.bundleId ?? (cur.activeProjectId ? undefined : cur.activePresetId),
        sourcePresetId: active ? active.sourcePresetId : cur.activePresetId,
        thumbnail,
      }, id), source ?? undefined, editions));
    });

  const duplicate: ProjectActions['duplicate'] = (source) =>
    run(async () => {
      const s = deps.getState();
      const id = generateProjectId();
      if (source.kind === 'preset' && source.draftKey) {
        const draft = await getPresetDraft(source.draftKey);
        const summary = s.presetSummaries.find((p) => p.id === source.id);
        if (draft) {
          await deps.flushWorkingSave();
          const { content } = await cloneContentForProject(ownContent(draft), id);
          return persistNew(newRecord(content, {
            name: copyName(summary?.name ?? source.id),
            description: summary?.description,
            locale: draft.locale || summary?.locale,
            bundleId: source.id,
            sourcePresetId: source.id,
            thumbnail: summary ? await adoptPresetThumbnail(summary, id, draft.locale) : undefined,
          }, id));
        }
      }
      if (source.kind === 'project') {
        const record = await getProject(source.id);
        if (!record) throw new Error('Project not found');
        await deps.flushWorkingSave();
        const { content, editions } = await cloneEditionsForProject(ownContent(record), ownEditions(record.editions), id);
        return persistNew(withEditionsOf(newRecord(content, {
          name: copyName(record.name),
          description: record.description,
          locale: record.locale,
          bundleId: record.bundleId,
          sourcePresetId: record.sourcePresetId,
          thumbnail: await copyThumbnail(record.thumbnail, id),
        }, id), record, editions));
      }
      const provider = deps.getProviders().find((p) => p.summary.id === source.id);
      if (!provider) throw new Error('Preset not found');
      const loaded = await provider.load(source.locale ?? s.locale);
      const content = await adoptLoadedPreset(loaded, id);
      return persistNew(newRecord(content, {
        name: copyName(loaded.summary.name),
        description: loaded.summary.description,
        locale: loaded.summary.locale,
        bundleId: loaded.summary.id,
        sourcePresetId: loaded.summary.id,
        // A showcase bundle's cover picture becomes the project's own.
        thumbnail: await adoptPresetThumbnail(provider.summary, id, loaded.locale),
      }, id));
    });

  const rename: ProjectActions['rename'] = async (id, name, description, opts = {}) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    // On a book in several languages the name the reader gives is the
    // book's in every edition (#968): from then on switching the edition
    // leaves it, and an export gives no edition a title of its own. Asked
    // for the language on screen only (#999), the title is that edition's.
    const updated = await updateProject(id, (existing) => (opts.edition ? renameEditionPatch(existing, trimmed, description) : renamePatch(existing, trimmed, description)));
    if (updated) dispatch({ type: 'UPSERT_PROJECT_SUMMARY', payload: toSummary(updated) });
  };

  const remove: ProjectActions['remove'] = (id, opts = {}) =>
    run(async () => {
      const wasActive = !opts.offScreen && deps.getState().activeProjectId === id;
      if (wasActive) {
        deps.discardWorkingSave();
        deps.cancelPresetLoads();
        dispatch({ type: 'SET_ACTIVE_PROJECT', payload: { id: null } });
        saveProjectId(null);
      }
      const record = await getProject(id);
      await deleteProject(id);
      if (record) await deleteChapterLayouts(allEditionChapters(record).map((c) => c.id)).catch(() => undefined);
      dispatch({ type: 'REMOVE_PROJECT_SUMMARY', payload: id });
      if (wasActive) await deps.openPreset(deps.getBuiltin().summary.id);
    });

  const importBundle: ProjectActions['importBundle'] = async (file) =>
    importBundleBytes(await readFileBytes(file), file.name);

  const importBundleBytes: ProjectActions['importBundleBytes'] = (bytes, fileName, opts = {}) =>
    run(async () => {
      const s = deps.getState();
      const id = generateProjectId();
      const opened = openBundleZip(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
      const manifestId = (opened.manifest as { id?: unknown } | null)?.id;
      const summaryId = typeof manifestId === 'string' ? manifestId : slugify(fileName) || 'project';
      const readEdition = (locale: string): Promise<LoadedPreset> => parseBundle(opened.manifest, opened.readFile, {
        locale,
        summary: { id: summaryId, name: summaryId, source: 'private', available: true },
        ids: { blob: (f) => projectFileId(id, f), font: (f) => projectFontFileId(id, f) },
        chapterIds: generateChapterId,
        untitledChapter: (n) => deps.labels().chapterUntitled.replace('__n__', String(n)),
      });
      // The content locale picked on import (a bundle in several
      // languages), else the viewer's: a bundle in one language is read
      // in its own whatever is asked.
      const loaded = await readEdition(opts.locale ?? s.locale);
      // A bundle in several languages keeps every edition in the project
      // (#903): the one picked is the record's own content, the rest are
      // read the same way and kept aside until the reader switches to them.
      const tags = bundleContentLocales(opened.manifest).locales;
      const asides: LoadedPreset[] = [];
      for (const tag of tags) {
        if (sameLocaleTag(tag, loaded.locale)) continue;
        asides.push(await readEdition(tag));
      }
      const everyEdition = [loaded, ...asides];
      const written = new Set<string>();
      await Promise.all([
        ...everyEdition.flatMap((l) => l.blobs).map(async (b) => {
          if (written.has(b.fileId)) return;
          written.add(b.fileId);
          await putBlobAt(b.fileId, b.bytes, b.mime);
          invalidateResourceImage(b.fileId);
        }),
        ...everyEdition.flatMap((l) => l.fonts).map(async (f) => {
          if (written.has(f.fileId)) return;
          written.add(f.fileId);
          await putFontFile(f);
        }),
      ]);
      // The pagination each edition's bundle carries, kept so that the
      // checks and the side-by-side view do not paginate it again.
      await putChapterLayouts(asides.flatMap((l) => Object.values(l.layouts ?? {}))).catch(() => undefined);
      // The title of the edition imported (`localized.<lang>.name`, #891),
      // else the manifest's.
      const manifestName = isBundleManifest(opened.manifest) ? pickBundleMeta(opened.manifest, loaded.locale).name : undefined;
      // The bundle's cover picture (`thumbnail` in the manifest), when it
      // carries one.
      const manifestThumbnail = (opened.manifest as { thumbnail?: unknown }).thumbnail;
      let thumbnail: ProjectThumbnail | undefined;
      if (typeof manifestThumbnail === 'string' && manifestThumbnail) {
        const bytes = await opened.readFile(manifestThumbnail).catch(() => null);
        if (bytes) thumbnail = (await storeThumbnail(id, bytes, mimeForFile(manifestThumbnail))) ?? undefined;
      }
      const edition = projectEditionFields(loaded, asides, tags);
      const record = newRecord(
        { ...bookFromLoaded(loaded), config: loaded.config, resources: loaded.resources },
        {
          name: typeof manifestName === 'string' && manifestName ? manifestName : summaryId,
          description: loaded.summary.description,
          locale: loaded.summary.locale,
          bundleId: summaryId,
          thumbnail,
          ...(opts.origin ? { origin: opts.origin } : {}),
        },
        id,
      );
      if (edition) {
        record.editions = edition.editions;
        record.editionLocales = edition.editionLocales;
        record.editionsRev = Date.now();
        // The general settings the bundle keeps, the language aside, which
        // is every edition's own (#1209).
        if (loaded.sharedConfig) record.sharedConfig = initialSharedConfig(loaded.sharedConfig);
        // What the bundle calls each edition (#968).
        const titles = editionTitlesOf(opened.manifest, edition.editionLocales);
        if (titles) record.editionTitles = titles;
      }
      const projectId = await persistNew(record);
      // The bundle's pagination, when it still applies: the book opens
      // paginated (the records are written to storage with the state).
      if (loaded.layouts) dispatch({ type: 'SET_CHAPTER_LAYOUTS', payload: loaded.layouts });
      return projectId;
    });

  /** Open another edition of a project (#903): the project's edition on
   *  screen goes aside as it is and the one asked for takes its place. A
   *  project of one language, or an edition it lacks, changes nothing. */
  const switchEdition: ProjectActions['switchEdition'] = (id, locale) =>
    run(async () => {
      const s = deps.getState();
      const wasActive = s.activeProjectId === id;
      if (wasActive) await deps.flushWorkingSave();
      const record = await getProject(id);
      if (!record) throw new Error('Project not found');
      const next = withActiveEdition(record, locale);
      if (next === record) {
        if (!wasActive) await activateRecord(record);
        return;
      }
      // The record holds both editions as the reader left them.
      await putProject({ ...next, updatedAt: Date.now() });
      dispatch({ type: 'UPSERT_PROJECT_SUMMARY', payload: toSummary(next) });
      await activateRecord(next);
    });

  const addEdition: ProjectActions['addEdition'] = (id, locale) =>
    run(async () => {
      const s = deps.getState();
      // The edition on screen is copied as the reader left it.
      if (s.activeProjectId === id) await deps.flushWorkingSave();
      const record = await getProject(id);
      if (!record) throw new Error('Project not found');
      // The book gets general settings with its second language: the ones
      // of the edition it is copied from, its language aside (#1209).
      const layered = record.sharedConfig || record.editions ? record : { ...record, sharedConfig: initialSharedConfig(record.config) };
      const made = withNewEdition(layered, locale, { ids: generateChapterId, fallbackLocale: s.locale });
      if (!made) return false;
      const { record: added, applied } = made;
      // The new edition takes the screen; the one it was copied from goes
      // aside as it is.
      const next = withActiveEdition(added, locale);
      await putProject({ ...next, updatedAt: Date.now() });
      dispatch({ type: 'UPSERT_PROJECT_SUMMARY', payload: toSummary(next) });
      await activateRecord(next);
      // The copy is not a translation yet: say so where the Books panel shows it.
      const ui = s.locale;
      dispatch({
        type: 'SET_PROJECT_NOTICE',
        payload: deps.labels().projectLanguageAdded
          .replace('__language__', localeDisplayName(locale, ui))
          .replace('__name__', next.name)
          .replace('__from__', localeDisplayName(recordLocaleOf(record, ui), ui))
        + (applied ? ` ${deps.labels().projectLanguageDefaults.replace('__language__', localeDisplayName(locale, ui)).replace('__count__', String(applied.count))}` : ''),
      });
      return true;
    });

  const exportProject: ProjectActions['exportProject'] = (target) =>
    run(async () => {
      const s = deps.getState();
      let meta: { id: string; name: string; description?: string; locale?: string };
      let content: BundleContent;
      let readBlob = async (fileId: string) => (await getBlob(fileId))?.bytes ?? null;
      let readFont = async (fileId: string) => (await getFontFile(fileId))?.buffer ?? null;

      if (target?.kind === 'preset') {
        const provider = deps.getProviders().find((p) => p.summary.id === target.id);
        if (!provider) throw new Error('Preset not found');
        const loaded = await provider.load(target.locale ?? s.locale);
        const blobs = new Map(loaded.blobs.map((b) => [b.fileId, b.bytes]));
        const fonts = new Map(loaded.fonts.map((f) => [f.fileId, f.buffer]));
        // The showcase cover picture: fetched from the source, handed to the
        // bundle under an id of its own (it is no resource of the book).
        const cover = await presetThumbnailBytes(loaded.summary, loaded.locale);
        if (cover) blobs.set(PRESET_THUMBNAIL_ID, cover.bytes);
        const fromIdb = { readBlob, readFont };
        readBlob = async (fileId) => blobs.get(fileId) ?? fromIdb.readBlob(fileId);
        readFont = async (fileId) => fonts.get(fileId) ?? fromIdb.readFont(fileId);
        meta = { id: loaded.summary.id, name: loaded.summary.name, description: loaded.summary.description, locale: loaded.summary.locale };
        // Its pagination: the records kept while it was the working book
        // (still in memory when it is, and unedited).
        const inMemory = !s.activeProjectId && s.activePresetId === target.id ? deps.currentLayouts() : {};
        const layouts = await storedCurrentLayouts(loaded.chapters, loaded.config, loaded.resources, inMemory, loaded.start);
        content = {
          ...bookFromLoaded(loaded),
          config: loaded.config,
          resources: loaded.resources,
          layouts,
          ...(cover ? { thumbnail: { fileId: PRESET_THUMBNAIL_ID, mime: cover.mime } } : {}),
        };
      } else if (target?.kind === 'project' && target.id !== s.activeProjectId) {
        const record = await getProject(target.id);
        if (!record) throw new Error('Project not found');
        meta = { id: record.bundleId ?? (slugify(record.name) || 'project'), name: record.name, description: record.description, locale: record.locale };
        // The configuration as the working book had it (`applyRecord`), so
        // the records written then still fingerprint the same.
        const config = withDefaultResourceTypes(record.config, s.locale);
        const layouts = await storedCurrentLayouts(record.chapters, config, record.resources, {}, record.start);
        const localized = await localizedOf(record);
        const sharedConfig = localized ? recordSharedConfig(record) : null;
        content = { ...record, config, layouts, ...(localized ? { localized } : {}), ...(sharedConfig ? { sharedConfig } : {}) };
      } else {
        await deps.flushWorkingSave();
        const cur = deps.getState();
        const active = cur.activeProjectId ? cur.projects.find((p) => p.id === cur.activeProjectId) : undefined;
        const preset = cur.presetSummaries.find((p) => p.id === cur.activePresetId);
        const name = activeName();
        meta = {
          id: active?.bundleId ?? (active ? slugify(name) || 'project' : cur.activePresetId),
          name,
          description: active?.description ?? preset?.description,
          locale: active?.locale ?? preset?.locale ?? cur.locale,
        };
        // The cover: the project's own, or the preset's (shipped, or taken
        // from its first page) for an edited preset on screen. One taken
        // from the first page is sized for the Books rows: the bundle gets
        // its first page painted now at a file manager's icon size (#1210).
        let thumbnail = active?.thumbnail;
        const chosen = active ? !!thumbnail && !thumbnail.generated : !!preset?.thumbnailUrl;
        const painted = chosen ? null : await bundleCoverImage(cur.chapters[0]);
        if (painted) {
          const fromIdb = readBlob;
          readBlob = async (fileId) => (fileId === BUNDLE_COVER_ID ? painted.bytes : fromIdb(fileId));
          thumbnail = { fileId: BUNDLE_COVER_ID, mime: painted.mime };
        } else if (!active && preset) {
          const cover = await presetThumbnailBytes(preset, cur.presetApplied?.presetId === preset.id ? cur.presetApplied.locale : undefined);
          if (cover) {
            const fromIdb = readBlob;
            readBlob = async (fileId) => (fileId === PRESET_THUMBNAIL_ID ? cover.bytes : fromIdb(fileId));
            thumbnail = { fileId: PRESET_THUMBNAIL_ID, mime: cover.mime };
          }
        }
        // The other editions of a project in several languages go along.
        const record = active ? await getProject(active.id).catch(() => null) : null;
        const localized = record ? await localizedOf(record) : undefined;
        const sharedConfig = localized && record ? recordSharedConfig(record) : null;
        if (localized && meta.locale === undefined) meta = { ...meta, locale: record!.locale };
        content = {
          ...bookOfState(cur),
          config: cur.config,
          resources: cur.resources,
          layouts: deps.currentLayouts(),
          ...(thumbnail ? { thumbnail } : {}),
          ...(localized ? { localized } : {}),
          ...(sharedConfig ? { sharedConfig } : {}),
        };
      }

      const built = await buildBundleFiles(meta, content, { readBlob, readFont });
      const zip = zipBundle(built.files);
      downloadBytes(zip, `${slugify(meta.name) || 'project'}${POSTEXT_EXTENSION}`, POSTEXT_MIME);
      if (built.warnings.length > 0) {
        dispatch({ type: 'SET_PROJECT_NOTICE', payload: deps.labels().projectExportWarnings.replace('__list__', built.warnings.join('; ')) });
      }
    });

  const setThumbnail: ProjectActions['setThumbnail'] = (id, file) =>
    run(async () => {
      // The reader's choice: no cover is taken from the first page in its
      // place during this visit.
      sessionCoverAttempts.add(coverTargetKey({ kind: 'project', id }));
      let thumbnail: ProjectThumbnail | undefined;
      if (file) {
        const mime = extensionForImageMime(file.type) ? file.type : mimeForFile(file.name);
        const stored = await storeThumbnail(id, await file.arrayBuffer(), mime);
        if (!stored) {
          dispatch({ type: 'SET_PROJECT_NOTICE', payload: deps.labels().projectThumbnailInvalid });
          return;
        }
        thumbnail = stored;
      }
      const updated = await updateProject(id, { thumbnail });
      if (updated) dispatch({ type: 'UPSERT_PROJECT_SUMMARY', payload: toSummary(updated) });
    });

  const adoptGeneratedThumbnail: ProjectActions['adoptGeneratedThumbnail'] = (id, bytes, mime) =>
    // Off the busy path (the Books panel stays usable) but with the sweep
    // held, so the bytes are not collected before the record points at them.
    deps.withGcSuspended(async () => {
      const current = await getProject(id).catch(() => null);
      if (!current || current.thumbnail) return false;
      const taken = await storeThumbnail(id, bytes, mime);
      if (!taken) return false;
      const stored: ProjectThumbnail = { ...taken, generated: true };
      const updated = await updateProject(id, (existing) => thumbnailIfMissing(existing, stored)).catch(() => null);
      if (!updated || updated.thumbnail?.fileId !== stored.fileId) return false;
      dispatch({ type: 'UPSERT_PROJECT_SUMMARY', payload: toSummary(updated) });
      return true;
    }).catch(() => false);

  const renameFrameInEditions: ProjectActions['renameFrameInEditions'] = async (id, templateId, from, to) => {
    let count = 0;
    // One transaction: the autosave of the edition on screen may write the
    // same record, and neither may drop what the other wrote.
    const updated = await updateProject(id, (existing) => {
      const editions = existing.editions;
      if (!editions) return null;
      const next: Record<string, ProjectContent> = {};
      for (const [locale, content] of Object.entries(editions)) {
        const renamed = renameFrameInEdition(content, templateId, from, to);
        if (renamed) count++;
        next[locale] = renamed ?? content;
      }
      return count > 0 ? { editions: next, editionsRev: Date.now() } : null;
    }).catch(() => null);
    if (updated && count > 0) dispatch({ type: 'UPSERT_PROJECT_SUMMARY', payload: toSummary(updated) });
    return updated ? count : 0;
  };

  const resetToSource: ProjectActions['resetToSource'] = (parts) =>
    run(async () => {
      const s = deps.getState();
      const projectId = s.activeProjectId;
      if (!projectId) return;
      const active = s.projects.find((p) => p.id === projectId);
      const sourceId = active?.sourcePresetId;
      const provider = deps.getProviders().find((p) => p.summary.id === sourceId);
      if (!provider) throw new Error('Preset not found');
      deps.cancelPresetLoads();
      // The project keeps the language it was cloned in.
      const loaded = await provider.load(active?.locale ?? s.locale);
      const content = await adoptLoadedPreset(loaded, projectId);
      const record = await getProject(projectId);
      if (!record) throw new Error('Project not found');
      const merged: ProjectRecord = { ...record, ...content, updatedAt: Date.now() };
      // Only the requested parts reach the working state; the record is
      // rewritten by the autosave once the state settles.
      const config: PostextConfig = parts === 'all' || parts === 'config'
        ? merged.config
        : parts === 'document' && merged.config.customFonts !== undefined
          ? { ...record.config, customFonts: merged.config.customFonts }
          : record.config;
      applyRecord({ ...merged, config }, parts);
    });

  return { activate, create, duplicate, rename, remove, importBundle, importBundleBytes, switchEdition, addEdition, exportProject, setThumbnail, adoptGeneratedThumbnail, renameFrameInEditions, resetToSource };
}
