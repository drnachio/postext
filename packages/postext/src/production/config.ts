/**
 * A book's `production` block read from data that may come from anywhere:
 * a bundle, a file, a host. Every part is checked; what does not read is
 * left out and listed, as an imported profile file is (see `exchange.ts`).
 */

import type {
  ProductionCollection,
  ProductionConfig,
  ProductionVersion,
} from '../types/output/production.js';
import { isNum, isRecord } from './guards.js';
import {
  readBindingProfile,
  readPaperProfile,
  type ProductionImportIssue,
} from './exchange.js';
import { DEFAULT_BINDING_MEASURES } from '../defaults/output/production.js';

const MEASURE_KEYS: ReadonlySet<string> = new Set(Object.keys(DEFAULT_BINDING_MEASURES.perfect));
const CASE_MATERIALS: ReadonlySet<string> = new Set(['printed', 'cloth']);
const SPINE_DIRECTIONS: ReadonlySet<string> = new Set(['bottomToTop', 'topToBottom']);

const isText = (v: unknown): v is string => typeof v === 'string';

/** Drops `key` from `o` when it is present and `ok` says it does not read. */
function check(o: Record<string, unknown>, key: string, ok: (v: unknown) => boolean, where: string, issues: ProductionImportIssue[], reason: ProductionImportIssue['reason'] = 'badText'): void {
  if (o[key] !== undefined && !ok(o[key])) {
    delete o[key];
    issues.push({ where: `${where}.${key}`, reason });
  }
}

function readVersion(v: unknown, where: string, issues: ProductionImportIssue[]): ProductionVersion | undefined {
  if (!isRecord(v) || !isText(v.id) || !v.id) {
    issues.push({ where, reason: 'missingId' });
    return undefined;
  }
  const out = structuredClone(v) as Record<string, unknown>;
  if (isRecord(out.binding)) {
    const profile = readBindingProfile(out.binding, `${where}.binding`, issues);
    if (!profile) return undefined;
    out.binding = profile;
  } else if (!isText(out.binding) || !out.binding) {
    issues.push({ where: `${where}.binding`, reason: 'missingId' });
    return undefined;
  }
  check(out, 'name', isText, where, issues);
  if (!isText(out.name)) out.name = out.id;
  for (const key of ['isbn', 'workIsbn']) check(out, key, isText, where, issues);
  check(out, 'isbnAddOn', (x) => isText(x) && /^\d{5}$/.test(x), where, issues);
  check(out, 'flaps', (x) => typeof x === 'boolean', where, issues);
  check(out, 'caseMaterial', (x) => isText(x) && CASE_MATERIALS.has(x), where, issues);
  check(out, 'spineOverride', (x) => isNum(x) && x > 0, where, issues, 'badNumber');
  if (isRecord(out.overrides)) {
    for (const [key, value] of Object.entries(out.overrides)) {
      if (!(MEASURE_KEYS.has(key) && isNum(value))) {
        delete (out.overrides as Record<string, unknown>)[key];
        issues.push({ where: `${where}.overrides.${key}`, reason: MEASURE_KEYS.has(key) ? 'badNumber' : 'badMeasure' });
      }
    }
  } else check(out, 'overrides', () => false, where, issues, 'badMeasure');
  if (isRecord(out.spineText)) {
    const st = out.spineText;
    check(st, 'direction', (x) => isText(x) && SPINE_DIRECTIONS.has(x), `${where}.spineText`, issues);
    check(st, 'minSpine', isNum, `${where}.spineText`, issues, 'badNumber');
  } else check(out, 'spineText', () => false, where, issues);
  return out as unknown as ProductionVersion;
}

function readCollection(c: unknown, issues: ProductionImportIssue[]): ProductionCollection | undefined {
  const where = 'collection';
  if (!isRecord(c) || !isText(c.name)) {
    issues.push({ where, reason: 'badText' });
    return undefined;
  }
  const out: ProductionCollection = { name: c.name };
  if (isText(c.isbn)) out.isbn = c.isbn;
  else if (c.isbn !== undefined) issues.push({ where: `${where}.isbn`, reason: 'badText' });
  if (Array.isArray(c.catalogue)) {
    out.catalogue = [];
    c.catalogue.forEach((e, i) => {
      if (isRecord(e) && isText(e.id) && e.id && isText(e.title) && (e.resource === undefined || isText(e.resource))) {
        out.catalogue!.push({ id: e.id, title: e.title, ...(e.resource !== undefined ? { resource: e.resource as string } : {}) });
      } else issues.push({ where: `${where}.catalogue[${i}]`, reason: 'badText' });
    });
  } else if (c.catalogue !== undefined) issues.push({ where: `${where}.catalogue`, reason: 'badText' });
  if (isText(c.volume) && c.volume) out.volume = c.volume;
  else if (c.volume !== undefined) issues.push({ where: `${where}.volume`, reason: 'badText' });
  return out;
}

/** A book's `production` read from untrusted data: versions, the profiles
 *  they name and the collection, each checked. Undefined when nothing of
 *  it reads. Two versions with one id keep the first. */
export function readProductionConfig(data: unknown): { production?: ProductionConfig; issues: ProductionImportIssue[] } {
  const issues: ProductionImportIssue[] = [];
  if (data === undefined) return { issues };
  if (!isRecord(data)) return { issues: [{ where: 'production', reason: 'badText' }] };
  const out: ProductionConfig = {};
  const list = <T>(key: string, read: (v: unknown, where: string) => T | undefined): T[] | undefined => {
    const raw = data[key];
    if (raw === undefined) return undefined;
    if (!Array.isArray(raw)) {
      issues.push({ where: key, reason: 'badText' });
      return undefined;
    }
    const seen = new Set<string>();
    const items: T[] = [];
    raw.forEach((v, i) => {
      const item = read(v, `${key}[${i}]`);
      const id = (item as { id?: string } | undefined)?.id;
      if (!item || id === undefined) return;
      if (seen.has(id)) issues.push({ where: `${key}[${i}]`, reason: 'missingId' });
      else {
        seen.add(id);
        items.push(item);
      }
    });
    return items;
  };
  const versions = list('versions', (v, w) => readVersion(v, w, issues));
  const bindings = list('bindings', (v, w) => readBindingProfile(v, w, issues));
  const papers = list('papers', (v, w) => readPaperProfile(v, w, issues));
  if (versions) out.versions = versions;
  if (bindings) out.bindings = bindings;
  if (papers) out.papers = papers;
  if (data.collection !== undefined) {
    const collection = readCollection(data.collection, issues);
    if (collection) out.collection = collection;
  }
  return { production: Object.keys(out).length ? out : undefined, issues };
}

