// Where balloons may go in a panel: anchors, face and head guards, zones,
// safe area, and the balloon and tail shapes a panel letters with.
import type { Resource, ResolvedBalloonStyleConfig, ResolvedComicsConfig } from '../../types.js';
import type { VDTComicPanel, VDTPoint, BoundingBox, VDTComicBalloon } from '../../vdt.js';
import { pickBalloonStyle } from '../../defaults/comics.js';
import { comicArtPointToPage, comicArtRectToPage } from '../art.js';
import { pointInPolygon } from '../geometry.js';
import type { LetteringStyle, LetteringAnchor } from '../lettering/types.js';
import type { ComicScriptItem } from '../types.js';

/** A sound effect set in columns breaks after five characters at most
 *  (its letters are big: a long column would run out of the panel). */
export function sfxColumns(role: ComicScriptItem['role'], style: LetteringStyle): LetteringStyle {
  return role === 'sfx' ? { ...style, maxColumnChars: Math.min(5, style.maxColumnChars ?? 5) } : style;
}

/** A point given in fractions of a panel's picture (of its cell, for a
 *  panel without one) on the page. */
export function panelPoint(panel: VDTComicPanel, at: { x: number; y: number }): VDTPoint {
  if (panel.art) return comicArtPointToPage(panel.art, at.x, at.y);
  return { x: panel.bbox.x + at.x * panel.bbox.width, y: panel.bbox.y + at.y * panel.bbox.height };
}

/** The anchors of a panel's picture on the page, each with whether its
 *  mouth is in view. */
export function panelAnchors(panel: VDTComicPanel, resource: Resource | undefined): LetteringAnchor[] {
  const art = panel.art;
  if (!art || !resource?.anchors) return [];
  return resource.anchors.map((a) => {
    const mouth = comicArtPointToPage(art, a.x, a.y);
    return {
      id: a.id,
      mouth,
      ...(a.head ? { head: comicArtPointToPage(art, a.head.x, a.head.y) } : {}),
      ...(a.face ? { face: comicArtRectToPage(art, a.face) } : {}),
      visible: pointInPolygon(panel.polygon, mouth),
    };
  });
}

/** The faces a panel's picture marks for people who do not speak
 *  (`Resource.faces`, #726), on the page: through the crop and the mirror,
 *  as an anchor's face is. */
export function bystanderFaces(panel: VDTComicPanel, resource: Resource | undefined): BoundingBox[] {
  const art = panel.art;
  if (!art || !resource?.faces) return [];
  return resource.faces.map((r) => comicArtRectToPage(art, r));
}

/** The guard over a marked face: the box grown upward by 0.4 of its
 *  height and outward by a fifth of its width (hair, a hat brim). */
function faceGuard(f: BoundingBox): BoundingBox {
  const up = 0.4 * f.height;
  const side = 0.2 * f.width;
  return { x: f.x - side, y: f.y - up, width: f.width + 2 * side, height: f.height + up };
}

