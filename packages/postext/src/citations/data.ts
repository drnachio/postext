/**
 * The references of a document (#268): CSL items written in its front
 * matter (`references:`, as Pandoc reads them) and in `:::references`
 * blocks (BibTeX, CSL-JSON or CSL-YAML), and the works it lists without
 * citing them (`nocite`).
 */

import matter from 'gray-matter';
import type { ContentBlock } from '../parse';
import type { CslDate, CslItem, CslName } from './types';
import { parseBibtex, type BibtexIssue } from './bibtex';

/** Something wrong with the reference data, where it is written. */
export interface ReferenceIssue {
  message: string;
  sourceStart: number;
  sourceEnd: number;
}

/** The references and `nocite` keys of a document. */
export interface ReferenceData {
  items: CslItem[];
  /** Keys listed without a citation; `'*'` lists every reference. */
  nocite: string[];
  issues: ReferenceIssue[];
}

const DATE_FIELDS = ['issued', 'accessed', 'event-date', 'original-date', 'submitted', 'available-date'];
const NAME_FIELDS = ['author', 'editor', 'translator', 'container-author', 'collection-editor', 'composer', 'director', 'interviewer', 'recipient', 'reviewed-author', 'editorial-director', 'illustrator', 'chair', 'compiler', 'contributor', 'curator', 'executive-producer', 'guest', 'host', 'narrator', 'organizer', 'performer', 'producer', 'script-writer', 'series-creator'];

/** A date as YAML or JSON wrote it — `2020`, `2020-05-03`, a `Date`,
 *  `{date-parts: …}`, `{year: 2020}` — as a CSL date. */
function normalizeDate(value: unknown): CslDate | undefined {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return undefined;
    return { 'date-parts': [[value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate()]] };
  }
  if (typeof value === 'number') return { 'date-parts': [[value]] };
  if (typeof value === 'string') {
    const m = /^(-?\d{1,4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/.exec(value.trim());
    if (m) return { 'date-parts': [[Number(m[1]), ...(m[2] ? [Number(m[2])] : []), ...(m[3] ? [Number(m[3])] : [])]] };
    return { literal: value };
  }
  if (Array.isArray(value)) {
    const first = normalizeDate(value[0]);
    const second = value.length > 1 ? normalizeDate(value[1]) : undefined;
    if (first?.['date-parts'] && second?.['date-parts']) return { 'date-parts': [first['date-parts'][0]!, second['date-parts'][0]!] };
    return first;
  }
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (o['date-parts'] || o.literal || o.raw) return o as CslDate;
    if (o.year !== undefined) return { 'date-parts': [[Number(o.year), ...(o.month !== undefined ? [Number(o.month)] : []), ...(o.day !== undefined ? [Number(o.day)] : [])]] };
  }
  return undefined;
}

/** A name as YAML wrote it: `{family, given}`, or a string — `"García,
 *  Ana"`, `"Ana García"`, a Chinese name written whole — as a CSL name. */
function normalizeName(value: unknown): CslName | undefined {
  if (value && typeof value === 'object') return value as CslName;
  if (typeof value !== 'string' || value.trim().length === 0) return undefined;
  const text = value.trim();
  const comma = text.indexOf(',');
  if (comma > 0) return { family: text.slice(0, comma).trim(), given: text.slice(comma + 1).trim() };
  if (!/\s/.test(text)) return { family: text };
  const words = text.split(/\s+/);
  return { family: words[words.length - 1]!, given: words.slice(0, -1).join(' ') };
}

/** A reference as YAML or JSON wrote it, as a CSL item; undefined without
 *  an id. Types default to `book`; dates and names are normalised; numbers
 *  become strings. */
