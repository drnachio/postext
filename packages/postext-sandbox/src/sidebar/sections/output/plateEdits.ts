/**
 * Edits of a job's plates (`print.plates`, #1476) as the Print section's
 * Plates group makes them: the plates the panel offers, a plate switched
 * on or off, the picture plates, and a tone curve written as text.
 */

import { authoredSpotColors, inkEntry, inkKey, resolvePrintInks, spotInks } from 'postext';
import type { PostextConfig, PrintConfig, PrintPlatesConfig } from 'postext';

export const PROCESS_PLATES = ['Cyan', 'Magenta', 'Yellow', 'Black'] as const;

/** The spot plates the panel offers: the inks the book's colours use and
 *  the spot inks of the ink table, each as its plate is named in the PDF,
 *  then any other plate the job already names. */
export function offeredSpotPlates(config: PostextConfig): string[] {
  const table = config.print?.inks ?? [];
  const out: string[] = [];
  const add = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || PROCESS_PLATES.some((p) => inkKey(p) === inkKey(trimmed))) return;
    if (!out.some((n) => inkKey(n) === inkKey(trimmed))) out.push(trimmed);
  };
  const resolved = resolvePrintInks(table);
  const tableEntry = (name: string) => inkEntry(name, resolved);
  for (const ink of spotInks(authoredSpotColors(config).values()).inks) {
    const entry = tableEntry(ink.name);
    if (entry?.output === 'process') continue;
    add(entry ? entry.pdfName : ink.name);
  }
  for (const ink of resolved) if (ink.output === 'spot') add(ink.pdfName);
  for (const name of config.print?.plates?.inks ?? []) add(tableEntry(name)?.pdfName ?? name);
  return out;
}

/** Whether the job prints on `plate`. */
export function hasPlate(plates: PrintPlatesConfig | undefined, plate: string): boolean {
  return (plates?.inks ?? []).some((n) => inkKey(n) === inkKey(plate));
}

/** `print` with `plates` in it, or without it when it names no plate. */
export function withPlates(print: PrintConfig | undefined, plates: PrintPlatesConfig | undefined): PrintConfig | undefined {
  const next: PrintConfig = { ...print };
  if (plates && (plates.inks?.length ?? 0) > 0) next.plates = plates;
  else delete next.plates;
  return Object.keys(next).length > 0 ? next : undefined;
}

/** The plates with `plate` switched on or off. Switching the last plate
 *  off prints on every plate again; a picture plate or a curve of a plate
 *  switched off goes with it. */
export function togglePlate(plates: PrintPlatesConfig | undefined, plate: string, on: boolean): PrintPlatesConfig | undefined {
  const kept = (plates?.inks ?? []).filter((n) => inkKey(n) !== inkKey(plate));
  if (on) kept.push(plate);
  if (kept.length === 0) return undefined;
  const next: PrintPlatesConfig = { ...plates, inks: kept };
  if (!on) {
    const images = (plates?.images ?? []).filter((n) => inkKey(n) !== inkKey(plate));
    if (images.length > 0) next.images = images;
    else delete next.images;
    const curves = Object.fromEntries(Object.entries(plates?.curves ?? {}).filter(([n]) => inkKey(n) !== inkKey(plate)));
    if (Object.keys(curves).length > 0) next.curves = curves;
    else delete next.curves;
  }
  return next;
}

/** The plates with the picture plates set: one makes a monotone, two a
 *  duotone; none falls back to the default. */
export function setImagePlates(plates: PrintPlatesConfig, images: readonly string[]): PrintPlatesConfig {
  const list = images.filter((n, i) => n && images.findIndex((m) => inkKey(m) === inkKey(n)) === i).slice(0, 2);
  const next: PrintPlatesConfig = { ...plates };
  if (list.length > 0) next.images = list;
  else delete next.images;
  return next;
}

/** A curve as text: `tone ink` pairs in percent, comma separated. */
export function formatCurve(points: ReadonlyArray<readonly [number, number]> | undefined): string {
  return (points ?? []).map(([x, y]) => `${x} ${y}`).join(', ');
}

/** The points a curve's text gives; pairs that do not read are skipped. */
export function parseCurve(text: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const part of text.split(/[,;]/)) {
    const nums = part.trim().split(/\s+/).map(Number);
    if (nums.length === 2 && nums.every(Number.isFinite)) out.push([nums[0]!, nums[1]!]);
  }
  return out;
}

/** The plates with the curve of `plate` set from text (empty: the
 *  default curve). */
export function setCurve(plates: PrintPlatesConfig, plate: string, text: string): PrintPlatesConfig {
  const curves = Object.fromEntries(Object.entries(plates.curves ?? {}).filter(([n]) => inkKey(n) !== inkKey(plate)));
  const points = parseCurve(text);
  if (points.length > 0) curves[plate] = points;
  const next: PrintPlatesConfig = { ...plates };
  if (Object.keys(curves).length > 0) next.curves = curves;
  else delete next.curves;
  return next;
}
