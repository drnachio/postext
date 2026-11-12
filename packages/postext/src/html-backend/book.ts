// A whole book as one HTML page (#1544): every chapter's pages, positioned
// text the browser can select, search and read aloud, with the page's
// fonts, the exercise script and the links between chapters. The command
// line's `postext html` and the Sandbox's Library (Download as HTML) both
// write the page here; each host resolves where pictures, videos and font
// files live (data URIs, files beside the page) and hands over the URLs.
// No file system, no DOM: the module runs in Node, Bun, a page or a worker.

import type { CustomFontFamily, Resource } from '../types.js';
import type { VDTDocument } from '../vdt.js';
import type { RenderWarning } from '../vdt/warnings.js';
import { applySingleInkToSvg } from '../svg/singleInk.js';
import { screenSvgColors } from '../svg/spotPaints.js';
import { exerciseDataOf } from '../exercises/digital.js';
import { EXERCISE_SCRIPT } from '../exercises/runtime.js';
import { formatWarning } from '../pipeline/contentWarnings.js';
import { anchoredResourceIds } from './segmentText.js';
import { HTML_TEXT_RESET, renderToHtml, type RenderHtmlOptions } from './render.js';

/** One `@font-face` of the page: the file's URL as the host serves it (a
 *  data URI, a path beside the page). */
export interface HtmlBookFace {
  family: string;
  weight: number | string;
  style: string;
  url: string;
  /** The characters the file holds, when it is one slice of a face. */
  unicodeRange?: string;
}

/** A family the book may not hand on (`redistributable: false`, #993):
 *  set in the open family it names as `standIn`, under its own name, or,
 *  without one, named without its file. */
export interface HtmlBookFontNote {
  family: string;
  standIn?: string;
}

/** What the page could not do as asked: the HTML backend's warnings
 *  (`html.missingImage`, `html.svgFontUnavailable`…) and the families
 *  left out of it (`fontStoodIn`, `fontWithheld`). */
export interface HtmlBookWarning {
  kind: string;
  severity: 'info' | 'warning';
  message: string;
}

export interface RenderHtmlBookOptions {
  /** The page's `<title>`. */
  title: string;
  /** The page's `lang`. */
  lang: string;
  /** Pages side by side (`multi`, the default) or one under another. */
  mode?: 'single' | 'multi';
  /** The fonts the pages are set in, as `@font-face` rules. */
  faces: readonly HtmlBookFace[];
  /** The families left out ({@link HtmlBookFontNote}), reported first. */
  fontNotes?: readonly HtmlBookFontNote[];
  /** A picture's URL by its `fileId`: the bytes of {@link htmlBookFiles}
   *  served by the host. Undefined draws a placeholder. */
  pictureUrl: (fileId: string) => string | undefined;
  /** A self-hosted video's URL by its `fileId`. */
  videoUrl?: (fileId: string) => string | undefined;
  /** Self-hosted videos shown as their posters (a page with no file
   *  beside it has no video to play). */
  videoPosters?: boolean;
  onWarning?: (warning: HtmlBookWarning) => void;
}

