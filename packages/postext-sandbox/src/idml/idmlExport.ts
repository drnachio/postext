// The IDML export of the Sandbox (#1491): the whole book, laid out as the
// PDF is, written by `postext/idml` as an InDesign Markup package. The
// writer is loaded on the first export. The export dialog uses it.

import type { PostextConfig, Resource, VDTDocument } from 'postext';
import type { IdmlWarning } from 'postext/idml';
import { getBlob } from '../storage/blobStore.js';

export const IDML_MIME = 'application/vnd.adobe.indesign-idml-package';

/** Characters a file name cannot hold on some system. */
const UNSAFE_NAME = /[\\/:*?"<>|\u0000-\u001f]+/g;

/** `<book title>.idml` (`document.idml` for a book without a title). */
export function idmlFileName(bookTitle: string): string {
  const name = bookTitle.replace(UNSAFE_NAME, ' ').replace(/\s+/g, ' ').trim();
  return `${name || 'document'}.idml`;
}

/** Every stored file id the book names: its resources' pictures (bitmaps,
 *  video posters, SVG sources and their PDF print masters) and the pictures
 *  of its design (any `fileId` or `pdfFileId` in the configuration). */
export function idmlFileIds(resources: readonly Resource[], config: PostextConfig): string[] {
  const ids = new Set<string>();
  const add = (id: unknown) => {
    if (typeof id === 'string' && id && !id.startsWith('data:')) ids.add(id);
  };
  for (const r of resources) {
    if (r.kind === 'bitmap') add(r.bitmap?.fileId);
    else if (r.kind === 'svg') {
      add(r.svg?.fileId);
      add(r.svg?.pdfFileId);
    } else if (r.kind === 'video') add(r.video?.poster?.fileId);
  }
  const walk = (value: unknown) => {
    if (Array.isArray(value)) for (const v of value) walk(v);
    else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        if (k === 'fileId' || k === 'pdfFileId') add(v);
        else walk(v);
      }
    }
  };
  walk(config);
  return [...ids];
}

/** The bytes of a `data:` URL (base64 or percent-encoded). */
export function dataUrlBytes(url: string): Uint8Array | undefined {
  const comma = url.indexOf(',');
  if (!url.startsWith('data:') || comma < 0) return undefined;
  const body = url.slice(comma + 1);
  try {
    if (/;base64$/i.test(url.slice(0, comma))) return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
    return new TextEncoder().encode(decodeURIComponent(body));
  } catch {
    return undefined;
  }
}

export interface IdmlExportInput {
  /** The book's chapters laid out (`layOutBookPrint`). */
  docs: readonly VDTDocument[];
  resources: readonly Resource[];
  config: PostextConfig;
  title?: string;
  onWarning?: (w: IdmlWarning) => void;
}

/** Write the IDML package of the laid-out book, its pictures embedded. */
export async function buildIdmlExport(input: IdmlExportInput): Promise<Uint8Array> {
  const bytes = new Map<string, Uint8Array>();
  for (const id of idmlFileIds(input.resources, input.config)) {
    const rec = await getBlob(id).catch(() => null);
    if (rec) bytes.set(id, new Uint8Array(rec.bytes));
  }
  const { idmlDocument } = await import('postext/idml');
  const result = idmlDocument({
    docs: input.docs,
    resourceBytes: (id) => bytes.get(id) ?? (id.startsWith('data:') ? dataUrlBytes(id) : undefined),
    images: 'embed',
    ...(input.title ? { title: input.title } : {}),
    ...(input.onWarning ? { onWarning: input.onWarning } : {}),
  });
  return result.bytes;
}
