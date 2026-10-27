// The lettering of every panel of a laid-out comic (`letterPanels`).
import type { ResolvedComicsConfig, Resource } from '../../types.js';
import type { VDTComicPanel, ResolvedConfig, BoundingBox, VDTComicBalloon, ContentWarning, VDTPoint } from '../../vdt.js';
import { dimensionToPx } from '../../units.js';
import { pickBalloonStyle } from '../../defaults/comics.js';
import { comicArtRectToPage } from '../art.js';
import { letterPanelDetailed } from '../lettering/letter.js';
import type { LetteringForeignArt, LetteringPanel, LetteringItem } from '../lettering/types.js';
import type { ComicPageSource, ComicPanelSource } from '../types.js';
import { comicLetteringLocale, comicLetteringVertical, roleStyleId, comicLetteringStyle } from './letteringStyle.js';
import { overlaps, bystanderFaces, headGuards, drawnTail, panelAnchors, softSafeArea, headZones, bodyZones, roundBalloon, tailSideOnPage, buttedCaption, withAutoHalo, sfxColumns, panelPoint } from './zones.js';

/** What {@link letterPanels} needs. */
export interface LetterPanelsInput {
  source: ComicPageSource;
  panels: readonly VDTComicPanel[];
  /** The script of each laid-out panel (undefined for an empty cell). */
  panelSources: readonly (ComicPanelSource | undefined)[];
  comics: ResolvedComicsConfig;
  resolved: ResolvedConfig;
  resources: ReadonlyMap<string, Resource>;
  direction: 'ltr' | 'rtl';
  sourceOffset: number;
  pageIndex?: number;
  /** Regions of the frame no lettering may cover (the spine of a spread):
   *  kept out at every fallback, pins included. */
  avoid?: readonly BoundingBox[];
  /** The comic's frame (the page's live area): lettering keeps inside it
   *  unless it breaks a border on purpose. */
  frame?: BoundingBox;
  /** The trim of the sheet (default: the frame) and the bleed box: no
   *  lettering runs off the trim; a sound effect breaking its border may
   *  run into the bleed beside a panel that bleeds. */
  trim?: BoundingBox;
  bleedBox?: BoundingBox;
}

/** A box grown (negative `d`) or shrunk by `d` on every side. */
function insetBox2(b: BoundingBox, d: number): BoundingBox {
  return { x: b.x + d, y: b.y + d, width: b.width - 2 * d, height: b.height - 2 * d };
}

/** The intersection of two boxes (empty boxes have no size). */
function intersect(a: BoundingBox, b: BoundingBox): BoundingBox {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return { x, y, width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - x), height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - y) };
}

/** The smallest box holding both. */
function union(a: BoundingBox, b: BoundingBox): BoundingBox {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
}

/**
 * The lettering of a page's panels (#559–#561): balloons, captions and
 * sound effects, in reading order (panel order, then script order), and the
 * `comicBalloonOverflow` warnings of the balloons that could not be placed
 * cleanly.
 */
