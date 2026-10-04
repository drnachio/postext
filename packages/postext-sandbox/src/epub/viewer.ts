// Pure helpers of the EPUB tab's reader: the generated file is read back
// (`readEpub`) and shown from its own parts, each zip entry an object URL,
// so what the reader shows is what the download holds.

import { dirOf, resolveHref, type EpubNavPoint } from 'postext-epub';

/** The URL a zip path is shown from, or undefined to leave a reference as
 *  written (a link to another content document, which the reader follows
 *  itself). */
export type ZipUrlOf = (zipPath: string) => string | undefined;

const ABSOLUTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

/** A reference resolved against `base` (a directory of the zip) and
 *  replaced by its URL, its fragment kept; as written when it is absolute
 *  (`https:`, `data:`, `#id`) or `urlOf` has no URL for it. */
function rewriteRef(ref: string, base: string, urlOf: ZipUrlOf): string {
  const trimmed = ref.trim();
  if (!trimmed || ABSOLUTE.test(trimmed)) return ref;
  const resolved = resolveHref(base, trimmed);
  const hash = resolved.indexOf('#');
  const path = hash < 0 ? resolved : resolved.slice(0, hash);
  const url = urlOf(path);
  return url === undefined ? ref : url + (hash < 0 ? '' : resolved.slice(hash));
}

/** The `url()`s of a stylesheet (or a `style` attribute) pointed at their
 *  object URLs. */
export function rewriteCssUrls(css: string, base: string, urlOf: ZipUrlOf): string {
  return css.replace(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s]*))\s*\)/g, (whole, dq: string | undefined, sq: string | undefined, bare: string | undefined) => {
    const ref = dq ?? sq ?? bare ?? '';
    const next = rewriteRef(ref, base, urlOf);
    return next === ref ? whole : `url("${next}")`;
  });
}

const ATTR = /(\s(?:src|href|xlink:href|poster|data)\s*=\s*)(?:"([^"]*)"|'([^']*)')/g;
const STYLE_ATTR = /(\sstyle\s*=\s*)(?:"([^"]*)"|'([^']*)')/g;
const STYLE_ELEMENT = /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi;

/** The references of a content document (`src`, `href`, `xlink:href`,
 *  `url()` in its styles) pointed at their object URLs. Entities in
 *  attribute values are rare in what the writer emits and are left alone:
 *  a reference with one stays as written. */
export function rewriteMarkupRefs(markup: string, base: string, urlOf: ZipUrlOf): string {
  return markup
    .replace(ATTR, (whole, lead: string, dq: string | undefined, sq: string | undefined) => {
      const ref = dq ?? sq ?? '';
      if (ref.includes('&')) return whole;
      const next = rewriteRef(ref, base, urlOf);
      return next === ref ? whole : `${lead}"${next}"`;
    })
    .replace(STYLE_ATTR, (whole, lead: string, dq: string | undefined, sq: string | undefined) => {
      const css = dq ?? sq ?? '';
      const next = rewriteCssUrls(css, base, urlOf);
      return next === css ? whole : `${lead}"${next.replace(/"/g, '&quot;')}"`;
    })
    .replace(STYLE_ELEMENT, (_whole, open: string, css: string, close: string) => `${open}${rewriteCssUrls(css, base, urlOf)}${close}`);
}

/** Where a link of the content document at `docPath` goes. */
export type LinkTarget =
  | { kind: 'external'; url: string }
  | { kind: 'internal'; path: string; fragment: string };

export function linkTarget(docPath: string, href: string): LinkTarget | null {
  const ref = href.trim();
  if (!ref) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(ref)) {
    // Only what a reader may open: web pages and mail.
    return /^(?:https?|mailto):/i.test(ref) ? { kind: 'external', url: ref } : null;
  }
  const resolved = ref.startsWith('#') ? docPath + ref : resolveHref(dirOf(docPath), ref);
  const hash = resolved.indexOf('#');
  return {
    kind: 'internal',
    path: hash < 0 ? resolved : resolved.slice(0, hash),
    fragment: hash < 0 ? '' : decodeURIComponent(resolved.slice(hash + 1)),
  };
}

/** One screen of a fixed-layout book: the spine indices shown at its left
 *  and right (null for an empty side). */
export interface FixedScreen {
  left: number | null;
  right: number | null;
}

/** Which side a fixed-layout page sits on in a spread, from its itemref
 *  properties (`page-spread-left`, `page-spread-right`; centred and
 *  unmarked pages stand alone). */
