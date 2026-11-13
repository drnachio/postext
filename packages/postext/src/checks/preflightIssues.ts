/**
 * What the print preflight (`preflight.ts`) reports: one variant per kind
 * of problem, with where it is.
 */

import type { InkFinishKind, InkSheen } from '../types.js';
import type { BoundingBox } from '../vdt.js';
import type { InkNameProblem } from '../color/inks.js';

/** How much a preflight problem matters. */
export type PreflightSeverity = 'critical' | 'warning' | 'info';

/** A problem preflight found, and where. */
export type PreflightIssue = {
  severity: PreflightSeverity;
  /** Book-absolute page index (`pageIndexOffset` counted in). */
  pageIndex: number;
  /** The offending area, page px. */
  rect?: BoundingBox;
  /** Source range in the chapter markdown, when the element has one. */
  sourceStart?: number;
  sourceEnd?: number;
} & (
  | { kind: 'lowImageResolution'; fileId: string; resourceId?: string; ppi: number; minimum: number }
  /** A bitmap that declares a pixel size its file does not have (more
   *  than a pixel off either way): its print size and resolution are
   *  worked out from the declaration. Reported once, where it is first
   *  placed; `warning` when the declaration exceeds the file. */
  | { kind: 'declaredPixelsMismatch'; fileId: string; resourceId?: string; declared: { width: number; height: number }; actual: { width: number; height: number } }
  | { kind: 'rgbImage'; fileId: string; resourceId?: string; converted: boolean }
  /** A CMYK JPEG separated for another press condition (its profile) in a
   *  PDF/X-1a job: its pixels are not decoded and PDF/X-1a allows no
   *  ICC-based picture, so it prints its values as they are. */
  | { kind: 'cmykImageForeign'; fileId: string; resourceId?: string; profile: string }
  | { kind: 'thinRule'; widthPt: number; minimumPt: number; color: string }
  | { kind: 'smallProcessText'; sizePt: number; inks: number; color: string; text: string }
  | { kind: 'inkLimit'; color: string; coverage: number; limit: number }
  /** The spot inks the job prints with besides process, once per
   *  document (info). */
  | { kind: 'spotInks'; inks: string[] }
  /** One ink defined twice with a different CMYK or overprint: the PDF
   *  writes the first, and the printer would be asked for two plates of
   *  one name. */
  | { kind: 'spotInkConflict'; ink: string }
  /** A plate name a PDF cannot carry as it is: `All` or `None` (every
   *  plate, no plate), a process plate's name, a control character, or
   *  longer than 127 bytes. The PDF writes it as `written` instead
   *  (`printableInkName`). */
  | { kind: 'spotInkName'; ink: string; problem: InkNameProblem; written: string }
  /** An ink an SVG picture names (`icc-named-color`, `data-spot`) that no
   *  colour of the configuration and no `print.inks` entry with a `cmyk`
   *  defines: it prints on a plate of its own, with the SVG's colour as
   *  its alternate. */
  | { kind: 'spotInkUndefined'; ink: string; fileId: string; resourceId?: string }
  /** Plate names that differ only in case or spacing: most likely one ink
   *  the printer would get two plates of. An alias in `print.inks` merges
   *  them. */
  | { kind: 'spotInkSimilar'; inks: string[] }
  /** A special ink the job prints with and what it is (#1563), once per
   *  ink (info). */
  | { kind: 'spotInkFinish'; ink: string; finish: InkFinishKind; sheen?: InkSheen }
  /** The order the press lays the special inks in: the white inks first,
   *  under the colours, the varnishes last, over them (info). */
  | { kind: 'inkPressOrder'; first: string[]; last: string[] }
  /** A white ink on a page whose paper is white or unset: it shows
   *  nothing there. Once per ink, on the first such page. */
  | { kind: 'whiteInkOnWhite'; ink: string; color: string }
  /** A colour that overprints (`ColorValue.overprint`) and puts no ink
   *  down (paper white, a spot at 0 %): on press it disappears. A white
   *  ink and a varnish put down no colour on purpose and are not
   *  reported. */
  | { kind: 'overprintWhite'; color: string }
  /** The plates a restricted job prints on (`print.plates`), and those
   *  its pictures print on, once per document (info). */
  | { kind: 'platesJob'; plates: string[]; images: string[] }
  /** A spot ink a colour of the book uses that the job does not print:
   *  its colours are projected onto the job's plates, the ink lost.
   *  `deltaE`: how far the farthest lands from its ink (CIE76), when the
   *  output profile is known; information up to `PLATE_DELTA_E`. */
  | { kind: 'offPlateInk'; ink: string; deltaE?: number }
  /** A colour authored in CMYK whose channels the job does not print. */
  | { kind: 'offPlateCmyk'; color: string; channels: string[]; deltaE?: number }
  /** A screen colour the job's plates cannot come within `PLATE_DELTA_E`
   *  of (a warning). */
  | { kind: 'offPlateColor'; color: string; deltaE: number }
  /** A spot plate of the job that neither a colour nor the ink table
   *  defines: nothing says what it looks like (its alternate). */
  | { kind: 'plateUndefined'; plate: string }
  | { kind: 'safeZone'; distanceMm: number; safeZoneMm: number; text: string }
  | { kind: 'nearTrim'; gapMm: number; edge: 'top' | 'right' | 'bottom' | 'left' }
  /** Text within its hole's wrap gap of a die-cut edge, or under the hole
   *  (#1565): `distanceMm` from the edge (0: over it). */
  | { kind: 'dieCutText'; die: string; text: string; distanceMm: number }
  /** A hole past the trim (critical, `distanceMm` below 0) or within 3 mm
   *  of it (warning). */
  | { kind: 'dieCutTrim'; die: string; distanceMm: number }
  /** A hole that reaches the spine fold. */
  | { kind: 'dieCutGutter'; die: string }
  /** A page or a `:::diecut` names a die the config does not have. */
  | { kind: 'dieCutUnknown'; die: string }
);

/** The kinds of problem preflight reports. */
export type PreflightKind = PreflightIssue['kind'];