export function letterPanels(input: LetterPanelsInput): { balloons: VDTComicBalloon[]; warnings: ContentWarning[] } {
  const { panels, panelSources, comics, resolved, resources, direction, sourceOffset: off } = input;
  const dpi = resolved.page.dpi;
  const locale = comicLetteringLocale(resolved);
  const vertical = comicLetteringVertical(comics, resolved, locale);
  const L = comics.lettering;
  const insetPx = dimensionToPx(L.inset, dpi);
  const trim = input.trim ?? input.frame;
  const castById = new Map(comics.cast.map((c) => [c.id, c] as const));
  const balloons: VDTComicBalloon[] = [];
  const warnings: ContentWarning[] = [];
  const em = dimensionToPx(L.fontSize, dpi);
  // What each panel's picture protects, on the page (#671): a balloon that
  // leaves its panel keeps off the faces and avoid zones of the others.
  const insets = panels.map((_, i) => panelSources[i]?.attrs.inset !== undefined);
  const protectedArt: LetteringForeignArt[][] = panels.map((panel, pi) => {
    const resource = panel.art ? resources.get(panel.art.resourceId) : undefined;
    if (!panel.art || !resource) return [];
    const under = panels.filter((q, qi) => qi > pi && insets[qi] && overlaps(q.bbox, panel.bbox)).map((q) => q.polygon);
    const shown = (rect: BoundingBox) => overlaps(rect, panel.bbox);
    const entry = (rect: BoundingBox, kind: 'face' | 'avoid', guard = false): LetteringForeignArt =>
      ({ rect, kind, ...(guard ? { guard } : {}), within: panel.polygon, ...(under.length > 0 ? { under } : {}) });
    return [
      ...(resource.anchors ?? []).filter((a) => a.id !== 'sfx' && a.face).map((a) => entry(comicArtRectToPage(panel.art!, a.face!), 'face')),
      ...bystanderFaces(panel, resource).map((f) => entry(f, 'face')),
      ...(resource.avoid ?? []).map((r) => entry(comicArtRectToPage(panel.art!, r), 'avoid')),
      ...headGuards(panel, resource, em).map((g) => entry(g, 'avoid', true)),
    ].filter((e) => shown(e.rect));
  });
  panels.forEach((panel, pi) => {
    const src = panelSources[pi];
    if (!src || src.items.length === 0) return;
    const resource = panel.art ? resources.get(panel.art.resourceId) : undefined;
    // A line that may leave the panel (`break`, a pin, drawn sound) can land
    // on anything about it: it is told what the panels before it lettered
    // and what the pictures around it protect, as far as it can reach (its
    // middle stays in its panel). A panel with no such line is lettered
    // from what pokes into it alone, whatever the rest of the page does.
    const laidOver = panels.filter((q, qi) => qi > pi && insets[qi] && overlaps(q.bbox, panel.bbox)).map((q) => q.polygon);
    const leaves = src.items.some((it) => it.break || it.at !== undefined || it.role === 'sfx');
    const reach = leaves ? insetBox2(panel.bbox, -Math.max(panel.bbox.width, panel.bbox.height)) : panel.bbox;
    const set = balloons.filter((b) => overlaps(b.bbox, reach));
    const tails = set.map(drawnTail).filter((t): t is [VDTPoint, VDTPoint] => t !== undefined);
    const around = leaves ? protectedArt.flatMap((list, qi) => (qi === pi ? [] : list.filter((e) => overlaps(e.rect, reach)))) : [];
    const lp: LetteringPanel = {
      index: panel.index,
      polygon: panel.polygon,
      bbox: panel.bbox,
      insetPx,
      direction,
      writingMode: vertical ? 'vertical' : 'horizontal',
      locale,
      anchors: panelAnchors(panel, resource),
      ...(resource?.faces?.length && panel.art ? { faces: bystanderFaces(panel, resource) } : {}),
      avoid: [
        ...(panel.art ? (resource?.avoid ?? []).map((r) => comicArtRectToPage(panel.art!, r)) : []),
        ...headGuards(panel, resource, em).map((g) => ({ ...g, guard: true })),
      ],
      keepOut: (input.avoid ?? []).filter((r) => overlaps(r, insetBox2(panel.bbox, -2 * insetPx))),
      softAvoid: [...softSafeArea(panel, resource), ...headZones(panel, resource), ...bodyZones(panel, resource)],
      ...(panel.border.style !== 'none' && panel.border.width > 0 ? { borderPx: panel.border.width } : {}),
      neighbours: panels.filter((q) => q !== panel).map((q) => q.bbox),
      ...(laidOver.length > 0 ? { over: laidOver } : {}),
      ...(input.frame ? { limit: input.frame } : {}),
      ...(trim ? { trim, sheet: input.bleedBox ? intersect(input.bleedBox, union(trim, panel.bbox)) : trim } : {}),
      // What the panels before this one lettered: a balloon breaking out
      // of either panel never covers the other's.
      foreign: set.map((b) => (roundBalloon(comics, b) ? { ...b.bbox, round: true } : b.bbox)),
      ...(tails.length > 0 ? { foreignTails: tails } : {}),
      ...(around.length > 0 ? { foreignArt: around } : {}),
      dpi,
    };
    const items: LetteringItem[] = src.items.map((it, k) => {
      const cast = it.speaker ? castById.get(it.speaker) : undefined;
      const own = pickBalloonStyle(comics, it.style?.trim());
      const st = own ?? pickBalloonStyle(comics, it.role === 'speech' ? cast?.balloonStyle : undefined)
        ?? pickBalloonStyle(comics, roleStyleId(it.role)) ?? pickBalloonStyle(comics, 'speech')!;
      const tail = tailSideOnPage(it.tail, panel);
      return {
        id: `${panel.index}:${k}`,
        order: k,
        kind: it.role === 'speech' ? 'balloon' : it.role,
        ...(it.speaker ? { speaker: it.speaker } : {}),
        text: it.spans.length > 0 ? it.spans : it.text,
        sourceMap: it.sourceMap.map((o) => o + off),
        sourceStart: it.sourceStart + off,
        sourceEnd: it.sourceEnd + off,
        style: buttedCaption(withAutoHalo(sfxColumns(it.role, comicLetteringStyle({ style: st, comics, ...(cast ? { cast } : {}), item: it, locale, vertical, dpi, ...(resolved.colorPalette ? { palette: resolved.colorPalette } : {}) })), st), panel, it.atKeyword),
        ...(it.at ? { pin: panelPoint(panel, it.at) } : {}),
        ...(it.atKeyword ? { position: it.atKeyword } : {}),
        ...(it.to ? { tailTarget: panelPoint(panel, it.to) } : tail && tail !== 'none' && tail !== 'auto' ? { tailTarget: tail } : {}),
        ...(tail === 'none' ? { tail: 'none' as const } : {}),
        ...(it.join !== undefined ? { join: it.join } : {}),
        ...(it.break ? { breakBorder: true } : {}),
        ...(it.rotate !== undefined ? { rotate: it.rotate } : {}),
        ...(it.skew !== undefined ? { skew: it.skew } : {}),
        ...(it.size !== undefined && it.size > 0 ? { sizeScale: it.size } : {}),
        ...(it.writingMode ? { writingMode: it.writingMode } : {}),
      };
    });
    const r = letterPanelDetailed(lp, items, { joinSameSpeaker: L.joinSameSpeaker, groupBase: pi * 1000, ...(L.strictPlacement ? { strictPlacement: true } : {}) });
    balloons.push(...r.balloons);
    for (const d of r.diagnostics) {
      warnings.push({
        kind: 'comicBalloonOverflow',
        panel: d.panelIndex,
        reasons: d.reasons,
        fallbacks: d.fallbacks,
        sourceStart: d.sourceStart,
        sourceEnd: d.sourceEnd,
        ...(input.pageIndex !== undefined ? { pageIndex: input.pageIndex } : {}),
      });
    }
  });
  return { balloons, warnings };
}
