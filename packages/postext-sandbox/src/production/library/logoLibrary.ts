/**
 * The user's logo library: the publisher's, the collections', seals and
 * prizes, each a picture with the clear space it keeps round it on a
 * cover. Logos live apart from any book, so a cover takes one as a picture
 * of its own (`logo:<id>`), its bytes beside the sheet's; and they travel
 * between users as a `.postext-logos.json` file, as profiles do.
 */

import { DEFAULT_CONTOUR_THRESHOLD, decodePngAlpha, traceAlpha, type ContourTrace, type Resource } from 'postext';

export type LogoGroup = 'publisher' | 'collection' | 'seal';
export const LOGO_GROUPS: readonly LogoGroup[] = ['publisher', 'collection', 'seal'];

export type LogoMime = 'image/png' | 'image/jpeg' | 'image/svg+xml';

export interface LogoRecord {
  id: string;
  name: string;
  group: LogoGroup;
  /** The clear space nothing else should enter round it, mm. */
  clearance: number;
  mime: LogoMime;
  bytes: Uint8Array;
  /** Its size in px (an SVG's from its `width`/`height` or `viewBox`). */
  width: number;
  height: number;
  updatedAt: number;
}

/** The clear space a new logo keeps, mm. */
export const DEFAULT_LOGO_CLEARANCE = 3;

export const LOGO_FILE_FORMAT = 'postext-logos';
export const LOGO_FILE_VERSION = 1;

export const logoResourceId = (id: string): string => `logo:${id}`;

const EXT: Record<LogoMime, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/svg+xml': 'svg' };

/** The file id a logo's bytes go by in a cover's files. */
export const logoFileId = (logo: Pick<LogoRecord, 'id' | 'mime'>): string => `logo-${logo.id}.${EXT[logo.mime]}`;

const traces = new WeakMap<Uint8Array, ContourTrace | null>();

/** A PNG logo's outline, traced from its alpha channel (once per file):
 *  what a finish shaped by the logo follows. */
function logoTrace(logo: LogoRecord): ContourTrace | undefined {
  if (logo.mime !== 'image/png') return undefined;
  let trace = traces.get(logo.bytes);
  if (trace === undefined) {
    const raster = decodePngAlpha(logo.bytes);
    trace = raster ? traceAlpha(raster, DEFAULT_CONTOUR_THRESHOLD, logoFileId(logo)) : null;
    traces.set(logo.bytes, trace);
  }
  return trace ?? undefined;
}

/** A logo as a picture a cover can lay out (its bytes go in the cover's
 *  files under {@link logoFileId}), a PNG's with its traced outline. */
export function logoResource(logo: LogoRecord): Resource {
  const trace = logoTrace(logo);
  const base = {
    id: logoResourceId(logo.id),
    typeId: 'figure',
    altText: logo.name,
    createdAt: 0,
    updatedAt: logo.updatedAt,
    ...(trace ? { contour: { traced: trace } } : {}),
  };
  if (logo.mime === 'image/svg+xml') {
    return { ...base, kind: 'svg', svg: { fileId: logoFileId(logo), width: logo.width, height: logo.height } } as Resource;
  }
  return {
    ...base,
    kind: 'bitmap',
    bitmap: { fileId: logoFileId(logo), format: logo.mime === 'image/png' ? 'png' : 'jpeg', width: logo.width, height: logo.height },
  } as Resource;
}

/** The kind of picture bytes are, by their first bytes (an SVG by its
 *  text), or undefined. */
export function sniffLogoMime(bytes: Uint8Array): LogoMime | undefined {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  const head = new TextDecoder().decode(bytes.subarray(0, 512)).trimStart();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'image/svg+xml';
  return undefined;
}

/** An SVG's size in px: its `width` and `height`, else its `viewBox`. */
export function svgSize(text: string): { width: number; height: number } | undefined {
  const tag = /<svg\b[^>]*>/i.exec(text)?.[0];
  if (!tag) return undefined;
  const attr = (name: string) => new RegExp(`\\s${name}\\s*=\\s*["']([^"']+)["']`, 'i').exec(tag)?.[1];
  const w = parseFloat(attr('width') ?? '');
  const h = parseFloat(attr('height') ?? '');
  if (w > 0 && h > 0) return { width: w, height: h };
  const vb = attr('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if (vb && vb.length === 4 && vb[2]! > 0 && vb[3]! > 0) return { width: vb[2]!, height: vb[3]! };
  return undefined;
}

function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(text: string): Uint8Array {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export interface LogoFile {
  format: typeof LOGO_FILE_FORMAT;
  version: number;
  logos: (Omit<LogoRecord, 'bytes' | 'updatedAt'> & { data: string })[];
}

/** The file for these logos, their pictures in base64. */
export function exportLogos(logos: readonly LogoRecord[]): LogoFile {
  return {
    format: LOGO_FILE_FORMAT,
    version: LOGO_FILE_VERSION,
    logos: logos.map(({ bytes, updatedAt: _t, ...rest }) => ({ ...rest, data: base64(bytes) })),
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The logos of a file (parsed JSON) that read: an id, a name, a picture
 *  whose bytes are what its type says. `skipped` counts the rest. */
export function importLogos(data: unknown, now = Date.now()): { logos: LogoRecord[]; skipped: number; ok: boolean } {
  if (!isRecord(data) || data.format !== LOGO_FILE_FORMAT || !Array.isArray(data.logos)) return { logos: [], skipped: 0, ok: false };
  const logos: LogoRecord[] = [];
  let skipped = 0;
  for (const l of data.logos) {
    let bytes: Uint8Array | undefined;
    try {
      bytes = isRecord(l) && typeof l.data === 'string' ? fromBase64(l.data) : undefined;
    } catch {
      bytes = undefined;
    }
    const mime = bytes ? sniffLogoMime(bytes) : undefined;
    if (!isRecord(l) || !bytes || !mime || typeof l.id !== 'string' || !l.id) {
      skipped++;
      continue;
    }
    const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : d);
    logos.push({
      id: l.id,
      name: typeof l.name === 'string' && l.name.trim() ? l.name : l.id,
      group: LOGO_GROUPS.includes(l.group as LogoGroup) ? (l.group as LogoGroup) : 'publisher',
      clearance: typeof l.clearance === 'number' && Number.isFinite(l.clearance) && l.clearance >= 0 ? l.clearance : DEFAULT_LOGO_CLEARANCE,
      mime,
      bytes,
      width: num(l.width, 100),
      height: num(l.height, 100),
      updatedAt: now,
    });
  }
  return { logos, skipped, ok: true };
}

export function newLogoId(): string {
  return `logo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
