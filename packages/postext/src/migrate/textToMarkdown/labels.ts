// Design texts over a picture turned into label anchors on its resource,
// each with a label style of its look (#918) (#1276: split out of
// textToMarkdown.ts).
import type { Resource, ResourceAnchor } from '../../types.js';
import type { LabelStyle } from '../../composed/types.js';
import { bitmapLayoutSize } from '../../bitmapResolution.js';
import { stableStringify } from '../../util/stableHash.js';
import { type TextPiece, toMm, type PlannedPicture } from '../pageDesign.js';
import { type Design, type TextMigrationReport, slug, freeId } from './types.js';

/** The pitch of a label's lines in ems when its style lends none
 *  (composed/labels.ts `LABEL_LINE_HEIGHT`). */
const LABEL_PITCH = 1.15;
/** Where a line's baseline stands in its line box, from the top: design
 *  texts and labels alike (`lineHeight × 0.8`). */
const BASELINE = 0.8;

const round5 = (v: number): number => Math.round(v * 1e5) / 1e5;

/** The label style of a design text's look: the book's own when one sets
 *  exactly that, else a new one. */
function labelStyleFields(piece: TextPiece): Omit<LabelStyle, 'id' | 'name'> {
  const el = piece.element;
  const sizeMm = toMm(el.fontSize) ?? 4.2;
  const tracking = el.letterSpacing ? (toMm(el.letterSpacing, sizeMm) ?? 0) / sizeMm : 0;
  const stroke = el.stroke && !el.stroke.hollow && (toMm(el.stroke.width, sizeMm) ?? 0) > 0 ? el.stroke : undefined;
  return {
    ...(piece.look.fontFamily ? { fontFamily: piece.look.fontFamily } : {}),
    fontSize: piece.look.fontSize,
    fontWeight: piece.look.fontWeight,
    ...(piece.look.italic ? { fontStyle: 'italic' as const } : {}),
    ...(piece.look.color ? { color: piece.look.color } : {}),
    ...(piece.look.uppercase ? { textTransform: 'uppercase' as const } : {}),
    ...(Math.abs(tracking) > 1e-6 ? { letterSpacing: round5(tracking) } : {}),
    ...(stroke ? { halo: { color: stroke.color ?? piece.look.color ?? { hex: '#ffffff', model: 'hex' }, width: stroke.width } } : {}),
  } as Omit<LabelStyle, 'id' | 'name'>;
}

/**
 * The anchors of the labels (#918): one per label on its picture's
 * resource, at the point the design text stood (its alignment's side,
 * its first baseline where the design set it), as wide as its box, with a
 * label style of its look. A picture shown on several pages shares its
 * anchors: the same text at the same place is one anchor.
 */
