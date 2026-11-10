/**
 * Saved design templates. They live in a database of their own, with
 * copies of the font files and blobs their design needs: the sandbox's
 * file sweep keeps a file only while a book points at it, and a template
 * must outlive the book it was saved from.
 *
 * A template also travels as a file (`.postext-template.json`), fonts
 * included as base64 — except families marked not redistributable, whose
 * files stay behind.
 */

import type { CustomFontFormat, PostextConfig } from 'postext';
import { getFontFile, putFontFiles, type StoredFontFile } from '../../storage/fontStorage.js';
import { getBlob, putBlobsAt, type BlobRecord } from '../../storage/blobStore.js';
import { PROJECT_RECORD_VERSION, migrateConfig } from '../../storage/projectMigration.js';
import { DESIGN_PARTS, designFileIds, type DesignPart, type DesignSnapshot } from './designTemplate.js';

export interface DesignTemplate {
  id: string;
  name: string;
  description?: string;
  /** The book it was saved from. */
  source?: string;
  createdAt: number;
  updatedAt: number;
  design: DesignSnapshot;
  fonts: StoredFontFile[];
  blobs: BlobRecord[];
}

const DB_NAME = 'postext-design-templates';
const DB_VERSION = 1;
const STORE = 'templates';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB unavailable'));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error ?? new Error('Failed to open the template store'));
    };
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = op(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error ?? req.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  }));
}

const listeners = new Set<() => void>();
function changed(): void {
  for (const l of listeners) l();
}
export function onTemplatesChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Saved templates, newest first. */
export async function listTemplates(): Promise<DesignTemplate[]> {
  const all = await run('readonly', (s) => s.getAll() as IDBRequest<DesignTemplate[]>);
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function putTemplate(t: DesignTemplate): Promise<void> {
  await run('readwrite', (s) => s.put(t));
  changed();
}

export async function deleteTemplate(id: string): Promise<void> {
  await run('readwrite', (s) => s.delete(id));
  changed();
}

export function generateTemplateId(): string {
  return `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** A template of `design`, with copies of the files it names (those the
 *  stores still have). */
export async function templateFromDesign(name: string, design: DesignSnapshot, extra: { description?: string; source?: string } = {}): Promise<DesignTemplate> {
  const { fontIds, blobIds } = designFileIds(design.config);
  const fonts = (await Promise.all(fontIds.map((id) => getFontFile(id).catch(() => null)))).filter((f): f is StoredFontFile => !!f);
  const blobs = (await Promise.all(blobIds.map((id) => getBlob(id).catch(() => null)))).filter((b): b is BlobRecord => !!b);
  const now = Date.now();
  return {
    id: generateTemplateId(),
    name,
    ...(extra.description ? { description: extra.description } : {}),
    ...(extra.source ? { source: extra.source } : {}),
    createdAt: now,
    updatedAt: now,
    design,
    fonts,
    blobs,
  };
}

/** Put a template's files back in the sandbox's stores, under their own
 *  ids, before its design is applied (the design names them). */
export async function restoreTemplateFiles(t: Pick<DesignTemplate, 'fonts' | 'blobs'>): Promise<void> {
  if (t.fonts.length > 0) await putFontFiles(t.fonts);
  if (t.blobs.length > 0) await putBlobsAt(t.blobs);
}

// ---- As a file.

interface TemplateFileFont {
  fileId: string;
  fileName: string;
  format: CustomFontFormat;
  data: string;
}

interface TemplateFileBlob {
  fileId: string;
  contentType: string;
  data: string;
}

export interface TemplateFile {
  type: 'postext-design-template';
  version: 1;
  /** The configuration's version (`PROJECT_RECORD_VERSION`), so a file
   *  saved by an older sandbox is read in today's terms. */
  configVersion: number;
  name: string;
  description?: string;
  source?: string;
  parts: DesignPart[];
  config: PostextConfig;
  fonts: TemplateFileFont[];
  blobs: TemplateFileBlob[];
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(data: string): ArrayBuffer {
  const s = atob(data);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out.buffer;
}

/** A template as a file. Families marked not redistributable keep their
 *  place in the design, but their files are left out. */
export function templateToFile(t: DesignTemplate): TemplateFile {
  const closed = new Set(
    (t.design.config.customFonts ?? []).filter((f) => f.redistributable === false).flatMap((f) => f.variants.map((v) => v.fileId)),
  );
  return {
    type: 'postext-design-template',
    version: 1,
    configVersion: PROJECT_RECORD_VERSION,
    name: t.name,
    ...(t.description ? { description: t.description } : {}),
    ...(t.source ? { source: t.source } : {}),
    parts: t.design.parts,
    config: t.design.config,
    fonts: t.fonts.filter((f) => !closed.has(f.fileId)).map((f) => ({ fileId: f.fileId, fileName: f.fileName, format: f.format, data: toBase64(f.buffer) })),
    blobs: t.blobs.map((b) => ({ fileId: b.fileId, contentType: b.contentType, data: toBase64(b.bytes) })),
  };
}

export function isTemplateFile(v: unknown): v is TemplateFile {
  if (!v || typeof v !== 'object') return false;
  const o = v as Partial<TemplateFile>;
  return o.type === 'postext-design-template' && o.version === 1 && typeof o.name === 'string'
    && !!o.config && typeof o.config === 'object' && Array.isArray(o.parts) && Array.isArray(o.fonts) && Array.isArray(o.blobs);
}

/** A template read from a file, with a fresh id. */
export function templateFromFile(f: TemplateFile): DesignTemplate {
  const now = Date.now();
  return {
    id: generateTemplateId(),
    name: f.name,
    ...(f.description ? { description: f.description } : {}),
    ...(f.source ? { source: f.source } : {}),
    createdAt: now,
    updatedAt: now,
    design: { parts: f.parts.filter((p): p is DesignPart => DESIGN_PARTS.includes(p)), config: migrateConfig(f.config, f.configVersion) },
    fonts: f.fonts.map((x) => ({ fileId: x.fileId, fileName: x.fileName, format: x.format, buffer: fromBase64(x.data) })),
    blobs: f.blobs.map((x) => ({ fileId: x.fileId, contentType: x.contentType, bytes: fromBase64(x.data) })),
  };
}
