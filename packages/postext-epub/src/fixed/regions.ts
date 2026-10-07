// Comic pages in the fixed layout (#565): region-based navigation (EPUB
// Region-Based Navigation 1.0) and Kindle panel magnification.
//
//   OEBPS/regions.xhtml   the data navigation document (`data-nav`): one
//                         `region-based` nav, a `panel` region per panel in
//                         reading order, its balloons nested in it
//
// A region is a rectangle in percent of the page's viewport
// (`#xywh=percent:x,y,w,h`): a slanted panel is given by its bounding box.

import { comicBalloonGroups, comicBalloonKind, comicBalloonText, comicPanelContinues, isComicSpreadPartner } from 'postext';
import type { BoundingBox, VDTComicBalloon, VDTComicPage, VDTDocument, VDTPage } from 'postext';
import type { EpubItem } from '../types';
import { escapeAttr, xhtmlDocument } from '../shared/xml';
import { isRtlLanguage } from '../package/strings';

export const REGIONS_HREF = 'regions.xhtml';

/** How a page's VDT px land in its viewport (see `pageGeometry` in
 *  fixed/index.ts): `scale` after taking off the cut-line `offset`. */
export interface ViewportMap {
  width: number;
  height: number;
  scale: number;
  offset: number;
}

/** A page of the book with comics, as the region navigation reads it. */
export interface ComicPagePlan {
  /** Href of the page's content document, relative to the package. */
  href: string;
  /** The page's comics on its sheet (`pageComics`): its comic page or
   *  half of a spread, then its strips. */
  comics: VDTComicPage[];
  geo: ViewportMap;
}

const pct = (v: number): string => String(Math.round(v * 100) / 100);

/** A box of the page as a viewport rectangle in percent, cut to the page
 *  (a bleeding panel runs past it). Undefined when nothing of it shows. */
