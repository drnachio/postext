// The step a "defaults" review list takes (Design › Writing system:
// Chinese defaults, Arabic defaults), taken back with Undo, and what the
// section remembers of it between mounts. Shared by the review lists; each
// keeps a memory of its own.

import type { DigitSystem, HeadingLevelConfig, HeadingStyleConfig, PostextConfig, ResourceType } from 'postext';
import { DOCUMENT_LANGUAGES, defaultResourceTypes, formatNumeral, parseNumberFormat } from 'postext';

export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return v;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) out[k] = (v as Record<string, unknown>)[k];
    return out;
  });
}

/** Whether `types` are, field for field, the built-in types of some
 *  language (the ones a new book gets, in any document language). */
export function builtInTypes(types: readonly ResourceType[], extraLocales: readonly string[]): boolean {
  const current = canonicalJson(types);
  const tags = new Set([...DOCUMENT_LANGUAGES.map((l) => l.tag), 'en', 'es', ...extraLocales]);
  for (const tag of tags) {
    const types = defaultResourceTypes(tag);
    // A book saved before videos (#454) holds the figure and table only.
    if (canonicalJson(types) === current || canonicalJson(types.filter((t) => t.id !== 'video')) === current) return true;
  }
  return false;
}

/** The first number a template prints, for the review list: `{h1}.{n}` →
 *  `1.1`. */
export function sampleNumber(template: string): string {
  return template.replace(/\{h[1-6]\}/g, '1').replace(/\{n\}/g, '1');
}

export function listSignature(levels: readonly { numberFormat: string; prefix: string; separator: string }[]): string {
  return levels.map((l) => `${l.numberFormat}|${l.prefix}|${l.separator}`).join(';');
}

/** The first number of each list level (`1. a. i.`), in `digits` when
 *  the level numbers in decimal (the document's digits). */
export function listSample(levels: readonly { numberFormat: string; prefix: string; separator: string }[], locale: string, digits?: DigitSystem): string {
  return levels
    .map((l) => `${l.prefix}${formatNumeral(1, parseNumberFormat(l.numberFormat, locale) ?? 'decimal', digits)}${l.separator}`)
    .join(' ');
}

/** The names of `types`, joined by `separator` (the Arabic comma for
 *  Arabic names). */
export function typeNames(types: readonly ResourceType[], separator = ', '): string {
  return types.map((t) => t.name).join(separator);
}

/** `2, 3, 4` → `H2–H4`; `2, 4` → `H2, H4`. */
export function levelRanges(levels: readonly number[]): string {
  const sorted = [...levels].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j++;
    if (j - i >= 2) out.push(`H${sorted[i]}–H${sorted[j]}`);
    else for (let k = i; k <= j; k++) out.push(`H${sorted[k]}`);
    i = j + 1;
  }
  return out.join(', ');
}

/** The headings' typeface and the ones levels and styles set for
 *  themselves: `Fraunces; H2–H4: Bricolage Grotesque; Preface: Geist`. */
export function headingFacesText(general: string, levels: readonly HeadingLevelConfig[], styles: readonly HeadingStyleConfig[]): string {
  const byFace = new Map<string, number[]>();
  for (const l of levels) byFace.set(l.fontFamily!, [...(byFace.get(l.fontFamily!) ?? []), l.level]);
  return [
    general,
    ...[...byFace].map(([face, lv]) => `${levelRanges(lv)}: ${face}`),
    ...styles.map((st) => `${st.name ?? st.id}: ${st.fontFamily}`),
  ].join('; ');
}

export function figureOf(types: readonly ResourceType[]): ResourceType | undefined {
  return types.find((t) => t.id === 'figure') ?? types[0];
}

/** The built-in types of `target` in place of the ones with the same id,
 *  keeping every other field of those and every type of the author's own. */
