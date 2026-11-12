/**
 * The design templates of postext 1.78 (#1523, #1532), read as designs.
 *
 * 1.78's Sandbox kept a book's design as a template: a record in the
 * IndexedDB database `postext-design-templates` (store `templates`), with
 * copies of its font files and colour profiles, and as a file
 * (`.postext-template.json`, the files in base64). Its parts were five
 * (`page`, `typography`, `colors`, `headerFooter`, `print`); today's are
 * the Design panel's groups (`DesignPart`).
 *
 * One converter serves both ways in: the saved templates move to the
 * saved designs the first time the designs are listed (see
 * {@link moveLegacyTemplates}), and the Designs import takes a template
 * file as it takes a design file.
 */

import { DESIGN_PARTS, designPartSlots, pickDesignParts, readDesignSlot, type CustomFontFormat, type Design, type DesignPart, type PostextConfig } from 'postext';
import { createDesignBundle } from 'postext/bundle';
import { PROJECT_RECORD_VERSION, migrateConfig } from '../storage/projectMigration.js';
import type { StoredFontFile } from '../storage/fontStorage.js';
import type { BlobRecord } from '../storage/blobStore.js';
import type { SavedDesign } from './designStore.js';

/** A 1.78 template, from its record or its file: its configuration in
 *  today's terms. */
export interface LegacyTemplate {
  /** The record's id (a file has none). */
  id?: string;
  name: string;
  description?: string;
  /** The book it was saved from. */
  source?: string;
  createdAt?: number;
  updatedAt?: number;
  /** The parts it was saved with, in 1.78's terms. */
  parts: string[];
  config: PostextConfig;
  fonts: StoredFontFile[];
  blobs: BlobRecord[];
}

/** Each 1.78 part, by the part of today that holds most of it: read only
 *  for a template whose settings were all at their defaults. */
const PART_OF_1_78: Record<string, DesignPart> = { page: 'page', typography: 'text', colors: 'colors', headerFooter: 'running', print: 'output' };

type Json = Record<string, unknown>;

const isRecord = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
const time = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/**
 * The design a 1.78 template holds. Its parts are today's parts with a
 * setting in the template (1.78's `page` held the binding and the
 * writing mode, today's `writing`; its `typography` the headings, lists,
 * figures and boxes, each a part now), so applying it changes what the
 * template changed. A template with no setting off its defaults keeps the
 * parts that hold most of its own.
 */
export function designOfTemplate(config: PostextConfig, parts: readonly string[]): Design {
  const held = DESIGN_PARTS.filter((p) => designPartSlots([p]).some((slot) => readDesignSlot(config, slot) !== undefined));
  const chosen = held.length > 0 ? held : DESIGN_PARTS.filter((p) => parts.some((old) => PART_OF_1_78[old] === p));
  if (chosen.length === 0) throw new Error('The template names no part');
  return pickDesignParts({ parts: chosen, config }, chosen);
}

/** A template as a design file: its bytes and parts. Families marked not
 *  redistributable keep their place, their files left out (`warnings`). */
export async function designFileFromTemplate(t: LegacyTemplate, locale?: string): Promise<{ bytes: Uint8Array; parts: DesignPart[]; warnings: string[] }> {
  const design = designOfTemplate(t.config, t.parts);
  const files = new Map<string, ArrayBuffer>();
  for (const f of t.fonts) files.set(f.fileId, f.buffer);
  for (const b of t.blobs) files.set(b.fileId, b.bytes);
  const made = await createDesignBundle({
    name: t.name,
    ...(t.description ? { description: t.description } : {}),
    ...(locale ? { locale } : {}),
    design,
    files,
  });
  return { bytes: made.bytes, parts: design.parts, warnings: made.warnings };
}

/** A template as a saved design under `id`, its name, description,
 *  source book and dates kept. */
export async function savedDesignFromTemplate(t: LegacyTemplate, id: string, locale?: string): Promise<SavedDesign> {
  const { bytes, parts } = await designFileFromTemplate(t, locale);
  const now = Date.now();
  const createdAt = t.createdAt ?? now;
  return {
    id,
    name: t.name,
    ...(t.description ? { description: t.description } : {}),
    ...(t.source ? { source: t.source } : {}),
    parts,
    createdAt,
    updatedAt: t.updatedAt ?? createdAt,
    bytes: bytes.slice().buffer as ArrayBuffer,
  };
}

/** The id a moved template is saved under: the same each time, so a move
 *  that stopped half-way and runs again replaces what it wrote. */
export function movedTemplateId(templateId: string): string {
  return `design-${templateId}`;
}

function filesOf(fonts: unknown, blobs: unknown): Pick<LegacyTemplate, 'fonts' | 'blobs'> | null {
  if (!Array.isArray(fonts) || !Array.isArray(blobs)) return null;
  const f = fonts.filter((x): x is StoredFontFile => isRecord(x) && typeof x.fileId === 'string' && x.buffer instanceof ArrayBuffer);
  const b = blobs.filter((x): x is BlobRecord => isRecord(x) && typeof x.fileId === 'string' && x.bytes instanceof ArrayBuffer);
  return { fonts: f, blobs: b };
}

/** A template record of 1.78's database, or null when it is none. Its
 *  configuration was stored under the current version. */