export function normalizeCslItem(raw: unknown): CslItem | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const src = raw as Record<string, unknown>;
  const id = src.id ?? src['citation-key'];
  if (id === undefined || id === null || String(id).trim().length === 0) return undefined;
  const item: CslItem = { id: String(id).trim(), type: typeof src.type === 'string' ? src.type : 'book' };
  for (const [key, value] of Object.entries(src)) {
    if (key === 'id' || key === 'type') continue;
    if (DATE_FIELDS.includes(key)) {
      const date = normalizeDate(value);
      if (date) item[key] = date;
    } else if (NAME_FIELDS.includes(key)) {
      const list = (Array.isArray(value) ? value : [value]).map(normalizeName).filter((n): n is CslName => n !== undefined);
      if (list.length > 0) item[key] = list;
    } else if (typeof value === 'number') {
      item[key] = String(value);
    } else if (value !== null && value !== undefined) {
      item[key] = value;
    }
  }
  return item;
}

/** The `nocite` field of a front matter: `'@*'`, `'@a, @b'`, `['@a']`. */
export function nociteKeys(value: unknown): string[] {
  const text = Array.isArray(value) ? value.map(String).join(' ') : typeof value === 'string' ? value : '';
  const out: string[] = [];
  for (const m of text.matchAll(/@(\*|[\p{L}\p{N}_][\p{L}\p{N}_:.#$%&\-+?<>~/]*[\p{L}\p{N}_]?)/gu)) out.push(m[1]!);
  return out;
}

/** The items of a `:::references` block, in its `format` (`bibtex`,
 *  `csl-json`, `csl-yaml`; guessed from the body when unset). */
export function referencesOfBlock(block: ContentBlock, issues: ReferenceIssue[]): CslItem[] {
  const body = block.rawBody ?? '';
  const at = { sourceStart: block.sourceStart, sourceEnd: block.sourceEnd };
  const declared = block.directiveAttrs?.format?.toLowerCase();
  const trimmed = body.trim();
  if (trimmed.length === 0) return [];
  const format = declared ?? (trimmed.startsWith('@') ? 'bibtex' : trimmed.startsWith('[') || trimmed.startsWith('{') ? 'csl-json' : 'csl-yaml');
  try {
    if (format === 'bibtex' || format === 'biblatex' || format === 'bib') {
      const read: BibtexIssue[] = [];
      const items = parseBibtex(body, read);
      for (const issue of read) issues.push({ message: issue.message, ...at });
      return items;
    }
    if (format === 'csl-json' || format === 'json') {
      const parsed: unknown = JSON.parse(trimmed);
      const list = Array.isArray(parsed) ? parsed : (parsed as { references?: unknown[] }).references ?? [parsed];
      return list.map(normalizeCslItem).filter((i): i is CslItem => i !== undefined);
    }
    // CSL-YAML: a `references:` list, or the list itself.
    const yaml = /^references\s*:/m.test(trimmed) ? trimmed : `references:\n${body.replace(/^/gm, '  ')}`;
    const data = matter(`---\n${yaml}\n---\n`).data as { references?: unknown };
    const list = Array.isArray(data.references) ? data.references : [];
    return list.map(normalizeCslItem).filter((i): i is CslItem => i !== undefined);
  } catch (e) {
    issues.push({ message: `unreadable ${format} references: ${(e as Error).message.split('\n')[0]}`, ...at });
    return [];
  }
}

/** The references of a document: its front matter's `references` and
 *  `nocite`, and every `:::references` block, in order. A key written twice
 *  keeps its first entry. */
export function documentReferences(metadata: Record<string, unknown> | undefined, blocks: readonly ContentBlock[]): ReferenceData {
  const issues: ReferenceIssue[] = [];
  const items: CslItem[] = [];
  const seen = new Set<string>();
  const add = (list: readonly CslItem[]): void => {
    for (const item of list) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
    }
  };
  const fm = metadata?.references;
  if (Array.isArray(fm)) add(fm.map(normalizeCslItem).filter((i): i is CslItem => i !== undefined));
  for (const b of blocks) {
    if (b.type === 'directive' && b.directiveName === 'references') add(referencesOfBlock(b, issues));
  }
  return { items, nocite: nociteKeys(metadata?.nocite), issues };
}