export function percentRect(box: BoundingBox, geo: ViewportMap): { x: number; y: number; w: number; h: number } | undefined {
  const toX = (v: number): number => Math.min(100, Math.max(0, (((v - geo.offset) * geo.scale) / geo.width) * 100));
  const toY = (v: number): number => Math.min(100, Math.max(0, (((v - geo.offset) * geo.scale) / geo.height) * 100));
  const x0 = toX(box.x);
  const y0 = toY(box.y);
  const x1 = toX(box.x + box.width);
  const y1 = toY(box.y + box.height);
  if (x1 - x0 <= 0 || y1 - y0 <= 0) return undefined;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** A region's fragment (`#xywh=percent:…`). */
export function xywh(box: BoundingBox, geo: ViewportMap): string | undefined {
  const r = percentRect(box, geo);
  return r ? `#xywh=percent:${pct(r.x)},${pct(r.y)},${pct(r.w)},${pct(r.h)}` : undefined;
}

/** The `epub:type` of a balloon's region (EPUB SSV comics terms). */
function balloonType(b: VDTComicBalloon): string {
  const kind = comicBalloonKind(b);
  return kind === 'sfx' ? 'sound-area' : kind === 'caption' ? 'text-area' : 'balloon';
}

/** One page's part of a comic: the page's document and viewport, and
 *  the comic (a page's, a spread's half, a strip) on its sheet. */
interface Sheet {
  href: string;
  geo: ViewportMap;
  comic: VDTComicPage;
}

/** The regions of one comic, in reading order: a comic page or a strip
 *  (one sheet), or a spread (its two pages, `sheets` in page order). A
 *  panel across a spread's spine is one region of two rectangles, one on
 *  each page (a synthetic spread region); balloons are nested in their
 *  panel, each on the page that holds it. A region is a link with no text
 *  (EPUBCheck: a region-based nav's links carry no label); what it shows is
 *  read on the page itself. */
function comicRegions(sheets: readonly Sheet[]): string[] {
  const indexes = [...new Set(sheets.flatMap((s) => s.comic.panels.map((p) => p.index)))].sort((a, b) => a - b);
  const out: string[] = [];
  for (const index of indexes) {
    const links: string[] = [];
    for (const s of sheets) {
      const panel = s.comic.panels.find((p) => p.index === index);
      const frag = panel ? xywh(panel.bbox, s.geo) : undefined;
      if (frag) links.push(`<a href="${escapeAttr(s.href + frag)}"></a>`);
    }
    if (links.length === 0) continue;
    const lettering = sheets
      .flatMap((s) => comicBalloonGroups(s.comic.balloons).flat().filter((b) => b.panelIndex === index).map((b) => ({ b, s })))
      .sort((x, y) => x.b.order - y.b.order);
    const kids: string[] = [];
    for (const { b, s } of lettering) {
      const bf = xywh(b.bbox, s.geo);
      if (!bf || !comicBalloonText(b).trim()) continue;
      kids.push(`<li epub:type="${balloonType(b)}"><a href="${escapeAttr(s.href + bf)}"></a></li>`);
    }
    out.push(
      `<li epub:type="panel">${links.length === 1 ? links[0] : `<span>${links.join('')}</span>`}` +
      (kids.length ? `\n<ol>\n${kids.join('\n')}\n</ol>\n` : '') +
      `</li>`,
    );
  }
  return out;
}

/** The comics of the book's pages, each with the pages it lies on: a
 *  spread's two halves joined, in page order. */
function comicViews(plans: readonly ComicPagePlan[]): Sheet[][] {
  const views: Sheet[][] = [];
  const used = new Set<VDTComicPage>();
  plans.forEach((plan, i) => {
    for (const comic of plan.comics) {
      if (used.has(comic)) continue;
      used.add(comic);
      const sheet: Sheet = { href: plan.href, geo: plan.geo, comic };
      const next = plans[i + 1];
      const partner = comic.spread && next ? next.comics.find((c) => isComicSpreadPartner(comic, c)) : undefined;
      if (partner) {
        used.add(partner);
        views.push([sheet, { href: next!.href, geo: next!.geo, comic: partner }]);
      } else {
        views.push([sheet]);
      }
    }
  });
  return views;
}

/** The data navigation document of a book with comics, or undefined
 *  without any (or with no region to list). */
export function regionNavItem(plans: readonly ComicPagePlan[], language: string, title: string): EpubItem | undefined {
  const items = comicViews(plans).flatMap(comicRegions);
  if (items.length === 0) return undefined;
  const data = xhtmlDocument({
    lang: language,
    ...(isRtlLanguage(language) ? { dir: 'rtl' as const } : {}),
    title,
    body: `<nav epub:type="region-based" id="regions">\n<ol>\n${items.join('\n')}\n</ol>\n</nav>`,
  });
  return { id: 'regions', href: REGIONS_HREF, mediaType: 'application/xhtml+xml', data, properties: ['data-nav'] };
}

/** The reading direction of a book's comic pages, when it has any: the
 *  direction most of them read in (the first one's on a tie). The fixed
 *  layout's page progression follows it, so a manga turns its pages right
 *  to left in any language and a Western comic left to right. */
export function comicDirectionOf(docs: readonly VDTDocument[]): 'ltr' | 'rtl' | undefined {
  let rtl = 0;
  let ltr = 0;
  let first: 'ltr' | 'rtl' | undefined;
  for (const d of docs) {
    for (const p of d.pages) {
      if (!p.comic) continue;
      first ??= p.comic.direction;
      if (p.comic.direction === 'rtl') rtl++;
      else ltr++;
    }
  }
  if (!first) return undefined;
  return rtl === ltr ? first : rtl > ltr ? 'rtl' : 'ltr';
}

/** Kindle panel view (KF8 region magnification, opt-in): over each panel
 *  a tap target (`app-amzn-magnify`, its `ordinal` the reading order) and
 *  the target it magnifies: the page's comic markup again, scaled so the
 *  panel fills it, hidden until the reader taps. `markup(idSuffix)` gives
 *  the page's comic markup with its ids made unique by the suffix. */
export function kindlePanelMarkup(
  page: VDTPage,
  geo: ViewportMap,
  markup: (idSuffix: string) => string,
): string {
  const comic = page.comic!;
  const out: string[] = [];
  // The order of the page's panels, from 1 (a spread's half of a panel
  // the other page magnifies is no tap target here).
  let ordinal = 1;
  for (const panel of comic.panels) {
    if (comicPanelContinues(comic, panel)) continue;
    const r = percentRect(panel.bbox, geo);
    if (!r) continue;
    const id = `mag-${page.index}-${panel.index}`;
    const json = JSON.stringify({ targetId: `${id}-target`, ordinal: ordinal++ });
    out.push(
      `<div class="pt-mag-tap" style="position:absolute;left:${pct(r.x)}%;top:${pct(r.y)}%;width:${pct(r.w)}%;height:${pct(r.h)}%;z-index:9;">` +
      `<a class="app-amzn-magnify" data-app-amzn-magnify="${escapeAttr(json)}"></a></div>`,
    );
    // The panel at the viewport's width (or height), from the page's left
    // top: the page markup scaled and moved so the panel's box fills it.
    const k = Math.min(100 / r.w, 100 / r.h);
    out.push(
      `<div id="${id}-target" class="target-mag-parent" aria-hidden="true">` +
      `<div class="target-mag" style="position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden;">` +
      `<div style="position:absolute;left:0;top:0;width:${geo.width}px;height:${geo.height}px;transform-origin:0 0;` +
      `transform:scale(${pct(k)}) translate(${pct(-(r.x * geo.width) / 100)}px,${pct(-(r.y * geo.height) / 100)}px);">` +
      `<div style="position:absolute;left:0;top:0;width:${page.width}px;height:${page.height}px;transform-origin:0 0;transform:scale(${geo.scale})${geo.offset ? ` translate(-${geo.offset}px,-${geo.offset}px)` : ''};">` +
      markup(`-${id}`) +
      `</div></div></div></div>`,
    );
  }
  return out.join('');
}