export function legacyTemplateFromRecord(raw: unknown): LegacyTemplate | null {
  if (!isRecord(raw) || !text(raw.id) || !text(raw.name) || !isRecord(raw.design)) return null;
  const { parts, config } = raw.design;
  const files = filesOf(raw.fonts, raw.blobs);
  if (!Array.isArray(parts) || !isRecord(config) || !files) return null;
  return {
    id: raw.id as string,
    name: raw.name as string,
    ...(text(raw.description) ? { description: raw.description as string } : {}),
    ...(text(raw.source) ? { source: raw.source as string } : {}),
    ...(time(raw.createdAt) !== undefined ? { createdAt: raw.createdAt as number } : {}),
    ...(time(raw.updatedAt) !== undefined ? { updatedAt: raw.updatedAt as number } : {}),
    parts: parts.filter((p): p is string => typeof p === 'string'),
    config: migrateConfig(config as PostextConfig, PROJECT_RECORD_VERSION),
    ...files,
  };
}

function fromBase64(data: string): ArrayBuffer {
  const s = atob(data);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out.buffer;
}

/** A `.postext-template.json` file of 1.78 (parsed JSON), or null when it
 *  is none. Its configuration is read under the version it names. */
export function legacyTemplateFromFile(data: unknown): LegacyTemplate | null {
  if (!isRecord(data) || data.type !== 'postext-design-template' || data.version !== 1) return null;
  const { name, parts, config, fonts, blobs } = data;
  if (!text(name) || !Array.isArray(parts) || !isRecord(config) || !Array.isArray(fonts) || !Array.isArray(blobs)) return null;
  const decoded = filesOf(
    fonts.filter((f) => isRecord(f) && typeof f.fileId === 'string' && typeof f.data === 'string').map((f) => ({
      fileId: f.fileId as string,
      fileName: typeof f.fileName === 'string' ? f.fileName : (f.fileId as string),
      format: f.format as CustomFontFormat,
      buffer: fromBase64(f.data as string),
    })),
    blobs.filter((b) => isRecord(b) && typeof b.fileId === 'string' && typeof b.data === 'string').map((b) => ({
      fileId: b.fileId as string,
      contentType: typeof b.contentType === 'string' ? b.contentType : 'application/octet-stream',
      bytes: fromBase64(b.data as string),
    })),
  )!;
  return {
    name: name as string,
    ...(text(data.description) ? { description: data.description as string } : {}),
    ...(text(data.source) ? { source: data.source as string } : {}),
    parts: parts.filter((p): p is string => typeof p === 'string'),
    config: migrateConfig(config as PostextConfig, data.configVersion),
    ...decoded,
  };
}

// ---- The move of the saved templates.

/** Where the 1.78 templates are read from and deleted. */
export interface LegacyTemplateSource {
  /** Every record, or null when there is no such database. */
  read: () => Promise<unknown[] | null>;
  /** Delete the database. */
  remove: () => Promise<void>;
}

const LEGACY_DB = 'postext-design-templates';
const LEGACY_STORE = 'templates';

/** 1.78's database, opened only when it exists: an open that would create
 *  it is aborted in its upgrade, which leaves no database behind. */
function openLegacyDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(LEGACY_DB);
    let missing = false;
    req.onupgradeneeded = () => {
      missing = true;
      req.transaction?.abort();
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => {
      if (!missing) {
        reject(req.error ?? new Error('Failed to open the template store'));
        return;
      }
      e.preventDefault();
      resolve(null);
    };
  });
}

/** 1.78's database in this browser. */
export const legacyTemplateDb: LegacyTemplateSource = {
  async read() {
    if (typeof indexedDB === 'undefined') return null;
    if (typeof indexedDB.databases === 'function') {
      const list = await indexedDB.databases().catch(() => null);
      if (list && !list.some((d) => d.name === LEGACY_DB)) return null;
    }
    const db = await openLegacyDb();
    if (!db) return null;
    try {
      if (!db.objectStoreNames.contains(LEGACY_STORE)) return [];
      return await new Promise<unknown[]>((resolve, reject) => {
        const req = db.transaction(LEGACY_STORE, 'readonly').objectStore(LEGACY_STORE).getAll();
        req.onsuccess = () => resolve(req.result as unknown[]);
        req.onerror = () => reject(req.error ?? new Error('Failed to read the templates'));
      });
    } finally {
      db.close();
    }
  },
  remove() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase(LEGACY_DB);
      req.onsuccess = () => resolve();
      // Another tab holds it open: it goes once that tab lets it go.
      req.onblocked = () => resolve();
      req.onerror = () => reject(req.error ?? new Error('Failed to delete the template store'));
    });
  },
};

/**
 * Move every 1.78 template to the saved designs (`put`), each a design
 * file under {@link movedTemplateId}, then delete 1.78's database: only
 * once every record was written, so a template that could not be read or
 * written stays where it was, and the move runs again next time. Resolves
 * to the number of designs written; with no such database, to 0, and no
 * database is made.
 */
export async function moveLegacyTemplates(put: (design: SavedDesign) => Promise<void>, source: LegacyTemplateSource = legacyTemplateDb): Promise<number> {
  const records = await source.read();
  if (records === null) return 0;
  let moved = 0;
  let left = 0;
  for (const raw of records) {
    const template = legacyTemplateFromRecord(raw);
    if (!template) {
      left++;
      continue;
    }
    try {
      await put(await savedDesignFromTemplate(template, movedTemplateId(template.id!)));
      moved++;
    } catch {
      left++;
    }
  }
  if (left === 0) await source.remove();
  return moved;
}
