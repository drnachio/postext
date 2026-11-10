// A file as a tool takes one in: an address the page fetches, or its bytes.

import { ToolError, type JsonSchema } from './modelContext.js';

/** Largest file a tool takes in (a picture, a font, a video), in bytes. */
const MAX_FILE_BYTES = 40 * 1024 * 1024;

export const FILE_PARAM = {
  type: 'object',
  description: 'A file: where to fetch it (url) or its bytes (base64).',
  properties: {
    url: { type: 'string', description: 'An http(s) or data: URL the page can fetch.' },
    base64: { type: 'string', description: 'The bytes, base64-encoded.' },
    mimeType: { type: 'string', description: 'Its media type, e.g. image/png. Read from the response or the file name when left out.' },
    fileName: { type: 'string', description: 'Its file name, with its extension.' },
  },
  additionalProperties: false,
} as const satisfies JsonSchema;

export interface FileInput {
  url?: string;
  base64?: string;
  mimeType?: string;
  fileName?: string;
}

const EXTENSION_TYPES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml',
  tif: 'image/tiff', tiff: 'image/tiff', psd: 'image/vnd.adobe.photoshop', ai: 'application/pdf',
  woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf', postext: 'application/zip', zip: 'application/zip',
  pdf: 'application/pdf', mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', mov: 'video/quicktime',
};

/** The file an agent hands over: fetched, or decoded from base64. */
export async function readFileInput(input: FileInput, signal?: AbortSignal): Promise<File> {
  let bytes: ArrayBuffer;
  let type = input.mimeType ?? '';
  let name = input.fileName ?? '';
  if (input.base64 !== undefined) {
    let binary: string;
    try {
      binary = atob(input.base64.replace(/^data:[^,]*,/, '').replace(/\s+/g, ''));
    } catch {
      throw new ToolError('The base64 text could not be decoded.');
    }
    const view = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
    bytes = view.buffer;
  } else if (input.url !== undefined) {
    let url: URL;
    try {
      url = new URL(input.url, window.location.href);
    } catch {
      throw new ToolError(`"${input.url}" is not a URL.`);
    }
    if (!['http:', 'https:', 'data:', 'blob:'].includes(url.protocol)) throw new ToolError('Only http(s), data: and blob: URLs can be fetched.');
    let res: Response;
    try {
      res = await fetch(url, { signal });
    } catch (err) {
      throw new ToolError(`The file could not be fetched (${err instanceof Error ? err.message : 'network error'}). A file on another site must allow cross-origin requests; otherwise hand its bytes over as base64.`);
    }
    if (!res.ok) throw new ToolError(`The file could not be fetched: ${url.href} answered ${res.status}.`);
    bytes = await res.arrayBuffer();
    type ||= (res.headers.get('content-type') ?? '').split(';')[0]!.trim();
    name ||= url.protocol === 'data:' ? '' : decodeURIComponent(url.pathname.split('/').pop() ?? '');
  } else {
    throw new ToolError('A file needs a "url" or its bytes as "base64".');
  }
  if (bytes.byteLength === 0) throw new ToolError('The file is empty.');
  if (bytes.byteLength > MAX_FILE_BYTES) throw new ToolError(`The file is ${Math.round(bytes.byteLength / 1048576)} MB; the most a tool takes is ${MAX_FILE_BYTES / 1048576} MB.`);
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  if (!type || type === 'application/octet-stream') type = EXTENSION_TYPES[extension] ?? type;
  if (!name) name = `file.${Object.entries(EXTENSION_TYPES).find(([, t]) => t === type)?.[0] ?? 'bin'}`;
  return new File([bytes], name, { type });
}
