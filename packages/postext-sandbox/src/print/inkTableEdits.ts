import { resolveInkFinish } from 'postext';
import type { CmykPercent, PrintConfig, PrintInk } from 'postext';

/*
 * The edits of the ink table (`print.inks`), shared by the Print section's
 * ink cards and anything else that writes the table. A book stores only
 * what it sets: an ink keeps the fields given a value, and a table left
 * empty is removed from `print` (and `print` itself when nothing else is
 * left in it).
 */

/** How an ink overprints: as its colours say (unset), over what is under
 *  it, or knocking it out. */
export type InkOverprint = 'colours' | 'overprint' | 'knockout';

/** `print` with `inks` as its ink table; `undefined` when nothing is left. */
export function withInks(print: PrintConfig | undefined, inks: readonly PrintInk[]): PrintConfig | undefined {
  const next: PrintConfig = { ...print };
  if (inks.length > 0) next.inks = inks.map(normaliseInk);
  else delete next.inks;
  return Object.keys(next).length > 0 ? next : undefined;
}

/** An ink with its unset fields removed: no empty aliases, no blank PDF
 *  name, no `undefined` members. The name is kept as typed. */
export function normaliseInk(ink: PrintInk): PrintInk {
  const out: PrintInk = { name: typeof ink.name === 'string' ? ink.name : '' };
  const aliases = cleanAliases(ink.aliases);
  if (aliases.length > 0) out.aliases = aliases;
  if (typeof ink.pdfName === 'string' && ink.pdfName.trim() !== '') out.pdfName = ink.pdfName;
  if (ink.output === 'spot' || ink.output === 'process') out.output = ink.output;
  if (ink.cmyk) out.cmyk = clampCmyk(ink.cmyk);
  if (typeof ink.overprint === 'boolean') out.overprint = ink.overprint;
  // A finish is kept as written, once checked: an unknown kind is dropped.
  const finish = resolveInkFinish(ink.finish);
  if (finish) out.finish = finish;
  return out;
}

/** The table with a new ink named `name` at its end. */
export function addInk(inks: readonly PrintInk[] | undefined, name = ''): PrintInk[] {
  return [...(inks ?? []), { name }];
}

/** The table with ink `index` changed by `partial`; a member given
 *  `undefined` is removed. */
export function updateInk(inks: readonly PrintInk[], index: number, partial: Partial<PrintInk>): PrintInk[] {
  if (index < 0 || index >= inks.length) return [...inks];
  return inks.map((ink, i) => (i === index ? normaliseInk({ ...ink, ...partial }) : ink));
}

/** The table without ink `index`. */
export function removeInk(inks: readonly PrintInk[], index: number): PrintInk[] {
  return inks.filter((_, i) => i !== index);
}

/** The table with field `key` of ink `index` back to its default. */
export function resetInkField(inks: readonly PrintInk[], index: number, key: Exclude<keyof PrintInk, 'name'>): PrintInk[] {
  return updateInk(inks, index, { [key]: undefined });
}

/** Aliases typed as one comma-separated line: trimmed, without blanks or
 *  repeats (ignoring case). */
export function parseAliases(text: string): string[] {
  return cleanAliases(text.split(','));
}

/** The aliases as the one line `parseAliases` reads back. */
export function formatAliases(aliases: readonly string[] | undefined): string {
  return cleanAliases(aliases).join(', ');
}

function cleanAliases(aliases: readonly unknown[] | undefined): string[] {
  if (!Array.isArray(aliases)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of aliases) {
    if (typeof a !== 'string') continue;
    const t = a.trim();
    const key = t.toLowerCase();
    if (!t || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/** The ink's overprint as the three-way choice of the panel. */
export function inkOverprint(ink: PrintInk): InkOverprint {
  if (ink.overprint === true) return 'overprint';
  if (ink.overprint === false) return 'knockout';
  return 'colours';
}

/** The `overprint` member a choice writes. */
export function overprintValue(choice: InkOverprint): boolean | undefined {
  return choice === 'overprint' ? true : choice === 'knockout' ? false : undefined;
}

/** The table with one channel of ink `index`'s alternate set, starting from
 *  `seed` when the ink had none. */
export function setInkChannel(inks: readonly PrintInk[], index: number, channel: keyof CmykPercent, value: number, seed: CmykPercent): PrintInk[] {
  const ink = inks[index];
  if (!ink) return [...inks];
  return updateInk(inks, index, { cmyk: { ...(ink.cmyk ?? seed), [channel]: value } });
}

/** The names the book's colours use that the table does not list yet,
 *  as a name or an alias (ignoring case and runs of spaces, as the engine
 *  matches them). */
export function unlistedInks(used: readonly string[], inks: readonly PrintInk[] | undefined): string[] {
  const key = inkKey;
  const listed = new Set<string>();
  for (const ink of inks ?? []) {
    listed.add(key(ink.name ?? ''));
    for (const a of ink.aliases ?? []) listed.add(key(a));
  }
  return used.filter((name) => !listed.has(key(name)));
}

/** An ink name as the engine compares them: ignoring case and runs of
 *  spaces. */
export function inkKey(name: string): string {
  return (name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function clampCmyk(c: CmykPercent): CmykPercent {
  const ch = (v: number) => (Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 0);
  return { c: ch(c.c), m: ch(c.m), y: ch(c.y), k: ch(c.k) };
}
