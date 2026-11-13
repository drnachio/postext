// The pages beneath a die-cut page in the HTML viewer (#1567). On the print
// leaf (composed pages) the page beneath is a page of the same book at the
// same size, so what a reader sees through a hole can be drawn: a layer
// over the page, clipped to its holes, that holds a copy of each page seen
// through them (`seeThrough`), each clipped by its own cut, with the shadow
// and the wall of the cut edge on top.
//
// A screen relayout (flowing pages set for the window) is not the print
// book: its pages are not the ones under each other in the hand, so a hole
// there only cuts the page (`dieCutClipDecl`) and shows what is behind it.

import { seeThrough } from '../dieCut/seeThrough.js';
import type { VDTDocument, VDTPage } from '../vdt.js';
import { dieCutClipDecl, svgPathData } from './dieCut.js';

/** The board past the book's last leaf, as on the canvas. */
const BOARD = '#3b3833';

/** The cut edge of `holes` on a box `w` × `h`: a blurred stroke inside
 *  the hole (its shadow on the page beneath), then a thin line for the
 *  paper's wall. `filter` names the blur, unique in the document. */
function cutEdgeSvg(holes: string, w: number, h: number, filter: string): string {
  return `<svg aria-hidden="true" width="${w}" height="${h}" style="position:absolute;left:0;top:0;overflow:visible;">` +
    `<defs><filter id="${filter}" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="3"/></filter></defs>` +
    `<path d="${holes}" fill="none" stroke="rgba(0,0,0,0.45)" stroke-width="10" filter="url(#${filter})"/>` +
    `<path d="${holes}" fill="none" stroke="rgba(0,0,0,0.32)" stroke-width="1.5"/></svg>`;
}

/** Whether page `i` is drawn with what shows through its holes: a page of
 *  the print leaf (composed, not a comic page) with holes, whose pages
 *  beneath are print-leaf pages too. */
export function drawsThrough(doc: Pick<VDTDocument, 'pages' | 'pageIndexOffset'>, i: number): boolean {
  const page = doc.pages[i];
  if (!page?.dieCut?.holes.length || !onLeaf(page)) return false;
  return seeThrough(doc, i).every((l) => l.pageIndex < 0 || onLeaf(doc.pages[l.pageIndex]));
}

function onLeaf(page: VDTPage | undefined): boolean {
  return !!page && page.composed !== undefined && page.comic === undefined;
}

/**
 * A copy of a page's inner HTML that cannot be mistaken for the page: its
 * element ids (and the `url(#…)` and `href="#…"` that point at them) take
 * `suffix`, and its `data-*` attributes go (a host finds blocks and frames
 * by them). The HTML is the backend's own: every attribute value is
 * escaped, so an attribute pattern never matches inside text.
 */
export function inertCopy(html: string, suffix: string): string {
  return html
    .replace(/ data-[a-z0-9-]+="[^"]*"/g, '')
    .replace(/ id="([^"]*)"/g, (_, id: string) => ` id="${id}${suffix}"`)
    .replace(/url\(#([^)\s"']+)\)/g, (_, id: string) => `url(#${id}${suffix})`)
    .replace(/ href="#([^"]*)"/g, (_, id: string) => ` href="#${id}${suffix}"`);
}

/** What `throughLayerHtml` reads of each page beneath. */
export interface ThroughPageSource {
  /** The page's inner HTML as rendered on its own. */
  inner(pageIndex: number): string;
  /** Its paper (an opaque colour: the hole must hide the page above). */
  paper(pageIndex: number): string;
}

/**
 * The layer drawn over page `i` (see the file's comment): `''` when the
 * page draws nothing through its holes (`drawsThrough`). `id` names the
 * page's element, for the ids of the copies and of the shadow's filter.
 */
export function throughLayerHtml(doc: Pick<VDTDocument, 'pages' | 'pageIndexOffset'>, i: number, source: ThroughPageSource, id: string, bleedInset = 0): string {
  if (!drawsThrough(doc, i)) return '';
  const page = doc.pages[i]!;
  const layers = seeThrough(doc, i);
  const box = `position:absolute;left:0;top:0;width:${page.width}px;height:${page.height}px;`;
  // Deepest first: each page beneath, cut by its own holes, over the
  // pages under it, inside the holes of the page above.
  let stack = '';
  for (let k = layers.length - 1; k >= 0; k--) {
    const j = layers[k]!.pageIndex;
    if (j < 0) {
      stack = `<div style="${box}background:${BOARD};"></div>`;
      continue;
    }
    const under = doc.pages[j]!;
    // The deeper pages show in this page's holes, with their own cut edges.
    const underHoles = under.dieCut?.holes.length ? svgPathData(under.dieCut.holes) : '';
    const deeper = stack && underHoles
      ? `<div style="${box}clip-path:path(nonzero,'${underHoles}');">${stack}${cutEdgeSvg(underHoles, page.width, page.height, `${id}-cut-shade-${k}`)}</div>`
      : '';
    const cut = dieCutClipDecl(under, bleedInset) ?? '';
    stack = deeper + `<div class="pt-through-page" style="${box}background:${source.paper(j)};${cut}">${inertCopy(source.inner(j), `-${id}-t${k}`)}</div>`;
  }
  const holes = svgPathData(page.dieCut!.holes);
  const edge = cutEdgeSvg(holes, page.width, page.height, `${id}-cut-shade`);
  return `<div class="pt-through" aria-hidden="true" inert style="${box}z-index:2147483646;pointer-events:none;user-select:none;-webkit-user-select:none;clip-path:path(nonzero,'${holes}');">${stack}${edge}</div>`;
}