export function overlaps(a: BoundingBox, b: BoundingBox): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * Guards over the head of every speaker, so that balloons do not land on a
 * hat or a head of hair. Each is an avoid zone (a balloon may still cover
 * it as a last resort; tails run to the mouth as usual):
 * - a marked `face` (a speaker's, or a bystander's from `Resource.faces`,
 *   #726) grown upward by 0.4 of its height and outward by a fifth of its
 *   width (hair, a hat brim; the face itself stays a hard no-go);
 * - with no face, a box of a few ems about the mouth (and the head point),
 *   mostly above it, sized from the mouth-to-head distance when the head
 *   is marked.
 * {@link headZones} adds the larger head a close shot may have, as a
 * softer preference.
 */
export function headGuards(panel: VDTComicPanel, resource: Resource | undefined, em: number): BoundingBox[] {
  const art = panel.art;
  if (!art || !resource) return [];
  const speakers = (resource.anchors ?? []).filter((a) => a.id !== 'sfx').map((a) => {
    if (a.face) return faceGuard(comicArtRectToPage(art, a.face));
    const mouth = comicArtPointToPage(art, a.x, a.y);
    const head = a.head ? comicArtPointToPage(art, a.head.x, a.head.y) : mouth;
    const d = Math.hypot(head.x - mouth.x, head.y - mouth.y);
    const size = d > 0.5 * em ? Math.max(2.4 * d, 3.3 * em) : 3.3 * em;
    const cx = (mouth.x + head.x) / 2;
    const half = Math.max(1.6 * em, 0.5 * size);
    const y0 = Math.min(mouth.y, head.y) - Math.max(2.9 * em, 0.95 * size);
    const y1 = Math.max(mouth.y, head.y) + 0.7 * em;
    return { x: cx - half, y: y0, width: 2 * half, height: y1 - y0 };
  });
  return [...speakers, ...bystanderFaces(panel, resource).map(faceGuard)];
}

/** The head a speaker with no marked face may have in a closer shot (a
 *  quarter of the shorter side of the cell, above the mouth), as a region
 *  better left uncovered: a cost per area, never a fault, so that in a
 *  long shot (small figures) a balloon still comes close. */
export function headZones(panel: VDTComicPanel, resource: Resource | undefined): (BoundingBox & { weight: number })[] {
  const art = panel.art;
  if (!art || !resource?.anchors) return [];
  const size = 0.22 * Math.min(panel.bbox.width, panel.bbox.height);
  return resource.anchors.filter((a) => a.id !== 'sfx' && !a.face).map((a) => {
    const mouth = comicArtPointToPage(art, a.x, a.y);
    return { x: mouth.x - 0.45 * size, y: mouth.y - 1.05 * size, width: 0.9 * size, height: 1.25 * size, weight: 1.5 };
  });
}

/** The body under every marked face (a figure's chest and arms, two
 *  hugging characters), as a region better left uncovered: a balloon goes
 *  over the background before it goes over the action. A cost per area,
 *  never a fault; each zone names its figure (`owner`), so that a balloon
 *  costs more over another character than over its own speaker. The
 *  figure under a bystander's face (`Resource.faces`, #726) is nobody's
 *  own: its owner is a name no script key can be (a key holds no space),
 *  so every balloon pays for it as for another character's. */
export function bodyZones(panel: VDTComicPanel, resource: Resource | undefined): (BoundingBox & { weight: number; owner: string })[] {
  const art = panel.art;
  if (!art || !resource) return [];
  const under = (f: BoundingBox, owner: string) => ({ x: f.x - 0.3 * f.width, y: f.y + f.height, width: 1.6 * f.width, height: 2 * f.height, weight: 1.5, owner });
  return [
    ...(resource.anchors ?? []).filter((a) => a.id !== 'sfx' && a.face).map((a) => under(comicArtRectToPage(art, a.face!), a.id)),
    ...bystanderFaces(panel, resource).map((f, i) => under(f, `bystander face ${i}`)),
  ];
}

/** The picture's safe area as a region better left uncovered, when the art
 *  marks no face (a speaker's or a bystander's) and no avoid zone (nothing
 *  else tells the lettering what matters in it). */
export function softSafeArea(panel: VDTComicPanel, resource: Resource | undefined): BoundingBox[] {
  const art = panel.art;
  if (!art || !resource?.safeArea) return [];
  if ((resource.avoid?.length ?? 0) > 0 || (resource.faces?.length ?? 0) > 0 || (resource.anchors ?? []).some((a) => a.face)) return [];
  return [comicArtRectToPage(art, resource.safeArea)];
}

/** Text on the art with no balloon (a `none` shape) and no halo of its
 *  own gets one, light under dark letters and dark under light ones: the
 *  white outline letterers give lettering laid on a picture (#559). */
export function withAutoHalo(style: LetteringStyle, st: ResolvedBalloonStyleConfig): LetteringStyle {
  if (st.shape !== 'none' || st.halo !== undefined || style.halo) return style;
  const hex = style.color.replace('#', '');
  const v = hex.length >= 6 ? hex.slice(0, 6) : hex.split('').map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return { ...style, halo: Math.max(0.12 * style.fontSizePx, 1), haloColor: lum < 0.5 ? '#ffffff' : '#000000' };
}

/** A box butted against the border of a framed panel (a caption at a
 *  corner) is outlined at the border's weight, so that its edges and the
 *  border read as one line. */
export function buttedCaption(style: LetteringStyle, panel: VDTComicPanel, at: string | undefined): LetteringStyle {
  const butted = style.butt && style.shape !== 'none' && (at !== undefined || (style.position !== undefined && style.position !== 'auto'));
  if (!butted || panel.border.style === 'none' || !(panel.border.width > 0) || style.strokeWidth <= 0) return style;
  return { ...style, strokeWidth: panel.border.width };
}

/** Whether a balloon's outline is an oval or grows from one (a cloud, a
 *  burst): its box's corners are no part of it. */
export function roundBalloon(comics: ResolvedComicsConfig, b: VDTComicBalloon): boolean {
  if (b.kind !== 'balloon' || !b.shape) return false;
  const shape = pickBalloonStyle(comics, b.style)?.shape;
  return shape !== 'rectangle' && shape !== 'rounded' && shape !== 'none';
}

/** A balloon's tail as drawn, from its body to its tip (the body taken as
 *  the oval its box holds); undefined for a balloon with none. */
export function drawnTail(b: VDTComicBalloon): [VDTPoint, VDTPoint] | undefined {
  if (!b.tailTip) return undefined;
  const c = { x: b.bbox.x + b.bbox.width / 2, y: b.bbox.y + b.bbox.height / 2 };
  const dx = b.tailTip.x - c.x;
  const dy = b.tailTip.y - c.y;
  const k = Math.hypot(dx / (b.bbox.width / 2 || 1), dy / (b.bbox.height / 2 || 1));
  if (!(k > 1)) return undefined;
  return [{ x: c.x + dx / k, y: c.y + dy / k }, { x: b.tailTip.x, y: b.tailTip.y }];
}

/** A script's `tail=` as the lettering reads it. `left` and `right` name
 *  a side of the panel's picture as stored (#727), as `at=` and `to=`
 *  name points of it: on the page that is the same side of the panel, and
 *  the other one when the picture is mirrored. A panel with no picture
 *  reads them as the page's. The other values pass through. */
export function tailSideOnPage(tail: ComicScriptItem['tail'], panel: VDTComicPanel): ComicScriptItem['tail'] {
  if ((tail === 'left' || tail === 'right') && panel.art?.mirrored) return tail === 'left' ? 'right' : 'left';
  return tail;
}
