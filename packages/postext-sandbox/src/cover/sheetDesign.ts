// A design per sheet (#1673): the case under a jacket, the jacket and the
// endpapers may each take a design of their own (`cover.sheets`) in place
// of the book's cover design. The designer, the Design panel's Cover
// design group and the tools edit the design the shown sheet is drawn
// with: its own when it has one, else the book's. Pure, so the panels and
// the tools write the same thing.

import { coverSheetNames, type CoverConfig, type CoverSheetDesign, type CoverSheetKind, type CoverSheetName, type ProductionSheet } from 'postext/production';

/** The names the shown sheet answers to, most particular first (what
 *  `buildCover` reads): `case` then `cover` for a case, `endpaperFront`
 *  then `endpapers` for the front endpaper… A sheet not built yet is taken
 *  for the book's cover. */
export function shownSheetNames(kind: CoverSheetKind, sheet: ProductionSheet | undefined): CoverSheetName[] {
  return coverSheetNames(kind, sheet ?? ({ kind: 'softcover' } as ProductionSheet));
}

/** The designs of their own the shown sheet may take, most particular
 *  first: none for a paperback's cover (its design is the book's). */
export function sheetDesignChoices(names: readonly CoverSheetName[]): CoverSheetName[] {
  return names.filter((n) => n !== 'cover');
}

/** The design of their own the sheet is drawn with, by its name; `null`
 *  when it takes the book's. */
export function sheetDesignTarget(cover: CoverConfig | undefined, names: readonly CoverSheetName[]): CoverSheetName | null {
  return names.find((n) => !!cover?.sheets?.[n]) ?? null;
}

/** The book's cover design, without the sheets' own. */
export function bookDesign(cover: CoverConfig | undefined): CoverSheetDesign {
  const base: CoverConfig = { ...cover };
  delete base.sheets;
  return base;
}

/** The design a target names: a sheet's own, or the book's (`null`). */
export function designOf(cover: CoverConfig | undefined, target: CoverSheetName | null): CoverSheetDesign {
  return (target ? cover?.sheets?.[target] : undefined) ?? bookDesign(cover);
}

function withSheets(base: CoverSheetDesign, sheets: CoverConfig['sheets']): CoverConfig | undefined {
  const next: CoverConfig = sheets && Object.keys(sheets).length > 0 ? { ...base, sheets } : { ...base };
  return Object.keys(next).length > 0 ? next : undefined;
}

/** The cover with a target's design replaced: the book's (`null`) keeps
 *  the sheets' own designs, a sheet's keeps the book's. */
export function withDesign(cover: CoverConfig | undefined, target: CoverSheetName | null, design: CoverSheetDesign | undefined): CoverConfig | undefined {
  const own = bookDesign(design as CoverConfig | undefined);
  if (!target) return withSheets(own, cover?.sheets);
  return withSheets(bookDesign(cover), { ...cover?.sheets, [target]: own });
}

/**
 * The cover with the shown sheet set to draw with `target`: `null` takes
 * the book's design again (the sheet's own designs are dropped); a name
 * gives the sheet that design of its own, a copy of the book's when it has
 * none yet, and drops the more particular ones that would hide it.
 */
export function chooseSheetDesign(cover: CoverConfig | undefined, names: readonly CoverSheetName[], target: CoverSheetName | null): CoverConfig | undefined {
  const choices = sheetDesignChoices(names);
  const sheets: Partial<Record<CoverSheetName, CoverSheetDesign>> = { ...cover?.sheets };
  const upTo = target ? choices.indexOf(target) : choices.length;
  for (const n of choices.slice(0, upTo)) delete sheets[n];
  if (target && !sheets[target]) sheets[target] = structuredClone(bookDesign(cover));
  return withSheets(bookDesign(cover), sheets);
}
