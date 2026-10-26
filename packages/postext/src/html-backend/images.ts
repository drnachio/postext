// Images and videos: payload URLs, ink and tint filters, fonts inlined
// into SVG pictures, fitted and cropped images, video players and overlays
// (#1276: split out of html-backend.ts).
import type { VDTDocument, VDTBlock, VDTResourceVideo, RoundedOutline } from '../vdt.js';
import { isSingleInkSvgUrl } from '../svg/singleInk.js';
import { inlineSvgFontsDetailedSync } from '../svg/fonts.js';
import { registeredFontSyncProvider } from '../svg/fontRegistry.js';
import { svgPictureFontWarning } from '../svg/image.js';
import type { ResourceSafeArea } from '../types.js';
import { playMarkTriangle, qrModuleRuns } from '../pipeline/resources/videoOverlay.js';
import { isHlsMimeType, videoEmbedAllow, mediaFragment, videoElementAttributes } from '../video/url.js';
import type { HtmlPaint, InkFilter, RenderHtmlOptions } from './render.js';
import { esc } from './textRuns.js';

/** Whether an image URL names an SVG: a data URI of that type, or a path
 *  ending in `.svg` (query and fragment aside). Blob URLs cannot tell. */
function isSvgUrl(url: string): boolean {
  return /^data:image\/svg\+xml[;,]/i.test(url) || /\.svg(?:[?#]|$)/i.test(url);
}

/** The `filter` declaration tinting an image to the page's ink: an SVG
 *  (`svg: true`) or, of unknown kind, an SVG-looking URL; never a bitmap,
 *  and never an SVG data URI `applySingleInkToSvg` recoloured already (it
 *  carries `SINGLE_INK_MARK`). Empty when single ink does not apply. */
export function inkFilterDecl(paint: HtmlPaint, svg: boolean | undefined, url: string): string {
  const ink = paint.ink;
  if (!ink || svg === false || (svg === undefined && !isSvgUrl(url)) || isSingleInkSvgUrl(url)) return '';
  return `filter:url(#${ink.id});`;
}

/** The `filter` declaration painting an image's silhouette in `tint` (#995):
 *  a flood of the colour kept where the picture has alpha, defined once per
 *  page and colour (see {@link tintFilterDefs}). A reading system without
 *  CSS filters shows the picture in its own colours. Empty when the colour
 *  is not a `#rrggbb` one. */
export function tintFilterDecl(paint: HtmlPaint, tint: string | undefined): string {
  if (!tint || !paint.tints || !/^#[0-9a-f]{6}$/i.test(tint)) return '';
  const hex = tint.toLowerCase();
  let id = paint.tints.filters.get(hex);
  if (!id) {
    id = `pt-tint-${hex.slice(1)}-${paint.tints.page}`;
    paint.tints.filters.set(hex, id);
  }
  return `filter:url(#${id});`;
}

/** The page's `<filter>` definitions (single ink, then the tints of its
 *  pictures): a zero-size inline SVG, first in the page so every `url(#…)`
 *  on it resolves. Empty when there is none. */
export function inkFilterDefs(ink: InkFilter | undefined, tints?: ReadonlyMap<string, string>): string {
  const filters: string[] = [];
  if (ink) {
    const values = ink.matrix.map((v) => +v.toFixed(6)).join(' ');
    filters.push(`<filter id="${ink.id}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${values}"/></filter>`);
  }
  for (const [hex, id] of tints ?? []) {
    filters.push(`<filter id="${id}" color-interpolation-filters="sRGB"><feFlood flood-color="${hex}"/><feComposite in2="SourceAlpha" operator="in"/></filter>`);
  }
  if (filters.length === 0) return '';
  return (
    `<svg aria-hidden="true" focusable="false" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden;">` +
    filters.join('') +
    `</svg>`
  );
}

/** The URL of an image payload, reporting a miss (the caller then emits the
 *  placeholder). */
export function imageUrl(options: HtmlPaint | undefined, fileId: string, resourceId?: string): string | undefined {
  const url = options?.resourceImageUrl?.(fileId);
  if (!url) options?.missingImage?.(fileId, resourceId);
  if (url && options?.svgUrl) return options.svgUrl(url, fileId, resourceId);
  return url || undefined;
}

/** The markup of an SVG `data:` URI; null for any other URL. */
function svgDataUriText(url: string): string | null {
  const head = /^data:image\/svg\+xml(;[^,]*)?,/i.exec(url);
  if (!head) return null;
  const body = url.slice(head[0].length);
  try {
    if (/;base64/i.test(head[1] ?? '')) {
      const binary = atob(body);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new TextDecoder().decode(bytes);
    }
    return decodeURIComponent(body);
  } catch {
    return null;
  }
}

/** The `svgUrl` of a render (#630): SVG data URIs re-encoded with the
 *  faces their text names, once per URL; null when inlining is off. */
export function svgFontInliner(doc: VDTDocument, options: RenderHtmlOptions): HtmlPaint['svgUrl'] | null {
  const opt = options.inlineSvgFonts;
  if (!opt || doc.config.diagramStyle?.inlineFonts === false) return null;
  const settings = typeof opt === 'object' ? opt : {};
  const provider = settings.fonts ?? registeredFontSyncProvider();
  // Pictures whose resource opts out.
  const keep = new Set<string>();
  const note = (block: VDTBlock) => {
    const r = block.resourceBlock?.resource;
    if (r?.svg?.inlineFonts === false && r.svg.fileId) keep.add(r.svg.fileId);
  };
  for (const b of doc.blocks) note(b);
  for (const p of doc.pages) for (const b of p.floats ?? []) note(b);
  const done = new Map<string, string>();
  const reported = new Set<string>();
  return (url, fileId, resourceId) => {
    if (keep.has(fileId)) return url;
    const cached = done.get(url);
    if (cached !== undefined) return cached;
    const text = svgDataUriText(url);
    let out = url;
    if (text !== null) {
      const result = inlineSvgFontsDetailedSync(text, provider, {
        ...(settings.maxBytes !== undefined ? { maxBytes: settings.maxBytes } : {}),
        ...(settings.withhold ? { withhold: settings.withhold } : {}),
        ...(settings.standIn ? { standIn: settings.standIn } : {}),
        onWarning: (w) => {
          const key = `${fileId}|${w.kind}|${w.kind === 'svgFontUnavailable' ? `${w.family}|${w.weight}|${w.style}` : ''}`;
          if (reported.has(key)) return;
          reported.add(key);
          options.onWarning?.(svgPictureFontWarning(w, fileId, resourceId));
        },
      });
      if (result.svg !== text) out = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(result.svg)}`;
    }
    done.set(url, out);
    return out;
  };
}

/** An image fitted to a box: `<img>` from `resourceImageUrl`, or the neutral
 *  placeholder the canvas backend paints when nothing is registered. */
export function renderFittedImage(
  url: string | undefined,
  alt: string,
  label: string,
  x: number,
  y: number,
  w: number,
  h: number,
  paint?: HtmlPaint,
  svg?: boolean,
  source?: ResourceSafeArea,
): string {
  if (url) {
    const filter = paint ? inkFilterDecl(paint, svg, url) : '';
    return (
      `<img src="${esc(url)}" alt="${esc(alt)}" style="position:absolute;` +
      `left:${x}px;top:${y}px;width:${w}px;height:${h}px;${source ? croppedFitDecl(source) : ''}${filter}" />`
    );
  }
  const labelSize = Math.max(10, Math.min(16, h * 0.1));
  return (
    `<div aria-hidden="true" style="position:absolute;` +
    `left:${x}px;top:${y}px;width:${w}px;height:${h}px;` +
    `background:rgba(160,160,160,0.12);border:1px solid rgba(160,160,160,0.5);box-sizing:border-box;` +
    `display:flex;align-items:center;justify-content:center;` +
    `font:${labelSize}px sans-serif;color:rgba(120,120,120,0.8);` +
    `">${label}</div>`
  );
}

/** An attribute list as HTML: a boolean attribute written `name="name"`,
 *  valid in HTML and XHTML alike (the fixed-layout EPUB converts the
 *  markup). */
function htmlAttrs(attrs: Array<[string, string | true]>): string {
  return attrs.map(([name, value]) => ` ${name}="${esc(value === true ? name : value)}"`).join('');
}

/** A video resource (#454): its player — an HTML5 `<video>` for a
 *  self-hosted file, the YouTube or Vimeo `<iframe>` — or its poster with
 *  the play mark and the QR code, linked to the video. */
export function renderVideoHtml(
  video: VDTResourceVideo | undefined,
  posterFileId: string | undefined,
  alt: string,
  x: number,
  y: number,
  w: number,
  h: number,
  paint: HtmlPaint,
  source?: ResourceSafeArea,
): string {
  const box = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;`;
  const label = alt || 'Video';
  if (video) {
    const stream = video.source !== 'file';
    const own = !stream && video.fileId ? paint.resourceVideoUrl?.(video.fileId) : undefined;
    // Played from an HLS address (no file of its own resolved).
    const hls = !stream && !own && isHlsMimeType(video.mimeType);
    const mode = (stream ? paint.videos?.streams : hls ? (paint.videos?.hls ?? paint.videos?.files) : paint.videos?.files) ?? video.html;
    if (mode === 'player') {
      if (stream && video.embedUrl) {
        return (
          `<iframe class="pt-video" src="${esc(video.embedUrl)}" title="${esc(label)}"` +
          ` allow="${esc(videoEmbedAllow(video.player))}"${video.player.fullscreen ? ' allowfullscreen="allowfullscreen"' : ''}` +
          ` loading="lazy" referrerpolicy="strict-origin-when-cross-origin"` +
          ` style="${box}border:0;background:#000;"></iframe>`
        );
      }
      const src = !stream ? own ?? video.link : undefined;
      if (src) {
        const poster = posterFileId ? paint.resourceImageUrl?.(posterFileId) : undefined;
        return (
          `<video class="pt-video" src="${esc(src + mediaFragment(video))}"${hls ? ' data-pt-hls=""' : ''}${poster ? ` poster="${esc(poster)}"` : ''}` +
          `${htmlAttrs(videoElementAttributes(video.player))} aria-label="${esc(label)}"` +
          ` style="${box}object-fit:cover;background:#000;"></video>`
        );
      }
    }
  }
  // The poster, as printed.
  const url = posterFileId ? imageUrl(paint, posterFileId) : undefined;
  const picture = url
    ? `<img src="${esc(url)}" alt="${esc(label)}" style="position:absolute;left:0;top:0;width:${w}px;height:${h}px;${source ? croppedFitDecl(source) : ''}" />`
    : `<div role="img" aria-label="${esc(label)}" style="position:absolute;left:0;top:0;width:${w}px;height:${h}px;background:#1f1f1f;"></div>`;
  const overlay = video ? videoOverlaySvg(video, w, h) : '';
  const inner = picture + overlay;
  return video?.linkPoster && video.link
    ? `<a class="pt-video-link" href="${esc(video.link)}" rel="noopener noreferrer" style="${box}display:block;">${inner}</a>`
    : `<div style="${box}">${inner}</div>`;
}

/** The play mark and QR code of a video's poster as one SVG over the body
 *  (`w` × `h`). In a mirrored flow the SVG turns back about its own box
 *  like a picture, so the overlays land where they are printed and the code
 *  reads. */
function videoOverlaySvg(video: VDTResourceVideo, w: number, h: number): string {
  const n = (v: number): string => String(Math.round(v * 1000) / 1000);
  const parts: string[] = [];
  const mark = video.playMark;
  if (mark) {
    const { x, y, width: mw, height: mh } = mark.rect;
    const tri = playMarkTriangle(mark).map(([px, py]) => `${n(x + px)},${n(y + py)}`).join(' ');
    if (mark.shape === 'triangle') {
      parts.push(`<polygon points="${tri}" fill="${mark.color}" stroke="${mark.background}" stroke-opacity="${mark.backgroundOpacity}" stroke-width="${n(mh * 0.08)}" stroke-linejoin="round"/>`);
    } else {
      parts.push(mark.shape === 'circle'
        ? `<ellipse cx="${n(x + mw / 2)}" cy="${n(y + mh / 2)}" rx="${n(mw / 2)}" ry="${n(mh / 2)}" fill="${mark.background}" fill-opacity="${mark.backgroundOpacity}"/>`
        : `<rect x="${n(x)}" y="${n(y)}" width="${n(mw)}" height="${n(mh)}" rx="${n(mh * 0.24)}" fill="${mark.background}" fill-opacity="${mark.backgroundOpacity}"/>`);
      parts.push(`<polygon points="${tri}" fill="${mark.color}"/>`);
    }
  }
  const qr = video.qr;
  if (qr) {
    const { x, y, width: qw, height: qh } = qr.rect;
    parts.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(qw)}" height="${n(qh)}" rx="${n(qr.radius)}" fill="${qr.background}"/>`);
    const d = qrModuleRuns(qr).map((r) => `M${n(x + r.x)} ${n(y + r.y)}h${n(r.w)}v${n(r.h)}h${n(-r.w)}z`).join('');
    parts.push(`<path d="${d}" fill="${qr.color}" shape-rendering="crispEdges"/>`);
  }
  if (parts.length === 0) return '';
  return (
    `<svg aria-hidden="true" focusable="false" width="${n(w)}" height="${n(h)}" viewBox="0 0 ${n(w)} ${n(h)}"` +
    ` style="position:absolute;left:0;top:0;overflow:visible;">${parts.join('')}</svg>`
  );
}

