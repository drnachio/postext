/**
 * What to check on a cover before it goes to the printer, as the designer
 * and the Cover panel list it:
 *
 * - an item off the sheet, or whose picture is gone;
 * - an item that crosses a fold, a score or a joint by a little (a logo at
 *   all): meant for one panel, it creeps onto the next;
 * - an item that runs into the bleed or the turn-in but stops short of the
 *   sheet's edge, where the trim may leave a white line (unless the mirror
 *   fills that edge for it);
 * - a logo whose clear space leaves its zone's safe area or takes in
 *   another logo; anything over the barcode but the backgrounds;
 * - transparencies (an opacity, a gradient, a shadow) when the PDF is
 *   PDF/X-1a, which flattens them;
 * - a finish with no shape left, off the sheet, or whose plate has no name;
 * - a zone whose text does not fit in it;
 * - an endpaper page with an advertisement, whose inner edge the glue
 *   strip and the hinge hide.
 */

import { isbnBarcodeSvg, type PdfXStandard, type ProductionSheet, type SheetRect, type VDTDocument } from 'postext';
import type { CoverDesignSettings } from './bookProduction.js';
import { elementRect, type CoverElementSetting, type ItemLayer } from './coverLayers.js';

export type CoverCheckKind =
  | 'offSheet'
  | 'missingPicture'
  | 'crossesFold'
  | 'shortOfBleed'
  | 'clearance'
  | 'overBarcode'
  | 'transparency'
  | 'finishNoShape'
  | 'finishOffSheet'
  | 'finishNoInk'
  | 'textOverflow'
  | 'endpaperHinge';

export interface CoverCheck {
  kind: CoverCheckKind;
  /** Must be put right before printing, or worth a look. */
  severity: 'error' | 'warning';
  /** The item, and its layer; a zone for a text that does not fit. */
  id?: string;
  layer?: ItemLayer;
  zone?: string;
  /** How much, mm (the strip an endpaper's hinge hides). */
  mm?: number;
}

const ERRORS: ReadonlySet<CoverCheckKind> = new Set(['offSheet', 'missingPicture', 'overBarcode', 'finishNoShape', 'finishOffSheet', 'textOverflow']);

/** How near an edge counts as on it, mm. */
const EPS = 0.2;