function spreadSide(properties: readonly string[]): 'left' | 'right' | 'center' | null {
  if (properties.includes('page-spread-left') || properties.includes('rendition:page-spread-left')) return 'left';
  if (properties.includes('page-spread-right') || properties.includes('rendition:page-spread-right')) return 'right';
  if (properties.includes('rendition:page-spread-center') || properties.includes('page-spread-center')) return 'center';
  return null;
}

/** The screens of a fixed-layout book, in reading order. One page per
 *  screen, or (`spreads`) two facing pages: a page marked for the side a
 *  spread opens on (the left one when the pages progress left to right,
 *  the right one in a right-to-left book) is paired with the next page
 *  when that one is marked for the other side. A page alone keeps its
 *  side, so a recto stands at the right as in the printed book. */
export function fixedScreens(
  spine: readonly { properties: readonly string[] }[],
  progression: 'ltr' | 'rtl',
  spreads: boolean,
): FixedScreen[] {
  const out: FixedScreen[] = [];
  const opens = progression === 'rtl' ? 'right' : 'left';
  const closes = progression === 'rtl' ? 'left' : 'right';
  for (let i = 0; i < spine.length; i++) {
    const side = spreadSide(spine[i]!.properties);
    if (!spreads) {
      out.push(progression === 'rtl' ? { left: null, right: i } : { left: i, right: null });
      continue;
    }
    const next = i + 1 < spine.length ? spreadSide(spine[i + 1]!.properties) : null;
    if (side === opens && next === closes) {
      out.push(opens === 'left' ? { left: i, right: i + 1 } : { left: i + 1, right: i });
      i++;
    } else if (side === 'left') {
      out.push({ left: i, right: null });
    } else if (side === 'right') {
      out.push({ left: null, right: i });
    } else {
      // Centred or unmarked: alone, on the side the book opens on.
      out.push(opens === 'left' ? { left: i, right: null } : { left: null, right: i });
    }
  }
  return out;
}

/** The screen that shows spine index `index` (0 when none does). */
export function screenOf(screens: readonly FixedScreen[], index: number): number {
  const at = screens.findIndex((s) => s.left === index || s.right === index);
  return at < 0 ? 0 : at;
}

/** The first spine index a screen shows, in reading order. */
export function firstIndexOf(screen: FixedScreen | undefined): number {
  if (!screen) return 0;
  const shown = [screen.left, screen.right].filter((i): i is number => i !== null);
  return shown.length > 0 ? Math.min(...shown) : 0;
}

/** A table of contents as a flat list with each entry's depth. */
export function flattenToc(points: readonly EpubNavPoint[], depth = 0): { label: string; href: string; depth: number }[] {
  return points.flatMap((p) => [
    { label: p.label, href: p.href, depth },
    ...flattenToc(p.children ?? [], depth + 1),
  ]);
}

/** Whether two facing pages of `viewport` fit the area better than one:
 *  when the area is wide enough that each page of a spread is drawn at no
 *  less than three quarters of the size a single page would have. */
export function prefersSpreads(area: { width: number; height: number }, viewport: { width: number; height: number }): boolean {
  if (area.width <= 0 || area.height <= 0 || viewport.width <= 0 || viewport.height <= 0) return false;
  const single = Math.min(area.width / viewport.width, area.height / viewport.height);
  const spread = Math.min(area.width / (2 * viewport.width), area.height / viewport.height);
  return spread >= 0.75 * single;
}

/** Readable byte size (`2.4 MB`). */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} kB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** After a page key pressed inside a content document (`target`): the
 *  frame goes with the page it turns, and the focus with it, so the
 *  reader (`area`) takes the focus to receive the next key. A key pressed
 *  on the reader itself leaves the focus where it is. */
export function keepReaderFocus(target: Node | null, area: Pick<HTMLElement, 'ownerDocument' | 'focus'> | null): void {
  if (area && target && target.ownerDocument !== area.ownerDocument) area.focus({ preventScroll: true });
}

/** Room kept under the reader for the toolbar docked along the bottom of
 *  the phone layout: its measured height, the 8 px it floats above the
 *  edge and a gap. Before it is measured, room for one row of buttons, or
 *  two with large targets (which may wrap). */
export function dockedToolbarReserve(height: number | null, large: boolean): number {
  if (height === null || height <= 0) return large ? 120 : 64;
  return Math.ceil(height) + DOCK_OFFSET + DOCK_GAP;
}
const DOCK_OFFSET = 8;
const DOCK_GAP = 12;
