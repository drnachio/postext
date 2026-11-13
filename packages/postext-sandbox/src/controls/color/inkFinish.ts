import type { CmykPercent, ColorPaletteEntry, InkFinish, InkFinishKind, InkSheen } from 'postext';
import type { SandboxLabels } from '../../types/labels.js';

/*
 * Special inks in the Sandbox (#1570): the finish and sheen choices the
 * colour picker's Spot tab and the ink table offer, and the generic special
 * inks the palette can add in one click. No swatch-book data is shipped:
 * each preset is a plausible screen colour and alternate, named the way a
 * printer would understand, for the reader to rename after their own
 * printer's swatch.
 */

export const FINISH_KINDS: readonly InkFinishKind[] = ['metallic', 'foil', 'fluorescent', 'white', 'varnish'];
export const INK_SHEENS: readonly InkSheen[] = ['gloss', 'satin', 'matte', 'softTouch'];

/** A finish choice as the selects spell it: a kind, or `'none'`. */
export type FinishChoice = InkFinishKind | 'none';

/** The sheens a finish of `kind` can take: none for a fluorescent or white
 *  ink, soft touch for a varnish only. */
export function sheensFor(kind: InkFinishKind | undefined): readonly InkSheen[] {
  if (kind === 'varnish') return INK_SHEENS;
  if (kind === 'metallic' || kind === 'foil') return INK_SHEENS.filter((s) => s !== 'softTouch');
  return [];
}

/** The finish a choice of kind writes, keeping the sheen it had when the
 *  new kind can carry it. `'none'` writes no finish. */
export function finishWithKind(current: InkFinish | undefined, choice: FinishChoice): InkFinish | undefined {
  if (choice === 'none') return undefined;
  const out: InkFinish = { kind: choice };
  if (current?.sheen && sheensFor(choice).includes(current.sheen)) out.sheen = current.sheen;
  return out;
}

/** The finish with its sheen set (`undefined`: back to the kind's default). */
export function finishWithSheen(current: InkFinish, sheen: InkSheen | undefined): InkFinish {
  const out: InkFinish = { kind: current.kind };
  if (sheen && sheensFor(current.kind).includes(sheen)) out.sheen = sheen;
  return out;
}

/** Whether two finishes say the same (both absent included). */
export function sameFinish(a: InkFinish | undefined, b: InkFinish | undefined): boolean {
  return (a?.kind ?? null) === (b?.kind ?? null) && (a?.sheen ?? null) === (b?.sheen ?? null);
}

export function finishKindLabel(kind: FinishChoice, labels: SandboxLabels): string {
  switch (kind) {
    case 'none': return labels.inkFinishNone;
    case 'metallic': return labels.inkFinishMetallic;
    case 'foil': return labels.inkFinishFoil;
    case 'fluorescent': return labels.inkFinishFluorescent;
    case 'white': return labels.inkFinishWhite;
    case 'varnish': return labels.inkFinishVarnish;
  }
}

export function sheenLabel(sheen: InkSheen, labels: SandboxLabels): string {
  switch (sheen) {
    case 'gloss': return labels.inkSheenGloss;
    case 'satin': return labels.inkSheenSatin;
    case 'matte': return labels.inkSheenMatte;
    case 'softTouch': return labels.inkSheenSoftTouch;
  }
}

/** A finish in words: `Metallic`, `Varnish, matte`. */
export function finishText(finish: InkFinish, labels: SandboxLabels): string {
  const kind = finishKindLabel(finish.kind, labels);
  return finish.sheen && sheensFor(finish.kind).includes(finish.sheen) ? `${kind}, ${sheenLabel(finish.sheen, labels).toLocaleLowerCase()}` : kind;
}

/** One generic special ink the palette can add. */
export interface SpecialInkPreset {
  id: string;
  /** The label that names the ink, in the interface's language: it
   *  becomes the ink's (and the palette entry's) name. */
  labelKey: keyof SandboxLabels;
  finish: InkFinish;
  /** Its colour on screen. */
  hex: string;
  /** Its alternate: how proofs and a process job show it. */
  cmyk: CmykPercent;
}

