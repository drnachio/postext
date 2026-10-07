/**
 * What the Checks panel's preflight needs beyond the laid-out document
 * (#605): the separation of the book's output profile (for ink counts and
 * coverage) and the reports of the placed PDF masters (fonts, RGB,
 * transparency). Both load asynchronously; the panel recomputes when
 * either arrives.
 */

import { resolvePrintConfig, type OutputTransform, type PrintConfig, type Resource } from 'postext';
import type { PrintMasterReport } from 'postext-pdf';
import { getBlob } from '../storage/blobStore';
import { loadPrintProfile, printTransform, profileKey } from './printSetup';

const listeners = new Set<() => void>();
let version = 0;
const transforms = new Map<string, OutputTransform | null>();
const masters = new Map<string, PrintMasterReport | null>();
const imageColors = new Map<string, 'rgb' | 'cmyk' | 'gray' | null>();

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
      void sniffColor(id);
    }
  }
  const transform = transforms.get(key) ?? undefined;
  return { ...(transform ? { transform } : {}), masters: reports, imageColor: (id) => imageColors.get(id) ?? undefined };
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
  return undefined;
}

async function sniffColor(fileId: string): Promise<void> {
  try {
    const record = await getBlob(fileId);
    if (!record) return;
    const color = bitmapColor(new Uint8Array(record.bytes, 0, Math.min(record.bytes.byteLength, 65536)));
    if (color) {
      imageColors.set(fileId, color);
      changed();
    }
  } catch {
    // Unreadable: no colour check for it.
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
