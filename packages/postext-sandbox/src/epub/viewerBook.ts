// The generated EPUB opened for the reader: every part of the zip served
// from an object URL made on first use, stylesheets and content documents
// with their references pointed at those URLs (./viewer.ts).

import { dirOf, readEpub, type ReadEpubResult } from 'postext-epub';
import { rewriteCssUrls, rewriteMarkupRefs } from './viewer';

export interface ViewerBook {
  epub: ReadEpubResult;
  /** The URL a content document of the spine is shown from. */
  documentUrl(path: string): string | undefined;
  /** Revoke every URL made. */
  dispose(): void;
}

const TYPE_BY_EXTENSION: Record<string, string> = {
  xhtml: 'application/xhtml+xml',
  html: 'application/xhtml+xml',
  css: 'text/css',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  woff2: 'font/woff2',
  woff: 'font/woff',
  ttf: 'font/ttf',
  otf: 'font/otf',
};

export function openViewerBook(bytes: Uint8Array): ViewerBook {
  const epub = readEpub(bytes);
  const typeOf = new Map<string, string>();
  for (const item of epub.manifest.values()) typeOf.set(item.path, item.mediaType);
  const urls = new Map<string, string>();
  const text = new TextDecoder();
  const spinePaths = new Set(epub.spine.map((s) => s.path));

  const mediaType = (path: string): string =>
    typeOf.get(path) ?? TYPE_BY_EXTENSION[path.slice(path.lastIndexOf('.') + 1).toLowerCase()] ?? 'application/octet-stream';

  const urlOf = (path: string): string | undefined => {
    const made = urls.get(path);
    if (made) return made;
    const data = epub.files.get(path);
    if (!data) return undefined;
    const type = mediaType(path);
    let blob: Blob;
    if (type === 'text/css') {
      blob = new Blob([rewriteCssUrls(text.decode(data), dirOf(path), resourceUrl)], { type });
    } else if (type === 'application/xhtml+xml' || type === 'image/svg+xml') {
      blob = new Blob([rewriteMarkupRefs(text.decode(data), dirOf(path), resourceUrl)], { type });
    } else {
      blob = new Blob([data as BlobPart], { type });
    }
    const url = URL.createObjectURL(blob);
    urls.set(path, url);
    return url;
  };
  // A reference inside a document: a link to another content document is
  // left as written, for the reader to follow.
  const resourceUrl = (path: string): string | undefined => (spinePaths.has(path) ? undefined : urlOf(path));

  return {
    epub,
    documentUrl: (path) => (spinePaths.has(path) ? urlOf(path) : undefined),
    dispose: () => {
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
    },
  };
}