const cmyk = (c: number, m: number, y: number, k: number): CmykPercent => ({ c, m, y, k });

/** The special inks offered, in the menu's order. The screen colours are
 *  the usual impressions of each ink, the alternates the CMYK a printer
 *  would proof it with; neither is any maker's swatch. */
export const SPECIAL_INK_PRESETS: readonly SpecialInkPreset[] = [
  { id: 'metallic-gold', labelKey: 'specialInkMetallicGold', finish: { kind: 'metallic' }, hex: '#b39249', cmyk: cmyk(0, 20, 60, 30) },
  { id: 'metallic-silver', labelKey: 'specialInkMetallicSilver', finish: { kind: 'metallic' }, hex: '#a7a9ac', cmyk: cmyk(0, 0, 0, 40) },
  { id: 'metallic-copper', labelKey: 'specialInkMetallicCopper', finish: { kind: 'metallic' }, hex: '#a8643c', cmyk: cmyk(0, 50, 70, 30) },
  { id: 'gold-foil', labelKey: 'specialInkGoldFoil', finish: { kind: 'foil' }, hex: '#c9a54e', cmyk: cmyk(0, 15, 60, 20) },
  { id: 'silver-foil', labelKey: 'specialInkSilverFoil', finish: { kind: 'foil' }, hex: '#c3c5c8', cmyk: cmyk(0, 0, 0, 25) },
  { id: 'fluo-pink', labelKey: 'specialInkFluoPink', finish: { kind: 'fluorescent' }, hex: '#ff3ea5', cmyk: cmyk(0, 80, 0, 0) },
  { id: 'fluo-yellow', labelKey: 'specialInkFluoYellow', finish: { kind: 'fluorescent' }, hex: '#eef33a', cmyk: cmyk(5, 0, 90, 0) },
  { id: 'fluo-orange', labelKey: 'specialInkFluoOrange', finish: { kind: 'fluorescent' }, hex: '#ff6b2c', cmyk: cmyk(0, 65, 90, 0) },
  { id: 'fluo-green', labelKey: 'specialInkFluoGreen', finish: { kind: 'fluorescent' }, hex: '#4be04b', cmyk: cmyk(60, 0, 90, 0) },
  { id: 'opaque-white', labelKey: 'specialInkOpaqueWhite', finish: { kind: 'white' }, hex: '#ffffff', cmyk: cmyk(0, 0, 0, 0) },
  { id: 'gloss-varnish', labelKey: 'specialInkGlossVarnish', finish: { kind: 'varnish', sheen: 'gloss' }, hex: '#e6e6e6', cmyk: cmyk(0, 0, 0, 10) },
  { id: 'matte-varnish', labelKey: 'specialInkMatteVarnish', finish: { kind: 'varnish', sheen: 'matte' }, hex: '#e6e6e6', cmyk: cmyk(0, 0, 0, 10) },
  { id: 'soft-touch-varnish', labelKey: 'specialInkSoftTouchVarnish', finish: { kind: 'varnish', sheen: 'softTouch' }, hex: '#e6e6e6', cmyk: cmyk(0, 0, 0, 10) },
];

/** The palette entry a preset adds: a spot colour of the ink at 100 %,
 *  named `name` (the preset's label in the interface's language, unless a
 *  palette entry already has that name: then a number is added). */
export function specialInkEntry(preset: SpecialInkPreset, name: string, id: string, palette: readonly ColorPaletteEntry[] = []): ColorPaletteEntry {
  const taken = new Set(palette.map((e) => e.name.trim().toLocaleLowerCase()));
  let unique = name;
  for (let n = 2; taken.has(unique.toLocaleLowerCase()); n++) unique = `${name} ${n}`;
  return {
    id,
    name: unique,
    value: {
      hex: preset.hex,
      model: 'spot',
      spot: { name: unique, cmyk: { ...preset.cmyk }, tint: 100, finish: { ...preset.finish } },
    },
  };
}