/** The `object-fit` of a picture cropped within its safe area (#442): the
 *  shown part spans the picture's whole width or whole height and has the
 *  box's ratio, so `cover` scales the picture as the crop does, and the
 *  position puts the shown part in the box. */
function croppedFitDecl(source: ResourceSafeArea): string {
  const px = source.width < 1 ? (source.x / (1 - source.width)) * 100 : 0;
  const py = source.height < 1 ? (source.y / (1 - source.height)) * 100 : 0;
  return `object-fit:cover;object-position:${+px.toFixed(3)}% ${+py.toFixed(3)}%;`;
}

/** Wrap absolutely positioned page markup in a box clipped to a rounded
 *  outline: the box sits on the outline and rounds its corners, and an inner
 *  layer shifted back by the box's offset keeps the children's page
 *  coordinates. */
export function clipToOutline(html: string, o: RoundedOutline): string {
  if (!html) return '';
  const radius = o.radii.map((r) => `${r}px`).join(' ');
  return (
    `<div aria-hidden="true" style="position:absolute;left:${o.x}px;top:${o.y}px;` +
    `width:${o.width}px;height:${o.height}px;overflow:hidden;border-radius:${radius};">` +
    `<div style="position:absolute;left:${-o.x}px;top:${-o.y}px;">${html}</div></div>`
  );
}
