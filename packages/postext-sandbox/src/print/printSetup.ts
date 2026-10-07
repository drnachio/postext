/**
 * The print setup of the open book (#606, #607): `config.print` resolved,
 * its output profile loaded (a catalogue profile from the host's `/icc/`,
 * or the custom one from the blob store) and the transforms built once.
 * The PDF export, the print preview and the preflight all read it.
 */

import { useEffect, useState } from 'react';
import {
  DEFAULT_PROFILE_BASE_URL,
  createPrintPreview,
  outputProfileInfo,
  outputTransform,
  parseIccProfile,
  resolvePrintConfig,
  type IccProfile,
  type OutputTransform,
  type PrintConfig,
  type PrintPreview,
  type ResolvedPrintConfig,
} from 'postext';
import { getBlob } from '../storage/blobStore';

let profileBaseUrl = DEFAULT_PROFILE_BASE_URL;

/** Where catalogue profiles are fetched from (`<base>/<id>.icc`). The
 *  host sets it (postext.dev serves them at `/icc/`). */
export function setOutputProfileBaseUrl(url: string | undefined): void {
  profileBaseUrl = url ?? DEFAULT_PROFILE_BASE_URL;
}

export function outputProfileBaseUrl(): string {
  return profileBaseUrl;
}

export interface LoadedProfile {
  /** The profile's bytes, for the PDF's output intent. */
  bytes: Uint8Array;
  profile: IccProfile;
}

const loads = new Map<string, Promise<LoadedProfile>>();

/** The key a print config's profile is cached by. */
export function profileKey(print: ResolvedPrintConfig): string {
  return print.outputProfile === 'custom' && print.customProfile
    ? `custom:${print.customProfile.fileId}`
    : `${profileBaseUrl}|${print.outputProfile}`;
}

/** Load (once) the output profile a print config names. */
export function loadPrintProfile(print: ResolvedPrintConfig): Promise<LoadedProfile> {
  const key = profileKey(print);
  let p = loads.get(key);
  if (!p) {
    p = (async () => {
      let bytes: Uint8Array;
      if (print.outputProfile === 'custom' && print.customProfile) {
        const record = await getBlob(print.customProfile.fileId);
        if (!record) throw new Error(`custom output profile ${print.customProfile.name} is missing`);
        bytes = new Uint8Array(record.bytes);
      } else {
        if (!outputProfileInfo(print.outputProfile)) throw new Error(`unknown output profile ${print.outputProfile}`);
        const url = `${profileBaseUrl.replace(/\/?$/, '/')}${print.outputProfile}.icc`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`could not fetch ${url} (${res.status})`);
        bytes = new Uint8Array(await res.arrayBuffer());
      }
      return { bytes, profile: parseIccProfile(bytes) };
    })();
    p.catch(() => loads.delete(key));
    loads.set(key, p);
  }
  return p;
}

export interface PrintSetup {
  print: ResolvedPrintConfig;
  /** Present once the profile has loaded. */
  loaded?: LoadedProfile;
  transform?: OutputTransform;
  error?: string;
}

/** The transform of a print config's colour handling. */
export function printTransform(profile: IccProfile, print: ResolvedPrintConfig): OutputTransform {
  return outputTransform(profile, {
    intent: print.renderingIntent,
    blackPointCompensation: print.blackPointCompensation,
    preserveNeutrals: print.black.kOnlyNeutrals,
  });
}

/** The print setup of a raw `config.print`, loading its profile. */
export function usePrintSetup(raw: PrintConfig | undefined, enabled = true): PrintSetup {
  const print = resolvePrintConfig(raw);
  const key = profileKey(print);
  const [state, setState] = useState<{ key: string; loaded?: LoadedProfile; error?: string }>({ key });
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    loadPrintProfile(print).then(
      (loaded) => live && setState({ key, loaded }),
      (err: Error) => live && setState({ key, error: err.message }),
    );
    return () => {
      live = false;
    };
    // The key names the profile; the rest of `print` does not change it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
  const loaded = state.key === key ? state.loaded : undefined;
  return {
    print,
    ...(loaded ? { loaded, transform: printTransform(loaded.profile, print) } : {}),
    ...(state.key === key && state.error ? { error: state.error } : {}),
  };
}

/** The proof a viewer paints with: paper simulated in Canvas, not in
 *  Folio (whose paper shade tints the pages). */
export function previewFor(setup: PrintSetup, dpi: number, paper: boolean): PrintPreview | undefined {
  if (!setup.transform) return undefined;
  return createPrintPreview(setup.transform, setup.print, { paper, dpi });
}
