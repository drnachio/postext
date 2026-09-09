// Local project operations, kept out of the provider so the state plumbing
// stays readable. Everything here runs against the live state through the
// `deps` accessors; the provider owns the refs and hands them in.

import type { Dispatch } from 'react';
import { clearMeasurementCache } from 'postext';
import type { PostextConfig } from 'postext';
import { setCustomFonts } from '../controls/fontLoader';
import { invalidateResourceImage } from '../controls/resourceImages';
import { slugify } from '../panels/resources/slugify';
import {
  buildBundleFiles,
  openBundleZip,
  parseBundle,
  zipBundle,
  POSTEXT_EXTENSION,
  POSTEXT_MIME,
} from '../presets';
import type { LoadedPreset, PresetApplyParts, PresetProvider } from '../presets';
import { getBlob, putBlobAt } from '../storage/blobStore';
import { getFontFile, putFontFile } from '../storage/fontStorage';
import {
  clearPresetApplied,
  downloadBytes,
  readFileBytes,
  saveConfig,
  saveMarkdown,
  savePresetId,
  saveProjectId,
} from '../storage/persistence';
import { cloneContentForProject, projectFileId, projectFontFileId, remapContentFileIds } from '../storage/projectFiles';
import {
  deleteProject,
  generateProjectId,
  getProject,
  putProject,
  toSummary,
  updateProject,
  type ProjectContent,
  type ProjectRecord,
} from '../storage/projects';
import { createDefaultConfig, withDefaultResourceTypes } from './defaultConfig';
import type { SandboxAction, SandboxState } from './SandboxContext';

export interface ProjectActionDeps {
  dispatch: Dispatch<SandboxAction>;
  getState: () => SandboxState;
  getProviders: () => PresetProvider[];
  getBuiltin: () => PresetProvider;
  /** Apply a preset into the working state (preset mode). */
  runPreset: (provider: PresetProvider, parts: PresetApplyParts) => Promise<void>;
  /** Invalidate any in-flight preset load so it never lands on a project. */
  cancelPresetLoads: () => void;
  /** Write the pending working-state save now (localStorage + active project). */
  flushWorkingSave: () => Promise<void>;
  /** Drop a pending save without writing it (the target is going away). */
  discardWorkingSave: () => void;
  /** Run `fn` with garbage collection paused, then schedule a sweep. */
  withGcSuspended: <T>(fn: () => Promise<T>) => Promise<T>;
  labels: () => SandboxState['labels'];
}

export type DuplicateSource = { kind: 'preset' | 'project'; id: string };

export interface ProjectActions {
  activate: (id: string) => Promise<void>;
  create: (opts: { from: 'current' | 'blank'; name?: string }) => Promise<string>;
  duplicate: (source: DuplicateSource) => Promise<string>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  importBundle: (file: File) => Promise<string>;
  exportProject: (target?: DuplicateSource) => Promise<void>;
  /** Reset the active project (or parts of it) to the preset it came from. */
  resetToSource: (parts: PresetApplyParts) => Promise<void>;
}

/** Take a preset's in-memory content and give the project its own copies of
 *  every file, under project ids. Bytes come from the loaded bundle when it
 *  carried them, else from IndexedDB (the built-in preset seeds its blobs
 *  directly). */
async function adoptLoadedPreset(loaded: LoadedPreset, projectId: string): Promise<ProjectContent> {
  const remapped = remapContentFileIds(
    { markdown: loaded.markdown, config: loaded.config, resources: loaded.resources },
    (_old, kind, hint) => (kind === 'blob' ? projectFileId(projectId, hint) : projectFontFileId(projectId, hint)),
  );
  const blobByOld = new Map(loaded.blobs.map((b) => [b.fileId, b]));
  const fontByOld = new Map(loaded.fonts.map((f) => [f.fileId, f]));
  await Promise.all([
    ...remapped.blobPairs.map(async ([from, to]) => {
      const inMemory = blobByOld.get(from);
      if (inMemory) {
        await putBlobAt(to, inMemory.bytes, inMemory.mime);
      } else {
        const rec = await getBlob(from).catch(() => null);
        if (rec) await putBlobAt(to, rec.bytes, rec.contentType);
      }
      invalidateResourceImage(to);
    }),
    ...remapped.fontPairs.map(async ([from, to]) => {
      const inMemory = fontByOld.get(from);
      if (inMemory) {
        await putFontFile({ fileId: to, fileName: inMemory.fileName, format: inMemory.format, buffer: inMemory.buffer });
      } else {
        const rec = await getFontFile(from).catch(() => null);
        if (rec) await putFontFile({ ...rec, fileId: to });
      }
    }),
  ]);
  return remapped.content;
}

