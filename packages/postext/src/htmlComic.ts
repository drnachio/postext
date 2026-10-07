/**
 * HTML of a comic page (#565): the panels, their pictures cropped to their
 * outlines, borders and pop-out cut-outs, and the lettering, painted in the
 * order the canvas paints them (SPEC D5) and read in reading order: each
 * panel a `<figure>` holding its picture (an inline SVG clipped to the
 * panel's outline, named by its text alternative), followed by its
 * balloons and captions as paragraphs and its sound effects as named
 * images. Balloons sit over every panel (`z-index`), sound effects over
 * every balloon, whatever their place in the reading order.
 *
 * Everything is in sheet coordinates: the markup is laid over the page
 * box, outside any flow frame.
 */

import type { ComicCastMember } from './types';
import type { VDTComicArt, VDTComicBalloon, VDTComicPage, VDTComicPanel, VDTDesignTextBlock } from './vdt';
import { comicBalloonGroups, comicBalloonKind, comicBalloonText, comicBorderPathData, comicPanelContinues, comicPanelPathData, comicSpeakerName } from './comics/paint';

const HTML_ESCAPE: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => HTML_ESCAPE[c] ?? c);
const n3 = (v: number): string => String(Math.round(v * 1000) / 1000);

/** How a comic page's markup gets its pictures and its text. */
export interface ComicHtmlPaint {
  /** The URL of a picture, or undefined (a placeholder is drawn). */
  artUrl: (art: VDTComicArt) => string | undefined;
  /** Extra CSS declarations for a picture (a single-ink filter). */
  artStyle?: (art: VDTComicArt, url: string) => string;
  /** The HTML of a design text block (the lettering's lines). */
  text: (block: VDTDesignTextBlock) => string;
  /** Prefix of the ids the markup sets (clip paths): unique per page of
   *  the document the markup goes into. */
  idBase: string;
  /** `comics.cast`: the names speakers are announced under. */
  cast?: readonly ComicCastMember[];
}

/** Options of {@link comicPanelSvg}. */
export interface ComicPanelSvgOptions {
  /** The URL of a picture, or undefined (a placeholder is drawn). */
  href: (art: VDTComicArt) => string | undefined;
  artStyle?: (art: VDTComicArt, url: string) => string;
  /** Id of the panel's clip path. */
  clipId: string;
  /** The text alternative: the SVG is then an image of that name
   *  (`role="img"`); without one it is hidden from assistive technology. */
  label?: string;
  /** A document of its own (XML: `xmlns`, `xlink:href`), sized `width` px
   *  wide (default: the panel's own width) — the reflowable EPUB's panel
   *  picture. Otherwise it fills the box it is placed in. */
  standalone?: { width?: number };
  /** Stroke the panel's border (default true). */
  border?: boolean;
  /** Draw the pop-out cut-out (default true). */
  pop?: boolean;
  /** Class of the `<svg>`. */
  className?: string;
}

/** One picture drawn at its box, flipped inside it when mirrored. */
function artImage(art: VDTComicArt, url: string, xlink: boolean, style: string): string {
  const { x, y, width: w, height: h } = art.box;
  const flip = art.mirrored ? ` transform="translate(${n3(2 * x + w)} 0) scale(-1 1)"` : '';
  const ref = xlink ? `xlink:href="${esc(url)}"` : `href="${esc(url)}"`;
  return `<image ${ref} x="${n3(x)}" y="${n3(y)}" width="${n3(w)}" height="${n3(h)}" preserveAspectRatio="none"${flip}${style ? ` style="${esc(style)}"` : ''}/>`;
}

/**
 * A comic panel as an SVG picture whose user space is the sheet (page px):
 * the viewBox is the panel's bounding box, the panel's background and
 * picture are clipped to its outline (a polygon, or a rounded rectangle),
 * then its border is stroked and its pop-out cut-out drawn over it, as
 * the canvas paints it. The picture is the whole stored picture at
 * `art.box`, so only `art.source` shows: an exact crop, with no image
 * decoding.
 */