/** What a family left out of the page is reported as. */
export function fontNoteWarning(note: HtmlBookFontNote, output = 'HTML'): HtmlBookWarning {
  return note.standIn
    ? { kind: 'fontStoodIn', severity: 'info', message: `"${note.family}" may not be copied out of the book: the ${output} sets it in ${note.standIn}, under the same name` }
    : { kind: 'fontWithheld', severity: 'info', message: `"${note.family}" may not be copied out of the book: the ${output} names it without its file` };
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** One `@font-face` rule; `unicode-range` only on a slice. */
export function htmlFontFaceRule(face: HtmlBookFace): string {
  return `@font-face{font-family:${JSON.stringify(face.family)};font-weight:${face.weight};font-style:${face.style};font-display:block;src:url(${JSON.stringify(face.url)})${face.unicodeRange ? `;unicode-range:${face.unicodeRange}` : ''}}`;
}

/**
 * The book's chapters (one document each, in order, as `buildBundle` or a
 * print chain gives them) as one self-contained HTML page. The pages are
 * the print layout in page pixels (`page.dpi`), shown at 96 dpi as a
 * browser sizes a printed inch; the paper colour fills the window; a
 * reference to a figure another chapter placed links to it; a book with
 * exercises gets the script that makes them answerable.
 */
export function renderHtmlBook(docs: readonly VDTDocument[], options: RenderHtmlBookOptions): string {
  const { onWarning } = options;
  for (const note of options.fontNotes ?? []) onWarning?.(fontNoteWarning(note));
  const refTargets = new Set(docs.flatMap((d) => [...anchoredResourceIds(d)]));
  // The URLs serve the pictures as the screen shows them (single ink
  // applied by htmlBookFiles): no filter on top.
  const resourceImageUrl = Object.assign((fileId: string) => options.pictureUrl(fileId), { singleInk: false });
  const renderOptions: RenderHtmlOptions = {
    mode: options.mode ?? 'multi',
    refTargets,
    resourceImageUrl,
    resourceVideoUrl: (fileId) => options.videoUrl?.(fileId),
    ...(options.videoPosters ? { videos: { files: 'poster' as const } } : {}),
    singleInk: false,
    onWarning: (w: RenderWarning) => onWarning?.({ kind: `html.${w.kind}`, severity: 'warning', message: formatWarning(w) }),
  };
  const body = docs.map((d) => renderToHtml(d, renderOptions)).join('\n');
  // Exercises (#1230): the script that makes them answerable, checks
  // them and keeps the answers in the browser, under the file's path.
  const exercises = docs.some((d) => exerciseDataOf(d) !== undefined)
    ? `<script>${EXERCISE_SCRIPT.replace(/<\/(script)/gi, '<\\/$1')}</script>`
    : '';
  // The pages are the print layout, in page pixels (page.dpi, 300 by
  // default): shown at 96 dpi, as a browser sizes a printed inch.
  const dpi = docs[0]?.config.page.dpi ?? 96;
  const zoom = Math.round((96 / dpi) * 10000) / 10000;
  // The paper colour fills the window, as in the Sandbox's HTML view
  // (a translucent colour over white).
  const paper = docs[0]?.config.page.backgroundColor?.hex;
  const background = !paper || paper === 'transparent' ? '#ffffff' : `linear-gradient(${paper},${paper}),#ffffff`;
  return [
    '<!doctype html>',
    `<html lang="${escapeHtml(options.lang)}">`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta name="generator" content="postext">`,
    `<title>${escapeHtml(options.title)}</title>`,
    '<style>',
    ...options.faces.map(htmlFontFaceRule),
    `html,body{margin:0;background:${background}}body{${HTML_TEXT_RESET}}`,
    `.postext-book{zoom:${zoom};padding:24px 0}`,
    '.postext-book .pt-page{margin-left:auto;margin-right:auto}',
    '</style>',
    '</head>',
    '<body>',
    '<main class="postext-book">',
    body,
    '</main>',
    ...(exercises ? [exercises] : []),
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

/** A file the page refers to: a picture (SVGs as the screen shows them,
 *  recoloured for single ink) or a self-hosted video. */
export interface HtmlBookFile {
  fileId: string;
  kind: 'picture' | 'video';
  /** The bytes to serve, or the SVG markup. */
  content: Uint8Array | string;
}

/** The pictures (and, with `videos`, the self-hosted videos) the book's
 *  resources name and `bytesOf` has, in the order the resources list
 *  them, each once. `inkHex`: the single-ink colour (`diagramInkHex`), or
 *  null. */
export function htmlBookFiles(
  resources: readonly Resource[],
  bytesOf: (fileId: string) => Uint8Array | undefined,
  options: { inkHex: string | null; videos?: boolean },
): HtmlBookFile[] {
  const out: HtmlBookFile[] = [];
  const seen = new Set<string>();
  for (const r of resources) {
    const fileId = r.kind === 'svg' ? r.svg?.fileId : r.kind === 'bitmap' ? r.bitmap?.fileId : r.kind === 'video' ? r.video?.poster?.fileId : undefined;
    const bytes = fileId ? bytesOf(fileId) : undefined;
    if (fileId && bytes && !seen.has(fileId)) {
      seen.add(fileId);
      // A spot ink named in a paint is the print PDF's: here, the colour.
      const text = r.kind === 'svg' ? new TextDecoder().decode(bytes) : undefined;
      const svg = text !== undefined ? screenSvgColors(text) : undefined;
      const content = svg !== undefined && (options.inkHex || svg !== text) ? (options.inkHex ? applySingleInkToSvg(svg, options.inkHex) : svg) : bytes;
      out.push({ fileId, kind: 'picture', content });
    }
    // Self-hosted videos go beside the page; embedded, they show their poster.
    const video = r.kind === 'video' ? r.video?.fileId : undefined;
    const videoBytes = video && options.videos ? bytesOf(video) : undefined;
    if (video && videoBytes && !seen.has(video)) {
      seen.add(video);
      out.push({ fileId: video, kind: 'video', content: videoBytes });
    }
  }
  return out;
}

/**
 * The faces a file that leaves the app may carry (#993): every face of
 * `used` but those of a family marked `redistributable: false`, whose
 * place is taken by the faces `standIn` gives for it (the open family it
 * names as its fallback, under its own name), once per family. The notes
 * say which families were stood in or left without a file.
 */
export async function redistributableFaces<F extends { family: string }>(
  used: Iterable<F>,
  customFonts: readonly Pick<CustomFontFamily, 'name' | 'redistributable'>[] | undefined,
  standIn: (family: string) => Promise<(F & { standsInFor?: string })[]>,
): Promise<{ faces: F[]; notes: HtmlBookFontNote[] }> {
  const withheld = new Set((customFonts ?? []).filter((f) => f.redistributable === false).map((f) => f.name.toLowerCase()));
  const faces: F[] = [];
  const notes: HtmlBookFontNote[] = [];
  const told = new Set<string>();
  for (const f of used) {
    const key = f.family.toLowerCase();
    if (!withheld.has(key)) {
      faces.push(f);
      continue;
    }
    if (told.has(key)) continue;
    told.add(key);
    const stand = await standIn(f.family);
    if (stand.length > 0) {
      notes.push({ family: f.family, standIn: stand[0]!.standsInFor ?? f.family });
      faces.push(...stand);
    } else {
      notes.push({ family: f.family });
    }
  }
  return { faces, notes };
}