function newRecord(
  content: ProjectContent,
  meta: Pick<ProjectRecord, 'name' | 'description' | 'locale' | 'bundleId' | 'sourcePresetId'>,
  id = generateProjectId(),
): ProjectRecord {
  const now = Date.now();
  return { id, ...meta, ...content, createdAt: now, updatedAt: now };
}

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
    if (fontsChange) setCustomFonts(config.customFonts);
    dispatch({ type: 'SET_ACTIVE_PROJECT', payload: { id: record.id, sourcePresetId: record.sourcePresetId } });
    if (wantsConfig) dispatch({ type: 'SET_CONFIG', payload: config });
    else if (parts === 'document' && config.customFonts !== undefined) {
      dispatch({ type: 'UPDATE_CONFIG', payload: { customFonts: config.customFonts } });
    }
    if (wantsResources) dispatch({ type: 'SET_RESOURCES', payload: record.resources });
    if (wantsMarkdown) dispatch({ type: 'SET_MARKDOWN', payload: record.markdown });
    clearMeasurementCache();
    saveProjectId(record.id);
    savePresetId(record.sourcePresetId ?? deps.getBuiltin().summary.id);
    clearPresetApplied();
    const s = deps.getState();
    saveMarkdown(wantsMarkdown ? record.markdown : s.markdown);
    saveConfig(wantsConfig ? config : s.config);
  };

  const activateRecord = async (record: ProjectRecord): Promise<void> => {
    deps.cancelPresetLoads();
    await deps.flushWorkingSave();
    applyRecord(record);
  };

  const activate = (id: string): Promise<void> =>
    run(async () => {
      if (deps.getState().activeProjectId === id) return;
      const record = await getProject(id);
      if (!record) {
        dispatch({ type: 'REMOVE_PROJECT_SUMMARY', payload: id });
        throw new Error('Project not found');
      }
      await activateRecord(record);
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
          markdown: '',
          config: withDefaultResourceTypes(createDefaultConfig(s.locale), s.locale),
          resources: [],
        };
        return persistNew(newRecord(content, { name: name ?? deps.labels().projectUntitled, locale: s.locale }, id));
      }
      await deps.flushWorkingSave();
      const cur = deps.getState();
      const { content } = await cloneContentForProject(
        { markdown: cur.markdown, config: cur.config, resources: cur.resources },
        id,
      );
      const active = cur.activeProjectId ? cur.projects.find((p) => p.id === cur.activeProjectId) : undefined;
      const preset = cur.presetSummaries.find((p) => p.id === cur.activePresetId);
      return persistNew(newRecord(content, {
        name: name ?? (active ? copyName(active.name) : preset?.name ?? deps.labels().projectUntitled),
        description: active?.description ?? preset?.description,
        locale: active?.locale ?? preset?.locale ?? cur.locale,
        bundleId: active?.bundleId ?? (cur.activeProjectId ? undefined : cur.activePresetId),
        sourcePresetId: active ? active.sourcePresetId : cur.activePresetId,
      }, id));
    });

  const duplicate: ProjectActions['duplicate'] = (source) =>
    run(async () => {
      const s = deps.getState();
      const id = generateProjectId();
      if (source.kind === 'project') {
        const record = await getProject(source.id);
        if (!record) throw new Error('Project not found');
        await deps.flushWorkingSave();
        const { content } = await cloneContentForProject(record, id);
        return persistNew(newRecord(content, {
          name: copyName(record.name),
          description: record.description,
          locale: record.locale,
          bundleId: record.bundleId,
          sourcePresetId: record.sourcePresetId,
        }, id));
      }
      const provider = deps.getProviders().find((p) => p.summary.id === source.id);
      if (!provider) throw new Error('Preset not found');
      const loaded = await provider.load(s.locale);
      const content = await adoptLoadedPreset(loaded, id);
      return persistNew(newRecord(content, {
        name: loaded.summary.name,
        description: loaded.summary.description,
        locale: loaded.summary.locale,
        bundleId: loaded.summary.id,
        sourcePresetId: loaded.summary.id,
      }, id));
    });

  const rename: ProjectActions['rename'] = async (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const updated = await updateProject(id, { name: trimmed });
    if (updated) dispatch({ type: 'UPSERT_PROJECT_SUMMARY', payload: toSummary(updated) });
  };

  const remove: ProjectActions['remove'] = (id) =>
    run(async () => {
      const wasActive = deps.getState().activeProjectId === id;
      if (wasActive) {
        deps.discardWorkingSave();
        deps.cancelPresetLoads();
        dispatch({ type: 'SET_ACTIVE_PROJECT', payload: { id: null } });
        saveProjectId(null);
      }
      await deleteProject(id);
      dispatch({ type: 'REMOVE_PROJECT_SUMMARY', payload: id });
      if (wasActive) await deps.runPreset(deps.getBuiltin(), 'all');
    });

  const importBundle: ProjectActions['importBundle'] = (file) =>
    run(async () => {
      const s = deps.getState();
      const id = generateProjectId();
      const opened = openBundleZip(await readFileBytes(file));
      const manifestId = (opened.manifest as { id?: unknown } | null)?.id;
      const summaryId = typeof manifestId === 'string' ? manifestId : slugify(file.name) || 'project';
      const loaded = await parseBundle(opened.manifest, opened.readFile, {
        locale: s.locale,
        summary: { id: summaryId, name: summaryId, source: 'private', available: true },
        ids: { blob: (f) => projectFileId(id, f), font: (f) => projectFontFileId(id, f) },
      });
      await Promise.all([
        ...loaded.blobs.map(async (b) => {
          await putBlobAt(b.fileId, b.bytes, b.mime);
          invalidateResourceImage(b.fileId);
        }),
        ...loaded.fonts.map((f) => putFontFile(f)),
      ]);
      const manifestName = (opened.manifest as { name?: unknown }).name;
      return persistNew(newRecord(
        { markdown: loaded.markdown, config: loaded.config, resources: loaded.resources },
        {
          name: typeof manifestName === 'string' && manifestName ? manifestName : summaryId,
          description: loaded.summary.description,
          locale: loaded.summary.locale,
          bundleId: summaryId,
        },
        id,
      ));
    });

  const exportProject: ProjectActions['exportProject'] = (target) =>
    run(async () => {
      const s = deps.getState();
      let meta: { id: string; name: string; description?: string; locale?: string };
      let content: ProjectContent;
      let readBlob = async (fileId: string) => (await getBlob(fileId))?.bytes ?? null;
      let readFont = async (fileId: string) => (await getFontFile(fileId))?.buffer ?? null;

      if (target?.kind === 'preset') {
        const provider = deps.getProviders().find((p) => p.summary.id === target.id);
        if (!provider) throw new Error('Preset not found');
        const loaded = await provider.load(s.locale);
        const blobs = new Map(loaded.blobs.map((b) => [b.fileId, b.bytes]));
        const fonts = new Map(loaded.fonts.map((f) => [f.fileId, f.buffer]));
        const fromIdb = { readBlob, readFont };
        readBlob = async (fileId) => blobs.get(fileId) ?? fromIdb.readBlob(fileId);
        readFont = async (fileId) => fonts.get(fileId) ?? fromIdb.readFont(fileId);
        meta = { id: loaded.summary.id, name: loaded.summary.name, description: loaded.summary.description, locale: loaded.summary.locale };
        content = { markdown: loaded.markdown, config: loaded.config, resources: loaded.resources };
      } else if (target?.kind === 'project' && target.id !== s.activeProjectId) {
        const record = await getProject(target.id);
        if (!record) throw new Error('Project not found');
        meta = { id: record.bundleId ?? (slugify(record.name) || 'project'), name: record.name, description: record.description, locale: record.locale };
        content = record;
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
        content = { markdown: cur.markdown, config: cur.config, resources: cur.resources };
      }

      const built = await buildBundleFiles(meta, content, { readBlob, readFont });
      const zip = zipBundle(built.files);
      downloadBytes(zip, `${slugify(meta.name) || 'project'}${POSTEXT_EXTENSION}`, POSTEXT_MIME);
      if (built.warnings.length > 0) {
        dispatch({ type: 'SET_PROJECT_NOTICE', payload: deps.labels().projectExportWarnings.replace('__list__', built.warnings.join('; ')) });
      }
    });

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
      const loaded = await provider.load(s.locale);
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

  return { activate, create, duplicate, rename, remove, importBundle, exportProject, resetToSource };
}
