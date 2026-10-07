/**
 * What every painter of a comic page shares (#563, #565): the outline of a
 * panel as an SVG path, its seeded rough border, the grouping of balloons
 * into join groups, and how a balloon reads as text (its kind, its words,
 * its speaker's name) for the outputs that set the dialogue apart from the
 * art (tagged PDF, HTML, EPUB). Pure functions over the VDT.
 */

import type { ComicCastMember } from '../types';
import type { VDTComicBalloon, VDTComicPage, VDTComicPanel, VDTPoint } from '../vdt';
import { translateComicPage } from './transform';

/** A small deterministic hash (FNV-1a) for seeding a rough border. */
export function comicHashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A seeded pseudo-random sequence in [-1, 1] (mulberry32). */
function noise(seed: number): () => number {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

/** A hand-drawn version of a closed outline: points every few px pushed
 *  off the line by a seeded amount. */
export function roughOutline(points: readonly VDTPoint[], seed: number, amplitude: number, step: number): VDTPoint[] {
  const rand = noise(seed);
  const out: VDTPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.round(len / step));
    const nx = len > 0 ? -(b.y - a.y) / len : 0;
    const ny = len > 0 ? (b.x - a.x) / len : 0;
    for (let k = 0; k < n; k++) {
      const t = k / n;
      // Corners stay put; the wobble grows away from them.
      const j = k === 0 ? 0 : rand() * amplitude;
      out.push({ x: a.x + t * (b.x - a.x) + nx * j, y: a.y + t * (b.y - a.y) + ny * j });
    }
  }
  return out;
}

/** The rough border of a panel (`border.style: 'rough'`): its polygon
 *  wobbled with a seed taken from the panel, the same on every output. */
export function comicRoughBorder(panel: Pick<VDTComicPanel, 'id' | 'index' | 'sourceStart' | 'polygon' | 'border'>): VDTPoint[] {
  const w = panel.border.width;
  return roughOutline(panel.polygon, comicHashString(`${panel.id ?? ''}#${panel.index}#${panel.sourceStart}`), w * 0.6, Math.max(4, w * 6));
}

const n3 = (v: number): string => String(Math.round(v * 1000) / 1000);

/** A closed polyline as SVG path data. */
export function polygonPathData(points: readonly VDTPoint[]): string {
  if (points.length === 0) return '';
  return `M${points.map((p) => `${n3(p.x)} ${n3(p.y)}`).join('L')}Z`;
}

/** A panel's outline as SVG path data (page px): its polygon, or a
 *  rounded rectangle when it has a radius — the path the canvas clips to
 *  and strokes (`comicPanelPath`). */
export function comicPanelPathData(panel: Pick<VDTComicPanel, 'polygon' | 'bbox' | 'radius'>): string {
  const r = panel.radius;
  if (r > 0) {
    const { x, y, width: w, height: h } = panel.bbox;
    const a = `A${n3(r)} ${n3(r)} 0 0 1 `;
    return (
      `M${n3(x + r)} ${n3(y)}H${n3(x + w - r)}${a}${n3(x + w)} ${n3(y + r)}` +
      `V${n3(y + h - r)}${a}${n3(x + w - r)} ${n3(y + h)}` +
      `H${n3(x + r)}${a}${n3(x)} ${n3(y + h - r)}` +
      `V${n3(y + r)}${a}${n3(x + r)} ${n3(y)}Z`
    );
  }
  return polygonPathData(panel.polygon);
}

/** The path a panel's border is stroked along: its outline, or the
 *  wobbled one of a rough border. Empty when it has no border. */
export function comicBorderPathData(panel: VDTComicPanel): string {
  if (panel.border.style === 'none' || panel.border.width <= 0) return '';
  return panel.border.style === 'rough' ? polygonPathData(comicRoughBorder(panel)) : comicPanelPathData(panel);
}

/** What a balloon is to a reader: words a character says or thinks
 *  (`speech`), narration in a box (`caption`, also an editor's note), or a
 *  sound effect drawn into the art (`sfx`). Told from its style (`sfx`,
 *  `caption`, `note`) and whether it has a speaker. */
export type ComicBalloonKind = 'speech' | 'caption' | 'sfx';

export function comicBalloonKind(balloon: Pick<VDTComicBalloon, 'style' | 'speaker'> & { kind?: VDTComicBalloon['kind'] }): ComicBalloonKind {
  if (balloon.kind === 'sfx') return 'sfx';
  if (balloon.kind === 'caption' || balloon.kind === 'note') return 'caption';
  if (balloon.kind === 'balloon') return balloon.speaker ? 'speech' : 'caption';
  if (balloon.style === 'sfx') return 'sfx';
  if (balloon.style === 'caption' || balloon.style === 'note') return 'caption';
  return balloon.speaker ? 'speech' : 'caption';
}

const CJK_EDGE = /[⺀-鿿　-〿豈-﫿＀-￯]/;