export function placeLabels(designs: readonly Design[], resources: readonly Resource[], labelStyles: LabelStyle[], dpi: number): {
  anchorOf: (d: Design, piece: TextPiece) => string;
  resources: Resource[];
  report: TextMigrationReport['labels'];
} {
  const out = resources.map((r) => ({ ...r }));
  const byId = new Map(out.map((r) => [r.id, r]));
  const ids = new Map<string, string>();
  const created: string[] = [];
  const reused = new Set<string>();
  const takenStyles = new Set(labelStyles.map((st) => st.id));
  const styleCache = new Map<string, string>();
  const NO_ID = new Set(['id', 'name', 'paletteId', 'model']);
  const styleFor = (piece: TextPiece): string => {
    const want = labelStyleFields(piece);
    const key = stableStringify(want, NO_ID);
    const hit = styleCache.get(key);
    if (hit) return hit;
    const own = labelStyles.find((st) => stableStringify(st, NO_ID) === key);
    if (own) {
      reused.add(own.id);
      styleCache.set(key, own.id);
      return own.id;
    }
    const size = toMm(piece.look.fontSize);
    const pt = size !== undefined ? Math.round((size * 72) / 25.4 * 10) / 10 : undefined;
    const hex = (piece.look.color as { hex?: string } | undefined)?.hex?.toLowerCase();
    const parts = ['label', slug(piece.look.fontFamily ?? '') || '', pt !== undefined ? String(pt).replace('.', '-') : '', piece.look.fontWeight >= 600 ? 'bold' : '', piece.look.italic ? 'italic' : '', hex ? hex.replace('#', '') : ''].filter(Boolean);
    const id = freeId(parts.join('-'), takenStyles);
    labelStyles.push({ id, name: ['Label', piece.look.fontFamily ?? '', pt !== undefined ? `${pt} pt` : '', hex ?? ''].filter(Boolean).join(' '), ...want });
    created.push(id);
    styleCache.set(key, id);
    return id;
  };
  let pictures = 0;
  let labels = 0;
  let anchors = 0;
  /** The widest box each bitmap is drawn at, mm. */
  const widest = new Map<string, number>();
  for (const d of designs) {
    for (const f of d.plan.frames) {
      const pic: PlannedPicture | undefined = f.picture;
      if (!pic) continue;
      const res = byId.get(pic.element.resourceId);
      if (!res) continue;
      pictures++;
      widest.set(res.id, Math.max(widest.get(res.id) ?? 0, pic.width));
      const list: ResourceAnchor[] = res.anchors ? res.anchors.slice() : [];
      for (const l of pic.labels) {
        labels++;
        const el = l.element;
        const sizeMm = toMm(el.fontSize) ?? 4.2;
        const width = l.width ?? 0;
        const rtl = l.look.direction === 'rtl';
        const a = l.look.align;
        const side = a === 'center' ? 'center' : a === 'right' || (a === 'end' && !rtl) || (a === 'start' && rtl) ? 'right' : 'left';
        const px = side === 'center' ? l.x! + width / 2 : side === 'right' ? l.x! + width : l.x!;
        // The design text's first baseline, where the label's goes.
        const h = el.placement?.size?.height;
        // A height sized to another box's edge (#928) states no length here.
        const boxH = toMm(typeof h === 'object' && 'value' in h ? h : undefined);
        const textH = l.lines.length * l.lineMm;
        const va = (el as { verticalAlign?: string }).verticalAlign;
        const top = l.y! + (boxH !== undefined && boxH > textH ? (va === 'middle' ? (boxH - textH) / 2 : va === 'bottom' ? boxH - textH : 0) : 0);
        const baseline = top + BASELINE * l.lineMm;
        const labelTop = baseline - BASELINE * LABEL_PITCH * sizeMm;
        const anchor: ResourceAnchor = {
          id: '',
          x: round5((px - pic.x) / pic.width),
          y: round5((labelTop - pic.y) / pic.height),
          ...(width > 0 ? { width: round5(width / pic.width) } : {}),
          align: side === 'center' ? 'center' : (side === 'left') !== rtl ? 'start' : 'end',
          verticalAlign: 'top',
          style: styleFor(l),
        };
        const plain = l.lines[0]!.replace(/\\(.)/g, '$1').replace(/\*\*|[*_^~]/g, '');
        const base = slug(plain) || 'label';
        const same = (b: ResourceAnchor) => Math.abs(b.x - anchor.x) < 1e-4 && Math.abs(b.y - anchor.y) < 1e-4 && b.width === anchor.width && b.align === anchor.align && b.style === anchor.style;
        let id = list.find((b) => (b.id === base || b.id.startsWith(`${base}-`)) && same(b))?.id;
        if (!id) {
          id = base;
          for (let n = 2; list.some((b) => b.id === id); n++) id = `${base}-${n}`;
          list.push({ ...anchor, id });
          anchors++;
        }
        ids.set(`${d.key}\n${l.id}`, id);
      }
      res.anchors = list;
    }
  }
  // A bitmap is set at its print size and never enlarged, where the design
  // stretched it over its box: one smaller than its box takes the
  // resolution that makes it that wide.
  const resolutionSet: string[] = [];
  for (const [id, widthMm] of widest) {
    const res = byId.get(id)!;
    if (res.kind !== 'bitmap' || !res.bitmap || !(res.bitmap.width > 0) || !(widthMm > 0)) continue;
    const natural = bitmapLayoutSize(res.bitmap, dpi).width;
    const wantPx = (widthMm / 25.4) * dpi;
    if (natural >= wantPx - 0.5) continue;
    res.bitmap = { ...res.bitmap, resolution: round5((res.bitmap.width * 25.4) / widthMm) };
    resolutionSet.push(id);
  }
  return {
    anchorOf: (d, piece) => ids.get(`${d.key}\n${piece.id}`) ?? '',
    resources: out,
    report: { pictures, labels, anchors, labelStylesCreated: created, labelStylesReused: [...reused], resolutionSet },
  };
}