export function mergeBuiltInTypes(types: readonly ResourceType[], target: readonly ResourceType[]): ResourceType[] {
  const byId = new Map(target.map((t) => [t.id, t]));
  return types.map((t) => {
    const builtIn = byId.get(t.id);
    if (!builtIn) return t;
    const next: ResourceType = {
      ...t,
      name: builtIn.name,
      shortLabel: builtIn.shortLabel,
      captionPrefix: builtIn.captionPrefix,
      numberingTemplate: builtIn.numberingTemplate,
    };
    if (builtIn.namePlural !== undefined) next.namePlural = builtIn.namePlural;
    else delete next.namePlural;
    return next;
  });
}

/** `obj` without `key`, or undefined when nothing is left. */
export function without<T extends object>(obj: T | undefined, key: keyof T): T | undefined {
  if (!obj) return undefined;
  const next = { ...obj };
  delete next[key];
  return Object.keys(next).length > 0 ? next : undefined;
}

export function set<K extends keyof PostextConfig>(config: PostextConfig, key: K, value: PostextConfig[K] | undefined): PostextConfig {
  const next = { ...config };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}


function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** A measure (`{ value, unit }`) is one setting: restored or kept whole. */
function isMeasure(v: Record<string, unknown>): boolean {
  return 'unit' in v && Object.keys(v).every((k) => k === 'value' || k === 'unit');
}

/** Structural equality, as JSON sees it (an `undefined` field is no field). */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => same(v, b[i]));
  }
  if (!isRecord(a) || !isRecord(b)) return false;
  const ka = Object.keys(a).filter((k) => a[k] !== undefined);
  const kb = Object.keys(b).filter((k) => b[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => same(a[k], b[k]));
}

/** The entries of a list by their key (`level`, else `id`), or null when
 *  some entry has none or two share one. */
function keyedEntries(list: readonly unknown[]): Map<string, unknown> | null {
  const map = new Map<string, unknown>();
  for (const v of list) {
    const key = !isRecord(v) ? undefined
      : typeof v.level === 'number' ? `level=${v.level}`
        : typeof v.id === 'string' ? `id=${v.id}`
          : undefined;
    if (key === undefined || map.has(key)) return null;
    map.set(key, v);
  }
  return map;
}

/**
 * `current` with each setting that went from `before` to `after` back to
 * `before`, unless it no longer reads `after` (the author changed it since:
 * it is kept, and its path pushed onto `kept`). Groups of settings are
 * walked setting by setting; lists whose entries carry a `level` or an
 * `id` (heading levels, list levels, resource types) entry by entry. A
 * measure, a list of any other kind, and a group or entry the action
 * created (`fresh` false) are restored or kept whole.
 */
function revert(current: unknown, before: unknown, after: unknown, path: string, kept: string[], fresh = true): unknown {
  if (same(before, after)) return current;
  if (same(current, after)) return before;
  if (isRecord(current) && isRecord(after) && !isMeasure(current) && !isMeasure(after)
    && ((fresh && before === undefined) || (isRecord(before) && !isMeasure(before)))) {
    const was = (before ?? {}) as Record<string, unknown>;
    let out: Record<string, unknown> | null = null;
    for (const key of new Set([...Object.keys(was), ...Object.keys(after)])) {
      const value = revert(current[key], was[key], after[key], path ? `${path}.${key}` : key, kept);
      if (value === current[key]) continue;
      out ??= { ...current };
      if (value === undefined) delete out[key];
      else out[key] = value;
    }
    if (!out) return current;
    return before === undefined && Object.keys(out).length === 0 ? undefined : out;
  }
  if (Array.isArray(current) && Array.isArray(after) && Array.isArray(before)) {
    const was = keyedEntries(before);
    const now = keyedEntries(after);
    const cur = keyedEntries(current);
    if (was && now && cur) {
      let changed = false;
      const out: unknown[] = [];
      for (const key of new Set([...cur.keys(), ...was.keys(), ...now.keys()])) {
        const entry = cur.get(key);
        const value = revert(entry, was.get(key), now.get(key), `${path}[${key}]`, kept, false);
        if (value !== entry) changed = true;
        if (value !== undefined) out.push(value);
      }
      return changed ? out : current;
    }
  }
  kept.push(path);
  return current;
}

