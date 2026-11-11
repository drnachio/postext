/**
 * What the Checks panel's preflight needs beyond the laid-out document
 * (#605): the separation of the book's output profile (for ink counts and
 * coverage) and the reports of the placed PDF masters (fonts, RGB,
 * transparency). Both load asynchronously; the panel recomputes when
 * either arrives.
 */

import { bitmapInfo, embeddedIccProfile, parseIccProfile, printRasterFormat, resolvePrintConfig, svgSpotInks, type OutputTransform, type PrintConfig, type Resource } from 'postext';
import type { PrintMasterReport } from 'postext-pdf';
import { getBlob } from '../storage/blobStore.js';
import { loadPrintProfile, printTransform, profileKey } from './printSetup.js';

const listeners = new Set<() => void>();
let version = 0;
const transforms = new Map<string, OutputTransform | null>();
const masters = new Map<string, PrintMasterReport | null>();
const imageColors = new Map<string, 'rgb' | 'cmyk' | 'gray' | null>();
/** The pixels each bitmap's file really has (#631), from its header. */
const imageSizes = new Map<string, { width: number; height: number } | null>();
/** The spot inks each SVG names (#1468), from its markup. */
const svgInkNames = new Map<string, string[] | null>();
/** The ICC profile a CMYK JPEG carries, by its file id. */
const imageProfiles = new Map<string, { hash: string; name: string }>();

function changed(): void {
  version++;
  for (const l of listeners) l();
}

export function onPreflightInputsChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Bumped whenever a profile or a master report arrives. */
export function preflightInputsVersion(): number {
  return version;
}

export interface PreflightInputs {
  transform?: OutputTransform;
  /** Reports by the master's file id. */
  masters: ReadonlyMap<string, PrintMasterReport>;
  /** The colour of a bitmap's file, once its bytes have been read. */
  imageColor: (fileId: string) => 'rgb' | 'cmyk' | 'gray' | undefined;
  /** The ICC profile a CMYK JPEG's file carries, once read. */
  imageProfile: (fileId: string) => { hash: string; name: string } | undefined;
  /** The pixel size of a bitmap's file, once its bytes have been read. */
  imageSize: (fileId: string) => { width: number; height: number } | undefined;
  /** The spot inks an SVG names, once its markup has been read. */
  svgInks: (fileId: string) => readonly string[] | undefined;
}

/** The inputs for a config and resources as far as they have loaded,
 *  starting the loads of what is missing. */
export function preflightInputs(raw: PrintConfig | undefined, resources: readonly Resource[]): PreflightInputs {
  const print = resolvePrintConfig(raw);
  const key = `${profileKey(print)}|${print.renderingIntent}|${print.blackPointCompensation}|${print.black.kOnlyNeutrals}`;
  if (!transforms.has(key)) {
    transforms.set(key, null);
    loadPrintProfile(print).then(
      (loaded) => {
        transforms.set(key, printTransform(loaded.profile, print));
        changed();
      },
      () => undefined,
    );
  }
  const reports = new Map<string, PrintMasterReport>();
  if (print.preflight.checkFonts || print.standard !== 'none') {
    for (const r of resources) {
      const id = r.svg?.pdfFileId;
      if (!id) continue;
      if (!masters.has(id)) {
        masters.set(id, null);
        void inspect(id);
      }
      const report = masters.get(id);
      if (report) reports.set(id, report);
    }
  }
  for (const r of resources) {
    const id = r.bitmap?.fileId;
    if (id && !imageColors.has(id)) {
      imageColors.set(id, null);
      void sniffColor(id, r.bitmap?.printFileId);
    }
  }
  for (const r of resources) {
    const id = r.svg?.fileId;
    if (id && !svgInkNames.has(id)) {
      svgInkNames.set(id, null);
      void readSvgInks(id);
    }
  }
  const transform = transforms.get(key) ?? undefined;
  return {
    ...(transform ? { transform } : {}),
    masters: reports,
    imageColor: (id) => imageColors.get(id) ?? undefined,
    imageProfile: (id) => imageProfiles.get(id),
    imageSize: (id) => imageSizes.get(id) ?? undefined,
    svgInks: (id) => svgInkNames.get(id) ?? undefined,
  };
}

/** The colour of a bitmap from its header: a JPEG's component count, a
 *  PNG's colour type; WebP and GIF are RGB. */
