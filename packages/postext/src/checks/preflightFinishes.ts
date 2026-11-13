/**
 * The special-ink part of the print preflight (#1563): what each special
 * ink of the job is, the order the press lays them in, and a white ink
 * printed on white paper, where it shows nothing.
 */

import type { InkFinishKind, InkSheen, ResolvedSpotColor } from '../types.js';
import type { VDTDocument } from '../vdt.js';
import type { FinishInk } from '../color/finishInks.js';
import { finishSheen } from '../color/finishKinds.js';
import { pagePaintsFinish } from '../canvas-backend/finish/mask.js';
import type { PreflightIssue } from './preflight.js';

export interface FinishCheckInput {
  doc: VDTDocument;
  /** The job's spot colours by screen hex, through the ink table. */
  spots: ReadonlyMap<string, ResolvedSpotColor>;
  /** The spot inks the pages paint with, by plate name. */
  usedInks: ReadonlySet<string>;
  /** Book-absolute index of the document's first page. */
  pageIndex: number;
}

/** A paper that is white or unset: a white ink on it shows nothing. */
function whitePaper(hex: string | undefined): boolean {
  if (!hex || hex === 'transparent') return true;
  const h = hex.trim().toLowerCase();
  if (/^#[0-9a-f]{8}$/.test(h) && h.endsWith('00')) return true;
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/.exec(h);
  // Within a few steps of white: a paper picked as "white" on screen.
  return !!m && [m[1]!, m[2]!, m[3]!].every((c) => parseInt(c, 16) >= 0xf8);
}

/** The special-ink issues of a CMYK job. */
export function finishIssues(input: FinishCheckInput): PreflightIssue[] {
  const { doc, spots, usedInks, pageIndex } = input;
  const out: PreflightIssue[] = [];
  /** Special inks the pages use, by plate, with their finish. */
  const used = new Map<string, { kind: InkFinishKind; sheen?: InkSheen }>();
  const whites = new Map<string, FinishInk>();
  /** Whether a page paints `hex` somewhere, its paper included: the
   *  colour checks do not look at the paper, which a white ink often is. */
  const painted = (hex: string, ink: ResolvedSpotColor): boolean => {
    const one = new Map([[hex, { ...ink.finish!, tint: ink.tint, name: ink.name, overprint: ink.overprint }]]);
    return doc.pages.some((page) => pagePaintsFinish(page, one, page.background ?? doc.config.page.backgroundColor?.hex));
  };
  for (const [hex, s] of spots) {
    if (!s.finish || !(usedInks.has(s.name) || painted(hex, s))) continue;
    if (!used.has(s.name)) {
      const sheen = finishSheen(s.finish);
      used.set(s.name, { kind: s.finish.kind, ...(sheen ? { sheen } : {}) });
    }
    if (s.finish.kind === 'white') whites.set(hex, { ...s.finish, tint: s.tint, name: s.name, overprint: s.overprint });
  }
  if (used.size === 0) return out;
  for (const [ink, f] of used) out.push({ kind: 'spotInkFinish', severity: 'info', pageIndex, ink, finish: f.kind, ...(f.sheen ? { sheen: f.sheen } : {}) });

  // The order the press lays them in: a white under the colours, a
  // varnish over them.
  const first = [...used].filter(([, f]) => f.kind === 'white').map(([n]) => n);
  const last = [...used].filter(([, f]) => f.kind === 'varnish').map(([n]) => n);
  if (first.length > 0 || last.length > 0) out.push({ kind: 'inkPressOrder', severity: 'info', pageIndex, first, last });

  // A white ink on white paper, once per ink, on the first page it shows.
  if (whites.size > 0) {
    const offset = doc.pageIndexOffset ?? 0;
    const reported = new Set<string>();
    for (const page of doc.pages) {
      const paper = page.background ?? doc.config.page.backgroundColor?.hex;
      if (!whitePaper(paper)) continue;
      for (const [hex, ink] of whites) {
        if (reported.has(ink.name)) continue;
        // The paper itself is not where the ink shows on white: its marks are.
        if (!pagePaintsFinish(page, new Map([[hex, ink]]), undefined)) continue;
        reported.add(ink.name);
        out.push({ kind: 'whiteInkOnWhite', severity: 'warning', pageIndex: page.index + offset, ink: ink.name, color: hex });
      }
      if (reported.size === new Set([...whites.values()].map((w) => w.name)).size) break;
    }
  }
  return out;
}