const overlaps = (a: SheetRect, b: SheetRect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const area = (r: SheetRect) => Math.max(0, r.width) * Math.max(0, r.height);
const inside = (a: SheetRect, b: SheetRect) => a.x >= b.x - EPS && a.y >= b.y - EPS && a.x + a.width <= b.x + b.width + EPS && a.y + a.height <= b.y + b.height + EPS;
const grow = (r: SheetRect, by: number): SheetRect => ({ x: r.x - by, y: r.y - by, width: r.width + 2 * by, height: r.height + 2 * by });

/** The zones whose text does not fit, by the laid-out sheet's warnings. */
export const overflowZones = (doc: VDTDocument): string[] =>
  (doc.contentWarnings ?? []).flatMap((w) => (w.kind === 'frameOverflow' ? [w.frame] : []));

/** Where the barcode goes: the back cover's safe corner by the spine and
 *  the foot, as the sheet lays it (`coverPage`). */
export function barcodeRect(sheet: ProductionSheet, isbn: string | undefined, options: { addOn?: string; magnification?: number } = {}): SheetRect | undefined {
  const back = sheet.zones.find((z) => z.name === 'back');
  const code = isbn && back ? isbnBarcodeSvg(isbn, { ...(options.addOn ? { addOn: options.addOn } : {}), ...(options.magnification ? { magnification: options.magnification } : {}) }) : undefined;
  if (!back || !code) return undefined;
  const s = back.safe;
  return { x: s.x + s.width - code.width, y: s.y + s.height - code.height, width: code.width, height: code.height };
}

export function coverChecks(sheet: ProductionSheet, design: CoverDesignSettings | undefined, options: {
  /** The ids of the pictures the cover can draw (the book's, the gallery's,
   *  the logo library's). */
  pictures: ReadonlySet<string>;
  isbn?: string;
  isbnAddOn?: string;
  /** The PDF's standard: transparencies are flagged under PDF/X-1a. */
  standard?: PdfXStandard;
  /** Whether the sheet has a mirror bleed (a case's turn-in). */
  mirror?: boolean;
  /** The zones whose text overflows its frame (the laid-out sheet's
   *  `frameOverflow` warnings). */
  overflow?: readonly string[];
  /** An endpaper's pages that carry an advertisement: the glue strip and
   *  the hinge hide its inner edge. */
  endpaperAds?: readonly string[];
}): CoverCheck[] {
  const out: CoverCheck[] = [];
  const add = (kind: CoverCheckKind, at: Omit<CoverCheck, 'kind' | 'severity'> = {}) =>
    out.push({ kind, severity: ERRORS.has(kind) ? 'error' : 'warning', ...at });
  const sheetRect = { x: 0, y: 0, width: sheet.width, height: sheet.height };
  const barcode = barcodeRect(sheet, options.isbn, { ...(options.isbnAddOn ? { addOn: options.isbnAddOn } : {}) });
  const layers: [ItemLayer, readonly CoverElementSetting[]][] = [
    ['elements', design?.elements ?? []],
    ['effects', design?.effects ?? []],
    ['logos', design?.logos ?? []],
  ];
  const rects = new Map<string, SheetRect>();

  for (const [layer, list] of layers) {
    for (const el of list) {
      const r = elementRect(sheet, el);
      const at = { id: el.id, layer };
      if (!r || !overlaps(r, sheetRect)) {
        add('offSheet', at);
        continue;
      }
      rects.set(el.id, r);
      if (el.kind === 'image' && el.resourceId && !options.pictures.has(el.resourceId)) add('missingPicture', at);

      // Across a fold by a little: most of it on one side.
      for (const line of sheet.lines) {
        // A case's board edges fold over into the turn-in, where the
        // design is meant to run.
        if (Math.abs(line.x - sheet.trim.x) < EPS || Math.abs(line.x - sheet.trim.x - sheet.trim.width) < EPS) continue;
        const leftPart = line.x - r.x;
        const rightPart = r.x + r.width - line.x;
        if (leftPart <= EPS || rightPart <= EPS) continue;
        const most = Math.max(leftPart, rightPart) / r.width;
        if (layer === 'logos' || most >= 0.85) {
          add('crossesFold', at);
          break;
        }
      }

      // Into the bleed but short of the edge (the mirror fills it, unless
      // the item keeps its own bleed).
      if (layer !== 'logos' && !(options.mirror && layer === 'elements' && el.bleed !== 'own')) {
        const t = sheet.trim;
        const short =
          (r.x < t.x - EPS && r.x > EPS) ||
          (r.y < t.y - EPS && r.y > EPS) ||
          (r.x + r.width > t.x + t.width + EPS && r.x + r.width < sheet.width - EPS) ||
          (r.y + r.height > t.y + t.height + EPS && r.y + r.height < sheet.height - EPS);
        if (short) add('shortOfBleed', at);
      }

      // Transparencies, which PDF/X-1a flattens.
      if (options.standard === 'pdfx1a' && ((el.opacity !== undefined && el.opacity < 1) || el.gradient || el.shadow)) add('transparency', at);
    }
  }

  // Logos: their clear space within the safe area of their zone, clear of
  // the other logos and of the barcode.
  for (const logo of design?.logos ?? []) {
    const r = rects.get(logo.id);
    if (!r) continue;
    const clear = grow(r, logo.clearance);
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;
    const zone = sheet.zones.find((z) => cx >= z.rect.x && cx <= z.rect.x + z.rect.width && cy >= z.rect.y && cy <= z.rect.y + z.rect.height);
    const others = (design?.logos ?? []).filter((o) => o.id !== logo.id).map((o) => rects.get(o.id)).filter((x): x is SheetRect => !!x);
    if ((zone && !inside(clear, zone.safe)) || others.some((o) => overlaps(clear, o))) add('clearance', { id: logo.id, layer: 'logos' });
  }

  // Over the barcode: anything but a background (an element covering most
  // of the back cover).
  if (barcode) {
    const back = sheet.zones.find((z) => z.name === 'back')!;
    for (const [layer, list] of layers) {
      for (const el of list) {
        const r = rects.get(el.id);
        if (!r || !overlaps(r, barcode)) continue;
        if (layer === 'elements' && area(r) >= area(back.rect) * 0.25) continue;
        add('overBarcode', { id: el.id, layer });
      }
    }
  }

  // Finishes.
  const all = new Set([...(design?.elements ?? []), ...(design?.effects ?? []), ...(design?.logos ?? [])].map((e) => e.id));
  for (const f of design?.finishes ?? []) {
    const at = { id: f.id, layer: 'finishes' as const };
    if (!f.ink.trim()) add('finishNoInk', at);
    if ('element' in f.shape) {
      if (!all.has(f.shape.element)) add('finishNoShape', at);
      continue;
    }
    const r = elementRect(sheet, { id: f.id, kind: 'box', ...f.shape.box });
    if (!r || !overlaps(r, sheetRect)) add('finishOffSheet', at);
  }

  for (const zone of new Set(options.overflow ?? [])) add('textOverflow', { zone });
  const hinge = sheet.zones.find((z) => z.name === 'hinge');
  if (hinge) for (const zone of options.endpaperAds ?? []) add('endpaperHinge', { zone, mm: Math.round((hinge.rect.width / 2) * 10) / 10 });
  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1));
}