export interface DefaultsUndo {
  /** The config with the action taken back (`current` itself when there
   *  is nothing left to take back). */
  config: PostextConfig;
  /** The settings the action wrote that the author has changed since,
   *  left as they are now (`bodyText.fontFamily`). */
  kept: string[];
}

/**
 * Takes the action back: every setting it wrote returns to what it was
 * before, down to the single field (`bodyText.fontFamily`, level 1's
 * numbering), unless the author has changed that setting again since (it
 * then stays as it is now, and `kept` names it). Other edits made since,
 * in the same groups or elsewhere, stay. `before` and `after` are the
 * configs the action went from and to.
 */
export function undoDefaults(current: PostextConfig, before: PostextConfig, after: PostextConfig): DefaultsUndo {
  const kept: string[] = [];
  const config = revert(current, before, after, '', kept) as PostextConfig | undefined;
  return { config: config ?? {}, kept };
}

/** The message under the button: applied (how many changes) or undone
 *  (`partial`: some settings had been changed since and stayed). */
export type DefaultsStatus = { kind: 'applied'; count: number } | { kind: 'undone'; partial: boolean };

/** What the section remembers between mounts (while the author looks at
 *  another group of the panel): the last application, for Undo, and its
 *  message, tied to the book they were made in. */
export interface DefaultsMemory {
  /** The book (project, or preset and language, and load) on screen. */
  book: string;
  /** When it happened (ms). */
  at: number;
  status: DefaultsStatus;
  undo: { before: PostextConfig; after: PostextConfig } | null;
  /** Where the focus goes once the section is on screen: the message
   *  after Apply, Review after Undo. Both may change the typefaces, and
   *  the sandbox then puts its interface away until the fonts load: the
   *  section that takes the focus is a new mount. */
  focus?: DefaultsFocus;
}

export type DefaultsFocus = 'status' | 'review';

/** How long a remounted section still shows the message (and Undo): the
 *  application's for a while, the undo's for a few seconds. */
const APPLIED_LIFETIME = 10 * 60_000;
const UNDONE_LIFETIME = 10_000;

/** One review list's memory: the last application in a book, for Undo
 *  and its message, and the focus the next mount takes. */
export interface DefaultsMemoryStore {
  remember(entry: DefaultsMemory): void;
  forget(): void;
  /** The memory, if it belongs to `book` and has not lapsed. Asking for
   *  another book forgets it: Undo is offered only in the book the action
   *  ran on. */
  recall(book: string, now?: number): DefaultsMemory | null;
  /** The focus the memory asks for in `book`, taken once: a later mount
   *  (the author back from another group) leaves the focus where it is. */
  takeFocus(book: string, now?: number): DefaultsFocus | null;
  /** The section goes away with the focus on `target` (the interface put
   *  away while fonts load): the next mount takes it back. */
  keepFocus(target: DefaultsFocus): void;
}

export function createDefaultsMemory(): DefaultsMemoryStore {
  let memory: DefaultsMemory | null = null;
  const recall = (book: string, now = Date.now()): DefaultsMemory | null => {
    if (!memory) return null;
    const lifetime = memory.status.kind === 'applied' ? APPLIED_LIFETIME : UNDONE_LIFETIME;
    if (memory.book !== book || now - memory.at >= lifetime) memory = null;
    return memory;
  };
  return {
    remember: (entry) => { memory = entry; },
    forget: () => { memory = null; },
    recall,
    takeFocus: (book, now = Date.now()) => {
      const m = recall(book, now);
      if (!m?.focus) return null;
      memory = { ...m, focus: undefined };
      return m.focus;
    },
    keepFocus: (target) => {
      if (memory) memory = { ...memory, focus: target };
    },
  };
}
