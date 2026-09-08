import type { Dispatch } from 'react';
import { clearMeasurementCache } from 'postext';
import type { SandboxAction } from '../context/SandboxContext';
import { invalidateResourceImage } from '../controls/resourceImages';
import { putBlobAt } from '../storage/blobStore';
import { putFontFile } from '../storage/fontStorage';
import { savePresetApplied, savePresetId } from '../storage/persistence';
import { hashConfig, hashMarkdown, hashResources, type DocumentHashSource } from './hash';
import type { AppliedPresetSnapshot, LoadedPreset, PresetApplyParts } from './types';

export interface ApplyPresetOptions {
  parts: PresetApplyParts;
  /** Bundle fingerprint fetched *before* `load()`, so an edit that lands
   *  mid-load still shows up as a change on the next poll. Null when the
   *  provider has none or it could not be read. */
  fingerprint?: string | null;
  /** The slices of state the apply is about to replace; whatever `parts`
   *  leaves alone is hashed from here so the snapshot describes the state the
   *  reducer ends up with. */
  current: DocumentHashSource;
}

/** The snapshot a given apply produces — mirrors the reducer dispatches in
 *  `applyPreset` without waiting for React to commit them. */
export function snapshotForApply(
  loaded: LoadedPreset,
  { parts, fingerprint = null, current }: ApplyPresetOptions,
): AppliedPresetSnapshot {
  const wantsResources = parts === 'all' || parts === 'document' || parts === 'resources';
  const wantsMarkdown = parts === 'all' || parts === 'document';
  const config = parts === 'all' || parts === 'config'
    ? loaded.config
    : parts === 'document' && loaded.config.customFonts !== undefined
      ? { ...current.config, customFonts: loaded.config.customFonts }
      : current.config;
  return {
    presetId: loaded.summary.id,
    fingerprint,
    markdownHash: hashMarkdown(wantsMarkdown ? loaded.markdown : current.markdown),
    configHash: hashConfig(config),
    resourcesHash: hashResources(wantsResources ? loaded.resources : current.resources),
  };
}

/** Write a loaded preset into the sandbox: font files and resource blobs go to
 *  IndexedDB first, then state is swapped in one synchronous batch of
 *  dispatches so viewports never see a half-applied document.
 *
 *  - `all`: markdown, resources and config (custom fonts included).
 *  - `document`: markdown and resources; only `customFonts` is merged into the
 *    current config (when the preset declares any) so its text renders as
 *    intended.
 *  - `config`: config only (custom fonts included).
 *  - `resources`: the resource set only. */
export async function applyPreset(
  loaded: LoadedPreset,
  dispatch: Dispatch<SandboxAction>,
  options: ApplyPresetOptions,
): Promise<void> {
  const { parts } = options;
  const wantsFonts = parts !== 'resources';
  const wantsResources = parts === 'all' || parts === 'document' || parts === 'resources';
  const wantsMarkdown = parts === 'all' || parts === 'document';

  if (wantsFonts) {
    await Promise.all(loaded.fonts.map((f) => putFontFile(f)));
  }
  if (wantsResources) {
    await Promise.all(
      loaded.blobs.map(async (b) => {
        await putBlobAt(b.fileId, b.bytes, b.mime);
        // The blob may replace an earlier record under the same fileId —
        // drop any cached decode so viewers re-register it.
        invalidateResourceImage(b.fileId);
      }),
    );
  }

  const { id } = loaded.summary;
  dispatch({ type: 'SET_PRESET', payload: { id, markdown: loaded.markdown, config: loaded.config } });
  if (parts === 'all' || parts === 'config') {
    dispatch({ type: 'SET_CONFIG', payload: loaded.config });
  } else if (parts === 'document' && loaded.config.customFonts !== undefined) {
    dispatch({ type: 'UPDATE_CONFIG', payload: { customFonts: loaded.config.customFonts } });
  }
  if (wantsResources) dispatch({ type: 'SET_RESOURCES', payload: loaded.resources });
  if (wantsMarkdown) dispatch({ type: 'SET_MARKDOWN', payload: loaded.markdown });
  const snapshot = snapshotForApply(loaded, options);
  dispatch({ type: 'SET_PRESET_APPLIED', payload: snapshot });

  // Fonts and figures may have changed under the same names — start every
  // subsequent layout from fresh measurements.
  clearMeasurementCache();
  savePresetId(id);
  savePresetApplied(snapshot);
}
