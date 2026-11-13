// The laid-out pages as HTML: positioned text the browser can select,
// search and read aloud, written by `renderHtmlBook` (shared with the
// Sandbox's Download as HTML, #1544). One self-contained file (pictures
// and fonts as data URIs) or a folder (index.html beside assets/): the
// files and where they go are this module's.

import { join } from 'node:path';
import { htmlBookFiles, redistributableFaces, renderHtmlBook } from 'postext';
import { diagramInkHex, mimeForFile } from 'postext/bundle';
import { UsageError, type Options } from '../args';
import type { FontSet } from '../fonts';
import type { Book } from '../input';
import { byteLength, writeOut } from '../io';
import type { Layout } from '../layout';
import type { Reporter } from '../log';

const dataUri = (mime: string, bytes: Uint8Array | string) =>
  `data:${mime};base64,${Buffer.from(typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes).toString('base64')}`;
const safeName = (s: string) => s.replace(/[^\w.-]+/g, '_');

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

  // Pictures (SVGs recoloured for single ink, as the Sandbox shows them);
  // self-hosted videos go beside the page, embedded they show their poster.
  const urls = new Map<string, string>();
  const videoUrls = new Map<string, string>();
  for (const file of htmlBookFiles(book.resources, (id) => book.files.get(id), { inkHex: diagramInkHex(book.config), videos: assets === 'folder' })) {
    (file.kind === 'video' ? videoUrls : urls).set(file.fileId, asset(safeName(file.fileId), mimeForFile(file.fileId), file.content));
  }

  // Fonts: a family the book may not hand on stays out, and the open
  // family it names as its fallback goes in under its name (#993).
  const { faces, notes } = await redistributableFaces(fonts.usedFaces(), book.config.customFonts, (family) => fonts.exportStandIn(family));
  const pageFaces = faces.map((f) => {
    const file = `fonts/${safeName(`${f.family}-${f.weight}${f.style === 'italic' ? 'i' : ''}.${f.format}`)}`;
    return { family: f.family, weight: f.weight, style: f.style, url: asset(file, f.format === 'otf' ? 'font/otf' : 'font/ttf', f.bytes) };
  });

  const html = reporter.time('html', () => renderHtmlBook(layout.docs, {
    title: book.name,
    lang: book.config.locale ?? book.locale,
    mode,
    faces: pageFaces,
    fontNotes: notes,
    pictureUrl: (fileId) => urls.get(fileId),
    videoUrl: (fileId) => videoUrls.get(fileId),
    videoPosters: assets === 'embed',
    onWarning: (w) => reporter.warn(w),
  }));
  await Promise.all(written);
  await writeOut(page, html);
  reporter.output({ kind: 'html', path: page, bytes: byteLength(html), pages: layout.pageCount });
}
