// EPUB 3 (postext-epub): fixed-layout pages as printed, or reflowable text
// styled from the same configuration. The package metadata comes from the
// first chapter's front matter, as in the Sandbox.

import { readFileSync } from 'node:fs';
import { applySingleInkToSvg } from 'postext';
import { diagramInkHex, mimeForFile } from 'postext/bundle';
import { renderToEpub, type EpubCover, type EpubFontFile, type EpubWarning, type RenderToEpubOptions } from 'postext-epub';
import { epubMetadataOf } from '../../../postext-sandbox/src/epub/metadata';
import type { Options } from '../args';
import type { FontSet } from '../fonts';
import type { Book } from '../input';
import { byteLength, writeOut } from '../io';
import type { Layout } from '../layout';
import type { Reporter } from '../log';

const COVER_TYPES: Record<string, EpubCover['mediaType']> = {
  'image/jpeg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
  'image/svg+xml': 'image/svg+xml',
};

function coverOf(book: Book, opts: Options): EpubCover | undefined {
  const path = opts.string('cover');
  if (path) {
    const mediaType = COVER_TYPES[mimeForFile(path)];
    if (mediaType) return { bytes: new Uint8Array(readFileSync(path)), mediaType };
    return undefined;
  }
  if (!book.thumbnail) return undefined;
  const bytes = book.files.get(book.thumbnail);
  const mediaType = COVER_TYPES[mimeForFile(book.thumbnail)];
  return bytes && mediaType ? { bytes, mediaType } : undefined;
}

function epubWarningMessage(w: EpubWarning): string {
  switch (w.kind) {
    case 'missingFont':
      return `no face of "${w.family}"${w.weight !== undefined ? ` ${w.weight}` : ''}${w.style === 'italic' ? ' italic' : ''} to embed; readers fall back`;
    case 'missingImage':
      return `no bytes for picture ${w.fileId}`;
    case 'svgFontUnavailable':
      return `no face of "${w.family}" ${w.weight}${w.style === 'italic' ? ' italic' : ''} to embed in picture ${w.fileId}; its text falls back`;
    case 'svgFontsTooLarge':
      return `the faces picture ${w.fileId} names take ${w.bytes} bytes, over the ${w.maxBytes} cap; none was embedded in it`;
    case 'fontWithheld':
      return `"${w.family}" is not redistributable and was left out${w.fileId ? ` of picture ${w.fileId}` : ''}; readers fall back`;
    case 'unsupported':
      return w.detail;
  }
}

export async function writeEpub(book: Book, layout: Layout, fonts: FontSet, opts: Options, reporter: Reporter, out: string): Promise<void> {
  const layoutKind = opts.choice('layout', ['fixed', 'reflowable'] as const) ?? 'fixed';
  const withheld = new Set((book.config.customFonts ?? []).filter((f) => f.redistributable === false).map((f) => f.name.toLowerCase()));
  const epubFonts: EpubFontFile[] = [];
  for (const f of fonts.usedFaces()) {
    if (withheld.has(f.family.toLowerCase())) {
      reporter.warn({ kind: 'fontWithheld', severity: 'info', message: `"${f.family}" may not be copied out of the book: the EPUB names it without its file` });
      continue;
    }
    epubFonts.push({ family: f.family, weight: f.weight, style: f.style, bytes: f.bytes, format: f.format });
  }
  const inkHex = diagramInkHex(book.config);
  const svgOf = new Set(book.resources.filter((r) => r.kind === 'svg').map((r) => r.svg?.fileId));
  const metadata = epubMetadataOf(layout.docs[0]?.metadata ?? {}, book.config, { kind: 'preset', id: book.id, locale: book.locale, name: book.name }, book.locale);
  const cover = coverOf(book, opts);
  const options: RenderToEpubOptions = {
    layout: layoutKind,
    metadata,
    fonts: epubFonts,
    resourceBytes: (fileId) => {
      const bytes = book.files.get(fileId);
      if (!bytes) return undefined;
      if (svgOf.has(fileId) && inkHex) {
        return { bytes: new TextEncoder().encode(applySingleInkToSvg(new TextDecoder().decode(bytes), inkHex)), mediaType: 'image/svg+xml' };
      }
      return { bytes, mediaType: mimeForFile(fileId) };
    },
    ...(cover ? { cover } : {}),
    onWarning: (w) => reporter.warn({
      kind: `epub.${w.kind}`,
      severity: 'warning',
      message: epubWarningMessage(w),
    }),
  };
  const bytes = await reporter.time('epub', () => renderToEpub(layout.docs, options));
  await writeOut(out, bytes);
  reporter.output({ kind: 'epub', path: out, bytes: byteLength(bytes), pages: layout.pageCount });
}
