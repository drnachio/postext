// The laid-out pages as HTML (`renderToHtml`): positioned text the browser
// can select, search and read aloud. One self-contained file (pictures and
// fonts as data URIs) or a folder (index.html beside assets/).

import { join } from 'node:path';
import { anchoredResourceIds, applySingleInkToSvg, formatWarning, HTML_TEXT_RESET, renderToHtml, type RenderHtmlOptions } from 'postext';
import { diagramInkHex, mimeForFile } from 'postext/bundle';
import { UsageError, type Options } from '../args';
import type { Face, FontSet } from '../fonts';
import type { Book } from '../input';
import { byteLength, writeOut } from '../io';
import type { Layout } from '../layout';
import type { Reporter } from '../log';

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const dataUri = (mime: string, bytes: Uint8Array | string) =>
  `data:${mime};base64,${Buffer.from(typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes).toString('base64')}`;
const safeName = (s: string) => s.replace(/[^\w.-]+/g, '_');

/** Families a book marks as not to be copied out (`redistributable: false`). */
function withheldFamilies(book: Book): Set<string> {
  return new Set((book.config.customFonts ?? []).filter((f) => f.redistributable === false).map((f) => f.name.toLowerCase()));
}

export async function writeHtml(book: Book, layout: Layout, fonts: FontSet, opts: Options, reporter: Reporter, out: string): Promise<void> {
  const mode = opts.choice('mode', ['single', 'multi'] as const) ?? 'multi';
  const singleFile = out === '-' || /\.html?$/i.test(out);
  const assets = opts.choice('assets', ['embed', 'folder'] as const) ?? (singleFile ? 'embed' : 'folder');
  if (assets === 'folder' && out === '-') throw new UsageError('--assets folder needs an output folder, not stdout');
  const dir = singleFile ? out.replace(/[^/\\]*$/, '') || '.' : out;
  const page = singleFile ? out : join(out, 'index.html');
  const written: Promise<void>[] = [];
  const asset = (path: string, mime: string, bytes: Uint8Array | string): string => {
    if (assets === 'embed') return dataUri(mime, bytes);
    written.push(writeOut(join(dir, 'assets', path), bytes));
    return `assets/${path}`;
  };

  // Pictures (SVGs recoloured for single ink, as the Sandbox shows them).
  const inkHex = diagramInkHex(book.config);
  const urls = new Map<string, string>();
  const videoUrls = new Map<string, string>();
  for (const r of book.resources) {
    const fileId = r.kind === 'svg' ? r.svg?.fileId : r.kind === 'bitmap' ? r.bitmap?.fileId : r.kind === 'video' ? r.video?.poster?.fileId : undefined;
    const bytes = fileId ? book.files.get(fileId) : undefined;
    if (fileId && bytes && !urls.has(fileId)) {
      const content = r.kind === 'svg' && inkHex ? applySingleInkToSvg(new TextDecoder().decode(bytes), inkHex) : bytes;
      urls.set(fileId, asset(safeName(fileId), mimeForFile(fileId), content));
    }
    // Self-hosted videos go beside the page; embedded, they show their poster.
    const video = r.kind === 'video' ? r.video?.fileId : undefined;
    const videoBytes = video ? book.files.get(video) : undefined;
    if (video && videoBytes && assets === 'folder') videoUrls.set(video, asset(safeName(video), mimeForFile(video), videoBytes));
  }

  // Fonts, as @font-face rules.
  const withheld = withheldFamilies(book);
  const faces: Face[] = fonts.usedFaces().filter((f) => {
    if (!withheld.has(f.family.toLowerCase())) return true;
    reporter.warn({ kind: 'fontWithheld', severity: 'info', message: `"${f.family}" may not be copied out of the book: the HTML names it without its file` });
    return false;
  });
  const fontFaces = faces.map((f) => {
    const file = `fonts/${safeName(`${f.family}-${f.weight}${f.style === 'italic' ? 'i' : ''}.${f.format}`)}`;
    const url = asset(file, f.format === 'otf' ? 'font/otf' : 'font/ttf', f.bytes);
    return `@font-face{font-family:${JSON.stringify(f.family)};font-weight:${f.weight};font-style:${f.style};font-display:block;src:url(${JSON.stringify(url)})}`;
  });

  const refTargets = new Set(layout.docs.flatMap((d) => [...anchoredResourceIds(d)]));
  const resourceImageUrl = Object.assign((fileId: string) => urls.get(fileId), { singleInk: false });
  const options: RenderHtmlOptions = {
    mode,
    refTargets,
    resourceImageUrl,
    resourceVideoUrl: (fileId) => videoUrls.get(fileId),
    ...(assets === 'embed' ? { videos: { files: 'poster' as const } } : {}),
    singleInk: false,
    onWarning: (w) => reporter.warn({ kind: `html.${w.kind}`, severity: 'warning', message: formatWarning(w) }),
  };
  const body = reporter.time('html', () => layout.docs.map((d) => renderToHtml(d, options)).join('\n'));
  const lang = book.config.locale ?? book.locale;
  // The pages are the print layout, in page pixels (page.dpi, 300 by
  // default): shown at 96 dpi, as a browser sizes a printed inch.
  const dpi = layout.docs[0]?.config.page.dpi ?? 96;
  const zoom = Math.round((96 / dpi) * 10000) / 10000;
  // The paper colour fills the window, as in the Sandbox's HTML view
  // (a translucent colour over white).
  const paper = layout.docs[0]?.config.page.backgroundColor?.hex;
  const background = !paper || paper === 'transparent' ? '#ffffff' : `linear-gradient(${paper},${paper}),#ffffff`;
  const html = [
    '<!doctype html>',
    `<html lang="${escapeHtml(lang)}">`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta name="generator" content="postext">`,
    `<title>${escapeHtml(book.name)}</title>`,
    '<style>',
    ...fontFaces,
    `html,body{margin:0;background:${background}}body{${HTML_TEXT_RESET}}`,
    `.postext-book{zoom:${zoom};padding:24px 0}`,
    '.postext-book .pt-page{margin-left:auto;margin-right:auto}',
    '</style>',
    '</head>',
    '<body>',
    '<main class="postext-book">',
    body,
    '</main>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
  await Promise.all(written);
  await writeOut(page, html);
  reporter.output({ kind: 'html', path: page, bytes: byteLength(html), pages: layout.pageCount });
}