export function comicPanelSvg(panel: VDTComicPanel, options: ComicPanelSvgOptions): string {
  const { x, y, width: w, height: h } = panel.bbox;
  const xlink = options.standalone !== undefined;
  const parts: string[] = [];
  const outline = comicPanelPathData(panel);
  parts.push(`<defs><clipPath id="${esc(options.clipId)}"><path d="${outline}"/></clipPath></defs>`);
  const inner: string[] = [];
  if (panel.background) inner.push(`<rect x="${n3(x)}" y="${n3(y)}" width="${n3(w)}" height="${n3(h)}" fill="${esc(panel.background)}"/>`);
  if (panel.art) {
    const url = options.href(panel.art);
    inner.push(url
      ? artImage(panel.art, url, xlink, options.artStyle?.(panel.art, url) ?? '')
      : `<rect x="${n3(x)}" y="${n3(y)}" width="${n3(w)}" height="${n3(h)}" fill="#a0a0a0" fill-opacity="0.15"/>`);
  }
  if (inner.length > 0) parts.push(`<g clip-path="url(#${esc(options.clipId)})">${inner.join('')}</g>`);
  if (options.border !== false) {
    const d = comicBorderPathData(panel);
    if (d) parts.push(`<path d="${d}" fill="none" stroke="${esc(panel.border.color)}" stroke-width="${n3(panel.border.width)}" stroke-linejoin="round"/>`);
  }
  if (options.pop !== false && panel.pop) {
    const url = options.href(panel.pop);
    if (url) parts.push(artImage(panel.pop, url, xlink, options.artStyle?.(panel.pop, url) ?? ''));
  }
  const a11y = options.label ? ` role="img" aria-label="${esc(options.label)}"` : ' aria-hidden="true"';
  const cls = options.className ? ` class="${esc(options.className)}"` : '';
  const viewBox = `${n3(x)} ${n3(y)} ${n3(w)} ${n3(h)}`;
  if (options.standalone) {
    const width = options.standalone.width ?? w;
    const height = w > 0 ? (width * h) / w : h;
    const ns = ` xmlns="http://www.w3.org/2000/svg"${parts.some((p) => p.includes('xlink:href')) ? ' xmlns:xlink="http://www.w3.org/1999/xlink"' : ''}`;
    return `<svg${ns}${cls} width="${n3(width)}" height="${n3(height)}" viewBox="${viewBox}"${a11y}>${parts.join('')}</svg>`;
  }
  return `<svg${cls} width="${n3(w)}" height="${n3(h)}" viewBox="${viewBox}"${a11y} focusable="false" style="position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;">${parts.join('')}</svg>`;
}

/** The outline of a join group: every subpath stroked at twice the stroke
 *  width first (a double outline first at its outer width, then in the
 *  fill colour), then filled, so joined bodies, necks and the tail merge
 *  into one outline (the layer method; never fill then stroke). */
function groupShapes(group: readonly VDTComicBalloon[]): string {
  const shaped = group.filter((b) => b.shape);
  if (shaped.length === 0) return '';
  const strokes: string[] = [];
  const fills: string[] = [];
  for (const b of shaped) {
    const s = b.shape!;
    const rot = b.rotate ? ` transform="rotate(${n3(b.rotate)} ${n3(b.bbox.x + b.bbox.width / 2)} ${n3(b.bbox.y + b.bbox.height / 2)})"` : '';
    const open = rot ? `<g${rot}>` : '';
    const close = rot ? '</g>' : '';
    const fill = s.fill && s.fill !== 'transparent' ? s.fill : undefined;
    if (s.stroke && s.strokeWidth > 0) {
      const sw = s.strokeWidth;
      // With no fill over it the stroke shows whole: at its own width.
      const k = fill ? 2 : 1;
      const dash = s.dash && s.dash.length ? ` stroke-dasharray="${s.dash.map((d) => n3(d * k)).join(' ')}"` : '';
      const line = (color: string, width: number, extra = ''): string =>
        `<path d="${s.d}" fill="none" stroke="${esc(color)}" stroke-width="${n3(width)}" stroke-linejoin="round"${extra}/>`;
      const own: string[] = [];
      if (s.double) {
        own.push(line(s.stroke, k * (2 * sw + s.double.gap)));
        own.push(line(fill ?? '#ffffff', k * (sw + s.double.gap)));
      }
      own.push(line(s.stroke, k * sw, dash));
      strokes.push(open + own.join('') + close);
    }
    if (fill) fills.push(`${open}<path d="${s.d}" fill="${esc(fill)}"/>${close}`);
  }
  return (
    `<svg class="pt-comic-shape" aria-hidden="true" focusable="false" style="position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:2;">` +
    strokes.join('') + fills.join('') +
    `</svg>`
  );
}

/** The design-text markup of a balloon as phrasing content: every box of
 *  it is absolutely positioned (so blockified), and a `<span>` may sit in
 *  a `<p>` where a `<div>` may not. */