export function bitmapColor(bytes: Uint8Array): 'rgb' | 'cmyk' | 'gray' | undefined {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length && bytes[i] === 0xff) {
      const marker = bytes[i + 1]!;
      const len = (bytes[i + 2]! << 8) | bytes[i + 3]!;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        const n = bytes[i + 9];
        return n === 4 ? 'cmyk' : n === 1 ? 'gray' : 'rgb';
      }
      i += 2 + len;
    }
    return undefined;
  }
  if (bytes[0] === 0x89 && bytes[1] === 0x50) {
    // IHDR colour type at byte 25: 0 gray, 4 gray + alpha, else colour.
    const type = bytes[25];
    return type === 0 || type === 4 ? 'gray' : 'rgb';
  }
  if (bytes[0] === 0x52 && bytes[1] === 0x49 || bytes[0] === 0x47 && bytes[1] === 0x49) return 'rgb';
  const format = printRasterFormat(bytes);
  if (format === 'psd') {
    // Colour mode at bytes 24–25: 1 grayscale, 3 RGB, 4 CMYK, 8 duotone.
    const mode = (bytes[24]! << 8) | bytes[25]!;
    return mode === 4 ? 'cmyk' : mode === 1 || mode === 8 ? 'gray' : mode === 3 ? 'rgb' : undefined;
  }
  if (format === 'tiff') return tiffColor(bytes);
  return undefined;
}

/** A TIFF's colour from the first image's PhotometricInterpretation tag:
 *  0/1 grey, 5 separated (CMYK), anything else RGB. Its directory can sit
 *  anywhere in the file, so it wants all of it. */
function tiffColor(bytes: Uint8Array): 'rgb' | 'cmyk' | 'gray' | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const le = bytes[0] === 0x49;
  const ifd = view.getUint32(4, le);
  if (ifd + 2 > bytes.length) return undefined;
  const count = view.getUint16(ifd, le);
  for (let i = 0; i < count; i++) {
    const at = ifd + 2 + i * 12;
    if (at + 12 > bytes.length) return undefined;
    if (view.getUint16(at, le) !== 262) continue;
    const value = view.getUint16(at + 8, le);
    return value === 0 || value === 1 ? 'gray' : value === 5 ? 'cmyk' : 'rgb';
  }
  return undefined;
}

/** A bitmap's colour and pixel size, by its file id. A bitmap imported
 *  from a TIFF or Photoshop original takes its colour from that original
 *  (`printFileId`), which is what prints; the size is the preview's, which
 *  is the same. */
async function sniffColor(fileId: string, printFileId?: string): Promise<void> {
  try {
    const record = await getBlob(fileId);
    if (!record) return;
    const original = printFileId ? await getBlob(printFileId).catch(() => null) : null;
    const color = original
      ? bitmapColor(new Uint8Array(original.bytes))
      : bitmapColor(new Uint8Array(record.bytes, 0, Math.min(record.bytes.byteLength, 65536)));
    const info = bitmapInfo(record.bytes);
    if (info && info.width > 0 && info.height > 0) imageSizes.set(fileId, { width: info.width, height: info.height });
    if (color) imageColors.set(fileId, color);
    // A CMYK JPEG's own profile: one of another press is reported in a
    // PDF/X-1a job, which cannot convert it.
    if (color === 'cmyk' && !original) {
      const icc = embeddedIccProfile(new Uint8Array(record.bytes));
      if (icc) {
        try {
          const profile = parseIccProfile(icc);
          imageProfiles.set(fileId, { hash: profile.hash, name: profile.description || 'ICC' });
        } catch {
          // An unreadable profile says nothing.
        }
      }
    }
    if (color || info) changed();
  } catch {
    // Unreadable: no colour check for it.
  }
}

async function readSvgInks(fileId: string): Promise<void> {
  try {
    const record = await getBlob(fileId);
    if (!record) return;
    const inks = svgSpotInks(new TextDecoder().decode(record.bytes)).map((i) => i.name);
    svgInkNames.set(fileId, inks);
    if (inks.length > 0) changed();
  } catch {
    // Unreadable: its inks are not listed.
  }
}

async function inspect(fileId: string): Promise<void> {
  try {
    const record = await getBlob(fileId);
    if (!record) return;
    // pdf-lib stays out of the main bundle until a master needs it.
    const { inspectPrintMaster } = await import('postext-pdf');
    masters.set(fileId, await inspectPrintMaster(new Uint8Array(record.bytes)));
    changed();
  } catch {
    // An unreadable master is reported by the figure checks.
  }
}