/** The words of a balloon as plain text: its lines in order, joined by a
 *  space, or by nothing between two Chinese or Japanese characters (a
 *  line break there is no word space). */
export function comicBalloonText(balloon: Pick<VDTComicBalloon, 'text'>): string {
  let out = '';
  for (const block of balloon.text) {
    for (const line of block.lines) {
      const t = line.text.trim();
      if (!t) continue;
      if (out && !(CJK_EDGE.test(out[out.length - 1]!) && CJK_EDGE.test(t[0]!))) out += ' ';
      out += t;
    }
  }
  return out;
}

/** The name a speaker is shown under in the text outputs: its
 *  `comics.cast` entry's `name`, else its id. */
export function comicSpeakerName(speaker: string, cast: readonly ComicCastMember[] | undefined): string {
  return cast?.find((c) => c.id === speaker)?.name?.trim() || speaker;
}

/** The balloons of a page as join groups, in reading order: each group's
 *  members in order, the first (the one with the `shape`, when the group
 *  has an outline) first. A group never spans two panels. */
export function comicBalloonGroups(balloons: readonly VDTComicBalloon[]): VDTComicBalloon[][] {
  const groups: VDTComicBalloon[][] = [];
  const byKey = new Map<string, VDTComicBalloon[]>();
  for (const b of balloons) {
    const key = `${b.panelIndex}#${b.group}`;
    let g = byKey.get(key);
    if (!g) {
      g = [];
      byKey.set(key, g);
      groups.push(g);
    }
    g.push(b);
  }
  return groups;
}

/**
 * Whether a panel of one page of a two-page spread (`comic.spread`) is the
 * second half of a panel that crosses the spine: the part on the page read
 * second (the right page left to right, the left page right to left). Its
 * picture is painted, but it is read, listed and named once, with the half
 * on the page read first.
 */
export function comicPanelContinues(comic: Pick<VDTComicPage, 'spread' | 'frame' | 'direction'>, panel: Pick<VDTComicPanel, 'bbox'>): boolean {
  if (!comic.spread) return false;
  const f = comic.frame;
  const crosses = comic.spread === 'left'
    ? panel.bbox.x + panel.bbox.width > f.x + f.width + 0.25
    : panel.bbox.x < f.x - 0.25;
  if (!crosses) return false;
  return comic.spread !== (comic.direction === 'rtl' ? 'right' : 'left');
}

/** Whether `b` is the other page of the spread `a` belongs to. */
export function isComicSpreadPartner(a: Pick<VDTComicPage, 'spread' | 'sourceStart'>, b: Pick<VDTComicPage, 'spread' | 'sourceStart'> | undefined): boolean {
  return !!a.spread && !!b?.spread && a.spread !== b.spread && a.sourceStart === b.sourceStart;
}

/** The convex hull of points (monotone chain), clockwise on the sheet. */
function convexHull(points: readonly VDTPoint[]): VDTPoint[] {
  const pts = [...points].sort((p, q) => p.x - q.x || p.y - q.y);
  if (pts.length < 3) return pts;
  const cross = (o: VDTPoint, a: VDTPoint, b: VDTPoint) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: VDTPoint[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 1e-9) lower.pop();
    lower.push(p);
  }
  const upper: VDTPoint[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 1e-9) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/**
 * The two pages of a spread joined back into one comic, in the left page's
 * coordinates (the right page set against it at the spine): each panel
 * once, a panel crossing the spine whole again (its two halves' outlines
 * joined; its picture's box is the same on both), balloons of both pages,
 * in reading order. What an output that does not show pages reads (the
 * reflowable EPUB).
 */
export function joinComicSpread(left: VDTComicPage, right: VDTComicPage): VDTComicPage {
  const shift = left.frame.x + left.frame.width - right.frame.x;
  const moved = translateComicPage(right, shift, 0);
  const byIndex = new Map<number, VDTComicPanel>();
  for (const p of left.panels) byIndex.set(p.index, p);
  for (const p of moved.panels) {
    const l = byIndex.get(p.index);
    if (!l) {
      byIndex.set(p.index, p);
      continue;
    }
    const polygon = convexHull([...l.polygon, ...p.polygon]);
    const xs = polygon.map((q) => q.x);
    const ys = polygon.map((q) => q.y);
    const bbox = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
    byIndex.set(p.index, { ...l, polygon, bbox, radius: 0 });
  }
  const panels = [...byIndex.values()].sort((a, b) => a.index - b.index);
  const balloons = [...left.balloons, ...moved.balloons].sort((a, b) => a.panelIndex - b.panelIndex || a.order - b.order);
  const { spread: _spread, ...rest } = left;
  void _spread;
  return {
    ...rest,
    frame: { x: left.frame.x, y: Math.min(left.frame.y, moved.frame.y), width: moved.frame.x + moved.frame.width - left.frame.x, height: Math.max(left.frame.height, moved.frame.height) },
    panels,
    splitters: [...left.splitters, ...moved.splitters],
    balloons,
  };
}
