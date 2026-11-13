/**
 * The spot-ink part of the print preflight (#1468): the plates a job adds
 * besides process, from the colours of the configuration and the inks its
 * SVG pictures name, and what is wrong with them — one ink defined twice,
 * a plate name the PDF has to change, names that differ only in case or
 * spacing, and an ink an SVG names that no colour defines.
 */

import type { ResolvedPrintConfig, ResolvedSpotColor } from '../types.js';
import type { VDTDocument } from '../vdt.js';
import { spotInks } from '../color/authored.js';
import { inkEntry, inkKey, inkNameProblem, printableInkName, similarInkNames } from '../color/inks.js';
import { resolveColorValue } from '../defaults/shared.js';
import type { PreflightIssue } from './preflight.js';

export interface SpotInkCheckInput {
  doc: VDTDocument;
  print: ResolvedPrintConfig;
  /** The job's spot colours by screen hex, through the ink table. */
  spots: ReadonlyMap<string, ResolvedSpotColor>;
  /** The inks the pages paint with, found while the colours were checked. */
  usedInks: Set<string>;
  /** The spot inks an SVG picture names, by its file id (`svgSpotInks` on
   *  its markup), when the host has read it. */
  svgInks?: (fileId: string) => readonly string[] | undefined;
  /** Book-absolute index of the document's first page. */
  pageIndex: number;
}

/** The SVG pictures placed in a document: file id, resource id. */
function placedSvgs(doc: VDTDocument): Map<string, string> {
  const out = new Map<string, string>();
  const note = (r: { id: string; kind?: string; svg?: { fileId: string } } | undefined) => {
    const id = r?.svg?.fileId;
    if (r && id && !out.has(id)) out.set(id, r.id);
  };
  for (const block of doc.blocks) note(block.resourceBlock?.resource);
  for (const page of doc.pages) for (const f of page.floats ?? []) note(f.resourceBlock?.resource);
  return out;
}

/** The spot-ink issues of a CMYK job. */
export function spotInkIssues(input: SpotInkCheckInput): PreflightIssue[] {
  const { doc, print, spots, usedInks, pageIndex } = input;
  const out: PreflightIssue[] = [];
  const ds = doc.config.diagramStyle;
  if (ds?.singleInk && ds.inkColor) {
    const ink = resolveColorValue(ds.inkColor, doc.config.colorPalette, ds.inkColor).hex.slice(0, 7).toLowerCase();
    const spot = spots.get(ink);
    if (spot) usedInks.add(spot.name);
  }

  // Inks the SVGs name: on a colour's plate when one has that name (or an
  // alias of it), else on a plate of their own the palette does not know.
  const byKey = new Map<string, string>();
  for (const s of spots.values()) if (!byKey.has(inkKey(s.name))) byKey.set(inkKey(s.name), s.name);
  const svgOnly = new Map<string, { fileId: string; resourceId: string; defined: boolean }>();
  if (input.svgInks) {
    for (const [fileId, resourceId] of placedSvgs(doc)) {
      for (const name of input.svgInks(fileId) ?? []) {
        const entry = inkEntry(name, print.inks);
        if (entry?.output === 'process') continue;
        const plate = entry?.pdfName ?? name;
        const known = byKey.get(inkKey(plate));
        if (known) usedInks.add(known);
        else if (!svgOnly.has(plate)) svgOnly.set(plate, { fileId, resourceId, defined: !!entry?.cmyk });
      }
    }
  }
  if (spots.size === 0 && svgOnly.size === 0) return out;

  const { inks, conflicts } = spotInks(spots.values());
  const used = [...inks.map((i) => i.name).filter((n) => usedInks.has(n)), ...svgOnly.keys()];
  if (used.length > 0) out.push({ kind: 'spotInks', severity: 'info', pageIndex, inks: used });
  for (const ink of conflicts) {
    if (usedInks.has(ink)) out.push({ kind: 'spotInkConflict', severity: 'warning', pageIndex, ink });
  }
  for (const [ink, at] of svgOnly) {
    if (at.defined) continue;
    out.push({ kind: 'spotInkUndefined', severity: 'warning', pageIndex, ink, fileId: at.fileId, resourceId: at.resourceId });
  }
  for (const ink of used) {
    const problem = inkNameProblem(ink);
    if (problem) out.push({ kind: 'spotInkName', severity: 'warning', pageIndex, ink, problem, written: printableInkName(ink) });
  }
  for (const group of similarInkNames(used)) out.push({ kind: 'spotInkSimilar', severity: 'warning', pageIndex, inks: group });
  return out;
}
