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
  type PdfGenerationConfig,
  type PrintConfig,
  type PrintPreview,
  type ResolvedPrintConfig,
} from 'postext';
import { getBlob } from '../storage/blobStore.js';

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
export function profileKey(print: ResolvedPrintConfig, base = profileBaseUrl): string {
  return print.outputProfile === 'custom' && print.customProfile
    ? `custom:${print.customProfile.fileId}`
    : `${base}|${print.outputProfile}`;
}

/** Load (once) the output profile a print config names; a catalogue one
 *  from `base` (the host's, by default: a worker of the Sandbox is handed
 *  the page's). */
export function loadPrintProfile(print: ResolvedPrintConfig, base = profileBaseUrl): Promise<LoadedProfile> {
  const key = profileKey(print, base);
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
        const url = `${base.replace(/\/?$/, '/')}${print.outputProfile}.icc`;
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

/**
 * Whether the PDF prints in grays (#800): forced to DeviceGray, and not a
 * PDF/X file (which is written in CMYK whatever the colour space says).
 */
export function printsGrayscale(pdf: PdfGenerationConfig | undefined, setup: PrintSetup): boolean {
  return pdf?.forceColorSpace === true && pdf.colorSpace === 'grayscale' && setup.print.standard === 'none';
}

/** The soft proof of a loaded setup, on the paper's white (`paper`) or
 *  relative to it, as a grayscale print (`grayscale`) or in colour. The
 *  Sandbox's viewers show the print alone: no screen guides, no preflight
 *  outlines (#802; the findings are in the Checks panel). */
export function previewFor(setup: PrintSetup, dpi: number, paper: boolean, grayscale = false): PrintPreview | undefined {
  if (!setup.transform) return undefined;
  return createPrintPreview(setup.transform, setup.print, { paper, dpi, grayscale });
}