const asPhrasing = (html: string): string => html.replace(/<(\/?)div\b/g, '<$1span');

/** Visually hidden text, read by assistive technology. */
const SR_ONLY = 'position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;';

function balloonHtml(b: VDTComicBalloon, paint: ComicHtmlPaint): string {
  const kind = comicBalloonKind(b);
  const words = comicBalloonText(b);
  const decls: string[] = ['position:absolute', 'left:0', 'top:0', 'margin:0', `z-index:${kind === 'sfx' ? 3 : 2}`];
  if (b.rotate) {
    decls.push(`transform-origin:${n3(b.bbox.x + b.bbox.width / 2)}px ${n3(b.bbox.y + b.bbox.height / 2)}px`, `transform:rotate(${n3(b.rotate)}deg)`);
  }
  if (b.halo && b.halo.width > 0) {
    // The text stroked at twice the halo's width under its fill.
    decls.push(`-webkit-text-stroke:${n3(2 * b.halo.width)}px ${b.halo.color}`, 'paint-order:stroke fill', 'stroke-linejoin:round');
  }
  const text = asPhrasing(b.text.map(paint.text).join(''));
  const data = ` data-balloon="${esc(b.id)}" data-kind="${kind}" data-style="${esc(b.style)}"${b.speaker ? ` data-speaker="${esc(b.speaker)}"` : ''}`;
  if (kind === 'sfx') {
    return `<p class="pt-comic-sfx"${data} role="img" aria-label="${esc(words)}" style="${decls.join(';')};">${text}</p>`;
  }
  const who = kind === 'speech' && b.speaker
    ? `<span class="pt-comic-speaker" style="${SR_ONLY}">${esc(comicSpeakerName(b.speaker, paint.cast))}: </span>`
    : '';
  const cls = kind === 'caption' ? 'pt-comic-caption' : 'pt-comic-balloon';
  return `<p class="${cls}"${data} style="${decls.join(';')};">${who}${text}</p>`;
}

/**
 * The markup of a comic page, laid over a page `width` × `height` px: a
 * container (`.pt-comic`, its own stacking context) holding, in reading
 * order, each panel's `<figure>` followed by its lettering.
 */
export function renderComicHtml(comic: VDTComicPage, width: number, height: number, paint: ComicHtmlPaint): string {
  const groups = comicBalloonGroups(comic.balloons);
  const byPanel = new Map<number, VDTComicBalloon[][]>();
  for (const g of groups) {
    const k = g[0]!.panelIndex;
    const list = byPanel.get(k) ?? [];
    list.push(g);
    byPanel.set(k, list);
  }
  const lettering = (list: readonly VDTComicBalloon[][] | undefined): string =>
    (list ?? []).map((g) => groupShapes(g) + g.map((b) => balloonHtml(b, paint)).join('')).join('');
  const parts: string[] = [];
  const known = new Set<number>();
  for (const panel of comic.panels) {
    known.add(panel.index);
    const { x, y, width: w, height: h } = panel.bbox;
    // The second half of a panel across a spread's spine: painted, read
    // with its first half on the other page.
    const continued = comicPanelContinues(comic, panel);
    const id = panel.id && !continued ? ` id="${esc(`pt-a-${panel.id}`)}"` : '';
    const svg = comicPanelSvg(panel, {
      href: paint.artUrl,
      ...(paint.artStyle ? { artStyle: paint.artStyle } : {}),
      clipId: `${paint.idBase}-${panel.index}`,
      ...(panel.art && panel.altText && !continued ? { label: panel.altText } : {}),
      className: 'pt-comic-art',
    });
    parts.push(
      `<figure class="pt-comic-panel"${id} data-panel="${panel.index}"${continued ? ' data-continued="" aria-hidden="true"' : ''} style="position:absolute;left:${n3(x)}px;top:${n3(y)}px;width:${n3(w)}px;height:${n3(h)}px;margin:0;">${svg}</figure>`,
    );
    parts.push(lettering(byPanel.get(panel.index)));
  }
  // Lettering of no panel laid out (none expected): after the panels.
  for (const [k, list] of byPanel) if (!known.has(k)) parts.push(lettering(list));
  return (
    `<div class="pt-comic" data-direction="${comic.direction}"${comic.spread ? ` data-spread="${comic.spread}"` : ''} style="position:absolute;left:0;top:0;width:${n3(width)}px;height:${n3(height)}px;isolation:isolate;overflow:hidden;">` +
    parts.join('') +
    `</div>`
  );
}
